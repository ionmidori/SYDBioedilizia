---
name: evaluating-llms
description: Implement comprehensive evaluation strategies for LLM applications using automated metrics, human feedback, and benchmarking. Use when testing LLM performance, measuring AI application quality, or establishing evaluation frameworks.
---

# LLM Evaluation

Master comprehensive evaluation strategies for LLM applications, from automated metrics to human evaluation and A/B testing.

## Core Evaluation Types

### 1. Automated Metrics
Fast, repeatable, scalable evaluation using computed scores.
**See [METRICS.md](METRICS.md)** for implementation details on BLEU, ROUGE, BERTScore, and custom toxicity/groundedness checks.

### 2. Human Evaluation
Manual assessment for quality aspects difficult to automate (Accuracy, Coherence, Relevance).
**See [METRICS.md#2-human-evaluation-frameworks](METRICS.md)** for form templates and inter-rater agreement math.

### 3. LLM-as-Judge
Use stronger LLMs to evaluate weaker model outputs.
**See [JUDGE_PATTERNS.md](JUDGE_PATTERNS.md)** for Pairwise, Pointwise, and Reference-based prompt patterns.

## Quick Start (Evaluation Suite)

```python
from dataclasses import dataclass
from typing import Callable
import numpy as np

class EvaluationSuite:
    def __init__(self, metrics: list[Callable]):
        self.metrics = metrics

    async def evaluate(self, model, test_cases: list[dict]) -> dict:
        results = {m.__name__: [] for m in self.metrics}
        for test in test_cases:
            prediction = await model.predict(test["input"])
            for metric in self.metrics:
                score = metric(prediction, reference=test.get("expected"))
                results[metric.__name__].append(score)
        return {"metrics": {k: np.mean(v) for k, v in results.items()}}
```

## Advanced Workflows

- **Regression Testing**: Compare current performance against a baseline.
- **A/B Testing**: Use statistical tests (T-test) to validate improvements.
- **Continuous Eval**: Integration with LangSmith or Weights & Biases.

## Resources

- [LangSmith Evaluation Guide](https://docs.smith.langchain.com/evaluation)
- [RAGAS Framework](https://docs.ragas.io/)
- [DeepEval Library](https://docs.deepeval.com/)
- [HELM Benchmark](https://crfm.stanford.edu/helm/)

## Best Practices

1. **Multiple Metrics**: Never rely on a single score (e.g., BLEU alone is insufficient).
2. **Representative Data**: Test on real-world edge cases, not just happy paths.
3. **Statistically Significant**: Use A/B testing analysis before concluding a prompt is "better".
4. **Golden Dataset**: Maintain a curated set of input/output pairs for regression testing.
