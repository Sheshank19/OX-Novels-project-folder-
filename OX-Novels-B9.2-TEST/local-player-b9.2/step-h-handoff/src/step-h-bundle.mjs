/**
 * OX B9.2 Step H — local-only handoff for a SEALED Step E changed-catalog pair.
 * Creates a PRIVATE, immutable, verifiable Step G-format chunk bundle.
 * No network code, no Worker or KV calls, and NO publication authority.
 * Requires already-validated Step E quarantine input; never manufactures proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertQuarantineReceipt,catalogSemantics} from '../../step-e-quarantine/src/candidate-gate.mjs';
import {assertPlayerKeyMatchesStatic,assertProtectedCatalog} from '../../staging/catalog-compat.mjs';
import {createManifest,assembleAndVerify,digestBytes,validateManifest,MAX_CATALOG} from '../../step-g-protected-stage/src/vault-core.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bundleName=id=>'bundle-'+id;
const chunkName=i=>String(i).padStart(3,'0')+'.PRIVATE-CHUNK.bin';
const label='PRIVATE — DO NOT UPLOAD, PUBLISH, DEPLOY OR SHARE. No snapshot proof.\n';
const same=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
const rawFile=(p,max)=>{
  let s;try{s=fs.lstatSync(p);}catch{fail('QUARANTINE_PAIR_MISSING');}
  if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max)fail('QUARANTINE_FILE_UNSAFE');
  return fs.readFileSync(p);
};
const parseCanonical=(bytes,code)=>{
  let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{fail(code);}
  if(!value||typeof value!=='object'||Array.isArray(value)||
     !same(bytes,Buffer.from(JSON.stringify(value))))fail(code);
  return value;
};
const existsDir=d=>{
  if(!fs.existsSync(d))return false;
  if(!fs.lstatSync(d).isDirectory()||fs.lstatSync(d).isSymbolicLink())fail('PRIVATE_OUTPUT_UNSAFE');
  return true;
};
const directoryFiles=d=>{
  if(!existsDir(d))return [];
  return fs.readdirSync(d).sort();
};

/** Select exactly ONE complete changed-catalog pair. Zero or multiple pairs
 * have no safe automatic selection. Caller may not choose a different file. */
export function selectQuarantinedPair(quarantineDir){
  const entries=directoryFiles(quarantineDir);
  const cats=entries.filter(n=>/^quarantine-[a-f0-9]{24}\.PRIVATE-CATALOG\.json$/.test(n));
  const receipts=entries.filter(n=>/^quarantine-[a-f0-9]{24}\.PRIVATE-RECEIPT\.json$/.test(n));
  if(cats.length===0&&receipts.length===0){
    if(entries.some(n=>n.endsWith('.PRIVATE-CATALOG.json')||n.endsWith('.PRIVATE-RECEIPT.json')||n.endsWith('.tmp')))
      fail('QUARANTINE_PAIR_INCOMPLETE');
    return null;
  }
  if(cats.length!==1||receipts.length!==1)fail('QUARANTINE_PAIR_AMBIGUOUS');
  if(receipts[0]!==cats[0].replace('.PRIVATE-CATALOG.json','.PRIVATE-RECEIPT.json'))
    fail('QUARANTINE_PAIR_INCOMPLETE');
  if(entries.some(n=>n.endsWith('.tmp')))fail('QUARANTINE_PAIR_INCOMPLETE');
  const catalogPath=path.join(quarantineDir,cats[0]);
  const receiptPath=path.join(quarantineDir,receipts[0]);
  // A symlink or missing file cannot be accepted as a sealed Step E pair.
  for(const [p,max] of [[catalogPath,MAX_CATALOG],[receiptPath,100_000]])rawFile(p,max);
  return {catalogPath,receiptPath};
}

/** Build, verify, and (optionally) persist a local Step G bundle.
 * All raw catalog/receipt bytes remain exclusively local. */
