import { randomUUID } from 'node:crypto';
import { WaffoPancake } from '@waffo/pancake-ts';
import { billingConfig } from './config.mjs';
import { plans } from './plans.mjs';

export function checkoutURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
    !(url.hostname === 'waffo.ai' || url.hostname.endsWith('.waffo.ai'))) throw new Error('Invalid payment URL');
  return url.href;
}
export function subscriptionUntil(order, plan, now = Date.now()) {
  const start = Date.parse(order.currentPeriodStart), end = Date.parse(order.currentPeriodEnd);
  if (!['starter','pro'].includes(plan) || !['active','canceling'].includes(order.status) ||
    order.billingPeriod !== 'monthly' || order.isInTrial !== false || !(start <= now && end > now) ||
    !Number.isInteger(order.currentPeriodNumber) || order.currentPeriodNumber < 1) return 0;
  // The verified product fixes the base price; gross payment can include sales tax.
  return order.payments?.some(p => p.periodNumber === order.currentPeriodNumber &&
    p.status === 'succeeded' && p.isFullyRefunded === false && ['none','failed'].includes(p.refundStatus) &&
    p.amount?.currency === 'USD' && Number.isFinite(Number(p.amount.display)) &&
    Math.round(Number(p.amount.display)*100) >= Math.round(Number(plans[plan].amount)*100)) ? end : 0;
}
export const orderQuery = `query($storeId:String!, $ref:String!) { subscriptionOrders(storeId:$storeId, filter:{orderMerchantExternalId:{eq:$ref}},limit:2) {
  id storeId status currency testMode merchantProvidedBuyerIdentity orderMerchantExternalId
  productVersion {productId} billingPeriod isInTrial currentPeriodStart currentPeriodEnd currentPeriodNumber
  payments {id status periodNumber refundStatus isFullyRefunded amount {display currency}}
} }`;

