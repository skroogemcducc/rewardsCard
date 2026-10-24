import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService } from '../src/rewards-service.js';

test('production refuses to start without persistent database credentials and a private Staff PIN', async () => {
  await assert.rejects(createRewardsService({ production: true }), /TURSO_DATABASE_URL/);
});

test('Patrick opens with one gift reward and no progress toward the next reward', async () => {
  const service = await createRewardsService();

  assert.deepEqual(await service.getMemberView('patrick'), {
    member: {
      id: 'patrick',
      name: 'Patrick Kearns'
    },
    drinkCredits: 0,
    creditsToNextReward: 8,
    availableRewards: [
      {
        id: 'welcome-reward',
        kind: 'Free Drink Reward',
        status: 'available'
      }
    ],
    redeemedRewards: [],
    lifetimeDrinkCredits: 0,
    recentActivity: [
      {
        type: 'Free Drink Reward',
        label: 'Welcome gift',
        actor: 'Staff'
      }
    ]
  });
});

test('Staff can record one paid Qualifying Drink and a retry does not double-credit it', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  const afterPurchase = await service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'purchase-001'
  });
  const afterRetry = await service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'purchase-001'
  });

  assert.equal(afterPurchase.drinkCredits, 1);
  assert.equal(afterPurchase.lifetimeDrinkCredits, 1);
  assert.equal(afterPurchase.recentActivity[0].label, 'Paid drink');
  assert.deepEqual(afterRetry, afterPurchase);
});

test('Staff cannot record a drink with the wrong Access Code', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  await assert.rejects(service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'wrong-code',
    requestId: 'purchase-002'
  }), /Invalid Staff Access Code/);
});

test('the eighth Drink Credit creates one Free Drink Reward and resets current progress', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  await service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'milestone-001',
    drinkCount: 8
  });

  const view = await service.getMemberView('patrick');
  assert.equal(view.drinkCredits, 0);
  assert.equal(view.creditsToNextReward, 8);
  assert.equal(view.lifetimeDrinkCredits, 8);
  assert.equal(view.availableRewards.length, 2);
  assert.equal(view.recentActivity.filter(item => item.type === 'Drink Credit').length, 8);
  assert.equal(view.recentActivity[0].label, 'Earned free drink reward');
});

test('credits beyond a milestone roll toward the next reward and rewards stack', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  await service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'rollover-001',
    drinkCount: 18
  });

  const view = await service.getMemberView('patrick');
  assert.equal(view.drinkCredits, 2);
  assert.equal(view.creditsToNextReward, 6);
  assert.equal(view.lifetimeDrinkCredits, 18);
  assert.equal(view.availableRewards.length, 3);
  assert.equal(view.recentActivity.filter(item => item.label === 'Earned free drink reward').length, 2);
});

test('a request ID cannot silently discard another Member\'s purchase', async () => {
  const service = await createRewardsService({
    staffAccessCode: 'espresso',
    additionalMembers: [{ id: 'another-member', name: 'Another Member' }]
  });

  await service.recordQualifyingDrink({ memberId: 'patrick', accessCode: 'espresso', requestId: 'shared-request' });

  await assert.rejects(service.recordQualifyingDrink({
    memberId: 'another-member',
    accessCode: 'espresso',
    requestId: 'shared-request'
  }), /Request ID already belongs to another Member/);
});

test('Patrick can reveal a reward for five minutes and Staff can preview and redeem it once', async () => {
  let currentTime = 1_000_000;
  const service = await createRewardsService({
    staffAccessCode: 'espresso',
    now: () => currentTime
  });

  const issued = await service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  assert.equal(issued.rewardId, 'welcome-reward');
  assert.equal(issued.expiresAt, currentTime + 5 * 60 * 1000);

  const preview = await service.previewRedemption({ accessCode: 'espresso', token: issued.token });
  assert.deepEqual(preview.member, { id: 'patrick', name: 'Patrick Kearns' });
  assert.deepEqual(preview.reward, { id: 'welcome-reward', kind: 'Free Drink Reward' });

  const redeemed = await service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-001' });
  assert.equal(redeemed.availableRewards.length, 0);
  assert.equal(redeemed.lifetimeDrinkCredits, 0);
  assert.equal(redeemed.recentActivity[0].type, 'Redemption');
  assert.deepEqual(await service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-001' }), redeemed);
  await assert.rejects(service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-002' }), /already been used/);
});

test('an expired Reward QR cannot be previewed or redeemed', async () => {
  let currentTime = 2_000_000;
  const service = await createRewardsService({
    staffAccessCode: 'espresso',
    now: () => currentTime
  });
  const issued = await service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  currentTime += 5 * 60 * 1000;

  await assert.rejects(service.previewRedemption({ accessCode: 'espresso', token: issued.token }), /expired/);
  await assert.rejects(service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'expired-001' }), /expired/);
});

