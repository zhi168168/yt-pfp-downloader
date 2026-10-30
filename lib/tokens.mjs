import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './input.mjs';
export const SIZES = [1280, 1080, 900, 800, 720, 500, 400, 240, 88];
export function safeImageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new AppError('Avatar source is unavailable.', 502, 'IMAGE_SOURCE'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !['yt3.ggpht.com','yt3.googleusercontent.com'].includes(url.hostname)) throw new AppError('Avatar source is unavailable.', 502, 'IMAGE_SOURCE');
  return url;
}
export function variantUrl(source, size) {
  if (!SIZES.includes(size)) throw new AppError('Choose one of the available image sizes.');
  const url = safeImageUrl(source);
  if (/=s\d+/.test(url.pathname)) url.pathname = url.pathname.replace(/=s\d+/, `=s${size}`);
  else throw new AppError('This avatar does not provide size variants.', 502, 'IMAGE_SOURCE');
  return url.href;
}
export function tokenCodec(secret) {
  const sign = payload => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    encode(data) { const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + 86_400_000 })).toString('base64url'); return `${payload}.${sign(payload)}`; },
    decode(token) {
      if (typeof token !== 'string' || token.length > 4096) throw new AppError('This download link is invalid. Fetch the profile again.', 403, 'INVALID_TOKEN');
      const [payload, signature, extra] = token.split('.');
      const expected = sign(payload || '');
      if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AppError('This download link is invalid. Fetch the profile again.', 403, 'INVALID_TOKEN');
      let data;
      try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new AppError('Invalid download link.', 403, 'INVALID_TOKEN'); }
      if (!Number.isFinite(data.exp) || data.exp <= Date.now()) throw new AppError('This download link has expired. Fetch the profile again.', 410, 'EXPIRED_TOKEN');
      safeImageUrl(data.source);
      return data;
    }
  };
}
