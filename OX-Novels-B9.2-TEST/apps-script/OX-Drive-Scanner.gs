const OX_CONFIG = {
  API_KEY: '__OX_SHARED_SECRET__',
  MAX_FOLDERS: 25000,
  MAX_DEPTH: 50,
  FOLDER_MIME: 'application/vnd.google-apps.folder',
  AUDIO_PROBE_MAX_FILES: 40,
  FOLDER_CHUNK_LIMIT: 220
};

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const mode = String(params.mode || params.action || 'health').trim().toLowerCase();
    const apiKey = String(params.key || '');

    if (OX_CONFIG.API_KEY && apiKey !== OX_CONFIG.API_KEY) {
      return oxOutput({ ok: false, error: 'Unauthorized' });
    }

    const driveAppReady = oxDriveAppReady();
    if (mode === 'health') {
      return oxOutput({
        ok: driveAppReady,
        ready: driveAppReady,
        service: 'OX Drive Scanner',
        api: 'driveapp-chunked-story-boundary-v15.2',
        strategy: 'driveapp-chunked-story-boundary-v15.2',
        driveApp: driveAppReady,
        advancedDrive: oxAdvancedDriveReady(),
        error: driveAppReady ? '' : 'Google Drive access is not available to this Apps Script project.'
      });
    }

    if (!driveAppReady) {
      return oxOutput({ ok: false, error: 'Google Drive access is not available to this Apps Script project.' });
    }

    if (mode === 'story_candidates' || mode === 'scan' || mode === 'stories') {
      const rootIds = oxReadRootIds(params.root_folder_ids || params.links || params.root_ids || '');
      if (!rootIds.length) return oxOutput({ ok: false, error: 'No valid root folder IDs supplied' });
      return oxOutput(oxScanRootsFast(rootIds));
    }

    return oxOutput({ ok: false, error: 'Invalid mode' });
  } catch (error) {
    return oxOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw || '{}');
    if (OX_CONFIG.API_KEY && String(body.key || body.secret || '') !== OX_CONFIG.API_KEY) {
      return oxOutput({ ok: false, error: 'Unauthorized' });
    }
    if (!oxDriveAppReady()) {
      return oxOutput({ ok: false, error: 'Google Drive access is not available to this Apps Script project.' });
    }
    const mode = String(body.mode || body.action || 'story_candidates').trim().toLowerCase();
    if (mode === 'folder_chunk') return oxOutput(oxScanFolderChunk(body));
    if (mode === 'classify_tree') return oxOutput(oxClassifyFolderTree(body));
    const rootIds = oxNormalizeRootFolderIds(body.root_folder_ids || body.links || []);
    if (!rootIds.length) return oxOutput({ ok: false, error: 'No valid root folder IDs supplied' });
    return oxOutput(oxScanRootsFast(rootIds));
  } catch (error) {
    return oxOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function oxDriveAppReady() {
  try {
    return typeof DriveApp !== 'undefined' && DriveApp && typeof DriveApp.getFolderById === 'function';
  } catch (error) {
    return false;
  }
}

function oxAdvancedDriveReady() {
  try {
    return typeof Drive !== 'undefined' && Drive && Drive.Files && typeof Drive.Files.list === 'function';
  } catch (error) {
    return false;
  }
}

function oxReadRootIds(raw) {
  let incoming = raw;
  if (typeof incoming === 'string') {
    const text = String(incoming || '').trim();
    if (!text) return [];
    try {
      incoming = JSON.parse(decodeURIComponent(text));
    } catch (error) {
      try {
        incoming = JSON.parse(text);
      } catch (error2) {
        incoming = text.split(/[\s,;]+/);
      }
    }
  }
  return oxNormalizeRootFolderIds(incoming);
}

function oxNormalizeRootFolderIds(items) {
  const arr = Array.isArray(items) ? items : [items];
  const output = [];
  const seen = {};
  arr.forEach(function(item) {
    const text = String(item || '');
    const pieces = text.split(/[\s,;]+/).filter(Boolean);
    (pieces.length ? pieces : [text]).forEach(function(piece) {
      const id = oxExtractFolderId(piece);
      if (id && !seen[id]) {
        seen[id] = true;
        output.push(id);
      }
    });
  });
  return output;
}

function oxExtractFolderId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let match = text.match(/(?:drive\/folders|folders)\/([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  match = text.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(text) ? text : '';
}

// v15.2 reliable large-root protocol. Folder discovery is split into bounded
// POST requests so a root with thousands of folders never has to keep one Apps Script
// execution / HTTP response open for 3-5 minutes. The caller carries the pending queue
// between requests, then sends the completed lightweight folder tree back for the same
// v15.1 story-boundary classifier. Audio files are NOT enumerated during discovery.
function oxScanFolderChunk(body) {
  const started = Date.now();
  const rootId = oxExtractFolderId(body.rootFolderId || body.root_folder_id || body.root || '');
  if (!rootId) return { ok: false, error: 'No valid root folder ID supplied for folder_chunk.' };

  const suppliedPending = Array.isArray(body.pending);
  let pending = suppliedPending ? body.pending : [{ id: rootId, parentId: '', depth: 0 }];
  pending = pending.map(function(item) {
    if (typeof item === 'string') return { id: oxExtractFolderId(item) || String(item || ''), parentId: '', depth: 0 };
    return {
      id: oxExtractFolderId(item && item.id) || String(item && item.id || ''),
      parentId: String(item && item.parentId || ''),
      depth: Math.max(0, Number(item && item.depth || 0))
    };
  }).filter(function(item) { return Boolean(item.id); });

  let limit = Number(body.maxFolders || body.limit || OX_CONFIG.FOLDER_CHUNK_LIMIT);
  if (!isFinite(limit)) limit = OX_CONFIG.FOLDER_CHUNK_LIMIT;
  limit = Math.max(25, Math.min(300, Math.floor(limit)));

  const work = pending.slice(0, limit);
  const carry = pending.slice(limit);
  const nextPending = carry.slice();
  const nextSeen = {};
  nextPending.forEach(function(item) { if (item && item.id) nextSeen[item.id] = true; });

  const nodes = [];
  const processedIds = [];
  const errors = [];
  let childRows = 0;
  let iteratorScans = 0;

  work.forEach(function(entry) {
    const id = String(entry.id || '');
    if (!id) return;
    let folder;
    try {
      folder = DriveApp.getFolderById(id);
    } catch (error) {
      errors.push({ id: id, parentId: entry.parentId || '', depth: entry.depth || 0, error: 'Cannot open folder: ' + String(error && error.message ? error.message : error) });
      return;
    }

    let name = '';
    try { name = oxSafeName(folder.getName()); } catch (error) {}
    let ownerEmail = '';
    if (id === rootId) ownerEmail = oxDriveFolderOwnerEmail(folder);
    nodes.push({ id: id, name: name, parentId: String(entry.parentId || ''), depth: Number(entry.depth || 0), ownerEmail: ownerEmail });
    processedIds.push(id);

    if (Number(entry.depth || 0) >= OX_CONFIG.MAX_DEPTH) return;
    let iterator;
    try {
      iterator = folder.getFolders();
      iteratorScans++;
    } catch (error) {
      errors.push({ id: id, parentId: entry.parentId || '', depth: entry.depth || 0, error: 'Cannot list child folders: ' + String(error && error.message ? error.message : error) });
      return;
    }

    while (iterator.hasNext()) {
      let child;
      try { child = iterator.next(); } catch (error) { break; }
      let childId = '';
      try { childId = String(child.getId() || ''); } catch (error) {}
      if (!childId || nextSeen[childId]) continue;
      nextSeen[childId] = true;
      childRows++;
      nextPending.push({ id: childId, parentId: id, depth: Number(entry.depth || 0) + 1 });
      if (nextPending.length > OX_CONFIG.MAX_FOLDERS) {
        throw new Error('Drive folder scan queue exceeded the ' + OX_CONFIG.MAX_FOLDERS + ' folder safety limit.');
      }
    }
  });

  return {
    ok: true,
    mode: 'folder_chunk',
    strategy: 'driveapp-folder-chunks-v15.2',
    rootFolderId: rootId,
    processed: processedIds.length,
    processedIds: processedIds,
    nodes: nodes,
    nextPending: nextPending,
    done: nextPending.length === 0,
    childRows: childRows,
    iteratorScans: iteratorScans,
    errors: errors,
    elapsedMs: Date.now() - started
  };
}

function oxClassifyFolderTree(body) {
  const started = Date.now();
  const rootId = oxExtractFolderId(body.rootFolderId || body.root_folder_id || body.root || '');
  if (!rootId) return { ok: false, error: 'No valid root folder ID supplied for classify_tree.' };
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  if (!nodes.length) return { ok: false, error: 'No discovered folder tree supplied for classify_tree.' };

  const index = oxIndexFromClientTree(rootId, nodes);
  const root = index.byId[rootId];
  if (!root) return { ok: false, error: 'The supplied folder tree does not contain the requested root.' };

  const rootMeta = oxRootMeta(root, rootId, 1);
  const found = [];
  const stats = { folders: 0, detections: {}, audioProbeFolders: 0, audioFilesPeeked: 0, ambiguous: [] };
  oxFindStoryFolders(index, rootId, rootMeta, 0, [root.name || 'Drive root'], true, 'root', found, {}, stats);

  const seenStoryFolders = {};
  const candidates = [];
  found.forEach(function(item) {
    if (!item.storyFolderId || seenStoryFolders[item.storyFolderId]) return;
    seenStoryFolders[item.storyFolderId] = true;
    candidates.push(item);
  });
  candidates.sort(function(a, b) { return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }); });
  candidates.forEach(function(item, i) { item.displayOrder = i + 1; });

  return {
    ok: true,
    mode: 'story_candidates',
    strategy: 'chunked-tree-story-boundary-v15.2',
    roots: 1,
    count: candidates.length,
    indexedFolders: index.count,
    scannedFolders: index.count,
    classificationFoldersVisited: Number(stats.folders || 0),
    iteratorScans: 0,
    apiCalls: 0,
    checkedFiles: Number(stats.audioFilesPeeked || 0),
    scannedFiles: Number(stats.audioFilesPeeked || 0),
    audioProbeFolders: Number(stats.audioProbeFolders || 0),
    ambiguousCount: (stats.ambiguous || []).length,
    elapsedMs: Date.now() - started,
    detectionCounts: stats.detections || {},
    ambiguous: stats.ambiguous || [],
    rootResults: [{
      ok: true,
      rootFolderId: rootId,
      scannedFolderId: rootId,
      rootFolderName: rootMeta.rootFolderName,
      rootDriveUrl: rootMeta.rootDriveUrl,
      rootOwnerEmail: rootMeta.rootOwnerEmail,
      storiesFound: candidates.length,
      foldersDiscovered: index.count,
      classificationFoldersVisited: Number(stats.folders || 0),
      ambiguousFound: (stats.ambiguous || []).length,
      audioProbeFolders: Number(stats.audioProbeFolders || 0),
      elapsedMs: Date.now() - started
    }],
    candidates: candidates,
    stories: candidates
  };
}

function oxIndexFromClientTree(rootId, nodes) {
  const index = {
    byId: {}, children: {}, rootMap: {}, rootErrors: {}, folderRefs: {}, audioProbeCache: {},
    count: 0, iteratorScans: 0, rawChildRows: 0, levels: 0, foldersByDepth: {}, folderReadErrors: 0
  };
  index.rootMap[rootId] = rootId;
  const seen = {};
  nodes.forEach(function(item) {
    if (!item) return;
    const id = oxExtractFolderId(item.id) || String(item.id || '');
    if (!id) return;
    const parentId = String(item.parentId || '');
    const ownerEmail = String(item.ownerEmail || '').trim();
    oxAddFolderToIndex(index, {
      id: id,
      name: oxSafeName(item.name),
      parents: parentId ? [parentId] : [],
      owners: ownerEmail ? [{ emailAddress: ownerEmail }] : [],
      sharingUser: null,
      shortcutDetails: null
    });
    if (!seen[id]) {
      seen[id] = true;
      index.count++;
      const depth = Math.max(0, Number(item.depth || 0));
      index.foldersByDepth[String(depth)] = Number(index.foldersByDepth[String(depth)] || 0) + 1;
      if (depth > index.levels) index.levels = depth;
      if (parentId) index.rawChildRows++;
    }
  });
  return index;
}

function oxScanRootsFast(rootIds) {
  const started = Date.now();
  const indexStarted = Date.now();
  const index = oxBuildDriveAppFolderIndex(rootIds);
  const indexElapsedMs = Date.now() - indexStarted;
  const candidates = [];
  const seenStoryFolders = {};
  const rootResults = [];
  const detectionCounts = {};
  const ambiguous = [];
  let classificationFoldersVisited = 0;
  let audioProbeFolders = 0;
  let audioFilesPeeked = 0;

  rootIds.forEach(function(requestedRootId, rootIndex) {
    const rootStarted = Date.now();
    try {
      const resolvedRootId = index.rootMap[requestedRootId] || requestedRootId;
      const root = index.byId[resolvedRootId];
      if (!root) {
        const rootErr = index.rootErrors[requestedRootId] || 'Folder is not accessible to this Google account.';
        throw new Error(rootErr);
      }

      const rootMeta = oxRootMeta(root, requestedRootId, rootIndex + 1);
      rootMeta.scannedFolderId = resolvedRootId;

      const found = [];
      const visitStats = { folders: 0, detections: {}, audioProbeFolders: 0, audioFilesPeeked: 0, ambiguous: [] };
      oxFindStoryFolders(index, resolvedRootId, rootMeta, 0, [root.name || 'Drive root'], true, 'root', found, {}, visitStats);
      classificationFoldersVisited += visitStats.folders;
      audioProbeFolders += Number(visitStats.audioProbeFolders || 0);
      audioFilesPeeked += Number(visitStats.audioFilesPeeked || 0);
      (visitStats.ambiguous || []).forEach(function(item) { ambiguous.push(item); });
      Object.keys(visitStats.detections || {}).forEach(function(key) {
        detectionCounts[key] = (detectionCounts[key] || 0) + Number(visitStats.detections[key] || 0);
      });

      found.forEach(function(item) {
        if (!item.storyFolderId || seenStoryFolders[item.storyFolderId]) return;
        seenStoryFolders[item.storyFolderId] = true;
        candidates.push(item);
      });

      rootResults.push({
        ok: true,
        rootFolderId: requestedRootId,
        scannedFolderId: resolvedRootId,
        rootFolderName: rootMeta.rootFolderName,
        rootDriveUrl: rootMeta.rootDriveUrl,
        rootOwnerEmail: rootMeta.rootOwnerEmail,
        storiesFound: found.length,
        foldersDiscovered: oxCountReachableFolders(index, resolvedRootId),
        classificationFoldersVisited: visitStats.folders,
        ambiguousFound: (visitStats.ambiguous || []).length,
        audioProbeFolders: Number(visitStats.audioProbeFolders || 0),
        elapsedMs: Date.now() - rootStarted
      });
    } catch (error) {
      rootResults.push({
        ok: false,
        rootFolderId: requestedRootId,
        rootDriveUrl: oxFolderUrl(requestedRootId),
        error: String(error && error.message ? error.message : error),
        elapsedMs: Date.now() - rootStarted
      });
    }
  });

  candidates.sort(function(a, b) {
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  });
  candidates.forEach(function(item, indexNo) { item.displayOrder = indexNo + 1; });

  return {
    ok: true,
    mode: 'story_candidates',
    strategy: 'driveapp-story-boundary-v15.1',
    roots: rootIds.length,
    count: candidates.length,
    indexedFolders: index.count,
    scannedFolders: index.count,
    classificationFoldersVisited: classificationFoldersVisited,
    indexPages: index.iteratorScans,
    iteratorScans: index.iteratorScans,
    apiCalls: index.iteratorScans,
    levels: index.levels,
    foldersByDepth: index.foldersByDepth,
    incompleteSearch: false,
    rawChildRows: index.rawChildRows,
    folderRows: index.rawChildRows,
    shortcutRows: 0,
    folderShortcutTargets: 0,
    ignoredNonFolderShortcuts: 0,
    folderReadErrors: index.folderReadErrors,
    indexElapsedMs: indexElapsedMs,
    checkedFiles: audioFilesPeeked,
    scannedFiles: audioFilesPeeked,
    audioProbeFolders: audioProbeFolders,
    ambiguousCount: ambiguous.length,
    elapsedMs: Date.now() - started,
    detectionCounts: detectionCounts,
    ambiguous: ambiguous,
    rootResults: rootResults,
    candidates: candidates,
    stories: candidates
  };
}

// v14.8 deliberately returns to the proven Apps Script DriveApp folder iterator.
// It enumerates FOLDERS ONLY. No MP3/audio file is opened or counted during discovery.
// Folder.getFolders() is scoped to the actual folder object, which is reliable for
// folders shared with this Google account and avoids the incomplete hierarchy we saw
// when rebuilding Shared-with-me trees from broad Drive.Files.list queries.
function oxBuildDriveAppFolderIndex(rootIds) {
  const index = {
    byId: {},
    children: {},
    rootMap: {},
    rootErrors: {},
    folderRefs: {},
    audioProbeCache: {},
    count: 0,
    iteratorScans: 0,
    rawChildRows: 0,
    levels: 0,
    foldersByDepth: {},
    folderReadErrors: 0
  };

  const queue = [];
  const queued = {};
  const expanded = {};

  rootIds.forEach(function(rootId) {
    try {
      const folder = DriveApp.getFolderById(rootId);
      const id = String(folder.getId());
      const node = oxNodeFromDriveFolder(folder, [], true);
      index.folderRefs[id] = folder;
      index.rootMap[rootId] = id;
      if (!index.byId[id]) {
        oxAddFolderToIndex(index, node);
        index.count++;
      }
      if (!queued[id]) {
        queued[id] = true;
        queue.push({ folder: folder, id: id, depth: 0 });
      }
    } catch (error) {
      index.rootErrors[rootId] = 'Cannot open this Drive root: ' + String(error && error.message ? error.message : error);
    }
  });

  while (queue.length) {
    const current = queue.shift();
    if (!current || !current.id || expanded[current.id]) continue;
    if (current.depth >= OX_CONFIG.MAX_DEPTH) continue;
    expanded[current.id] = true;

    let iterator;
    try {
      iterator = current.folder.getFolders();
      index.iteratorScans++;
    } catch (error) {
      index.folderReadErrors++;
      continue;
    }

    const childDepth = current.depth + 1;
    if (childDepth > index.levels) index.levels = childDepth;

    while (iterator.hasNext()) {
      let child;
      try {
        child = iterator.next();
      } catch (error) {
        index.folderReadErrors++;
        break;
      }

      let childId;
      try {
        childId = String(child.getId());
      } catch (error) {
        index.folderReadErrors++;
        continue;
      }
      if (!childId) continue;

      index.rawChildRows++;
      const isNew = !index.byId[childId];
      const node = oxNodeFromDriveFolder(child, [current.id], false);
      index.folderRefs[childId] = child;
      oxAddFolderToIndex(index, node);

      if (isNew) {
        index.count++;
        index.foldersByDepth[String(childDepth)] = Number(index.foldersByDepth[String(childDepth)] || 0) + 1;
        if (index.count > OX_CONFIG.MAX_FOLDERS) {
          throw new Error('Drive folder scan stopped after ' + OX_CONFIG.MAX_FOLDERS + ' folders. Increase the safety limit if your library is larger.');
        }
      }

      if (!expanded[childId] && !queued[childId]) {
        queued[childId] = true;
        queue.push({ folder: child, id: childId, depth: childDepth });
      }
    }
  }

  // Keep the roots visible as depth 0 diagnostics; descendants begin at depth 1.
  index.foldersByDepth['0'] = Object.keys(index.rootMap).length;
  return index;
}

function oxNodeFromDriveFolder(folder, parents, includeOwner) {
  let id = '';
  let name = '';
  let ownerEmail = '';
  try { id = String(folder.getId() || ''); } catch (error) {}
  try { name = oxSafeName(folder.getName()); } catch (error) {}
  if (includeOwner) ownerEmail = oxDriveFolderOwnerEmail(folder);
  return {
    id: id,
    name: name,
    parents: Array.isArray(parents) ? parents.map(String) : [],
    owners: ownerEmail ? [{ emailAddress: ownerEmail }] : [],
    sharingUser: null,
    shortcutDetails: null
  };
}

function oxDriveFolderOwnerEmail(folder) {
  try {
    const owner = folder.getOwner();
    if (owner && typeof owner.getEmail === 'function') {
      const email = String(owner.getEmail() || '').trim();
      if (email) return email;
    }
  } catch (error) {}
  return '';
}

function oxAddFolderToIndex(index, file) {
  if (!file || !file.id) return;
  const id = String(file.id);
  const incomingParents = Array.isArray(file.parents) ? file.parents.map(String) : [];
  const existing = index.byId[id];
  const normalized = existing || {
    id: id,
    name: oxSafeName(file.name),
    parents: [],
    owners: [],
    sharingUser: null,
    shortcutDetails: null
  };
  if (!normalized.name && file.name) normalized.name = oxSafeName(file.name);
  if ((!normalized.owners || !normalized.owners.length) && Array.isArray(file.owners)) normalized.owners = file.owners;
  incomingParents.forEach(function(parentId) {
    if (normalized.parents.indexOf(parentId) === -1) normalized.parents.push(parentId);
    if (!index.children[parentId]) index.children[parentId] = [];
    if (index.children[parentId].indexOf(id) === -1) index.children[parentId].push(id);
  });
  index.byId[id] = normalized;
}

function oxRootMeta(folder, rootId, rootOrder) {
  return {
    rootFolderId: rootId,
    rootFolderName: oxSafeName(folder.name) || 'Drive root',
    rootDriveUrl: oxFolderUrl(rootId),
    rootOwnerEmail: oxOwnerEmail(folder),
    rootOrder: rootOrder
  };
}

function oxOwnerEmail(folder) {
  try {
    const owners = folder && Array.isArray(folder.owners) ? folder.owners : [];
    for (let i = 0; i < owners.length; i++) {
      const email = String(owners[i] && owners[i].emailAddress ? owners[i].emailAddress : '').trim();
      if (email) return email;
    }
  } catch (error) {}
  return '';
}

function oxCountReachableFolders(index, rootId) {
  const seen = {};
  const queue = [rootId];
  let count = 0;
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen[id]) continue;
    seen[id] = true;
    count++;
    (index.children[id] || []).forEach(function(childId) {
      if (!seen[childId]) queue.push(childId);
    });
  }
  return count;
}

