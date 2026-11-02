# Website logo and Google Search favicon

The supplied `icon.png` remains the original source. Run `pnpm build` to regenerate
brand assets using `scripts/generate-brand-assets.mjs`. The script crops the red
mark's excess margins without changing its proportions. `logo.png` removes only
the exterior white background for use on the dark site header; favicon files
retain white backgrounds and white play/download details.

## Stable public assets

- `/logo.png`: 512×512 transparent exterior, site and account navigation.
- `/favicon-96.png`: 96×96 PNG, declared on all HTML entry pages, including
  the root homepage. This is the main Google Search favicon candidate.
- `/favicon.ico`: embedded 16×16, 32×32 and 48×48 PNG frames for browser compatibility.
- `/favicon-48.png`, `/favicon-192.png`, `/favicon-512.png`: additional square PNGs.
- `/apple-touch-icon.png`: 180×180 PNG.
- `/site.webmanifest`: references the 192px and 512px icons.
- `/favicon.svg`: compatibility URL containing the new image; no HTML icon
  declaration relies on SVG for Google Search.

`scripts/brand-head.mjs` also supplies the metadata for the information-page
generator, so regenerated pages retain the new icon declarations.

## Official guidance checked November 2, 2026

Source: https://developers.google.com/search/docs/appearance/favicon-in-search

Google currently requires a square favicon at least 8×8 pixels and recommends
dimensions larger than 48×48 pixels. PNG and ICO are explicitly supported formats.
The guidance does not currently require dimensions to be multiples of 48; 96×96
is our choice. Googlebot must be able to crawl the homepage, and Googlebot-Image
must be able to crawl the icon. Keep the icon URL stable. The root homepage's
`rel="icon"` declarations identify the favicon; Organization structured data is
not a substitute for those declarations.

The generated robots.txt allows `/` and icon files, disallowing only `/api/`.
The application serves these files publicly without sign-in. Its production
static handler includes PNG, ICO and manifest MIME types.

After deployment, verify that the real domain's homepage and `/favicon-96.png`
return HTTP 200 without authentication, crawler blocks, or deployment protection.
Use Search Console URL Inspection on the homepage to request indexing. Google
says refreshing the favicon can take days to weeks and explicitly does not
guarantee display even when all requirements are met. Local build verification
does not establish deployment, recrawling, or search-result display.
