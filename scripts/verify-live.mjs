import assert from 'node:assert/strict';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const checks = [];
async function profile(input) {
  const started = performance.now();
  const response = await fetch(base+'/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input})});
  const result = await response.json();
  checks.push({input,status:response.status,seconds:Math.round((performance.now()-started)/10)/100,name:result.name,sizes:result.sizes?.map(s=>({requested:s.size,width:s.width,height:s.height})),error:result.error});
  return {response,result};
}
const {result:youtube,response}=await profile('@YouTube');
assert.equal(response.status,200);assert.equal(youtube.name,'YouTube');assert.equal(youtube.sizes.length,9);
for (const size of youtube.sizes) {
  const guest = await fetch(base+size.downloadUrl);
  assert.equal(guest.status,401);
  if (!process.env.TEST_ACCOUNT_COOKIE) continue;
  const response = await fetch(base+size.downloadUrl,{headers:{cookie:process.env.TEST_ACCOUNT_COOKIE}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.width,size.width);assert.equal(meta.height,size.height);assert.equal(meta.format,'jpeg');
  checks.push({download:size.size,width:meta.width,height:meta.height,bytes:bytes.length,ok:true});
}
assert.equal((await profile('https://youtu.be/jNQXAC9IVRw')).result.name,'jawed');
assert.equal((await profile('https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ')).result.name,'YouTube');
assert.equal((await profile('https://www.youtube.com/user/Google')).result.name,'Google');
const legacy=await profile('https://www.youtube.com/c/Google');
assert.ok(legacy.response.status===200||legacy.response.status===422);
assert.equal((await profile('https://example.com')).response.status,400);
assert.equal((await profile('@this_channel_does_not_exist_ytpfptest_83027491')).response.status,404);
for(const page of ['/','/about.html','/privacy.html','/terms.html','/contact.html'])assert.equal((await fetch(base+page)).status,200);
const html = await (await fetch(base)).text();
assert.ok(!html.includes('AIza'));
await writeFile('docs/live-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),checks},null,2));
console.log(JSON.stringify(checks,null,2));
