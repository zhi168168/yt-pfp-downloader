import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHmac } from 'node:crypto';
import { createApp } from '../server.mjs';
import { tokenCodec, variantUrl } from '../lib/tokens.mjs';
import { createYouTubeService } from '../lib/youtube.mjs';

const source = 'https://yt3.ggpht.com/public-test=s800-c-k-c0x00ffffff-no-rj';
const id = 'UCBR8-60-B28hp2BmDPdntcQ';
const channel = { id, snippet: { title:'Test Channel', customUrl:'@test', thumbnails:{high:{url:source,width:800,height:800}} } };
function upstream() {
  const calls = [];
  const fetcher = async (raw,options)=>{
    const url = new URL(raw);calls.push({url,options});
    if (url.hostname==='www.googleapis.com') {
      if(url.pathname.endsWith('/videos'))return Response.json({items:[{snippet:{channelId:id}}]});
      return Response.json({items: url.searchParams.get('forHandle')==='@missing'?[]:[channel]});
    }
    const size = Number(url.pathname.match(/=s(\d+)/)[1]);
    return new Response(await sharp({create:{width:size,height:size,channels:3,background:'#c8b7f5'}}).jpeg().toBuffer(),{headers:{'content-type':'image/jpeg'}});
  };
  return {calls,fetcher};
}
test('video-to-author flow, nine decoded variants, cache, and no leaked key',async()=>{
  const {calls,fetcher}=upstream(); const codec=tokenCodec('test-secret');
  const service=createYouTubeService({key:'SECRET_ONLY_IN_HEADER',codec,fetcher});
  const result=await service.profile('https://youtu.be/jNQXAC9IVRw');
  assert.equal(result.name,'Test Channel');assert.equal(result.sizes.length,9);
  assert.deepEqual(result.sizes.map(s=>s.width),[1280,1080,900,800,720,500,400,240,88]);
  assert.equal(calls.filter(c=>c.url.hostname==='www.googleapis.com').length,2);
  assert.ok(calls.every(c=>!c.url.href.includes('SECRET_ONLY')));
  assert.ok(!JSON.stringify(result).includes('SECRET_ONLY'));
  assert.ok(!calls.some(c=>c.url.pathname.endsWith('/search')));
  await service.profile('https://youtube.com/watch?v=jNQXAC9IVRw&t=2');
  assert.equal(calls.length,11);
});
test('identical simultaneous lookups are coalesced',async()=>{
  const {calls,fetcher}=upstream(); const service=createYouTubeService({key:'test',codec:tokenCodec('test'),fetcher});
  await Promise.all([service.profile('@test'),service.profile('@test'),service.profile('@test')]);
  assert.equal(calls.length,10);
});
test('missing channels and API quota failure have actionable responses',async()=>{
  const service=createYouTubeService({key:'test',codec:tokenCodec('test'),fetcher:upstream().fetcher});
  await assert.rejects(()=>service.profile('@missing'),e=>e.status===404&&e.code==='NOT_FOUND');
  const quota=createYouTubeService({key:'test',codec:tokenCodec('test'),fetcher:async()=>Response.json({error:{errors:[{reason:'quotaExceeded'}]}},{status:403})});
  await assert.rejects(()=>quota.profile('@test'),e=>e.code==='QUOTA_EXCEEDED'&&e.status===503);
});
test('failed image variants are omitted, not advertised as downloadable',async()=>{
  const base=upstream().fetcher;
  const service=createYouTubeService({key:'test',codec:tokenCodec('test'),fetcher:async(url,opts)=>url.includes('=s1280')?new Response('missing',{status:404}):base(url,opts)});
  const result=await service.profile('@test');
  assert.equal(result.sizes.length,8);assert.equal(result.sizes[0].size,1080);
});
test('legacy custom URL follows a YouTube handle redirect without fetching arbitrary hosts',async()=>{
  const base=upstream().fetcher;const seen=[];
  const service=createYouTubeService({key:'test',codec:tokenCodec('test'),fetcher:async(url,opts)=>{
    seen.push(url);
    if(url.includes('www.youtube.com/c/'))return new Response(null,{status:302,headers:{location:'https://www.youtube.com/@test'}});
    return base(url,opts);
  }});
  assert.equal((await service.profile('https://www.youtube.com/c/Test')).name,'Test Channel');
  assert.ok(!seen.some(url=>url==='https://www.youtube.com/@test'));
  const blocked=createYouTubeService({key:'test',codec:tokenCodec('test'),fetcher:async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}})});
  await assert.rejects(()=>blocked.profile('https://www.youtube.com/c/Test'),e=>e.code==='LEGACY_URL');
});
test('image tokens reject modification, expiration, unapproved hosts and sizes',()=>{
  const codec=tokenCodec('very-secret');const valid=codec.encode({source,id,name:'Test'});
  assert.equal(codec.decode(valid).id,id);
  assert.throws(()=>codec.decode(valid.slice(0,-1)+(valid.endsWith('x')?'y':'x')));
  const expiredPayload=Buffer.from(JSON.stringify({source,id,exp:Date.now()-1000})).toString('base64url');
  const expiredSignature=createHmac('sha256','very-secret').update(expiredPayload).digest('base64url');
  assert.throws(()=>codec.decode(`${expiredPayload}.${expiredSignature}`),e=>e.code==='EXPIRED_TOKEN');
  assert.throws(()=>codec.decode(codec.encode({source:'http://127.0.0.1/private',id})));
  for (const url of ['https://yt3.ggpht.com.evil.test/a=s800','https://user:pass@yt3.ggpht.com/a=s800','https://yt3.ggpht.com:8443/a=s800']) assert.throws(()=>variantUrl(url,800));
  assert.throws(()=>variantUrl(source,999999));
});
test('HTTP route returns real JPEG attachment, handles errors and blocks secrets/static traversal',async(t)=>{
  const {fetcher}=upstream(); const server=createApp({key:'DO_NOT_EXPOSE',secret:'test',fetcher});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=(input,headers={})=>fetch(base+'/api/profile',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({input})});
  const response=await send('@test');assert.equal(response.status,200);const result=await response.json();
  const download=await fetch(base+result.sizes[0].downloadUrl);
  assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment; filename="Test-Channel-profile-1280x1280.jpg"/);
  const meta=await sharp(Buffer.from(await download.arrayBuffer())).metadata();assert.equal(meta.width,1280);
  assert.equal((await send('@test',{origin:'https://other.test'})).status,403);
  assert.equal((await send('https://attacker.test')).status,400);
  assert.equal((await fetch(base+'/api/image?token=bad&size=800')).status,403);
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/lib/input.mjs')).status,404);
  assert.equal((await fetch(base+'/missing-page')).status,404);
  assert.equal((await send('@missing')).status,404);
});
