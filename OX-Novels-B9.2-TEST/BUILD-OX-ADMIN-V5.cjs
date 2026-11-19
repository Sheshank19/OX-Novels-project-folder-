const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const base = 'C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source = path.join(base, 'OX-DODO-V4-CHECKOUT-RECOVERY-LOCAL');
const target = path.join(base, 'OX-ADMIN-V5-DODO-PAYPAL-LOCAL');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}
function count(text, needle) {
  return text.split(needle).length - 1;
}
function once(text, before, after, label) {
  const matches = count(text, before);
  if (matches !== 1) {
    throw Error('STOP: ' + label + ' expected once, found ' + matches);
  }
  return text.replace(before, after);
}
function region(text, start, end, edit, label) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw Error('STOP: ' + label + ' missing');
  const original = text.slice(a, b);
  const changed = edit(original);
  if (original === changed) throw Error('STOP: No changes in ' + label);
  return text.slice(0, a) + changed + text.slice(b);
}

const workerPath = path.join(source, 'src/index.js');
const adminPath = path.join(source, 'public/assets/admin.js');

if (!fs.existsSync(workerPath) || !fs.existsSync(adminPath))
  throw Error('STOP: V4 source not found.');
if (fs.existsSync(target))
  throw Error('STOP: V5 output already exists; existing files were not changed.');

let worker = read(workerPath);
let admin = read(adminPath);

// 1. Recognize Dodo events in Finance without counting
// subscription lifecycle notifications as extra revenue.
worker = region(worker,
  'function financeEventShape(',
  '__name(financeEventShape, "financeEventShape");',
  part => once(part, '  return null;', `
  if (type === "PAYMENT.SUCCEEDED")
    return { kind: "dodo_payment", label: "Dodo Payment", status: "Paid" };
  if (type === "PAYMENT.FAILED")
    return { kind: "failed", label: "Dodo Payment", status: "Failed" };
  if (type === "PAYMENT.CANCELLED")
    return { kind: "lifecycle", label: "Dodo Payment", status: "Cancelled" };
  if (type === "PAYMENT.REFUNDED")
    return { kind: "refund", label: "Dodo Refund", status: "Refunded" };
  if (["SUBSCRIPTION.ACTIVE", "SUBSCRIPTION.RENEWED",
       "SUBSCRIPTION.UNPAUSED"].includes(type))
    return { kind: "lifecycle", label: "Dodo Subscription", status: "Active" };
  if (["SUBSCRIPTION.CANCELLED", "SUBSCRIPTION.EXPIRED",
       "SUBSCRIPTION.FAILED", "SUBSCRIPTION.PAUSED",
       "SUBSCRIPTION.ON_HOLD"].includes(type))
    return { kind: "lifecycle", label: "Dodo Subscription",
      status: type.split(".").pop().replace("_", " ").toLowerCase()
        .replace(/^./, c => c.toUpperCase()) };
  return null;`, 'Dodo event recognition'),
  'Finance event types');

worker = region(worker,
  'async function handleAdminFinance(',
  '__name(handleAdminFinance, "handleAdminFinance");',
  part => {
    part = once(part,
      'SELECT pe.id,pe.provider_event_id,pe.event_type',
      'SELECT pe.id,pe.provider,pe.provider_event_id,pe.event_type',
      'event provider query');

    part = once(part,
      '    } else if (shape.kind === "lifetime") {',
      `    } else if (shape.kind === "dodo_payment") {
      type = subscriptionId ? "Subscription Payment" : "Dodo Payment";
      resolvedRecordPlan = subscriptionId ? resolvedPlan : "Dodo Checkout";
      amount = row.amount === null || row.amount === "" ? null : eventAmount;
    } else if (shape.kind === "lifetime") {`,
      'Dodo payment amount');

    part = once(part,
      '    const inferredEnvironment = savedEnvironment || (row.external_plan_id',
      `    const inferredEnvironment = savedEnvironment === "live_mode" ? "live" :
      savedEnvironment === "test_mode" ? "sandbox" :
      savedEnvironment || (row.external_plan_id`,
      'Dodo environment normalization');

    part = once(part,
      '      provider: "PayPal",\n      eventType: row.event_type || "",',
      `      provider: String(row.provider || "").toLowerCase() === "dodo" ? "Dodo" : "PayPal",
      eventType: row.event_type || "",`,
      'finance provider label');

    part = once(part,
      `  const activePaidSubscriptions = (subscriptionsResult.results || []).filter((r) => String(r.status || "").toUpperCase() === "ACTIVE").length;`,
      `  const activeDodoResult = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM member_subscriptions WHERE provider='dodo' AND environment='live_mode' AND UPPER(status)='ACTIVE'"
  ).first().catch(() => ({ total: 0 }));
  const activePaidSubscriptions =
    (subscriptionsResult.results || []).filter((r) => String(r.status || "").toUpperCase() === "ACTIVE").length +
    Number(activeDodoResult?.total || 0);`,
      'Dodo active subscriptions');

    return part;
  },
  'Admin Finance');

