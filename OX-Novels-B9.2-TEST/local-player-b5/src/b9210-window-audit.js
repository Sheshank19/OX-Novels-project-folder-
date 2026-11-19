/* OX B9.2.10 — OFFLINE, TEST-ONLY change-window audit.
 * No Drive endpoint, credentials, Worker binding, KV/D1 writes, or publication.
 * Google's change tokens and DriveApp continuation tokens are NOT immutable snapshots.
 * This module only coordinates callbacks supplied by a local test harness.
 */
import { auditDriveAppTwice } from './b928-mutation-audit.js';
import { collectDriveChanges } from './b929-drive-change-triage.js';

const VALID_ID = /^[A-Za-z0-9_-]{10,}$/;
const VALID_STORY = /^[a-z0-9][a-z0-9-]{0,110}$/;
const VALID_TOKEN = /^[^\x00-\x20\x7f]{1,4096}$/;
const requireSafe = (condition, reason) => { if (!condition) throw new Error(reason); };
const hasToken = v => typeof v === 'string' && VALID_TOKEN.test(v);

/**
 * Always capture all required start tokens BEFORE the first resolver read.
 * Always drain all relevant change feeds AFTER both resolver traversals.
 * `scope` is declared by the test harness, NOT discovered or verified here.
 * For shared-drive members, BOTH account and specific shared-drive change logs are required.
 * Empty feeds are only observations, never a real consistent snapshot proof.
 */
export async function auditChangeWindowOffline({
  rootFolderId, principalId, scope = 'user', sharedDriveId = null,
  getUserStartToken, getSharedStartToken, readUserChanges, readSharedChanges,
  fetchResolverPage, maxResolverPages = 6500, maxChangePages = 100,
} = {}) {
  requireSafe(typeof rootFolderId === 'string' && VALID_ID.test(rootFolderId), 'Invalid root ID');
  requireSafe(typeof principalId === 'string' && VALID_ID.test(principalId), 'Invalid principal');
  requireSafe(scope === 'user' || scope === 'shared-drive-member', 'Unknown Drive scope');
  requireSafe(scope === 'user' ? sharedDriveId === null :
    typeof sharedDriveId === 'string' && VALID_ID.test(sharedDriveId), 'Missing/invalid shared-drive scope');
  requireSafe(typeof getUserStartToken === 'function' && typeof readUserChanges === 'function' &&
    typeof fetchResolverPage === 'function', 'Required read callbacks missing');
  if (scope === 'shared-drive-member') {
    requireSafe(typeof getSharedStartToken === 'function' && typeof readSharedChanges === 'function',
      'Shared-drive change log required for a shared-drive member');
  }
  requireSafe(Number.isSafeInteger(maxResolverPages) && maxResolverPages > 0 && maxResolverPages <= 20000,
    'Invalid resolver page budget');
  requireSafe(Number.isSafeInteger(maxChangePages) && maxChangePages > 0 && maxChangePages <= 1000,
    'Invalid change page budget');

  // The order of the awaited operations is security-relevant. Never start scanning
  // before BOTH start tokens have been captured for a shared-drive member.
  const userStart = await getUserStartToken({ principalId, supportsAllDrives:true });
  requireSafe(hasToken(userStart), 'Invalid user change start token');
  let sharedStart = null;
  if (scope === 'shared-drive-member') {
    sharedStart = await getSharedStartToken({ principalId, driveId:sharedDriveId, supportsAllDrives:true });
    requireSafe(hasToken(sharedStart), 'Invalid shared-drive change start token');
  }

  const metadata = await auditDriveAppTwice(fetchResolverPage,rootFolderId,{maxPages:maxResolverPages});
  // Even when both observations differ, drain feeds to produce an honest report.
  const userFeed = await collectDriveChanges(readUserChanges, {
    startPageToken:userStart,principalId,maxPages:maxChangePages
  });
  let sharedFeed = null;
  if (scope === 'shared-drive-member') {
    sharedFeed = await collectDriveChanges(
      async query => readSharedChanges({...query, driveId:sharedDriveId}),
      {startPageToken:sharedStart,principalId,maxPages:maxChangePages}
    );
  }
  requireSafe(userFeed.feedComplete && (!sharedFeed || sharedFeed.feedComplete), 'Incomplete change window');
  const observedChanges = userFeed.changes.length + (sharedFeed?.changes.length ?? 0);
  const status = metadata.mutationDetected ? 'MUTATION_DETECTED' :
    observedChanges ? 'CHANGE_LOG_EVENTS_OBSERVED' : 'QUIET_WINDOW_OBSERVED_UNPINNED';
  return Object.freeze({
    status, scope, metadataPagesRead:metadata.metadataPagesRead,
    metadataTrackCount:metadata.trackCount, metadataFolderCount:metadata.folderCount,
    userChangePagesRead:userFeed.pagesRead, sharedChangePagesRead:sharedFeed?.pagesRead ?? 0,
    observedChangeCount:observedChanges, bothMetadataPassesMatch:!metadata.mutationDetected,
    // Critical: the remote account permissions, complete log coverage and ordering
    // have not been validated. The Google APIs do not provide a pinned DriveApp snapshot.
    realAccountIdentityVerified:false, sharedDriveMembershipVerified:false,
    allRelatedDriveChangesProven:false, immutableSnapshot:false,
    canSkipFullNightlyScan:false, canStage:false, canPublish:false,
    deploymentApproved:false, offlineOnly:true,
  });
}

/** Complete-library summary. Does not grant an exception to scan all 242 stories. */
export function summarizeAllStoryWindows(storyIds, auditedStories) {
  requireSafe(Array.isArray(storyIds) && storyIds.length > 0 && storyIds.length <= 10000 &&
    storyIds.every(s => typeof s === 'string' && VALID_STORY.test(s)) &&
    new Set(storyIds).size === storyIds.length, 'Invalid full-library roster');
  requireSafe(Array.isArray(auditedStories), 'Missing story audit records');
  const expected = new Set(storyIds), seen = new Set();
  const stats = {quiet:0, changed:0, mutated:0};
  for (const record of auditedStories) {
    requireSafe(record && expected.has(record.storyId) && !seen.has(record.storyId),
      'Unknown or duplicate story audit');
    requireSafe(record.result?.offlineOnly === true && record.result?.canPublish === false &&
      record.result?.canStage === false && record.result?.immutableSnapshot === false,
      'Unsafe or unverified result');
    seen.add(record.storyId);
    if (record.result.status === 'QUIET_WINDOW_OBSERVED_UNPINNED') stats.quiet++;
    else if (record.result.status === 'CHANGE_LOG_EVENTS_OBSERVED') stats.changed++;
    else if (record.result.status === 'MUTATION_DETECTED') stats.mutated++;
    else throw new Error('Unknown result status');
  }
  requireSafe(seen.size === expected.size, 'Incomplete daily story coverage');
  return Object.freeze({ expectedStories:expected.size, auditedStories:seen.size,
    ...stats, allStoriesStillRequireDailyScan:true,
    snapshotVerified:false, liveQuotaVerified:false, cloudCpuVerified:false,
    canStage:false, canPublish:false, deploymentApproved:false });
}
