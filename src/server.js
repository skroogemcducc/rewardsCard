import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRewardsService } from './rewards-service.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync('data', { recursive: true });
const service = createRewardsService({ database: process.env.REWARDS_DATABASE_PATH ?? 'data/rewards-card.sqlite' });

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/members/patrick') {
    return sendJson(response, 200, service.getMemberView('patrick'));
  }

  if (request.method === 'POST' && request.url === '/api/staff/credits') {
    try {
      const { memberId, accessCode, requestId } = await readJson(request);
      return sendJson(response, 200, service.recordQualifyingDrink({ memberId, accessCode, requestId }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
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
