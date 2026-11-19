/**
 * OX B9.2: local-only preparation using the existing B5 public catalog format.
 * A PREPARED catalog is NOT safe to activate just because two Drive reads agree.
 * No filesystem/network/Worker side effects in this module.
 */
import crypto from 'node:crypto';

const TRACK_AAD = Buffer.from('OX_PLAYER_TRACK_V1', 'utf8');
const ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const b64 = v => Buffer.from(v).toString('base64url');
const natural = (a,b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {numeric:true,sensitivity:'base'});
export function catalogDigest(secret, tag, value) {
  return crypto.createHmac('sha256', secret).update('ox-b92-story-audit-v1\u0000'+tag+'\u0000'+value).digest('hex');
}
export function sealedBaselineMac(secret, b) {
  const {mac, ...rest} = b;
  return catalogDigest(secret,'baseline-seal', JSON.stringify(rest));
}
export function inventoryCommitments(secret, root, nodes) {
  const rootMac = catalogDigest(secret,'story-root',root);
  const folders = {}, tracks = {};
  for (const [parent,n] of Object.entries(nodes)) {
    for (const f of n.folders || []) {
      const k = catalogDigest(secret,'folder-key',f.id);
      if (k in folders) throw new Error('DUPLICATE_FOLDER');
      folders[k] = catalogDigest(secret,'folder-meta',JSON.stringify([f.name,rootMac]));
    }
    for (const t of n.tracks || []) {
      const k = catalogDigest(secret,'track-key',t.id);
      if (k in tracks) throw new Error('DUPLICATE_TRACK');
      tracks[k] = catalogDigest(secret,'track-meta',JSON.stringify([
        t.name,t.mimeType,t.size,t.modifiedAt,
        catalogDigest(secret,'parent-id',parent)
      ]));
    }
  }
  return {rootMac,folders,tracks};
}
export function identicalCommitments(a,b) {
  const entries = x => JSON.stringify(Object.entries(x).sort(([k],[q])=>k.localeCompare(q)));
  return entries(a.folders) === entries(b.folders) && entries(a.tracks) === entries(b.tracks);
}
export function validateInventory(root,nodes,{maxFolders=61,maxTracks=20000}={}) {
  if (!ID_RE.test(root || '') || !nodes || !nodes[root]) throw new Error('INVALID_ROOT');
  const ids = Object.keys(nodes), seen = new Set(), trackIds = new Set();
  if (ids.length > maxFolders) throw new Error('TOO_MANY_FOLDERS');
  for (const id of ids) {
    if (!ID_RE.test(id) || seen.has(id)) throw new Error('INVALID_FOLDER');
    seen.add(id);
    const n=nodes[id];
    if (!n || typeof n.name!=='string' || !n.name || !Array.isArray(n.folders) || !Array.isArray(n.tracks) || n.truncated) throw new Error('INVALID_NODE');
    if (id!==root && n.folders.length) throw new Error('NESTED_FOLDER_OUT_OF_SCOPE');
    for (const f of n.folders) if (!ID_RE.test(f.id||'') || !ids.includes(f.id) || f.id===root || !f.name) throw new Error('UNVERIFIED_CHILD_FOLDER');
    for (const t of n.tracks) {
      if (!ID_RE.test(t.id||'') || trackIds.has(t.id) || !t.name || !t.mimeType ||
          !Number.isSafeInteger(t.size) || t.size<0 || !Number.isFinite(Date.parse(t.modifiedAt))) throw new Error('INVALID_TRACK');
      trackIds.add(t.id);
      if (trackIds.size>maxTracks) throw new Error('TOO_MANY_TRACKS');
    }
  }
  const children=nodes[root].folders.map(f=>f.id);
  if (new Set(children).size!==children.length || ids.length!==children.length+1 ||
      children.some(id=>!seen.has(id))) throw new Error('FOLDER_STRUCTURE_MISMATCH');
  if (trackIds.size===0) throw new Error('EMPTY_CATALOG_NOT_PREPARABLE');
  return {folderCount:ids.length, trackCount:trackIds.size};
}
export function buildProtectedCatalog({story,root,nodes,key,generationId,builtAt}) {
  if (!Buffer.isBuffer(key) || key.length!==32) throw new Error('PLAYER_KEY_REQUIRED');
  if (!story?.id || !story?.sourceVersion || story.folderId!==root || !generationId) throw new Error('STORY_SOURCE_MISMATCH');
  const counts=validateInventory(root,nodes);
  const storyId=String(story.id), sourceVersion=String(story.sourceVersion);
  const folderKey = id => crypto.createHash('sha256').update(`folder\0${storyId}\0${sourceVersion}\0${id}`).digest('base64url').slice(0,22);
  const fk=new Map(Object.keys(nodes).map(id=>[id,folderKey(id)]));
  const ordered=[];
  function walk(id){
    const n=nodes[id];
    for(const t of [...n.tracks].sort(natural)) ordered.push(t);
    for(const f of [...n.folders].sort(natural)) walk(f.id);
  }
  walk(root);
  if (ordered.length!==counts.trackCount) throw new Error('ORDERING_COUNT_MISMATCH');
  const tokens=new Map();
  for(const t of ordered){
    const payload={kind:'track',storyId,sourceVersion,generationId,fileId:t.id,mimeType:t.mimeType};
    const material=`${storyId}\0${sourceVersion}\0${generationId}\0${t.id}`;
    const iv=crypto.createHmac('sha256',key).update('OX_TRACK_NONCE_V1\0'+material).digest().subarray(0,12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(TRACK_AAD);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
    tokens.set(t.id,`t1.${b64(iv)}.${b64(Buffer.concat([encrypted,cipher.getAuthTag()]))}`);
  }
  const neighbors=new Map();
  for(let i=0;i<ordered.length;i++){
    neighbors.set(ordered[i].id,{
      previousKey:i>0?tokens.get(ordered[i-1].id):'',
      nextKey:i+1<ordered.length?tokens.get(ordered[i+1].id):''
    });
  }
  const folders={};
  for(const [rawId,n] of Object.entries(nodes)){
    folders[fk.get(rawId)]={
      name:n.name,
      folders:[...n.folders].sort(natural).map(f=>({key:fk.get(f.id),name:f.name})),
      tracks:[...n.tracks].sort(natural).map(t=>({
        key:tokens.get(t.id),name:t.name,mimeType:t.mimeType,size:t.size,modifiedAt:t.modifiedAt,
        ...neighbors.get(t.id)
      }))
    };
  }
  const safe={version:1,storyId,sourceVersion,generationId,builtAt,rootKey:fk.get(root),
    folderCount:counts.folderCount,trackCount:counts.trackCount,folders};
  const serialized=JSON.stringify(safe);
  if (/(?:drive\.google\.com|drive\.usercontent\.google\.com|"fileId"\s*:|"rootFolderId"\s*:)/i.test(serialized))
    throw new Error('RAW_DRIVE_DATA_FOUND');
  for(const rawId of [...Object.keys(nodes),...ordered.map(t=>t.id)])
    if(serialized.includes(rawId)) throw new Error('RAW_IDENTIFIER_FOUND');
  return safe;
}
export function decryptToken(token,key) {
  if (typeof token!=='string'||!/^t1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('BAD_TOKEN');
  const [,ivText,dataText]=token.split('.');
  const iv=Buffer.from(ivText,'base64url'), bytes=Buffer.from(dataText,'base64url');
  if (iv.length!==12||bytes.length<17) throw new Error('BAD_TOKEN');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAAD(TRACK_AAD);decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8'));
}
export function assertProtectedCatalog(safe,key,expected) {
  if (!safe || safe.version!==1 || (expected.rootKey && safe.rootKey!==expected.rootKey) ||
      safe.storyId!==expected.id || safe.sourceVersion!==expected.sourceVersion ||
      !safe.folders?.[safe.rootKey] || safe.folderCount!==Object.keys(safe.folders).length) throw new Error('INVALID_PROTECTED_CATALOG');
  let count=0;
  const known=new Set();
  for(const n of Object.values(safe.folders)){
    if(!Array.isArray(n.folders)||!Array.isArray(n.tracks)) throw new Error('INVALID_PROTECTED_NODE');
    for(const t of n.tracks){
      if(known.has(t.key)) throw new Error('DUPLICATE_PROTECTED_TRACK');
      known.add(t.key);
      const p=decryptToken(t.key,key);
      if(p.kind!=='track'||p.storyId!==safe.storyId||p.sourceVersion!==safe.sourceVersion||
          p.generationId!==safe.generationId||!ID_RE.test(p.fileId || '')) throw new Error('INVALID_ENCRYPTED_TRACK');
      count++;
    }
  }
  if(count!==safe.trackCount) throw new Error('PROTECTED_COUNT_MISMATCH');
  return count;
}

export function assertPlayerKeyMatchesStatic(previous,key,story){
  if(!previous || previous.storyId!==story.id || previous.sourceVersion!==story.sourceVersion ||
     !previous.folders || previous.trackCount<1) throw new Error('STATIC_CATALOG_NOT_VERIFIED');
  const ref=Object.values(previous.folders).flatMap(f=>Array.isArray(f.tracks)?f.tracks:[])
    .find(t=>typeof t.key==='string'&&t.key.startsWith('t1.'));
  if(!ref)throw new Error('STATIC_CATALOG_NOT_VERIFIED');
  let p;try{p=decryptToken(ref.key,key);}catch{throw new Error('PLAYER_KEY_DOES_NOT_MATCH_STATIC');}
  if(p.storyId!==previous.storyId || p.sourceVersion!==previous.sourceVersion ||
     p.generationId!==previous.generationId || p.kind!=='track' ||
     !ID_RE.test(p.fileId||'')) throw new Error('STATIC_CATALOG_NOT_VERIFIED');
  return true;
}
