import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/privacy-choices.js',import.meta.url),'utf8');
function browser(choice,path='/pricing.html?payment=PRIVATE#secret',storageBlocked=false) {
  const nodes=[],cookieWrites=[],listeners={},storage=new Map();let reloads=0;
  if(choice!==undefined)storage.set('ytpfp:privacy:v1',JSON.stringify(choice));
  const doc={
    referrer:'https://example.com/path?email=private@example.com#token',
    createElement:tag=>({tag,hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this[k]=v;},querySelector(){return{focus(){}};}}),
    head:{append(node){nodes.push(node);}},body:{append(...items){nodes.push(...items);}},
    getElementById:id=>nodes.find(n=>n.id===id),
  };
  Object.defineProperty(doc,'cookie',{get:()=> '_ga=123; _ga_Y7X64WN060=456; better-auth.session_token=secret',set:value=>cookieWrites.push(value)});
  const window={addEventListener:(key,fn)=>{listeners[key]=fn;}};
  const href='https://www.ytpfp.com'+path,url=new URL(href);
  const location={href,origin:url.origin,hostname:url.hostname,pathname:url.pathname,hash:url.hash,reload(){reloads++;}};
  vm.runInNewContext(source,{window,document:doc,location,URL,Date,localStorage:{getItem:k=>{if(storageBlocked)throw Error();return storage.get(k);},setItem:(k,v)=>{if(storageBlocked)throw Error();storage.set(k,v);}}});
  const region=nodes.find(n=>n.className==='privacy-choice');
  return {nodes,window,region,storage,cookieWrites,listeners,get reloads(){return reloads;},click(action){region.click({target:{closest:()=>({dataset:{privacy:action}})}});}};
}
test('No analytics network script before consent, after denial, expiration or unavailable storage',()=>{
  for(const fixture of [browser(),browser({analytics:false,at:Date.now()}),browser({analytics:true,at:Date.now()-181*86400000}),browser(undefined,'/',true)]) {
    assert.equal(fixture.nodes.filter(n=>n.tag==='script').length,0);
    assert.equal(fixture.window['ga-disable-G-Y7X64WN060'],true);
    assert.ok(fixture.cookieWrites.every(value=>!value.startsWith('better-auth')));
  }
});
test('Opt-in loads only the configured Google tag and strips queries/fragments from analytics URLs',()=>{
  const b=browser();b.click('allow');
  assert.equal(b.nodes.filter(n=>n.tag==='script').length,1);
  const calls=b.window.dataLayer.map(value=>Array.from(value));
  assert.equal(calls.find(c=>c[0]==='event')[2].page_location,'https://www.ytpfp.com/pricing.html');
  assert.equal(calls.find(c=>c[0]==='event')[2].page_referrer,'https://example.com/path');
  assert.ok(!JSON.stringify(calls).includes('PRIVATE'));
  assert.ok(!JSON.stringify(calls).includes('private@example'));
  b.click('allow');assert.equal(b.nodes.filter(n=>n.tag==='script').length,1);
});
test('Withdrawal disables analytics, removes accessible analytics cookies only, and reloads loaded vendor code',()=>{
  const b=browser({analytics:true,at:Date.now()});b.click('deny');
  assert.equal(b.window['ga-disable-G-Y7X64WN060'],true);assert.equal(b.reloads,1);
  assert.equal(JSON.parse(b.storage.get('ytpfp:privacy:v1')).analytics,false);
  assert.ok(b.cookieWrites.some(value=>value.includes('Domain=ytpfp.com')));
  assert.ok(b.cookieWrites.every(value=>!value.startsWith('better-auth')));
});
test('Account and authentication routes remain unmeasured even with analytics consent',()=>{
  for(const path of ['/account','/account.html?token=SECRET','/api/auth/callback/google?code=SECRET']) {
    const b=browser({analytics:true,at:Date.now()},path);
    assert.equal(b.nodes.filter(n=>n.tag==='script').length,0);
  }
});
test('All site entry pages use the optional analytics choice, without embedded vendor loaders',async()=>{
  for(const name of ['index','account','pricing','about','contact','privacy','terms','refunds']) {
    const html=await readFile(new URL(`../${name}.html`,import.meta.url),'utf8');
    assert.match(html,/src="\/privacy-choices.js"/);
    assert.ok(!html.includes('googletagmanager.com/gtag/js'));
  }
});
