"""
InsightEngine: AI-powered project analysis for quote generation.

Uses Gemini structured output (response_schema) to compile an intervention
spec from conversation history and media: packages of the assembly library with
their conditions, measures with their source, element choices, single extra
price-book items and requests outside the price book. The code expands it into
quote lines (src/services/intervention_expansion.py, Phase 140 step 1).
Pattern: fastapi-enterprise-patterns (Service Layer).

Also returns completeness_score + missing_info for the guided questions.
"""
import logging
from collections.abc import Sequence
from types import GenericAlias
from typing import Annotated, Any, Literal, cast

from google.genai import types as genai_types
from pydantic import BaseModel, Field, JsonValue, create_model, field_validator

from src.core.models import ModelRole, build_thinking_config, get_genai_client, get_model_id
from src.schemas.assembly_library import (
    FORMULA_VARIABLES,
    MEASURE_LABELS,
    Assembly,
    AssemblyLibrary,
    ElementAction,
    formula_variables,
)
from src.services.assembly_library import load_library
from src.services.pricing_service import PricingService
from src.utils.download import download_session_media

logger = logging.getLogger(__name__)

# Media are sent inline in one request: a larger file (a long video) is skipped.
_INLINE_MEDIA_MAX_BYTES = 15 * 1024 * 1024

# SYD never quotes furniture (the render shows it, the works do not include it).
# The price book may still hold such a line for the technician: the model never sees it.
_FURNITURE_SUBCATEGORY = "arredamento"


def ai_price_book() -> list[dict[str, Any]]:
    """The price-book items the model may choose: every item but furniture."""
    return [
        item for item in PricingService.load_price_book()
        if str(item.get("subcategory") or "").strip().casefold() != _FURNITURE_SUBCATEGORY
    ]


# ── Domain Models ─────────────────────────────────────────────────────────────

class SKUItemSuggestion(BaseModel):
    """A single line-item suggested by the AI Quantity Surveyor."""
    # NO extra="forbid": it emits additionalProperties in the JSON schema and
    # the GEMINI_API backend rejects the serialized `additional_properties`
    # key with 400 INVALID_ARGUMENT (this model is a response_schema).
    # Regression: tests/unit/test_insight_schema_genai.py
    sku: str = Field(..., description="The SKU from the Master Price Book. Must be an exact match.")
    # ge (minimum) — NOT gt (exclusiveMinimum): the genai Schema model rejects
    # exclusiveMinimum (extra_forbidden) and the response_schema conversion
    # would crash every suggest_quote_items call. 0.01 matches pricing_engine's
    # lower bound. Regression: tests/unit/test_insight_schema_genai.py
    qty: float = Field(..., ge=0.01, description="Estimated quantity (must be >= 0.01)")
    ai_reasoning: str = Field(..., description="Why this item is necessary based on chat/images")
    phase: Literal[
        "Demolizioni", "Impianti", "Opere Murarie",
        "Pavimentazioni", "Rivestimenti", "Tinteggiatura",
        "Infissi", "Isolamento", "Smaltimento", "Lavori",
    ] = Field(
        "Lavori",
        description="WBS phase — must be one of the allowed values"
    )


# ── Intervention spec (Phase 140, step 1) ──────────────────────────────────────
# The model chooses packages, conditions, element choices and measures; the
# code computes the lines (src/services/intervention_expansion.py).
# Same response_schema rules as SKUItemSuggestion: no extra="forbid", ge/le only, no dict.

MeasureSource = Literal["declared", "photo", "estimated"]


class SpecMeasure(BaseModel):
    """A room measure a package formula uses, with where it comes from."""
    name: str = Field(..., description="One of the formula measures (mq, mq_pareti, n_finestre...)")
    # Same bound as RoomBrief: a home measure, never astronomic (le also rejects inf).
    value: float = Field(..., ge=0, le=10_000, description="Value of the measure (m², m or pieces)")
    source: MeasureSource = Field(
        ..., description="declared: said by the client or in the room brief; photo: from the measurements; estimated: Italian averages"
    )


