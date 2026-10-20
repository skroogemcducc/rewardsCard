# 05: Corrections and duplicate protection work

**What to build:** Staff can correct an accounting mistake with a labeled Credit Adjustment or Redemption correction while preserving the original activity, and retries or concurrent requests cannot corrupt the Rewards Card.

**Blocked by:** 02: Staff can record a paid drink; 04: Patrick can redeem a reward

**Status:** resolved

- [x] Staff can add or subtract a labeled Credit Adjustment.
- [x] Adjustments append new explanatory activity rather than deleting or overwriting original activity.
- [x] A mistaken Redemption has a documented correction path that preserves the original Redemption record.
- [x] Duplicate purchase submissions are idempotent.
- [x] Concurrent or repeated Redemption attempts can consume the same reward at most once.
- [x] Recomputed totals remain explainable from the complete activity ledger.
- [x] Correction and retry behavior is covered by service-level tests.

## Answer

Staff can record signed, labeled Credit Adjustments and restore a mistakenly redeemed reward through explicit Redemption Corrections. Both operations append explanatory ledger activity and use request IDs for safe retries. The Staff viewpoint now exposes the correction controls alongside purchase recording and Reward QR redemption. Thirteen service tests cover adjustments, preserved history, idempotent retries, expiry, invalid tokens, and one-time redemption behavior.
