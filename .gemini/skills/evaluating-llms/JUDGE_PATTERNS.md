# LLM-as-Judge Patterns

Implementation patterns for using strong LLMs (e.g., Gemini 1.5 Pro, Claude 3.5 Sonnet) to evaluate model outputs.

## 1. Single Output Evaluation
```python
async def llm_judge_quality(response: str, question: str, context: str = None) -> dict:
    # prompt logic to rate responses on 1-10 scale
    # return structured JSON with accuracy, helpfulness, clarity
```

## 2. Pairwise Comparison (A/B)
```python
async def compare_responses(question: str, response_a: str, response_b: str) -> dict:
    # Use LLM judge to determine the winner between two variants
    # Answer with JSON: {"winner": "A" | "B" | "tie", "reasoning": "...", "confidence": 1-10}
```

## 3. Reference-Based Evaluation
```python
async def evaluate_against_reference(response: str, reference: str, question: str) -> dict:
    # Compare response to a gold standard reference
    # Score semantic similarity, factual accuracy, and completeness
```

## 4. G-Eval Pattern
Use Chain-of-Thought prompting to define evaluation steps for specific criteria (Coherence, Consistency, Fluency).
```python
# G-Eval template
prompt = """
Evaluate the following summary based on Coherence.
Coherence: The collective quality of all sentences.
Evaluation Steps:
1. Read the article and the summary.
2. ...
"""
```