class PackageChoice(BaseModel):
    """A package of the assembly library the room needs."""
    assembly_id: str = Field(..., description="Id of a package of the library (e.g. ASM-BAGNO-FULL)")
    conditions: list[str] = Field(
        default_factory=list, description="Conditions of the package that hold (e.g. if_cottura_gas)"
    )
    reasoning: str = Field("", description="Why the package is needed")


class ElementChoice(BaseModel):
    """What the client wants for an existing element: replace (default), reuse or keep in place."""
    element: str = Field(..., description="Element of a chosen package (e.g. sanitari)")
    action: ElementAction


class InsightAnalysis(BaseModel):
    """Structured output produced by InsightEngine.analyze_project_for_quote()."""
    # NO extra="forbid" — see SKUItemSuggestion (used as Gemini response_schema).
    suggestions: list[SKUItemSuggestion] = Field(
        default_factory=list,
        description="Single price-book items NOT covered by the chosen packages."
    )
    packages: list[PackageChoice] = Field(default_factory=list, description="Packages the room needs")
    measures: list[SpecMeasure] = Field(default_factory=list, description="Measures the chosen packages need")
    element_choices: list[ElementChoice] = Field(
        default_factory=list, description="Only the elements the client wants to keep or reuse"
    )
    unmapped_work_requests: list[str] = Field(
        default_factory=list,
        description="Building work the client asked for that is neither in a package nor in the price book (short Italian sentence each)",
    )
    summary: str = Field(..., description="Brief summary of the identified project requirements.")
    completeness_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description=(
            "0.0-1.0 score indicating how much information is available for an accurate quote. "
            "< 0.7 means the chatbot should ask more questions before finalizing."
        ),
    )
    missing_info: list[str] = Field(
        default_factory=list,
        description=(
            "Naturale Italian questions the chatbot must ask the user before finalizing the quote. "
            "Empty if completeness_score >= 0.7."
        ),
    )
    price_range_low: float | None = Field(
        None,
        description="Lower bound of estimated total (EUR, excl. VAT). Set when completeness_score < 0.85.",
    )
    price_range_high: float | None = Field(
        None,
        description="Upper bound of estimated total (EUR, excl. VAT). Set when completeness_score < 0.85.",
    )
    # Multi-room metadata (Optional — backward-compatible with single-room flow)
    room_id: str | None = Field(None, description="UUID of the room being analyzed (multi-room flow)")
    room_type: str | None = Field(None, description="bagno | cucina | soggiorno | camera | altro")
    room_label: str | None = Field(None, description="Human-readable room label")

    @field_validator("measures")
    @classmethod
    def _known_measures(cls, value: list[SpecMeasure]) -> list[SpecMeasure]:
        """A measure no formula uses is dropped, not an error (the model may invent a name)."""
        return [m for m in value if m.name in FORMULA_VARIABLES]


# ── Response schema with the allowed values (Phase 140, step 1) ───────────────
# Gemini decodes enum fields only to the listed values. The enums live in the
# JSON schema alone: the fields stay `str`, so the answer is parsed with
# InsightAnalysis and one value outside a list (a price book edited between two
# calls) never loses the whole analysis: expand() warns on an unknown package or
# condition, validate_sku_suggestions reports an unknown SKU, an unknown measure
# is dropped by InsightAnalysis and an unknown element changes no package.

_SchemaKey = tuple[str | None, tuple[str, ...]]
_SCHEMA_CACHE: dict[_SchemaKey, type[InsightAnalysis]] = {}
_SCHEMA_CACHE_MAX = 8  # one entry per price-book/library version: a few at most


def _one_of(values: Sequence[str]) -> dict[str, JsonValue] | None:
    """`enum` for the JSON schema; none for an empty list (Gemini rejects `enum: []`)."""
    if not values:
        return None
    allowed: list[JsonValue] = list(values)
    return {"enum": allowed}


def _list_of(item: type[BaseModel]) -> type[list[BaseModel]]:
    """`list[item]` for a model built at runtime (create_model field type)."""
    return cast("type[list[BaseModel]]", GenericAlias(list, (item,)))


def _description(model: type[BaseModel], field: str) -> str | None:
    return model.model_fields[field].description


