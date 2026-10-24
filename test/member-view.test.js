import test from 'node:test';
import assert from 'node:assert/strict';
import { memberMarkup } from '../public/member-view.js';

const patrick = {
  member: { id: 'patrick', name: 'Patrick Kearns' },
  lifetimeDrinkCredits: 42,
  drinkCredits: 2,
  creditsToNextReward: 6,
  cardQrDataUrl: 'data:image/svg+xml,card',
  availableRewards: [{ id: 'reward-1', kind: 'Free Drink Reward', status: 'available' }],
  recentActivity: [{ label: 'Paid drink', actor: 'Staff' }]
};

test('Patrick can switch between a lifetime tally and his reward wallet', () => {
  const tally = memberMarkup(patrick, { activeTab: 'tally', jokeIndex: 0 });
  assert.match(tally, /Drink tally/);
  assert.match(tally, /Rewards <span class="tab-count">1<\/span>/);
  assert.match(tally, /Lifetime drinks/);
  assert.match(tally, />42</);
  assert.match(tally, /Espresso yourself/);

  const rewards = memberMarkup(patrick, { activeTab: 'rewards', jokeIndex: 0 });
  assert.match(rewards, /1 drink on the house/);
  assert.match(rewards, /Open reward/);
  assert.match(rewards, /data-reward-id="reward-1"/);
});

test('an opened reward becomes a five-minute QR for Staff to scan', () => {
  const rewards = memberMarkup(patrick, {
    activeTab: 'rewards',
    revealedReward: { rewardId: 'reward-1', qrDataUrl: 'data:image/svg+xml,reward' }
  });

  assert.match(rewards, /Show this to the crew/);
  assert.match(rewards, /Single-use Free Drink Reward QR/);
  assert.match(rewards, /valid for five minutes/);
});
