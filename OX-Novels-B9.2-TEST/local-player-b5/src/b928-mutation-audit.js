/* OX B9.2.8 - LOCAL ONLY. Mutation-aware dual traversal for B9.2.7.
 * A pair of equal DriveApp iterator results is NOT an atomic snapshot.
 * This helper NEVER establishes permission to publish or stage a catalog.
 * Do not import into either production Worker or Apps Script.
 */
import { createHash } from 'node:crypto';

const ID = /^[A-Za-z0-9_-]{10,}$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const PAGE_PROTOCOL = 'ox-drive-page-b927-experimental';
const fail = (ok, message) => { if (!ok) throw Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validName = x => typeof x === 'string' && x.length > 0 && x.length <= 500 && !/[\u0000-\u001f\u007f]/.test(x);

function validatePage(raw, folderId, pageNo, previousCursor) {
  fail(raw && typeof raw === 'object' && !Array.isArray(raw), 'Missing Drive page');
  fail(raw.ok === true && raw.protocol === PAGE_PROTOCOL, 'Rejected resolver protocol or failed page');
  fail(raw.folderId === folderId && raw.pageNo === pageNo, 'Wrong folder/page: stale continuation');
  fail(raw.snapshotPinned === false && raw.stableSnapshot === false && raw.productionCompatible === false,
    'B928 refuses a self-declared pinned snapshot or production compatibility');
  fail(Array.isArray(raw.folders) && Array.isArray(raw.tracks), 'Missing listing arrays');
  fail(raw.folders.length <= 25 && raw.tracks.length <= 40, 'Unbounded page');
  fail(typeof raw.complete === 'boolean' && raw.hasMore === !raw.complete, 'Inconsistent completion flags');
  fail(raw.complete ? raw.nextCursor === null : typeof raw.nextCursor === 'string' && raw.nextCursor.length > 10,
    'Missing or invalid continuation cursor');
  if (pageNo && previousCursor) fail(typeof previousCursor === 'string', 'Missing previous cursor');
  for (const folder of raw.folders) {
    fail(folder && folder.type === 'folder' && ID.test(folder.id) && validName(folder.name), 'Invalid folder metadata');
  }
  for (const track of raw.tracks) {
    fail(track && track.type === 'track' && ID.test(track.id) && validName(track.name), 'Invalid track metadata');
    fail(typeof track.mimeType === 'string' && track.mimeType.length <= 200, 'Invalid MIME type');
    fail(Number.isSafeInteger(track.size) && track.size >= 0, 'Invalid track size');
    fail(typeof track.modifiedAt === 'string' && VALID_DATE.test(track.modifiedAt) &&
      Number.isFinite(Date.parse(track.modifiedAt)), 'Missing/unverifiable modified timestamp');
  }
  return raw;
}

function canonical(items, idKey) {
  return items.slice().sort((a,b) => String(a[idKey]).localeCompare(String(b[idKey]), 'en'));
}

export async function scanDriveAppPass(fetchPage, rootFolderId, { pass = 1, maxPages = 6500, maxFolders = 3000, maxTracks = 250000 } = {}) {
  fail(typeof fetchPage === 'function', 'Missing Drive page reader');
  fail(ID.test(rootFolderId), 'Invalid root ID');
  fail(Number.isSafeInteger(pass) && pass >= 1 && pass <= 2, 'Invalid audit pass');
  fail(Number.isSafeInteger(maxPages) && maxPages >= 1 && maxPages <= 20000, 'Invalid page budget');
  fail(Number.isSafeInteger(maxFolders) && maxFolders >= 1 && maxFolders <= 10000, 'Invalid folder budget');
  fail(Number.isSafeInteger(maxTracks) && maxTracks >= 0 && maxTracks <= 1000000, 'Invalid track budget');
  const queue = [rootFolderId], visited = new Set(), seenFiles = new Set(), seenFolders = new Set([rootFolderId]);
  const records = [];
  let pageCount = 0, trackCount = 0;
  for (let i = 0; i < queue.length; i++) {
    const folderId = queue[i];
    fail(!visited.has(folderId), 'Cycle/duplicate folder');
    visited.add(folderId);
    let cursor = null, pageNo = 0, complete = false;
    const folderChildren = [], tracks = [], seenCursors = new Set();
    while (!complete) {
      fail(++pageCount <= maxPages, 'Drive page budget exceeded: fail closed');
      const response = await fetchPage({ folderId, pageNo, cursor, pass });
      const page = validatePage(response, folderId, pageNo, cursor);
      for (const child of page.folders) {
        fail(child.id !== folderId && !seenFolders.has(child.id) && !seenFiles.has(child.id), 'Repeated/cyclic folder ID');
        seenFolders.add(child.id);
        folderChildren.push({ id: child.id, name: child.name });
        queue.push(child.id);
        fail(queue.length <= maxFolders, 'Folder budget exceeded: fail closed');
      }
      for (const track of page.tracks) {
        fail(!seenFiles.has(track.id) && !seenFolders.has(track.id), 'Duplicate audio ID / folder collision');
        seenFiles.add(track.id);
        tracks.push({ id: track.id, name: track.name, mimeType: track.mimeType,
          size: track.size, modifiedAt: track.modifiedAt });
        fail(++trackCount <= maxTracks, 'Track budget exceeded: fail closed');
      }
      complete = page.complete;
      if (!complete) {
        fail(!seenCursors.has(page.nextCursor), 'Cyclic or replayed cursor');
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
        pageNo++;
      }
    }
    records.push({ id: folderId, children: canonical(folderChildren,'id'), tracks: canonical(tracks,'id') });
  }
  const digest = hash(canonical(records, 'id'));
  return Object.freeze({ rootFolderId, pass, folderCount: records.length, trackCount, pageCount,
    digest, completed: true, productionSafe: false, snapshotPinned: false, canPublish: false });
}

export function compareDriveAppPasses(first, second) {
  fail(first?.completed === true && second?.completed === true && first.pass === 1 && second.pass === 2,
    'Both independent complete traversals required');
  fail(first.rootFolderId === second.rootFolderId, 'Root binding mismatch');
  const equal = first.digest === second.digest && first.folderCount === second.folderCount &&
    first.trackCount === second.trackCount;
  return Object.freeze({ status: equal ? 'STABLE_OBSERVED_TWICE_UNPINNED' : 'MUTATION_DETECTED',
    mutationDetected: !equal, firstDigest: first.digest, secondDigest: second.digest,
    folderCount: second.folderCount, trackCount: second.trackCount,
    metadataPagesRead: first.pageCount + second.pageCount,
    // NEVER promote two equal observations into a snapshot guarantee.
    stableSnapshot: false, verifiedPinnedSnapshot: false, canStage: false, canPublish: false,
    productionApproved: false, reason: equal ?
      'Two observations agreed, but DriveApp is not snapshot-pinned; concurrent ABA changes remain possible' :
      'The Drive metadata differed between complete traversals; retain last working catalog' });
}

export async function auditDriveAppTwice(fetchPage, rootFolderId, options = {}) {
  // Intentionally restart all iterators: never reuse continuation tokens from pass 1.
  const first = await scanDriveAppPass(fetchPage, rootFolderId, { ...options, pass:1 });
  const second = await scanDriveAppPass(fetchPage, rootFolderId, { ...options, pass:2 });
  return compareDriveAppPasses(first, second);
}

export function offlineAuditBudget({ existingPageCount, pageReadsAlreadyUsed = null, maxPageReads = 12000 } = {}) {
  fail(Number.isSafeInteger(existingPageCount) && existingPageCount >= 0, 'Invalid page baseline');
  fail(Number.isSafeInteger(maxPageReads) && maxPageReads >= 0, 'Invalid page ceiling');
  const estimatedPages = existingPageCount * 2;
  const known = Number.isSafeInteger(pageReadsAlreadyUsed) && pageReadsAlreadyUsed >= 0;
  return Object.freeze({ estimatedPages, accountUsageKnown: known,
    withinLocalReadBudget: known && estimatedPages + pageReadsAlreadyUsed <= maxPageReads,
    cloudCpuVerified: false, liveDriveValidated: false, automaticPublishingAllowed: false });
}