def _build_response_schema(library: AssemblyLibrary | None, skus: tuple[str, ...]) -> type[InsightAnalysis]:
    package_ids = [assembly.id for assembly in library.assemblies] if library else []
    conditions = library.conditions() if library else []
    elements = library.element_names() if library else []

    suggestion = create_model(
        "SKUItemSuggestionSchema",
        __base__=SKUItemSuggestion,
        sku=(str, Field(..., description=_description(SKUItemSuggestion, "sku"), json_schema_extra=_one_of(skus))),
    )
    measure = create_model(
        "SpecMeasureSchema",
        __base__=SpecMeasure,
        name=(str, Field(
            ..., description=_description(SpecMeasure, "name"), json_schema_extra=_one_of(sorted(FORMULA_VARIABLES))
        )),
    )
    package = create_model(
        "PackageChoiceSchema",
        __base__=PackageChoice,
        assembly_id=(str, Field(
            ..., description=_description(PackageChoice, "assembly_id"), json_schema_extra=_one_of(package_ids)
        )),
        conditions=(
            list[Annotated[str, Field(json_schema_extra=_one_of(conditions))]],
            Field(default_factory=list, description=_description(PackageChoice, "conditions")),
        ),
    )
    element = create_model(
        "ElementChoiceSchema",
        __base__=ElementChoice,
        element=(str, Field(
            ..., description=_description(ElementChoice, "element"), json_schema_extra=_one_of(elements)
        )),
    )
    return create_model(
        "InsightAnalysisSchema",
        __base__=InsightAnalysis,
        suggestions=(_list_of(suggestion), Field(
            default_factory=list, description=_description(InsightAnalysis, "suggestions")
        )),
        packages=(_list_of(package), Field(
            default_factory=list, description=_description(InsightAnalysis, "packages")
        )),
        measures=(_list_of(measure), Field(
            default_factory=list, description=_description(InsightAnalysis, "measures")
        )),
        element_choices=(_list_of(element), Field(
            default_factory=list, description=_description(InsightAnalysis, "element_choices")
        )),
    )


def response_schema_for(library: AssemblyLibrary | None, skus: Sequence[str]) -> type[InsightAnalysis]:
    """InsightAnalysis for Gemini's response_schema, with the library's packages,
    conditions and elements, the price-book SKUs and the formula measures as enums.

    Cached by library version and SKU set (the schema is rebuilt only when the
    price book or the library changes)."""
    key: _SchemaKey = (library.version if library else None, tuple(sorted(set(skus))))
    schema = _SCHEMA_CACHE.get(key)
    if schema is None:
        if len(_SCHEMA_CACHE) >= _SCHEMA_CACHE_MAX:
            _SCHEMA_CACHE.clear()
        schema = _SCHEMA_CACHE[key] = _build_response_schema(library, key[1])
    return schema


# ── Prompt helpers ─────────────────────────────────────────────────────────────

def _package_measures(assembly: Assembly) -> list[str]:
    """The measures the package formulas use, sorted."""
    return sorted({
        name for phase in assembly.phases for item in phase.skus for name in formula_variables(item.qty_formula)
    })


def _package_conditions(assembly: Assembly) -> list[str]:
    """The package conditions as the model reads them; an alternative with a
    default says what the backend uses when the client does not choose."""
    parts: list[str] = []
    for phase in assembly.phases:
        if phase.conditional:
            parts.append(f"`{phase.conditional}` ({phase.phase})")
        conditional = [item for item in phase.skus if item.conditional]
        default = next((item for item in conditional if item.default_choice), None)
        if default is not None:
            names = " oppure ".join(f"`{item.conditional}`" for item in conditional)
            parts.append(
                f"{names} — se il cliente non lo dice, nessuna: il backend usa `{default.conditional}` e lo segnala al tecnico"
            )
        else:
            parts.extend(f"`{item.conditional}` ({phase.phase})" for item in conditional)
    return list(dict.fromkeys(parts))


