const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const base = 'C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source = path.join(base, 'OX-DODO-LIVE-V3-ZERO-DOLLAR-ACCOUNTING-FIX-2026-11-01');
const target = path.join(base, 'OX-DODO-V4-CHECKOUT-RECOVERY-LOCAL');

if (!fs.existsSync(path.join(source, 'src/index.js')) ||
    !fs.existsSync(path.join(source, 'public/assets/app.js'))) {
  throw Error('STOP: Existing V3 production source folder not found.');
}
if (fs.existsSync(target)) throw Error('STOP: V4 output folder already exists.');

const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const count = (s, needle) => s.split(needle).length - 1;
function once(s, oldText, newText, name) {
  if (count(s, oldText) !== 1) throw Error('STOP: Unexpected source for ' + name);
  return s.replace(oldText, newText);
}

let worker = read(path.join(source, 'src/index.js'));
let app = read(path.join(source, 'public/assets/app.js'));
let lifetime = read(path.join(source, 'public/49.html'));
const home = read(path.join(source, 'public/index.html'));

// 1. Change LIVE lifetime checkouts only.
// Never reuse an old checkout with a potentially unfinished payment.
let a = worker.indexOf('async function handleDodoLifetimeLiveCheckout(');
let b = worker.indexOf('async function verifyDodoLiveWebhook(', a);
if (a < 0 || b < a) throw Error('STOP: Live lifetime Worker handler missing.');
let live = worker.slice(a, b);

const reuseStart = live.indexOf('  const reusable = await env.DB.prepare(');
const reuseEnd = live.indexOf('  const token = crypto.randomUUID();', reuseStart);
if (reuseStart < 0 || reuseEnd < reuseStart) throw Error('STOP: Checkout reuse section changed.');

live = live.slice(0, reuseStart) +
  '  // Each retry creates a fresh session; old payment records remain reconcilable.\n' +
  live.slice(reuseEnd);

const oldReturn = 'new URL("/49", url)';
if (count(live, oldReturn) !== 2) throw Error('STOP: Expected two Live lifetime return URLs.');
live = live.replaceAll(oldReturn, 'new URL("/", url)');
worker = worker.slice(0, a) + live + worker.slice(b);

// 2. Handle Dodo lifetime returns safely on the homepage.
const start = app.indexOf('async function handleLifetimeDodoLiveReturn() {');
const end = app.indexOf('async function handleLifetimePaypalReturn() {', start);
if (start < 0 || end < start) throw Error('STOP: Existing Dodo return handler missing.');

const newHandler = String.raw`async function handleLifetimeDodoLiveReturn() {
  if (state.lifetimePurchaseMode) return;
  const url = new URL(location.href);
  if (url.searchParams.get("dodo_live") !== "1" ||
      !url.searchParams.has("dodo_lifetime")) return;

  const kind = String(url.searchParams.get("dodo_lifetime") || "");
  const storyId = String(url.searchParams.get("story") || "").trim();
  const paymentState = String(url.searchParams.get("status") || "").toLowerCase();

  ["dodo_live","dodo_lifetime","payment_id","status","email","story"]
    .forEach(key => url.searchParams.delete(key));
  history.replaceState(history.state || {}, "",
    url.pathname + url.search + url.hash);

  if (kind === "cancelled" ||
      ["requires_customer_action","requires_payment_method",
       "failed","cancelled","canceled"].includes(paymentState)) {
    showToast("Dodo payment not completed. No new access was granted.");
    return;
  }
  if (kind !== "return") return;

  showToast("Checking your lifetime purchase...");
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch("/api/story-purchases/mine", {
        credentials: "same-origin", cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      const purchases = Array.isArray(payload.purchases) ? payload.purchases : [];
      const owned = response.ok && purchases.some(item =>
        item?.purchaseStatus === "Completed" &&
        item?.entitlementStatus === "Active" &&
        (String(item.currentStoryId || "") === storyId ||
         String(item.originalStoryId || "") === storyId)
      );
      if (owned) {
        await loadLifetimePurchasesForHome();
        applyStoryFilters();
        renderAccessStatus();
        showToast("Lifetime story access unlocked!");
        switchTab("stories", true, false);
        return;
      }
    } catch {}
    await wait(1000);
  }
  showToast("Payment is not yet confirmed. If you were charged, access will update after verification.");
}

`;
app = app.slice(0, start) + newHandler + app.slice(end);

// 3. Handle old Dodo callbacks that still target /49.
app = once(app,
  '// PayPal returns to /49 before OX verifies the capture.',
  String.raw`// Redirect legacy LIVE Dodo returns from /49 to the homepage.
if (state.lifetimePurchaseMode) {
  const previous = new URL(location.href);
  if (previous.searchParams.get("dodo_live") === "1" &&
      previous.searchParams.has("dodo_lifetime")) {
    previous.pathname = "/";
    location.replace(previous.toString());
  }
}

// PayPal returns to /49 before OX verifies the capture.`,
  'legacy checkout redirect');

