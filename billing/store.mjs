import { plans, utcDay } from './plans.mjs';

// Share SQLite transaction queues across services using the same local database.
const queues = new WeakMap();
export class BillingStore {
  constructor(database, local = false, mode = 'prod') {
    this.database = database; this.local = local; this.mode = mode;
  }
  async query(sql, values = [], database = this.database) {
    if (this.local) return database.prepare(sql.replace(/\$\d+/g, '?')).all(...values);
    return (await database.query(sql, values)).rows;
  }
  async migrate() {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS billing_orders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL,
        mode TEXT NOT NULL, product_id TEXT NOT NULL, provider_id TEXT,
        state TEXT NOT NULL DEFAULT 'pending', checkout_url TEXT,
        session_expires BIGINT NOT NULL DEFAULT 0,
        valid_until BIGINT NOT NULL DEFAULT 0, checked_at BIGINT NOT NULL DEFAULT 0,
        created BIGINT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS billing_orders_user ON billing_orders(user_id, mode)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_provider ON billing_orders(mode, provider_id)`,
      `CREATE TABLE IF NOT EXISTS billing_events (
        id TEXT PRIMARY KEY, mode TEXT NOT NULL, body TEXT NOT NULL,
        processed INTEGER NOT NULL DEFAULT 0, created BIGINT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS channel_usage (
        user_id TEXT NOT NULL, mode TEXT NOT NULL, day TEXT NOT NULL,
        channel_id TEXT NOT NULL, created BIGINT NOT NULL,
        PRIMARY KEY(user_id, mode, day, channel_id))`,
      `CREATE TABLE IF NOT EXISTS billing_account_closures (user_id TEXT PRIMARY KEY, created BIGINT NOT NULL)`,
    ]) {
      if (this.local) this.database.exec(sql); else await this.database.query(sql);
    }
    for (const [name,type] of [['consented_at','BIGINT NOT NULL DEFAULT 0'],['terms_version',"TEXT NOT NULL DEFAULT ''"]]) {
      if (this.local) {
        if (!this.database.prepare('PRAGMA table_info(billing_orders)').all().some(row=>row.name===name)) this.database.exec(`ALTER TABLE billing_orders ADD COLUMN ${name} ${type}`);
      } else await this.database.query(`ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    }
  }
  async transaction(userId, action) {
    if (this.local) {
      const run = (queues.get(this.database) || Promise.resolve()).then(async () => {
        this.database.exec('BEGIN IMMEDIATE');
        try { const result = await action((s, p) => this.query(s, p)); this.database.exec('COMMIT'); return result; }
        catch (error) { this.database.exec('ROLLBACK'); throw error; }
      });
      queues.set(this.database, run.catch(() => {})); return run;
    }
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ytpfp:${this.mode}:${userId}`]);
      const result = await action((s, p) => this.query(s, p, client));
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async status(userId, now = Date.now(), query = (s, p) => this.query(s, p)) {
    const orders = await query('SELECT * FROM billing_orders WHERE user_id=$1 AND mode=$2', [userId, this.mode]);
    const paid = orders.filter(r => ['active','canceling'].includes(r.state) && Number(r.valid_until) > now && plans[r.plan]);
    paid.sort((a,b) => plans[b.plan].dailyLimit - plans[a.plan].dailyLimit);
    const order = paid[0], plan = order?.plan || 'free';
    const { day, resetsAt } = utcDay(now);
    const [usage] = await query('SELECT COUNT(*) AS used FROM channel_usage WHERE user_id=$1 AND mode=$2 AND day=$3', [userId, this.mode, day]);
    const used = Number(usage.used);
    return { plan, dailyLimit: plans[plan].dailyLimit, used, remaining: Math.max(0, plans[plan].dailyLimit-used),
      resetsAt, mode: this.mode, validUntil: Number(order?.valid_until || 0), canceling: order?.state === 'canceling',
      hasSubscription: orders.some(r => r.provider_id && ['active','canceling','past_due'].includes(r.state)) };
  }
  // A successful canonical channel lookup unlocks every size, once per UTC day.
  async claim(userId, channelId, now = Date.now()) {
    if (!userId || !/^UC[\w-]{22}$/.test(channelId)) throw new Error('Invalid channel entitlement');
    return this.transaction(userId, async query => {
      const day = utcDay(now).day;
      const existing = await query('SELECT channel_id FROM channel_usage WHERE user_id=$1 AND mode=$2 AND day=$3 AND channel_id=$4', [userId, this.mode, day, channelId]);
      const status = await this.status(userId, now, query);
      if (existing.length) return { ...status, allowed:true, alreadyUnlocked:true };
      if (!status.remaining) return { ...status, allowed:false, alreadyUnlocked:false };
      await query('INSERT INTO channel_usage(user_id,mode,day,channel_id,created) VALUES($1,$2,$3,$4,$5) RETURNING channel_id', [userId, this.mode, day, channelId, now]);
      return { ...status, used:status.used+1, remaining:status.remaining-1, allowed:true, alreadyUnlocked:false };
    });
  }
}
