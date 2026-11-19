/** B9.2 Step D: one authorized, staging-only *signal* from Step A. */
import crypto from 'node:crypto';
import {bridgeScanToJournal,createRemoteStage} from '../src/bridge-core.mjs';
import {runLocalSync} from '../../staging/sync-one-story-local.mjs';
const show=(k,v)=>console.log(String(k).padEnd(33)+': '+v);
const known=new Set(['STAGE_URL_INVALID','STAGE_URL_NOT_ISOLATED','STAGE_TOKEN_MISSING',
  'BRIDGE_CONFIG_INVALID','REMOTE_STAGE_HEALTH_UNSAFE','REMOTE_STAGE_NOT_UPGRADED',
  'SCAN_RESULT_INVALID','SCAN_RESULT_NOT_AUTHORIZED','REMOTE_STAGE_SIGNAL_INCONCLUSIVE',
  'REMOTE_STAGE_READBACK_INCONCLUSIVE','REMOTE_STAGE_REQUEST_REJECTED',
  'REMOTE_STAGE_RESPONSE_INVALID','REMOTE_STAGE_TRANSPORT_ERROR']);
console.log('\nOX B9.2 — STEP D / LIVE READ-ONLY DRIVE SCAN TO SYNTHETIC SIGNAL JOURNAL\n');
show('Output mode','ONE-BIT SIGNAL ONLY / NO CATALOG UPLOAD');
show('Production Player / website','UNTOUCHED');
show('Staging catalog pointer','NEVER WRITTEN');
show('Snapshot proof','NOT ESTABLISHED');
try {
  const remote=createRemoteStage({endpoint:process.env.B92_STEP_C_URL,
    token:process.env.B92_STEP_C_TOKEN});
  const result=await bridgeScanToJournal({stage:remote,scan:runLocalSync,
    signalId:crypto.randomBytes(16).toString('hex')});
  show('Staging signal',result.signal==='unchanged'?'UNCHANGED':'CHANGE QUARANTINED');
  show('D1 signal journal','ONE RECORD VERIFIED');
  show('Real catalog data uploaded','NONE');
  show('Cloudflare catalog activation','DISABLED');
  show('CHECK STATUS','STEP D STAGING SIGNAL BRIDGE PASSED — NO PUBLICATION');
} catch(e) {
  show('CHECK STATUS','INCOMPLETE — NOTHING ACTIVATED');
  // Do not print network error messages/URLs, JSON bodies, IDs or secrets.
  show('Reason',known.has(e?.code)?e.code:'BRIDGE_OR_DRIVE_SCAN_FAILED');
  show('Staging journal','MAY BE PARTIAL IF NETWORK FAILED; DO NOT BLINDLY RETRY');
  process.exitCode=1;
}