test('revealing a reward again invalidates its older Reward QR', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  const first = await service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  const second = await service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });

  await assert.rejects(service.previewRedemption({ accessCode: 'espresso', token: first.token }), /already been used/);
  assert.equal((await service.previewRedemption({ accessCode: 'espresso', token: second.token })).reward.id, 'welcome-reward');
});

test('an invalid Reward QR cannot be previewed', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  await assert.rejects(service.previewRedemption({ accessCode: 'espresso', token: 'not-a-real-token' }), /Invalid Reward QR/);
});

test('Staff can scan Patrick\'s permanent card QR to add one drink', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });
  const cardToken = await service.getMemberCardToken('patrick');

  const scanned = await service.recordMemberScan({
    cardToken,
    accessCode: 'espresso',
    requestId: 'scan-001'
  });

  assert.equal(scanned.lifetimeDrinkCredits, 1);
  assert.equal(scanned.drinkCredits, 1);
  assert.deepEqual(await service.recordMemberScan({
    cardToken,
    accessCode: 'espresso',
    requestId: 'scan-001'
  }), scanned);
});

test('an unknown card QR cannot add a drink', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  await assert.rejects(service.recordMemberScan({
    cardToken: 'not-a-member-card',
    accessCode: 'espresso',
    requestId: 'scan-002'
  }), /Invalid Rewards Card QR/);
});

test('Staff can append a labeled positive Credit Adjustment and retries stay idempotent', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });

  const adjusted = await service.recordCreditAdjustment({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'adjustment-001',
    amount: 2,
    reason: 'Missed drinks from paper card'
  });

  assert.equal(adjusted.lifetimeDrinkCredits, 2);
  assert.equal(adjusted.drinkCredits, 2);
  assert.deepEqual(adjusted.recentActivity[0], {
    type: 'Credit Adjustment',
    label: 'Credit adjustment (+2): Missed drinks from paper card',
    actor: 'Staff'
  });
  assert.deepEqual(await service.recordCreditAdjustment({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'adjustment-001',
    amount: 2,
    reason: 'Missed drinks from paper card'
  }), adjusted);
});

test('Staff can subtract a labeled Credit Adjustment without deleting the original purchase', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });
  await service.recordQualifyingDrink({ memberId: 'patrick', accessCode: 'espresso', requestId: 'purchase-for-correction' });

  const adjusted = await service.recordCreditAdjustment({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'adjustment-002',
    amount: -1,
    reason: 'Duplicate paper entry'
  });

  assert.equal(adjusted.lifetimeDrinkCredits, 0);
  assert.equal(adjusted.recentActivity[0].label, 'Credit adjustment (-1): Duplicate paper entry');
  assert.equal(adjusted.recentActivity.some(item => item.label === 'Paid drink'), true);
});

test('Staff can correct a mistaken Redemption while preserving the original history', async () => {
  const service = await createRewardsService({ staffAccessCode: 'espresso' });
  const issued = await service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  await service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-for-correction' });

  const corrected = await service.correctRedemption({
    accessCode: 'espresso',
    rewardId: 'welcome-reward',
    requestId: 'correction-001',
    reason: 'Wrong reward selected at the counter'
  });

  assert.equal(corrected.availableRewards.length, 1);
  assert.deepEqual(corrected.recentActivity[0], {
    type: 'Redemption Correction',
    label: 'Redemption correction: Wrong reward selected at the counter',
    actor: 'Staff'
  });
  assert.equal(corrected.recentActivity.some(item => item.type === 'Redemption'), true);
  assert.deepEqual(await service.correctRedemption({
    accessCode: 'espresso',
    rewardId: 'welcome-reward',
    requestId: 'correction-001',
    reason: 'Wrong reward selected at the counter'
  }), corrected);
});
