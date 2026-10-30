import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../lib/input.mjs';
const id = 'UCBR8-60-B28hp2BmDPdntcQ';
const cases = [
  ['@YouTube','handle','@YouTube'],
  ['https://www.youtube.com/@YouTube/videos?si=test','handle','@YouTube'],
  ['youtube.com/@%E5%8C%BB%E7%94%9F','handle','@医生'],
  [id,'channel',id],
  [`https://m.youtube.com/channel/${id}/featured`,'channel',id],
  ['https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10','video','jNQXAC9IVRw'],
  ['https://youtu.be/jNQXAC9IVRw?si=tracking','video','jNQXAC9IVRw'],
  ['https://www.youtube.com/shorts/jNQXAC9IVRw','video','jNQXAC9IVRw'],
  ['https://www.youtube.com/live/jNQXAC9IVRw','video','jNQXAC9IVRw'],
  ['https://www.youtube.com/embed/jNQXAC9IVRw','video','jNQXAC9IVRw'],
  ['https://youtube.com/user/Google','username','Google'],
  ['https://youtube.com/c/Google','custom','Google'],
];
for (const [input,type,value] of cases) test(`accepts ${input}`,()=>{const result=parseInput(input);assert.equal(result.type,type);assert.equal(result.value,value);});
for (const input of ['',null,{},'a'.repeat(2050),'https://youtube.com.evil.test/@Google','https://youtube.com@127.0.0.1/@Google','https://youtube.com:4430/@Google','https://example.com/watch?v=jNQXAC9IVRw','https://youtube.com/playlist?list=abc','https://youtube.com/watch?v=short','https://youtube.com/%ZZ','https://youtube.com/@a%2Fb','file:///etc/passwd']) {
  test(`rejects unsafe or unsupported input ${String(input).slice(0,65)}`,()=>assert.throws(()=>parseInput(input)));
}
