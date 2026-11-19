import fs from 'node:fs';
import path from 'node:path';

export const devVarsPath = path.resolve(process.cwd(), '.dev.vars');

export function readDevVars() {
  const map = new Map();
  if (!fs.existsSync(devVarsPath)) return map;
  const text = fs.readFileSync(devVarsPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const i = raw.indexOf('=');
    if (i < 1) continue;
    map.set(raw.slice(0, i).trim(), raw.slice(i + 1));
  }
  return map;
}

export function writeDevVars(map) {
  const text = [...map.entries()].map(([k,v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(devVarsPath, text, 'utf8');
}
