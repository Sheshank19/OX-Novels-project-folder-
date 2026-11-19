import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildProtectedCatalog,decryptToken} from '../../staging/catalog-compat.mjs';
import {buildIndexRows} from '../src/build-index.mjs';
import {authorizeIndexedTrack,d1MembershipReader,MEMBERSHIP_SQL,membershipDigest} from '../src/index-gate.mjs';
const schema=fs.readFileSync(new URL('../sql/STEP-J-LOCAL-INDEX-SCHEMA.sql',import.meta.url),'utf8');
const story={id:'b92-step-j-fixture',sourceVersion:'abcdef123456',folderId:'rootfolderdemo0001'};
const key=crypto.createHash('sha256').update('b92-step-j-NON-PRODUCTION').digest();
const d='2026-10-01T01:02:03.000Z';
function nodes(add=0){
  const root={id:story.folderId,name:'synthetic root',folders:[],tracks:[]};
  const all={[story.folderId]:root};
  for(let f=0;f<6;f++){
    const id=`syntheticFolder${String(f).padStart(5,'0')}`;
    root.folders.push({id,name:`Part ${f}`});
    const folder={id,name:`Part ${f}`,folders:[],tracks:[]};
    all[id]=folder;
  }
  for(let i=0;i<534+add;i++){
    const parent=all[`syntheticFolder${String(i%6).padStart(5,'0')}`];
    parent.tracks.push({id:`syntheticFile${String(i).padStart(8,'0')}`,
      name:`Synthetic Episode ${i+1}`,mimeType:'audio/mpeg',size:10000+i,modifiedAt:d});
  }
  return all;
}
const make=(g,add=0)=>buildProtectedCatalog({story,root:story.folderId,
  nodes:nodes(add),key,generationId:g,builtAt:d});
const old=make('g_step_j_previous_001');
const current=make('g_step_j_current_002',1);
const unlisted=buildProtectedCatalog({story,root:story.folderId,nodes:{
  [story.folderId]:{id:story.folderId,name:'root',folders:[],tracks:[
    {id:'extraUnlistedFile99999',name:'not in catalog',mimeType:'audio/mpeg',size:555,modifiedAt:d}]
  }},key,generationId:current.generationId,builtAt:d});
const tokens=c=>Object.values(c.folders).flatMap(x=>x.tracks.map(t=>t.key));
const oldToken=tokens(old)[0];
const currentToken=tokens(current)[0];
const unlistedToken=tokens(unlisted)[0];
const session={authenticated:true,storyId:story.id};
const verifyEntitlement=async()=>true;
const decryptTrackToken=t=>decryptToken(t,key);
const now=123_456;
let db,rowsOld,rowsCurrent,readCalls;
function freshDb(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 const insert=sql.prepare('INSERT INTO b92_j_members (story_id,generation_id,source_version,token_digest) VALUES (?,?,?,?)');
 for(const r of rowsOld)insert.run(r.storyId,r.generationId,r.sourceVersion,r.tokenDigest);
 for(const r of rowsCurrent)insert.run(r.storyId,r.generationId,r.sourceVersion,r.tokenDigest);
 sql.prepare(`INSERT INTO b92_j_pointers (story_id,revision,current_generation,current_source_version,previous_generation,previous_source_version,grace_until_ms) VALUES (?,?,?,?,?,?,?)`)
 .run(story.id,3,current.generationId,story.sourceVersion,old.generationId,story.sourceVersion,now+10000);
 return sql;
}
async function gate(token,override={}){
 const args={authenticatedSession:session,verifyEntitlement,decryptTrackToken,
 trackToken:token, now, readMembership:async params=>{
  readCalls++;return db.prepare(MEMBERSHIP_SQL).get(params.storyId,params.generationId,params.sourceVersion,params.tokenDigest,params.now);
 },...override};
 return authorizeIndexedTrack(args);
}
const code=async(f,c)=>assert.rejects(f,e=>e?.code===c);

