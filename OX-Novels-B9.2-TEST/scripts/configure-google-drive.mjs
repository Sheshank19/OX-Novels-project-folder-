import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readDevVars, writeDevVars } from './dev-vars.mjs';

const rl = readline.createInterface({ input, output });

async function testScanner(url, secret) {
  const test = new URL(url);
  test.searchParams.set('mode', 'health');
  test.searchParams.set('key', secret);
  const response = await fetch(test, {
    redirect: 'follow',
    headers: { accept: 'application/json,text/plain,*/*' }
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(
      `Web app did not return JSON. ${preview || 'No readable response.'}\n` +
      'Check Deploy > Manage deployments > Web app: Execute as Me, Who has access Anyone, then deploy a NEW VERSION.'
    );
  }

  if (payload?.error === 'Unauthorized') {
    throw new Error(
      'PRIVATE KEY MISMATCH. The deployed Apps Script contains a different OX secret than this project.\n' +
      'Run this setup once, then copy the ENTIRE newly generated OX-Drive-Scanner-READY.gs into Apps Script, Save, deploy a NEW VERSION, and paste/keep the /exec URL without running setup again in between.'
    );
  }

  if (!response.ok || !payload?.ok || !payload?.ready) {
    throw new Error(payload?.error || `Scanner health check failed (${response.status}).`);
  }
  return payload;
}

try {
  console.log('\nOX Novels - FREE Google Drive Import setup (Apps Script)\n');
  const vars = readDevVars();

  // IMPORTANT: keep one stable secret. Re-running setup must NOT invalidate
  // the Apps Script deployment. Generate only when the project has no key.
  let secret = String(vars.get('GOOGLE_APPS_SCRIPT_SECRET') || '').trim();
  const generated = !secret;
  if (!secret) {
    secret = crypto.randomBytes(24).toString('hex');
    vars.set('GOOGLE_APPS_SCRIPT_SECRET', secret);
    writeDevVars(vars);
  }

  const templatePath = path.resolve('apps-script', 'OX-Drive-Scanner.gs');
  const readyPath = path.resolve('apps-script', 'OX-Drive-Scanner-READY.gs');
  const template = fs.readFileSync(templatePath, 'utf8');
  fs.writeFileSync(readyPath, template.replace('__OX_SHARED_SECRET__', secret), 'utf8');

  vars.delete('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  vars.delete('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64');
  writeDevVars(vars);

  console.log(generated
    ? 'READY Apps Script generated with this copy\'s new private secret:'
    : 'READY Apps Script regenerated using this copy\'s EXISTING stable private secret:');
  console.log(`  ${readyPath}`);
  console.log('\nThe secret will now stay the same when you run this setup again.');
  console.log('v15.2 keeps the same story-boundary classifier but splits large Drive roots into bounded folder chunks, so 1,000-2,000+ folder roots no longer need one 3-5 minute Apps Script response. Audio probing remains lightweight and supports audio MIME types plus common formats such as MP3, M4A, AAC, WAV, FLAC, OGG, OPUS and M4B. The Drive API service may remain enabled but is not required.');
  console.log('IMPORTANT: paste the ENTIRE READY file into your Apps Script project AFTER running this setup.');
  console.log('Then Save > Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.');
  console.log('Web app settings: Execute as = Me, Who has access = Anyone.');
  console.log('Do NOT use the long script.googleusercontent.com redirect URL. Use the script.google.com/macros/s/.../exec URL.');

  const current = String(vars.get('GOOGLE_APPS_SCRIPT_URL') || '').trim();
  if (current) console.log(`\nCurrent saved /exec URL:\n  ${current}`);

  const answer = (await rl.question('\nAfter you have deployed the READY code, paste the /exec URL, or press Enter to keep the current saved URL: ')).trim();
  const url = answer || current;
  if (!url) throw new Error('No Apps Script /exec URL is configured.');
  if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(url) || !/\/exec(?:\?.*)?$/i.test(url)) {
    throw new Error('That does not look like a deployed Apps Script /exec Web app URL.');
  }

  console.log('\nTesting the deployed scanner with OX\'s private key now...');
  const health = await testScanner(url, secret);
  console.log(`SUCCESS: ${health.service || 'OX Drive Scanner'} is reachable and returning JSON.`);
  console.log(`Scanner strategy: ${health.strategy || health.api || 'ready'}`);

  vars.set('GOOGLE_APPS_SCRIPT_URL', url);
  vars.set('GOOGLE_APPS_SCRIPT_SECRET', secret);
  writeDevVars(vars);
  console.log('\nDrive scanner URL + stable secret saved to .dev.vars.');
  console.log('Restart INIT-LOCAL-BACKEND.bat, then use Admin > Add Stories > Drive Import.');
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