app = once(app,
  'initialUrl.searchParams.get("dodo_live") === "1" && initialDodoLifetimeResult === "return"',
  'false && initialUrl.searchParams.get("dodo_live") === "1" && initialDodoLifetimeResult === "return"',
  'old Dodo lifetime countdown');

// 4. Process the lifetime result on the homepage.
app = once(app,
  '  await handleDodoLiveReturn();\n});',
  '  await handleDodoLiveReturn();\n  await handleLifetimeDodoLiveReturn();\n});',
  'homepage lifetime return');

// 5. Clean up membership return parameters and incomplete statuses.
a = app.indexOf('async function handleDodoLiveReturn() {');
b = app.indexOf('window.addEventListener("hashchange"', a);
if (a < 0 || b < a) throw Error('STOP: Live membership return handler missing.');
let member = app.slice(a, b);
member = once(member,
  '  if (params.get("dodo_live") !== "1") return;',
  String.raw`  if (params.get("dodo_live") !== "1" || !params.has("dodo")) return;
  const paymentState = String(params.get("status") || "").toLowerCase();
  const clean = new URL(location.href);
  ["dodo_live","dodo","payment_id","status","email"]
    .forEach(key => clean.searchParams.delete(key));
  history.replaceState(history.state || {}, "",
    clean.pathname + clean.search + clean.hash);
  if (["requires_customer_action","requires_payment_method",
       "failed","cancelled","canceled"].includes(paymentState)) {
    showToast("Dodo payment not completed. Membership was not activated.");
    return;
  }`,
  'membership return state');
member = once(member,
  'Dodo payment completed, but activation is still processing. Refresh in a moment.',
  'Dodo payment is not yet confirmed. Access will update after verification.',
  'membership pending message');
app = app.slice(0, a) + member + app.slice(b);

// 6. Add the existing homepage purchased-stories section to /49.
const sectionMatch = home.match(/<section class="purchased-stories-section"[\s\S]*?<\/section>/);
if (!sectionMatch || lifetime.includes('id="purchasedStoriesSection"')) {
  throw Error('STOP: Purchased section baseline changed.');
}
const storiesAnchor = '<div class="tab-panel active" id="storiesPanel" data-panel="stories" role="tabpanel" aria-labelledby="storiesTab">';
lifetime = once(lifetime, storiesAnchor,
  storiesAnchor + '\n        ' + sectionMatch[0], 'lifetime purchased section');

// Load entitlement records on /49, not only on the homepage.
app = once(app,
  'if (state.lifetimePurchaseMode || !state.loggedIn)',
  'if (!state.loggedIn)', 'purchase loading guard');

const loadGuard = 'if (!state.lifetimePurchaseMode) await loadLifetimePurchasesForHome();';
if (count(app, loadGuard) !== 2) throw Error('STOP: Purchase-loading call sites changed.');
app = app.replaceAll(loadGuard, 'await loadLifetimePurchasesForHome();');

a = app.indexOf('async function finishGoogleCredential(');
b = app.indexOf('async function renderGoogleSignIn(', a);
if (a < 0 || b < a) throw Error('STOP: Google login handler changed.');
let login = app.slice(a, b);
login = once(login,
  '    dismissDialog(els.loginDialog);\n    if (!state.lifetimePurchaseMode) {',
  '    dismissDialog(els.loginDialog);\n    if (state.lifetimePurchaseMode) {\n      await loadLifetimePurchasesForHome();\n      applyStoryFilters();\n    }\n    if (!state.lifetimePurchaseMode) {',
  'login purchase refresh');
app = app.slice(0, a) + login + app.slice(b);

lifetime = lifetime.replace(
  'aria-label="Choose one story for lifetime access for 49 dollars one-time"',
  'aria-label="Choose one story for lifetime access for 65 dollars one-time"');

// Validate the new files before creating a local release directory.
const checkPath = (name, contents) => {
  const tmp = path.join(base, 'ox-v4-' + name + '.js');
  try {
    fs.writeFileSync(tmp, contents);
    cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
};
checkPath('worker', worker);
checkPath('frontend', app);

fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(path.join(target, 'src/index.js'), worker);
fs.writeFileSync(path.join(target, 'public/assets/app.js'), app);
fs.writeFileSync(path.join(target, 'public/49.html'), lifetime);

const config = read(path.join(target, 'wrangler.jsonc'));
if (!config.includes('"custom_domain": true') ||
    !config.includes('"pattern": "oxnovels.top"')) {
  throw Error('STOP: Custom domain configuration must be checked.');
}

console.log('PASS: V4 local candidate created.');
console.log('PASS: Both JavaScript syntax checks.');
console.log('PASS: Fresh Live lifetime sessions; homepage return; purchased stories on /49.');
console.log('NO CLOUDFLARE DEPLOYMENT OR DATABASE CHANGE.');
console.log('Folder: ' + target);
