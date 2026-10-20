# 03: Milestones and rollover work

**What to build:** When Staff records purchases, the Rewards service creates a Free Drink Reward at eight Drink Credits and carries any extra Drink Credits toward the next reward.

**Blocked by:** 02: Staff can record a paid drink

**Status:** resolved

- [x] The eighth Drink Credit creates exactly one Free Drink Reward.
- [x] The progress display resets to zero after a completed group of eight.
- [x] A purchase that crosses the milestone preserves all extra Drink Credits toward the next reward.
- [x] Multiple Free Drink Rewards can accumulate in the Reward Wallet.
- [x] The activity history explains both the qualifying purchases and the reward creation.
- [x] The rule is covered by tests for one credit, the eighth credit, and a multi-drink crossing purchase.

## Answer

The Rewards service derives current progress from lifetime Drink Credit activity modulo eight. Each completed group creates one available Free Drink Reward and appends a reward-creation activity record, while extra credits remain toward the next reward.
