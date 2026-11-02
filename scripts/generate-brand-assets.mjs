import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep the supplied source intact. All public brand files have stable URLs.
const root = new URL('../', import.meta.url);
const output = new URL('public/', root);
await mkdir(output, { recursive: true });
const { data, info } = await sharp(fileURLToPath(new URL('icon.png', root)))
  .rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
let left = info.width, top = info.height, right = -1, bottom = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    if (data[i] > 160 && data[i + 1] < 110 && data[i + 2] < 150) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
}
if (right < left) throw new Error('No red logo found in icon.png; inspect the source before rebuilding.');
const padding = Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.06);
const crop = {
  left: Math.max(0, left - padding), top: Math.max(0, top - padding),
  width: Math.min(info.width, right + padding + 1) - Math.max(0, left - padding),
  height: Math.min(info.height, bottom + padding + 1) - Math.max(0, top - padding),
};
const square = await sharp(data, { raw: info }).extract(crop)
  .resize(512, 512, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
const png = async size => sharp(square).resize(size, size).png().toBuffer();
for (const size of [48, 96, 192, 512]) {
  await writeFile(new URL(`favicon-${size}.png`, output), await png(size));
}
await writeFile(new URL('apple-touch-icon.png', output), await png(180));

// Remove only the exterior near-white background for the dark navigation bar.
// Enclosed white play/download symbols remain opaque.
const { data: rgba, info: rgbaInfo } = await sharp(square).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const count = rgbaInfo.width * rgbaInfo.height;
const queue = new Int32Array(count), visited = new Uint8Array(count);
let start = 0, end = 0;
function enqueue(index) {
  if (visited[index]) return;
  visited[index] = 1;
  const p = index * 4;
  if (rgba[p] < 225 || rgba[p + 1] < 225 || rgba[p + 2] < 225) return;
  queue[end++] = index;
}
for (let x = 0; x < 512; x++) { enqueue(x); enqueue(511 * 512 + x); }
for (let y = 0; y < 512; y++) { enqueue(y * 512); enqueue(y * 512 + 511); }
while (start < end) {
  const index = queue[start++], x = index % 512, y = Math.floor(index / 512);
  rgba[index * 4 + 3] = 0;
  if (x > 0) enqueue(index - 1);
  if (x < 511) enqueue(index + 1);
  if (y > 0) enqueue(index - 512);
  if (y < 511) enqueue(index + 512);
}
const logo = await sharp(rgba, { raw: rgbaInfo }).png().toBuffer();
await writeFile(new URL('logo.png', output), logo);
// Preserve the previous URL for cached consumers while replacing the old artwork.
await writeFile(new URL('favicon.svg', output), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${(await png(96)).toString('base64')}"/></svg>\n`);

// ICO supports embedded PNG entries; include common browser sizes and 48px.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i]; header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL('favicon.ico', output), Buffer.concat([header, ...frames]));
await writeFile(new URL('site.webmanifest', output), JSON.stringify({
  name: 'YT PFP Downloader', short_name: 'YT PFP', start_url: '/', display: 'browser',
  background_color: '#0b0b0d', theme_color: '#0b0b0d',
  icons: [192, 512].map(size => ({ src: `/favicon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
}, null, 2) + '\n');
console.log('Generated logo, square PNG favicons, multi-size ICO, Apple icon and web manifest.');

// Social card reuses the supplied brand artwork; no third-party avatar or rating.
const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b0b0d"/><rect x="64" y="64" width="1072" height="502" rx="32" fill="#131315" stroke="#39333f"/><text x="116" y="256" fill="#f5f5f7" font-family="Arial,sans-serif" font-size="58" font-weight="700">YT PFP Downloader</text><text x="116" y="326" fill="#c8b7f5" font-family="Arial,sans-serif" font-size="30">Download YouTube profile pictures</text><text x="116" y="426" fill="#a2a2ad" font-family="Arial,sans-serif" font-size="24">JPG downloads · Up to 9 sizes</text><text x="116" y="466" fill="#a2a2ad" font-family="Arial,sans-serif" font-size="24">Sign in for 1 free channel per UTC day</text></svg>`);
await mkdir(new URL('images/', output), { recursive: true });
await sharp(card).composite([{ input: await sharp(logo).resize(110,110).toBuffer(), left: 950, top: 144 }]).png().toFile(fileURLToPath(new URL('images/yt-pfp-downloader-social.png', output)));
