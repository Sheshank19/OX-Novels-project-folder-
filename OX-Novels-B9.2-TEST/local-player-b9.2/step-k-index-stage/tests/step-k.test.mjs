import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.mjs';
import {buildSeed} from '../scripts/generate-synthetic-seed.mjs';
import {CURRENT_COUNT,PREVIOUS_COUNT,CURRENT,PREVIOUS,STORY,SOURCE} from '../src/synthetic-fixture.mjs';
import {MEMBERSHIP_SQL} from '../src/step-j-index-gate.mjs';

const secret='synthetic-only-stage-secret-1234567890-abcdef';
const base='https://ox-b92-step-k-index-stage.ox-audio-player.workers.dev';
const headers=()=>({'authorization':'Bearer '+secret,'content-type':'application/json'});
let sqlite;
function dbAdapter(db){return {withSession(mode){assert.equal(mode,'first-primary');return {
 prepare(sql){const st=db.prepare(sql);return {bind(...args){return {
  async first(){return st.get(...args)||null;},
  async run(){throw Error('NO_D1_WRITES_ALLOWED_IN_WORKER');}
 };}};}
 };}};}
function env(extra={}){return {STAGE_MODE:'index-benchmark-only',STAGE_BENCH_TOKEN:secret,INDEX_STAGE_DB:dbAdapter(sqlite),...extra};}
async function req(route='/v1/benchmark',method='POST',body={sample:'current'},extra={},url=base){
 const h={...headers(),...extra};
 const r=new Request(url+route,{method,headers:h,body:method==='GET'?undefined:JSON.stringify(body)});
 const response=await worker.fetch(r,env());
 return {status:response.status,data:await response.json()};
}

test('synthetic seed contains exactly 534 + 535 hash-only rows, no secrets or raw track tokens',async()=>{
 const text=await buildSeed();
 assert.doesNotMatch(text,/t1\.|STAGE_BENCH_TOKEN|audio\/|drive\.google|\.mp3|\.m4a/);
 sqlite=new DatabaseSync(':memory:');
 const schema=fs.readFileSync(new URL('../migrations/0001_index_shadow.sql',import.meta.url),'utf8');
 sqlite.exec(schema);sqlite.exec(text);
 const counts=sqlite.prepare('SELECT generation_id,COUNT(*) AS c FROM b92_j_members GROUP BY generation_id').all();
 assert.deepEqual(Object.fromEntries(counts.map(x=>[x.generation_id,x.c])),{[CURRENT]:CURRENT_COUNT,[PREVIOUS]:PREVIOUS_COUNT});
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM b92_j_members').get().n,1069);
 assert.equal(sqlite.prepare('SELECT revision FROM b92_j_pointers WHERE story_id=?').get(STORY).revision,2);
});
test('SQLite query plan uses membership primary-key index, never scans all members',()=>{
 const plan=sqlite.prepare('EXPLAIN QUERY PLAN '+MEMBERSHIP_SQL)
  .all(STORY,CURRENT,SOURCE,'0'.repeat(64),Date.now()).map(x=>x.detail).join(' / ');
 assert.match(plan,/SEARCH m USING PRIMARY KEY/);
 assert.doesNotMatch(plan,/SCAN m\b/);
});
test('public health is safe and discloses no private index contents',async()=>{
 const r=await worker.fetch(new Request(base+'/health'),env());
 assert.equal(r.status,200);const j=await r.json();assert.equal(j.publicationDisabled,true);
 assert.equal(j.playback,false);assert.equal(j.realTokensAccepted,false);
});
test('authenticated status reports only staged synthetic row count',async()=>{
 const {status,data}=await req('/v1/status','GET');assert.equal(status,200);
 assert.equal(data.memberRows,1069);assert.equal(data.revision,2);
 assert.equal(data.currentGeneration,CURRENT);
 assert.equal(data.previousGeneration,PREVIOUS);
});
test('one indexed D1 read accepts current fixture token digest',async()=>{
 const {status,data}=await req();assert.equal(status,200);
 assert.equal(data.role,'current');assert.equal(data.matched,true);
 assert.equal(data.indexedD1Queries,1);assert.equal(data.realTokenDecrypted,false);
});
test('one indexed D1 read accepts previous synthetic fixture in test grace',async()=>{
 const {status,data}=await req('/v1/benchmark','POST',{sample:'previous'});
 assert.equal(status,200);assert.equal(data.role,'previous');
});
test('missing index row is denied, no fallback',async()=>{
 const {status,data}=await req('/v1/benchmark','POST',{sample:'missing'});
 assert.equal(status,200);assert.equal(data.matched,false);assert.equal(data.role,null);
});
test('stage token, origin, query and invalid parameter checks fail closed',async()=>{
 let r=await worker.fetch(new Request(base+'/v1/benchmark',{method:'POST',headers:{'authorization':'Bearer wrong'},body:'{"sample":"current"}'}),env());
 assert.equal(r.status,401);
 r=await worker.fetch(new Request(base+'/v1/benchmark',{method:'POST',headers:{...headers(),origin:'https://evil.example'},body:'{"sample":"current"}'}),env());
 assert.equal(r.status,403);
 r=await req('/v1/benchmark?other=1');assert.equal(r.status,400);
 r=await req('/v1/benchmark','POST',{sample:'current',storyId:STORY});assert.equal(r.status,400);
 r=await req('/v1/benchmark','POST',{sample:'fake'});assert.equal(r.status,400);
 r=await worker.fetch(new Request(base+'/v1/benchmark',{method:'POST',headers:headers(),body:'{"sample":"current","sql":"DROP TABLE"}'}),env());
 assert.equal(r.status,400);
});
test('Worker cannot benchmark against wrong bindings or mode',async()=>{
 let r=await worker.fetch(new Request(base+'/v1/benchmark',{method:'POST',headers:headers(),body:'{"sample":"current"}'}),env({STAGE_MODE:'anything-else'}));
 assert.equal(r.status,503);
 r=await worker.fetch(new Request(base+'/v1/benchmark',{method:'POST',headers:headers(),body:'{"sample":"current"}'}),env({INDEX_STAGE_DB:null}));
 assert.equal(r.status,503);
});
test('D1 outage fails closed, does not claim acceptance',async()=>{
 const broken=env({INDEX_STAGE_DB:{withSession(){return {prepare(){throw Error('simulated outage');}};}}});
 const r=await worker.fetch(new Request(base+'/v1/benchmark',{method:'POST',headers:headers(),body:'{"sample":"current"}'}),broken);
 assert.equal(r.status,503);
 assert.equal((await r.json()).ok,false);
});
test('no endpoints for live Player, uploads, publication, indexing writes or scheduling',async()=>{
 for(const u of ['/v1/upload','/v1/promote','/v1/rollback','/listen/demo','/v1/audio','/v1/schedule']){
  const {status}=await req(u);assert.equal(status,404);
 }
 const source=fs.readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.put\(|\.delete\(|\.run\(|\bawait\s+fetch\s*\(|globalThis\.fetch\s*\(/);
 sqlite.close();
});
