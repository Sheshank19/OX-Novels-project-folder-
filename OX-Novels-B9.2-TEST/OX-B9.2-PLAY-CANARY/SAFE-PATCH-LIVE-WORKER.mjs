// Fail-closed, local-only canary patcher. Accept an *explicit fresh live Worker export*.
// Never modifies the input file or deploys any Worker.
// Uses the original canary patch fragments adjacent to this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url));
function fail(message) { console.error(`STOP: ${message}`); process.exit(1); }
function once(source, needle, label) {
  const at = source.indexOf(needle);
  if (at < 0 || source.indexOf(needle, at + needle.length) !== -1) fail(`Expected exactly one ${label}; production source may have changed.`);
  return at;
}
const arg = process.argv[2];
if (!arg) fail('Usage: node SAFE-PATCH-LIVE-WORKER.mjs "FULL-PATH-TO-FRESH-LIVE-WORKER.mjs"');
const input = path.resolve(arg);
if (!fs.existsSync(input) || !fs.statSync(input).isFile()) fail('Current live Worker source file not found.');
if (fs.realpathSync(input).startsWith(fs.realpathSync(here) + path.sep)) fail('Choose an explicitly exported LIVE Worker file, not this patch directory.');
const source = fs.readFileSync(input, 'utf8');
if (source.length < 100000) fail('Worker looks incomplete. Refusing to patch.');
if (!source.includes('/api/internal/player-library') || !/dodo/i.test(source)) fail('Worker does not contain required live roster route and Dodo code. Refusing possible stale production source.');
if (/B92_PLAYER_CANARY_ID|b92CanaryPlayerLanding|\/player-launch/.test(source)) fail('Canary is already present or partially installed. Stop and inspect the source.');
const topLevelAnchor = source.includes('var index_default = {') ? 'var index_default = {' :
  source.includes('export default {') ? 'export default {' : null;
if (!topLevelAnchor) fail('Unrecognized main Worker module structure. No changes.');
once(source, topLevelAnchor, 'main Worker module entry');
const routeAnchor = 'const openMatch = pathname.match(/^\\/api\\/story\\/([^/]+)\\/open$/);';
once(source, routeAnchor, 'existing story-open route');
const oldReturn = 'return json({ url: story.drive_url });';
once(source, oldReturn, 'existing Drive redirect response');
const openStart = source.indexOf(routeAnchor);
const returnPosition = source.indexOf(oldReturn);
if (returnPosition < openStart || returnPosition > openStart + 4000) fail('Drive response is outside the protected /open handler.');
const openBody = source.slice(openStart, returnPosition);
for (const check of ['getCurrentUser(request, env)', 'userAccessContext(env, user)', 'lifetime_story_products', 'ACCESS_REQUIRED', 'story.drive_url']) {
  if (!openBody.includes(check)) fail(`Missing known authorization guard: ${check}. Refusing patch.`);
}
const helper = fs.readFileSync(path.join(here, 'WORKER-HELPER.js'), 'utf8');
const route = fs.readFileSync(path.join(here, 'WORKER-ROUTE.txt'), 'utf8');
const replacementText = fs.readFileSync(path.join(here, 'WORKER-OPEN-REPLACEMENT.txt'), 'utf8');
const routeLines = route.split(/\r?\n/);
const activeRoute = routeLines.slice(routeLines.findIndex(x => x.includes('const b92PlayerCanaryMatch'))).join('\n').trim();
if (!activeRoute.startsWith('const b92PlayerCanaryMatch') || !activeRoute.includes('return b92CanaryPlayerLanding')) fail('Unexpected route fragment.');
const replaceLines = replacementText.split(/\r?\n/);
const activeReplacement = replaceLines.slice(replaceLines.findIndex(x => x.startsWith('return json('))).join('\n').trim();
if (!activeReplacement.startsWith('return json({ url:') || !activeReplacement.endsWith('});')) fail('Unexpected open response fragment.');
let patched = source.replace(topLevelAnchor, `${helper.trimEnd()}\n\n${topLevelAnchor}`);
patched = patched.replace(routeAnchor, `${activeRoute}\n\n    ${routeAnchor}`);
patched = patched.replace(oldReturn, activeReplacement);
if (patched === source) fail('No modifications made.');
// Important: output is a new local file; NEVER mutate the fresh production export.
const outDir = path.resolve(path.dirname(input), 'OX-B92-CANARY-OUTPUT');
fs.mkdirSync(outDir, { recursive: true });
const fileBase = path.basename(input).replace(/\.(?:js|mjs)$/i, '');
const output = path.join(outDir, `${fileBase}.B92-CANARY.mjs`);
if (fs.existsSync(output)) fail('Candidate output already exists. Move it aside before rerunning. No overwrite.');
fs.writeFileSync(output, patched, { flag: 'wx', mode: 0o600 });
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
console.log('Local candidate generated; nothing deployed or overwritten.');
console.log('Original SHA-256 prefix:', sha(source));
console.log('Candidate SHA-256 prefix:', sha(patched));
console.log('Candidate output:', output);
console.log('Inspect diff and run: node --check "' + output + '"');
console.log('STOP if this is not the latest backed-up LIVE Worker source with active Dodo and roster code.');
