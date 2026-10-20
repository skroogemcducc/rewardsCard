# 04: Patrick can reveal and redeem a reward

**What to build:** Patrick can choose one available Free Drink Reward, reveal a five-minute Reward QR, and have Staff confirm a single Redemption that removes exactly one reward from the Reward Wallet.

**Blocked by:** 03: Milestones and rollover work

**Status:** resolved

- [x] Patrick must choose an available reward before a Reward QR is generated.
- [x] The Reward QR identifies one reward, is valid for five minutes, and is single-use.
- [x] Staff can scan or manually enter the Reward QR and see the intended Redemption before confirming.
- [x] Confirmation consumes exactly one Free Drink Reward.
- [x] A drink received through Redemption does not create a Drink Credit.
- [x] Expired, already-used, duplicate, or invalid Reward QRs are rejected safely.
- [x] The wallet, activity history, and success state update after confirmation.

## Answer

Patrick can reveal an opaque, five-minute Reward QR for one available reward. Staff can preview the identified Member and reward using camera scanning where the browser supports BarcodeDetector, or paste the token manually, then confirm a single Redemption. The ledger records the Redemption without adding a Drink Credit.
