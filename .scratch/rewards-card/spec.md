# Bend & Brew Rewards Card

Status: ready-for-agent

## Problem Statement

Patrick Kearns is Bend & Brew Coffee Co.'s first Member and deserves a personal, easy-to-use way to see loyalty progress and receive free drinks. Staff need a dependable way to record paid drinks, redeem rewards, and correct mistakes without relying on memory, paper, or an unexplained mutable balance.

## Simplified v1 interaction

The everyday experience is intentionally reduced to one permanent Member QR and one drink tally. Patrick's home screen shows his QR and current total. Staff open `/staff`, enter the shared Staff Access Code, and start the scanner. A successful scan records one Drink Credit, plays an audible beep, and shows an updated success alert on the Staff screen; Patrick's screen refreshes automatically. The service ledger and duplicate protection remain authoritative behind this simple flow. Reward redemption and correction operations remain available as secondary service capabilities but are not part of the primary scan interaction.

## Solution

Build a mobile-first, installable web app centered on Patrick's Rewards Card. The customer experience uses the selected counter-ticket direction: a warm, compact card centered on a permanent QR and drink tally. A scanner-first Staff view uses the same underlying Rewards service to record one purchase per scan.

The server and hosted relational database own the authoritative state. An append-only activity ledger explains every balance. Patrick starts with one gift Free Drink Reward and zero progress toward the next reward.

## User Stories

1. As Patrick, I want to open my personal Rewards Card on a current iPhone or Android browser, so that I can use it without installing a native app.
2. As Patrick, I want to see a personal thank-you message, so that the experience feels made for me rather than like a generic loyalty program.
3. As Patrick, I want to see my current Drink Credit progress toward eight, so that I know how close I am to my next Free Drink Reward.
4. As Patrick, I want each credit represented clearly in an eight-space progress display, so that the reward rule is immediately understandable.
5. As Patrick, I want to see my available Free Drink Rewards in a Reward Wallet, so that I know what I can use today.
6. As Patrick, I want rewards to remain available until Redemption, so that an unused reward does not disappear unexpectedly.
7. As Patrick, I want to see recent activity, so that I can understand what the card recorded.
8. As Patrick, I want to see my lifetime Drink Credit total and Milestone Badges, so that repeat visits feel recognized.
9. As Patrick, I want to display my permanent Rewards Card QR, so that staff can record drinks purchased by me.
10. As Patrick, I want to choose an available reward before a Reward QR appears, so that an accidental scan cannot spend a reward.
11. As Patrick, I want a Reward QR to be single-use and short-lived, so that a displayed reward cannot be reused indefinitely.
12. As Patrick, I want to see that a Reward QR expires after five minutes, so that I understand when I need to generate a new one.
13. As Patrick, I want optional text notifications for new rewards and major milestones, so that I can notice important changes without checking constantly.
14. As Patrick, I want notification failure not to affect my reward accounting, so that a text delivery problem never loses a credit or reward.
15. As a Staff Member, I want to open a protected Staff view, so that only authorized staff can change a Member's Rewards Card.
16. As a Staff Member, I want to scan Patrick's permanent Rewards Card QR, so that I can begin recording a paid drink.
17. As a Staff Member, I want to confirm the Member and action before submitting, so that a camera scan or accidental tap does not change the ledger.
18. As a Staff Member, I want to record one Drink Credit for each paid Qualifying Drink, so that the card reflects the agreed loyalty rule.
19. As a Staff Member, I want several purchased drinks to be recorded in one visit, so that I can accurately handle group orders and multiple drinks.
20. As a Staff Member, I want the system to create a Free Drink Reward exactly when the eighth Drink Credit is reached, so that the reward rule is consistent.
21. As a Staff Member, I want credits beyond the eighth to roll toward the next reward, so that a purchase that crosses a milestone is never lost.
22. As a Staff Member, I want to scan a Reward QR and see the intended Redemption before confirming, so that Patrick's reward is not spent by mistake.
23. As a Staff Member, I want a confirmed Redemption to remove exactly one Free Drink Reward from the Reward Wallet, so that stacked rewards remain independent.
24. As a Staff Member, I want the drink received through Redemption not to earn a Drink Credit, so that the reward rule cannot accidentally compound itself.
25. As a Staff Member, I want to use a manual fallback when camera scanning fails, so that a camera permission or hardware problem does not stop service.
26. As a Staff Member, I want to use one shared Staff Access Code, so that Jesse and Becky can operate the first version without separate account administration.
27. As a Staff Member, I want history to identify actions as performed by Staff, so that the system is honest about the available audit detail.
28. As a Staff Member, I want to make a labeled Credit Adjustment, so that mistakes can be corrected without deleting original activity.
29. As a Staff Member, I want every adjustment to explain what it corrected, so that the resulting balance remains understandable.
30. As Patrick, I want to recover access after losing or replacing my phone, so that my Rewards Card is tied to my record rather than to one device.
31. As Patrick, I want an expired setup link to be replaceable by staff, so that a missed invitation does not strand the card.
32. As a Staff Member, I want duplicate submissions to be rejected safely, so that a repeated tap or network retry does not add credits twice.
33. As a Staff Member, I want a mistaken Redemption to have a correction path, so that staff can repair an operational mistake while preserving the original history.
34. As Patrick, I want the app to remain usable on weak but available cellular service, so that a small payload does not prevent normal trailer use.
35. As a future owner, I want the underlying model to support a few additional Members, so that the Patrick-first experience can grow without a redesign of the rewards rules.