def _package_lines(assembly: Assembly) -> list[str]:
    skus = dict.fromkeys(item.sku for phase in assembly.phases for item in phase.skus)
    lines = [
        f"### {assembly.name} (`{assembly.id}`)",
        f"- {assembly.description}",
        f"- Quando: {', '.join(assembly.triggers)}",
        f"- Voci comprese (le calcola il backend): {', '.join(f'`{sku}`' for sku in skus)}",
    ]
    measures = _package_measures(assembly)
    if measures:
        lines.append("- Misure da dare in `measures`: " + "; ".join(f"`{m}` = {MEASURE_LABELS[m]}" for m in measures))
    conditions = _package_conditions(assembly)
    if conditions:
        lines.append("- Condizioni (in `conditions`, solo queste e solo se vere): " + "; ".join(conditions))
    if assembly.elements:
        lines.append(
            "- Elementi (per `element_choices`): " + ", ".join(f"`{e.element}` ({e.label})" for e in assembly.elements)
        )
    if assembly.manual_items:
        lines.append(
            "- Il backend aggiunge da quotare a mano: " + "; ".join(m.work for m in assembly.manual_items)
        )
    return lines


# ── Domain Exception ───────────────────────────────────────────────────────────

class InsightEngineError(Exception):
    """
    Raised when InsightEngine cannot produce a result.
    Callers should catch this and return a graceful user-facing message.
    Per error-handling-patterns skill: custom exception hierarchy, never swallow.
    """
    error_code: str = "INSIGHT_ENGINE_FAILURE"


# ── InsightEngine Service ──────────────────────────────────────────────────────

