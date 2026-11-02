import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { basename } from 'node:path';
import { siteOrigin } from './lib/site-origin.mjs';
export default defineConfig({
  plugins: [{
    name: 'canonical-origin',
    transformIndexHtml(html, context) {
      const origin = siteOrigin();
      if (!origin) return html;
      const page = basename(context.filename);
      const href = `${origin}${page === 'index.html' ? '/' : `/${page}`}`;
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || 'YT PFP Downloader';
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] || 'Manage your YT PFP Downloader account.';
      const image = `${origin}/images/yt-pfp-downloader-social.png`;
      const tags = [
        { tag: 'link', attrs: { rel: 'canonical', href }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:url', content: href }, injectTo: 'head' },
        ...Object.entries({ 'og:title': title, 'og:description': description, 'og:image': image, 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': 'YT PFP Downloader — YouTube profile picture downloads', 'og:site_name': 'YT PFP Downloader', 'og:locale': 'en_US' }).map(([property, content]) => ({ tag: 'meta', attrs: { property, content }, injectTo: 'head' })),
        ...Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': title, 'twitter:description': description, 'twitter:image': image, 'twitter:image:alt': 'YT PFP Downloader — YouTube profile picture downloads' }).map(([name, content]) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' })),
      ];
      if (!html.includes('property="og:type"')) tags.push({ tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' });
      if (page === 'index.html') tags.push({
        tag: 'script', attrs: { type: 'application/ld+json' }, injectTo: 'head',
        children: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', '@id': `${origin}/#app`, url: href, name: 'YT PFP Downloader', applicationCategory: 'MultimediaApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and an account.', image, description: 'Look up, preview and download current public YouTube channel profile pictures as JPGs. Sign in for one free channel per UTC day; paid plans increase the daily allowance.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free account: one unique YouTube channel per UTC day, including all available avatar sizes.' } }).replaceAll('<', '\\u003c'),
      });
      return tags;
    }
  }],
  build: { rollupOptions: { input: Object.fromEntries(['index','about','contact','privacy','terms','account','pricing','refunds'].map(n=>[n,resolve(import.meta.dirname,`${n}.html`)])) } },
  server: { host: '127.0.0.1' }
});
