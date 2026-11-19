import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const appPath = path.join(root, 'public', 'assets', 'app.js');
const workerPath = path.join(root, 'src', 'index.js');
const backupDir = path.join(here, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

if (!fs.existsSync(appPath) || !fs.existsSync(workerPath)) {
  throw new Error('Run this from the OX-Novels project with public/assets/app.js and src/index.js present.');
}

function backupOnce(src, name) {
  const dst = path.join(backupDir, name);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
}
backupOnce(appPath, 'app.js.before-request-optimization');
backupOnce(workerPath, 'index.js.before-request-optimization');

let app = fs.readFileSync(appPath, 'utf8');
let worker = fs.readFileSync(workerPath, 'utf8');

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}. No files were written.`);
  return text.replace(before, after);
}

app = replaceOnce(
  app,
  'const memberChatState = { messages: [], unread: 0, pollTimer: null, loaded: false, sending: false };',
  'const memberChatState = { messages: [], unread: 0, pollTimer: null, loaded: false, sending: false, lastBackgroundStatusAt: 0 };',
  'chat state'
);

app = replaceOnce(
  app,
  `function startPostsStatusPolling() {\n  if (postsState.statusTimer) clearInterval(postsState.statusTimer);\n  if (!els.postsTab || state.lifetimePurchaseMode) {\n    postsState.statusTimer = null;\n    updatePostsUnread(0);\n    return;\n  }\n  void pollPostsStatus({ force: true });\n  postsState.statusTimer = setInterval(() => {\n    if (document.visibilityState === "visible") void pollPostsStatus();\n  }, 10000);\n}`,
  `function startPostsStatusPolling() {\n  if (postsState.statusTimer) clearInterval(postsState.statusTimer);\n  if (!els.postsTab || state.lifetimePurchaseMode) {\n    postsState.statusTimer = null;\n    updatePostsUnread(0);\n    return;\n  }\n  void pollPostsStatus({ force: true });\n  // Background unread checks are deliberately slow. Opening/focusing OX and\n  // switching tabs already refresh immediately, so a 10-minute safety check\n  // avoids spending Worker/D1 quota while customers simply read or listen.\n  postsState.statusTimer = setInterval(() => {\n    if (document.visibilityState === "visible") void pollPostsStatus();\n  }, 600000);\n}`,
  'posts status interval'
);

app = replaceOnce(
  app,
  `function startPostsPolling() {\n  stopPostsPolling();\n  if (!els.postsTab) return;\n  postsState.pollTimer = setInterval(() => {\n    if (document.visibilityState === "visible" && getActivePanelName() === "posts") {\n      void loadPosts({ silent: true }).catch(() => {});\n    }\n  }, 10000);\n}`,
  `function startPostsPolling() {\n  stopPostsPolling();\n  if (!els.postsTab) return;\n  // Posts are not a real-time chat feed. Refresh once per minute only while\n  // the Posts tab is actually open; entering/focusing the tab also refreshes.\n  postsState.pollTimer = setInterval(() => {\n    if (document.visibilityState === "visible" && getActivePanelName() === "posts") {\n      void loadPosts({ silent: true }).catch(() => {});\n    }\n  }, 60000);\n}`,
  'posts feed interval'
);

app = replaceOnce(
  app,
  `async function pollMemberChat() {\n  if (!hasPaidChatAccess() || state.settings.showChat === false) {\n    updateMemberChatUnread(0);\n    return;\n  }\n  const chatOpen = getActivePanelName() === "chat" && !document.hidden;\n  try {\n    if (chatOpen) await loadMemberChat({ seen: true, forceBottom: false });\n    else {\n      const response = await fetch("/api/chat/status", { cache: "no-store", credentials: "same-origin" });\n      const payload = await response.json().catch(() => ({}));\n      if (response.ok) updateMemberChatUnread(payload.unread || 0);\n    }\n  } catch {}\n}\nfunction startMemberChatPolling() {\n  if (memberChatState.pollTimer) clearInterval(memberChatState.pollTimer);\n  if (!hasPaidChatAccess() || state.settings.showChat === false) {\n    memberChatState.pollTimer = null;\n    updateMemberChatUnread(0);\n    return;\n  }\n  void pollMemberChat();\n  memberChatState.pollTimer = setInterval(pollMemberChat, 6000);\n}`,
  `async function pollMemberChat() {\n  if (!hasPaidChatAccess() || state.settings.showChat === false) {\n    updateMemberChatUnread(0);\n    return;\n  }\n  const chatOpen = getActivePanelName() === "chat" && !document.hidden;\n  try {\n    if (chatOpen) {\n      // Chat remains responsive only while the customer is actually looking at it.\n      await loadMemberChat({ seen: true, forceBottom: false });\n    } else {\n      // When Chat is closed, a 10-minute unread safety check is enough.\n      // Focus/tab-entry paths still refresh immediately.\n      const now = Date.now();\n      if (memberChatState.lastBackgroundStatusAt && now - memberChatState.lastBackgroundStatusAt < 600000) return;\n      memberChatState.lastBackgroundStatusAt = now;\n      const response = await fetch("/api/chat/status", { cache: "no-store", credentials: "same-origin" });\n      const payload = await response.json().catch(() => ({}));\n      if (response.ok) updateMemberChatUnread(payload.unread || 0);\n    }\n  } catch {}\n}\nfunction startMemberChatPolling() {\n  if (memberChatState.pollTimer) clearInterval(memberChatState.pollTimer);\n  if (!hasPaidChatAccess() || state.settings.showChat === false) {\n    memberChatState.pollTimer = null;\n    updateMemberChatUnread(0);\n    return;\n  }\n  void pollMemberChat();\n  // Ten-second ticks are client-side only when Chat is closed; the function\n  // above suppresses background network calls for ten minutes at a time.\n  memberChatState.pollTimer = setInterval(pollMemberChat, 10000);\n}`,
  'chat polling'
);

