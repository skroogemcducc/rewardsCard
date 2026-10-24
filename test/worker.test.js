import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsService } from '../src/rewards-service.js';
import { createWorkerHandler } from '../src/worker.js';

test('Worker health route verifies the database', async () => {
  const service = await createRewardsService();
  const fetch = createWorkerHandler({ service });
  const response = await fetch(new Request('https://example.test/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  service.close();
});

test('Worker returns Patrick\'s permanent card as an SVG data URL', async () => {
  const service = await createRewardsService();
  const fetch = createWorkerHandler({ service });
  const response = await fetch(new Request('https://example.test/api/members/patrick'));
  const member = await response.json();
  assert.equal(response.status, 200);
  assert.match(member.cardQrDataUrl, /^data:image\/svg\+xml/);
  service.close();
});

test('Worker protects staff mutations with the Staff Access Code', async () => {
  const service = await createRewardsService({ staffAccessCode: '246810' });
  const fetch = createWorkerHandler({ service });
  const response = await fetch(new Request('https://example.test/api/staff/credits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: 'patrick', accessCode: 'wrong', requestId: 'worker-test' })
  }));
  assert.equal(response.status, 401);
  assert.equal((await service.getMemberView('patrick')).lifetimeDrinkCredits, 0);
  service.close();
});
