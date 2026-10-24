import { createRewardsService } from './rewards-service.js';
import { toQrDataUrl } from './qr-code.js';

let servicePromise;

function json(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function readJson(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 100_000) throw new Error('Request body is too large');
  return JSON.parse(text || '{}');
}

function errorStatus(error) {
  return error.message === 'Invalid Staff Access Code' ? 401 : 400;
}

export function createWorkerHandler({ service: suppliedService } = {}) {
  return async function fetch(request, env = {}) {
    try {
      const service = suppliedService ?? await (servicePromise ??= createRewardsService({
        databaseUrl: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
        staffAccessCode: env.STAFF_ACCESS_CODE,
        production: true
      }));
      const { pathname } = new URL(request.url);

      if (request.method === 'GET' && pathname === '/health') {
        await service.getMemberView('patrick');
        return json(200, { status: 'ok' });
      }
      if (request.method === 'GET' && pathname === '/api/members/patrick') {
        const view = await service.getMemberView('patrick');
        const cardToken = await service.getMemberCardToken('patrick');
        return json(200, { ...view, cardQrDataUrl: await toQrDataUrl(cardToken, { margin: 1, width: 280 }) });
      }
      if (request.method === 'POST' && pathname === '/api/staff/scan') {
        const { cardToken, accessCode, requestId } = await readJson(request);
        return json(200, await service.recordMemberScan({ cardToken, accessCode, requestId }));
      }
      if (request.method === 'POST' && pathname === '/api/staff/credits') {
        const { memberId, accessCode, requestId } = await readJson(request);
        return json(200, await service.recordQualifyingDrink({ memberId, accessCode, requestId }));
      }
      if (request.method === 'POST' && pathname === '/api/staff/adjustments') {
        const { memberId, accessCode, requestId, amount, reason } = await readJson(request);
        return json(200, await service.recordCreditAdjustment({ memberId, accessCode, requestId, amount, reason }));
      }
      if (request.method === 'POST' && pathname === '/api/rewards/reveal') {
        const { rewardId } = await readJson(request);
        const reward = await service.revealReward({ memberId: 'patrick', rewardId });
        return json(200, { ...reward, qrDataUrl: await toQrDataUrl(reward.token, { margin: 1, width: 240 }) });
      }
      if (request.method === 'POST' && pathname === '/api/staff/redemptions/preview') {
        const { accessCode, token } = await readJson(request);
        return json(200, await service.previewRedemption({ accessCode, token }));
      }
      if (request.method === 'POST' && pathname === '/api/staff/redemptions') {
        const { accessCode, token, requestId } = await readJson(request);
        return json(200, await service.redeemReward({ accessCode, token, requestId }));
      }
      if (request.method === 'POST' && pathname === '/api/staff/redemption-corrections') {
        const { rewardId, accessCode, requestId, reason } = await readJson(request);
        return json(200, await service.correctRedemption({ rewardId, accessCode, requestId, reason }));
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return json(errorStatus(error), { error: error.message });
    }
  };
}

export default { fetch: createWorkerHandler() };
