import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { accountConfig } from './config.mjs';
import { createAccounts } from './auth.mjs';
import { capabilities, mountAccounts } from './http.mjs';

let runtime;
export async function getAccounts() {
  if (!runtime) runtime = (async () => {
    const config = accountConfig(process.env);
    if (!config || (process.env.VERCEL && config.local)) return null;
    const service = await createAccounts(config);
    try { await service.auth.$context; }
    catch (error) { await service.close(); throw error; }
    const app = express();
    app.disable('x-powered-by');
    mountAccounts(app, config, service, { vercel: Boolean(process.env.VERCEL) });
    app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
    return { service, app };
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}

export async function downloadSession(req) {
  const runtime = await getAccounts();
  if (!runtime) throw new Error('Accounts are not configured');
  return runtime.service.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

export default async function accountHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/auth/config') {
      const config = accountConfig(process.env);
      return res.end(JSON.stringify(capabilities(process.env.VERCEL && config?.local ? null : config)));
    }
    const runtime = await getAccounts();
    if (runtime) return runtime.app(req, res);
  } catch { /* Fail closed without exposing credentials or connection strings. */ }
  res.statusCode = 503;
  res.end(JSON.stringify({ message: 'Account service is temporarily unavailable' }));
}
