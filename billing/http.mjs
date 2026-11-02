import express from 'express';
import { createHash } from 'node:crypto';
import { fromNodeHeaders } from 'better-auth/node';

export function mountBilling(app, accounts, settings, billing) {
  app.use('/api/billing',(req,res,next) => {
    res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow');
    if (req.path !== '/webhook' && req.headers.origin && req.headers.origin !== settings.origin) return res.status(403).json({error:'Origin is not allowed'});
    next();
  });
  app.post('/api/billing/webhook',express.raw({type:'application/json',limit:'256kb'}),async (req,res) => {
    if (!billing.config) return res.status(503).send('Payments unavailable');
    let event, raw;
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('Raw body required');
      raw = req.body.toString('utf8');
      event = billing.client.webhooks.verify(raw,req.headers['x-waffo-signature'] || '',{environment:billing.config.environment});
      if (event.mode !== billing.config.environment || event.storeId !== billing.config.storeId) throw new Error('Wrong scope');
    } catch { return res.status(401).send('Invalid signature or scope'); }
    try {
      const id = createHash('sha256').update(raw).digest('hex');
      await billing.store.query('INSERT INTO billing_events(id,mode,body,created) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id',[id,event.mode,raw,Date.now()]);
      // Persist first, then process before acknowledging. Failed events stay in
      // the inbox and can be retried by Waffo or the account status endpoint.
      await billing.processEvents();
      res.status(200).send('OK');
    } catch { res.status(503).send('Retry later'); }
  });
  app.use('/api/billing',express.json({limit:'8kb'}),async (req,res,next) => {
    try {
      const session = await accounts.auth.api.getSession({headers:fromNodeHeaders(req.headers)});
      if (!session?.user?.id) return res.status(401).json({error:'Sign in to continue',code:'SIGN_IN_REQUIRED'});
      if (req.method !== 'GET' && req.headers.origin !== settings.origin) return res.status(403).json({error:'Origin is required'});
      req.billingUser = session.user; next();
    } catch { res.status(503).json({error:'Account service is unavailable'}); }
  });
  app.get('/api/billing/status',async (req,res,next) => {
    try { res.json(await billing.status(req.billingUser.id)); } catch(error) { next(error); }
  });
  app.post('/api/billing/checkout',async (req,res,next) => {
    if (!['starter','pro'].includes(req.body?.plan) || req.body?.consent !== true) return res.status(400).json({error:'Choose a plan and accept its monthly renewal terms.'});
    if (!billing.config) return res.status(503).json({error:'Payments are not available yet.'});
    try { res.json(await billing.checkout(req.billingUser,req.body.plan)); } catch(error) { next(error); }
  });
  app.post('/api/billing/reconcile',async (req,res,next) => {
    if (!/^[a-f0-9]{32}$/.test(req.body?.orderId || '')) return res.status(400).json({error:'Invalid order'});
    try {
      const [row] = await billing.store.query('SELECT * FROM billing_orders WHERE id=$1 AND user_id=$2 AND mode=$3',[req.body.orderId,req.billingUser.id,billing.store.mode]);
      if (!row) return res.status(404).json({error:'Order not found'});
      await billing.reconcile(row); res.json(await billing.status(req.billingUser.id));
    } catch(error) { next(error); }
  });
  app.post('/api/billing/manage',async (req,res,next) => {
    try { res.set('Referrer-Policy','no-referrer').json(await billing.manage(req.billingUser.id)); } catch(error) { next(error); }
  });
  app.use('/api/billing',(error,req,res,next) => {
    if (res.headersSent) return next(error);
    const known = ['Manage your existing subscription before purchasing another plan.','Another checkout is pending. Complete it or wait for it to expire.'];
    res.status(error.type === 'entity.too.large' ? 413 : known.includes(error.message) ? 409 : 503)
      .json({error:known.includes(error.message) ? error.message : 'Payment service is temporarily unavailable. Retry or refresh your order status; do not create another purchase.'});
  });
}
