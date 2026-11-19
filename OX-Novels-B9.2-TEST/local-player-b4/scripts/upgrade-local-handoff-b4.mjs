import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const b4Root = path.resolve(here, '..');
const root = path.resolve(b4Root, '..');
const workerPath = path.join(root, 'src', 'index.js');
const backupDir = path.join(b4Root, 'backups');

if (!fs.existsSync(workerPath)) throw new Error('Place local-player-b4 directly inside the OX-Novels project before running this installer.');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, 'index.js.before-b4-handoff-metadata');
if (!fs.existsSync(backup)) fs.copyFileSync(workerPath, backup);

let worker = fs.readFileSync(workerPath, 'utf8');
if (!worker.includes('playerHandoffMatch')) throw new Error('Phase B2 secure handoff patch was not found. Keep the working local-player-handoff installation first.');

const oldQuery = 'SELECT id,title,drive_url FROM stories WHERE id=? AND visible=1';
const newQuery = 'SELECT id,title,description,genre,cover,drive_url FROM stories WHERE id=? AND visible=1';
if (worker.includes(oldQuery)) worker = worker.replace(oldQuery, newQuery);
if (!worker.includes(newQuery)) throw new Error('Could not locate the secure Player story query. No changes were written.');

const oldBlock = `      const handoff = {\n        v: 1, kind: "handoff", iss: "oxnovels.top", aud: "ox-player",\n        storyId: String(story.id), storyTitle: String(story.title || "Story"),\n        driveUrl: String(story.drive_url), displayName: String(user.name || ""), access: accessType,\n        iat: now, exp: now + OX_PLAYER_HANDOFF_TTL_SECONDS, sessionExp\n      };`;

const newBlock = `      const appearanceRow = await env.DB.prepare("SELECT value FROM site_settings WHERE key='appearance'").first().catch(() => null);\n      const playerAppearance = normalizeAppearance(safeParse(appearanceRow?.value || "{}", DEFAULT_APPEARANCE));\n      const absoluteOxUrl = (value) => {\n        const raw = String(value || "").trim();\n        if (!raw) return "";\n        try { const u = new URL(raw, "https://oxnovels.top"); return u.protocol === "https:" && u.hostname === "oxnovels.top" ? u.href : ""; } catch { return ""; }\n      };\n      const rawCover = String(story.cover || "").trim();\n      const normalizedCover = (!rawCover || (String(story.id) !== "wolves-blood-moon" && rawCover === "/covers/wolves-blood-moon.svg"))\n        ? "/api/story-cover/" + encodeURIComponent(String(story.id))\n        : rawCover;\n      const memberPlan = access.testMode\n        ? (["Active","Granted"].includes(access.membershipStatus) ? "OX Test Simulation" : "None")\n        : String(user.membership_plan || "None");\n\n      const handoff = {\n        v: 1, kind: "handoff", iss: "oxnovels.top", aud: "ox-player",\n        storyId: String(story.id), storyTitle: String(story.title || "Story"),\n        storyDescription: String(story.description || ""), storyGenre: String(story.genre || ""),\n        storyCover: absoluteOxUrl(normalizedCover),\n        siteName: String(playerAppearance.name || "OX Novels"), siteLogo: absoluteOxUrl(playerAppearance.logo), siteAccent: String(playerAppearance.accent || "#13c3b3"),\n        displayName: String(user.name || ""), access: accessType, membershipStatus: String(access.membershipStatus || ""),\n        membershipPlan: memberPlan, membershipExpiresAt: String(user.membership_expires_at || ""),\n        iat: now, exp: now + OX_PLAYER_HANDOFF_TTL_SECONDS, sessionExp\n      };`;

if (!worker.includes(newBlock.trim())) {
  if (!worker.includes(oldBlock)) throw new Error('Could not locate the Phase B2 handoff payload. No changes were written.');
  worker = worker.replace(oldBlock, newBlock);
}

fs.writeFileSync(workerPath, worker, 'utf8');
console.log('Applied B4 LOCAL handoff metadata upgrade.');
console.log('Story title, description, genre, cover, site branding and account summary are now carried inside the encrypted handoff.');
console.log('No .dev.vars, database migration, payment, Telegram or production deployment was changed.');
console.log('Backup stored in local-player-b4/backups.');
