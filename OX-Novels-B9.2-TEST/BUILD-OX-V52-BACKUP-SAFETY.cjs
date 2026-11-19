const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const base = 'C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source = path.join(base, 'OX-ADMIN-V5-1-DODO-PAYPAL-LOCAL');
const target = path.join(base, 'OX-V5-2-DODO-BACKUP-SAFETY-LOCAL');

function read(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
function once(s, oldText, newText, label) {
  const found = s.split(oldText).length - 1;
  if (found !== 1) throw Error('STOP: ' + label + ' found ' + found + ' matches');
  return s.replace(oldText, newText);
}
function section(s, start, end, change, label) {
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw Error('STOP: Missing ' + label);
  const original = s.slice(a, b);
  const updated = change(original);
  if (updated === original) throw Error('STOP: No changes to ' + label);
  return s.slice(0, a) + updated + s.slice(b);
}

const workerFile = path.join(source, 'src/index.js');
const adminFile = path.join(source, 'public/assets/admin.js');

if (!fs.existsSync(workerFile) || !fs.existsSync(adminFile))
  throw Error('STOP: V5.1 production source not found.');
if (fs.existsSync(target))
  throw Error('STOP: V5.2 target folder already exists.');

let worker = read(workerFile);
let admin = read(adminFile);

// The backup format is newer, but this is NOT a D1 schema migration.
worker = once(worker,
  'var D1_BACKUP_VERSION = 1;',
  'var D1_BACKUP_VERSION = 2;',
  'backup format version');

// Columns verified against the user's production SQLite schema.
const extraTables = [
  {
    name: 'payment_checkout_sessions',
    columns: ['token','user_id','tier_id','provider','external_plan_id',
      'created_at','expires_at','used_at','environment']
  },
  {
    name: 'support_checkout_sessions',
    columns: ['token','provider_order_id','user_id','amount','currency',
      'environment','status','created_at','expires_at','completed_at']
  },
  {
    name: 'lifetime_story_checkout_sessions',
    columns: ['token','paypal_order_id','paypal_approve_url','user_id',
      'permanent_story_id','story_id_snapshot','title_snapshot',
      'drive_url_snapshot','drive_folder_id_snapshot','cover_snapshot',
      'amount','currency','environment','status','paypal_capture_id',
      'created_at','expires_at','completed_at']
  },
  {
    name: 'dodo_lifetime_checkout_sessions',
    columns: ['token','checkout_session_id','checkout_url','payment_id',
      'user_id','permanent_story_id','story_id_snapshot','title_snapshot',
      'drive_url_snapshot','drive_folder_id_snapshot','cover_snapshot',
      'product_id','amount','currency','environment','status',
      'created_at','expires_at','completed_at']
  },
  {
    name: 'dodo_live_membership_control',
    columns: ['user_id','created_at']
  },
  {
    name: 'dodo_live_webhook_receipts',
    columns: ['event_id','status','updated_ms']
  }
];

const tableLines = extraTables.map(t =>
  '  ' + JSON.stringify(t)
).join(',\n');

worker = once(worker,
  '  { name: "activity_log", columns: ["id", "type", "title", "detail", "created_at"] }\n];',
  '  { name: "activity_log", columns: ["id", "type", "title", "detail", "created_at"] },\n' +
  tableLines + '\n];',
  'six backup tables');

// Critical: never report a complete backup if a table read failed.
worker = section(worker,
  'async function readBackupTable(',
  '__name(readBackupTable, "readBackupTable");',
  s => once(s,
    '    console.warn(`Backup skipped table ${spec.name}`, error);\n    return [];',
    '    throw new Error("Backup export failed for " + spec.name + ": " + String(error?.message || error).slice(0,160));',
    'silent missing-table fallback'),
  'backup reader');

// Annotate the backup clearly as export-only.
worker = section(worker,
  'async function createD1Backup(',
  '__name(createD1Backup, "createD1Backup");',
  s => once(s,
    '    secretsIncluded: false,',
    '    secretsIncluded: false,\n    backupCoverage: "v5.2-dodo-complete",\n    restoreSupported: false,',
    'backup metadata'),
  'backup creator');

// Lock automatic restores until there is a separately
// verified, transaction-safe recovery process.
worker = section(worker,
  'async function handleAdminBackup(',
  '__name(handleAdminBackup, "handleAdminBackup");',
  s => {
    const begin = s.indexOf('  if (request.method === "POST") {');
    const end = s.indexOf('  return json({ error: "Method not allowed." }, 405);', begin);
    if (begin < 0 || end < 0) throw Error('STOP: Restore handler changed.');

    return s.slice(0, begin) +
      `  if (request.method === "POST") {
    return json({
      error: "Automatic restore is locked for payment-data safety. Keep the backup private and use a separately verified recovery procedure.",
      code: "SAFE_RESTORE_LOCKED"
    }, 409);
  }
` + s.slice(end);
  },
  'restore safety guard');

// Make the Admin UI accurately describe the safety restriction.
admin = once(admin,
  'Restore a full D1 backup. Current website data is replaced and all Admin/member sessions are logged out.',
  'Automatic restore is temporarily locked while Dodo payment history, webhook receipts and customer entitlements are protected.',
  'Admin restore warning');

admin = once(admin,
  '<label class="secondary file-btn">Choose backup<input id="restoreFile" type="file" accept="application/json,.json"></label>',
  '<label class="secondary file-btn" aria-disabled="true">Restore locked<input id="restoreFile" type="file" accept="application/json,.json" disabled></label>',
  'Admin restore input');

admin = once(admin,
  'Admin password, PayPal Client Secret, Google Apps Script secret and login sessions are never exported.',
  'Passwords and server secrets are not exported. Backup files contain private customer records and checkout identifiers: store them securely.',
  'backup privacy warning');

// Verify all six new tables before offering the downloaded JSON.
const validateText = `
      const required = ${JSON.stringify(extraTables.map(x => x.name))};
      if (Number(backup.version) !== 2 ||
          backup.backupCoverage !== "v5.2-dodo-complete" ||
          !backup.tables ||
          required.some(name =>
            !Array.isArray(backup.tables[name]) ||
            Number(backup.counts?.[name]) !== backup.tables[name].length
          )) {
        throw new Error("Backup verification failed: Dodo tables are missing or incomplete.");
      }
`;

admin = section(admin,
  'function bindBackup()',
  'async function applyRestoreData()',
  s => once(s,
    '      const stamp=new Date().toISOString().replace(/[:.]/g,"-");',
    validateText + '      const stamp=new Date().toISOString().replace(/[:.]/g,"-");',
    'client backup verification'),
  'Admin backup download');

// Validate code before creating the new release folder.
function syntaxCheck(label, code) {
  const temp = path.join(base, '.ox-v52-check-' + label + '.js');
  try {
    fs.writeFileSync(temp, code);
    cp.execFileSync(process.execPath, ['--check', temp], {
      stdio: 'pipe'
    });
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
syntaxCheck('worker', worker);
syntaxCheck('admin', admin);

const config = read(path.join(source, 'wrangler.jsonc'));
if (!config.includes('"pattern": "oxnovels.top"') ||
    !config.includes('"custom_domain": true')) {
  throw Error('STOP: Production domain configuration mismatch.');
}

fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(path.join(target, 'src/index.js'), worker);
fs.writeFileSync(path.join(target, 'public/assets/admin.js'), admin);

console.log('PASS: V5.2 local candidate created.');
console.log('PASS: Worker and Admin JavaScript syntax.');
console.log('PASS: All six verified checkout/Dodo tables added.');
console.log('PASS: Incomplete backup exports now fail closed.');
console.log('PASS: Automatic database restore locked.');
console.log('PASS: Existing V5.1 folder remains unchanged.');
console.log('NO PRODUCTION DEPLOYMENT OR D1 CHANGES.');
console.log('Folder: ' + target);
