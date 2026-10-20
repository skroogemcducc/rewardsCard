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
