import { accountConfig } from "./config.mjs";
import { createAccounts } from "./auth.mjs";
// Use explicit environment only; never inherit development .env settings.
const env = process.env;
const config = accountConfig({
  ...env,
  DATABASE_URL: env.DIRECT_DATABASE_URL || env.DATABASE_URL,
});
if (!config)
  throw new Error("Configure ACCOUNT_ORIGIN before migrating accounts");
const service = await createAccounts(config, { migrate: true });
await service.close();
console.log("YT PFP account schema is up to date.");
