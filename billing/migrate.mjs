import { accountConfig } from '../accounts/config.mjs';
import { createAccounts } from '../accounts/auth.mjs';
import { BillingStore } from './store.mjs';
import { paymentMode } from './config.mjs';
const settings = accountConfig({...process.env,DATABASE_URL:process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL});
if (!settings) throw new Error('Configure the independent YT PFP account database');
const accounts = await createAccounts(settings);
try { await new BillingStore(accounts.database,settings.local,paymentMode(process.env,settings.local)).migrate(); }
finally { await accounts.close(); }
console.log('YT PFP daily quota and billing schema is up to date.');
