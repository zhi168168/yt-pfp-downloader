import { writeFile, rm } from 'node:fs/promises';
import { siteOrigin } from '../lib/site-origin.mjs';
import { robotsText, sitemapXml } from '../lib/seo.mjs';
const origin = siteOrigin();
await writeFile('public/robots.txt', robotsText(origin));
if (origin) await writeFile('public/sitemap.xml', sitemapXml(origin));
else await rm('public/sitemap.xml', { force: true });
