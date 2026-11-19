import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const oxRoot = path.resolve(here, '..');
const b6Root = path.join(oxRoot, 'local-player-b6');
const b6Scripts = path.join(b6Root, 'scripts');

if (!fs.existsSync(b6Root)) {
  throw new Error('local-player-b6 was not found beside local-player-b7-prepare-all.');
}

const commonPath = path.join(b6Scripts, 'common.mjs');
const syncScript = path.join(b6Scripts, 'sync-story.mjs');
if (!fs.existsSync(commonPath) || !fs.existsSync(syncScript)) {
  throw new Error('B6 scripts are missing. Keep your working local-player-b6 installation.');
}

const {
  currentStories,
  loadPublishedManifest,
  reportsDir,
  catalogPathFor,
  verifyCatalog
} = await import(pathToFileURL(commonPath).href);

function publishedCurrent(pub, story) {
  const item = pub.get(story.id);
  return Boolean(item && String(item.sourceVersion) === String(story.sourceVersion));
}

function preparedCurrent(story) {
  try {
    const p = catalogPathFor(story);
    if (!fs.existsSync(p)) return false;
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Boolean(verifyCatalog(story, c));
  } catch {
    return false;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const state = currentStories();
const pub = new Map((loadPublishedManifest().catalogs || []).map(x => [String(x.storyId), x]));
const eligible = state.stories.filter(s => s.visible && s.hasDriveSource);
const alreadyPublished = eligible.filter(s => publishedCurrent(pub, s));
const alreadyPrepared = eligible.filter(s => !publishedCurrent(pub, s) && preparedCurrent(s));
const targets = eligible.filter(s => !publishedCurrent(pub, s) && !preparedCurrent(s));

console.log('OX Player B7 — Prepare ALL Remaining Catalogs');
console.log(`Story source: ${state.source}`);
console.log(`Eligible visible stories: ${eligible.length}`);
console.log(`Already published/current: ${alreadyPublished.length}`);
console.log(`Already prepared but not yet published: ${alreadyPrepared.length}`);
console.log(`Remaining to scan now: ${targets.length}`);

if (!targets.length) {
  console.log('\nNothing remains to scan. Run local-player-b6\\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat to publish any prepared catalogs.');
  process.exit(0);
}

console.log('\nAll remaining stories will be processed sequentially.');
console.log('A failed story is logged and does not stop the rest.');
console.log('If this window is interrupted, run this file again; already prepared current catalogs are skipped.');
console.log('Do not run another catalog scan at the same time.\n');

const progressPath = path.join(reportsDir, 'prepare-all-progress.json');
const finalPath = path.join(reportsDir, 'prepare-all-final.json');
const startedAt = new Date().toISOString();
const results = [];

const saveProgress = (finished = false) => {
  const ok = results.filter(x => x.ok).length;
  const failed = results.filter(x => !x.ok).length;
  writeJsonAtomic(finished ? finalPath : progressPath, {
    startedAt,
    updatedAt: new Date().toISOString(),
    finished,
    source: state.source,
    eligibleStories: eligible.length,
    alreadyPublishedCurrent: alreadyPublished.length,
    alreadyPreparedCurrent: alreadyPrepared.length,
    plannedThisRun: targets.length,
    completedThisRun: results.length,
    succeededThisRun: ok,
    failedThisRun: failed,
    remainingThisRun: Math.max(0, targets.length - results.length),
    results
  });
};

saveProgress(false);

for (let i = 0; i < targets.length; i++) {
  const s = targets[i];
  console.log(`\n============================================================`);
  console.log(`[${i + 1}/${targets.length}] ${s.id} — ${s.title}`);
  console.log(`============================================================`);

  const r = spawnSync(process.execPath, [syncScript, s.id], { stdio: 'inherit' });
  const ok = r.status === 0;
  results.push({
    storyId: s.id,
    title: s.title,
    ok,
    exitCode: r.status,
    completedAt: new Date().toISOString()
  });
  saveProgress(false);

  console.log(`\nProgress: ${results.length}/${targets.length} processed · ${results.filter(x => x.ok).length} succeeded · ${results.filter(x => !x.ok).length} failed`);
}

saveProgress(true);
const succeeded = results.filter(x => x.ok).length;
const failed = results.filter(x => !x.ok).length;
console.log('\n============================================================');
console.log('ALL-REMAINING PREPARATION FINISHED');
console.log('============================================================');
console.log(`Succeeded: ${succeeded}`);
console.log(`Failed:    ${failed}`);
console.log(`Final report: ${finalPath}`);
if (failed) {
  console.log('\nSome stories failed. The successful catalogs are safe. Review the failed entries in the report before final publication if you want 100% coverage.');
} else {
  console.log('\nAll remaining catalogs prepared successfully.');
}
console.log('\nNEXT: run local-player-b6\\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat once.');