function oxFindStoryFolders(index, nodeId, rootMeta, depth, path, isProvidedRoot, context, output, seen, stats) {
  if (depth > OX_CONFIG.MAX_DEPTH || seen[nodeId]) return;
  seen[nodeId] = true;
  const node = index.byId[nodeId];
  if (!node) return;
  stats.folders++;

  const childIds = (index.children[nodeId] || []).filter(function(id) { return Boolean(index.byId[id]); });
  const children = childIds.map(function(id) { return index.byId[id]; });
  const contentChildren = children.filter(function(child) { return oxIsContentFolderName(child.name); });
  const nonContentChildren = children.filter(function(child) { return !oxIsContentFolderName(child.name); });

  // A pasted folder may itself be a story. We only claim it automatically when the
  // structure gives a strong signal. Otherwise a pasted root behaves as a container.
  if (isProvidedRoot) {
    if (!oxIsContainerFolderName(node.name)) {
      if (contentChildren.length > 0 || oxProbeDirectAudio(index, node.id, stats)) {
        oxPushDetection(stats, contentChildren.length ? 'provided-content-boundary' : 'provided-direct-audio');
        output.push(oxCandidate(node, rootMeta, path, depth, contentChildren.length ? 'provided-content-boundary' : 'provided-direct-audio'));
        return;
      }
      if (children.length === 0) {
        oxPushAmbiguous(stats, rootMeta, path, depth, 'Pasted folder has no child folders and no audio was detected.', [node]);
        return;
      }
    }
    children.forEach(function(child) {
      oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, 'root', output, seen, stats);
    });
    return;
  }

  // Exact/generic collection names are containers. This is deliberately exact-ish:
  // "Library" is a container, while a title such as "Library Of Flaws" is not.
  if (oxIsContainerFolderName(node.name)) {
    children.forEach(function(child) {
      oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, 'container', output, seen, stats);
    });
    return;
  }

  // Most important boundary rule: if a title folder contains episode/range/audio/part
  // folders, the CURRENT folder is the story. Never count those descendants as stories.
  if (contentChildren.length > 0) {
    oxPushDetection(stats, 'content-child-boundary');
    output.push(oxCandidate(node, rootMeta, path, depth, 'content-child-boundary'));
    return;
  }

  // Direct audio in the current folder is also a strong story signal. This handles
  // Story -> audio files and Story -> audio files + arbitrary subfolders without
  // enumerating the whole audio collection: the probe stops as soon as audio is found.
  if (oxProbeDirectAudio(index, node.id, stats)) {
    oxPushDetection(stats, 'direct-audio-boundary');
    output.push(oxCandidate(node, rootMeta, path, depth, 'direct-audio-boundary'));
    return;
  }

  // A wrapper folder and its only child sometimes repeat the same story title using
  // different case/punctuation. Descend to the child that actually owns the content.
  if (nonContentChildren.length === 1 && oxSameTitle(node.name, nonContentChildren[0].name)) {
    const child = nonContentChildren[0];
    oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, context, output, seen, stats);
    return;
  }

  // If there are multiple title-like children, this node is a collection/sub-root.
  // This supports arbitrary nesting such as Root -> ABC -> XYZ -> Story A/B/C.
  if (nonContentChildren.length >= 2) {
    const storyish = nonContentChildren.filter(function(child) { return oxTitleScore(child.name) >= 2; }).length;
    const genericish = nonContentChildren.filter(function(child) { return oxTitleScore(child.name) <= 1; }).length;

    // A title-like current node with mostly generic custom groups is probably a story
    // whose episodes are split into oddly named folders. Otherwise prefer container.
    if (oxTitleScore(node.name) >= 2 && genericish > storyish) {
      oxPushDetection(stats, 'custom-group-boundary');
      output.push(oxCandidate(node, rootMeta, path, depth, 'custom-group-boundary'));
      return;
    }

    nonContentChildren.forEach(function(child) {
      oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, 'container', output, seen, stats);
    });
    return;
  }

  if (nonContentChildren.length === 1) {
    const child = nonContentChildren[0];
    const grandChildren = (index.children[child.id] || []).map(function(id) { return index.byId[id]; }).filter(Boolean);
    const childContent = grandChildren.filter(function(grand) { return oxIsContentFolderName(grand.name); });
    const childStoryish = grandChildren.filter(function(grand) { return !oxIsContentFolderName(grand.name) && oxTitleScore(grand.name) >= 2; });

    // Generic parent -> actual story child.
    if (oxIsContainerLikeByName(node.name) || childContent.length > 0 || childStoryish.length >= 2) {
      oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, 'container', output, seen, stats);
      return;
    }

    // If the child directly contains audio, choose between current and child only when
    // the naming signal is strong. Otherwise send a tiny Admin boundary review.
    const childHasAudio = oxProbeDirectAudio(index, child.id, stats);
    if (childHasAudio) {
      const nodeScore = oxTitleScore(node.name);
      const childScore = oxTitleScore(child.name);
      if (nodeScore <= 1 && childScore >= 2) {
        oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, 'container', output, seen, stats);
        return;
      }
      if (nodeScore >= 2 && childScore <= 1) {
        oxPushDetection(stats, 'title-over-generic-audio-child');
        output.push(oxCandidate(node, rootMeta, path, depth, 'title-over-generic-audio-child'));
        return;
      }
      oxPushAmbiguous(stats, rootMeta, path, depth, 'Both this folder and its only child could be the story boundary.', [node, child], child.name);
      return;
    }

    // Continue through a single chain. The leaf logic below will either find direct
    // audio or surface a review instead of inventing a story from an empty folder.
    oxFindStoryFolders(index, child.id, rootMeta, depth + 1, path.concat([child.name]), false, context, output, seen, stats);
    return;
  }

  // A leaf with direct audio would already have returned above. An empty/non-audio
  // leaf is not safe to auto-import, so expose it as a review rather than guessing.
  if (children.length === 0) {
    oxPushAmbiguous(stats, rootMeta, path, depth, 'Leaf folder has no detectable direct audio. Choose it only if it is intentionally a story folder.', [node]);
  }
}

