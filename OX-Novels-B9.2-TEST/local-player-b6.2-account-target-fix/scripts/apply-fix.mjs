import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixRoot = path.resolve(here, '..');
const oxRoot = path.resolve(fixRoot, '..');
const b4Root = path.join(oxRoot, 'local-player-b4');
const b5Root = path.join(oxRoot, 'local-player-b5');
const b6Root = path.join(oxRoot, 'local-player-b6');
const b5Import = path.join(b5Root, 'scripts', 'import-b4-account.mjs');
const b5Wrangler = path.join(b5Root, 'wrangler.jsonc');
const b6Deploy = path.join(b6Root, 'BUILD-AND-DEPLOY-CURRENT-PLAYER.bat');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}
function validAccountId(value) { return /^[a-f0-9]{20,64}$/i.test(String(value || '').trim()); }
function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function accountFromWrangler(file) {
  const m = readText(file).match(/"account_id"\s*:\s*"([^"]+)"/);
  return m && validAccountId(m[1]) ? m[1].trim() : '';
}
function accountFromFile(file) {
  const value = readText(file).trim();
  return validAccountId(value) ? value : '';
}
function backup(file) {
  if (!fs.existsSync(file)) return;
  const dst = `${file}.pre-b6.2-backup`;
  if (!fs.existsSync(dst)) fs.copyFileSync(file, dst);
}
function ensureAccountIdInWrangler(file, accountId) {
  let text = readText(file);
  if (!text) fail(`Missing ${file}`);
  if (/"account_id"\s*:/.test(text)) {
    text = text.replace(/"account_id"\s*:\s*"[^"]*"/, `"account_id": "${accountId}"`);
  } else if (/"name"\s*:\s*"listen"\s*,/.test(text)) {
    text = text.replace(/"name"\s*:\s*"listen"\s*,/, `"name": "listen",\n  "account_id": "${accountId}",`);
  } else {
    fail('Could not safely insert account_id into local-player-b5/wrangler.jsonc.');
  }
  fs.writeFileSync(file, text, 'utf8');
}

if (!fs.existsSync(b5Import) || !fs.existsSync(b5Wrangler)) fail('local-player-b5 was not found beside this fix folder.');
if (!fs.existsSync(b6Deploy)) fail('local-player-b6 was not found beside this fix folder.');

const candidates = [
  ['local-player-b4/.player-account-id', accountFromFile(path.join(b4Root, '.player-account-id'))],
  ['local-player-b5/.player-account-id', accountFromFile(path.join(b5Root, '.player-account-id'))],
  ['local-player-b6/.player-account-id', accountFromFile(path.join(b6Root, '.player-account-id'))],
  ['local-player-b5/wrangler.jsonc', accountFromWrangler(b5Wrangler)],
  ['local-player-b4/wrangler.jsonc', accountFromWrangler(path.join(b4Root, 'wrangler.jsonc'))]
];
const found = candidates.find(([, value]) => value);
if (!found) fail('No valid OX Audio Player account ID was found. Run local-player-b4\\SET-PLAYER-ACCOUNT-ID.bat once, then run this fix again.');
const [sourceLabel, accountId] = found;

backup(b5Import);
backup(b5Wrangler);
backup(b6Deploy);

