/**
 * OX B9.2 Step G -- SYNTHETIC-ONLY remote vault smoke.
 * Safe: no real catalogs, secrets, Drive IDs, file reads, D1 or production calls.
 * Hard-pinned to the separate Stage G Worker; emits no secret values.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createManifest, splitPrivateCatalog, assembleAndVerify } from '../src/vault-core.mjs';

export const STAGE = 'https://ox-b92-step-g-protected-vault-stage.ox-audio-player.workers.dev';
const sha = x => createHash('sha256').update(x).digest('hex');
const VALID_ID = /^[a-f0-9]{64}$/;
const accept = (x, msg) => { if (!x) throw Error(msg); };
const safeJson = x => JSON.stringify(x);

// No user-controlled file paths or catalog data. The faux record has no real story metadata.
export function syntheticFixture() {
  const record = {
    kind: 'ox-b92-step-g-synthetic-smoke-v1',
    fixturesOnly: true,
    folderLabels: ['TEST_FOLDER_ONLY'],
    audioLabels: ['FAKE_EPISODE_A', 'FAKE_EPISODE_B'],
    filler: 'SYNTHETIC_0123456789_'.repeat(1400)
  };
  const candidateBytes = new TextEncoder().encode(JSON.stringify(record));
  return {
    candidateBytes,
    receiptBytes: new TextEncoder().encode('FAKE_RECEIPT_NO_DRIVE_DATA'),
    previousBytes: new TextEncoder().encode('FAKE_OLD_CATALOG_NO_PLAYER_DATA')
  };
}

export async function runSmoke({ token, http = fetch, out = console.log } = {}) {
  accept(typeof token === 'string' && token.length >= 32, 'LOCAL_STAGE_TOKEN_MISSING');
  const root = new URL(STAGE);
  accept(root.protocol === 'https:' && root.hostname === 'ox-b92-step-g-protected-vault-stage.ox-audio-player.workers.dev' && !root.search && !root.hash, 'STAGE_HOST_NOT_ALLOWED');
  const calls = { count: 0 };
  async function post(path, data, expectedStatus=200) {
    accept(/^\/v1\/quarantine\/(?:manifest|put-chunk|get-manifest|get-chunk)$/.test(path), 'REMOTE_PATH_NOT_ALLOWED');
    calls.count++;
    const res = await http(new URL(path,root), {
      method: 'POST',
      headers: { authorization:`Bearer ${token}`, 'content-type':'application/json' },
      redirect: 'manual',
      body: safeJson(data),
      signal: AbortSignal.timeout(18000),
      cache: 'no-store'
    });
    accept(res.status >= 200 && res.status < 600 && ![301,302,303,307,308].includes(res.status), 'UNSAFE_REDIRECT');
    accept(res.status === expectedStatus, 'UNEXPECTED_REMOTE_STATUS_'+path.split('/').at(-1)+'_'+res.status);
    const reply = await res.json();
    accept(reply && typeof reply === 'object', 'BAD_REMOTE_REPLY');
    return reply;
  }
  // Abort on wrong mode before making any storage writes.
  calls.count++;
  const healthResp = await http(new URL('/health',root), {method:'GET', redirect:'manual', signal: AbortSignal.timeout(18000),cache:'no-store'});
  accept(healthResp.status === 200,'STAGE_HEALTH_UNAVAILABLE');
  const health = await healthResp.json();
  accept(health.ok===true && health.stageOnly===true && health.activationDisabled===true &&
    health.publicationDisabled===true && health.playback===false && health.driveAccess===false &&
    health.automaticSync===false,'NOT_STEP_G_QUARANTINE_STAGE');
  out('Stage health / publication disabled : PASS');

  const fx = syntheticFixture();
  const built = await createManifest({ ...fx,folderCount:1,trackCount:2 });
  const {manifest,parts} = built;
  accept(parts.length === 2 && fx.candidateBytes.length > 24576 && manifest.publicationAllowed === false &&
    manifest.pinnedSnapshotProven === false && manifest.activationDisabled === true,
    'SYNTHETIC_FIXTURE_INVALID');
  const response = await post('/v1/quarantine/manifest',{manifest});
  accept(response.ok===true && response.quarantinedOnly===true && response.activationDisabled===true && VALID_ID.test(response.manifestId),'MANIFEST_NOT_CONFIRMED');
  const manifestId = response.manifestId;
  out('Synthetic manifest stored            : PASS');

  for (let i=0; i<parts.length; i++) {
    const content=Buffer.from(parts[i]).toString('base64url');
    const sent=await post('/v1/quarantine/put-chunk',{manifestId,index:i,content});
    accept(sent.ok===true && sent.quarantinedOnly===true && sent.activationDisabled===true && sent.part===i,'CHUNK_NOT_CONFIRMED');
  }
  out('Synthetic chunks uploaded            : 2 / 2');

  let returnedManifest;
  const received=[];
  // Eventual consistency can delay visibility after writes; retry read-only only.
  for(let tryNo=0;tryNo<4;tryNo++) {
    try {
      const got=await post('/v1/quarantine/get-manifest',{manifestId});
      accept(got.ok === true && got.quarantinedOnly===true && got.activationDisabled===true, 'REMOTE_MANIFEST_NOT_VERIFIED');
      returnedManifest=got.manifest;
      accept(sha(JSON.stringify(returnedManifest))===manifestId && safeJson(returnedManifest)===safeJson(manifest),'MANIFEST_HASH_MISMATCH');
      break;
    } catch (e) { if (tryNo===3) throw e; await new Promise(r=>setTimeout(r,2000)); }
  }
  for(let i=0;i<parts.length;i++) {
    let data;
    for(let tryNo=0;tryNo<4;tryNo++) {
      try {
        const got=await post('/v1/quarantine/get-chunk',{manifestId,index:i});
        accept(got.ok === true && got.quarantinedOnly===true && got.activationDisabled===true && got.part===i && typeof got.content==='string','REMOTE_CHUNK_NOT_VERIFIED');
        data=Buffer.from(got.content,'base64url');
        accept(data.toString('base64url')===got.content,'NONCANONICAL_RETURNED_CHUNK');
        break;
      } catch (e) { if (tryNo===3) throw e; await new Promise(r=>setTimeout(r,2000)); }
    }
    received.push(new Uint8Array(data));
  }
  const restored=await assembleAndVerify(returnedManifest,received);
  accept(sha(restored)===sha(fx.candidateBytes) && Buffer.from(restored).equals(Buffer.from(fx.candidateBytes)),'REMOTE_CATALOG_DIGEST_MISMATCH');
  out('Remote reconstruction / SHA-256     : PASS');

  // Explicitly ensure a modified chunk is rejected; this must not overwrite good content.
  const wrongBytes=new Uint8Array(parts[0]);wrongBytes[0]^=1;
  const wrong=await post('/v1/quarantine/put-chunk',{manifestId,index:0,content:Buffer.from(wrongBytes).toString('base64url')},400);
  accept(wrong.ok===false && wrong.error==='CHUNK_INTEGRITY_FAILED','TAMPER_WAS_NOT_REJECTED');
  out('Tampered chunk rejected             : PASS');
  out('Cloudflare Worker requests          : '+calls.count);
  out('Real story catalog uploaded         : NONE');
  out('Activation / publication            : DISABLED');
  out('CHECK STATUS                        : STEP G SYNTHETIC REMOTE QUARANTINE PASSED');
  return {requests:calls.count,sha256:manifest.catalogSha256};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try { await runSmoke({token:process.env.B92_STEP_G_TOKEN}); }
  catch(e) { console.error('CHECK STATUS                        : INCOMPLETE — '+String(e.message).replace(/[^A-Z0-9_\/-]/gi,'_').slice(0,96)); process.exitCode=1; }
}
