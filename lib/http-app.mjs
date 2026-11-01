import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { AppError } from './input.mjs';
import { RateLimiter } from './cache.mjs';
import { tokenCodec, SIZES } from './tokens.mjs';
import { createYouTubeService } from './youtube.mjs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import accountHandler, { downloadSession } from '../accounts/runtime.mjs';

// Optional proxy configuration for development networks; never hardcoded in
// deployment source. NO_PROXY keeps localhost requests local.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());

const root = resolve(import.meta.dirname, '..');
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
export function createRequestHandler({ key = process.env.YOUTUBE_API_KEY, secret = process.env.DOWNLOAD_SIGNING_SECRET || randomBytes(32).toString('hex'), fetcher, middleware, sessionReader = downloadSession, staticRoot = resolve(root, 'dist'), trustProxy = process.env.TRUST_PROXY === 'true', publicOrigin = process.env.PUBLIC_ORIGIN } = {}) {
  const codec = tokenCodec(secret);
  const service = createYouTubeService({ key, codec, fetcher });
  const lookupLimit = new RateLimiter(20), imageLimit = new RateLimiter(180);
  let active = 0;
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!middleware) res.setHeader('Content-Security-Policy', csp);
    const ip = trustProxy ? String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
    try {
      let url;
      try { url = new URL(req.url, 'http://localhost'); }
      catch { throw new AppError('Invalid request URL.'); }
      if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/') || url.pathname === '/api/dev/mailbox') return accountHandler(req, res);
      if (url.pathname === '/account') { req.url = '/account.html' + url.search; url.pathname = '/account.html'; }
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, configured: Boolean(key) });
        if (url.pathname === '/api/profile' && req.method === 'POST') {
          // Browser POSTs must originate from this site; keys stay server-side.
          const origin = req.headers.origin;
          if (origin) {
            const https = req.socket?.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
            const requestOrigin = `${https ? 'https' : 'http'}://${req.headers.host}`;
            if (origin !== requestOrigin && origin !== publicOrigin) throw new AppError('Requests must come from this website.', 403, 'ORIGIN');
          }
          if (!String(req.headers['content-type']).startsWith('application/json')) throw new AppError('Send JSON input.', 415);
          if (!lookupLimit.take(ip)) { res.setHeader('Retry-After', '60'); throw new AppError('Too many lookups. Please wait a minute and try again.', 429, 'RATE_LIMIT'); }
          if (active >= 24) throw new AppError('The service is busy. Please try again shortly.', 503, 'BUSY');
          let input;
          if (req.body !== undefined) {
            // Vercel may have parsed JSON before handing the request to us.
            let body = req.body;
            if (Buffer.isBuffer(body)) body = body.toString();
            if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 4096) throw new AppError('Input is too long.', 413);
            try { input = (typeof body === 'string' ? JSON.parse(body) : body)?.input; } catch { throw new AppError('Invalid JSON input.'); }
          } else {
            const chunks = []; let bytes = 0;
            for await (const chunk of req) { bytes += chunk.length; if (bytes > 4096) throw new AppError('Input is too long.', 413); chunks.push(chunk); }
            try { input = JSON.parse(Buffer.concat(chunks).toString()).input; } catch { throw new AppError('Invalid JSON input.'); }
          }
          active++;
          try { return json(res, 200, await service.profile(input)); } finally { active--; }
        }
        if (url.pathname === '/api/image' && req.method === 'GET') {
          if (!imageLimit.take(ip)) { res.setHeader('Retry-After', '60'); throw new AppError('Please wait a minute before downloading again.', 429, 'RATE_LIMIT'); }
          const data = codec.decode(url.searchParams.get('token'));
          const size = Number(url.searchParams.get('size'));
          if (!SIZES.includes(size)) throw new AppError('This image size is not supported.');
          const preview = url.searchParams.get('inline') === '1';
          if (!preview) {
            res.setHeader('Cache-Control', 'no-store');
            let session;
            try { session = await sessionReader(req); }
            catch { throw new AppError('Sign-in service is temporarily unavailable.', 503, 'AUTH_UNAVAILABLE'); }
            if (!session?.user?.id) throw new AppError('Sign in to download for free.', 401, 'SIGN_IN_REQUIRED');
          }
          const image = await service.image(data.source, preview ? Math.min(size, 400) : size);
          const base = String(data.name || 'youtube').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'youtube';
          res.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.buffer.length, 'Content-Disposition': `${preview || url.searchParams.get('inline') === '2' ? 'inline' : 'attachment'}; filename="${base}-profile-${image.width}x${image.height}.jpg"`, 'Cache-Control': preview ? 'private, max-age=3600' : 'no-store' });
          return res.end(image.buffer);
        }
        throw new AppError('Endpoint not found.', 404, 'NOT_FOUND');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('Method not allowed.', 405);
      if (url.pathname === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\n${publicOrigin ? `Sitemap: ${publicOrigin}/sitemap.xml\n` : ''}`);
      }
      if (url.pathname === '/sitemap.xml') {
        if (!publicOrigin) throw new AppError('Sitemap is available after the public domain is configured.', 404);
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/about.html','/privacy.html','/terms.html','/contact.html'].map(p=>`<url><loc>${publicOrigin}${p}</loc></url>`).join('')}</urlset>`);
      }
      if (middleware) return middleware(req, res, () => { res.writeHead(404); res.end('Not found'); });
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new AppError('Invalid path.'); }
      const file = resolve(staticRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(staticRoot + sep) || pathname.split('/').some(p=>p.startsWith('.'))) throw new AppError('Not found.', 404);
      let data;
      try { if (!(await stat(file)).isFile()) throw new Error(); data = await readFile(file); }
      catch { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><html lang="en"><title>Page not found</title><body style="background:#0b0b0d;color:#f5f5f7;font:18px system-ui;padding:10vw"><h1>Page not found</h1><a style="color:#c8b7f5" href="/">Back to YT PFP Downloader</a></body></html>'); }
      const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2', '.txt':'text/plain' }[extname(file)] || 'application/octet-stream';
      if (extname(file) === '.html' && publicOrigin) {
        const html = /rel=["']canonical["']/.test(data.toString()) ? data.toString() : data.toString().replace('</head>', `<link rel="canonical" href="${publicOrigin}${pathname === '/index.html' ? '/' : pathname}"><meta property="og:url" content="${publicOrigin}${pathname === '/index.html' ? '/' : pathname}"></head>`);
        data = Buffer.from(html);
      }
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': /[\\/]assets[\\/]/.test(file) || file.endsWith('.woff2') ? 'public, max-age=31536000, immutable' : 'no-cache', 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.', code: error instanceof AppError ? error.code : 'INTERNAL' });
      else res.end();
    }
  };
}
