import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequestHandler } from '../lib/http-app.mjs';
import { siteOrigin } from '../lib/site-origin.mjs';
import { tokenCodec } from '../lib/tokens.mjs';
import sharp from 'sharp';

test('Vercel parsed JSON bodies and HTTPS forwarded origin work, including preview hosts', async t => {
  const source = 'https://yt3.ggpht.com/test=s800-c';
  const fetcher = async url => {
    if (url.startsWith('https://www.googleapis.com/')) return Response.json({ items: [{ id: 'UCBR8-60-B28hp2BmDPdntcQ', snippet: { title: 'Vercel Test', thumbnails: { high: { url: source } } } }] });
    const size = Number(url.match(/=s(\d+)/)[1]);
    return new Response(await sharp({ create: { width: size, height: size, channels: 3, background: '#000' } }).jpeg().toBuffer(), { headers: { 'content-type': 'image/jpeg' } });
  };
  const options = { key: 'server-only', secret: 'a'.repeat(64), trustProxy: true, publicOrigin: 'https://production.example', fetcher };
  const firstInstance = createRequestHandler(options);
  const secondInstance = createRequestHandler(options);
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') req.body = { input: '@YouTube' };
    return (req.url.startsWith('/api/image') ? secondInstance : firstInstance)(req, res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'Origin': base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '192.0.2.1' };
  const response = await fetch(base+'/api/profile', { method: 'POST', headers });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.name, 'Vercel Test');
  const download = await fetch(base+profile.sizes[0].downloadUrl);
  assert.equal(download.status, 200);
  assert.equal((await sharp(Buffer.from(await download.arrayBuffer())).metadata()).width, 1280);
  const other = await fetch(base+'/api/profile', { method: 'POST', headers: { ...headers, Origin: 'https://unrelated.example' } });
  assert.equal(other.status, 403);
});

test('Vercel function entrypoints load without opening a listening server', async () => {
  const entries = await Promise.all(['profile','image','health'].map(name => import(`../api/${name}.mjs`)));
  assert.ok(entries.every(module => typeof module.default === 'function'));
  assert.equal(entries[0].default, entries[1].default);
  assert.equal(entries[1].default, entries[2].default);
});

test('function instances can verify each other’s signed image links', () => {
  const secret = 'deploy-once-use-across-all-functions-123456';
  const payload = { source: 'https://yt3.ggpht.com/test=s800-c', id: 'test', name: 'Public channel' };
  const token = tokenCodec(secret).encode(payload);
  assert.equal(tokenCodec(secret).decode(token).name, payload.name);
  assert.throws(() => tokenCodec('another-deployment').decode(token));
});

test('build-time SEO uses the production domain and rejects invalid origins', () => {
  assert.equal(siteOrigin({}), '');
  assert.equal(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'test.vercel.app' }), 'https://test.vercel.app');
  assert.equal(siteOrigin({ PUBLIC_ORIGIN: 'https://custom.example/', VERCEL_PROJECT_PRODUCTION_URL: 'test.vercel.app' }), 'https://custom.example');
  for (const PUBLIC_ORIGIN of ['javascript:alert(1)', 'https://test.example/path', 'https://user:secret@test.example']) assert.throws(() => siteOrigin({ PUBLIC_ORIGIN }));
});

test('Vercel configuration includes all API routes and static output', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'dist');
  for (const name of ['profile','image','health']) assert.ok(config.functions[`api/${name}.mjs`]);
});
