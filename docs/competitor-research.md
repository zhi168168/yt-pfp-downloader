# ytultra profile downloader and pricing

Pricing and profile-tool public copy rechecked on 2026-11-02, including both
Monthly and Yearly switches. Initial public lookup test was on 2026-10-30.
Not an authenticated purchase or subscription checkout test.

Sources:
- https://www.ytultra.com/en/youtube-profile-downloader/
- https://www.ytultra.com/en/pricing/

The avatar tool says free, no signup, no fees. Tested public channel input
without signing in: it displayed a channel avatar and nine CDN download links
(1280, 1080, 900, 800, 720, 500, 400, 240, 88). Placeholder accepts video or
channel URL. Instructions explicitly support video-to-author lookup.
No payment gate was encountered when retrieving the results; checkout and
every subsequent download were not audited.

| Plan | Monthly | Annual bill | Equivalent per month | Monthly AI credits |
|---|---:|---:|---:|---:|
| Starter | $3.99 | $9.48 | $0.79 | 500 |
| Pro | $9.99 | $95.88 | $7.99 | 3,000 |
| Advanced | $29.99 | $239.88 | $19.99 | 15,000 |

Prices in USD, exactly as displayed when switching Monthly/Yearly. Starter's
large annual discount is on the page; we did not infer or correct it.
Paid plans market faster HD downloads and AI services, not a standalone avatar
purchase. Starter includes thumbnails/banners/audio and priority processing;
Pro adds transcripts, subtitle downloads, analysis, scripts; Advanced adds
higher volumes and priority support. Credits do not roll over. Recurring
subscriptions; cancellation stops future renewal, access remains to period end.
Tax may be added. Refunds generally excluded except applicable consumer law.

Current project context (2026-11-02): YT PFP requires an independent account for
lookups, previews and downloads. The approved plans are Free 1 channel/day,
Starter USD 3.88/month for 100 channels/day, and Pro USD 9.88/month for
1,000 channels/day. All sizes and repeated uses of the same canonical channel
share one daily use; reset is 00:00 UTC. Monthly plans auto-renew until canceled.
The earlier free/no-account proposal is superseded. Competitor subscriptions cover a broader creator suite; they do not
establish a standalone profile-picture subscription price.

Possible paid value for YT PFP: batch channel input, ZIP export, and a channel
information CSV. These are proposals, not current implemented features. These proposals are separate from the user-approved daily-channel plans.
Do not advertise added native image detail for existing larger CDN variants.
Waffo implementation can follow Typeflow's checkout/webhook/entitlement pattern,
with separate YT PFP products, pricing and callback configuration; do not copy
the sibling site's customer or order data.

Observed inconsistency: the avatar page markets nine sizes up to 1280px but
its FAQ mentions typical 48/88/176px. CDN size variants do not establish the
native uploaded image's detail. This implementation verifies returned pixel
dimensions and describes larger variants without claiming native 4K/original.
