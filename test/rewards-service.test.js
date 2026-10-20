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
