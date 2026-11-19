const OX_AUDIO_RESOLVER = {
  SECRET_PROPERTY: 'OX_AUDIO_RESOLVER_SECRET',
  MAX_FOLDERS_PER_REQUEST: 300,
  MAX_AUDIO_FILES_PER_REQUEST: 700,
  AUDIO_RE: /\.(?:mp3|m4a|m4b|aac|wav|wave|flac|ogg|oga|opus|wma|aiff|aif|amr|3gp|webm|mp4)$/i
};

function doGet() {
  return oxAudioOutput({
    ok: true,
    service: 'OX Audio Resolver Lab',
    configured: Boolean(PropertiesService.getScriptProperties().getProperty(OX_AUDIO_RESOLVER.SECRET_PROPERTY)),
    version: 'lab-v3 + B927-test-only'
  });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw || '{}');
    const expected = String(PropertiesService.getScriptProperties().getProperty(OX_AUDIO_RESOLVER.SECRET_PROPERTY) || '');
    const supplied = String(body.secret || '');

    if (!expected) return oxAudioOutput({ ok: false, error: 'Resolver secret is not configured.' });
    if (!supplied || supplied !== expected) return oxAudioOutput({ ok: false, error: 'Unauthorized.' });

    const mode = String(body.mode || '').trim().toLowerCase();
    if (mode !== 'list_children' && mode !== 'list_children_page_b927') return oxAudioOutput({ ok: false, error: 'Unsupported mode.' });

    const folderId = oxAudioExtractFolderId(body.folderId || body.folder_id || '');
    if (!folderId) return oxAudioOutput({ ok: false, error: 'Invalid folder ID.' });

    if (mode === 'list_children_page_b927') {
      try { return oxAudioOutput(oxB927ListPage(folderId, body, expected)); }
      catch (err) { return oxAudioOutput({ ok: false, error: 'B927 page request rejected' }); }
    }
    return oxAudioOutput(oxAudioListChildren(folderId));
  } catch (error) {
    return oxAudioOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function oxAudioListChildren(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const folders = [];
  const tracks = [];
  let folderTruncated = false;
  let fileTruncated = false;

  const childFolders = folder.getFolders();
  while (childFolders.hasNext()) {
    if (folders.length >= OX_AUDIO_RESOLVER.MAX_FOLDERS_PER_REQUEST) {
      folderTruncated = true;
      break;
    }
    const child = childFolders.next();
    folders.push({
      id: String(child.getId()),
      name: oxAudioSafeName(child.getName()),
      type: 'folder'
    });
  }

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!oxAudioLooksLikeAudio(file)) continue;
    if (tracks.length >= OX_AUDIO_RESOLVER.MAX_AUDIO_FILES_PER_REQUEST) {
      fileTruncated = true;
      break;
    }
    let size = 0;
    let modifiedAt = '';
    try { size = Number(file.getSize() || 0); } catch (error) {}
    try {
      const date = file.getLastUpdated();
      modifiedAt = date && typeof date.toISOString === 'function' ? date.toISOString() : '';
    } catch (error) {}
    tracks.push({
      id: String(file.getId()),
      name: oxAudioSafeName(file.getName()),
      type: 'track',
      mimeType: String(file.getMimeType() || ''),
      size: size,
      modifiedAt: modifiedAt
    });
  }

  folders.sort(oxAudioNaturalSort);
  tracks.sort(oxAudioNaturalSort);

  return {
    ok: true,
    folder: {
      id: String(folder.getId()),
      name: oxAudioSafeName(folder.getName())
    },
    folders: folders,
    tracks: tracks,
    truncated: Boolean(folderTruncated || fileTruncated),
    folderTruncated: folderTruncated,
    fileTruncated: fileTruncated,
    scannedAt: new Date().toISOString()
  };
}

function oxAudioLooksLikeAudio(file) {
  try {
    const mime = String(file.getMimeType() || '').toLowerCase();
    if (mime.indexOf('audio/') === 0) return true;
  } catch (error) {}
  try {
    return OX_AUDIO_RESOLVER.AUDIO_RE.test(String(file.getName() || ''));
  } catch (error) {
    return false;
  }
}

