/**
 * OX B9.2 Step J / OFFLINE builder for hash-only D1 membership rows.
 * Full catalog/t1 validation happens ONCE before staging index creation,
 * never once per audio byte-range request. Do not publish these rows as-is.
 */
import {assertProtectedCatalog} from '../../staging/catalog-compat.mjs';
import {membershipDigest} from './index-gate.mjs';
export async function buildIndexRows({catalog,playerKey}={}){
  if(!Buffer.isBuffer(playerKey)||playerKey.length!==32)throw Error('INVALID_TEST_KEY');
  assertProtectedCatalog(catalog,playerKey,{id:catalog.storyId,sourceVersion:catalog.sourceVersion});
  const result=[],seen=new Set();
  for(const folder of Object.values(catalog.folders))for(const track of folder.tracks){
    const hash=await membershipDigest(track.key);
    if(seen.has(hash))throw Error('DUPLICATE_MEMBERSHIP');
    seen.add(hash);
    result.push({storyId:catalog.storyId,generationId:catalog.generationId,
      sourceVersion:catalog.sourceVersion,tokenDigest:hash});
  }
  if(result.length!==catalog.trackCount)throw Error('INCOMPLETE_INDEX');
  return result;
}
