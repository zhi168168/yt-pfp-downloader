export const plans = Object.freeze({
  free: { name: 'Free', amount: '0.00', dailyLimit: 1 },
  starter: { name: 'Starter', amount: '3.88', dailyLimit: 100 },
  pro: { name: 'Pro', amount: '9.88', dailyLimit: 1000 },
});
export function utcDay(now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  return { day, resetsAt: new Date(Date.parse(day) + 86400000).toISOString() };
}
