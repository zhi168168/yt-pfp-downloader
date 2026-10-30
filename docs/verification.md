# Verification — 2026-10-30

## Functional evidence

- Production build completed using Vite 7.3.7.
- 32 Node tests passed: accepted/invalid URL forms, video-to-author lookup,
  no search endpoint usage, deduplicated in-flight requests, cache behavior,
  missing-channel/quota errors, unavailable image variants, signed download
  tampering and expiry, allowlisted redirects, actual JPEG attachments,
  same-origin POST protection, and prevention of serving source/.env files.
- `node scripts/verify-live.mjs` passed against the local production service.
  Evidence: `live-verification.json` (no credentials or download tokens).
- Live @YouTube lookup: 9 decoded sizes, all nine downloaded and decoded:
  1280,1080,900,800,720,500,400,240,88. Measured 2.09s for an uncached lookup
  in this run, not a production performance guarantee.
- Live video link `https://youtu.be/jNQXAC9IVRw`: correctly returned jawed.
- Live /channel/, /user/Google and /c/Google lookups succeeded.
- Invalid external URL returned 400; nonexistent @handle returned 404.
- Browser/IAB: entered @YouTube, retrieved results and triggered an actual
  download, verified on disk as a 1280x1280 JPEG. At mobile width, selected
  240px, triggered another real download and verified a 240x240 JPEG.
- Browser/IAB: square/circle selection, accessible enlarged dialog, close,
  FAQ disclosure, invalid-link error and retry affordance were exercised.
- Built HTML/JS/CSS scanned for API-key prefix: zero matches. Local credentials
  exist only in ignored .env. API responses and reports contain no API key.
- HTTP checks: /, About, Contact, Privacy and Terms all returned 200.

## Visual reference and ledger

The user's supplied live site is the design baseline. Reference image:
`style-reference.png` at 1265x712. Image Gen was unavailable; there is no
generated/approved raster concept and none is represented as such.
Implementation screenshots captured with Browser/IAB, then inspected with
view_image against the reference. Reference-native 1265x712, desktop
1440x1000, mobile 390x844 and small mobile 360x800 were checked. Browser
viewport override was reset after verification. No Playwright fallback used.

| Comparison | Reference evidence | Implementation evidence / decision |
|---|---|---|
| Palette | #0b0b0d background, near-white type, muted gray | Same colors and restrained purple #c8b7f5 active states; no gradients/glow |
| Typography | Inter UI, DM Sans headline | Same self-hosted families; heading scale adapted to the shorter tool name |
| Header | Thin outlined floating capsule | Same capsule geometry and whitespace; task-specific navigation, no fake sign-in |
| Primary controls | White rounded main action | White lookup/download actions, subdued secondary controls |
| Product surface | Bordered dark live-preview panel | Same border/surface hierarchy; purpose-built avatar preview and size selector |
| Spacing and sections | Centered hero, generous open sections | Centered hero, numbered steps, open feature rows, restrained table and FAQ |
| Icons | Quiet small UI symbols | Coherent 1.7px rounded SVG family and a separate original avatar/crop mark |
| Mobile | Stacked responsive content | Stacked form and preview, no horizontal overflow at 390 or 360; size targets adjusted to 44px |

Above-the-fold copy checked against docs/design.md: no unrelated pricing,
AI claims, sign-in or fabricated metrics added. Intentional task adaptation:
Typeflow's name and animation-specific copy/actions are replaced by the avatar
workflow. Original hero copy and live result data are not literal clones.
Static demo is marked Example; image dimensions do not imply native detail.

Resolved during QA: Windows Node outbound proxy configuration, multi-byte
body decoding across chunks, legacy YouTube handle redirects, mobile touch
target sizes, malformed request URL handling. Latest inspected screenshots
show no clipped controls, broken images or horizontal overflow.

## Limits

- This is a local running production build, not a public deployment.
- Mobile checks are browser viewport tests, not physical iOS/Android testing.
- No native 1280px/4K detail guarantee; source servers can scale an avatar.
- Legacy custom links are best-effort and have an actionable handle fallback.
- In-memory caching/rate limiting is suitable for one service instance; shared
  limits are needed when scaling horizontally. Google enforces daily quota.
- PUBLIC_ORIGIN remains unset until a real domain is chosen; canonical URLs
  and sitemap are generated when it is configured.

## GitHub / Vercel handoff

- Added explicit Node Functions for profile/image/health, sharing the same
  request handler as the local HTTP server without listening on a port.
- Added stable cross-instance image signatures, parsed-body support, trusted
  platform HTTPS origin handling, build-time static canonical/robots/sitemap.
- 37 tests now pass, including simulated Vercel JSON requests and successful
  image download from a different handler instance with the same signing key.
- Vercel configuration and deployment instructions are included. Actual Vercel
  deployment is left to the user as requested; platform success is unverified.
