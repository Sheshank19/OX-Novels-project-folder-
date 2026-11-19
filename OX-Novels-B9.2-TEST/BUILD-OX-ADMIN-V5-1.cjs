const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const base = 'C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source = path.join(base, 'OX-ADMIN-V5-DODO-PAYPAL-LOCAL');
const target = path.join(base, 'OX-ADMIN-V5-1-DODO-PAYPAL-LOCAL');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}
function once(text, before, after, label) {
  if (text.split(before).length !== 2) {
    throw Error('STOP: Unexpected source for ' + label);
  }
  return text.replace(before, after);
}
function section(text, begin, end, update, label) {
  const a = text.indexOf(begin);
  const b = text.indexOf(end, a + begin.length);
  if (a < 0 || b < 0) throw Error('STOP: Missing ' + label);
  return text.slice(0, a) +
    update(text.slice(a, b)) + text.slice(b);
}

const workerFile = path.join(source, 'src/index.js');
const adminFile = path.join(source, 'public/assets/admin.js');

if (!fs.existsSync(workerFile) || !fs.existsSync(adminFile))
  throw Error('STOP: V5 files not found.');
if (fs.existsSync(target))
  throw Error('STOP: V5.1 folder already exists.');

let worker = read(workerFile);
let admin = read(adminFile);

// Use the official Dodo refund event names.
worker = section(worker,
  'function financeEventShape(',
  '__name(financeEventShape, "financeEventShape");',
  s => {
    s = once(s,
      'if (type === "PAYMENT.REFUNDED")',
      'if (type === "REFUND.SUCCEEDED" || type === "PAYMENT.REFUNDED")',
      'successful refund event');
    s = once(s,
      '  if (type === "PAYMENT.CANCELLED")',
      '  if (type === "REFUND.FAILED")\n    return { kind: "lifecycle", label: "Dodo Refund", status: "Failed" };\n  if (type === "PAYMENT.CANCELLED")',
      'failed refund event');
    return s;
  }, 'finance event classification');

// Use the refund's own amount. Never substitute the
// full subscription price for a partial Dodo refund.
worker = section(worker,
  'async function handleAdminFinance(',
  '__name(handleAdminFinance, "handleAdminFinance");',
  s => once(s,
    '      type = "Refund";\n      amount = -Math.abs(eventAmount || tierAmount || mappedTierAmount || userTierAmount || userAmount);',
    `      const isDodoRefund = String(row.provider || "").toLowerCase() === "dodo";
      type = isDodoRefund ? "Dodo Refund" : "Refund";
      amount = isDodoRefund
        ? (row.amount === null || row.amount === "" ? null : -Math.abs(eventAmount))
        : -Math.abs(eventAmount || tierAmount || mappedTierAmount || userTierAmount || userAmount);`,
    'refund reporting amount'),
  'admin finance refund calculation');

// Record the actual Dodo refund amount in cents,
// without changing payment authorization or fulfillment.
worker = section(worker,
  'async function handleDodoLiveWebhook(',
  "__name(handleDodoLiveWebhook",
  s => once(s,
    `    const amount = (data?.total_amount === 0 || data?.total_amount === '0') ? '0.00' : dodoEventAmount(data);`,
    `    const refundMinor = type.startsWith("refund.") ? data?.amount : null;
    const amount = type.startsWith("refund.")
      ? (refundMinor == null || !Number.isFinite(Number(refundMinor))
          ? "" : (Number(refundMinor) / 100).toFixed(2))
      : ((data?.total_amount === 0 || data?.total_amount === '0')
          ? '0.00' : dodoEventAmount(data));`,
    'Dodo refund amount recording'),
  'Dodo live webhook ledger');

