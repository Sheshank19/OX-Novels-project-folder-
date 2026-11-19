/* B9.2.5 LOCAL CONTRACT ONLY. No real Apps Script source is present in the upload.
 * This adapts an injected, trusted paginated resolver for offline tests.
 * A self-declared snapshot revision is NOT proof of a stable Drive snapshot.
 */
import {validateCompactPage} from './b924-compact-checkpoints.js';
const ID=/^[A-Za-z0-9_-]{10,}$/;
const REV=/^[A-Za-z0-9._:-]{8,160}$/;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const requireOk=(p,message)=>{if(!p)throw Error(message);};
function revision(x){requireOk(typeof x==='string'&&REV.test(x),'Invalid resolver revision');return x;}
export function validateBeginEnvelope(raw,{rootFolderId}={}){
 requireOk(isObj(raw)&&raw.ok===true&&raw.complete===true,'Resolver begin must be complete');
 requireOk(ID.test(rootFolderId)&&raw.rootFolderId===rootFolderId,'Resolver root binding mismatch');
 requireOk(raw.stableSnapshot===true,'Resolver did not guarantee pinned snapshot');
 const snapshotRevision=revision(raw.snapshotRevision);
 requireOk(Number.isSafeInteger(raw.expiresAtMs)&&raw.expiresAtMs>0,'Invalid snapshot expiry');
 return Object.freeze({snapshotRevision,expiresAtMs:raw.expiresAtMs,rootFolderId});
}
export function validatePageEnvelope(raw,session,{folderId,pageNo,nowMs}={}){
 requireOk(isObj(session)&&REV.test(session.snapshotRevision),'No pinned resolver session');
 requireOk(Number.isSafeInteger(nowMs)&&nowMs>=0&&nowMs<session.expiresAtMs,'Drive snapshot expired');
 requireOk(isObj(raw)&&raw.ok===true&&raw.complete===true&&raw.truncated===false,'Truncated or missing resolver response');
 requireOk(raw.snapshotRevision===session.snapshotRevision,'Drive snapshot revision drift');
 requireOk(raw.folderId===folderId&&ID.test(folderId),'Drive folder binding mismatch');
 requireOk(raw.pageNo===pageNo,'Drive page cursor mismatch');
 const validated=validateCompactPage(raw);
 requireOk(validated.pageNo===pageNo,'Page mismatch');
 return Object.freeze({page:raw,snapshotRevision:session.snapshotRevision});
}
export function validateEndEnvelope(raw,session,{nowMs}={}){
 requireOk(isObj(session)&&REV.test(session.snapshotRevision),'No pinned resolver session');
 requireOk(Number.isSafeInteger(nowMs)&&nowMs>=0&&nowMs<session.expiresAtMs,'Drive snapshot expired before sealing');
 requireOk(isObj(raw)&&raw.ok===true&&raw.complete===true&&raw.stableSnapshot===true,'Unverified Drive snapshot finalization');
 requireOk(raw.snapshotRevision===session.snapshotRevision&&raw.rootFolderId===session.rootFolderId,'Drive snapshot changed during scan');
 requireOk(raw.stillCurrent===true,'Drive changed during scan; old catalog must remain');
 return Object.freeze({snapshotVerified:true,endSnapshotRevision:session.snapshotRevision});
}
/** Mock-only: slices a frozen copy of cached data. Real Apps Script code is absent.
 * Illustrates the required begin/page/end contract, NOT a live Drive adapter.
 */
export function makeLocalSnapshotResolver(source,{revision='localSnapshot-001',startedAtMs=1000,ttlMs=3600000}={}){
 requireOk(source?.rootFolderId&&isObj(source.nodes),'Invalid local cached source');
 const frozen=structuredClone(source);let invalidated=false;
 const expiresAtMs=startedAtMs+ttlMs;
 return {
  invalidate(){invalidated=true;},
  async begin(rootFolderId){return {ok:true,complete:true,stableSnapshot:true,rootFolderId,snapshotRevision:revision,expiresAtMs};},
  async page({folderId,pageNo,snapshotRevision}){
   requireOk(snapshotRevision===revision,'Invalid local snapshot cursor');
   const node=frozen.nodes[folderId];requireOk(node,'Missing folder');
   const totalPages=Math.max(1,Math.ceil(node.folders.length/25),Math.ceil(node.tracks.length/40));
   requireOk(pageNo>=0&&pageNo<totalPages,'Page out of range');
   return {ok:true,complete:true,truncated:false,snapshotRevision:revision,folderId,pageNo,totalPages,name:node.name,
    folders:node.folders.slice(pageNo*25,(pageNo+1)*25),tracks:node.tracks.slice(pageNo*40,(pageNo+1)*40)};
  },
  async end(rootFolderId){return {ok:true,complete:true,stableSnapshot:true,snapshotRevision:revision,rootFolderId,stillCurrent:!invalidated};}
 };
}
