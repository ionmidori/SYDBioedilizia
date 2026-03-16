"""
InsightEngine: AI-powered project analysis for quote generation.

Uses Gemini structured output (response_schema) to extract SKU suggestions
from conversation history and media. Pattern: fastapi-enterprise-patterns (Service Layer).

Features:
  - WBS Assembly Intelligence: expands user intents into structured BOQ phases
  - Guided Questions: returns completeness_score + missing_info for C-option logic
  - Chain-of-Thought reasoning: Phase → Sub-work → SKU mapping
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Literal, Optional

from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field

from src.core.config import settings
from src.services.pricing_service import PricingService

logger = logging.getLogger(__name__)


# ── Domain Models ─────────────────────────────────────────────────────────────

class SKUItemSuggestion(BaseModel):
    """A single line-item suggested by the AI Quantity Surveyor."""
    model_config = {"extra": "forbid"}
    sku: str = Field(..., description="The SKU from the Master Price Book. Must be an exact match.")
    qty: float = Field(..., gt=0, description="Estimated quantity (must be > 0)")
    ai_reasoning: str = Field(..., description="Why this item is necessary based on chat/images")
    phase: Literal[
        "Demolizioni", "Impianti", "Opere Murarie",
        "Pavimentazioni", "Rivestimenti", "Tinteggiatura",
        "Infissi", "Isolamento", "Smaltimento", "Lavori",
    ] = Field(
        "Lavori",
        description="WBS phase — must be one of the allowed values"
    )


class InsightAnalysis(BaseModel):
    """Structured output produced by InsightEngine.analyze_project_for_quote()."""
    model_config = {"extra": "forbid"}
    suggestions: List[SKUItemSuggestion] = Field(
        default_factory=list,
        description="List of suggested SKU items derived from the conversation."
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
    missing_info: List[str] = Field(
        default_factory=list,
        description=(
            "Naturale Italian questions the chatbot must ask the user before finalizing the quote. "
            "Empty if completeness_score >= 0.7."
        ),
    )
    price_range_low: Optional[float] = Field(
        None,
        description="Lower bound of estimated total (EUR, excl. VAT). Set when completeness_score < 0.85.",
    )
    price_range_high: Optional[float] = Field(
        None,
        description="Upper bound of estimated total (EUR, excl. VAT). Set when completeness_score < 0.85.",
    )
    # Multi-room metadata (Optional — backward-compatible with single-room flow)
    room_id: Optional[str] = Field(None, description="UUID of the room being analyzed (multi-room flow)")
    room_type: Optional[str] = Field(None, description="bagno | cucina | soggiorno | camera | altro")
    room_label: Optional[str] = Field(None, description="Human-readable room label")


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

    _ASSEMBLIES_PATH = Path(__file__).parent.parent / "data" / "renovation_assemblies.json"

    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or settings.CHAT_MODEL_VERSION
        self.client = genai.Client(api_key=settings.api_key)
        self._assemblies: Optional[Dict[str, Any]] = None

    def _build_price_book_prompt(self) -> str:
        """
        Builds a category-grouped price book context for the LLM.
        Categorization significantly improves Gemini SKU selection accuracy
        over a flat list (grouping reduces hallucination of unknown SKUs).
        """
        price_book = PricingService.load_price_book()

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
            "Non inventare mai codici SKU. Se un lavoro non è mappabile, ometti la voce.",
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

    def _load_assemblies(self) -> Dict[str, Any]:
        """Loads renovation_assemblies.json (cached after first load)."""
        if self._assemblies is None:
            try:
                with open(self._ASSEMBLIES_PATH, encoding="utf-8") as f:
                    self._assemblies = json.load(f)
            except Exception as exc:
                logger.error("[InsightEngine] Failed to load assemblies.", extra={"error": str(exc)})
                self._assemblies = {"assemblies": [], "dependency_rules": []}
        return self._assemblies

    def _build_assembly_prompt(self) -> str:
        """
        Builds a WBS Assembly context section for the LLM.

        Teaches the AI how to expand user desires (e.g. 'bagno nuovo') into
        complete BOQ phases following the industry 'Assembly Intelligence' pattern.
        Each assembly shows the required WBS phases and dependency rules.
        """
        data = self._load_assemblies()
        assemblies = data.get("assemblies", [])
        dep_rules = data.get("dependency_rules", [])

        if not assemblies:
            return ""

        lines: list[str] = [
            "## Libreria Assembly (WBS — Work Breakdown Structure)",
            "",
            "Quando l'utente esprime un desiderio macro (es. 'bagno nuovo', 'pareti bianche'),",
            "DEVI espanderlo nelle sotto-lavorazioni tecniche complete seguendo questa libreria.",
            "Non limitarti alla voce superficiale — includi SEMPRE le voci prerequisito.",
            "",
        ]
        for asm in assemblies:
            lines.append(f"### 🔧 {asm['name']} (`{asm['id']}`"+ ")")
            lines.append(f"*Trigger*: {', '.join(asm.get('triggers', [])[:4])}...")
            lines.append(f"*Domande richieste*: {', '.join(asm.get('questions_required', []))}")
            lines.append("*Fasi WBS*:")
            for ph in asm.get("phases", []):
                sku_list = ", ".join(s["sku"] for s in ph.get("skus", []))
                cond = f" *(condizionale: {ph['conditional']})*" if ph.get("conditional") else ""
                lines.append(f"  - **{ph['phase']}**{cond}: {sku_list}")
            lines.append("")

        if dep_rules:
            lines.append("## Regole di Dipendenza")
            for rule in dep_rules:
                lines.append(f"- {rule['rule']}")
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
   - Elementi da preservare (keepElements menzionati dall'utente)

Usa queste informazioni per:
- Identificare le demolizioni necessarie (es. piastrelle vecchie → DEM-003)
- Stimare le preparazioni (es. intonaco deteriorato → MUR-003)
- Rilevare impianti da rifare (es. tubature anni '70 → IMP-ID-001)
- Escludere lavori sugli elementi dichiarati da mantenere

{assembly_section}
{price_book_section}

## Protocollo di Ragionamento (Chain-of-Thought WBS)

Per ogni richiesta, ragiona in QUESTO ORDINE:

**FASE 0 — LEGGI LA FOTO ORIGINALE**
Cerca l'analisi visiva della stanza originale nella cronologia.
Identifica: materiali esistenti, impianti visibili, condizione generale.
Se un'immagine è allegata, analizzala direttamente.

**FASE 1 — IDENTIFICA LE MACRO-CATEGORIE**
Cosa vuole l'utente? (es. bagno nuovo, pareti bianche, pavimento diverso)
Mappa subito a un Assembly ID dalla libreria sopra.

**FASE 2 — ESPANDI LE SOTTO-LAVORAZIONI**
Per ogni assembly individuato, includi TUTTE le fasi WBS:
- Verifica: ci sono demolizioni prerequisito? (es. pareti bianche → rivestimento esistente?)
- Verifica: ci sono impianti da rifare? (elettrico, idraulico, gas)
- Includi sempre smaltimento macerie se ci sono demolizioni.

**FASE 3 — STIMA LE QUANTITÀ**
Se le dimensioni non sono fornite, usa medie italiane:
- Bagno: 5-8 mq | Cucina: 10-15 mq | Camera: 12-16 mq | Soggiorno: 20-30 mq
- Pareti: mq_piano × 2.7 (altezza media) − aperture
- Sempre +5% sulle superfici per scarti e tagli.

**FASE 4 — VALUTA COMPLETEZZA**
Assegna `completeness_score` (0.0-1.0):
- 1.0 = tutte le informazioni tecniche sono note (dimensioni, materiali, impianti)
- 0.7 = informazioni sufficienti per un preventivo indicativo
- < 0.7 = mancano dati critici → lista le domande mancanti in `missing_info`

**Esempi di completeness_score basso (< 0.7):**
- Non si sa se le pareti sono intonacate o rivestite a piastrelle → chiedi
- Non si sa se la parete da abbattere è portante → OBBLIGATORIO chiedere e segnalare admin
- Non si conosce la metratura del locale → chiedi dimensioni approssimative

## Regole Operative

1. **Solo SKU del listino**: MAI inventare codici. Se un lavoro non è mappabile, ometti.
2. **Fase WBS obbligatoria**: Ogni SKU deve avere il campo `phase` compilato.
3. **Quantità plausibili**: es. 10-14 punti luce per 70mq; non 100 prese per 10mq.
4. **ZERO arredamento**: Niente mobili, cucine componibili, elettrodomestici, tende, lampade.
   Qualsiasi voce che non sia lavoro edile va omessa senza eccezioni.
5. **IVA**: Non applicarla — gestita dal backend automaticamente.
6. **Parete portante**: Se sospettata, segnalarlo in `ai_reasoning` e abbassare score.
7. **Vision-driven**: Se la foto originale mostra materiali specifici, usa quella info per
   scegliere le voci di demolizione/preparazione corrette invece di usare defaults generici.

## Esempio Few-Shot (Vision → Preventivo)

**Foto originale descritta**: bagno anni '80, piastrelle fino a h=150cm, sanitari in ceramica bianca, pavimento in granito, finestra in alluminio, impianto idraulico visibile.
**Render obiettivo**: bagno moderno minimal, pareti intonaco bianco liscio, gres grigio 60x60, box doccia walk-in, sanitari sospesi.
**keepElements**: ["finestra", "impianto idraulico se funzionante"]

**Output corretto** (solo lavori edili):
- DEM-006: demolizione sanitari esistenti (qty: 1)
- DEM-003: rimozione piastrelle pareti (qty: ~13mq = 5mq × 2.6h)
- DEM-002: rimozione pavimento granito (qty: ~5mq)
- IMP-ID-001: ridistribuzione punti idraulici (qty: 1) ← condizionale se impianto da rifare
- MUR-003: intonaco liscio pareti (qty: ~13mq)
- PAV-001: posa gres porcellanato pavimento (qty: ~5.25mq con +5%)
- BAG-RIV-001: rivestimento ceramico pareti (qty: ~13.65mq con +5%)
- BAG-SAN-001: fornitura e posa set sanitari sospesi (qty: 1)
- BAG-BOX-001: box doccia walk-in (qty: 1)
- SME-001: smaltimento macerie (qty: ~4mc)

**NON incluso**: mobili, specchio, lampade, asciugamani, accessori. ← ESCLUSO perché arredamento.

## Auto-Verifica Obbligatoria (Self-Correction)

PRIMA di restituire il risultato, esegui questo controllo su ogni SKU suggerito:
→ "Questa voce è un lavoro edile/impiantistico che richiede un operaio specializzato in cantiere?"
→ Se SÌ: includi. Se NO (è un mobile, un elettrodomestico, una lampada): rimuovi senza eccezioni.

RICORDA: SYD Bioedilizia fa SOLO ristrutturazione edile strutturale.
Il preventivo copre ESCLUSIVAMENTE i lavori per trasformare fisicamente lo spazio.
Analizza la conversazione e produci la risposta strutturata.
"""

    async def analyze_project_for_quote(
        self,
        chat_history: List[Dict[str, Any]],
        media_urls: Optional[List[str]] = None,
    ) -> InsightAnalysis:
        """
        Analyzes chat history and optional media to suggest renovation SKUs.

        Uses Gemini native structured output (response_schema=InsightAnalysis)
        instead of fragile JSON string parsing. This guarantees type-safe output
        that matches the Pydantic schema without any manual text manipulation.

        Args:
            chat_history: List of {role, content} dicts from conversation.
            media_urls: Optional Firebase Storage URLs for images/videos.

        Returns:
            InsightAnalysis with validated suggestions and summary.

        Raises:
            InsightEngineError: On Gemini failure or empty response.
        """
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

        # Attach media (SSRF-protected to Firebase Storage domain only)
        if media_urls:
            import httpx
            from urllib.parse import urlparse

            async with httpx.AsyncClient(timeout=10.0) as http_client:
                for url in media_urls:
                    try:
                        parsed = urlparse(url)
                        if settings.FIREBASE_STORAGE_BUCKET not in parsed.netloc:
                            logger.warning(
                                "[InsightEngine] Unauthorized media URL blocked.",
                                extra={"host": parsed.netloc},
                            )
                            continue

                        resp = await http_client.get(url)
                        resp.raise_for_status()
                        mime = "video/mp4" if "video" in url.lower() else "image/jpeg"
                        parts.append(
                            genai_types.Part(
                                inline_data=genai_types.Blob(mime_type=mime, data=resp.content)
                            )
                        )
                        logger.debug("[InsightEngine] Media attached.", extra={"url": url})
                    except Exception as exc:
                        # Graceful degradation: skip broken media, continue analysis
                        logger.error(
                            "[InsightEngine] Failed to fetch media.",
                            extra={"url": url, "error": str(exc)},
                        )
                        parts.append(genai_types.Part(text=f"[Immagine non accessibile: {url}]"))

        # ── Gemini call with native structured output ──────────────────────────
        try:
            logger.info("[InsightEngine] Starting AI project analysis.")
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[genai_types.Content(parts=parts)],
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                    response_schema=InsightAnalysis,  # Pydantic-native, no manual parsing
                    thinking_config=genai_types.ThinkingConfig(thinkingBudget=2048),
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

            result = InsightAnalysis.model_validate_json(raw_text)
            logger.info(
                "[InsightEngine] Analysis complete.",
                extra={"suggestions": len(result.suggestions)},
            )
            return result

        except InsightEngineError:
            raise  # Re-raise domain errors untouched
        except Exception as exc:
            logger.error("[InsightEngine] Gemini call failed.", extra={"error": str(exc)}, exc_info=True)
            raise InsightEngineError(f"Project analysis failed: {exc}") from exc


# ── Singleton Factory ──────────────────────────────────────────────────────────

_insight_engine: Optional[InsightEngine] = None


def get_insight_engine() -> InsightEngine:
    """Returns the singleton InsightEngine instance."""
    global _insight_engine
    if _insight_engine is None:
        _insight_engine = InsightEngine()
    return _insight_engine
