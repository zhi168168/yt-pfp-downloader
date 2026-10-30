import { createRequestHandler } from './http-app.mjs';

let handler;
export default async function vercelHandler(req, res) {
  // All function instances must verify the same image links, including after
  // cold starts. A per-process random secret would break cross-instance downloads.
  const secret = process.env.DOWNLOAD_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    return res.end(JSON.stringify({ error: 'The service is not configured yet. Please try again later.', code: 'NOT_CONFIGURED' }));
  }
  handler ||= createRequestHandler({ secret, trustProxy: true });
  return handler(req, res);
}
