# LLM Evaluation Metrics

Details on automated metrics, human evaluation frameworks, and statistical testing for LLM applications.

## 1. Automated Metrics Implementation

### BLEU Score
```python
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction

def calculate_bleu(reference: str, hypothesis: str, **kwargs) -> float:
    """Calculate BLEU score between reference and hypothesis."""
    smoothie = SmoothingFunction().method4

    return sentence_bleu(
        [reference.split()],
        hypothesis.split(),
        smoothing_function=smoothie
    )
```

### ROUGE Score
```python
from rouge_score import rouge_scorer

def calculate_rouge(reference: str, hypothesis: str, **kwargs) -> dict:
    """Calculate ROUGE scores."""
    scorer = rouge_scorer.RougeScorer(
        ['rouge1', 'rouge2', 'rougeL'],
        use_stemmer=True
    )
    scores = scorer.score(reference, hypothesis)

    return {
        'rouge1': scores['rouge1'].fmeasure,
        'rouge2': scores['rouge2'].fmeasure,
        'rougeL': scores['rougeL'].fmeasure
    }
```

### BERTScore
```python
from bert_score import score

def calculate_bertscore(
    references: list[str],
    hypotheses: list[str],
    **kwargs
) -> dict:
    """Calculate BERTScore using pre-trained model."""
    P, R, F1 = score(
        hypotheses,
        references,
        lang='en',
        model_type='microsoft/deberta-xlarge-mnli'
    )

    return {
        'precision': P.mean().item(),
        'recall': R.mean().item(),
        'f1': F1.mean().item()
    }
```

### Custom Metrics
```python
def calculate_groundedness(response: str, context: str, **kwargs) -> float:
    """Check if response is grounded in provided context."""
    from transformers import pipeline

    nli = pipeline(
        "text-classification",
        model="microsoft/deberta-large-mnli"
    )

    result = nli(f"{context} [SEP] {response}")[0]

    # Return confidence that response is entailed by context
    return result['score'] if result['label'] == 'ENTAILMENT' else 0.0

def calculate_toxicity(text: str, **kwargs) -> float:
    """Measure toxicity in generated text."""
    from detoxify import Detoxify

    results = Detoxify('original').predict(text)
    return max(results.values())  # Return highest toxicity score
```

## 2. Human Evaluation Frameworks

### Annotation Guidelines
```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class AnnotationTask:
    """Structure for human annotation task."""
    response: str
    question: str
    context: Optional[str] = None

    def get_annotation_form(self) -> dict:
        return {
            "question": self.question,
            "context": self.context,
            "response": self.response,
            "ratings": {
                "accuracy": {"scale": "1-5", "description": "Is the response factually correct?"},
                "relevance": {"scale": "1-5", "description": "Does it answer the question?"},
                "coherence": {"scale": "1-5", "description": "Is it logically consistent?"}
            },
            "issues": {
                "factual_error": False, "hallucination": False, "off_topic": False, "unsafe_content": False
            },
            "feedback": ""
        }
```

## 3. A/B Testing & Regression

### Statistical Testing
```python
from scipy import stats
import numpy as np

def analyze_ab_test(variant_a_scores, variant_b_scores, alpha=0.05):
    t_stat, p_value = stats.ttest_ind(variant_a_scores, variant_b_scores)
    return {
        "p_value": p_value,
        "significant": p_value < alpha,
        "improvement": (np.mean(variant_b_scores) - np.mean(variant_a_scores)) / np.mean(variant_a_scores)
    }
```

## 4. Benchmarking
Refer to `METRICS_CHECKLIST.md` for specific factuality and groundedness benchmarks like FACTSCORE.
