import sharp from 'sharp';
import { AppError, parseInput } from './input.mjs';
import { TTLCache } from './cache.mjs';
import { SIZES, variantUrl, safeImageUrl } from './tokens.mjs';

export async function boundedBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new AppError('The upstream response was too large.', 502, 'UPSTREAM_SIZE');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) { await reader.cancel(); throw new AppError('The upstream response was too large.', 502, 'UPSTREAM_SIZE'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export function createYouTubeService({ key, codec, fetcher = fetch }) {
  const profiles = new TTLCache({ max: 300, ttl: 900_000 });
  const images = new TTLCache({ max: 90, ttl: 3_600_000 });
  const work = new Map();
  async function once(id, task) {
    if (work.has(id)) return work.get(id);
    if (work.size >= 100) throw new AppError('The service is busy. Please try again shortly.', 503, 'BUSY');
    const pending = task(); work.set(id, pending);
    try { return await pending; } finally { work.delete(id); }
  }
  async function api(resource, params) {
    if (!key) throw new AppError('The service is not configured yet. Please try again later.', 503, 'NOT_CONFIGURED');
    const query = new URLSearchParams({ part: 'snippet', ...params });
    let response;
    try { response = await fetcher(`https://www.googleapis.com/youtube/v3/${resource}?${query}`, { headers: { 'X-Goog-Api-Key': key }, signal: AbortSignal.timeout(12_000), redirect: 'error' }); }
    catch { throw new AppError('YouTube took too long to respond. Please try again.', 504, 'UPSTREAM_TIMEOUT'); }
    let data;
    try { data = JSON.parse((await boundedBody(response, 1_000_000)).toString()); }
    catch { throw new AppError('YouTube returned an unexpected response. Try again shortly.', 502, 'UPSTREAM_RESPONSE'); }
    if (!response.ok) {
      const reasons = data.error?.errors?.map(e => e.reason) || [];
      if (reasons.some(r => /quota|dailyLimit/i.test(r))) throw new AppError('Today’s YouTube lookup allowance has been reached. Please try again later.', 503, 'QUOTA_EXCEEDED');
      if (response.status === 403 || response.status === 400) throw new AppError('The YouTube connection is temporarily unavailable. Please try again later.', 503, 'API_CONFIGURATION');
      throw new AppError('YouTube could not complete this lookup. Please try again.', 502, 'UPSTREAM_ERROR');
    }
    return data.items || [];
  }
  async function image(source, size) {
    const url = variantUrl(source, size);
    const cached = images.get(url); if (cached) return cached;
    return once(`image:${url}`, async () => {
      let response;
      try { response = await fetcher(url, { signal: AbortSignal.timeout(12_000), redirect: 'error' }); }
      catch { throw new AppError('The image could not be loaded. Please try again.', 502, 'IMAGE_UNAVAILABLE'); }
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new AppError('This image size is unavailable. Try another size.', 502, 'IMAGE_UNAVAILABLE');
      const original = await boundedBody(response, 4_000_000);
      try {
        const pipeline = sharp(original, { limitInputPixels: 16_000_000 });
        const meta = await pipeline.metadata();
        if (!meta.width || !meta.height) throw new Error();
        const buffer = await pipeline.rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 95 }).toBuffer();
        return images.set(url, { buffer, width: meta.width, height: meta.height, mime: 'image/jpeg' });
      } catch { throw new AppError('The image could not be read. Try another size.', 502, 'IMAGE_UNAVAILABLE'); }
    });
  }
  async function resolveCustom(parsed) {
    // Legacy custom URLs are not API identifiers. Resolve only a fixed public
    // YouTube host, never a URL supplied as an arbitrary fetch destination.
    let response; let target = `https://www.youtube.com${parsed.path}`;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetcher(target, { signal: AbortSignal.timeout(10_000), redirect: 'manual', headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error();
        const next = new URL(location, target);
        if (next.protocol !== 'https:' || !['www.youtube.com','youtube.com'].includes(next.hostname) || next.port || next.username || next.password) throw new Error();
        target = next.href;
        const redirectInput = parseInput(target);
        if (redirectInput.type === 'handle') return { forHandle: redirectInput.value };
        if (redirectInput.type === 'channel') return { id: redirectInput.value };
      }
    }
    catch { throw new AppError('Please use this channel’s current @handle or /channel/ link.', 422, 'LEGACY_URL'); }
    if (!response.ok) throw new AppError('Please use this channel’s current @handle link.', 422, 'LEGACY_URL');
    const html = (await boundedBody(response, 3_000_000)).toString();
    const id = html.match(/<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1]
      || html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1]
      || html.match(/<meta[^>]+itemprop="channelId"[^>]+content="(UC[\w-]{22})"/)?.[1];
    if (!id) throw new AppError('Please use this channel’s current @handle or /channel/ link.', 422, 'LEGACY_URL');
    return { id };
  }
  async function profile(raw) {
    const parsed = parseInput(raw);
    const cached = profiles.get(parsed.key); if (cached) return cached;
    return once(`profile:${parsed.key}`, async () => {
      let query;
      if (parsed.type === 'video') {
        const videos = await api('videos', { id: parsed.value });
        if (!videos[0]) throw new AppError('This video was not found or is not publicly available.', 404, 'NOT_FOUND');
        query = { id: videos[0].snippet.channelId };
      } else if (parsed.type === 'handle') query = { forHandle: parsed.value };
      else if (parsed.type === 'username') query = { forUsername: parsed.value };
      else if (parsed.type === 'custom') query = await resolveCustom(parsed);
      else query = { id: parsed.value };
      const channels = await api('channels', query);
      if (!channels[0]) throw new AppError('No public channel found. Check the @handle or try its channel link.', 404, 'NOT_FOUND');
      const { id, snippet } = channels[0];
      const source = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
      safeImageUrl(source);
      const variants = await Promise.all(SIZES.map(async size => {
        try { const data = await image(source, size); return { size, width: data.width, height: data.height, bytes: data.buffer.length }; }
        catch { return null; }
      }));
      const sizes = variants.filter(Boolean);
      if (!sizes.length) throw new AppError('The channel was found, but its avatar is temporarily unavailable. Please retry.', 502, 'IMAGE_UNAVAILABLE');
      const token = codec.encode({ source, id, name: snippet.title });
      const result = { id, name: snippet.title, handle: snippet.customUrl || (parsed.type === 'handle' ? parsed.value : ''), channelUrl: `https://www.youtube.com/channel/${id}`, apiMaxSize: snippet.thumbnails?.high?.width || null, sizes: sizes.map(s => ({ ...s, imageUrl: `/api/image?token=${token}&size=${s.size}&inline=1`, downloadUrl: `/api/image?token=${token}&size=${s.size}` })) };
      return profiles.set(parsed.key, result);
    });
  }
  return { profile, image };
}