// 2. Correct lifetime purchase amount and provider output.
worker = region(worker,
  'async function handleAdminLifetimePurchases(',
  '__name(handleAdminLifetimePurchases, "handleAdminLifetimePurchases");',
  part => {
    part = once(part,
      'lp.original_cover,lp.amount,lp.currency,lp.environment,lp.paypal_order_id,',
      'lp.original_cover,lp.amount,lp.currency,lp.provider,lp.environment,lp.paypal_order_id,',
      'lifetime provider query');

    part = once(part,
      '    amount: row.amount || LIFETIME_STORY_PRICE,',
      `    amount: row.amount ?? LIFETIME_STORY_PRICE,
    provider: row.provider || "unknown",`,
      'zero-dollar lifetime amount');

    return part;
  },
  'Admin lifetime purchases');

// 3. Allow user summaries to identify Dodo subscriptions.
worker = once(worker,
  '    provider: "PayPal",\n    subscriptionId: subscription.provider_subscription_id || "",',
  `    provider: String(subscription.provider || "").toLowerCase() === "dodo" ? "Dodo" : "PayPal",
    subscriptionId: subscription.provider_subscription_id || "",`,
  'subscription provider summary');

worker = region(worker,
  'async function listAdminUsers(',
  '__name(listAdminUsers, "listAdminUsers");',
  part => {
    part = once(part,
      "WHERE provider='paypal' ORDER BY updated_at DESC",
      `WHERE provider IN ('paypal','dodo')
      ORDER BY CASE WHEN UPPER(status)='ACTIVE' THEN 0 ELSE 1 END, updated_at DESC`,
      'admin subscriptions query');

    part = once(part,
      'amount: purchase.amount || "49.00",',
      'amount: purchase.amount ?? "0.00",',
      'user lifetime amount');

    return part;
  },
  'Admin Users');

// 4. Show provider details in the lifetime table.
admin = once(admin,
  'Permanent $49 story purchases, ownership snapshots and story reconciliation.',
  'Permanent story purchases, ownership snapshots and story reconciliation.',
  'admin lifetime description');

admin = region(admin,
  'function lifetimeRows()',
  'function lifetimeView()',
  part => once(part,
    'Purchased ${esc(adminDate(p.purchasedAt,{withTime:true}))}',
    'Purchased ${esc(adminDate(p.purchasedAt,{withTime:true}))} · ${esc(String(p.provider||"unknown").toUpperCase())}',
    'lifetime provider label'),
  'lifetime table');

admin = region(admin,
  'function openLifetimePurchase(',
  'function bindLifetime()',
  part => once(part,
    '<div class="detail"><span>Paid</span><strong>${esc(financeMoney(p.amount,p.currency||"USD"))}</strong></div>',
    '<div class="detail"><span>Provider</span><strong>${esc(String(p.provider||"unknown").toUpperCase())}</strong></div><div class="detail"><span>Paid</span><strong>${esc(financeMoney(p.amount,p.currency||"USD"))}</strong></div>',
    'lifetime drawer provider'),
  'lifetime purchase drawer');

admin = once(admin,
  '[p.userName,p.userEmail,p.originalTitle,p.currentTitle,p.paypalOrderId,p.paypalCaptureId]',
  '[p.userName,p.userEmail,p.originalTitle,p.currentTitle,p.paypalOrderId,p.paypalCaptureId,p.provider]',
  'lifetime search provider');

// 5. Add provider filtering and labels to Finance.
admin = region(admin,
  'function financeFilteredRows()',
  'function financeRowMarkup(',
  part => {
    part = once(part,
      'filter=$("#financeFilter")?.value||"all";',
      'filter=$("#financeFilter")?.value||"all",provider=$("#financeProviderFilter")?.value||"all";',
      'finance provider filter state');

    part = once(part,
      '${r.status||""} ${r.environment||""}',
      '${r.status||""} ${r.provider||""} ${r.environment||""}',
      'finance provider search');

    part = once(part,
      'return matchesText&&matchesFilter;',
      'return matchesText&&matchesFilter&&(provider==="all"||String(r.provider||"").toLowerCase()===provider);',
      'finance filter logic');

    return part;
  },
  'finance filters');

admin = region(admin,
  'function financeRowMarkup(',
  'function renderFinanceRows()',
  part => once(part,
    '${esc(r.type||"Payment")}${r.environment?',
    '${esc(r.type||"Payment")}<small style="display:block;margin-top:4px">${badge(r.provider||"Unknown")}</small>${r.environment?',
    'finance provider badge'),
  'finance ledger rows');