const fixedImport = `import fs from 'node:fs';\nimport path from 'node:path';\nimport { b5Root, oxRoot } from './common.mjs';\n\nconst wranglerPath = path.join(b5Root, 'wrangler.jsonc');\nconst b4Root = path.join(oxRoot, 'local-player-b4');\nconst b6Root = path.join(oxRoot, 'local-player-b6');\n\nfunction valid(value){ return /^[a-f0-9]{20,64}$/i.test(String(value||'').trim()); }\nfunction read(file){ try { return fs.readFileSync(file,'utf8'); } catch { return ''; } }\nfunction fromFile(file){ const v=read(file).trim(); return valid(v)?v:''; }\nfunction fromWrangler(file){ const m=read(file).match(/"account_id"\\s*:\\s*"([^\"]+)"/); return m&&valid(m[1])?m[1].trim():''; }\n\nconst candidates = [\n  ['local-player-b5/wrangler.jsonc', fromWrangler(wranglerPath)],\n  ['local-player-b4/.player-account-id', fromFile(path.join(b4Root,'.player-account-id'))],\n  ['local-player-b5/.player-account-id', fromFile(path.join(b5Root,'.player-account-id'))],\n  ['local-player-b6/.player-account-id', fromFile(path.join(b6Root,'.player-account-id'))],\n  ['local-player-b4/wrangler.jsonc', fromWrangler(path.join(b4Root,'wrangler.jsonc'))]\n];\nconst found = candidates.find(([,value])=>value);\nif(!found){ console.error('ERROR: No OX Audio Player account ID was found. Run local-player-b4\\\\SET-PLAYER-ACCOUNT-ID.bat first.'); process.exit(1); }\nconst [source, accountId] = found;\nlet out=read(wranglerPath);\nif(!out){ console.error('ERROR: local-player-b5/wrangler.jsonc is missing.'); process.exit(1); }\nif(/"account_id"\\s*:/.test(out)) out=out.replace(/"account_id"\\s*:\\s*"[^\"]*"/, \`"account_id": "\${accountId}"\`);\nelse if(/"name"\\s*:\\s*"listen"\\s*,/.test(out)) out=out.replace(/"name"\\s*:\\s*"listen"\\s*,/, \`"name": "listen",\\n  "account_id": "\${accountId}",\`);\nelse { console.error('ERROR: Could not safely update local-player-b5/wrangler.jsonc.'); process.exit(1); }\nfs.writeFileSync(wranglerPath,out,'utf8');\nfs.writeFileSync(path.join(b5Root,'.player-account-id'),accountId,'utf8');\nconsole.log(\`Player account target ready from \${source}.\`);\n`;
fs.writeFileSync(b5Import, fixedImport, 'utf8');
ensureAccountIdInWrangler(b5Wrangler, accountId);
fs.writeFileSync(path.join(b5Root, '.player-account-id'), accountId, 'utf8');

const fixedB6Deploy = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n\r\nif not exist "..\\local-player-b5\\scripts\\build-b5.mjs" (\r\n  echo local-player-b5 was not found beside local-player-b6.\r\n  pause\r\n  exit /b 1\r\n)\r\n\r\npushd "..\\local-player-b5"\r\nnode scripts\\import-b4-account.mjs\r\nif errorlevel 1 goto :fail_pop\r\nnode scripts\\build-b5.mjs\r\nif errorlevel 1 goto :fail_pop\r\n\r\nset "CLOUDFLARE_ACCOUNT_ID="\r\nif exist ".player-account-id" set /p CLOUDFLARE_ACCOUNT_ID=<.player-account-id\r\nif not defined CLOUDFLARE_ACCOUNT_ID if exist "..\\local-player-b4\\.player-account-id" set /p CLOUDFLARE_ACCOUNT_ID=<"..\\local-player-b4\\.player-account-id"\r\nif not defined CLOUDFLARE_ACCOUNT_ID (\r\n  echo.\r\n  echo ERROR: OX Audio Player Account ID was not found.\r\n  echo Run local-player-b4\\SET-PLAYER-ACCOUNT-ID.bat and try again.\r\n  goto :fail_pop\r\n)\r\n\r\necho.\r\necho Deploying Worker: listen\r\necho Target account is loaded from the saved OX Audio Player Account ID.\r\necho Existing OX_HANDOFF_KEY remains attached to the existing Worker.\r\necho.\r\nif exist "..\\node_modules\\.bin\\wrangler.cmd" (\r\n  call "..\\node_modules\\.bin\\wrangler.cmd" deploy\r\n) else (\r\n  call npx.cmd wrangler deploy\r\n)\r\nif errorlevel 1 goto :fail_pop\r\n\r\npopd\r\necho.\r\necho B6 reconciliation build/deploy completed.\r\npause\r\nexit /b 0\r\n\r\n:fail_pop\r\npopd\r\necho.\r\necho Build/deploy failed. Existing deployed Player version remains unchanged unless Wrangler reported a successful deployment.\r\npause\r\nexit /b 1\r\n`;
fs.writeFileSync(b6Deploy, fixedB6Deploy, 'utf8');

console.log(`Found Player Account ID in: ${sourceLabel}`);
console.log('Updated local-player-b5/wrangler.jsonc with the saved account target.');
console.log('Updated B5 account importer to read .player-account-id correctly.');
console.log('Updated B6 build/deploy so it builds once and deploys with CLOUDFLARE_ACCOUNT_ID explicitly set.');
console.log('Backups use the suffix .pre-b6.2-backup.');
