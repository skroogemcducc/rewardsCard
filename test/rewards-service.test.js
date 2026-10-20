import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService } from '../src/rewards-service.js';

test('Patrick opens with one gift reward and no progress toward the next reward', () => {
  const service = createRewardsService();

  assert.deepEqual(service.getMemberView('patrick'), {
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

test('Staff can record one paid Qualifying Drink and a retry does not double-credit it', () => {
  const service = createRewardsService({ database: ':memory:', staffAccessCode: 'espresso' });

  const afterPurchase = service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'purchase-001'
  });
  const afterRetry = service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'purchase-001'
  });

  assert.equal(afterPurchase.drinkCredits, 1);
  assert.equal(afterPurchase.lifetimeDrinkCredits, 1);
  assert.equal(afterPurchase.recentActivity[0].label, 'Paid drink');
  assert.deepEqual(afterRetry, afterPurchase);
});

test('Staff cannot record a drink with the wrong Access Code', () => {
  const service = createRewardsService({ database: ':memory:', staffAccessCode: 'espresso' });

  assert.throws(() => service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'wrong-code',
    requestId: 'purchase-002'
  }), /Invalid Staff Access Code/);
});

test('the eighth Drink Credit creates one Free Drink Reward and resets current progress', () => {
  const service = createRewardsService({ database: ':memory:', staffAccessCode: 'espresso' });

  service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'milestone-001',
    drinkCount: 8
  });

  const view = service.getMemberView('patrick');
  assert.equal(view.drinkCredits, 0);
  assert.equal(view.creditsToNextReward, 8);
  assert.equal(view.lifetimeDrinkCredits, 8);
  assert.equal(view.availableRewards.length, 2);
  assert.equal(view.recentActivity.filter(item => item.type === 'Drink Credit').length, 8);
  assert.equal(view.recentActivity[0].label, 'Earned free drink reward');
});

test('credits beyond a milestone roll toward the next reward and rewards stack', () => {
  const service = createRewardsService({ database: ':memory:', staffAccessCode: 'espresso' });

  service.recordQualifyingDrink({
    memberId: 'patrick',
    accessCode: 'espresso',
    requestId: 'rollover-001',
    drinkCount: 18
  });

  const view = service.getMemberView('patrick');
  assert.equal(view.drinkCredits, 2);
  assert.equal(view.creditsToNextReward, 6);
  assert.equal(view.lifetimeDrinkCredits, 18);
  assert.equal(view.availableRewards.length, 3);
  assert.equal(view.recentActivity.filter(item => item.label === 'Earned free drink reward').length, 2);
});

test('a request ID cannot silently discard another Member\'s purchase', () => {
  const service = createRewardsService({
    database: ':memory:',
    staffAccessCode: 'espresso',
    additionalMembers: [{ id: 'another-member', name: 'Another Member' }]
  });

  service.recordQualifyingDrink({ memberId: 'patrick', accessCode: 'espresso', requestId: 'shared-request' });

  assert.throws(() => service.recordQualifyingDrink({
    memberId: 'another-member',
    accessCode: 'espresso',
    requestId: 'shared-request'
  }), /Request ID already belongs to another Member/);
});

test('Patrick can reveal a reward for five minutes and Staff can preview and redeem it once', () => {
  let currentTime = 1_000_000;
  const service = createRewardsService({
    database: ':memory:',
    staffAccessCode: 'espresso',
    now: () => currentTime
  });

  const issued = service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  assert.equal(issued.rewardId, 'welcome-reward');
  assert.equal(issued.expiresAt, currentTime + 5 * 60 * 1000);

  const preview = service.previewRedemption({ accessCode: 'espresso', token: issued.token });
  assert.deepEqual(preview.member, { id: 'patrick', name: 'Patrick Kearns' });
  assert.deepEqual(preview.reward, { id: 'welcome-reward', kind: 'Free Drink Reward' });

  const redeemed = service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-001' });
  assert.equal(redeemed.availableRewards.length, 0);
  assert.equal(redeemed.lifetimeDrinkCredits, 0);
  assert.equal(redeemed.recentActivity[0].type, 'Redemption');
  assert.deepEqual(service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-001' }), redeemed);
  assert.throws(() => service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'redemption-002' }), /already been used/);
});

test('an expired Reward QR cannot be previewed or redeemed', () => {
  let currentTime = 2_000_000;
  const service = createRewardsService({
    database: ':memory:',
    staffAccessCode: 'espresso',
    now: () => currentTime
  });
  const issued = service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  currentTime += 5 * 60 * 1000;

  assert.throws(() => service.previewRedemption({ accessCode: 'espresso', token: issued.token }), /expired/);
  assert.throws(() => service.redeemReward({ accessCode: 'espresso', token: issued.token, requestId: 'expired-001' }), /expired/);
});

test('revealing a reward again invalidates its older Reward QR', () => {
  const service = createRewardsService({ database: ':memory:', staffAccessCode: 'espresso' });

  const first = service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });
  const second = service.revealReward({ memberId: 'patrick', rewardId: 'welcome-reward' });

  assert.throws(() => service.previewRedemption({ accessCode: 'espresso', token: first.token }), /already been used/);
  assert.equal(service.previewRedemption({ accessCode: 'espresso', token: second.token }).reward.id, 'welcome-reward');
});

test('an invalid Reward QR cannot be previewed', () => {
  const service = createRewardsService({ database: ':memory:', staffAccessCode: 'espresso' });

  assert.throws(() => service.previewRedemption({ accessCode: 'espresso', token: 'not-a-real-token' }), /Invalid Reward QR/);
});
