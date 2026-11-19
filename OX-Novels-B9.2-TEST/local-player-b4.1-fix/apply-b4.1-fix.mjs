import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const templatePath = path.join(root, 'local-player-b4', 'src', 'worker-B4-template.js');
const backupDir = path.join(here, 'backups');
const backupPath = path.join(backupDir, 'worker-B4-template.pre-B4.1.js');

if (!fs.existsSync(templatePath)) {
  throw new Error('Could not find local-player-b4/src/worker-B4-template.js. Put local-player-b4.1-fix directly inside the OX-Novels project.');
}

let text = fs.readFileSync(templatePath, 'utf8');
fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(backupPath)) fs.copyFileSync(templatePath, backupPath);

const oldPath = '  let path = [catalog.rootKey];';
const newPath = '  let path = [];';
if (text.includes(oldPath)) text = text.replace(oldPath, newPath);
else if (!text.includes(newPath)) throw new Error('Could not find the expected B4 navigation initialization. The local B4 template may be a different version.');

const oldReady = `    if (String(catalog.sourceVersion || '') !== String(boot.sourceVersion || '') || String(catalog.generationId || '') !== String(boot.generationId || '')) {\n      throw new Error('Catalog generation mismatch');\n    }\n    els.catalogLoading.hidden = true;`;
const newReady = `    if (String(catalog.sourceVersion || '') !== String(boot.sourceVersion || '') || String(catalog.generationId || '') !== String(boot.generationId || '')) {\n      throw new Error('Catalog generation mismatch');\n    }\n    if (!catalog.rootKey || !catalog.folders?.[catalog.rootKey]) throw new Error('Catalog root folder is missing');\n    path = [catalog.rootKey];\n    els.catalogLoading.hidden = true;`;
if (text.includes(oldReady)) text = text.replace(oldReady, newReady);
else if (!text.includes("path = [catalog.rootKey];\n    els.catalogLoading.hidden = true;")) throw new Error('Could not find the expected B4 catalog-ready block.');

const oldMembership = `  const membershipLine = session\n    ? escapeHtml(session.membershipPlan || session.membershipStatus || session.access || "Member")\n    : "Separate Player";`;
const newMembership = `  const membershipCandidates = [session?.membershipPlan, session?.membershipStatus, session?.access]\n    .map(value => String(value || "").trim())\n    .filter(value => value && !/^(none|null|undefined)$/i.test(value));\n  const membershipLine = session\n    ? escapeHtml(membershipCandidates[0] || "Member")\n    : "Separate Player";`;
if (text.includes(oldMembership)) text = text.replace(oldMembership, newMembership);

fs.writeFileSync(templatePath, text, 'utf8');

const check = fs.readFileSync(templatePath, 'utf8');
if (check.includes(oldPath)) throw new Error('The early catalog.rootKey bug is still present after patching.');
if (!check.includes('let path = [];')) throw new Error('B4.1 path initialization is missing.');
if (!check.includes("path = [catalog.rootKey];\n    els.catalogLoading.hidden = true;")) throw new Error('B4.1 catalog-ready path assignment is missing.');

console.log('Fixed B4 catalog load ordering.');
console.log('The browser now waits for the static catalog JSON before reading catalog.rootKey.');
console.log('Also fixed the account menu fallback so access=membership is not displayed as None.');
console.log('Backup:', backupPath);
console.log('.dev.vars and .dev.vars.live-backup were not touched.');
