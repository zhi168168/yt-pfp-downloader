import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { indexablePaths } from '../lib/seo.mjs';
import { siteOrigin } from '../lib/site-origin.mjs';
import { exampleProfile } from '../src/example-profile.mjs';

const origin = siteOrigin();
assert.ok(origin, 'Build and audit with PUBLIC_ORIGIN set to the production origin.');
const root = resolve('dist');
const titleSet = new Set(), descriptionSet = new Set(), pages = [];
for (const path of indexablePaths) {
  const file = path === '/' ? '/index.html' : path;
  const html = await readFile(resolve(root, '.' + file), 'utf8');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.ok(title && description, `${path}: missing title/description`);
  assert.ok(!titleSet.has(title) && !descriptionSet.has(description), `${path}: duplicate metadata`);
  titleSet.add(title); descriptionSet.add(description);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: one H1 in initial HTML`);
  assert.ok(!/<meta[^>]+(?:noindex|nofollow)/.test(html), `${path}: unexpectedly excluded`);
  assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`), `${path}: wrong canonical`);
  assert.ok(html.includes(`property="og:url" content="${origin}${path}"`));
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.ok(html.includes(`property="og:image" content="${origin}/images/yt-pfp-downloader-social.png"`));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (!href.startsWith('/') && !href.startsWith('#')) continue;
    const target = new URL(href.replaceAll('&amp;', '&'), `${origin}${path}`);
    if (target.pathname.startsWith('/api/') || target.pathname === '/account') continue;
    const targetFile = target.pathname === '/' ? '/index.html' : target.pathname;
    const absolute = resolve(root, '.' + targetFile);
    assert.ok((await stat(absolute)).isFile(), `${path}: broken local URL ${href}`);
    if (target.hash && targetFile.endsWith('.html')) {
      // Existing consent action is handled by privacy-choices.js, not a content anchor.
      if (target.pathname === '/privacy.html' && target.hash === '#cookie-settings') continue;
      const targetHtml = target.pathname === path ? html : await readFile(absolute, 'utf8');
      assert.ok(targetHtml.includes(`id="${target.hash.slice(1)}"`), `${path}: broken fragment ${href}`);
    }
  }
  pages.push({ path, title, description, initialH1: 1, canonical: `${origin}${path}`, localLinksAndAssets: 'pass' });
}
const home = await readFile('dist/index.html', 'utf8');
assert.ok(home.includes('id="profile-input"') && home.includes(`alt="${exampleProfile.name} profile picture example"`));
const schema = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema.url, origin + '/');
assert.equal(schema.offers.price, '0');
assert.ok(schema.offers.description.includes('one unique'));
assert.ok(!schema.aggregateRating && !schema.review);
const pricing = await readFile('dist/pricing.html', 'utf8');
for (const content of ['$3.88', '$9.88', '1,000', '00:00 UTC', 'Automatically renews']) assert.ok(pricing.includes(content));
assert.ok((await readFile('dist/account.html', 'utf8')).includes('content="noindex,follow"'));
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]), indexablePaths.map(path => origin + path));
assert.ok((await readFile('dist/robots.txt', 'utf8')).includes(`Sitemap: ${origin}/sitemap.xml`));
const image = await sharp('dist/images/yt-pfp-downloader-social.png').metadata();
assert.equal(image.width, 1200); assert.equal(image.height, 630);
const result = { checkedAt: new Date().toISOString(), scope: 'Local production build; not a live deployment or Google indexing validation.', origin, pages, prerender: 'Tool form, example image, pricing and renewal terms present without JavaScript', socialImage: { width: image.width, height: image.height }, sitemap: 'pass', schema: 'pass' };
await writeFile('docs/seo-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(`SEO audit passed: ${pages.length} indexable pages, metadata, local links/assets, prerender, schema, sitemap and social image.`);
