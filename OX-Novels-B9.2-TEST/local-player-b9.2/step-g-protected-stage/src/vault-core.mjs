/**
 * B9.2 Step G -- PRIVATE protected-catalog quarantine transport contract.
 * Worker-compatible, no Node imports. No story IDs, folder names, file IDs,
 * audio, token keys or catalog bytes appear in the manifest.
 * This is intentionally NOT a publication or activation API.
 */
export const MAX_PART = 24 * 1024;
export const MAX_PARTS = 96;
export const MAX_CATALOG = MAX_PART * MAX_PARTS;
const HEX = /^[a-f0-9]{64}$/;
const exact=(obj,keys)=>!!obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).length===keys.length && Object.keys(obj).every(k=>keys.includes(k));
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function isHex(s){return typeof s==='string'&&HEX.test(s);}
export async function digestBytes(data){
  const bytes=typeof data==='string'?new TextEncoder().encode(data):data;
  const result=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(result)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateManifest(m){
  if(!exact(m,['schema','kind','catalogSha256','receiptSha256','previousSha256',
    'totalBytes','parts','folderCount','trackCount','publicationAllowed',
    'pinnedSnapshotProven','requiresHumanReview','activationDisabled']) ||
    m.schema!==1 || m.kind!=='ox-b92-step-g-protected-quarantine-v1' ||
    m.publicationAllowed!==false || m.pinnedSnapshotProven!==false ||
    m.requiresHumanReview!==true || m.activationDisabled!==true ||
    !isHex(m.catalogSha256)||!isHex(m.receiptSha256)||!isHex(m.previousSha256) ||
    !Number.isSafeInteger(m.totalBytes)||m.totalBytes<1||m.totalBytes>MAX_CATALOG ||
    !Number.isSafeInteger(m.folderCount)||m.folderCount<1||m.folderCount>61 ||
    !Number.isSafeInteger(m.trackCount)||m.trackCount<1||m.trackCount>20000 ||
    !Array.isArray(m.parts)||m.parts.length<1||m.parts.length>MAX_PARTS)
    fail('INVALID_QUARANTINE_MANIFEST');
  let size=0;
  for(const p of m.parts){
    if(!exact(p,['digest','bytes'])||!isHex(p.digest)||
      !Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>MAX_PART)
      fail('INVALID_QUARANTINE_MANIFEST');
    size+=p.bytes;
  }
  if(size!==m.totalBytes)fail('INVALID_QUARANTINE_MANIFEST');
  return m;
}
export function splitPrivateCatalog(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>MAX_CATALOG)
    fail('CATALOG_SIZE_UNSUPPORTED');
  const parts=[];
  for(let offset=0;offset<bytes.length;offset+=MAX_PART)parts.push(bytes.slice(offset,offset+MAX_PART));
  return parts;
}
export async function assembleAndVerify(m,parts){
  validateManifest(m);
  if(!Array.isArray(parts)||parts.length!==m.parts.length)fail('INCOMPLETE_QUARANTINE');
  const all=new Uint8Array(m.totalBytes);
  let offset=0;
  for(let i=0;i<parts.length;i++){
    const p=parts[i];
    if(!(p instanceof Uint8Array)||p.length!==m.parts[i].bytes||
        await digestBytes(p)!==m.parts[i].digest)fail('CHUNK_INTEGRITY_FAILED');
    all.set(p,offset);offset+=p.length;
  }
  if(await digestBytes(all)!==m.catalogSha256)fail('CATALOG_INTEGRITY_FAILED');
  return all;
}
/** Strict manifest is made only AFTER Step E receipt + AES token verification. */
export async function createManifest({candidateBytes,receiptBytes,previousBytes,folderCount,trackCount}){
  const parts=splitPrivateCatalog(candidateBytes);
  const manifest={schema:1,kind:'ox-b92-step-g-protected-quarantine-v1',
    catalogSha256:await digestBytes(candidateBytes),
    receiptSha256:await digestBytes(receiptBytes),
    previousSha256:await digestBytes(previousBytes),
    totalBytes:candidateBytes.length,
    parts:await Promise.all(parts.map(async p=>({digest:await digestBytes(p),bytes:p.length}))),
    folderCount,trackCount,publicationAllowed:false,pinnedSnapshotProven:false,
    requiresHumanReview:true,activationDisabled:true};
  validateManifest(manifest);
  return {manifest,parts};
}
