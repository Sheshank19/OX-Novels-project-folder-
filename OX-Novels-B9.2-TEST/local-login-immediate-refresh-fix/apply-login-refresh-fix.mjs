import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const appPath = path.join(root, 'public', 'assets', 'app.js');
const backupDir = path.join(here, 'backups');
const backupPath = path.join(backupDir, 'app.js.before-login-immediate-refresh-fix');

if (!fs.existsSync(appPath)) {
  throw new Error('Place local-login-immediate-refresh-fix directly inside the OX-Novels project before running this installer.');
}

let src = fs.readFileSync(appPath, 'utf8');
if (src.includes('OX_LOGIN_IMMEDIATE_REFRESH_FIX_V1')) {
  console.log('Login immediate-refresh fix is already installed. Nothing changed.');
  process.exit(0);
}

const required = [
  'let googleIdentityPromise = null;',
  'async function finishGoogleCredential(response) {',
  'async function syncAccessStatusFromServer({ force = false } = {}) {',
  'function requestAccessStatusSync(force = false) {'
];
for (const marker of required) {
  if (!src.includes(marker)) throw new Error(`Expected OX code marker not found: ${marker}`);
}

fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(backupPath)) fs.copyFileSync(appPath, backupPath);

src = src.replace(
`let googleIdentityPromise = null;\nlet googleIdentityClientId = "";`,
`let googleIdentityPromise = null;\nlet googleIdentityClientId = "";\n\n// OX_LOGIN_IMMEDIATE_REFRESH_FIX_V1\n// Google popup focus can fire while the sign-in POST is still completing.\n// Track an auth revision so an older /api/session response can never overwrite\n// the freshly authenticated UI with a stale logged-out snapshot.\nlet memberAuthInFlight = false;\nlet memberSessionRevision = 0;`
);

src = src.replace(
`async function finishGoogleCredential(response) {\n  const credential = String(response?.credential || "");\n  if (!credential) return;`,
`async function finishGoogleCredential(response) {\n  const credential = String(response?.credential || "");\n  if (!credential) return;\n  memberAuthInFlight = true;\n  memberSessionRevision += 1;`
);

src = src.replace(
`} finally { holder?.classList.remove("is-busy", "is-processing"); }\n}`,
`} finally {\n    memberAuthInFlight = false;\n    holder?.classList.remove("is-busy", "is-processing");\n  }\n}`
);

src = src.replace(
`async function syncAccessStatusFromServer({ force = false } = {}) {\n  if (accessStatusSyncPromise) return accessStatusSyncPromise;\n  const now = Date.now();`,
`async function syncAccessStatusFromServer({ force = false } = {}) {\n  if (memberAuthInFlight) return null;\n  if (accessStatusSyncPromise) return accessStatusSyncPromise;\n  const syncRevision = memberSessionRevision;\n  const now = Date.now();`
);

src = src.replace(
`      const payload = await response.json();\n      const wasLoggedIn = state.loggedIn;`,
`      const payload = await response.json();\n      // Ignore a session response that started before/during a Google auth change.\n      // The auth POST result is newer and must win.\n      if (memberAuthInFlight || syncRevision !== memberSessionRevision) return;\n      const wasLoggedIn = state.loggedIn;`
);

src = src.replace(
`function requestAccessStatusSync(force = false) {\n  if (document.visibilityState === "hidden") return;`,
`function requestAccessStatusSync(force = false) {\n  if (memberAuthInFlight) return;\n  if (document.visibilityState === "hidden") return;`
);

fs.writeFileSync(appPath, src, 'utf8');
console.log('Applied OX local immediate-login refresh race fix.');
console.log('The request-optimization timers remain optimized; no 5-second polling was restored.');
console.log('Backup stored in local-login-immediate-refresh-fix/backups.');
console.log('.dev.vars, .dev.vars.live-backup, D1, payments, Player Worker and production were NOT modified.');
