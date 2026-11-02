# Waffo production configuration — November 2, 2026

## Verified configuration

- Waffo business review shows Approved and permits production payments.
- Merchant: `MER_5EMEWfhBB53tdi21MkTuMM`.
- Independent YT PFP store: `STO_2uaSzlQyEYFBdtnpbVB9ZB` (`yt-pfp-weqj9rw2`).
- Starter: `PROD_2gjH5w6DSx8dx4WBowov4I`, USD 3.88/month, 100 channel unlocks/day.
- Pro: `PROD_6OD5JZfbBEEBBPCj8IaXTY`, USD 9.88/month, 1,000 channel unlocks/day.
- Both public production checkout pages load their correct plan, monthly price, cancellation description and low-usage refund terms. These public product links are inspection links; customers must purchase through the signed-in website flow so orders are bound to their account.
- Production RAW webhook: `https://www.ytpfp.com/api/billing/webhook`, enabled for all 14 available order, subscription and refund events. The store previously had no production webhook; no sibling store endpoint was changed.
- The user created a separate managed production API key named `YT PFP Production` and explicitly authorized saving it to this Vercel project. No existing merchant key was replaced or deleted.
- Six variables were saved as Secret variables, scoped only to Production in Vercel project `haosongs-projects-f976a543/yt-pfp-downloader`: `WAFFO_PRIVATE_KEY`, `WAFFO_ENVIRONMENT`, `WAFFO_MERCHANT_ID`, `WAFFO_STORE_ID`, `WAFFO_STARTER_PRODUCT_ID`, `WAFFO_PRO_PRODUCT_ID`. Their saved presence was rechecked after the desktop app restarted. No private key is stored in this document or committed to Git.

## Deployment and acceptance

- Production deployment `FwquF9Z9r7jBU9ib9yp8M2pw4TeP`, source `1898cf43a11e7b0e5ab7a77044f70ea4e70bce17`, reached Ready on November 2, 2026, after the user completed Vercel email reauthentication. Vercel reports creation at 17:45:52 GMT+8 and a 47-second deployment duration; `www.ytpfp.com` is assigned to it.
- Real-domain checks after deployment: `/api/health` returned 200 with `ok: true, configured: true`; unauthenticated `/api/billing/status` returned 401 `SIGN_IN_REQUIRED`.
- An unsigned POST `{}` to `/api/billing/webhook` returned 401 `Invalid signature or scope`, replacing the previous deployment's 503 `Payments unavailable`. This checks initialization and signature enforcement, not private-key validity against Waffo or successful signed delivery.
- The live pricing page displays Free 1 channel/day, Starter USD 3.88/month and 100 channels/day, and Pro USD 9.88/month and 1,000 channels/day. Signed-out purchase buttons require sign-in, and recurring consent is initially unchecked.
- Remaining acceptance requires a signed-in account-bound checkout and an explicitly authorized real payment, followed by a verified signed callback and paid allowance. Opening a public product checkout does not establish this end-to-end flow. No real payment, cancellation or refund has been performed during configuration.

Evidence is under `docs/screenshots/`: `waffo-production-webhook.png`, `vercel-production-payment-env.png`, `waffo-starter-live-checkout.png`, `waffo-pro-live-checkout.png`, `vercel-payment-production-ready.png`.
