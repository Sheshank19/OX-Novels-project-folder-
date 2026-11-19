// Read-only provenance check for EXISTING original handoff secret.
// Does not create, change, print, hash, upload, or log the key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const keyFile = path.join(here, '.env.player-handoff');
const catalogFile = path.resolve(here, '..', 'local-player-b5', 'public', 'catalogs', 'a-dragon-s-revenge.json');
const verifyOnly = process.argv.includes('--verify-only');
function fail(message) { console.error(`STOP: ${message}`); process.exit(1); }
function decode64url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Unexpected token encoding');
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
try {
  if (!fs.existsSync(keyFile) || !fs.lstatSync(keyFile).isFile()) fail('Original local key file missing or not a regular file. Do not generate a new key.');
  if (!fs.existsSync(catalogFile) || !fs.lstatSync(catalogFile).isFile()) fail('Original protected static story catalog missing. Cannot prove key provenance.');
  const keyText = fs.readFileSync(keyFile, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(keyText)) fail('Unexpected original key format. No clipboard change.');
  const key = decode64url(keyText);
  if (key.length !== 32) fail('Original key is not AES-256. No clipboard change.');
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  if (catalog.storyId !== 'a-dragon-s-revenge') fail('Protected catalog story ID mismatch.');
  const tracks = Object.values(catalog.folders || {}).flatMap(f => f.tracks || [])
    .filter(t => typeof t.key === 'string' && t.key.startsWith('t1.'));
  if (tracks.length < 2) fail('Protected catalog lacks adequate encrypted token evidence.');
  for (const t of [tracks[0], tracks[tracks.length - 1]]) {
    const parts = t.key.split('.');
    if (parts.length !== 3 || parts[0] !== 't1') fail('Unexpected protected track token format.');
    const iv = decode64url(parts[1]);
    const blob = decode64url(parts[2]);
    if (iv.length !== 12 || blob.length < 17) fail('Malformed protected track token.');
    const dec = createDecipheriv('aes-256-gcm', key, iv);
    dec.setAAD(Buffer.from('OX_PLAYER_TRACK_V1', 'utf8'));
    dec.setAuthTag(blob.subarray(blob.length - 16));
    const decrypted = Buffer.concat([dec.update(blob.subarray(0, -16)), dec.final()]);
    const item = JSON.parse(decrypted.toString('utf8'));
    decrypted.fill(0);
    if (item.kind !== 'track' || item.storyId !== catalog.storyId || !item.fileId) {
      fail('Original key did not validate the protected track identity.');
    }
  }
  console.log('PASS: existing local key decrypts two protected static catalog tracks. No secrets displayed.');
  if (verifyOnly) process.exit(0);
  if (process.platform !== 'win32') fail('Clipboard copy is Windows-only.');
  const cmd = "$ErrorActionPreference = 'Stop'; $v = [Console]::In.ReadToEnd(); " +
    "if ($v -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Invalid key input' }; " +
    'Set-Clipboard -Value $v';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
    input: keyText, encoding: 'utf8', windowsHide: true, timeout: 12000,
    maxBuffer: 16 * 1024,
  });
  if (result.error || result.status !== 0) fail('PowerShell clipboard copy failed. No success claimed.');
  console.log('PASS: original local handoff key copied to Windows clipboard privately. Never paste it into chat.');
  console.log('Evidence scope: local protected catalogs only. A live Cloudflare secret match still needs the authorized Play test.');
} catch {
  fail('Local key provenance check failed; no secret was printed or copied. Keep live Player key unchanged.');
}
