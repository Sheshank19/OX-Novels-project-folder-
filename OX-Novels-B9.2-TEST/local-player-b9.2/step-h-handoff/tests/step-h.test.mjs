import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {stepECandidateGate,receiptSeal} from '../../step-e-quarantine/src/candidate-gate.mjs';
import {inventoryCommitments,sealedBaselineMac,buildProtectedCatalog} from '../../staging/catalog-compat.mjs';
import {selectQuarantinedPair,prepareHandoff,verifyLocalBundle} from '../src/step-h-bundle.mjs';
import {MAX_CATALOG,createManifest,assembleAndVerify} from '../../step-g-protected-stage/src/vault-core.mjs';

const root='root_test_0CCCCCCCCCC', child='folder_test_0DDDDDDDDD';
const secret='fixture-stage-only-not-for-production-123456789';
const key=crypto.randomBytes(32);
const story={id:'fake-story',folderId:root,sourceVersion:crypto.createHash('sha256').update(root).digest('hex').slice(0,12)};
const track=(id,i)=>({id,name:'Test audio '+i+'.mp3',mimeType:'audio/mpeg',size:i+100,modifiedAt:'2026-10-15T12:00:00.000Z'});
const nodes=changed=>({
  [root]:{name:'Test Root',folders:[{id:child,name:'Chapters'}],tracks:[],truncated:false},
  [child]:{name:'Chapters',folders:[],tracks:[track('file_AAAAAAAAAAAAAA',1),...(changed?[track('file_BBBBBBBBBBBBBB',2)]:[])],truncated:false}
});
function baseline(n){const x=inventoryCommitments(secret,root,n);
  const b={schema:1,stageVersion:'ox-stage-readonly-v1',rootMac:x.rootMac,
    folderCount:Object.keys(x.folders).length,trackCount:Object.keys(x.tracks).length,
    folders:x.folders,tracks:x.tracks};b.mac=sealedBaselineMac(secret,b);return b;}
const previous=buildProtectedCatalog({story,root,nodes:nodes(false),key,
  generationId:'g_previous_fake_0001',builtAt:'2026-10-15T12:00:00.000Z'});
const savedBaseline=baseline(nodes(false));
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ox-b92-h-'));
async function changedPair(rootDir){
  const q=path.join(rootDir,'step-e');
  const result=await stepECandidateGate({root,secret,baseline:savedBaseline,
    readPass:async()=>({nodes:nodes(true),pages:2}),story,key,staticCatalog:previous,
    quarantineDir:q});
  assert.equal(result.prepared,true);
  return {q,result,...selectQuarantinedPair(q)};
}
function opts(pair){return {catalogBytes:fs.readFileSync(pair.catalogPath),
  receiptBytes:fs.readFileSync(pair.receiptPath),staticCatalog:previous,
  key,secret,baseline:savedBaseline,story};}
const withDir=async fn=>{const dir=temp();try{await fn(dir);}finally{fs.rmSync(dir,{force:true,recursive:true});}};

