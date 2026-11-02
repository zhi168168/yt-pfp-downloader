import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { accountConfig } from './config.mjs';
import { createAccounts } from './auth.mjs';
import { capabilities, mountAccounts } from './http.mjs';
import { BillingStore } from '../billing/store.mjs';
import { createBilling } from '../billing/service.mjs';
import { paymentMode } from '../billing/config.mjs';
import { mountBilling } from '../billing/http.mjs';
import { APIError } from 'better-auth/api';

let runtime;
let billingRuntime;
export async function getBilling() {
  if (!billingRuntime) billingRuntime = (async () => {
    const runtime = await getAccounts();
    if (!runtime) throw new Error('Accounts unavailable');
    const store = new BillingStore(runtime.service.database,runtime.settings.local,paymentMode(process.env,runtime.settings.local));
    if (runtime.settings.local) await store.migrate();
    const billing = createBilling(store,runtime.settings);
    const app = express(); app.disable('x-powered-by');
    mountBilling(app,runtime.service,runtime.settings,billing);
    app.use((req,res) => res.status(404).json({error:'Endpoint not found'}));
    return { billing, app };
  })().catch(error => { billingRuntime=undefined; throw error; });
  return billingRuntime;
}
export async function channelAccess(userId,channelId) {
  return (await getBilling()).billing.claim(userId,channelId);
}
export async function getAccounts() {
  if (!runtime) runtime = (async () => {
    const config = accountConfig(process.env);
    if (!config || (process.env.VERCEL && config.local)) return null;
    const service = await createAccounts(config, {beforeDelete:async user => {
      const {billing} = await getBilling();
      await billing.refresh(user.id,true);
      await billing.store.transaction(user.id,async query => {
      const rows = await query('SELECT * FROM billing_orders WHERE user_id=$1 AND mode=$2',[user.id,billing.store.mode]);
      if (rows.some(row => (row.provider_id && ['active','canceling','past_due'].includes(row.state)) ||
        (row.state === 'pending' && (Number(row.session_expires) > Date.now() || (!row.checkout_url && Number(row.created) > Date.now()-86400000)))))
        throw new APIError('BAD_REQUEST',{message:'Cancel your subscription and wait until its paid period ends, or close any pending checkout, before deleting this account.'});
      await query('INSERT INTO billing_account_closures(user_id,created) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING RETURNING user_id',[user.id,Date.now()]);
      await query('DELETE FROM channel_usage WHERE user_id=$1 RETURNING user_id',[user.id]);
      });
    }});
    try { await service.auth.$context; }
    catch (error) { await service.close(); throw error; }
    const app = express();
    app.disable('x-powered-by');
    mountAccounts(app, config, service, { vercel: Boolean(process.env.VERCEL) });
    app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
    return { service, app, settings:config };
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}

export async function downloadSession(req) {
  const runtime = await getAccounts();
  if (!runtime) throw new Error('Accounts are not configured');
  return runtime.service.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

export default async function accountHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.url.split('?')[0].startsWith('/api/billing/')) return (await getBilling()).app(req,res);
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/auth/config') {
      const config = accountConfig(process.env);
      return res.end(JSON.stringify(capabilities(process.env.VERCEL && config?.local ? null : config)));
    }
    const runtime = await getAccounts();
    if (runtime) return runtime.app(req, res);
  } catch { /* Fail closed without exposing credentials or connection strings. */ }
  res.statusCode = 503;
  res.end(JSON.stringify({ message: 'Account service is temporarily unavailable' }));
}
