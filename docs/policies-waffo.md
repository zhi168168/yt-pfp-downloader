# Waffo policy alignment — November 2, 2026

Sources read in the live official documentation:

- https://docs.waffo.ai/zh/mor/account-reviews/privacy-policy
- https://docs.waffo.ai/zh/mor/account-reviews/tos#6-v1

YT PFP uses V1 monthly subscriptions, not credits or hybrid billing. The templates' AI-specific clauses are inapplicable to this YouTube API/avatar service and were removed.

## Verified operator and user decisions

- Individual operator; legal name and country were read from the existing Waffo draft. No identity numbers, banking information or residential address were copied.
- Public contact uses the YT PFP store's verified support email, consistently on account, home and legal pages. The sibling site's data/credentials were not reused.
- User selected first-subscription refunds within 7 calendar days if cumulative paid usage is at most Starter 10 / Pro 100. This is not a daily threshold and does not apply afresh to renewals. Billing errors, >72-hour service interruption, discontinuation without breach and mandatory rights remain covered.
- Repeated same-channel access on the same UTC day shares a use. Different UTC days count separately. Prepayment and failed lookups are excluded. Requests are reviewed as of their receipt time, not delayed support response time.

## Implemented

- English Terms, Privacy and Refund Policy; cross-links, contact, operator, age 18, purposes/legal bases, provider disclosure, no sale/advertising, security, rights and international processing.
- Explicit monthly recurring authorization and genuine online cancellation through the account's Waffo customer portal. No promise of 10-minute email confirmation or automatic account deletion after subscription cancellation.
- Pricing discloses refund criteria and checkout retains its required Terms/Privacy/Refund links. Future checkout orders record policy version `2026-11-02.2` with consent time. Existing order evidence is preserved.
- Google Analytics requires affirmative opt-in on every site entry page. Denial/withdrawal clears accessible GA cookies without clearing sign-in cookies; loaded analytics is disabled and the page reloads on withdrawal. Preference expires after 180 days. Account/auth pages are not measured; public-page analytics URLs exclude queries/fragments.
- A prominent policy notice gives existing users until November 17, 2026 for material contractual changes. Privacy-protective settings apply immediately. Prior public documents are archived under `docs/policy-history/2026-11-02.1/`; future revisions must preserve their predecessors too.
- Read-only support tool provides cumulative use evidence; it cannot issue refunds or independently prove first-customer eligibility.

## Support refund procedure

Verify the provider receipt and first-subscription/customer history, account ownership, plan, successful payment time and the actual time the support request arrived. Then run:

```powershell
node --env-file=.env.accounts billing/refund-review.mjs ORDER_ID FIRST_SUCCESSFUL_PAYMENT_ISO_TIME REQUEST_RECEIVED_ISO_TIME
```

Use actual successful payment time, not checkout creation or billing-period start. The report includes the applicable threshold, cumulative account channel-day unlocks and request window. It is evidence for manual review; investigate provider gaps or customer disputes rather than treating a report as an automatic final decision. Do not fabricate missing timestamps. Approved refunds must be processed through Waffo by an authorized operator. A refund is not issued by this CLI or the customer request email.

## Operational duties and open verification

- Check support mail: acknowledge billing/refund requests within 2 business days; process approved refunds within 5–10 business days. Rights requests target 30 calendar days, with lawful extensions explained. These are operating commitments, not automated delivery guarantees.
- Review and delete/anonymize support records after 2 years and billing/consent records after 7 years from the end of the related transaction/subscription, unless subject to a specific legal hold. There is no claim of an automatic retention job. Confirmed account deletion already removes the active auth profile/sessions and daily channel records; limited billing identifiers can remain. Review these periods against applicable legal/accounting duties as business operations change.
- Confirm the actual Google Analytics event-retention setting, Vercel log period, Neon backup/region and provider transfer arrangements. The public policy does not invent provider settings or certify that contracts/safeguards have already been independently audited.
- The ToS checklist explicitly permits an individual without a business address; the Privacy template still asks for a controller/contact address. The policy identifies the individual and country, provides a real email and a correspondence-address request route, and does not publish a private residence. If Waffo requires a public service/correspondence address, obtain the user's chosen address before adding it. Do not represent this as an unconditional pass on that checklist item.
- Waffo's name field currently contains Chinese characters while its help requests the full Latin-letter legal name matching identity/bank records. The user must confirm the correct spelling; do not transliterate it automatically.
- Real merchant approval, live paid checkout, cancellation/refund webhooks and actual tax/consumer withdrawal handling still require production validation. A template-based website revision is not an approval decision by Waffo.
