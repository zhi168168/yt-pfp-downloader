import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createYouTubeService } from '../lib/youtube.mjs';
import { tokenCodec } from '../lib/tokens.mjs';

// Manual refresh only: regular builds use committed images and need no API key.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
const codec = tokenCodec(randomBytes(32).toString('hex'));
const service = createYouTubeService({ key: process.env.YOUTUBE_API_KEY, codec });
const profile = await service.profile('@MrBeast');
const token = new URL(profile.sizes[0].downloadUrl, 'http://localhost').searchParams.get('token');
const source = codec.decode(token).source;
await mkdir('public/images', { recursive: true });
const sizes = [];
for (const { size } of profile.sizes) {
  const image = await service.image(source, size);
  const imageUrl = `/images/mrbeast-avatar-example-${size}.jpg`;
  await writeFile(`public${imageUrl}`, image.buffer);
  sizes.push({ size, width: image.width, height: image.height, bytes: image.buffer.length, imageUrl });
}
const example = { name: profile.name, handle: profile.handle, channelUrl: profile.channelUrl,
  capturedAt: new Date().toISOString().slice(0,10), sizes };
await writeFile('src/example-profile.mjs', '// Cached public example; downloads still use authenticated lookup.\nexport const exampleProfile = ' + JSON.stringify(example, null, 2) + ';\n');
console.log(`Refreshed ${sizes.length} public example images with verified dimensions.`);
