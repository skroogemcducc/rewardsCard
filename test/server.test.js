import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardsServer } from '../src/server.js';

async function startTestServer() {
  const app = await createRewardsServer({ databaseUrl: 'file::memory:', staffAccessCode: 'espresso' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise(resolve => app.server.close(resolve));
      app.service.close();
    }
  };
}

test('health check reports that the app and persistent database are ready', async t => {
  const app = await startTestServer();
  t.after(() => app.close());

  const response = await fetch(`${app.baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('production server refuses to start without persistent database credentials', async () => {
  await assert.rejects(createRewardsServer({ production: true }), /TURSO_DATABASE_URL/);
});

test('Staff PIN is required before a scanned card can add a Drink Credit', async t => {
  const app = await startTestServer();
  t.after(() => app.close());
  const cardToken = await app.service.getMemberCardToken('patrick');

  const denied = await fetch(`${app.baseUrl}/api/staff/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cardToken, accessCode: 'wrong', requestId: 'denied-scan' })
  });
  const member = await app.service.getMemberView('patrick');

  assert.equal(denied.status, 401);
  assert.equal(member.lifetimeDrinkCredits, 0);
});

test('Staff can add Patrick\'s Drink Credit manually when the camera is unavailable', async t => {
  const app = await startTestServer();
  t.after(() => app.close());

  const response = await fetch(`${app.baseUrl}/api/staff/credits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: 'patrick', accessCode: 'espresso', requestId: 'manual-credit' })
  });
  const member = await response.json();

  assert.equal(response.status, 200);
  assert.equal(member.lifetimeDrinkCredits, 1);
});
