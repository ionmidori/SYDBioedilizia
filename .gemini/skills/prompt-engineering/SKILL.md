---
name: prompt-engineering
description: Designs and refines system prompts for Google Gemini models and SYD ADK agents. Covers agent sub-prompt authoring, structured output, Italian-language constraints, and SKU validation rules. Use when writing or debugging ADK agent prompts, triage routing, or Gemini system instructions.
---

# Prompt Engineering for SYD ADK Agents

## SYD Agent Prompt Rules

SYD uses Google ADK with a triage router + sub-agents. Each sub-agent system prompt must enforce:

- **Italian output only** — all responses in Italian
- **mq required** — always include square meters in room analysis
- **No furniture** — construction items only (SKUs from `master_price_book.json`)
- **SKU validation** — every suggested item must exist in the price book
- **Intent-first on upload** — when user uploads a file without context, ask "Rendering / Preventivo / Solo analisi?" BEFORE delegating

Agent prompts live in: [modes.py](backend_python/src/prompts/components/modes.py)

## Structured Output

Use Gemini's native JSON mode for extraction tasks:
```python
generation_config = {"response_mime_type": "application/json"}
```

## Prompt Refinement Checklist

- [ ] Instructions are affirmative ("Fai X") not negative ("Non fare Y")
- [ ] Clear separators between context and instructions
- [ ] Few-shot examples cover edge cases
- [ ] Critical instructions appear at both start AND end (Primacy & Recency)
- [ ] Model choice matches task: Flash for real-time chat, Pro for complex reasoning
