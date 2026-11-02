import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync,sign} from 'node:crypto';
import express from 'express';
import {WaffoPancake} from '@waffo/pancake-ts';
import {BillingStore} from '../billing/store.mjs';
import {createBilling,subscriptionUntil,checkoutURL} from '../billing/service.mjs';
import {billingConfig} from '../billing/config.mjs';
import {mountBilling} from '../billing/http.mjs';
import {createApp} from '../server.mjs';
import sharp from 'sharp';

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const env={WAFFO_ENVIRONMENT:'test',WAFFO_MERCHANT_ID:'MER_5EMEWfhBB53tdi21MkTuMM',WAFFO_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),WAFFO_STORE_ID:'STO_fixture',WAFFO_STARTER_PRODUCT_ID:'PROD_starter',WAFFO_PRO_PRODUCT_ID:'PROD_pro'};
const origin='http://127.0.0.1:3000';
const settings={origin,local:true};
const channel=n=>'UC'+String(n).padStart(22,'0');
async function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const store=new BillingStore(db,true,'test');await store.migrate();return store;
}
async function paidOrder(store,plan='starter',user='alice',id='order',until=Date.now()+86400000) {
  await store.query("INSERT INTO billing_orders(id,user_id,plan,mode,product_id,state,provider_id,valid_until,created) VALUES($1,$2,$3,'test',$4,'active',$5,$6,$7) RETURNING id",[id,user,plan,env[plan==='starter'?'WAFFO_STARTER_PRODUCT_ID':'WAFFO_PRO_PRODUCT_ID'],'ORD_'+id,until,Date.now()]);
}
const payment=plan=>({id:'PAY_fixture',status:'succeeded',isFullyRefunded:false,refundStatus:'none',periodNumber:2,amount:{display:plan==='starter'?'3.88':'9.88',currency:'USD'}});
const period=(plan='starter')=>({status:'active',billingPeriod:'monthly',isInTrial:false,currentPeriodNumber:2,currentPeriodStart:new Date(Date.now()-60000).toISOString(),currentPeriodEnd:new Date(Date.now()+3600000).toISOString(),payments:[payment(plan)]});
function mockClient() {
  const orders=new Map(),creates=[];
  const client={orders,creates,failNext:false,
    graphql:{query:async({query,variables})=> query.includes('subscriptionProducts') ? {data:{store:{id:env.WAFFO_STORE_ID,prodEnabled:true,subscriptionProducts:['starter','pro'].map(plan=>({id:env[plan==='starter'?'WAFFO_STARTER_PRODUCT_ID':'WAFFO_PRO_PRODUCT_ID'],status:'active',billingPeriod:'monthly',prices:[{currency:'USD',priceInfo:{amount:plan==='starter'?'3.88':'9.88'}}]}))}}} : {data:{subscriptionOrders:orders.has(variables.ref)?[orders.get(variables.ref)]:[]}}},
    checkout:{authenticated:{create:async(params,options)=>{creates.push({params,options});if(client.failNext){client.failNext=false;throw new Error('network timeout');}return{checkoutUrl:'https://pancake.waffo.ai/checkout#fixture',expiresAt:new Date(Date.now()+3600000).toISOString()};}}},
    auth:{createCustomerPortalLink:async params=>({portalUrl:`https://pancake.waffo.ai/portal?buyer=${params.buyerIdentity}`})},
  };return client;
}
function remote(row,plan='starter') {return {...period(plan),id:'ORD_'+row.id,storeId:env.WAFFO_STORE_ID,currency:'USD',testMode:true,merchantProvidedBuyerIdentity:row.user_id,orderMerchantExternalId:row.id,productVersion:{productId:row.product_id}};}

