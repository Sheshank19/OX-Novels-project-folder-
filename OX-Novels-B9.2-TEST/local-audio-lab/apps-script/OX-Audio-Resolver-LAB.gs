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
    version: 'lab-v3'
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
    if (mode !== 'list_children') return oxAudioOutput({ ok: false, error: 'Unsupported mode.' });

    const folderId = oxAudioExtractFolderId(body.folderId || body.folder_id || '');
    if (!folderId) return oxAudioOutput({ ok: false, error: 'Invalid folder ID.' });

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