// Focus: a sealed changed-catalog pair, not a synthetic upload to any Worker.
test('no sealed Step E pair -> no bundling and no new directories',async()=>withDir(async d=>{
  const q=path.join(d,'step-e');assert.equal(selectQuarantinedPair(q),null);
  assert.deepEqual(fs.readdirSync(d),[]);
}));
test('unchanged Step E story produces no usable handoff',async()=>withDir(async d=>{
  const q=path.join(d,'step-e');const r=await stepECandidateGate({root,secret,baseline:savedBaseline,
    readPass:async()=>({nodes:nodes(false),pages:1}),story,key,staticCatalog:previous,quarantineDir:q});
  assert.equal(r.state,'UNCHANGED');assert.equal(selectQuarantinedPair(q),null);
}));
test('valid changed Step E pair -> private persisted Step G chunk bundle, byte-for-byte verified',async()=>withDir(async d=>{
  const pair=await changedPair(d);const out=path.join(d,'bundles');
  const report=await prepareHandoff({...opts(pair),persistDir:out});
  assert.equal(report.state,'PRIVATE_HANDOFF_READY');
  assert.equal(report.trackCount,2);assert.equal(report.folderCount,2);
  assert.equal(report.created,true);assert.equal(report.publicationAllowed,false);
  const dest=path.join(out,'bundle-'+report.manifestId);
  assert.equal((await verifyLocalBundle(dest,report.manifestId)).verified,true);
  assert.equal(fs.readdirSync(path.join(dest,'PRIVATE-CHUNKS')).length,report.chunkCount);
  const manifest=JSON.parse(fs.readFileSync(path.join(dest,'MANIFEST.json'),'utf8'));
  assert.equal(manifest.receiptSha256,crypto.createHash('sha256').update(opts(pair).receiptBytes).digest('hex'));
  assert.equal(manifest.activationDisabled,true);
  assert.ok(!JSON.stringify(manifest).includes('Test audio'));
}));
test('rerun is idempotent and never overwrites an intact immutable bundle',async()=>withDir(async d=>{
  const pair=await changedPair(d);const out=path.join(d,'bundles');
  const first=await prepareHandoff({...opts(pair),persistDir:out});
  const second=await prepareHandoff({...opts(pair),persistDir:out});
  assert.equal(first.created,true);assert.equal(second.created,false);
  assert.deepEqual(fs.readdirSync(out),['bundle-'+first.manifestId]);
}));
test('changed receipt content or HMAC fails before any local bundle writing',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);const dir=path.join(d,'out');
  const r=JSON.parse(o.receiptBytes);r.trackCount++;
  await assert.rejects(prepareHandoff({...o,receiptBytes:Buffer.from(JSON.stringify(r)),persistDir:dir}),/STEP_E_RECEIPT_INVALID/);
  assert.ok(!fs.existsSync(dir));
}));
test('explicit publication flags never accepted even with recomputed HMAC',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);const r=JSON.parse(o.receiptBytes);
  r.requiresHumanReview=false;r.seal=receiptSeal(secret,r);
  await assert.rejects(prepareHandoff({...o,receiptBytes:Buffer.from(JSON.stringify(r))}),/UNSAFE_PUBLICATION_FLAGS/);
}));
test('wrong Player encryption key blocks bundle creation',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);const dir=path.join(d,'out');
  await assert.rejects(prepareHandoff({...o,key:crypto.randomBytes(32),persistDir:dir}),/PLAYER_TOKEN_VALIDATION_FAILED/);
  assert.ok(!fs.existsSync(dir));
}));
test('stale old static catalog digest prevents handoff',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);
  const other=buildProtectedCatalog({story,root,nodes:nodes(false),key,
    generationId:'g_another_valid_static_001',builtAt:'2026-10-15T12:00:00.000Z'});
  await assert.rejects(prepareHandoff({...o,staticCatalog:other}),/STATIC_CATALOG_STALE/);
}));
test('tampered or noncanonical catalog bytes fail before bundle creation',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);const dir=path.join(d,'out');
  const modified=JSON.parse(o.catalogBytes);modified.folderCount+=1;
  await assert.rejects(prepareHandoff({...o,catalogBytes:Buffer.from(JSON.stringify(modified)),persistDir:dir}),/STEP_E_RECEIPT_INVALID/);
  await assert.rejects(prepareHandoff({...o,catalogBytes:Buffer.from(' '+o.catalogBytes.toString()),persistDir:dir}),/PRIVATE_CANDIDATE_INVALID/);
  assert.ok(!fs.existsSync(dir));
}));
test('mismatched sealed baseline refuses Step E pair',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);
  await assert.rejects(prepareHandoff({...o,baseline:{...savedBaseline,mac:'0'.repeat(64)}}),/STEP_E_RECEIPT_INVALID/);
}));
test('tampered existing bundle is not silently overwritten on rerun',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);const out=path.join(d,'out');
  const first=await prepareHandoff({...o,persistDir:out});
  const manifest=path.join(out,'bundle-'+first.manifestId,'MANIFEST.json');
  fs.writeFileSync(manifest,'{}');
  await assert.rejects(prepareHandoff({...o,persistDir:out}),/PRIVATE_BUNDLE_TAMPERED/);
  assert.equal(fs.readFileSync(manifest,'utf8'),'{}');
}));
test('missing private chunk prevents verification or idempotent reuse',async()=>withDir(async d=>{
  const pair=await changedPair(d);const o=opts(pair);const out=path.join(d,'out');
  const first=await prepareHandoff({...o,persistDir:out});
  const dest=path.join(out,'bundle-'+first.manifestId);
  fs.rmSync(path.join(dest,'PRIVATE-CHUNKS','000.PRIVATE-CHUNK.bin'));
  await assert.rejects(verifyLocalBundle(dest,first.manifestId),/PRIVATE_BUNDLE_INCOMPLETE/);
  await assert.rejects(prepareHandoff({...o,persistDir:out}),/PRIVATE_BUNDLE_INCOMPLETE/);
}));
test('orphan receipt and multiple Step E pairs are rejected',async()=>withDir(async d=>{
  const pair=await changedPair(d);
  fs.writeFileSync(path.join(pair.q,'quarantine-'+'a'.repeat(24)+'.PRIVATE-RECEIPT.json'),'{}');
  assert.throws(()=>selectQuarantinedPair(pair.q),/QUARANTINE_PAIR_AMBIGUOUS/);
  fs.rmSync(pair.catalogPath);
  assert.throws(()=>selectQuarantinedPair(pair.q),/QUARANTINE_PAIR_AMBIGUOUS/);
}));
test('local handoff module exposes NO upload, activation, or Drive scanning imports',async()=>{
  const src=fs.readFileSync(new URL('../src/step-h-bundle.mjs',import.meta.url),'utf8');
  const cli=fs.readFileSync(new URL('../scripts/prepare-step-h-local.mjs',import.meta.url),'utf8');
  for(const pattern of [/\bfetch\s*\(/,/\bhttps?\.request\s*\(/, /\bwrangler\b.*\bdeploy\b/,/\.put\s*\(.*STAGE_KV/]){
    assert.doesNotMatch(src,pattern);assert.doesNotMatch(cli,pattern);
  }
});
test('Step G size cap refuses oversized private catalog before any persistence',async()=>{
  assert.ok(MAX_CATALOG>=560359);
  const {splitPrivateCatalog}=await import('../../step-g-protected-stage/src/vault-core.mjs');
  assert.throws(()=>splitPrivateCatalog(new Uint8Array(MAX_CATALOG+1)),/CATALOG_SIZE_UNSUPPORTED/);
});

test('534-track-sized catalog (~560 KB) becomes exactly verified 24 KiB chunks',async()=>{
  const candidateBytes=crypto.randomBytes(560359);
  const receiptBytes=Buffer.from('synthetic receipt');
  const previousBytes=Buffer.from('synthetic old catalog');
  const {manifest,parts}=await createManifest({candidateBytes,receiptBytes,previousBytes,
    folderCount:7,trackCount:534});
  assert.equal(parts.length,23);
  assert.equal(manifest.totalBytes,560359);
  assert.deepEqual(Buffer.from(await assembleAndVerify(manifest,parts)),candidateBytes);
  assert.equal(manifest.pinnedSnapshotProven,false);
});
test('symlink input in sealed Step E directory is rejected',async t=>withDir(async d=>{
  const pair=await changedPair(d);
  fs.rmSync(pair.catalogPath);
  const target=path.join(d,'borrowed.json');fs.writeFileSync(target,'{}');
  try {
    // Prefer a real filesystem symlink wherever the OS permits it.
    fs.symlinkSync(target,pair.catalogPath,'file');
  } catch (err) {
    // Windows without Developer Mode / symlink privilege commonly throws EPERM.
    // That is a test-fixture setup failure, not a handoff-security failure.
    if (!['EPERM','EACCES','ENOTSUP'].includes(err?.code)) throw err;
    // Still exercise the production guard: simulate lstat() identifying the
    // candidate as a symlink, rather than disabling the symlink check.
    fs.copyFileSync(target,pair.catalogPath);
    const originalLstat=fs.lstatSync;
    let inspected=0;
    try {
      fs.lstatSync=(p,...args)=>{
        const stat=originalLstat(p,...args);
        if (path.resolve(String(p))!==path.resolve(pair.catalogPath)) return stat;
        inspected++;
        return {...stat,isFile:()=>true,isSymbolicLink:()=>true};
      };
      assert.throws(()=>selectQuarantinedPair(pair.q),/QUARANTINE_FILE_UNSAFE/);
      assert.equal(inspected,1,'symlink-safe file metadata check must be reached');
    } finally {
      fs.lstatSync=originalLstat;
    }
    t.diagnostic('OS symlink creation unavailable; lstat symlink-rejection guard verified using a local mock');
    return;
  }
  assert.throws(()=>selectQuarantinedPair(pair.q),/QUARANTINE_FILE_UNSAFE/);
}));
