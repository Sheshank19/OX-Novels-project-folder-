/**
 * OX B9.2 - MULTI-STORY READ-ONLY PAGINATED RESOLVER.
 * Create a NEW Apps Script project. DO NOT paste this into the live resolver.
 * Allowed API: authenticated list_children_page for caller-scoped story root
 * and bounded nested subfolders. No Drive mutations or catalog publication.
 *
 * Script Properties (set in the NEW project, values never embedded in source):
 *   OX_STAGE_RESOLVER_SECRET = newly generated, random stage-only secret
 *
 * SECURITY: execute-as-me/Anyone only behind a LONG random secret; do not
 * disclose its URL or secret. The Worker MUST resolve roots from authenticated
 * OX library records, never from a visitor. This is NOT a pinned snapshot.
 */
const OX_STAGE = Object.freeze({
  version: 'ox-stage-multiroot-v2',
  secretProperty: 'OX_STAGE_RESOLVER_SECRET',
  foldersPerPage: 20,
  audioPerPage: 40,
  maxFilesInspectedPerPage: 160,
  maxPageNumber: 1000,
  maxCursorLength: 30000,
  cursorLifeMs: 20 * 60 * 1000,
  audioRegex: /\.(?:mp3|m4a|m4b|aac|wav|wave|flac|ogg|oga|opus|wma|aiff|aif|amr|3gp|webm|mp4)$/i
});

function doGet() {
  const props = PropertiesService.getScriptProperties();
  return oxStageOutput({
    ok: true,
    service: 'OX Staging Read-Only Resolver',
    version: OX_STAGE.version,
    configured: Boolean(props.getProperty(OX_STAGE.secretProperty)),
    writesEnabled: false,
    pinnedSnapshot: false,
    requestBinding: 'nonce-and-root-echo-v2',
    multiStory: true, automaticPublication: false
  });
}

function doPost(e) {
  try {
    const raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '{}';
    if (raw.length > 40000) return oxStageOutput({ ok: false, error: 'Invalid request.' });
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('bad-body');
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty(OX_STAGE.secretProperty) || '';
    const root = String(body.storyRootId || '');
    const storyId = String(body.storyId || '');
    if (!secret || secret.length < 32) return oxStageOutput({ ok: false, error: 'Stage is not configured.' });
    if (!oxStageValidId(root) || !/^[a-z0-9][a-z0-9._-]{0,159}$/.test(storyId))
      return oxStageOutput({ ok: false, error: 'Story scope is required.' });
    if (!oxStageSame(String(body.secret || ''), secret)) return oxStageOutput({ ok: false, error: 'Unauthorized.' });
    if (body.mode !== 'list_children_page') return oxStageOutput({ ok: false, error: 'Unsupported read-only mode.' });
    // Unique per-request marker prevents mistakenly accepting a response from another read.
    if (typeof body.requestNonce !== 'string' || !/^[a-f0-9]{32}$/.test(body.requestNonce))
      return oxStageOutput({ ok: false, error: 'Request marker is required.' });
    const folderId = body.folderId;
    if (!oxStageValidId(folderId)) return oxStageOutput({ ok: false, error: 'Invalid folder.' });
    const folder = DriveApp.getFolderById(folderId);
    if (!oxStageAllowedFolder(folder, root)) return oxStageOutput({ ok: false, error: 'Folder not permitted.' });
    return oxStageOutput(oxStagePage(folder, String(folderId), body, secret, storyId, root));
  } catch (err) {
    // Do not expose stack traces, raw Drive IDs, Apps Script internals, or tokens.
    return oxStageOutput({ ok: false, error: 'Stage read-only page request rejected.' });
  }
}

function oxStageValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{10,}$/.test(id);
}
function oxStageAllowedFolder(folder, rootId) {
  // Supports the existing Player's nested story folder trees up to depth 12,
  // without granting access to sibling stories or unrelated Drive folders.
  const pending = [{folder: folder, depth: 0}], seen = {};
  while (pending.length) {
    const item = pending.shift();
    const id = String(item.folder.getId());
    if (id === rootId) return true;
    if (item.depth >= 12 || seen[id]) continue;
    seen[id] = true;
    const parents = item.folder.getParents();
    while (parents.hasNext()) pending.push({folder: parents.next(), depth: item.depth + 1});
    if (pending.length > 40) throw Error('unbounded-parent-traversal');
  }
  return false;
}
function oxStageSame(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function oxStageEncode(data, secret) {
  const part = Utilities.base64EncodeWebSafe(JSON.stringify(data), Utilities.Charset.UTF_8);
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(part, secret));
  const encoded = part + '.' + sig;
  if (encoded.length > OX_STAGE.maxCursorLength) throw Error('cursor-too-large');
  return encoded;
}
function oxStageDecode(token, secret, folderId, pageNo, storyId, storyRootId) {
  if (typeof token !== 'string' || !token || token.length > OX_STAGE.maxCursorLength) throw Error('bad-cursor');
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw Error('bad-cursor');
  const correct = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret));
  if (!oxStageSame(parts[1], correct)) throw Error('bad-signature');
  const item = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  if (!item || item.v !== 1 || item.folderId !== folderId || item.pageNo !== pageNo ||
      item.storyId !== storyId || item.storyRootId !== storyRootId ||
      !Number.isSafeInteger(item.exp) || Date.now() >= item.exp ||
      typeof item.folderDone !== 'boolean' || typeof item.fileDone !== 'boolean' ||
      (item.ft !== null && typeof item.ft !== 'string') ||
      (item.at !== null && typeof item.at !== 'string')) throw Error('expired-or-mismatched-cursor');
  return item;
}
function oxStageSafeName(text) {
  return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500);
}
function oxStageIsAudio(file) {
  try { if (String(file.getMimeType() || '').toLowerCase().startsWith('audio/')) return true; } catch (err) {}
  try { return OX_STAGE.audioRegex.test(String(file.getName() || '')); } catch (err) { return false; }
}
function oxStagePage(folder, folderId, request, secret, storyId, storyRootId) {
  const pageNo = request.pageNo === undefined ? 0 : request.pageNo;
  if (!Number.isSafeInteger(pageNo) || pageNo < 0 || pageNo > OX_STAGE.maxPageNumber) throw Error('bad-page');
  if ((pageNo === 0 && request.cursor) || (pageNo !== 0 && !request.cursor)) throw Error('bad-sequence');
  const state = pageNo === 0 ? {
    v: 1, folderId, storyId, storyRootId, pageNo: 0, exp: Date.now() + OX_STAGE.cursorLifeMs,
    ft: null, at: null, folderDone: false, fileDone: false
  } : oxStageDecode(request.cursor, secret, folderId, pageNo, storyId, storyRootId);
  const folders = [], tracks = [];
  let ft = state.ft, at = state.at, folderDone = state.folderDone, fileDone = state.fileDone;
  if (!folderDone) {
    const iterator = ft ? DriveApp.continueFolderIterator(ft) : folder.getFolders();
    while (folders.length < OX_STAGE.foldersPerPage && iterator.hasNext()) {
      const child = iterator.next();
      folders.push({ id: String(child.getId()), name: oxStageSafeName(child.getName()), type: 'folder' });
    }
    folderDone = !iterator.hasNext();
    ft = folderDone ? null : iterator.getContinuationToken();
    if (!folderDone && !ft) throw Error('lost-folder-continuation');
  }
  if (!fileDone) {
    const iterator = at ? DriveApp.continueFileIterator(at) : folder.getFiles();
    let inspected = 0;
    while (tracks.length < OX_STAGE.audioPerPage && inspected < OX_STAGE.maxFilesInspectedPerPage && iterator.hasNext()) {
      const file = iterator.next(); inspected += 1;
      if (!oxStageIsAudio(file)) continue;
      const d = file.getLastUpdated();
      const size = Number(file.getSize());
      const modifiedAt = d && typeof d.toISOString === 'function' ? d.toISOString() : '';
      if (!Number.isFinite(size) || size < 0 || !modifiedAt) throw Error('missing-metadata');
      tracks.push({
        id: String(file.getId()), name: oxStageSafeName(file.getName()), type: 'track',
        mimeType: String(file.getMimeType() || ''), size, modifiedAt
      });
    }
    fileDone = !iterator.hasNext();
    at = fileDone ? null : iterator.getContinuationToken();
    if (!fileDone && !at) throw Error('lost-file-continuation');
  }
  const complete = folderDone && fileDone;
  const cursor = complete ? null : oxStageEncode({
    v: 1, folderId, storyId, storyRootId, pageNo: pageNo + 1, exp: state.exp,
    ft, at, folderDone, fileDone
  }, secret);
  return {
    ok: true, version: OX_STAGE.version, pageNo, folderId, storyId, storyRootId,
    requestNonce: request.requestNonce,
    folders, tracks, complete, hasMore: !complete, nextCursor: cursor,
    pinnedSnapshot: false, stableSnapshot: false, publishAllowed: false,
    readOnly: true
  };
}
function oxStageOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