function oxPushDetection(stats, key) {
  if (!stats || !key) return;
  stats.detections[key] = Number(stats.detections[key] || 0) + 1;
}

function oxPushAmbiguous(stats, rootMeta, path, depth, reason, nodes, childName) {
  if (!stats || !Array.isArray(stats.ambiguous)) return;
  const options = (nodes || []).filter(Boolean).map(function(node, index) {
    let optionPath = path.slice();
    if (index > 0 && childName) optionPath = path.concat([childName]);
    return {
      title: oxCleanStoryTitle(node.name),
      storyFolderId: node.id,
      folderId: node.id,
      driveUrl: oxFolderUrl(node.id),
      folderPath: optionPath.join(' / '),
      depth: depth + (index > 0 ? 1 : 0)
    };
  });
  stats.ambiguous.push({
    reason: reason,
    rootFolderId: rootMeta.rootFolderId,
    rootFolderName: rootMeta.rootFolderName,
    rootDriveUrl: rootMeta.rootDriveUrl,
    rootOwnerEmail: rootMeta.rootOwnerEmail,
    folderPath: path.join(' / '),
    depth: depth,
    options: options
  });
}

function oxProbeDirectAudio(index, nodeId, stats) {
  if (!index || !nodeId) return false;
  if (Object.prototype.hasOwnProperty.call(index.audioProbeCache, nodeId)) return Boolean(index.audioProbeCache[nodeId]);
  let folder = index.folderRefs[nodeId];
  if (!folder) {
    try { folder = DriveApp.getFolderById(nodeId); } catch (error) { index.audioProbeCache[nodeId] = false; return false; }
  }
  let iterator;
  try {
    iterator = folder.getFiles();
    stats.audioProbeFolders = Number(stats.audioProbeFolders || 0) + 1;
  } catch (error) {
    index.audioProbeCache[nodeId] = false;
    return false;
  }

  let checked = 0;
  let found = false;
  while (iterator.hasNext() && checked < OX_CONFIG.AUDIO_PROBE_MAX_FILES) {
    let file;
    try { file = iterator.next(); } catch (error) { break; }
    checked++;
    stats.audioFilesPeeked = Number(stats.audioFilesPeeked || 0) + 1;
    if (oxLooksLikeAudioFile(file)) { found = true; break; }
  }
  index.audioProbeCache[nodeId] = found;
  return found;
}

