import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const backupDir = path.join(here, 'backups');
const pairs = [
  [path.join(backupDir,'app.js.before-request-optimization'), path.join(root,'public','assets','app.js')],
  [path.join(backupDir,'index.js.before-request-optimization'), path.join(root,'src','index.js')]
];
for (const [src,dst] of pairs) {
  if (!fs.existsSync(src)) throw new Error(`Missing backup: ${src}`);
  fs.copyFileSync(src,dst);
}
console.log('Restored app.js and src/index.js to the pre-optimization local backups.');
