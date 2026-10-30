export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') {
    super(message); this.status = status; this.code = code;
  }
}
const videoId = /^[a-zA-Z0-9_-]{11}$/;
const channelId = /^UC[a-zA-Z0-9_-]{22}$/;
const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
function handle(value) {
  if (!/^@[\p{L}\p{N}_.\-·]{1,100}$/u.test(value)) throw new AppError('Enter a valid @handle or YouTube link.');
  return { type: 'handle', value, key: `handle:${value.toLowerCase()}` };
}
export function parseInput(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) throw new AppError('Paste a YouTube channel, @handle, or video link.');
  const text = raw.trim();
  if (text.startsWith('@')) return handle(text);
  if (channelId.test(text)) return { type: 'channel', value: text, key: `channel:${text}` };
  let url;
  try { url = new URL(/^[\w.+-]+:\/\//.test(text) ? text : `https://${text}`); }
  catch { throw new AppError('This link does not look right. Try a YouTube channel or video URL.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new AppError('Please use an http or https YouTube link.');
  if (url.username || url.password || url.port || (!hosts.has(url.hostname) && url.hostname !== 'youtu.be' && url.hostname !== 'www.youtu.be')) throw new AppError('Only YouTube links are supported.');
  let paths;
  try { paths = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  catch { throw new AppError('This link contains invalid characters. Please copy it again.'); }
  let id;
  if (url.hostname.endsWith('youtu.be')) id = paths[0];
  else if (paths[0] === 'watch') id = url.searchParams.get('v');
  else if (['shorts', 'live', 'embed'].includes(paths[0])) id = paths[1];
  if (id !== undefined) {
    if (!videoId.test(id || '')) throw new AppError('That video link is incomplete. Copy the full YouTube share link.');
    return { type: 'video', value: id, key: `video:${id}` };
  }
  if (paths[0]?.startsWith('@')) return handle(paths[0]);
  if (paths[0] === 'channel' && channelId.test(paths[1] || '')) return { type: 'channel', value: paths[1], key: `channel:${paths[1]}` };
  if (paths[0] === 'user' && /^[\p{L}\p{N}_.-]{1,100}$/u.test(paths[1] || '')) return { type: 'username', value: paths[1], key: `username:${paths[1]}` };
  if ((paths[0] === 'c' && paths[1]) || (paths.length === 1 && /^[\p{L}\p{N}_.-]+$/u.test(paths[0]) && !['watch','feed','playlist','results','shorts','live','embed'].includes(paths[0]))) {
    const name = paths[0] === 'c' ? paths[1] : paths[0];
    if (!/^[\p{L}\p{N}_.-]{1,100}$/u.test(name)) throw new AppError('Please use the channel’s current @handle link.');
    return { type: 'custom', value: name, key: `custom:${name}`, path: paths[0] === 'c' ? `/c/${encodeURIComponent(name)}` : `/${encodeURIComponent(name)}` };
  }
  throw new AppError('Use a channel, @handle, or video link. Playlist and search links are not supported.');
}
