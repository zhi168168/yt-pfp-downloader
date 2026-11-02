// Explicit opt-in integration check; isolated temporary schema, no real users/orders.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {BillingStore} from '../billing/store.mjs';
const connectionString=process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if(!connectionString)throw new Error('Provide a PostgreSQL test connection');
const schema='ytpfp_quota_check_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({connectionString,connectionTimeoutMillis:15000});
let pool, phase="connect";
try{
  await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);
  phase="pool";pool=new pg.Pool({connectionString,max:6,options:`-c search_path=${schema}`,connectionTimeoutMillis:15000});
  const store=new BillingStore(pool,false,'test');await store.migrate();phase="free concurrency";
  const channel=n=>'UC'+String(n).padStart(22,'0');
  const now=Date.parse('2026-11-02T12:00:00Z');
  const free=await Promise.all(Array.from({length:12},(_,n)=>store.claim('isolated-free',channel(n),now)));
  assert.equal(free.filter(r=>r.allowed).length,1);
  const allowed=free.findIndex(r=>r.allowed);
  assert.equal((await store.claim('isolated-free',channel(allowed),now)).alreadyUnlocked,true);
  phase="paid seed";await store.query("INSERT INTO billing_orders(id,user_id,plan,mode,product_id,state,provider_id,valid_until,created) VALUES('fixture','isolated-paid','starter','test','fixture','active','fixture',$1,$2) RETURNING id",[now+86400000,now]);
  // Fill 99 slots in one SQL operation, then race independent connections for slot 100.
  await store.query("INSERT INTO channel_usage(user_id,mode,day,channel_id,created) SELECT 'isolated-paid','test','2026-11-02','UC'||lpad(i::text,22,'0'),$1 FROM generate_series(1,99) AS i RETURNING channel_id",[now]);
  phase="paid concurrency";const paid=await Promise.all(Array.from({length:12},(_,n)=>store.claim('isolated-paid',channel(n+100),now)));
  assert.equal(paid.filter(r=>r.allowed).length,1);
  assert.equal((await store.status('isolated-paid',now)).used,100);
  assert.equal((await store.claim('isolated-paid',channel(500),now+86400000)).allowed,true);
  console.log('PostgreSQL PASS: independent connections enforce Free 1/day and Starter 100/day atomically; repeats and UTC reset verified.');
}catch(error){
  console.error('PostgreSQL check failed at '+phase+' ('+error.name+', code '+(error.code || 'none')+'); connection details withheld.');process.exitCode=1;
}finally{
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});
  await admin.end();
}