## Implementation Decisions

- The selected visual direction is the C counter-ticket experience: compact, warm, action-oriented, and centered on the current reward and the next counter action.
- The application is one deployable mobile-first web application with a customer surface and a protected Staff surface.
- A single server-owned Rewards service/API handles recording Qualifying Drinks, creating Free Drink Rewards, Redemptions, and Credit Adjustments. Both surfaces use this boundary.
- The hosted relational database owns authoritative state; browser storage is not authoritative.
- The activity ledger is append-only. It records credit additions, reward creation, Redemptions, and labeled Credit Adjustments. Current totals may be derived or cached, but every total must be explainable from ledger history.
- One paid Qualifying Drink creates one Drink Credit. Complimentary drinks and drinks received through Redemption do not create credits.
- Eight Drink Credits create one Free Drink Reward. Credits beyond a completed group roll toward the next reward. Multiple rewards may be held at once.
- Free Drink Rewards do not expire. A confirmed Redemption consumes exactly one reward.
- Patrick begins with one deliberate gift Free Drink Reward and zero Drink Credits toward the next reward.
- Patrick's permanent Rewards Card QR is distinct from a single-use Reward QR.
- For the simplified v1 primary workflow, Patrick's permanent Rewards Card QR is the only QR shown in the customer and Staff surfaces; Reward QR redemption remains a secondary service capability until deliberately brought back into the main experience.
- A Reward QR is generated only after Patrick chooses an available reward, is valid for five minutes, and cannot itself complete a Redemption. Staff confirmation is required.
- Staff actions use one shared Staff Access Code in version one and are attributed as Staff rather than falsely distinguishing Jesse from Becky.
- Staff can add credits and redeem rewards through scanning or a manual record lookup fallback.
- Mutating actions must be safe against duplicate submissions and must return enough updated state for the interface to show the result immediately.
- Notifications are optional side effects. Their failure must not roll back or invalidate rewards accounting.
- The first experience supports current iPhone and Android browsers and can be installed as a web app. Offline synchronization, native apps, payments, public enrollment, menu management, and marketing features remain excluded.
- The prototype at `prototype/rewards-card-prototype.html` is the primary visual reference for the selected direction. Its in-memory interaction is illustrative only; production code must use the server-owned service and ledger.

## Testing Decisions

- Tests should verify externally observable behavior at the Rewards service boundary and through the highest practical application seam.
- The core behavior must be tested with scenarios for one credit, multiple credits, the eighth credit, credits that cross a milestone, stacked rewards, Redemption, non-crediting reward drinks, and labeled adjustments.
- Tests must prove that duplicate submissions do not create duplicate ledger activity and that concurrent or repeated Redemption attempts cannot consume the same reward twice.
- Tests must prove that original ledger activity remains present after a Credit Adjustment or Redemption correction.
- Tests must cover Reward QR generation, five-minute validity, single-use behavior, and rejection after expiry or prior use.
- Tests must cover Staff confirmation and the manual fallback path at the application boundary.
- Tests must verify notification failure is isolated from accounting.
- Customer and Staff UI tests should focus on visible state and user actions: progress, Reward Wallet, QR reveal, confirmation, success, and recoverable failure states.
- Since the repository has no established application test suite yet, the first implementation should establish the smallest test harness around the Rewards service/domain boundary before adding broad browser coverage.

## Out of Scope

- Public self-service enrollment
- Payments or point-of-sale integration
- Menu management or product catalog management
- Native iOS or Android applications
- Offline operation or background synchronization
- Marketing campaigns, referrals, coupons, or generalized promotions
- Separate staff identities and permissions beyond the shared Staff Access Code
- SMS as a required accounting or authentication dependency
- A multi-location or franchise administration system

## Further Notes

- The visual language should remain nostalgic, handmade, purposeful, and personal without becoming a generic coffee-chain loyalty card.
- The first production slice should be intentionally narrow but demonstrable end to end: load Patrick's card, record one purchase through Staff, and show the updated progress and activity.
- After this spec is accepted, break it into tracer-bullet tickets with blockers before implementation. Keep the prototype as a design reference until the winning UI is folded into production code.