export function createBilling(store, settings, env = process.env, options = {}) {
  const config = billingConfig(env, settings.local);
  if (config && config.environment !== store.mode) throw new Error('Payment storage environment mismatch');
  const client = config ? (options.client || new WaffoPancake(config)) : null;
  let catalog;
  const refreshing = new Map();
  const service = {
    store, config, client,
    async catalog() {
      if (!config) throw new Error('Payments are not configured');
      if (!catalog) catalog = (async () => {
        const result = await client.graphql.query({query:`query($storeId:String!) { store(id:$storeId) { id prodEnabled subscriptionProducts {id status billingPeriod prices {currency priceInfo {amount}}} } }`, variables:{storeId:config.storeId}});
        const remote = result.data?.store;
        if (result.errors?.length || !remote || remote.id !== config.storeId || (config.environment === 'prod' && !remote.prodEnabled)) throw new Error('Payment catalog unavailable');
        for (const plan of ['starter','pro']) {
          const p = remote.subscriptionProducts?.find(p => p.id === config.products[plan]);
          if (!p || p.status !== 'active' || p.billingPeriod !== 'monthly' ||
            !p.prices.some(p => p.currency === 'USD' && Number(p.priceInfo?.amount) === Number(plans[plan].amount))) throw new Error('Payment product does not match this plan');
        }
      })().catch(error => { catalog = undefined; throw error; });
      return catalog;
    },
    async reconcile(row) {
      if (!config || row.mode !== config.environment || !['starter','pro'].includes(row.plan) || row.product_id !== config.products[row.plan]) throw new Error('Payment configuration mismatch');
      await service.catalog();
      return store.transaction(row.user_id, async query => {
        const response = await client.graphql.query({query:orderQuery,variables:{storeId:config.storeId,ref:row.id}});
        const rows = response.data?.subscriptionOrders;
        if (response.errors?.length || !Array.isArray(rows)) throw new Error('Payment query failed');
        if (!rows.length) {
          await query('UPDATE billing_orders SET checked_at=$1 WHERE id=$2 RETURNING id',[Date.now(),row.id]);
          return;
        }
        if (rows.length !== 1) throw new Error('Ambiguous payment reference');
        const order = rows[0];
        if (order.storeId !== config.storeId || order.testMode !== (config.environment === 'test') ||
          order.merchantProvidedBuyerIdentity !== row.user_id || order.orderMerchantExternalId !== row.id ||
          order.productVersion?.productId !== row.product_id || order.currency !== 'USD') throw new Error('Payment identity mismatch');
        await query('UPDATE billing_orders SET provider_id=$1,state=$2,valid_until=$3,checked_at=$4 WHERE id=$5 RETURNING id',
          [order.id,order.status,subscriptionUntil(order,row.plan),Date.now(),row.id]);
      });
    },
    async refresh(userId, force = false) {
      if (!config) return;
      if (!force && refreshing.has(userId)) return refreshing.get(userId);
      const work = (async () => {
      const rows = await store.query("SELECT * FROM billing_orders WHERE user_id=$1 AND mode=$2 AND state IN ('pending','active','canceling','past_due') ORDER BY created", [userId,store.mode]);
      for (const row of rows) if (force || Number(row.checked_at) < Date.now()-60000 || (Number(row.valid_until) > 0 && Number(row.valid_until) <= Date.now())) await service.reconcile(row);
      })();
      if (force) return work;
      refreshing.set(userId,work);
      try { return await work; } finally { if (refreshing.get(userId) === work) refreshing.delete(userId); }
    },
    async status(userId) {
      if (config) { await service.processEvents(); await service.refresh(userId); }
      return { ...await store.status(userId), paymentsAvailable:Boolean(config) };
    },
    async claim(userId, channelId) {
      await service.refresh(userId);
      return store.claim(userId,channelId);
    },
    async checkout(user, plan) {
      if (!['starter','pro'].includes(plan)) throw new Error('Invalid plan');
      await service.catalog(); await service.refresh(user.id,true);
      const pending = await store.transaction(user.id, async query => {
        if ((await query('SELECT user_id FROM billing_account_closures WHERE user_id=$1',[user.id])).length) throw new Error('Account deletion is in progress');
        const rows = await query('SELECT * FROM billing_orders WHERE user_id=$1 AND mode=$2 ORDER BY created DESC', [user.id,store.mode]);
        if (rows.some(r => (r.provider_id && ['active','canceling','past_due'].includes(r.state)) || Number(r.valid_until) > Date.now()))
          throw new Error('Manage your existing subscription before purchasing another plan.');
        if (rows.some(r => r.plan !== plan && r.state === 'pending' && (Number(r.session_expires) > Date.now() || (!r.checkout_url && Number(r.created) > Date.now()-86400000))))
          throw new Error('Another checkout is pending. Complete it or wait for it to expire.');
        let row = rows.find(r => r.plan === plan && r.product_id === config.products[plan] && r.state === 'pending' &&
          (Number(r.session_expires) > Date.now() || (!r.checkout_url && Number(r.created) > Date.now()-86400000)));
        if (row?.checkout_url) return {url:checkoutURL(row.checkout_url),orderId:row.id};
        if (!row) {
          row = {id:randomUUID().replaceAll('-','')};
          await query('INSERT INTO billing_orders(id,user_id,plan,mode,product_id,created,consented_at,terms_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [row.id,user.id,plan,store.mode,config.products[plan],Date.now(),Date.now(),'2026-11-02']);
        }
        return {orderId:row.id};
      });
      if (pending.url) return pending;
      return store.transaction(user.id, async query => {
        if ((await query('SELECT user_id FROM billing_account_closures WHERE user_id=$1',[user.id])).length) throw new Error('Account deletion is in progress');
        const [row] = await query('SELECT * FROM billing_orders WHERE id=$1 AND user_id=$2 AND mode=$3',[pending.orderId,user.id,store.mode]);
        if (!row || row.state !== 'pending') throw new Error('Checkout state changed');
        if (row.checkout_url && Number(row.session_expires) > Date.now()) return {url:checkoutURL(row.checkout_url),orderId:row.id};
        // This row was committed before contacting Waffo. A timeout or rollback
        // below retains its idempotency key, even across cold starts and retries.
        const result = await client.checkout.authenticated.create({productId:config.products[plan],currency:'USD',buyerIdentity:user.id,
          buyerEmail:user.email,withTrial:false,orderMerchantExternalId:row.id,metadata:{app:'ytpfp',plan,internalOrderId:row.id},
          successUrl:`${settings.origin}/pricing.html?payment=${row.id}`,expiresInSeconds:3600},
          {idempotencyKey:`${config.merchantId}-ytpfp-${row.id}`});
        const url = checkoutURL(result.checkoutUrl), expires = Date.parse(result.expiresAt);
        if (!(expires > Date.now())) throw new Error('Checkout expired');
        await query('UPDATE billing_orders SET checkout_url=$1,session_expires=$2 WHERE id=$3 RETURNING id', [url,expires,row.id]);
        return {url,orderId:row.id};
      });
    },
    async processEvents() {
      if (!config) return;
      const events = await store.query('SELECT * FROM billing_events WHERE processed=0 AND mode=$1 ORDER BY created LIMIT 30', [store.mode]);
      for (const saved of events) {
        const event = JSON.parse(saved.body), ref = event.data?.orderMerchantExternalId || event.data?.orderMetadata?.internalOrderId || '';
        const rows = await store.query('SELECT * FROM billing_orders WHERE mode=$1 AND (id=$2 OR provider_id=$3)',[store.mode,ref,event.data?.orderId || '']);
        for (const row of rows) await service.reconcile(row);
        await store.query('UPDATE billing_events SET processed=1 WHERE id=$1 RETURNING id',[saved.id]);
      }
    },
    async manage(userId) {
      if (!config) throw new Error('Payments unavailable');
      const result = await client.auth.createCustomerPortalLink({storeId:config.storeId,buyerIdentity:userId});
      return {url:checkoutURL(result.portalUrl)};
    },
  };
  return service;
}
