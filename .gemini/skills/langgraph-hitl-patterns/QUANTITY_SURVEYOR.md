# Quantity Surveyor Agent: Structured Output + SKU Matching

## Pydantic Models (backend_python/src/schemas/quote.py esistente)

Il Quantity Surveyor usa il Pydantic `InsightAnalysis` già in `src/services/insight_engine.py`.
Estendilo se necessario per la vision multi-room.

## Agent Node con Gemini Vision + Structured Output

```python
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from src.schemas.quote import SKUItemSuggestion, InsightAnalysis
from src.services.pricing_service import PricingService
from src.core.config import settings

async def quantity_surveyor_node(state: QuoteState) -> dict:
    """
    Analizza foto e chat history per suggerire SKU e quantità.
    Usa structured output per garantire validazione Pydantic.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-1.5-flash",  # Flash per costi contenuti
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.1
    )
    
    price_book = PricingService.load_price_book()
    sku_list = "\n".join(
        f"- SKU: {i['sku']}, {i['description']} ({i['unit']}), cat: {i['category']}"
        for i in price_book
    )
    
    system_prompt = f"""Sei un Quantity Surveyor AI per ristrutturazioni edili.
Analizza la chat e le foto. Mappa le richieste ai SKU del listino.

LISTINO:
{sku_list}

REGOLE:
1. Usa SOLO i SKU del listino
2. Stima quantità conservative (sottostima per sicurezza)
3. Ignora arredamento. Focus: demolizioni, elettrico, idraulico, pavimenti, muri
4. Output JSON strutturato
"""
    
    # Prepara contenuto multimodale
    human_content = [{"type": "text", "text": f"Chat history:\n{state['chat_summary']}"}]
    for url in state.get("media_urls", []):
        human_content.append({"type": "image_url", "image_url": {"url": url}})
    
    structured_llm = llm.with_structured_output(InsightAnalysis)
    
    analysis = await structured_llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_content)
    ])
    
    return {"ai_draft": analysis.model_dump()}
```

## Input Preprocessing: Chat Summary

Per evitare di passare l'intera chat history al QS (cost optimization):

```python
async def build_chat_summary(session_id: str, limit: int = 10) -> str:
    """Estrae un riassunto leggibile dalla chat history."""
    from src.repositories.conversation_repository import ConversationRepository
    repo = ConversationRepository()
    history = await repo.get_context(session_id, limit=limit)
    
    lines = []
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")[:500]  # tronca messaggi lunghi
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines)
```

## Validazione Output Prima di Salvare

```python
def validate_sku_suggestions(suggestions: list[SKUItemSuggestion]) -> list[str]:
    """Verifica che gli SKU suggeriti esistano nel Price Book."""
    price_book = {i["sku"] for i in PricingService.load_price_book()}
    unknown = [s.sku for s in suggestions if s.sku not in price_book]
    if unknown:
        logger.warning(f"[QS] SKU sconosciuti dall'AI: {unknown}")
    return unknown  # Logga ma non blocca
```

## Performance Tips

- Usa `gemini-1.5-flash` (non Pro) per il QS: è deterministic con `temperature=0.1`
- Cache del price book summary con `@lru_cache(maxsize=1)` — il listino cambia raramente
- Limita `media_urls` a max 3 immagini per chiamata Gemini Vision
- Se fail del QS, ritorna un draft vuoto (non bloccare il flow HITL)
