import { writeFile, rm } from 'node:fs/promises';
import { siteOrigin } from '../lib/site-origin.mjs';
const origin = siteOrigin();
const pages = ['/', '/about.html', '/contact.html', '/privacy.html', '/terms.html'];
await writeFile('public/robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
if (origin) await writeFile('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`);
else await rm('public/sitemap.xml', { force: true });