// Retain ALL PayPal and Dodo subscription summaries
// for Admin, not just the first active subscription.
worker = section(worker,
  'async function listAdminUsers(',
  '__name(listAdminUsers, "listAdminUsers");',
  s => {
    s = once(s,
      `  const byUser = /* @__PURE__ */ new Map();
  for (const subscription of subscriptions.results || []) {
    if (!byUser.has(subscription.user_id)) byUser.set(subscription.user_id, subscription);
  }`,
      `  const byUser = /* @__PURE__ */ new Map();
  const allBillingByUser = new Map();
  for (const subscription of subscriptions.results || []) {
    const id = String(subscription.user_id || "");
    if (!id) continue;
    if (!byUser.has(id)) byUser.set(id, subscription);
    if (!allBillingByUser.has(id)) allBillingByUser.set(id, []);
    allBillingByUser.get(id).push({
      ...paypalSubscriptionSummary(subscription),
      environment: subscription.environment || ""
    });
  }`,
      'subscription collection');

    const oldReturn = `  return (result.results || []).map((row) => adminUserFromRow(row, byUser.get(row.id) || null, lifetimeByUser.get(String(row.id)) || [], telegramByUser.get(String(row.id)) || null, testByUser.get(String(row.id)) || null));`;
    const newReturn = `  return (result.results || []).map((row) => ({
    ...adminUserFromRow(row, byUser.get(String(row.id)) || null, lifetimeByUser.get(String(row.id)) || [], telegramByUser.get(String(row.id)) || null, testByUser.get(String(row.id)) || null),
    billingSubscriptions: allBillingByUser.get(String(row.id)) || []
  }));`;
    return once(s, oldReturn, newReturn, 'subscription response');
  }, 'admin user listing');

// Display the additional subscriptions in the user's
// Admin drawer, without changing any subscription data.
admin = section(admin,
  'function openUser(id)',
  'function editUser(id)',
  s => {
    s = once(s,
      '  openDrawer(`<span class="drawer-kicker">User details',
      `  const otherBillingDetails = (Array.isArray(u.billingSubscriptions)
    ? u.billingSubscriptions : [])
    .filter(s => s && s.subscriptionId &&
      String(s.subscriptionId) !== String(u.subscriptionId || ""))
    .map(s => \`<div class="drawer-section">
      <h3>\${esc(s.provider || "Other")} subscription</h3>
      <div class="detail-grid">
        <div class="detail"><span>Status</span><strong>\${esc(s.status || "—")}</strong></div>
        <div class="detail"><span>Environment</span><strong>\${esc(s.environment || "—")}</strong></div>
        <div class="detail"><span>Next billing</span><strong>\${esc(adminDate(s.nextBillingAt,{withTime:true}))}</strong></div>
        <div class="detail"><span>Subscription ID</span><strong><code>\${esc(s.subscriptionId)}</code></strong></div>
      </div>
    </div>\`).join("");

  openDrawer(\`<span class="drawer-kicker">User details`,
      'additional subscription display');

    s = once(s,
      '${lifetimeDetails}${paypalDetails}<div class="drawer-section"><h3>Account management',
      '${lifetimeDetails}${paypalDetails}${otherBillingDetails}<div class="drawer-section"><h3>Account management',
      'all subscriptions in user drawer');
    return s;
  }, 'admin user drawer');

// Syntax checks before any copy.
function check(label, contents) {
  const temp = path.join(base, '.ox-v5-1-' + label + '.js');
  try {
    fs.writeFileSync(temp, contents);
    cp.execFileSync(process.execPath, ['--check', temp],
      { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

check('worker', worker);
check('admin', admin);

const config = read(path.join(source, 'wrangler.jsonc'));
if (!config.includes('"pattern": "oxnovels.top"') ||
    !config.includes('"custom_domain": true'))
  throw Error('STOP: Production domain config mismatch.');

fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(path.join(target, 'src/index.js'), worker);
fs.writeFileSync(path.join(target, 'public/assets/admin.js'), admin);

console.log('PASS: V5.1 local candidate created.');
console.log('PASS: Worker and Admin syntax checks.');
console.log('PASS: Dodo refunds use refund.succeeded.');
console.log('PASS: Both billing providers retained in Admin.');
console.log('PASS: Original V4 and V5 folders unchanged.');
console.log('NO PRODUCTION DEPLOYMENT.');
console.log('Folder: ' + target);
