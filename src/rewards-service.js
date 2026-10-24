import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@libsql/client';

const rewardQrLifetimeMs = 5 * 60 * 1000;

const schemaStatements = [
  'CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS member_qr_tokens (member_id TEXT PRIMARY KEY REFERENCES members(id), token_value TEXT NOT NULL UNIQUE)',
  'CREATE TABLE IF NOT EXISTS rewards (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), kind TEXT NOT NULL, status TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL REFERENCES members(id),
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    actor TEXT NOT NULL,
    credit_delta INTEGER NOT NULL DEFAULT 0,
    related_reward_id TEXT
  )`,
  'CREATE TABLE IF NOT EXISTS processed_requests (request_id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id))',
  `CREATE TABLE IF NOT EXISTS reward_tokens (
    token_hash TEXT PRIMARY KEY,
    reward_id TEXT NOT NULL REFERENCES rewards(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    consumed_at INTEGER
  )`,
  'CREATE TABLE IF NOT EXISTS redemption_requests (request_id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), reward_id TEXT NOT NULL REFERENCES rewards(id))',
  'CREATE TABLE IF NOT EXISTS adjustment_requests (request_id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), amount INTEGER NOT NULL, reason TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS correction_requests (request_id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), reward_id TEXT NOT NULL REFERENCES rewards(id), reason TEXT NOT NULL)'
];

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function first(database, sql, args = []) {
  return (await database.execute({ sql, args })).rows[0];
}

async function all(database, sql, args = []) {
  return (await database.execute({ sql, args })).rows;
}

async function initializeDatabase(database) {
  await database.batch(schemaStatements, 'write');
  const activityColumns = await all(database, 'PRAGMA table_info(activity)');
  if (!activityColumns.some(column => column.name === 'credit_delta')) {
    await database.execute('ALTER TABLE activity ADD COLUMN credit_delta INTEGER NOT NULL DEFAULT 0');
  }
  if (!activityColumns.some(column => column.name === 'related_reward_id')) {
    await database.execute('ALTER TABLE activity ADD COLUMN related_reward_id TEXT');
  }

  await database.batch([
    { sql: 'INSERT OR IGNORE INTO members (id, name) VALUES (?, ?)', args: ['patrick', 'Patrick Kearns'] },
    { sql: 'INSERT OR IGNORE INTO rewards (id, member_id, kind, status) VALUES (?, ?, ?, ?)', args: ['welcome-reward', 'patrick', 'Free Drink Reward', 'available'] },
    {
      sql: `INSERT INTO activity (member_id, type, label, actor)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (
          SELECT 1 FROM activity WHERE member_id = ? AND type = ? AND label = ?
        )`,
      args: ['patrick', 'Free Drink Reward', 'Welcome gift', 'Staff', 'patrick', 'Free Drink Reward', 'Welcome gift']
    }
  ], 'write');
}

export async function createRewardsService({
  client,
  databaseUrl = process.env.TURSO_DATABASE_URL,
  authToken = process.env.TURSO_AUTH_TOKEN,
  staffAccessCode = process.env.STAFF_ACCESS_CODE,
  additionalMembers = [],
  now = () => Date.now(),
  production = process.env.NODE_ENV === 'production'
} = {}) {
  if (production && !client && !databaseUrl) throw new Error('TURSO_DATABASE_URL is required in production');
  if (production && !client && !authToken) throw new Error('TURSO_AUTH_TOKEN is required in production');
  if (production && !staffAccessCode) throw new Error('STAFF_ACCESS_CODE is required in production');
  const resolvedDatabaseUrl = databaseUrl ?? 'file::memory:';
  const resolvedStaffAccessCode = staffAccessCode ?? 'demo-staff-code';
  const db = client ?? createClient({ url: resolvedDatabaseUrl, authToken });
  await initializeDatabase(db);

  for (const member of additionalMembers) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO members (id, name) VALUES (?, ?)', args: [member.id, member.name] });
  }
  const members = await all(db, 'SELECT id FROM members');
  for (const member of members) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO member_qr_tokens (member_id, token_value) VALUES (?, ?)',
      args: [member.id, randomBytes(24).toString('base64url')]
    });
  }

  async function getLifetimeDrinkCredits(memberId, database = db) {
    const row = await first(database, `
      SELECT COALESCE(SUM(CASE WHEN type = 'Drink Credit' THEN 1 ELSE credit_delta END), 0) AS total
      FROM activity
      WHERE member_id = ? AND type IN ('Drink Credit', 'Credit Adjustment')
    `, [memberId]);
    return Number(row.total);
  }

  async function getMemberView(memberId, database = db) {
    const member = await first(database, 'SELECT id, name FROM members WHERE id = ?', [memberId]);
    if (!member) throw new Error(`Unknown Member: ${memberId}`);
    const [lifetimeDrinkCredits, availableRewards, redeemedRewards, recentActivity] = await Promise.all([
      getLifetimeDrinkCredits(memberId, database),
      all(database, `SELECT id, kind, status FROM rewards WHERE member_id = ? AND status = 'available' ORDER BY rowid`, [memberId]),
      all(database, `SELECT id, kind, status FROM rewards WHERE member_id = ? AND status = 'redeemed' ORDER BY rowid DESC`, [memberId]),
      all(database, 'SELECT type, label, actor FROM activity WHERE member_id = ? ORDER BY id DESC', [memberId])
    ]);
    const drinkCredits = lifetimeDrinkCredits % 8;
    return {
      member: { id: member.id, name: member.name },
      drinkCredits,
      creditsToNextReward: 8 - drinkCredits,
      availableRewards: availableRewards.map(reward => ({ ...reward })),
      redeemedRewards: redeemedRewards.map(reward => ({ ...reward })),
      lifetimeDrinkCredits,
      recentActivity: recentActivity.map(activity => ({ ...activity }))
    };
  }

  function validateReason(reason) {
    const cleanReason = String(reason ?? '').trim();
    if (!cleanReason) throw new Error('A correction reason is required');
    return cleanReason;
  }

  async function findRewardToken(token, database = db) {
    return first(database, `
      SELECT reward_tokens.token_hash, reward_tokens.reward_id, reward_tokens.member_id,
        reward_tokens.expires_at, reward_tokens.status, rewards.kind, rewards.status AS reward_status,
        members.name AS member_name
      FROM reward_tokens
      JOIN rewards ON rewards.id = reward_tokens.reward_id
      JOIN members ON members.id = reward_tokens.member_id
      WHERE reward_tokens.token_hash = ?
    `, [hashToken(token ?? '')]);
  }

  async function assertRedeemableToken(token, database = db) {
    const tokenRecord = await findRewardToken(token, database);
    if (!tokenRecord) throw new Error('Invalid Reward QR');
    if (Number(tokenRecord.expires_at) <= now()) {
      if (tokenRecord.status === 'active') {
        await database.execute({ sql: 'UPDATE reward_tokens SET status = ? WHERE token_hash = ?', args: ['expired', tokenRecord.token_hash] });
      }
      throw new Error('Reward QR has expired');
    }
    if (tokenRecord.status !== 'active' || tokenRecord.reward_status !== 'available') throw new Error('Reward QR has already been used');
    return tokenRecord;
  }

  async function withWriteTransaction(work) {
    const transaction = await db.transaction('write');
    try {
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      try { await transaction.rollback(); } catch { /* The transaction may already be closed. */ }
      throw error;
    }
  }

  const api = {
    getMemberView,

    async getMemberCardToken(memberId) {
      await getMemberView(memberId);
      return (await first(db, 'SELECT token_value FROM member_qr_tokens WHERE member_id = ?', [memberId])).token_value;
    },

    async recordMemberScan({ cardToken, accessCode, requestId }) {
      const member = await first(db, 'SELECT member_id FROM member_qr_tokens WHERE token_value = ?', [cardToken]);
      if (!member) throw new Error('Invalid Rewards Card QR');
      return api.recordQualifyingDrink({ memberId: member.member_id, accessCode, requestId });
    },

    async recordQualifyingDrink({ memberId, accessCode, requestId, drinkCount = 1 }) {
      if (accessCode !== resolvedStaffAccessCode) throw new Error('Invalid Staff Access Code');
      if (!requestId) throw new Error('A request ID is required');
      if (!Number.isInteger(drinkCount) || drinkCount < 1) throw new Error('Drink count must be a positive integer');
      await getMemberView(memberId);
      return withWriteTransaction(async transaction => {
        const request = await transaction.execute({ sql: 'INSERT OR IGNORE INTO processed_requests (request_id, member_id) VALUES (?, ?)', args: [requestId, memberId] });
        if (request.rowsAffected === 0) {
          const existingRequest = await first(transaction, 'SELECT member_id FROM processed_requests WHERE request_id = ?', [requestId]);
          if (existingRequest.member_id !== memberId) throw new Error('Request ID already belongs to another Member');
          return getMemberView(memberId, transaction);
        }
        let lifetimeDrinkCredits = await getLifetimeDrinkCredits(memberId, transaction);
        for (let drink = 0; drink < drinkCount; drink += 1) {
          await transaction.execute({ sql: 'INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)', args: [memberId, 'Drink Credit', 'Paid drink', 'Staff'] });
          lifetimeDrinkCredits += 1;
          if (lifetimeDrinkCredits % 8 === 0) {
            const rewardId = `earned-reward-${memberId}-${requestId}-${drink}`;
            await transaction.batch([
              { sql: 'INSERT INTO rewards (id, member_id, kind, status) VALUES (?, ?, ?, ?)', args: [rewardId, memberId, 'Free Drink Reward', 'available'] },
              { sql: 'INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)', args: [memberId, 'Free Drink Reward', 'Earned free drink reward', 'Staff'] }
            ]);
          }
        }
        return getMemberView(memberId, transaction);
      });
    },

    async revealReward({ memberId, rewardId }) {
      await getMemberView(memberId);
      const reward = await first(db, 'SELECT id, kind, status FROM rewards WHERE id = ? AND member_id = ?', [rewardId, memberId]);
      if (!reward || reward.status !== 'available') throw new Error('Free Drink Reward is not available');
      const token = randomBytes(24).toString('base64url');
      const expiresAt = now() + rewardQrLifetimeMs;
      await db.batch([
        { sql: 'UPDATE reward_tokens SET status = ? WHERE reward_id = ? AND status = ?', args: ['revoked', rewardId, 'active'] },
        { sql: `INSERT INTO reward_tokens (token_hash, reward_id, member_id, expires_at, status) VALUES (?, ?, ?, ?, 'active')`, args: [hashToken(token), rewardId, memberId, expiresAt] }
      ], 'write');
      return { rewardId, token, expiresAt };
    },

    async previewRedemption({ accessCode, token }) {
      if (accessCode !== resolvedStaffAccessCode) throw new Error('Invalid Staff Access Code');
      const tokenRecord = await assertRedeemableToken(token);
      return {
        member: { id: tokenRecord.member_id, name: tokenRecord.member_name },
        reward: { id: tokenRecord.reward_id, kind: tokenRecord.kind },
        expiresAt: Number(tokenRecord.expires_at)
      };
    },

    async redeemReward({ accessCode, token, requestId }) {
      if (accessCode !== resolvedStaffAccessCode) throw new Error('Invalid Staff Access Code');
      if (!requestId) throw new Error('A request ID is required');
      const tokenRecord = await findRewardToken(token);
      if (!tokenRecord) throw new Error('Invalid Reward QR');
      return withWriteTransaction(async transaction => {
        const request = await transaction.execute({ sql: 'INSERT OR IGNORE INTO redemption_requests (request_id, member_id, reward_id) VALUES (?, ?, ?)', args: [requestId, tokenRecord.member_id, tokenRecord.reward_id] });
        if (request.rowsAffected === 0) {
          const existingRequest = await first(transaction, 'SELECT member_id, reward_id FROM redemption_requests WHERE request_id = ?', [requestId]);
          if (existingRequest.member_id !== tokenRecord.member_id || existingRequest.reward_id !== tokenRecord.reward_id) throw new Error('Request ID already belongs to another Redemption');
          return getMemberView(tokenRecord.member_id, transaction);
        }
        const currentToken = await assertRedeemableToken(token, transaction);
        const rewardUpdate = await transaction.execute({ sql: 'UPDATE rewards SET status = ? WHERE id = ? AND status = ?', args: ['redeemed', currentToken.reward_id, 'available'] });
        if (rewardUpdate.rowsAffected !== 1) throw new Error('Reward QR has already been used');
        await transaction.batch([
          { sql: 'UPDATE reward_tokens SET status = ?, consumed_at = ? WHERE token_hash = ?', args: ['consumed', now(), currentToken.token_hash] },
          { sql: 'INSERT INTO activity (member_id, type, label, actor, related_reward_id) VALUES (?, ?, ?, ?, ?)', args: [currentToken.member_id, 'Redemption', 'Redeemed free drink', 'Staff', currentToken.reward_id] }
        ]);
        return getMemberView(tokenRecord.member_id, transaction);
      });
    },

    async recordCreditAdjustment({ memberId, accessCode, requestId, amount, reason }) {
      if (accessCode !== resolvedStaffAccessCode) throw new Error('Invalid Staff Access Code');
      if (!requestId) throw new Error('A request ID is required');
      if (!Number.isInteger(amount) || amount === 0) throw new Error('Adjustment amount must be a non-zero integer');
      const cleanReason = validateReason(reason);
      await getMemberView(memberId);
      return withWriteTransaction(async transaction => {
        const request = await transaction.execute({ sql: 'INSERT OR IGNORE INTO adjustment_requests (request_id, member_id, amount, reason) VALUES (?, ?, ?, ?)', args: [requestId, memberId, amount, cleanReason] });
        if (request.rowsAffected === 0) {
          const existingRequest = await first(transaction, 'SELECT member_id, amount, reason FROM adjustment_requests WHERE request_id = ?', [requestId]);
          if (existingRequest.member_id !== memberId) throw new Error('Request ID already belongs to another Member');
          if (Number(existingRequest.amount) !== amount || existingRequest.reason !== cleanReason) throw new Error('Request ID already belongs to another Credit Adjustment');
          return getMemberView(memberId, transaction);
        }
        const before = await getLifetimeDrinkCredits(memberId, transaction);
        if (before + amount < 0) throw new Error('Credit balance cannot be negative');
        await transaction.execute({ sql: 'INSERT INTO activity (member_id, type, label, actor, credit_delta) VALUES (?, ?, ?, ?, ?)', args: [memberId, 'Credit Adjustment', `Credit adjustment (${amount > 0 ? '+' : ''}${amount}): ${cleanReason}`, 'Staff', amount] });
        for (let credit = before + 1; credit <= before + amount; credit += 1) {
          if (credit % 8 === 0) {
            const rewardId = `adjusted-reward-${memberId}-${requestId}-${credit}`;
            await transaction.batch([
              { sql: 'INSERT INTO rewards (id, member_id, kind, status) VALUES (?, ?, ?, ?)', args: [rewardId, memberId, 'Free Drink Reward', 'available'] },
              { sql: 'INSERT INTO activity (member_id, type, label, actor) VALUES (?, ?, ?, ?)', args: [memberId, 'Free Drink Reward', 'Earned free drink reward from adjustment', 'Staff'] }
            ]);
          }
        }
        return getMemberView(memberId, transaction);
      });
    },

    async correctRedemption({ accessCode, rewardId, requestId, reason }) {
      if (accessCode !== resolvedStaffAccessCode) throw new Error('Invalid Staff Access Code');
      if (!requestId) throw new Error('A request ID is required');
      const cleanReason = validateReason(reason);
      const reward = await first(db, 'SELECT id, member_id, status FROM rewards WHERE id = ?', [rewardId]);
      if (!reward) throw new Error('Unknown reward');
      return withWriteTransaction(async transaction => {
        const request = await transaction.execute({ sql: 'INSERT OR IGNORE INTO correction_requests (request_id, member_id, reward_id, reason) VALUES (?, ?, ?, ?)', args: [requestId, reward.member_id, rewardId, cleanReason] });
        if (request.rowsAffected === 0) {
          const existingRequest = await first(transaction, 'SELECT member_id, reward_id, reason FROM correction_requests WHERE request_id = ?', [requestId]);
          if (existingRequest.member_id !== reward.member_id || existingRequest.reward_id !== rewardId || existingRequest.reason !== cleanReason) throw new Error('Request ID already belongs to another Redemption correction');
          return getMemberView(reward.member_id, transaction);
        }
        if (reward.status !== 'redeemed') throw new Error('Redemption is not available for correction');
        const redemption = await first(transaction, `SELECT id FROM activity WHERE member_id = ? AND type = 'Redemption' AND related_reward_id = ? ORDER BY id DESC LIMIT 1`, [reward.member_id, rewardId]);
        if (!redemption) throw new Error('Original Redemption was not found');
        const restored = await transaction.execute({ sql: 'UPDATE rewards SET status = ? WHERE id = ? AND status = ?', args: ['available', rewardId, 'redeemed'] });
        if (restored.rowsAffected !== 1) throw new Error('Redemption is no longer available for correction');
        await transaction.execute({ sql: 'INSERT INTO activity (member_id, type, label, actor, related_reward_id) VALUES (?, ?, ?, ?, ?)', args: [reward.member_id, 'Redemption Correction', `Redemption correction: ${cleanReason}`, 'Staff', rewardId] });
        return getMemberView(reward.member_id, transaction);
      });
    },

    close() {
      db.close();
    }
  };
  return api;
}