test('builder validates 7-folder 534-track synthetic catalog and creates only hashed membership rows',async()=>{
 rowsOld=await buildIndexRows({catalog:old,playerKey:key});
 rowsCurrent=await buildIndexRows({catalog:current,playerKey:key});
 assert.equal(Object.keys(old.folders).length,7);
 assert.equal(rowsOld.length,534);
 assert.equal(rowsCurrent.length,535);
 assert.equal(new Set(rowsOld.map(r=>r.tokenDigest)).size,534);
 assert.ok(rowsOld.every(x=>/^[a-f0-9]{64}$/.test(x.tokenDigest)));
 assert.ok(!JSON.stringify(rowsOld).includes('t1.'));
 assert.ok(!JSON.stringify(rowsOld).includes('syntheticFile'));
 db=freshDb();readCalls=0;
});
test('SQLite plans indexed pointer + indexed token lookup, not catalog scan',()=>{
 const plan=db.prepare('EXPLAIN QUERY PLAN '+MEMBERSHIP_SQL).all(story.id,current.generationId,story.sourceVersion,'0'.repeat(64),now);
 const detail=plan.map(p=>p.detail).join(' / ');
 assert.match(detail,/INDEX|PRIMARY KEY/i);
 assert.match(detail,/SEARCH m USING PRIMARY KEY/i);
 assert.doesNotMatch(detail,/SCAN m\b/i);
});
test('current token accepted with exactly one indexed SQL read',async()=>{
 readCalls=0;const r=await gate(currentToken);assert.equal(r.role,'current');assert.equal(r.revision,3);
 assert.equal(r.streamNotImplemented,true);assert.equal(readCalls,1);
});
test('previous valid token accepted only while grace exists',async()=>{
 readCalls=0;const r=await gate(oldToken);assert.equal(r.role,'previous');assert.equal(readCalls,1);
});
test('previous token rejected at and after grace expiry',async()=>{
 readCalls=0;await code(()=>gate(oldToken,{now:now+10000}),'GENERATION_OR_MEMBERSHIP_REJECTED');
 assert.equal(readCalls,1);
});
test('authenticated encrypted token absent from index rejected',async()=>{
 readCalls=0;await code(()=>gate(unlistedToken),'GENERATION_OR_MEMBERSHIP_REJECTED');
 assert.equal(readCalls,1);
});
test('authentication and entitlement checked before token decryption or SQL',async()=>{
 readCalls=0;
 await code(()=>gate('malformed',{authenticatedSession:null}),'PLAYER_SESSION_REQUIRED');
 await code(()=>gate('malformed',{verifyEntitlement:async()=>false}),'PLAYER_ENTITLEMENT_REQUIRED');
 assert.equal(readCalls,0);
});
test('modified ciphertext and cross-story session rejected with zero SQL reads',async()=>{
 readCalls=0;
 const parts=currentToken.split('.');
 const damaged=parts.slice();damaged[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 await code(()=>gate(damaged.join('.')),'TRACK_TOKEN_AUTH_FAILED');
 await code(()=>gate(currentToken,{authenticatedSession:{authenticated:true,storyId:'another-story'}}),'TRACK_IDENTITY_INVALID');
 assert.equal(readCalls,0);
});
test('source-version mismatch never matches membership even with valid ciphertext',async()=>{
 const alien={...current,sourceVersion:'123456abcdef'};
 // Build a validly encrypted, other source-version token against a separate fixture.
 const otherStory={...story,sourceVersion:'123456abcdef'};
 const c=buildProtectedCatalog({story:otherStory,root:story.folderId,nodes:{
 [story.folderId]:{id:story.folderId,name:'other',folders:[],tracks:[{id:'otherSourceFile000',name:'other',size:100,modifiedAt:d,mimeType:'audio/mpeg'}]}
 },key,generationId:current.generationId,builtAt:d});
 readCalls=0;await code(()=>gate(tokens(c)[0]),'GENERATION_OR_MEMBERSHIP_REJECTED');
 assert.equal(readCalls,1);assert.equal(alien.sourceVersion,'123456abcdef');
});
test('no index row returns denial; no static fallback',async()=>{
 db.prepare('DELETE FROM b92_j_members WHERE story_id=? AND generation_id=? AND token_digest=?').run(
 story.id,current.generationId,await membershipDigest(currentToken));
 await code(()=>gate(currentToken),'GENERATION_OR_MEMBERSHIP_REJECTED');
 db.close();db=freshDb();
});
test('D1 error aborts without fallback or private data release',async()=>{
 await code(()=>gate(currentToken,{readMembership:async()=>{throw Error('test DB unavailable');}}),'MEMBERSHIP_STORE_UNAVAILABLE');
});
test('rollback pointer switches current and previous without rewriting membership rows',async()=>{
 const before=db.prepare('SELECT count(*) AS c FROM b92_j_members').get().c;
 db.prepare('UPDATE b92_j_pointers SET current_generation=?,previous_generation=?,revision=revision+1,grace_until_ms=? WHERE story_id=?')
  .run(old.generationId,current.generationId,now+5000,story.id);
 assert.equal((await gate(oldToken)).role,'current');
 assert.equal((await gate(currentToken)).role,'previous');
 assert.equal(db.prepare('SELECT count(*) AS c FROM b92_j_members').get().c,before);
});
test('Cloudflare D1 adapter binds exactly five parameters and issues one first()',async()=>{
  let prepared=0, bound=null, selected=0;
  const dbMock={prepare(sql){prepared++;assert.equal(sql,MEMBERSHIP_SQL);return {
    bind(...args){bound=args;return {first:async()=>{selected++;return {role:'current',revision:2,graceUntil:null};}}}
  };}};
  const data={storyId:story.id,generationId:current.generationId,sourceVersion:story.sourceVersion,tokenDigest:'1'.repeat(64),now};
  assert.equal((await d1MembershipReader(dbMock,data)).role,'current');
  assert.equal(prepared,1);assert.equal(selected,1);
  assert.deepEqual(bound,[data.storyId,data.generationId,data.sourceVersion,data.tokenDigest,data.now]);
});
test('no bulk catalog iteration, network, or publishing in runtime gate',()=>{
 const src=fs.readFileSync(new URL('../src/index-gate.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|\bwrangler\b|\.put\s*\(|Object\.values\(.*folders|\bdeploy\s*\(/);
 assert.match(src,/streamNotImplemented:true/);
 db.close();
});
