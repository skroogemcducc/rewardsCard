# 02: Staff can record a paid drink

**What to build:** An authorized Staff Member can use the Staff view to confirm and record one paid Qualifying Drink for Patrick, after which Patrick's card shows one additional Drink Credit and the activity history explains the change.

**Blocked by:** 01: Patrick can open his Rewards Card

**Status:** resolved

- [x] Staff can enter the protected Staff view using the shared Staff Access Code.
- [x] Staff can select Patrick and review the intended action before submission.
- [x] Confirming one paid Qualifying Drink adds exactly one Drink Credit.
- [x] The ledger records the addition without overwriting prior activity.
- [x] Patrick's progress, lifetime count, and recent activity update after the action.
- [x] Repeated submission of the same request cannot add the credit twice.

## Answer

Staff can enter the protected Staff view, confirm a paid Qualifying Drink, and update Patrick's Rewards Card through the server-owned Rewards service. The SQLite ledger records the Drink Credit and an idempotency key prevents retries from adding it twice.