function oxAudioNaturalSort(a, b) {
  return String(a && a.name || '').localeCompare(String(b && b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function oxAudioSafeName(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500);
}

function oxAudioExtractFolderId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let match = text.match(/(?:drive\/folders|folders)\/([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  match = text.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(text) ? text : '';
}

function oxAudioOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}


/*
 * B9.2.7 OFFLINE-ONLY pagination experiment. NOT FOR APPS SCRIPT DEPLOYMENT.
 * Copy of the uploaded LAB resolver with an additional authenticated mode.
 * This DOES NOT implement an atomic/pinned Google Drive snapshot, stable global
 * sorting across pages, B9.2.5 begin/page/end protocol, or KV publication.
 * Do not call it from the working OX Player or publish it as an Apps Script update.
 */
const OX_B927_PAGE = { FOLDERS: 25, AUDIO: 40, MAX_FILE_INSPECT: 160, TTL_MS: 20*60*1000, MAX_CURSOR_CHARS: 30000 };
function oxB927EncodeCursor(payload, secret) {
  const json = JSON.stringify(payload);
  const body = Utilities.base64EncodeWebSafe(json, Utilities.Charset.UTF_8);
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret));
  return body + '.' + sig;
}
function oxB927Compare(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i=0; i<a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function oxB927DecodeCursor(token, secret, folderId, pageNo, nowMs) {
  if (typeof token !== 'string' || !token || token.length > OX_B927_PAGE.MAX_CURSOR_CHARS) throw Error('Invalid cursor');
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw Error('Bad cursor structure');
  const expectedSig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret));
  if (!oxB927Compare(parts[1], expectedSig)) throw Error('Invalid cursor signature');
  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  if (!payload || payload.v !== 1 || payload.folderId !== folderId || payload.pageNo !== pageNo ||
      !Number.isSafeInteger(payload.expiresAtMs) || nowMs >= payload.expiresAtMs ||
      typeof payload.foldersDone !== 'boolean' || typeof payload.filesDone !== 'boolean' ||
      (payload.folderToken !== null && typeof payload.folderToken !== 'string') ||
      (payload.fileToken !== null && typeof payload.fileToken !== 'string')) throw Error('Invalid/expired cursor');
  return payload;
}
function oxB927ListPage(folderId, body, secret) {
  const pageNo = body.pageNo === undefined ? 0 : body.pageNo;
  if (!Number.isSafeInteger(pageNo) || pageNo < 0 || pageNo > 20000) throw Error('Invalid page number');
  const nowMs = Date.now();
  if (pageNo === 0 && body.cursor) throw Error('Initial page cannot have cursor');
  if (pageNo !== 0 && !body.cursor) throw Error('Continuation requires cursor');
  const saved = pageNo === 0 ? {v:1,folderId,pageNo:0,expiresAtMs:nowMs + OX_B927_PAGE.TTL_MS,
    folderToken:null,fileToken:null,foldersDone:false,filesDone:false} :
    oxB927DecodeCursor(body.cursor,secret,folderId,pageNo,nowMs);
  const folder = DriveApp.getFolderById(folderId);
  const folders = [], tracks = [];
  let folderToken = saved.folderToken, fileToken = saved.fileToken;
  let foldersDone = saved.foldersDone, filesDone = saved.filesDone;
  if (!foldersDone) {
    const iterator = folderToken ? DriveApp.continueFolderIterator(folderToken) : folder.getFolders();
    while (folders.length < OX_B927_PAGE.FOLDERS && iterator.hasNext()) {
      const child = iterator.next();
      folders.push({id:String(child.getId()),name:oxAudioSafeName(child.getName()),type:'folder'});
    }
    foldersDone = !iterator.hasNext();
    folderToken = foldersDone ? null : iterator.getContinuationToken();
    if (!foldersDone && !folderToken) throw Error('Missing folder continuation token');
  }
  if (!filesDone) {
    const iterator = fileToken ? DriveApp.continueFileIterator(fileToken) : folder.getFiles();
    let inspected = 0;
    while (tracks.length < OX_B927_PAGE.AUDIO && inspected < OX_B927_PAGE.MAX_FILE_INSPECT && iterator.hasNext()) {
      const file = iterator.next(); inspected++;
      if (!oxAudioLooksLikeAudio(file)) continue;
      let size=0,modifiedAt='';
      try { size=Number(file.getSize()||0); } catch(e) {}
      try { const dt=file.getLastUpdated();modifiedAt=dt&&typeof dt.toISOString==='function'?dt.toISOString():''; } catch(e) {}
      tracks.push({id:String(file.getId()),name:oxAudioSafeName(file.getName()),type:'track',
       mimeType:String(file.getMimeType()||''),size,modifiedAt});
    }
    filesDone = !iterator.hasNext();
    fileToken = filesDone ? null : iterator.getContinuationToken();
    if (!filesDone && !fileToken) throw Error('Missing file continuation token');
  }
  const complete = foldersDone && filesDone;
  const nextCursor=complete?null:oxB927EncodeCursor({v:1,folderId,pageNo:pageNo+1,expiresAtMs:saved.expiresAtMs,
    folderToken,fileToken,foldersDone,filesDone},secret);
  if (!complete && nextCursor.length > OX_B927_PAGE.MAX_CURSOR_CHARS) throw Error('Cursor too large');
  return {
    ok:true, protocol:'ox-drive-page-b927-experimental', folderId, pageNo,
    folders,tracks, complete,hasMore:!complete,nextCursor,
    // CRITICAL: never let B9.2.5 accept this as a trustworthy snapshot proof.
    snapshotPinned:false,stableSnapshot:false,orderStable:false,productionCompatible:false,
    scannedAt:new Date(nowMs).toISOString()
  };
}
