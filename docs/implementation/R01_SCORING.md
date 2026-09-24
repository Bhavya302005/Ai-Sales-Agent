# R01 deterministic score v1

The implementation uses the product contract formula exactly:

```text
100 × (0.25 ICP fit + 0.25 explicit intent + 0.10 urgency +
       0.10 source quality + 0.10 data confidence +
       0.10 engagement + 0.10 freshness)
```

Feature values are bounded to 0–1. ICP fit uses only the active approved product version and the
evidence-backed need, industry and geography. Missing or conflicted assertions score zero rather
than being guessed. Engagement remains zero until real engagement evidence exists. Freshness uses
the published time when available and otherwise the observed time.

Each immutable snapshot stores feature values, exact weights, assertion/source/product evidence,
the final score, confidence and `score.v1`. Repeating the operation reuses the existing snapshot.
The score never changes `outreach_eligible`; calling permission remains a separate later gate.

The existing opportunity detail UI now receives scores created from the extraction pipeline and
shows every weighted contribution, confidence, evidence assertions and explicit unknown fields.

