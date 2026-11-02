// Read-only support evidence. No refund/payment API is invoked by this command.
import {accountConfig} from '../accounts/config.mjs';
import {createAccounts} from '../accounts/auth.mjs';
import {BillingStore} from './store.mjs';
import {paymentMode} from './config.mjs';
const [orderId,paymentTime,requestTime] = process.argv.slice(2);
if (!/^[a-f0-9]{32}$/.test(orderId || '') || ![paymentTime,requestTime].every(value=>Number.isFinite(Date.parse(value))))
  throw new Error('Usage: node --env-file=.env.accounts billing/refund-review.mjs ORDER_ID FIRST_SUCCESSFUL_PAYMENT_ISO_TIME REQUEST_RECEIVED_ISO_TIME');
const requestedAt=Date.parse(requestTime);
if(requestedAt>Date.now())throw new Error('Request time cannot be in the future');
const settings=accountConfig({...process.env,DATABASE_URL:process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL});
if(!settings)throw new Error('Configure the YT PFP account database');
const accounts=await createAccounts(settings);
try {
  const store=new BillingStore(accounts.database,settings.local,paymentMode(process.env,settings.local));
  const [order]=await store.query('SELECT user_id FROM billing_orders WHERE id=$1 AND mode=$2',[orderId,store.mode]);
  if(!order)throw new Error('Order not found in this payment environment');
  console.log(JSON.stringify(await store.refundUsage(orderId,Date.parse(paymentTime),requestedAt),null,2));
} finally {await accounts.close();}
