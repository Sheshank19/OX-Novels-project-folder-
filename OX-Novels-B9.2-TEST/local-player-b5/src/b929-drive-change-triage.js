/* OX B9.2.9 - TEST ONLY - conservative Drive Changes API triage.
 * This is not a pinned snapshot, not a live Drive client, and never publishes.
 * It intentionally keeps the user's nightly all-242 scan requirement.
 * No secrets, runtime endpoint, D1/KV write, deploy or GAS modification.
 */
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const DRIVE_ID = /^[A-Za-z0-9_-]{8,}$/;
const STORY_ID = /^[a-z0-9][a-z0-9-]{0,110}$/;
const TOKEN = /^[^\x00-\x20\x7f]{1,4096}$/; // Opaque tokens; do not parse their syntax
const key = value => typeof value === 'string' && DRIVE_ID.test(value);
const token = value => typeof value === 'string' && TOKEN.test(value);
const own = (x,k) => Object.prototype.hasOwnProperty.call(x,k);

function validateChange(c) {
  fail(c && typeof c === 'object' && !Array.isArray(c), 'Invalid change record');
  fail(c.kind === 'drive#change' && c.type === 'file', 'Unknown Drive change kind/type');
  fail(key(c.fileId), 'Missing change file ID');
  fail(typeof c.removed === 'boolean', 'Missing removal state');
  if (own(c,'file') && c.file !== undefined) {
    const f=c.file;
    fail(f && typeof f==='object' && !Array.isArray(f), 'Invalid file resource');
    fail(!own(f,'id') || f.id===c.fileId, 'Conflicting change/file ID');
    fail(!own(f,'parents') || (Array.isArray(f.parents) && f.parents.every(key) && f.parents.length<=20), 'Invalid file parents');
  }
  return c;
}

/** Pulls a complete Google Drive v3 changes.list sequence, in memory only.
 * `principalId` must be a caller-verified identity binding, not trusted from a page.
 * `readPage` is a test injected callback; it does not call Google.
 */
export async function collectDriveChanges(readPage, { startPageToken, principalId, maxPages=100, maxChanges=20000 }={}) {
  fail(typeof readPage==='function', 'Missing change page reader');
  fail(token(startPageToken), 'Missing/invalid trusted starting token');
  fail(key(principalId), 'Missing verified Drive principal');
  fail(Number.isSafeInteger(maxPages) && maxPages>0 && maxPages<=1000, 'Invalid page budget');
  fail(Number.isSafeInteger(maxChanges) && maxChanges>=0 && maxChanges<=200000, 'Invalid change budget');
  const seenTokens=new Set();
  const changes=[]; let cursor=startPageToken, pages=0, lastToken=null;
  while(true){
    fail(!seenTokens.has(cursor), 'Repeated change token');
    seenTokens.add(cursor);
    fail(++pages<=maxPages, 'Change feed page budget exceeded');
    const raw=await readPage({pageToken:cursor, includeRemoved:true, restrictToMyDrive:false, supportsAllDrives:true, principalId});
    fail(raw && raw.kind==='drive#changeList' && Array.isArray(raw.changes), 'Invalid or missing change page');
    fail(raw.changes.length<=1000, 'Oversized Google changes page');
    for(const entry of raw.changes){
      changes.push(validateChange(entry));
      fail(changes.length<=maxChanges, 'Change feed event budget exceeded');
    }
    const next=raw.nextPageToken, terminal=raw.newStartPageToken;
    fail(!(next && terminal), 'Conflicting change page continuation');
    if(next){
      fail(token(next), 'Invalid next page token');
      cursor=next;
    }else{
      fail(token(terminal), 'Missing terminal newStartPageToken');
      lastToken=terminal;
      break;
    }
  }
  // IMPORTANT: nonempty newStartPageToken proves this feed was read to its end,
  // NOT that DriveApp folder iterators formed an immutable snapshot.
  return Object.freeze({ principalId, startPageToken, nextStartPageToken:lastToken,
    pagesRead:pages, changes, feedComplete:true, stableSnapshot:false,
    canStage:false, canPublish:false, productionApproved:false });
}

