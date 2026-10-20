import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRewardsService } from './rewards-service.js';
import QRCode from 'qrcode';

const root = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync('data', { recursive: true });
const service = createRewardsService({ database: process.env.REWARDS_DATABASE_PATH ?? 'data/rewards-card.sqlite' });

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 100_000) throw new Error('Request body is too large');
    body += chunk;
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/members/patrick') {
    const view = service.getMemberView('patrick');
    return sendJson(response, 200, {
      ...view,
      cardQrDataUrl: await QRCode.toDataURL(service.getMemberCardToken('patrick'), { margin: 1, width: 280 })
    });
  }

  if (request.method === 'POST' && request.url === '/api/staff/scan') {
    try {
      const { cardToken, requestId } = await readJson(request);
      return sendJson(response, 200, service.recordMemberScan({ cardToken, requestId }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && request.url === '/api/staff/credits') {
    try {
      const { memberId, accessCode, requestId } = await readJson(request);
      return sendJson(response, 200, service.recordQualifyingDrink({ memberId, accessCode, requestId }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && request.url === '/api/staff/adjustments') {
    try {
      const { memberId, accessCode, requestId, amount, reason } = await readJson(request);
      return sendJson(response, 200, service.recordCreditAdjustment({ memberId, accessCode, requestId, amount, reason }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && request.url === '/api/rewards/reveal') {
    try {
      const { rewardId } = await readJson(request);
      const reward = service.revealReward({ memberId: 'patrick', rewardId });
      return sendJson(response, 200, { ...reward, qrDataUrl: await QRCode.toDataURL(reward.token, { margin: 1, width: 240 }) });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && request.url === '/api/staff/redemptions/preview') {
    try {
      const { accessCode, token } = await readJson(request);
      return sendJson(response, 200, service.previewRedemption({ accessCode, token }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && request.url === '/api/staff/redemptions') {
    try {
      const { accessCode, token, requestId } = await readJson(request);
      return sendJson(response, 200, service.redeemReward({ accessCode, token, requestId }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && request.url === '/api/staff/redemption-corrections') {
    try {
      const { rewardId, accessCode, requestId, reason } = await readJson(request);
      return sendJson(response, 200, service.correctRedemption({ rewardId, accessCode, requestId, reason }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'GET' && (request.url === '/' || request.url === '/staff' || request.url === '/index.html')) {
    const page = await readFile(join(root, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(page);
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Bend & Brew Rewards Card listening at http://localhost:${port}`);
});
