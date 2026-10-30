export class TTLCache {
  constructor({ max = 100, ttl = 900_000 } = {}) { this.max = max; this.ttl = ttl; this.map = new Map(); }
  get(key) {
    const item = this.map.get(key);
    if (!item) return;
    if (item.until <= Date.now()) { this.map.delete(key); return; }
    this.map.delete(key); this.map.set(key, item);
    return item.value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, until: Date.now() + this.ttl });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }
}
export class RateLimiter {
  constructor(max = 30, window = 60_000) { this.max = max; this.window = window; this.entries = new Map(); }
  take(key) {
    const now = Date.now();
    let item = this.entries.get(key);
    if (!item || now >= item.until) item = { count: 0, until: now + this.window };
    if (item.count >= this.max) return false;
    if (this.entries.size >= 10_000) for (const [k, v] of this.entries) if (v.until <= now) this.entries.delete(k);
    if (this.entries.size >= 10_000 && !this.entries.has(key)) return false;
    item.count++; this.entries.set(key, item); return true;
  }
}