app = replaceOnce(
  app,
  '    now - telegramBackupState.lastLoadedAt < 30000',
  '    now - telegramBackupState.lastLoadedAt < 300000',
  'telegram status cache'
);

app = replaceOnce(
  app,
  `// Keep a long-open OX tab accurate when a webhook changes membership or\n// Lifetime Story ownership in the background.\nsetInterval(() => {\n  if (document.visibilityState === "visible") requestAccessStatusSync(false);\n}, 5000);`,
  `// Keep a long-open OX tab eventually accurate without turning an idle tab\n// into a Worker/D1 polling loop. Page load, pageshow, focus and visibility\n// already refresh immediately; this is only a 10-minute safety refresh.\nsetInterval(() => {\n  if (document.visibilityState === "visible") requestAccessStatusSync(false);\n}, 600000);`,
  'session safety polling'
);

// Give uploaded story covers a stable versioned URL so browsers can keep each
// unchanged cover for a year. A new story/cover update changes the version.
worker = replaceOnce(
  worker,
  `function publicStoryFromRow(row) {\n  return {\n    id: row.id,\n    title: row.title,\n    description: row.description,\n    category: row.genre,\n    genre: row.genre,\n    cover: (!row.cover || (row.id !== "wolves-blood-moon" && row.cover === "/covers/wolves-blood-moon.svg"))\n      ? \`/api/story-cover/\${encodeURIComponent(row.id)}\`\n      : row.cover,`,
  `function publicStoryFromRow(row) {\n  return {\n    id: row.id,\n    title: row.title,\n    description: row.description,\n    category: row.genre,\n    genre: row.genre,\n    cover: (!row.cover || (row.id !== "wolves-blood-moon" && row.cover === "/covers/wolves-blood-moon.svg"))\n      ? \`/api/story-cover/\${encodeURIComponent(row.id)}?v=\${encodeURIComponent(String(row.updated_at || "0"))}\`\n      : row.cover,`,
  'versioned public story cover URL'
);

worker = replaceOnce(
  worker,
  `    await env.DB.prepare(\`INSERT INTO story_covers (story_id,mime_type,image_data,size_bytes,updated_at) VALUES (?,?,?,?,?)\n      ON CONFLICT(story_id) DO UPDATE SET mime_type=excluded.mime_type,image_data=excluded.image_data,size_bytes=excluded.size_bytes,updated_at=excluded.updated_at\`)\n      .bind(storyId, mime, buffer, buffer.byteLength, now).run();\n    return json({ ok: true, cover: \`/api/story-cover/\${encodeURIComponent(storyId)}\` });`,
  `    await env.DB.prepare(\`INSERT INTO story_covers (story_id,mime_type,image_data,size_bytes,updated_at) VALUES (?,?,?,?,?)\n      ON CONFLICT(story_id) DO UPDATE SET mime_type=excluded.mime_type,image_data=excluded.image_data,size_bytes=excluded.size_bytes,updated_at=excluded.updated_at\`)\n      .bind(storyId, mime, buffer, buffer.byteLength, now).run();\n    await env.DB.prepare("UPDATE stories SET updated_at=? WHERE id=?").bind(now, storyId).run().catch(() => null);\n    return json({ ok: true, cover: \`/api/story-cover/\${encodeURIComponent(storyId)}?v=\${encodeURIComponent(now)}\` });`,
  'cover upload version bump'
);

worker = replaceOnce(
  worker,
  `async function resetStoryCover(env, storyId) {\n  try {\n    await ensureStoryCoversTable(env);\n    await env.DB.prepare("DELETE FROM story_covers WHERE story_id = ?").bind(storyId).run();\n    return json({ ok: true, cover: \`/api/story-cover/\${encodeURIComponent(storyId)}\` });`,
  `async function resetStoryCover(env, storyId) {\n  try {\n    await ensureStoryCoversTable(env);\n    await env.DB.prepare("DELETE FROM story_covers WHERE story_id = ?").bind(storyId).run();\n    const now = new Date().toISOString();\n    await env.DB.prepare("UPDATE stories SET updated_at=? WHERE id=?").bind(now, storyId).run().catch(() => null);\n    return json({ ok: true, cover: \`/api/story-cover/\${encodeURIComponent(storyId)}?v=\${encodeURIComponent(now)}\` });`,
  'cover reset version bump'
);

fs.writeFileSync(appPath, app);
fs.writeFileSync(workerPath, worker);
console.log('Applied LOCAL request optimization patch.');
console.log('- Session safety polling: 5 sec -> 10 min');
console.log('- Posts unread polling: 10 sec -> 10 min');
console.log('- Posts feed while open: 10 sec -> 60 sec');
console.log('- Chat while open: 10 sec; closed status network call: max once / 10 min');
console.log('- Telegram repeated status cache: 30 sec -> 5 min');
console.log('- Story cover URLs are versioned for long browser caching');
console.log('No .dev.vars, migrations, payments, Telegram configuration, or production data changed.');
