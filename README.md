# YT PFP Downloader

Free English-language channel-avatar tool. Node 22.12+; React + Vite frontend,
Node HTTP server, official YouTube Data API, server-side JPEG delivery.

## Run

1. `pnpm install`
2. Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY` on the server only.
3. `pnpm dev` (http://127.0.0.1:8788)
4. `pnpm test` and `pnpm build`
5. `pnpm start` serves the built production site on the same port.

The supplied key has already been configured locally in the ignored `.env`.
Do not put it into a VITE_ variable, client bundle, Git or a screenshot.

## Vercel deployment

Import `zhi168168/yt-pfp-downloader` into Vercel. The repository includes
`vercel.json` and Node Functions for profile/image/health routes. Select Node
22.x and set server-only `YOUTUBE_API_KEY` and a stable (32+ characters)
`DOWNLOAD_SIGNING_SECRET` before deploying. Do not copy local proxy variables.
Detailed Chinese instructions: [docs/vercel-deployment.md](docs/vercel-deployment.md).

Vercel serves `dist` directly. Build-time canonical URLs/robots/sitemap use
`PUBLIC_ORIGIN`, falling back to `VERCEL_PROJECT_PRODUCTION_URL`. Vercel handles
function ports and HTTPS. In-memory limits/cache are per warm function instance;
use shared storage or platform firewall rules if a global traffic limit is needed.

## Self-hosted deployment

Run as a Node service behind HTTPS, with `HOST=0.0.0.0` inside a container or
behind a reverse proxy, `PORT` as needed, `PUBLIC_ORIGIN=https://your-domain`,
and a stable random `DOWNLOAD_SIGNING_SECRET` of at least 32 characters.
Set `TRUST_PROXY=true` only if a trusted proxy overwrites X-Forwarded-For.
The service requires outbound access to www.googleapis.com, yt3.ggpht.com,
yt3.googleusercontent.com and (for legacy custom URLs) www.youtube.com.
Optional HTTP_PROXY/HTTPS_PROXY/NO_PROXY are supported. This Windows machine's
local proxy is configured only in the ignored .env; do not copy that proxy
configuration to a remote server.

`PUBLIC_ORIGIN` enables canonical URLs, robots sitemap discovery and the sitemap.
No placeholder domain is published. Use one application instance initially;
in-memory cache/rate limiting must move to shared storage before scaling out.
API quota usage is enforced by Google; per-IP rate limiting is not a global
daily-budget guarantee. Hosting access logs are controlled by the host.

Fonts and licenses are bundled in public/fonts; no dependency on local fonts.
The example image is a public YouTube channel avatar, clearly marked Example.
No analytics, account system or payments. No deployment has been performed.

## Behavior

- @handles, channel IDs, channel links, video/Shorts/live/embed/share links,
  legacy /user/ names; best-effort /c/ canonical resolution with actionable errors.
- 9 requested CDN sizes; only successfully decoded variants are offered.
- Actual pixel dimensions verified with sharp. Larger variants may be scaled
  by Google; no claim of native 1280px or original source detail.
- HMAC-signed one-day image URLs, allowlisted image origins, bounded upstream
  bodies/timeouts, server-only API key, same-origin POST check.
- 15-minute profile cache, 1-hour bounded image cache, concurrent-request
  coalescing, per-IP lookup/download limits, global lookup concurrency cap.
- Mobile preview, JPG download, full-image fallback, lightbox, FAQ and trust pages.

See docs/competitor-research.md for current competitor pricing and limits of
the public observations. See docs/design.md and docs/verification.md for UI QA.