class InsightEngine:
    """
    Analyzes project conversation history and images to produce structured
    SKU suggestions using Gemini structured output (Pydantic response_schema).

    Follows the Service Layer pattern: no HTTP logic, pure domain behavior.
    Per fastapi-enterprise-patterns skill: services contain business rules only.
    """

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or get_model_id(ModelRole.INSIGHT)
        self.client = get_genai_client()

    def _build_price_book_prompt(self) -> str:
        """
        Builds a category-grouped price book context for the LLM.
        Categorization significantly improves Gemini SKU selection accuracy
        over a flat list (grouping reduces hallucination of unknown SKUs).
        """
        price_book = ai_price_book()

        if not price_book:
            logger.error("[InsightEngine] Master price book is empty.")
            return "## Master Price Book\n\n⚠️ Listino non disponibile. Contattare l'amministratore.\n"

        # Group by category
        by_category: dict[str, list[dict]] = {}
        for item in price_book:
            cat = item.get("category", "Altro")
            by_category.setdefault(cat, []).append(item)

        lines: list[str] = [
            "## Master Price Book — SKU Disponibili",
            "",
            "⚠️ REGOLA ASSOLUTA: Usa ESCLUSIVAMENTE i codici SKU presenti in questo elenco.",
            "Non inventare mai codici SKU. Un lavoro senza codice va in unmapped_work_requests (regola 1).",
            "",
        ]
        for category, items in sorted(by_category.items()):
            lines.append(f"### {category}")
            for it in items:
                tags = ", ".join(it.get("tags", []))
                line = (
                    f"- `{it['sku']}` | {it['description']} "
                    f"| Unità: {it['unit']} | €{it['unit_price']:.2f}/u"
                )
                if tags:
                    line += f" | Tags: {tags}"
                lines.append(line)
            lines.append("")

        return "\n".join(lines)

    def _build_assembly_prompt(self) -> str:
        """
        The packages of the assembly library, as the model chooses them: when to
        use each, the lines it covers (codes only), the measures, conditions and
        elements to give, the work the backend adds for hand quoting.
        No formulas or quantities: the backend computes them (intervention_expansion).
        Empty when the library cannot be loaded (load_library logs why).
        """
        library = load_library()
        if library is None or not library.assemblies:
            return ""

        lines: list[str] = [
            "## Pacchetti di lavorazioni (libreria)",
            "",
            "Quando il cliente esprime un desiderio macro (es. 'bagno nuovo', 'pareti bianche'),",
            "scegli il pacchetto in `packages`. Le voci e le quantità le calcola il backend dalle misure:",
            "tu indichi il pacchetto, le condizioni vere, le misure richieste e gli elementi da tenere.",
            "",
        ]
        for assembly in library.assemblies:
            lines.extend(_package_lines(assembly))
            lines.append("")

        lines.append("Il backend applica da solo le regole di dipendenza (smaltimento, massetto, verifiche strutturali).")
        questions = [rule.question_before_exclude for rule in library.dependency_rules if rule.question_before_exclude]
        if questions:
            lines.append(
                "Solo se serve a scegliere le condizioni dei pacchetti scelti e non lo sai da conversazione"
                " e foto, metti in `missing_info`:"
            )
            lines.extend(f"- «{question}»" for question in questions)
        lines.append("")
        return "\n".join(lines)

    def _build_system_prompt(self, price_book_section: str, assembly_section: str) -> str:
        """Constructs the full system prompt for the Quantity Surveyor role with WBS reasoning."""
        return f"""Sei un 'Geometra / Quantity Surveyor' AI per SYD Bioedilizia.

## IDENTITÀ AZIENDALE — BOUNDARY ASSOLUTA
SYD Bioedilizia è un'impresa edile che esegue ESCLUSIVAMENTE ristrutturazioni strutturali.

INCLUSO nel preventivo SYD:
- Demolizioni (pareti, pavimenti, rivestimenti, sanitari, infissi)
- Opere murarie (tramezzi, intonaci, rasature, impermeabilizzazioni)
- Impianti (elettrico, idraulico, termico/riscaldamento, gas)
- Pavimentazioni e rivestimenti (posa gres, parquet, resina, piastrelle)
- Tinteggiature (pittura pareti/soffitti, primer)
- Infissi e serramenti (finestre, porte, vetri)
- Isolamento termico/acustico
- Smaltimento macerie e materiali

ESCLUSO TASSATIVAMENTE — MAI includere nel preventivo:
- Mobili, arredamento (divani, letti, tavoli, sedie, armadi volanti)
- Cucine componibili e relativi elettrodomestici
- Illuminotecnica decorativa (lampade, plafoniere, applique, lampadari)
- Tende, tessuti, tappeti, complementi d'arredo
- Progettazione di interni / consulenze esterne

REGOLA CRITICA sul render: Il render mostra lo stato VISIVO FINALE del progetto.
I mobili e gli arredi nel render sono la VISION estetica dell'utente, NON voci di cantiere.
Il preventivo calcola solo i LAVORI EDILI necessari per creare quello spazio.

Il tuo compito è analizzare la conversazione, la foto originale del cliente e il render
per identificare i soli lavori di ristrutturazione edile necessari.

## Integrazione Analisi Visiva (Agentic Vision)

Cerca nella cronologia conversazione:
1. **Analisi foto originale** (scritta dall'assistente con campi "Tipo stanza", "Stile attuale",
   "Elementi di rilievo", "Potenziale di redesign") — rappresenta lo STATO ATTUALE della stanza.
2. **Render generato** (descritto dallo stile/prompt usato) — rappresenta lo STATO OBIETTIVO.
3. **Immagini allegate** — se presenti, analizzale direttamente per rilevare:
   - Materiali attuali (pavimento esistente, rivestimento pareti, stato intonaci)
   - Impianti visibili (tubature a vista, quadro elettrico, tipo riscaldamento)
   - Condizioni strutturali (crepe, umidità, danni, vetustà)
   - Elementi che il cliente vuole tenere

Usa queste informazioni per:
- Scegliere le condizioni dei pacchetti (es. pareti piastrellate → `if_piastrelle`,
  intonaco deteriorato → `if_intonaco_ammalorato`)
- Dare le misure con fonte `photo` quando le hai dalla foto o dal blocco misure
- Rilevare lavori fuori dai pacchetti (es. colonna di scarico da spostare → `IMP-ID-003`)
- Indicare in `element_choices` gli elementi che il cliente vuole tenere

{assembly_section}
{price_book_section}

## Protocollo di Ragionamento (Chain-of-Thought WBS)

Per ogni richiesta, ragiona in QUESTO ORDINE:

**FASE 0 — LEGGI LA FOTO ORIGINALE**
Cerca l'analisi visiva della stanza originale nella cronologia.
Identifica: materiali esistenti, impianti visibili, condizione generale.
Se un'immagine è allegata, analizzala direttamente.

**FASE 1 — SCEGLI I PACCHETTI**
Cosa vuole il cliente? (es. bagno nuovo, pareti bianche, pavimento diverso)
Per ogni desiderio macro scegli un pacchetto della libreria in `packages`, con le condizioni vere
in `conditions` (es. `if_cottura_gas` se la cucina è a gas, `if_piastrelle` se le pareti da
dipingere sono piastrellate). Le voci del pacchetto NON vanno ricopiate in `suggestions`.

**FASE 2 — DAI LE MISURE**
In `measures` dai ogni misura richiesta dai pacchetti scelti (un solo valore), con la sua fonte:
- `declared`: l'ha detta il cliente o è nella scheda stanza;
- `photo`: viene dal blocco misure o dall'analisi della foto;
- `estimated`: stima su medie italiane, SOLO per `mq` (pavimento) e `mq_pareti` (pareti da trattare)
  quando conosci il tipo di stanza. Usa il centro della forbice: Bagno 6 mq | Cucina 12 mq |
  Camera 14 mq | Soggiorno 25 mq; pareti ≈ 4 × √mq × 2.7 (altezza media) − aperture.
  Con una superficie stimata il preventivo è indicativo: `completeness_score` al massimo 0.8.
Tutte le altre misure (`mq_parete` = la parete da abbattere, `ml_*`, `n_*`) non si stimano: se il
cliente non le ha dette e la foto non le mostra, omettile (il backend le chiede al cliente).

**FASE 3 — ELEMENTI DA TENERE**
In `element_choices` metti solo gli elementi che il cliente NON vuole sostituire:
- `keep`: il cliente vuole tenere l'elemento (es. "i sanitari li teniamo", "il pavimento resta").
  Se intorno si demolisce, il backend prevede smontaggio e rimontaggio e lo segnala al tecnico.
- `reuse`: solo quando il cliente dice esplicitamente di smontarlo e rimontarlo (es. "smontate
  i sanitari e rimontateli dopo").
Un elemento non indicato si sostituisce.

**FASE 4 — VOCI SINGOLE E RICHIESTE FUORI LISTINO**
- `suggestions`: solo lavori del listino che i pacchetti scelti non comprendono, con quantità
  stimata (+5% solo su posa e rivestimenti, per scarti e tagli) e fase WBS.
- `unmapped_work_requests`: lavori edili chiesti dal cliente che non sono né in un pacchetto
  né nel listino, una frase breve in italiano ciascuno (es. "Vespaio aerato sotto il pavimento").

**FASE 5 — VALUTA COMPLETEZZA**
Assegna `completeness_score` (0.0-1.0):
- 1.0 = tutte le informazioni tecniche sono note (dimensioni, materiali, impianti)
- 0.7 = informazioni sufficienti per un preventivo indicativo
- < 0.7 = mancano dati critici → lista le domande mancanti in `missing_info`

**Esempi di completeness_score basso (< 0.7):**
- Non si sa se le pareti sono intonacate o rivestite a piastrelle → chiedi
- Non si sa se la parete da abbattere è portante → OBBLIGATORIO chiederlo in `missing_info`
- Non si conosce la metratura e non si sa che stanza è → chiedi dimensioni approssimative

## Regole Operative

1. **Solo codici del listino e della libreria**: MAI inventare codici. Un lavoro edile senza
   pacchetto né codice va in `unmapped_work_requests`: lo quota a mano il tecnico.
2. **Niente voci contate due volte**: `ASM-BAGNO-FULL` e `ASM-CUCINA-FULL` comprendono già le
   demolizioni, il pavimento e i rivestimenti della stanza (vedi "Voci comprese"). Per la stessa
   stanza non aggiungere `ASM-PAVIMENTO`, `ASM-PARETI-BIANCHE` o `ASM-BAGNO-LIGHT`, né in `suggestions`
   una voce già compresa in un pacchetto scelto. Ciò che il pacchetto non comprende va a parte:
   es. tinteggiatura delle pareti → `PIT-001` in `suggestions`, soffitto → `ASM-SOFFITTO`.
3. **Fase WBS obbligatoria**: ogni voce in `suggestions` ha il campo `phase` compilato.
4. **Quantità plausibili** nelle `suggestions`: es. 10-14 punti luce per 70mq; non 100 prese per 10mq.
5. **ZERO arredamento**: niente mobili, cucine componibili, elettrodomestici, tende, lampade,
   né in `suggestions` né in `unmapped_work_requests`. Qualsiasi voce che non sia lavoro edile va omessa.
6. **IVA**: non applicarla — gestita dal backend automaticamente.
7. **Parete portante**: se il cliente la conferma, scegli `if_portante` (il backend avvisa il tecnico);
   se è solo sospettata, chiedilo in `missing_info` e abbassa lo score.
8. **Lavori da quotare a mano dei pacchetti**: li aggiunge il backend. Non metterli né in
   `suggestions` né in `unmapped_work_requests`.
9. **Smaltimento**: `SMAL-001` dei pacchetti e delle regole lo calcola il backend. In `suggestions`
   aggiungilo solo se nessun pacchetto scelto lo comprende e ci sono demolizioni (es. infissi, porte,
   demolizioni singole), come quota di container da 7 m³ (es. 0.4).
10. **Vision-driven**: se la foto originale mostra materiali specifici, usa quella informazione per
   le condizioni (es. `if_piastrelle`) e per le misure con fonte `photo`.
11. **Italiano**: tutti i testi (`summary`, `reasoning`, `ai_reasoning`, `missing_info`,
   `unmapped_work_requests`) sono in italiano; nel `summary` indica la superficie in mq.

## Esempi Few-Shot (Vision → Specifica)

**Esempio 1.** Foto originale: bagno anni '80, piastrelle fino a h=150cm, sanitari in ceramica,
pavimento in granito, finestra in alluminio. Il cliente: "il bagno è di 5 metri quadri, lo voglio
rifare tutto, moderno con doccia walk-in. La finestra va bene così."
**Specifica corretta**:
- packages: `ASM-BAGNO-FULL` (conditions: nessuna)
- measures: `mq` = 5, source `declared`
- element_choices: nessuno (si sostituisce tutto; la finestra non è in un pacchetto scelto)
- suggestions: nessuna (le voci del bagno le calcola il backend)
- unmapped_work_requests: nessuna
**NON incluso**: mobili, specchio, lampade, accessori ← arredamento.

**Esempio 2.** Il cliente: "Rifacciamo il bagno, circa 6 mq, ma i sanitari li teniamo perché sono
nuovi. Vorrei spostare la colonna di scarico e fare un vespaio aerato sotto il pavimento."
**Specifica corretta**:
- packages: `ASM-BAGNO-FULL`
- measures: `mq` = 6, source `declared`
- element_choices: `sanitari` → `keep` (il backend prevede smontaggio e rimontaggio e avvisa il tecnico)
- suggestions: `IMP-ID-003` qty 1, fase Impianti (spostamento colonna di scarico, fuori dal pacchetto)
- unmapped_work_requests: "Vespaio aerato sotto il pavimento" (nessuna voce di listino)

## Auto-Verifica Obbligatoria (Self-Correction)

PRIMA di restituire il risultato, esegui questo controllo su ogni voce di `suggestions`
e ogni richiesta di `unmapped_work_requests`:
→ "Questa voce è un lavoro edile/impiantistico che richiede un operaio specializzato in cantiere?"
→ Se SÌ: includi. Se NO (è un mobile, un elettrodomestico, una lampada): rimuovi senza eccezioni.

RICORDA: SYD Bioedilizia fa SOLO ristrutturazione edile strutturale.
Il preventivo copre ESCLUSIVAMENTE i lavori per trasformare fisicamente lo spazio.
Pacchetti in `packages` con le loro misure in `measures`: le quantità le calcola il backend.
Analizza la conversazione e produci la risposta strutturata.
"""

    async def analyze_project_for_quote(
        self,
        chat_history: list[dict[str, Any]],
        media_urls: list[str] | None = None,
        *,
        session_id: str | None = None,
    ) -> InsightAnalysis:
        """
        Analyzes chat history and optional media and compiles the intervention spec.

        Uses Gemini native structured output with response_schema_for(): the
        packages, conditions, elements, SKUs and measures are enums, so the
        model picks only values that exist.

        Args:
            chat_history: List of {role, content} dicts from conversation.
            media_urls: Optional references (URLs, gs:// URIs, paths) of the
                session's images/videos.
            session_id: Project whose files may be attached; without it no
                media is attached.

        Returns:
            InsightAnalysis: the spec (packages, measures, element choices, extra
            items, requests outside the price book) and the summary.

        Raises:
            InsightEngineError: On Gemini failure or empty response.
        """
        await PricingService.ensure_fresh()  # prices edited in the admin console
        response_schema = response_schema_for(load_library(), [str(item["sku"]) for item in ai_price_book()])
        price_book_section = self._build_price_book_prompt()
        assembly_section = self._build_assembly_prompt()
        system_prompt = self._build_system_prompt(price_book_section, assembly_section)

        # Build structured conversation text
        history_lines = ["## Conversazione"]
        for msg in chat_history:
            role = msg.get("role", "unknown").upper()
            content = str(msg.get("content", ""))
            history_lines.append(f"**{role}**: {content}")

        parts: list[genai_types.Part] = [
            genai_types.Part(text=system_prompt),
            genai_types.Part(text="\n".join(history_lines)),
        ]

        # Attach media, read by Storage path among the session's own files
        # (signed URLs in the history expire after an hour).
        if media_urls and session_id:
            for index, ref in enumerate(media_urls, start=1):
                try:
                    data, mime = await download_session_media(ref, session_id, max_bytes=_INLINE_MEDIA_MAX_BYTES)
                    parts.append(genai_types.Part(inline_data=genai_types.Blob(mime_type=mime, data=data)))
                except Exception as exc:  # noqa: BLE001
                    # Graceful degradation: skip broken media, continue analysis.
                    # Never log or forward the reference: it may be a signed URL.
                    logger.warning(
                        "[InsightEngine] Media not attached.",
                        extra={"error_type": type(exc).__name__, "index": index},
                    )
                    parts.append(genai_types.Part(text=f"[Allegato {index} non accessibile]"))

        # ── Gemini call with native structured output ──────────────────────────
        try:
            logger.info("[InsightEngine] Starting AI project analysis.")
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[genai_types.Content(role="user", parts=parts)],
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                    response_schema=response_schema,  # enums for packages, SKUs, measures
                    # THINKING_LEVEL_INSIGHT from the registry when set, else a fixed budget.
                    thinking_config=build_thinking_config(ModelRole.INSIGHT)
                    or genai_types.ThinkingConfig(thinking_budget=2048),
                ),
            )

            if not response.text:
                logger.error("[InsightEngine] Empty response from Gemini.")
                raise InsightEngineError("Gemini returned an empty response.")

            raw_text = response.text.strip()
            if raw_text.startswith("```"):
                # Se è racchiuso in markdown, estraggo solo il contenuto JSON
                # Rimuovo sia ```json che ``` alla fine
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()

            # Parsed with the base model: the enums constrain decoding only (see response_schema_for).
            result = InsightAnalysis.model_validate_json(raw_text)
            logger.info(
                "[InsightEngine] Analysis complete.",
                extra={"packages": len(result.packages), "suggestions": len(result.suggestions)},
            )
            return result

        except InsightEngineError:
            raise  # Re-raise domain errors untouched
        except Exception as exc:
            logger.error("[InsightEngine] Gemini call failed.", extra={"error": str(exc)}, exc_info=True)
            raise InsightEngineError(f"Project analysis failed: {exc}") from exc


# ── Singleton Factory ──────────────────────────────────────────────────────────

_insight_engine: InsightEngine | None = None


def get_insight_engine() -> InsightEngine:
    """Returns the singleton InsightEngine instance."""
    global _insight_engine
    if _insight_engine is None:
        _insight_engine = InsightEngine()
    return _insight_engine
