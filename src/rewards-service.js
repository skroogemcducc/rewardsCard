import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

const rewardQrLifetimeMs = 5 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      kind TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL REFERENCES members(id),
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      actor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS processed_requests (
      request_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id)
    );
    CREATE TABLE IF NOT EXISTS reward_tokens (
      token_hash TEXT PRIMARY KEY,
      reward_id TEXT NOT NULL REFERENCES rewards(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS redemption_requests (
      request_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      reward_id TEXT NOT NULL REFERENCES rewards(id)
    );
  `);
}

function seedPatrick(database) {
  const member = database.prepare('SELECT id FROM members WHERE id = ?').get('patrick');
  if (member) return;

  database.prepare('INSERT INTO members (id, name) VALUES (?, ?)').run('patrick', 'Patrick Kearns');
  database.prepare('INSERT INTO rewards (id, member_id, kind, status) VALUES (?, ?, ?, ?)')
    .run('welcome-reward', 'patrick', 'Free Drink Reward', 'available');
  database.prepare('INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)')
    .run('patrick', 'Free Drink Reward', 'Welcome gift', 'Staff');
}

export function createRewardsService({ database = ':memory:', staffAccessCode = process.env.STAFF_ACCESS_CODE ?? 'demo-staff-code', additionalMembers = [], now = () => Date.now() } = {}) {
  const db = new DatabaseSync(database);
  createSchema(db);
  seedPatrick(db);
  for (const member of additionalMembers) {
    db.prepare('INSERT OR IGNORE INTO members (id, name) VALUES (?, ?)').run(member.id, member.name);
  }

  function getMemberView(memberId) {
    const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId);
    if (!member) throw new Error(`Unknown Member: ${memberId}`);

    const lifetimeDrinkCredits = db.prepare(`
      SELECT COUNT(*) AS total
      FROM activity
      WHERE member_id = ? AND type = 'Drink Credit'
    `).get(memberId).total;
    const drinkCredits = lifetimeDrinkCredits % 8;
    const availableRewards = db.prepare(`
      SELECT id, kind, status
      FROM rewards
      WHERE member_id = ? AND status = 'available'
      ORDER BY rowid
    `).all(memberId).map(reward => ({ ...reward }));
    const recentActivity = db.prepare(`
      SELECT type, label, actor
      FROM activity
      WHERE member_id = ?
      ORDER BY id DESC
    `).all(memberId).map(activity => ({ ...activity }));

    return {
      member: { id: member.id, name: member.name },
      drinkCredits,
      creditsToNextReward: 8 - drinkCredits,
      availableRewards,
      lifetimeDrinkCredits,
      recentActivity
    };
  }

  function findRewardToken(token) {
    const tokenHash = hashToken(token ?? '');
    return db.prepare(`
      SELECT reward_tokens.token_hash, reward_tokens.reward_id, reward_tokens.member_id,
        reward_tokens.expires_at, reward_tokens.status, rewards.kind, rewards.status AS reward_status,
        members.name AS member_name
      FROM reward_tokens
      JOIN rewards ON rewards.id = reward_tokens.reward_id
      JOIN members ON members.id = reward_tokens.member_id
      WHERE reward_tokens.token_hash = ?
    `).get(tokenHash);
  }

  function assertRedeemableToken(token) {
    const tokenRecord = findRewardToken(token);
    if (!tokenRecord) throw new Error('Invalid Reward QR');
    if (tokenRecord.expires_at <= now()) {
      if (tokenRecord.status === 'active') {
        db.prepare('UPDATE reward_tokens SET status = ? WHERE token_hash = ?').run('expired', tokenRecord.token_hash);
      }
      throw new Error('Reward QR has expired');
    }
    if (tokenRecord.status !== 'active' || tokenRecord.reward_status !== 'available') throw new Error('Reward QR has already been used');
    return tokenRecord;
  }

  return {
    getMemberView,

    recordQualifyingDrink({ memberId, accessCode, requestId, drinkCount = 1 }) {
      if (accessCode !== staffAccessCode) throw new Error('Invalid Staff Access Code');
      if (!requestId) throw new Error('A request ID is required');
      if (!Number.isInteger(drinkCount) || drinkCount < 1) throw new Error('Drink count must be a positive integer');
      getMemberView(memberId);
      const existingRequest = db.prepare('SELECT member_id FROM processed_requests WHERE request_id = ?').get(requestId);
      if (existingRequest) {
        if (existingRequest.member_id !== memberId) throw new Error('Request ID already belongs to another Member');
        return getMemberView(memberId);
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const request = db.prepare('INSERT OR IGNORE INTO processed_requests (request_id, member_id) VALUES (?, ?)')
          .run(requestId, memberId);
        if (request.changes === 0) {
          const existingRequest = db.prepare('SELECT member_id FROM processed_requests WHERE request_id = ?').get(requestId);
          db.exec('ROLLBACK');
          if (existingRequest.member_id !== memberId) throw new Error('Request ID already belongs to another Member');
          return getMemberView(memberId);
        }

        let lifetimeDrinkCredits = db.prepare(`
          SELECT COUNT(*) AS total
          FROM activity
          WHERE member_id = ? AND type = 'Drink Credit'
        `).get(memberId).total;
        for (let drink = 0; drink < drinkCount; drink += 1) {
          db.prepare('INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)')
            .run(memberId, 'Drink Credit', 'Paid drink', 'Staff');
          lifetimeDrinkCredits += 1;
          if (lifetimeDrinkCredits % 8 === 0) {
            const rewardId = `earned-reward-${memberId}-${requestId}-${drink}`;
            db.prepare('INSERT INTO rewards (id, member_id, kind, status) VALUES (?, ?, ?, ?)')
              .run(rewardId, memberId, 'Free Drink Reward', 'available');
            db.prepare('INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)')
              .run(memberId, 'Free Drink Reward', 'Earned free drink reward', 'Staff');
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* The transaction may already have rolled back. */ }
        throw error;
      }
      return getMemberView(memberId);
    },

    revealReward({ memberId, rewardId }) {
      getMemberView(memberId);
      const reward = db.prepare('SELECT id, kind, status FROM rewards WHERE id = ? AND member_id = ?').get(rewardId, memberId);
      if (!reward || reward.status !== 'available') throw new Error('Free Drink Reward is not available');

      const token = randomBytes(24).toString('base64url');
      const expiresAt = now() + rewardQrLifetimeMs;
      db.prepare('UPDATE reward_tokens SET status = ? WHERE reward_id = ? AND status = ?')
        .run('revoked', rewardId, 'active');
      db.prepare(`
        INSERT INTO reward_tokens (token_hash, reward_id, member_id, expires_at, status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(hashToken(token), rewardId, memberId, expiresAt);
      return { rewardId, token, expiresAt };
    },

    previewRedemption({ accessCode, token }) {
      if (accessCode !== staffAccessCode) throw new Error('Invalid Staff Access Code');
      const tokenRecord = assertRedeemableToken(token);
      return {
        member: { id: tokenRecord.member_id, name: tokenRecord.member_name },
        reward: { id: tokenRecord.reward_id, kind: tokenRecord.kind },
        expiresAt: tokenRecord.expires_at
      };
    },

    redeemReward({ accessCode, token, requestId }) {
      if (accessCode !== staffAccessCode) throw new Error('Invalid Staff Access Code');
      if (!requestId) throw new Error('A request ID is required');
      const tokenRecord = findRewardToken(token);
      if (!tokenRecord) throw new Error('Invalid Reward QR');

      const existingRequest = db.prepare('SELECT member_id, reward_id FROM redemption_requests WHERE request_id = ?').get(requestId);
      if (existingRequest) {
        if (existingRequest.member_id !== tokenRecord.member_id || existingRequest.reward_id !== tokenRecord.reward_id) {
          throw new Error('Request ID already belongs to another Redemption');
        }
        return getMemberView(tokenRecord.member_id);
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const request = db.prepare(`
          INSERT OR IGNORE INTO redemption_requests (request_id, member_id, reward_id)
          VALUES (?, ?, ?)
        `).run(requestId, tokenRecord.member_id, tokenRecord.reward_id);
        if (request.changes === 0) {
          const storedRequest = db.prepare('SELECT member_id, reward_id FROM redemption_requests WHERE request_id = ?').get(requestId);
          db.exec('ROLLBACK');
          if (storedRequest.member_id !== tokenRecord.member_id || storedRequest.reward_id !== tokenRecord.reward_id) {
            throw new Error('Request ID already belongs to another Redemption');
          }
          return getMemberView(tokenRecord.member_id);
        }

        const currentToken = assertRedeemableToken(token);
        db.prepare('UPDATE rewards SET status = ? WHERE id = ? AND status = ?')
          .run('redeemed', currentToken.reward_id, 'available');
        db.prepare('UPDATE reward_tokens SET status = ?, consumed_at = ? WHERE token_hash = ?')
          .run('consumed', now(), currentToken.token_hash);
        db.prepare('INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)')
          .run(currentToken.member_id, 'Redemption', 'Redeemed free drink', 'Staff');
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* The transaction may already have rolled back. */ }
        throw error;
      }
      return getMemberView(tokenRecord.member_id);
    }
  };
}