/** Conservative offline classifier using an already-known file/folder->story index.
 * A completely unknown change is NEVER treated as irrelevant.
 * A removed entry generally has no `file.parents`, hence must use known IDs.
 */
export function classifyDriveChanges(feed, { storyIds, idToStories, principalId }={}) {
  fail(feed?.feedComplete===true && feed.stableSnapshot===false && feed.canPublish===false,
    'Only complete unpinned read-only feeds accepted');
  fail(feed.principalId===principalId && key(principalId), 'Drive principal mismatch');
  fail(Array.isArray(storyIds) && storyIds.length>0 && storyIds.length<=10000 &&
    storyIds.every(s=>typeof s==='string' && STORY_ID.test(s)) && new Set(storyIds).size===storyIds.length,
    'Invalid story roster');
  fail(idToStories instanceof Map, 'Known ID ownership map required');
  const roster=new Set(storyIds), affected=new Set(), unknown=[];
  const owners=id=>{
    if(!idToStories.has(id))return false;
    const entries=idToStories.get(id);
    fail(Array.isArray(entries) && entries.length>0, 'Invalid known ownership entry');
    for(const s of entries){fail(roster.has(s), 'Unknown owner story');affected.add(s);}
    return true;
  };
  for(const c of feed.changes){
    let matched=owners(c.fileId);
    if(c.file?.parents){
      for(const parent of c.file.parents) matched=owners(parent)||matched;
    }
    // Any unknown event might be a new file, moved folder, or inaccessible removed item.
    if(!matched)unknown.push(c.fileId);
  }
  return Object.freeze({ status:unknown.length?'UNKNOWN_CHANGES_REQUIRE_CONSERVATIVE_RESCAN':
      affected.size?'KNOWN_CHANGES_FOUND':'NO_CHANGES_OBSERVED_IN_FEED',
    changedStoryIds:[...affected].sort(), unknownCount:unknown.length,
    totalChanges:feed.changes.length, feedPagesRead:feed.pagesRead,
    // Unknown IDs are private: do not expose them via admin/debug summary.
    allStoriesMustScan:true, canSkipFullNightly:false, stableSnapshot:false,
    canStage:false, canPublish:false, productionApproved:false });
}

/** Enforces the user's requirement to check ALL 242 stories every day.
 * Known change hits are only a priority hint, never a replacement for scanning.
 */
export function planNightlyStoryOrder(storyIds, triage, { baselinePages=4978, accountUsageKnown=false }={}) {
  fail(Array.isArray(storyIds) && storyIds.length>0 && new Set(storyIds).size===storyIds.length,
    'Invalid story roster');
  fail(triage?.allStoriesMustScan===true && triage?.canPublish===false,
    'Unsafe triage cannot plan a nightly scan');
  fail(Number.isSafeInteger(baselinePages) && baselinePages>=0, 'Invalid page estimate');
  const changed=new Set(triage.changedStoryIds);
  fail([...changed].every(x=>storyIds.includes(x)), 'Triage returned unknown story');
  const prioritized=[...storyIds].sort((a,b)=>Number(changed.has(b))-Number(changed.has(a)) || a.localeCompare(b));
  return Object.freeze({ totalStories:storyIds.length, scheduledStories:prioritized.length,
    priorityOrder:prioritized, unknownChangeFallback:triage.unknownCount>0,
    baselineSinglePassPageEstimate:baselinePages,
    previousTwoPassPageEstimate:baselinePages*2,
    changeFeedPagesRead:triage.feedPagesRead,
    // No promise of reduced reads: a second pass may still be required.
    potentialSinglePassPlusFeed:baselinePages+triage.feedPagesRead,
    finalReadCountUnknown:true, accountUsageKnown:accountUsageKnown===true,
    actualQuotaVerified:false, drivePrincipalVerified:false, workerCpuVerified:false,
    snapshotPinned:false, canStage:false, canPublish:false, productionApproved:false });
}
