# Billing and allowance verification — 2026-11-02

- All 52 automated tests pass; production Vite build passes.
- SQLite unit tests cover Free 1 / Starter 100 / Pro 1,000 daily limits, concurrent requests, UTC rollover, account/environment isolation, repeat channels and paid expiry/refunds without quota reset.
- PostgreSQL integration uses isolated temporary schemas in the actual independent Neon project, then drops them. Separate connection pools verified atomic Free and Starter claims, repeat channels and UTC rollover. Existing real accounts and orders were not altered by these tests.
- HTTP tests verify all nine JPEG sizes and alternate links of a canonical channel share one use, guests cannot query or preview, tokens are account-bound, and failed lookups do not count.
- Waffo SDK tests use generated signing keys and a fake provider: signature/timestamp/scope rejection, durable event retry, duplicate event handling, ownership/product/currency validation, current paid period, refunds, and durable checkout idempotency after network errors.
- Local browser: existing disposable local account looked up @YouTube, downloaded 1280px and 240px, and stayed at 1/1. @Google returned the daily limit. This uses real YouTube responses but local test accounts, not a production customer.
- Pricing checked on desktop and 390×844 mobile; mobile document width equals viewport width (no horizontal overflow). Paid checkout is disabled without payment credentials. Screenshots are in `docs/screenshots/pricing-desktop.png`, `pricing-mobile.png`, `quota-same-channel.png` and `quota-daily-limit.png`.
- Production Neon schema migration succeeded, including consent audit fields and account closure guards. Database changes do not by themselves prove a Vercel deployment.

Not yet verified: this site's live Waffo merchant/store/product configuration, actual paid transactions, renewal/cancellation/refund callbacks through deployed Vercel raw-body routing, and real paid entitlements. These require setup and production acceptance described in [WAFFO.md](WAFFO.md). Mock SDK tests do not establish successful real collection.

Production smoke check after GitHub commit ea4bb25: https://www.ytpfp.com rejects guest lookup with 401 and serves homepage, legal pages, pricing and refunds with HTTP 200. Live pricing was also inspected in-browser. This does not test signed-in production quota or paid checkout.
