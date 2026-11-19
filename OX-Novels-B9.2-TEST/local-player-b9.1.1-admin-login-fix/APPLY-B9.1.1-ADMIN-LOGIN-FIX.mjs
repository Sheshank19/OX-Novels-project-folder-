import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const oxRoot = path.resolve(here, "..");
const targets = [
  path.join(oxRoot, "local-player-b5", "src", "worker-B5-template.js"),
  path.join(oxRoot, "local-player-b5", "src", "index.js")
];

const wrong = "oxPlayerBase64UrlEncode(new Uint8Array(sig))";
const correct = "base64UrlEncode(new Uint8Array(sig))";

let changed = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    process.exitCode = 1;
    continue;
  }
  let text = fs.readFileSync(file, "utf8");
  if (text.includes(wrong)) {
    const backup = `${file}.b9.1.1-backup`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    text = text.replaceAll(wrong, correct);
    fs.writeFileSync(file, text);
    console.log(`[FIXED] ${file}`);
    changed++;
  } else if (text.includes(correct)) {
    console.log(`[OK] Already fixed: ${file}`);
  } else {
    console.error(`[FAIL] Expected admin HMAC encoder call was not found in: ${file}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit(process.exitCode);

console.log();
console.log(`B9.1.1 applied. Files changed this run: ${changed}`);
console.log("The login token now uses the existing base64UrlEncode() helper that is already defined in the Player Worker.");
