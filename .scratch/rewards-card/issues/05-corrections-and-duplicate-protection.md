# 05: Corrections and duplicate protection work

**What to build:** Staff can correct an accounting mistake with a labeled Credit Adjustment or Redemption correction while preserving the original activity, and retries or concurrent requests cannot corrupt the Rewards Card.

**Blocked by:** 02: Staff can record a paid drink; 04: Patrick can redeem a reward

**Status:** ready-for-agent

- [ ] Staff can add or subtract a labeled Credit Adjustment.
- [ ] Adjustments append new explanatory activity rather than deleting or overwriting original activity.
- [ ] A mistaken Redemption has a documented correction path that preserves the original Redemption record.
- [ ] Duplicate purchase submissions are idempotent.
- [ ] Concurrent or repeated Redemption attempts can consume the same reward at most once.
- [ ] Recomputed totals remain explainable from the complete activity ledger.
- [ ] Correction and retry behavior is covered by service-level tests.

