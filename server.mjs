import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequestHandler } from './lib/http-app.mjs';

export function createApp(options = {}) {
  const server = http.createServer(createRequestHandler(options));
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let middleware;
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite');
    middleware = (await createServer({ server: { middlewareMode: true }, appType: 'mpa' })).middlewares;
  }
  const port = Number(process.env.PORT || 8788);
  const host = process.env.HOST || '127.0.0.1';
  createApp({ middleware }).listen(port, host, () => console.log(`YT PFP Downloader ready at http://${host}:${port}`));
}