test('Refund evidence excludes prepayment use, counts channel-days cumulatively, and uses request receipt time',async t=>{
  const store=await fixture(t),start=Date.parse('2026-11-02T12:00:00Z');
  await paidOrder(store,'starter','alice','first',start+32*86400000);
  await store.claim('alice',channel(1),start-1000);
  for(let i=2;i<=11;i++)await store.claim('alice',channel(i),start+i);
  await store.claim('alice',channel(2),start+2000);
  const atReceipt=await store.refundUsage('first',start,start+2000);
  assert.equal(atReceipt.used,10);assert.equal(atReceipt.threshold,10);assert.ok(atReceipt.withinWindow && atReceipt.withinUsage);
  await store.claim('alice',channel(2),start+86400000);
  assert.equal((await store.refundUsage('first',start,start+86400000)).used,11);
  assert.equal((await store.refundUsage('first',start,start+86400000)).withinUsage,false);
  assert.equal((await store.refundUsage('first',start,start+2000)).used,10);
  assert.equal((await store.refundUsage('first',start,start+7*86400000+1)).withinWindow,false);
  await assert.rejects(store.refundUsage('missing',start,start),/Paid order not found/);
  assert.ok(atReceipt.requiresManualVerification);
});

test('Free allowance is one canonical channel; repeats, accounts, modes and UTC days are independent',async t=>{
  const store=await fixture(t), day=Date.parse('2026-11-02T23:59:59Z');
  const results=await Promise.all(Array.from({length:20},()=>store.claim('alice',channel(1),day)));
  assert.ok(results.every(r=>r.allowed));assert.equal(results.filter(r=>!r.alreadyUnlocked).length,1);
  assert.equal((await store.claim('alice',channel(2),day)).allowed,false);
  assert.equal((await store.claim('bob',channel(2),day)).allowed,true);
  assert.equal((await new BillingStore(store.database,true,'prod').claim('alice',channel(2),day)).allowed,true);
  assert.equal((await store.claim('alice',channel(2),day+1000)).allowed,true);
  assert.equal((await store.status('alice',day)).used,1);
  assert.equal((await store.status('alice',day+1000)).resetsAt,'2026-11-04T00:00:00.000Z');
});
for(const [plan,limit] of [['starter',100],['pro',1000]]) test(`${plan} has exactly ${limit} unique daily channels under concurrent requests`,async t=>{
  const store=await fixture(t);await paidOrder(store,plan);
  const result=await Promise.all(Array.from({length:limit+7},(_,i)=>store.claim('alice',channel(i))));
  assert.equal(result.filter(r=>r.allowed).length,limit);
  assert.equal((await store.status('alice')).used,limit);
  assert.equal((await store.claim('alice',channel(0))).allowed,true);
  assert.equal((await store.claim('alice',channel(limit+50))).allowed,false);
});
test('Expiry and a refund remove paid allowance without erasing channel uses',async t=>{
  const store=await fixture(t);await paidOrder(store);
  await store.claim('alice',channel(1));await store.claim('alice',channel(2));
  await store.query("UPDATE billing_orders SET valid_until=0,state='active' WHERE id='order' RETURNING id");
  assert.equal((await store.status('alice')).plan,'free');
  assert.equal((await store.status('alice')).remaining,0);
  assert.equal((await store.claim('alice',channel(1))).allowed,true);
  assert.equal((await store.claim('alice',channel(3))).allowed,false);
});
test('Subscriptions require this paid monthly period, matching USD minimum, no trial, and no refunds',()=>{
  for(const plan of ['starter','pro']){
    assert.ok(subscriptionUntil(period(plan),plan)>Date.now());
    const canceled=period(plan);canceled.status='canceling';assert.ok(subscriptionUntil(canceled,plan)>Date.now());
    for(const mutate of [o=>o.payments=[],o=>o.payments[0].periodNumber=1,o=>o.payments[0].amount.display='0.01',o=>o.payments[0].amount.currency='EUR',o=>o.payments[0].isFullyRefunded=true,o=>o.payments[0].refundStatus='partial',o=>o.status='past_due',o=>o.isInTrial=true,o=>o.currentPeriodStart='invalid',o=>o.currentPeriodNumber=0,o=>o.currentPeriodEnd='2000-01-01']){
      const order=period(plan);mutate(order);assert.equal(subscriptionUntil(order,plan),0);
    }
  }
});
test('Checkout is idempotent, price is server-defined, durable after network errors, and avoids overlapping subscriptions',async t=>{
  const store=await fixture(t),client=mockClient(),billing=createBilling(store,settings,env,{client});
  client.failNext=true;
  await assert.rejects(()=>billing.checkout({id:'alice',email:'alice@example.test'},'starter'));
  const [saved]=await store.query('SELECT * FROM billing_orders');assert.ok(saved);
  const created=await Promise.all([billing.checkout({id:'alice'},'starter'),billing.checkout({id:'alice'},'starter')]);
  assert.equal(created[0].orderId,saved.id);assert.deepEqual(created[0],created[1]);
  assert.equal(client.creates.length,2);assert.equal(client.creates[0].options.idempotencyKey,client.creates[1].options.idempotencyKey);
  assert.equal(client.creates[1].params.productId,env.WAFFO_STARTER_PRODUCT_ID);assert.equal(client.creates[1].params.withTrial,false);
  await assert.rejects(()=>billing.checkout({id:'alice'},'pro'),/pending/);
  client.orders.set(saved.id,remote(saved));await billing.reconcile(saved);
  assert.equal((await store.status('alice')).plan,'starter');
  await assert.rejects(()=>billing.checkout({id:'alice'},'pro'),/existing subscription/);
  client.orders.get(saved.id).payments[0].isFullyRefunded=true;await billing.reconcile(saved);
  assert.equal((await store.status('alice')).plan,'free');
});
test('Provider order identity, product, currency, store and mode mismatches cannot grant access',async t=>{
  const store=await fixture(t),client=mockClient(),billing=createBilling(store,settings,env,{client});
  const purchase=await billing.checkout({id:'alice'},'starter');const [row]=await store.query('SELECT * FROM billing_orders WHERE id=$1',[purchase.orderId]);
  for(const change of [o=>o.storeId='other',o=>o.testMode=false,o=>o.merchantProvidedBuyerIdentity='bob',o=>o.orderMerchantExternalId='other',o=>o.productVersion.productId='other',o=>o.currency='EUR']){
    const order=remote(row);change(order);client.orders.set(row.id,order);
    await assert.rejects(()=>billing.reconcile(row),/identity/);assert.equal((await store.status('alice')).plan,'free');
  }
});
test('Payment configuration is isolated and invalid redirect targets are rejected',()=>{
  assert.equal(billingConfig({},true),null);
  assert.throws(()=>billingConfig({...env,WAFFO_PRO_PRODUCT_ID:env.WAFFO_STARTER_PRODUCT_ID}));
  assert.throws(()=>billingConfig({...env,WAFFO_ENVIRONMENT:'wrong'}));
  assert.throws(()=>billingConfig({WAFFO_STORE_ID:'partial'}));
  for(const url of ['javascript:alert(1)','https://waffo.ai.evil.test','https://user:pass@pancake.waffo.ai','http://pancake.waffo.ai'])assert.throws(()=>checkoutURL(url));
});
test('Signed raw Waffo webhooks are durable and idempotent; forged, stale and wrong-store events are rejected',async t=>{
  const store=await fixture(t),client=mockClient();
  client.webhooks=new WaffoPancake({...billingConfig(env),webhookPublicKey:keys.publicKey.export({type:'spki',format:'pem'})}).webhooks;
  const billing=createBilling(store,settings,env,{client});
  const purchase=await billing.checkout({id:'alice'},'starter');
  const [row]=await store.query('SELECT * FROM billing_orders WHERE id=$1',[purchase.orderId]);
  client.orders.set(row.id,remote(row));
  const app=express();mountBilling(app,{auth:{api:{getSession:async({headers})=>headers.get('cookie')==='alice'?{user:{id:'alice'}}:null}}},settings,billing);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}/api/billing`,headers={cookie:'alice',origin,'content-type':'application/json'};
  assert.equal((await fetch(base+'/status')).status,401);
  assert.equal((await fetch(base+'/checkout',{method:'POST',headers,body:JSON.stringify({plan:'starter'})})).status,400);
  assert.equal((await fetch(base+'/checkout',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:JSON.stringify({plan:'starter',consent:true})})).status,403);
  assert.equal((await fetch(base+'/reconcile',{method:'POST',headers,body:JSON.stringify({orderId:'b'.repeat(32)})})).status,404);
  const notify=(event,ts=Date.now(),valid=true)=>{
    const body=JSON.stringify(event),signature=valid?sign('sha256',Buffer.from(`${ts}.${body}`),keys.privateKey).toString('base64'):'forged';
    return fetch(base+'/webhook',{method:'POST',headers:{'content-type':'application/json','x-waffo-signature':`t=${ts},v1=${signature}`},body});
  };
  const event={id:'PAY_fixture',eventId:'EVT_fixture',timestamp:new Date().toISOString(),eventType:'subscription.payment_succeeded',storeId:env.WAFFO_STORE_ID,mode:'test',data:{orderId:'ORD_'+row.id,orderMerchantExternalId:row.id}};
  assert.equal((await notify(event,Date.now(),false)).status,401);
  assert.equal((await notify({...event,mode:'prod'})).status,401);
  assert.equal((await notify({...event,storeId:'other'})).status,401);
  assert.equal((await notify(event,Date.now()-3600000)).status,401);
  // A provider failure leaves the signed event in the inbox for a safe retry.
  const originalQuery=client.graphql.query;client.graphql.query=async()=>{throw new Error('temporary outage');};
  assert.equal((await notify(event)).status,503);
  assert.equal((await store.query('SELECT * FROM billing_events'))[0].processed,0);
  client.graphql.query=originalQuery;
  assert.equal((await notify(event)).status,200);assert.equal((await notify(event)).status,200);
  assert.equal((await store.query('SELECT * FROM billing_events')).length,1);
  assert.equal((await store.status('alice')).plan,'starter');
  const status=await fetch(base+'/status',{headers:{cookie:'alice'}});assert.equal(status.headers.get('cache-control'),'no-store');
  client.orders.get(row.id).payments[0].refundStatus='full';
  assert.equal((await notify({...event,eventId:'EVT_refund',eventType:'refund.succeeded'})).status,200);
  assert.equal((await store.status('alice')).plan,'free');
});
test('Canonical channel lookup, every download size and cached aliases share one allowance; failures and guests do not spend it',async t=>{
  const store=await fixture(t);let accesses=0;
  const fetcher=async raw=>{
    const url=new URL(raw);
    if(url.hostname==='www.googleapis.com'){
      if(url.pathname.endsWith('/videos'))return Response.json({items:[{snippet:{channelId:channel(1)}}]});
      if(url.searchParams.get('forHandle')==='@missing')return Response.json({items:[]});
      const id=url.searchParams.get('forHandle')==='@second'?channel(2):channel(1);
      return Response.json({items:[{id,snippet:{title:'Fixture',thumbnails:{high:{url:'https://yt3.ggpht.com/test=s800-c'}}}}]});
    }
    const size=Number(raw.match(/=s(\d+)/)[1]);return new Response(await sharp({create:{width:size,height:size,channels:3,background:'#ddd'}}).jpeg().toBuffer(),{headers:{'content-type':'image/jpeg'}});
  };
  const server=createApp({key:'test',secret:'test',fetcher,sessionReader:async req=>req.headers.cookie?{user:{id:req.headers.cookie}}:null,
    accessReader:async(user,id)=>{accesses++;return store.claim(user,id);}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const lookup=(input,cookie='alice')=>fetch(base+'/api/profile',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify({input})});
  assert.equal((await lookup('@first','')).status,401);assert.equal(accesses,0);
  assert.equal((await lookup('@missing')).status,404);assert.equal(accesses,0);
  const first=await (await lookup('@first')).json();assert.equal(first.usage.used,1);
  for(const size of first.sizes){
    const response=await fetch(base+size.downloadUrl,{headers:{cookie:'alice'}});assert.equal(response.status,200);
    assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,size.size);
  }
  for(const input of ['@first',channel(1),'https://youtu.be/jNQXAC9IVRw'])assert.equal((await lookup(input)).status,200);
  assert.equal((await store.status('alice')).used,1);
  assert.equal((await lookup('@second')).status,402);
  assert.equal((await fetch(base+first.sizes[0].imageUrl,{headers:{cookie:'bob'}})).status,403);
  assert.equal((await lookup('@second','bob')).status,200);
  assert.equal((await fetch(base+first.sizes[0].imageUrl)).status,401);
});