admin = region(admin,
  'function financeView()',
  'function integrationsView()',
  part => {
    part = once(part,
      'Loading real PayPal payment data…',
      'Loading payment data…',
      'finance loading text');

    part = once(part,
      'Real D1 payment events and verified PayPal subscription payments.',
      'Dodo and PayPal payment events, plus verified PayPal subscription history.',
      'finance description');

    part = once(part,
      'Search user, plan, status or PayPal reference',
      'Search user, provider, plan or payment reference',
      'finance search hint');

    part = once(part,
      'D1 + PayPal data',
      'D1 + Dodo + PayPal',
      'finance source label');

    part = once(part,
      '<select class="select" id="financeFilter">',
      `<select class="select" id="financeProviderFilter"><option value="all">All providers</option><option value="paypal">PayPal</option><option value="dodo">Dodo</option><option value="admin">Admin</option></select><select class="select" id="financeFilter">`,
      'finance provider selector');

    return part;
  },
  'Finance page');

// 6. Export provider in the Finance CSV.
admin = region(admin,
  'function bindFinance()',
  'function bindActivity()',
  part => {
    part = once(part,
      '"Email","Type","Environment","Plan"',
      '"Email","Type","Provider","Environment","Plan"',
      'CSV provider header');

    part = once(part,
      'r.type||"",r.environment||""',
      'r.type||"",r.provider||"",r.environment||""',
      'CSV provider value');

    part = once(part,
      'if(filter)filter.onchange=renderFinanceRows;',
      'if(filter)filter.onchange=renderFinanceRows;const provider=$("#financeProviderFilter");if(provider)provider.onchange=renderFinanceRows;',
      'provider filter binding');

    return part;
  },
  'Finance bindings');

// 7. Display Dodo in the Users drawer.
admin = region(admin,
  'function openUser(id)',
  'function editUser(id)',
  part => {
    part = once(part,
      'u.billingProvider==="PayPal"?',
      '["PayPal","Dodo"].includes(u.billingProvider)?',
      'Dodo user subscription detail');

    part = once(part,
      '<h3>PayPal subscription</h3>',
      '<h3>${esc(u.billingProvider)} subscription</h3>',
      'user subscription heading');

    return part;
  },
  'user details');

// 8. Replace the outdated Card Provider placeholder with
// read-only Dodo Live information; no API key editing is added.
admin = region(admin,
  'function paymentsView()',
  'function financeView()',
  part => {
    part = once(part,
      'cp=PROVIDERS["Card provider"]',
      'cp={status:"Live via Worker"}',
      'Dodo provider label');

    part = once(part,
      '<h3>Card provider</h3>',
      '<h3>Dodo Payments — Live</h3>',
      'Dodo payments heading');

    part = once(part,
      'Optional second billing provider. Keep this planned until PayPal membership checkout is fully tested.',
      'New monthly memberships and lifetime story checkouts use Dodo Live. Credentials and signed webhooks remain managed securely in the Cloudflare Worker.',
      'Dodo payments description');

    part = once(part,
      '<div class="chips"><span>Cards</span><span>Recurring</span></div>',
      '<div class="chips"><span>Live Checkout</span><span>Recurring</span><span>Lifetime Stories</span><span>Webhooks</span></div>',
      'Dodo payment features');

    part = once(part,
      '<button class="secondary" data-provider="Card provider">Configure</button>',
      '<button class="secondary" data-go="finance">View transactions</button>',
      'Dodo payment action');

    return part;
  },
  'Payment Methods');

// 9. Validate syntax before copying anything.
function syntaxCheck(label, content) {
  const temp = path.join(base, '.ox-v5-check-' + label + '.js');
  try {
    fs.writeFileSync(temp, content, 'utf8');
    cp.execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

syntaxCheck('worker', worker);
syntaxCheck('admin', admin);

const config = read(path.join(source, 'wrangler.jsonc'));
if (!config.includes('"pattern": "oxnovels.top"') ||
    !config.includes('"custom_domain": true')) {
  throw Error('STOP: Production custom-domain configuration missing.');
}
if (!worker.includes('handleDodoLiveWebhook') ||
    !worker.includes('PAYPAL_CLIENT_SECRET') ||
    !worker.includes('handleDodoLifetimeLiveCheckout')) {
  throw Error('STOP: Existing payment handlers missing.');
}

fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(path.join(target, 'src/index.js'), worker);
fs.writeFileSync(path.join(target, 'public/assets/admin.js'), admin);

console.log('PASS: V5 local candidate created.');
console.log('PASS: Worker and Admin JavaScript syntax.');
console.log('PASS: Dodo finance, PayPal coexistence, lifetime accounting.');
console.log('PASS: No secret, database migration, or checkout changes.');
console.log('NO PRODUCTION DEPLOYMENT.');
console.log('Folder: ' + target);