function oxLooksLikeAudioFile(file) {
  try {
    const mime = String(file && typeof file.getMimeType === 'function' ? file.getMimeType() : '').toLowerCase();
    if (mime.indexOf('audio/') === 0) return true;
  } catch (error) {}
  try {
    const name = String(file && typeof file.getName === 'function' ? file.getName() : '').toLowerCase();
    return /\.(?:mp3|m4a|m4b|aac|wav|wave|flac|ogg|oga|opus|wma|aiff|aif|amr|3gp|webm|mp4)$/i.test(name);
  } catch (error) {}
  return false;
}

function oxSameTitle(a, b) {
  return oxNormalizeComparableTitle(a) && oxNormalizeComparableTitle(a) === oxNormalizeComparableTitle(b);
}

function oxNormalizeComparableTitle(value) {
  return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function oxTitleScore(value) {
  const raw = oxSafeName(value);
  const name = raw.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return 0;
  if (oxIsContainerLikeByName(name) || oxIsContentFolderName(name)) return 0;
  const words = name.match(/[a-z]+/g) || [];
  let score = 0;
  if (words.length >= 1) score += 1; // one-word titles such as Skypiercer/Godkiller are valid
  if (words.length >= 2) score += 1;
  if (words.length >= 3) score += 1;
  if (raw.length >= 8) score += 1;
  if (/\b(the|my|his|her|our|a|an|of|in|with|love|system|alpha|bride|wolf|vampire|king|queen|heir|revenge|moon|royal)\b/i.test(raw)) score += 1;
  if (/\b(audio|folder|files?|episodes?|parts?|season|batch|backup|copy|root|stories|uploads?)\b/i.test(raw)) score -= 2;
  return Math.max(0, score);
}

function oxIsContainerLikeByName(value) {
  const name = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!name) return false;
  return /^(?:root|roots|main root|sub root|subroot|story folder|story folders|sub story folder|sub story folders|stories|story library|novels|novel library|audio stories|audio novels|library|collection|collections|all stories|new stories|old stories|shared stories|shared|backup|backups|drive|folder|folders|uploads?|archive|archives|ongoing|completed|complete|unfinished|stopped|cancelled|canceled|1 completed|audiobook|audio book|pfm)$/i.test(name);
}

