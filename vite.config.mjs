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
      return [
        { tag: 'link', attrs: { rel: 'canonical', href }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:url', content: href }, injectTo: 'head' }
      ];
    }
  }],
  build: { rollupOptions: { input: Object.fromEntries(['index','about','contact','privacy','terms'].map(n=>[n,resolve(import.meta.dirname,`${n}.html`)])) } },
  server: { host: '127.0.0.1' }
});
