import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRewardsService } from './rewards-service.js';
import { toQrDataUrl } from './qr-code.js';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));

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

function errorStatus(error) {
  return error.message === 'Invalid Staff Access Code' ? 401 : 400;
}

export async function createRewardsServer(options = {}) {
  const service = await createRewardsService(options);
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        await service.getMemberView('patrick');
        return sendJson(response, 200, { status: 'ok' });
      }

      if (request.method === 'GET' && request.url === '/api/members/patrick') {
        const view = await service.getMemberView('patrick');
        const cardToken = await service.getMemberCardToken('patrick');
        return sendJson(response, 200, {
          ...view,
          cardQrDataUrl: await toQrDataUrl(cardToken, { margin: 1, width: 280 })
        });
      }

      if (request.method === 'POST' && request.url === '/api/staff/scan') {
        const { cardToken, accessCode, requestId } = await readJson(request);
        return sendJson(response, 200, await service.recordMemberScan({ cardToken, accessCode, requestId }));
      }

      if (request.method === 'POST' && request.url === '/api/staff/credits') {
        const { memberId, accessCode, requestId } = await readJson(request);
        return sendJson(response, 200, await service.recordQualifyingDrink({ memberId, accessCode, requestId }));
      }

      if (request.method === 'POST' && request.url === '/api/staff/adjustments') {
        const { memberId, accessCode, requestId, amount, reason } = await readJson(request);
        return sendJson(response, 200, await service.recordCreditAdjustment({ memberId, accessCode, requestId, amount, reason }));
      }

      if (request.method === 'POST' && request.url === '/api/rewards/reveal') {
        const { rewardId } = await readJson(request);
        const reward = await service.revealReward({ memberId: 'patrick', rewardId });
        return sendJson(response, 200, { ...reward, qrDataUrl: await toQrDataUrl(reward.token, { margin: 1, width: 240 }) });
      }

      if (request.method === 'POST' && request.url === '/api/staff/redemptions/preview') {
        const { accessCode, token } = await readJson(request);
        return sendJson(response, 200, await service.previewRedemption({ accessCode, token }));
      }

      if (request.method === 'POST' && request.url === '/api/staff/redemptions') {
        const { accessCode, token, requestId } = await readJson(request);
        return sendJson(response, 200, await service.redeemReward({ accessCode, token, requestId }));
      }

      if (request.method === 'POST' && request.url === '/api/staff/redemption-corrections') {
        const { rewardId, accessCode, requestId, reason } = await readJson(request);
        return sendJson(response, 200, await service.correctRedemption({ rewardId, accessCode, requestId, reason }));
      }

      if (request.method === 'GET' && (request.url === '/' || request.url === '/staff' || request.url === '/index.html')) {
        const page = await readFile(join(publicRoot, 'index.html'));
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return response.end(page);
      }

      if (request.method === 'GET' && request.url === '/member-view.js') {
        const module = await readFile(join(publicRoot, 'member-view.js'));
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        return response.end(module);
      }

      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } catch (error) {
      sendJson(response, errorStatus(error), { error: error.message });
    }
  });

  return { server, service };
}

async function start() {
  const { server } = await createRewardsServer({ production: true });
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    console.log(`Bend & Brew Rewards Card listening at http://localhost:${port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