function oxIsContainerFolderName(value) {
  return oxIsContainerLikeByName(value);
}

function oxIsContentFolderName(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[–—]/g, '-').replace(/_/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return false;

  // Numeric episode/range folders, including suffixes such as "301-352(ongoing)",
  // "701-744 completed", "2001-2079completed" and "301-339 story completed".
  if (/^(?:ep(?:isode)?s?\s*)?\d{1,6}\s*(?:-|to)\s*\d{1,6}(?:\s*\([^)]*\)|\s*(?:story\s*)?(?:ongoing|completed?|complete|finished|end|ended))?\s*$/i.test(raw)) return true;
  if (/^\d{1,6}(?:\s*\([^)]*\)|\s*(?:story\s*)?(?:ongoing|completed?|complete|finished|end|ended))?\s*$/i.test(raw)) return true;

  // Generic content group names. A title merely containing one of these words is not
  // rejected; the word has to lead the folder name like a normal episode grouping.
  if (/^(?:episodes?|eps?|ep\b|parts?|seasons?|books?|volumes?|vol\b|chapters?|audio|audios|audio files?|files?|tracks?|episode files?|batches?|batch\b|sets?|disc\s*\d*|cd\s*\d*)\b/i.test(raw)) return true;
  if (/^(?:part|season|book|volume|vol|chapter|batch|set)\s*[#._-]?\s*\d+[a-z]?\b/i.test(raw)) return true;
  return false;
}

function oxCandidate(node, rootMeta, path, depth, detection) {
  return {
    title: oxCleanStoryTitle(node.name),
    slug: oxSlugify(node.name),
    duplicateKey: oxSlugify(node.name),
    rootFolderId: rootMeta.rootFolderId,
    rootFolderName: rootMeta.rootFolderName,
    rootDriveUrl: rootMeta.rootDriveUrl,
    rootOwnerEmail: rootMeta.rootOwnerEmail,
    rootOrder: rootMeta.rootOrder,
    storyFolderId: node.id,
    folderId: node.id,
    driveUrl: oxFolderUrl(node.id),
    folderPath: path.join(' / '),
    depth: depth,
    detection: detection,
    audioFiles: null,
    episodeCount: null
  };
}

function oxCleanStoryTitle(value) {
  return oxSafeName(value)
    .replace(/^\s*[\[(]?\d{1,4}[\])\]._-]*\s*/, '')
    .replace(/^\s*(story|novel)\s*[-_:]\s*/i, '')
    .trim() || 'Untitled Story';
}

function oxSlugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function oxFolderUrl(id) {
  return 'https://drive.google.com/drive/folders/' + encodeURIComponent(String(id || ''));
}

function oxSafeName(value) {
  return String(value || '').trim();
}

function oxOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
