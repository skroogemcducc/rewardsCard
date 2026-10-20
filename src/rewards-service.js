import { DatabaseSync } from 'node:sqlite';

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

export function createRewardsService({ database = ':memory:' } = {}) {
  const db = new DatabaseSync(database);
  createSchema(db);
  seedPatrick(db);

  return {
    getMemberView(memberId) {
      const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId);
      if (!member) throw new Error(`Unknown Member: ${memberId}`);

      const drinkCredits = db.prepare(`
        SELECT COUNT(*) AS total
        FROM activity
        WHERE member_id = ? AND type = 'Drink Credit'
      `).get(memberId).total;
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
        lifetimeDrinkCredits: drinkCredits,
        recentActivity
      };
    }
  };
}