export async function prepareHandoff({catalogBytes,receiptBytes,staticCatalog,key,secret,
  baseline,story,persistDir=null}){
  if(!Buffer.isBuffer(catalogBytes)||!Buffer.isBuffer(receiptBytes)||
     !Buffer.isBuffer(key)||key.length!==32||
     typeof secret!=='string'||secret.length<32||!baseline||!story||!staticCatalog)
    fail('STEP_H_PREFLIGHT_FAILED');
  const candidate=parseCanonical(catalogBytes,'PRIVATE_CANDIDATE_INVALID');
  const receipt=parseCanonical(receiptBytes,'PRIVATE_RECEIPT_INVALID');
  if(receipt.publicationAllowed!==false||receipt.pinnedSnapshotProven!==false||
      receipt.requiresHumanReview!==true||receipt.hasAutomaticApproval!==false||
      receipt.stagingOnly!==true||receipt.twoPassObserved!==true)
    fail('UNSAFE_PUBLICATION_FLAGS');
  try{assertQuarantineReceipt({secret,receipt,candidate,baseline});}
  catch{fail('STEP_E_RECEIPT_INVALID');}
  let count;
  try{
    assertPlayerKeyMatchesStatic(staticCatalog,key,story);
    assertProtectedCatalog(staticCatalog,key,{id:story.id,sourceVersion:story.sourceVersion});
    count=assertProtectedCatalog(candidate,key,{id:story.id,sourceVersion:story.sourceVersion});
  }catch{fail('PLAYER_TOKEN_VALIDATION_FAILED');}
  if(count!==receipt.trackCount||candidate.folderCount!==receipt.folderCount||
      count!==candidate.trackCount)fail('QUARANTINE_COUNT_MISMATCH');
  const staticBytes=Buffer.from(JSON.stringify(staticCatalog));
  if(sha(staticBytes)!==receipt.previousCatalogDigest)fail('STATIC_CATALOG_STALE');
  if(catalogSemantics(candidate,key)===catalogSemantics(staticCatalog,key))
    fail('NO_SEMANTIC_CONTENT_CHANGE');
  const {manifest,parts}=await createManifest({candidateBytes:catalogBytes,receiptBytes,
    previousBytes:staticBytes,folderCount:candidate.folderCount,trackCount:count});
  if(manifest.receiptSha256!==sha(receiptBytes)||
      manifest.previousSha256!==sha(staticBytes)||
      manifest.catalogSha256!==receipt.catalogDigest||
      !same(await assembleAndVerify(manifest,parts),catalogBytes))fail('HANDOFF_INTEGRITY_FAILED');
  const manifestBytes=Buffer.from(JSON.stringify(manifest));
  const manifestId=await digestBytes(manifestBytes);
  let created=false;
  if(persistDir){
    const output=await storeLocalBundle({persistDir,manifest,parts,manifestId});
    created=output.created;
  }
  return {state:'PRIVATE_HANDOFF_READY',manifestId,chunkCount:parts.length,
    trackCount:count,folderCount:candidate.folderCount,candidateBytes:catalogBytes.length,
    persisted:!!persistDir,created,publicationAllowed:false,activationDisabled:true,
    pinnedSnapshotProven:false};
}

/** Local disk is not a trusted KV service. Make an atomic, immutable private
 * directory; verify before reusing; refuse collisions or tampering. */
async function storeLocalBundle({persistDir,manifest,parts,manifestId}){
  const parent=path.resolve(persistDir);
  const target=path.join(parent,bundleName(manifestId));
  existsDir(parent);
  if(existsDir(target)){
    await verifyLocalBundle(target,manifestId);
    return {created:false};
  }
  const tmp=path.join(parent,'.step-h-tmp-'+crypto.randomBytes(12).toString('hex'));
  let tempMade=false;
  try{
    fs.mkdirSync(parent,{recursive:true,mode:0o700});
    if(!existsDir(parent))fail('PRIVATE_OUTPUT_UNSAFE');
    fs.mkdirSync(tmp,{recursive:false,mode:0o700});tempMade=true;
    fs.mkdirSync(path.join(tmp,'PRIVATE-CHUNKS'),{mode:0o700});
    fs.writeFileSync(path.join(tmp,'MANIFEST.json'),JSON.stringify(manifest),{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(tmp,'DO-NOT-UPLOAD.txt'),label,{flag:'wx',mode:0o600});
    for(let i=0;i<parts.length;i++){
      fs.writeFileSync(path.join(tmp,'PRIVATE-CHUNKS',chunkName(i)),Buffer.from(parts[i]),{flag:'wx',mode:0o600});
    }
    await verifyLocalBundle(tmp,manifestId);
    fs.renameSync(tmp,target);tempMade=false;
    return {created:true};
  }catch(e){
    if(tempMade)try{fs.rmSync(tmp,{recursive:true,force:true});}catch{}
    fail(e?.code==='PRIVATE_OUTPUT_UNSAFE'?e.code:'PRIVATE_BUNDLE_WRITE_FAILED');
  }
}

/** Reverify complete local bundle without returning its sensitive bytes. */
export async function verifyLocalBundle(dir,expectedId){
  if(!existsDir(dir))fail('PRIVATE_BUNDLE_INCOMPLETE');
  const entries=directoryFiles(dir);
  if(entries.length!==3||!entries.includes('MANIFEST.json')||
     !entries.includes('DO-NOT-UPLOAD.txt')||!entries.includes('PRIVATE-CHUNKS'))
    fail('PRIVATE_BUNDLE_INCOMPLETE');
  const bytes=rawFile(path.join(dir,'MANIFEST.json'),12_000);
  const actualId=sha(bytes);
  if(actualId!==expectedId)fail('PRIVATE_BUNDLE_TAMPERED');
  const manifest=parseCanonical(bytes,'PRIVATE_BUNDLE_TAMPERED');
  try{validateManifest(manifest);}catch{fail('PRIVATE_BUNDLE_TAMPERED');}
  const privateDir=path.join(dir,'PRIVATE-CHUNKS');
  const names=directoryFiles(privateDir);
  if(names.length!==manifest.parts.length||
      names.some((v,i)=>v!==chunkName(i)))fail('PRIVATE_BUNDLE_INCOMPLETE');
  const chunks=manifest.parts.map((_,i)=>new Uint8Array(rawFile(path.join(privateDir,chunkName(i)),24*1024)));
  try{await assembleAndVerify(manifest,chunks);}catch{fail('PRIVATE_BUNDLE_TAMPERED');}
  return {verified:true,parts:chunks.length,bytes:manifest.totalBytes};
}
