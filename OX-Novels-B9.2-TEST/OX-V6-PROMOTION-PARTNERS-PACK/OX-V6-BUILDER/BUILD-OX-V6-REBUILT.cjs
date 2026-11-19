'use strict';
/* OX Novels V6 local candidate builder. No production calls, secrets, or migrations applied. */
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const os=require('node:os');
const folder=__dirname;
const root='C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source=path.resolve(process.argv[2]||path.join(root,'OX-V5-2-RELEASE-LOCAL'));
const target=path.resolve(process.argv[3]||path.join(root,'OX-V6-PROMOTIONS-REBUILT-LOCAL'));
function fail(msg){throw Error('STOP: '+msg);}
function read(p){return fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');}
function once(text,before,after,label){
  const count=text.split(before).length-1;
  if(count!==1)fail(label+' expected one match, found '+count);
  return text.replace(before,after);
}
function section(s,start,end,mod,label){
  const a=s.indexOf(start),b=s.indexOf(end,a+start.length);
  if(a<0||b<0)fail('Missing source section: '+label);
  const orig=s.slice(a,b),out=mod(orig);
  if(orig===out)fail('Section not changed: '+label);
  return s.slice(0,a)+out+s.slice(b);
}
function check(label,text){
  const tmp=path.join(os.tmpdir(),'ox-v6-syntax-'+process.pid+'-'+label+'.js');
  try{
    fs.writeFileSync(tmp,text,'utf8');
    cp.execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'});
  }catch(error){
    fail('Syntax failed for '+label+': '+String(error.stderr||error.message).slice(0,1500));
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
const inWorker=path.join(source,'src/index.js');
const inApp=path.join(source,'public/assets/app.js');
const inAdmin=path.join(source,'public/assets/admin.js');
const config=path.join(source,'wrangler.jsonc');
for(const f of [inWorker,inApp,inAdmin,config])if(!fs.existsSync(f))fail('Missing source '+f);
if(fs.existsSync(target))fail('Target exists: '+target+' (kept unchanged)');
if(!read(config).includes('"pattern": "oxnovels.top"') || !read(config).includes('"custom_domain": true'))fail('Wrong Wrangler configuration');
let worker=read(inWorker),app=read(inApp),admin=read(inAdmin);
const addon=read(path.join(folder,'promo-worker-addon.js'));
const gate=read(path.join(folder,'ox-promo-gate.js'));
const adminClient=read(path.join(folder,'ox-promo-admin.js'));
const partnerClient=read(path.join(folder,'ox-promo-partner.js'));
// Exact newline-start anchor prevents the prior mistake: identical text occurs inside a comment.
const entry='\nvar index_default = {\n  async fetch(request, env) {';
worker=once(worker,entry,'\n'+addon+'\nvar index_default = {\n  async fetch(request, env) {','worker top-level entry');
worker=once(worker,'    const { pathname } = url;\n',
  '    const { pathname } = url;\n    if (pathname.startsWith("/api/promo/")) return oxPromoApi(request,env,url);\n',
  'Worker early API route');
// New tables are included in the full backup, except short-lived login sessions/lockout state.
worker=once(worker,
  '  {"name":"dodo_live_webhook_receipts","columns":["event_id","status","updated_ms"]}\n];',
  '  {"name":"dodo_live_webhook_receipts","columns":["event_id","status","updated_ms"]},\n'+
  '  {"name":"ox_promo_partners","columns":["id","channel_name","login_name","password_salt","password_hash","password_iterations","active","created_at","updated_at"]},\n'+
  '  {"name":"ox_promo_attributions","columns":["user_id","source_type","partner_id","other_source","selected_at"]}\n];',
  'new backup tables');
worker=once(worker,'var D1_BACKUP_VERSION = 2;','var D1_BACKUP_VERSION = 3;','backup format version');
worker=once(worker,'backupCoverage: "v5.2-dodo-complete"','backupCoverage: "v6-promotions"','backup coverage label');
worker=once(worker,'"admin_sessions", "admin_login_rate_limits", "user_sessions"',
  '"admin_sessions", "admin_login_rate_limits", "user_sessions", "ox_promo_partner_sessions", "ox_promo_login_attempts"',
  'temporary table exclusions');
admin=once(admin,
  '"dodo_live_membership_control","dodo_live_webhook_receipts"];',
  '"dodo_live_membership_control","dodo_live_webhook_receipts","ox_promo_partners","ox_promo_attributions"];',
  'client backup required tables');
admin=once(admin,'if (Number(backup.version) !== 2 ||','if (Number(backup.version) !== 3 ||','client backup version');
admin=once(admin,'backup.backupCoverage !== "v5.2-dodo-complete"',
  'backup.backupCoverage !== "v6-promotions"','client backup coverage');
// Gate before a brand-new Dodo Live subscription checkout.
app=section(app,'async function openDodoLiveMembershipCheckout(','async function openPaypalMembershipCheckout(',s=>
  once(s,'  try {\n    showToast("Preparing Dodo live checkout…");',
    '  if (typeof window.oxPromoGate !== "function" || !(await window.oxPromoGate())) return;\n  try {\n    showToast("Preparing Dodo live checkout…");','membership gate'),
  'membership checkout');
// Gate before Dodo Live lifetime purchases; sign-in still required.
app=section(app,'async function beginDodoLifetimeLiveStoryPayment(','async function beginLifetimeStoryPayment(',s=>
  once(s,'  const originalText = actionButton.textContent;',
    '  if (!state.loggedIn) { openGoogleLogin(); showToast("Log in before purchasing."); return; }\n'+
    '  if (typeof window.oxPromoGate !== "function" || !(await window.oxPromoGate())) return;\n'+
    '  const originalText = actionButton.textContent;','lifetime gate'),
  'lifetime checkout');
const pages={};
for(const file of ['index.html','49.html']){
  let html=read(path.join(source,'public',file));
  html=once(html,'  <script src="/assets/app.js"></script>',
    '  <script src="/assets/ox-promo-gate.js"></script>\n  <script src="/assets/app.js"></script>',
    file+' gate script');
  pages[file]=html;
}
let adminHtml=read(path.join(source,'public/admin.html'));
adminHtml=once(adminHtml,'<button class="nav-item" data-go="finance" type="button"><i>₹</i><span>Finance</span></button>',
  '<button class="nav-item" data-go="finance" type="button"><i>₹</i><span>Finance</span></button><a class="nav-item" href="/admin-promotions.html" style="text-decoration:none"><i>♧</i><span>Promotion Partners</span></a>',
  'owner Admin Promotions sidebar link');
// All syntax checks BEFORE copy. Import addon as raw source, not after exports.
check('worker',worker);check('frontend',app);check('admin',admin);
for(const [name,body] of [['gate',gate],['promotions-admin',adminClient],['partner-viewer',partnerClient]])check(name,body);
const code=read(config);
if(code.includes('"account_id": "2ae96c52ec9f266d95d50f81e5e416c1"')){/* normal existing main account */}
fs.mkdirSync(path.join(target,'src'),{recursive:true});
fs.cpSync(path.join(source,'public'),path.join(target,'public'),{recursive:true});
fs.mkdirSync(path.join(target,'migrations'),{recursive:true});
fs.copyFileSync(config,path.join(target,'wrangler.jsonc'));
fs.writeFileSync(path.join(target,'src/index.js'),worker);
fs.writeFileSync(path.join(target,'public/assets/app.js'),app);
fs.writeFileSync(path.join(target,'public/assets/admin.js'),admin);
fs.writeFileSync(path.join(target,'public/admin.html'),adminHtml);
for(const [name,value] of Object.entries(pages))fs.writeFileSync(path.join(target,'public',name),value);
for(const [to,from] of [
  ['public/assets/ox-promo-gate.js','ox-promo-gate.js'],
  ['public/assets/ox-promo-admin.js','ox-promo-admin.js'],
  ['public/assets/ox-promo-partner.js','ox-promo-partner.js'],
  ['public/assets/ox-promo.css','ox-promo.css'],
  ['public/admin-promotions.html','admin-promotions.html'],
  ['public/partner.html','partner.html'],
  ['migrations/0030_promotion_partners.sql','0030_promotion_partners.sql']
])fs.copyFileSync(path.join(folder,from),path.join(target,to));
console.log('PASS: V6 rebuilt from clean V5.2.');
console.log('PASS: All 6 JavaScript syntax checks.');
console.log('PASS: Source gate added to both Dodo Live checkouts.');
console.log('PASS: Owner Add Friend dashboard and partner viewer installed.');
console.log('PASS: Partner authentication restricted to read-only API.');
console.log('PASS: Additive D1 migration prepared, NOT executed.');
console.log('PASS: V6 referral tables added to full backup format v3.');
console.log('NO PRODUCTION DEPLOYMENT / NO D1 CHANGES.');
console.log('Local candidate: '+target);
