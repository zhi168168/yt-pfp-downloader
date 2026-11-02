import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Render the same components used by the browser; no account/API requests run.
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom' });
try {
  for (const [file, id, module, name] of [
    ['index.html', 'downloader', '/src/main.jsx', 'Downloader'],
    ['pricing.html', 'pricing-root', '/src/Billing.jsx', 'Pricing'],
  ]) {
    const component = (await vite.ssrLoadModule(module))[name];
    const markup = renderToString(React.createElement(component));
    const html = await readFile(file, 'utf8');
    const pattern = new RegExp(`(<(?:div|main)[^>]*id="${id}"[^>]*>)[\\s\\S]*?(<!--prerender-end-->)`);
    if (!pattern.test(html)) throw new Error(`Missing prerender boundary: ${file}`);
    await writeFile(file, html.replace(pattern, (_, opening, end) => opening + markup + end));
  }
} finally {
  await vite.close();
}
