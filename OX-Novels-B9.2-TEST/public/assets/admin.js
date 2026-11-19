const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ROUTES = {
  dashboard: ["Dashboard", "A quick view of your stories, members, messages and business.", "Admin / Dashboard"],
  appearance: ["Appearance", "Rebrand this independent website without editing code.", "Admin / Site / Appearance"],
  settings: ["Site Settings", "General public-site behavior and local preview settings.", "Admin / Site / Settings"],
  stories: ["Story Library", "Manage story titles, genres, descriptions, visibility and ordering.", "Admin / Content / Story Library"],
  posts: ["Posts", "Publish announcements and important updates shown on the public Posts tab.", "Admin / Content / Posts"],
  add: ["Add Stories", "Add one story, import Drive folders or match cover images.", "Admin / Content / Add Stories"],
  checks: ["Story Details AI", "Quickly fill genre and description with a manual AI prompt.", "Admin / Content / Story Details AI"],
  playerCatalogs: ["Player Catalogs", "Compare OX stories with the separate protected audio Player catalog service.", "Admin / Content / Player Catalogs"],
  users: ["Users", "Manage accounts, memberships, grants and access status.", "Admin / Members / Users"],
  promotions: ["Promotions", "Manage referral partners, customer attribution and promotion records.", "Admin / Business / Promotions"],
  chat: ["Chat", "One-to-one conversations with customers whose Chat unlocked after a successful payment.", "Admin / Members / Chat"],
  notifications: ["Notifications", "Important messages, payment events, story details and system notices.", "Admin / Members / Notifications"],
  membership: ["Membership Tiers", "Create and edit the plans shown on the public Membership tab.", "Admin / Business / Membership"],
  lifetime: ["Lifetime Purchases", "Permanent $49 story purchases, ownership snapshots and story reconciliation.", "Admin / Business / Lifetime Purchases"],
  payments: ["Payment Methods", "Configure checkout providers and recurring subscription methods.", "Admin / Business / Payments"],
  finance: ["Finance", "Revenue, payments, refunds, failures and admin grants.", "Admin / Business / Finance"],
  integrations: ["Integrations", "Real connection health for Google Drive / Apps Script, PayPal and Google Sign-In.", "Admin / System / Integrations"],
  activity: ["Activity Log", "An audit trail of important admin and system changes.", "Admin / System / Activity Log"],
  backup: ["Backup / Restore", "Export portable backups and clean templates for independent site copies.", "Admin / System / Backup"]
};

const DEFAULT_STORIES = [];

const DEFAULT_USERS = [];

const DEFAULT_CONVERSATIONS = [];

const DEFAULT_NOTICES = [];

const DEFAULT_TIERS = [];

const DEFAULT_LEDGER = [];

const DEFAULT_ACTIVITY = [];

const DEFAULT_APPEARANCE = {name:"",handle:"",description:"",accent:"#13c3b3",layout:"Integrated banner",logo:"",profileImage:"",bannerImage:""};
const DEFAULT_SETTINGS = {language:"English",timezone:"Asia/Kolkata (IST)",currency:"USD — US Dollar",supportEmail:"",supportLabel:"Support",showSearch:true,showChat:true,showSupport:true,preventSelection:true};
const DEFAULT_PROVIDERS = {
  "PayPal": {displayName:"PayPal",status:"Not connected"},
  "Card provider": {displayName:"Card provider",status:"Not connected"},
  "Google Drive": {displayName:"Google Drive / Apps Script",status:"Not connected"}
};
const STORAGE_KEY = "ox_admin_state_v10";

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function esc(v=""){ return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function slug(v=""){ return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || `item-${Date.now()}`; }
function safeJson(v){ try{return JSON.parse(v)}catch{return null} }
function money(v){ const n=Number(String(v).replace(/[^0-9.-]/g,"")); return Number.isFinite(n)?n:0; }
function formatMoney(n){ return `$${Number(n||0).toFixed(2).replace(/\.00$/,"")}`; }

function defaultState(){
  return {
    appearance:clone(DEFAULT_APPEARANCE),settings:clone(DEFAULT_SETTINGS),stories:clone(DEFAULT_STORIES),users:clone(DEFAULT_USERS),
    conversations:clone(DEFAULT_CONVERSATIONS),notices:clone(DEFAULT_NOTICES),tiers:clone(DEFAULT_TIERS),ledger:clone(DEFAULT_LEDGER),
    activity:clone(DEFAULT_ACTIVITY),providers:clone(DEFAULT_PROVIDERS)
  };
}
function loadState(){
  const base=defaultState(), saved=safeJson(localStorage.getItem(STORAGE_KEY));
  if(saved&&typeof saved==="object"){
    if(saved.appearance) Object.assign(base.appearance,saved.appearance);
    if(saved.settings) Object.assign(base.settings,saved.settings);
    for(const k of ["stories","users","conversations","notices","tiers","ledger","activity"]){ if(Array.isArray(saved[k])) base[k]=saved[k]; }
    if(saved.providers) base.providers={...base.providers,...saved.providers};
    return base;
  }
  const legacyStories=safeJson(localStorage.getItem("ox_admin_full_stories"));
  const legacyAppearance=safeJson(localStorage.getItem("ox_admin_appearance"));
  if(Array.isArray(legacyStories)&&legacyStories.length) base.stories=legacyStories;
  if(legacyAppearance) Object.assign(base.appearance,legacyAppearance);
  return base;
}

let state=loadState();
let APPEARANCE=state.appearance, SETTINGS=state.settings, stories=state.stories, USERS=state.users, CONV=state.conversations,
    NOTICES=state.notices, TIERS=state.tiers, LEDGER=state.ledger, ACT=state.activity, PROVIDERS=state.providers;
let FINANCE={loaded:false,rows:[],summary:{grossRevenue:0,refunded:0,successful:0,failed:0,adminGrants:0,activePaidSubscriptions:0},monthly:[]};
let LIFETIME_ADMIN={loaded:false,purchases:[],stories:[],summary:{purchases:0,activeEntitlements:0,needsAssignment:0,grossRecorded:0}};
let POSTS_ADMIN={loaded:false,loading:false,posts:[]};
let route="dashboard", activeConv="", pendingRestore=null, pendingDriveImport=[], pendingDriveBoundaryReviews=[], pendingCoverMatches=[];
let activeDriveScanController=null, coverMatchingBusy=false, coverMatchingDone=0, coverMatchingTotal=0;
let backendSyncReady=false, backendSyncTimer=null, backendBooted=false;
let CHAT_CONV=[], backendChatReady=false, backendChatUnreadTotal=0, adminChatStatusTimer=null, adminChatLiveTimer=null;
let backendNotificationsReady=false, adminNotificationTimer=null;
let INTEGRATIONS={loaded:false,googleDrive:{status:"Checking…"},paypal:{status:"Checking…"},googleAuth:{status:"Checking…"}};
let PLAYER_CATALOGS={loaded:false,loading:false,playerAvailable:false,playerError:"",currentStories:0,publishedCatalogs:0,attention:0,counts:{},rows:[],checkedAt:"",playerBase:"https://listen.ox-audio-player.workers.dev",deliveryLoaded:false,protectedEnabled:false};

function persistLocalState(){
  state={appearance:APPEARANCE,settings:SETTINGS,stories,users:USERS,conversations:CONV,notices:NOTICES,tiers:TIERS,ledger:LEDGER,activity:ACT,providers:PROVIDERS};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  localStorage.setItem("ox_admin_full_stories",JSON.stringify(stories));
  localStorage.setItem("ox_admin_appearance",JSON.stringify(APPEARANCE));
}

function persistState(){
  persistLocalState();
  if(backendSyncReady) scheduleBackendCoreSync();
}

async function backendJson(url, options={}){
  const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...options,headers:{"content-type":"application/json",...(options.headers||{})}});
  let payload={};
  try{payload=await response.json()}catch{}
  if(!response.ok){const error=new Error(payload.error||`Request failed (${response.status})`);error.status=response.status;error.code=payload.code;error.retryAfterSeconds=Number(payload.retryAfterSeconds||response.headers.get("retry-after")||0);throw error}
  return payload;
}


function confirmAdminStoryRemoval(selected,protectedStories){
  return new Promise(resolve=>{
    const protectedCount=protectedStories.length;
    const activeOwners=protectedStories.reduce((sum,item)=>sum+Number(item.activeOwners||0),0);
    const purchaseRecords=protectedStories.reduce((sum,item)=>sum+Number(item.purchaseRecords||0),0);
    const names=(protectedCount?protectedStories:selected).slice(0,5).map(item=>`<div class="backup-history-row"><span class="file-icon">${protectedCount?"∞":"▦"}</span><span><strong>${esc(item.title||"Story")}</strong>${protectedCount?`<small>${Number(item.activeOwners||0)} active owner${Number(item.activeOwners||0)===1?"":"s"} · ${Number(item.purchaseRecords||0)} purchase record${Number(item.purchaseRecords||0)===1?"":"s"}</small>`:""}</span></div>`).join("");
    const extra=(protectedCount?protectedStories:selected).length>5?`<p class="drawer-sub" style="margin-top:8px">+${(protectedCount?protectedStories:selected).length-5} more selected stor${(protectedCount?protectedStories:selected).length-5===1?"y":"ies"}</p>`:"";
    const title=protectedCount?"Lifetime Purchase Protection":"Delete Story";
    const subtitle=protectedCount
      ?`${protectedCount===1?"This story has":"These stories have"} permanent purchase history. OX will archive ${protectedCount===1?"its":"their"} identity instead of erasing ownership.`
      :`${selected.length===1?"This story":"These stories"} will be removed from the Story Library.`;
    const warning=protectedCount
      ?`<div class="callout" style="margin-top:12px"><strong>⚠ Purchase history will be protected</strong><br>${activeOwners} active lifetime owner${activeOwners===1?"":"s"} · ${purchaseRecords} purchase record${purchaseRecords===1?"":"s"}. Customers keep their lifetime purchase record and will see the story as temporarily unavailable until a replacement is assigned or reimported.</div>`
      :`<div class="callout" style="margin-top:12px">This story has no lifetime purchase history, so normal deletion can continue.</div>`;
    openDrawer(`<span class="drawer-kicker">Story Library</span><h2 id="drawerTitle">${title}</h2><p class="drawer-sub">${subtitle}</p><div class="drawer-section">${names}${extra}${warning}<div class="drawer-actions" style="margin-top:16px"><button class="secondary" type="button" id="cancelStoryRemoval">Cancel</button><button class="secondary danger" type="button" id="confirmStoryRemoval">${protectedCount?`Archive ${protectedCount===1?"Story":"Stories"}`:`Delete ${selected.length===1?"Story":"Stories"}`}</button></div></div>`);
    let settled=false;
    const layer=$("#modalLayer");
    const closeTargets=layer?$$('[data-close-modal]',layer):[];
    const onOutsideClose=()=>finish(false);
    const onEscape=e=>{if(e.key==="Escape")finish(false)};
    const finish=value=>{
      if(settled)return;
      settled=true;
      closeTargets.forEach(target=>target.removeEventListener("click",onOutsideClose));
      document.removeEventListener("keydown",onEscape,true);
      closeDrawer();
      resolve(value);
    };
    closeTargets.forEach(target=>target.addEventListener("click",onOutsideClose));
    document.addEventListener("keydown",onEscape,true);
    const cancel=$("#cancelStoryRemoval"),confirmButton=$("#confirmStoryRemoval");
    if(cancel)cancel.onclick=()=>finish(false);
    if(confirmButton)confirmButton.onclick=()=>finish(true);
  });
}

async function deleteAdminStories(ids,{closeAfter=false}={}){
  const clean=[...new Set((Array.isArray(ids)?ids:[]).map(v=>String(v||"").trim()).filter(Boolean))];
  if(!clean.length)return false;
  const selected=clean.map(id=>stories.find(story=>story.id===id)).filter(Boolean);
  if(!selected.length)return false;
  try{
    const check=await backendJson("/api/admin/stories/lifetime-protection",{method:"POST",body:JSON.stringify({ids:clean})});
    const protectedStories=(check.stories||[]).filter(item=>item.protected);
    const approved=await confirmAdminStoryRemoval(selected,protectedStories);
    if(!approved)return false;
    const result=await backendJson("/api/admin/stories",{method:"DELETE",body:JSON.stringify({ids:clean,archiveProtected:true})});
    stories=stories.filter(story=>!clean.includes(story.id));
    persistState();
    updateCounts();
    LIFETIME_ADMIN.loaded=false;
    if(closeAfter)closeDrawer();
    if(route==="stories")render("stories",{keepScroll:true});
    const archived=Number(result.archived||0);
    toast(archived?`${archived} lifetime-owned stor${archived===1?"y":"ies"} archived safely.`:`${Number(result.deleted||clean.length)} stor${clean.length===1?"y":"ies"} removed.`);
    return true;
  }catch(error){
    toast(error.message||"Unable to remove story.");
    return false;
  }
}


function notificationIcon(type="system"){
  const t=String(type||"system").toLowerCase();
  if(t==="chat")return "✉";
  if(t==="payment")return "₹";
  if(t==="user")return "♙";
  if(t==="story")return "✓";
  if(t==="drive")return "↔";
  return "•";
}
function notificationTime(value){return activityDisplayTime(value)}
async function loadBackendNotifications(limit=250){
  const payload=await backendJson(`/api/admin/notifications?limit=${encodeURIComponent(limit)}`);
  NOTICES=(payload.notifications||[]).map(n=>({
    id:String(n.id),rawId:Number(n.id),icon:notificationIcon(n.type),type:n.type||"system",title:n.title||"Notification",text:n.text||"",
    time:notificationTime(n.createdAt),createdAt:n.createdAt||null,unread:n.unread===true,go:n.route||"",userId:n.userId||null
  }));
  backendNotificationsReady=true;updateCounts();return NOTICES;
}
async function markBackendNotificationRead(id){
  await backendJson("/api/admin/notifications/read",{method:"POST",body:JSON.stringify({id:Number(id)})});
}
async function markAllBackendNotificationsRead(){
  await backendJson("/api/admin/notifications/read",{method:"POST",body:JSON.stringify({all:true})});
}
async function markBackendNotificationsReadForRoute(routeName){
  const target=String(routeName||"").trim();
  if(!target)return;
  await backendJson("/api/admin/notifications/read",{method:"POST",body:JSON.stringify({route:target})});
}
const AUTO_READ_NOTICE_ROUTES=new Set(["users","finance","lifetime","add","checks"]);
async function syncNotificationsForOpenedRoute(routeName){
  if(!AUTO_READ_NOTICE_ROUTES.has(routeName))return;
  const matching=NOTICES.filter(n=>n.unread&&n.go===routeName);
  if(!matching.length)return;
  matching.forEach(n=>n.unread=false);
  updateCounts();
  try{
    await markBackendNotificationsReadForRoute(routeName);
  }catch(error){
    matching.forEach(n=>n.unread=true);
    updateCounts();
    console.warn("Unable to synchronize notifications for opened Admin tab",error);
  }
}
function startAdminNotificationPolling(){
  if(adminNotificationTimer)clearInterval(adminNotificationTimer);
  const poll=async()=>{if(document.hidden)return;try{const before=NOTICES.filter(n=>n.unread).length;await loadBackendNotifications(250);const after=NOTICES.filter(n=>n.unread).length;if(route==="notifications"&&after!==before)renderNotices(document.querySelector('[data-notice-filter].active')?.dataset.noticeFilter||"all")}catch{}};
  void poll();adminNotificationTimer=setInterval(poll,10000);
}


function adminSiteInitials(name="Site"){
  const words=String(name||"").trim().split(/\s+/).filter(Boolean);if(!words.length)return "•";
  return (words.length===1?words[0].slice(0,2):`${words[0][0]||""}${words[1][0]||""}`).toUpperCase();
}
function applyAdminBranding(){
  const name=String(APPEARANCE?.name||"").trim()||"Site",initials=adminSiteInitials(name),logo=String(APPEARANCE?.logo||"").trim();
  document.title=`${name} Admin`;
  const n=$("#adminBrandName");if(n)n.textContent=name;
  [$("#adminBrandLogo"),$("#adminMobileBrandLogo")].forEach(el=>{if(!el)return;el.textContent="";el.hidden=!logo;el.style.backgroundImage=logo?`url("${logo.replaceAll('"','%22')}")`:"";el.style.backgroundSize="cover";el.style.backgroundPosition="center"});
}

async function loadBackendCore(){
  const [core,userPayload]=await Promise.all([
    backendJson("/api/admin/core"),
    backendJson("/api/admin/users")
  ]);
  APPEARANCE={...clone(DEFAULT_APPEARANCE),...(core.appearance||{})};
  SETTINGS={...clone(DEFAULT_SETTINGS),...(core.settings||{})};
  stories=Array.isArray(core.stories)?core.stories:clone(DEFAULT_STORIES);
  TIERS=Array.isArray(core.tiers)?core.tiers:clone(DEFAULT_TIERS);
  USERS=Array.isArray(userPayload.users)?userPayload.users:[];
  NOTICES=[];
  ACT=[];
  persistLocalState();
  applyAdminAccent();
  applyAdminBranding();
}

function scheduleBackendCoreSync(){
  clearTimeout(backendSyncTimer);
  backendSyncTimer=setTimeout(syncCoreToBackend,220);
}

async function syncCoreToBackend(){
  if(!backendSyncReady)return;
  try{
    const payload=await backendJson("/api/admin/core",{method:"PUT",body:JSON.stringify({appearance:APPEARANCE,settings:SETTINGS,stories,tiers:TIERS})});
    if(payload.appearance) APPEARANCE={...APPEARANCE,...payload.appearance};
    if(payload.settings) SETTINGS={...SETTINGS,...payload.settings};
    const label=$("#adminBackendLabel");if(label){label.textContent="D1 connected";label.classList.add("backend-status")}
  }catch(error){
    console.error("Backend sync failed",error);
    const label=$("#adminBackendLabel");if(label){label.textContent="Sync error";label.classList.remove("backend-status")}
    toast(error.status===401?"Admin session expired. Refresh and log in again.":"Backend save failed. Your browser copy is still preserved.");
  }
}

async function loadPublicAdminGateBranding(){
  try{
    const response=await fetch("/api/site",{cache:"no-store",credentials:"same-origin"});
    if(!response.ok)return;
    const payload=await response.json();
    const appearance=payload?.appearance||{};
    const name=String(appearance.name||"").trim();
    const logo=String(appearance.logo||"").trim();
    const logoEl=$("#backendGateLogo"), kicker=$("#backendGateKicker");
    if(name){ document.title=`${name} Admin`; if(kicker)kicker.textContent=`${name.toUpperCase()} ADMIN`; }
    else if(kicker) kicker.textContent="WEBSITE ADMIN";
    if(logoEl){
      logoEl.textContent="";
      logoEl.hidden=!logo;
      logoEl.style.backgroundImage=logo?`url("${logo.replaceAll('"','%22')}")`:"";
      logoEl.style.backgroundSize="cover";
      logoEl.style.backgroundPosition="center";
      logoEl.style.backgroundColor="transparent";
    }
  }catch{}
}

let adminLoginLockTimer=null;
function stopAdminLoginLockout({clearMessage=false}={}){
  if(adminLoginLockTimer){clearInterval(adminLoginLockTimer);adminLoginLockTimer=null}
  const form=$("#adminLoginForm"),input=$("#adminPassword"),button=form?.querySelector('button[type="submit"]'),err=$("#backendGateError");
  if(input)input.disabled=false;
  if(button){button.disabled=false;button.textContent="Open Admin"}
  if(clearMessage&&err)err.textContent="";
}
function startAdminLoginLockout(seconds){
  stopAdminLoginLockout();
  const form=$("#adminLoginForm"),input=$("#adminPassword"),button=form?.querySelector('button[type="submit"]'),err=$("#backendGateError");
  let remaining=Math.max(1,Math.ceil(Number(seconds)||900));
  if(input)input.disabled=true;
  if(button)button.disabled=true;
  const tick=()=>{
    const minutes=Math.floor(remaining/60),secs=remaining%60,label=minutes?`${minutes}m ${String(secs).padStart(2,"0")}s`:`${secs}s`;
    if(err)err.textContent=`Too many incorrect attempts. Try again in ${label}.`;
    if(button)button.textContent=`Locked ${label}`;
    remaining-=1;
    if(remaining<0){
      stopAdminLoginLockout();
      if(err)err.textContent="You can try the Admin password again now.";
      input?.focus();
    }
  };
  tick();
  adminLoginLockTimer=setInterval(tick,1000);
}

function showBackendGate(message,{login=false,help="",error=""}={}){
  const gate=$("#backendGate"), app=$("#adminApp"), form=$("#adminLoginForm"), helper=$("#backendSetupHelp"), err=$("#backendGateError");
  if(app) app.hidden=true;
  document.body.classList.add("admin-auth-pending");
  gate.hidden=false;$("#backendGateText").textContent=message;form.hidden=!login;helper.hidden=!help;helper.innerHTML=help;err.textContent=error;
  if(login) requestAnimationFrame(()=>$("#adminPassword")?.focus());
}
function hideBackendGate(){
  stopAdminLoginLockout({clearMessage:true});
  const gate=$("#backendGate"), app=$("#adminApp");
  if(gate)gate.hidden=true;
  if(app)app.hidden=false;
  document.body.classList.remove("admin-auth-pending");
}

async function checkBackendAccess(){
  await loadPublicAdminGateBranding();
  try{
    const status=await backendJson("/api/admin/status",{headers:{}});
    if(!status.dbReady){
      showBackendGate("The Admin frontend is ready, but the local D1 database has not been initialized yet.",{help:'Run this file once from the project folder:<code>INIT-LOCAL-BACKEND.bat</code>It creates the local database tables and starts the site.'});
      return false;
    }
    if(!status.passwordConfigured){
      showBackendGate("The database is ready, but an Admin password has not been configured.",{help:'For local testing, create <code>.dev.vars</code> with <code>ADMIN_PASSWORD=your-password</code>, then restart Wrangler. The included INIT-LOCAL-BACKEND.bat can do this for you.'});
      return false;
    }
    if(!status.authenticated){
      showBackendGate("Enter the Admin password for this independent website copy.",{login:true});
      return false;
    }
    await loadBackendCore();
    backendSyncReady=true;
    hideBackendGate();
    return true;
  }catch(error){
    showBackendGate("Unable to connect to the website backend.",{help:'Make sure the project is running with <code>START-OX-NOVELS.bat</code> after the backend has been initialized.',error:error.message});
    return false;
  }
}

async function loginToBackend(password){
  await backendJson("/api/admin/login",{method:"POST",body:JSON.stringify({password})});
  await loadBackendCore();
  backendSyncReady=true;
  hideBackendGate();
  bootAdmin();
}
function activityIcon(type="system",title=""){
  const t=String(type||"system").toLowerCase(),name=String(title||"").toLowerCase();
  if(t==="story") return name.includes("check")||name.includes("detail")?"✓":"▦";
  if(t==="user") return "♙";
  if(t==="payment") return "₹";
  if(name.includes("backup")) return "⇩";
  if(name.includes("drive")||name.includes("integration")) return "↔";
  return "•";
}
function activityDisplayTime(value){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return "—";
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),day=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const delta=Math.round((today-day)/86400000),clock=d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  if(delta===0)return `Today, ${clock}`;
  if(delta===1)return `Yesterday, ${clock}`;
  return d.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function normalizeActivityRecord(row={}){
  const createdAt=String(row.createdAt||row.created_at||new Date().toISOString());
  return {id:row.id??null,type:String(row.type||"system"),icon:activityIcon(row.type,row.title),title:String(row.title||"Activity"),detail:String(row.detail||""),createdAt,time:activityDisplayTime(createdAt)};
}
async function loadBackendActivity(limit=500){
  const payload=await backendJson(`/api/admin/activity?limit=${Math.max(1,Math.min(1000,Number(limit)||500))}`);
  ACT=(Array.isArray(payload.activity)?payload.activity:[]).map(normalizeActivityRecord);
  persistLocalState();
  return ACT;
}
function addActivity(type,title,detail,icon="•"){
  const createdAt=new Date().toISOString(),entry={type,icon:icon||activityIcon(type,title),title,detail,createdAt,time:activityDisplayTime(createdAt)};
  ACT.unshift(entry);if(ACT.length>1000)ACT.length=1000;
  persistLocalState(); updateCounts();
  if(backendSyncReady){
    backendJson("/api/admin/activity",{method:"POST",body:JSON.stringify({type,title,detail})})
      .then(payload=>{if(payload.activity){const saved=normalizeActivityRecord(payload.activity);const idx=ACT.indexOf(entry);if(idx>=0)ACT[idx]=saved;if(route==="activity")renderActivityFilter()}})
      .catch(error=>console.warn("Unable to save activity log entry",error));
  }
}
function unreadChats(){ return backendChatReady ? backendChatUnreadTotal : 0; }
function activeUsers(){ return USERS.filter(u=>u.account==="Active"&&(u.membership==="Active"||u.membership==="Granted")).length; }
function reviewCount(){ return stories.filter(s=>!String(s.description||"").trim()||["","unknown","unverified"].includes(String(s.genre||"").trim().toLowerCase())).length; }
function grossRevenue(){ return Number(FINANCE?.summary?.grossRevenue||0); }
function applyAdminAccent(){ document.documentElement.style.setProperty("--accent",APPEARANCE.accent||DEFAULT_APPEARANCE.accent); }
function toast(m){ const t=$("#toast"); if(!t)return; t.textContent=m; t.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),2100); }
function badge(v=""){
  const s=String(v).toLowerCase(); let c="";
  if(["active","paid","published","completed","connected","processed"].includes(s)) c="ok";
  else if(["failed","blocked","cancelled","stopped","refunded","reversed","connection error"].includes(s)) c="danger";
  else if(["expired","suspended","unfinished","removed","unverified","unknown","draft","archived","temporarily unavailable","needs assignment"].includes(s)) c="warn";
  else if(["granted","not required","ongoing","test mode","sandbox","admin"].includes(s)||/^\d+\s+lifetime(?:\s+stor(?:y|ies))?$/.test(s)) c="accent";
  else if(["live"].includes(s)) c="ok";
  else if(["legacy"].includes(s)) c="warn";
  else if(["planned","future","checking…","checking..."].includes(s)) c="preview";
  return `<span class="badge ${c}">${esc(v)}</span>`;
}
function metric(label,value,sub="",cls=""){ return `<article class="metric"><label>${label}</label><strong>${value}</strong><small class="${cls}">${sub}</small></article>`; }
function adminDate(value,{withTime=false}={}){
  if(!value||value==="—")return "—";
  const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value);
  return withTime?date.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
}

async function loadBackendLifetimePurchases(){
  const payload=await backendJson("/api/admin/lifetime-purchases");
  LIFETIME_ADMIN={loaded:true,purchases:Array.isArray(payload.purchases)?payload.purchases:[],stories:Array.isArray(payload.stories)?payload.stories:[],summary:payload.summary||{}};
  return LIFETIME_ADMIN;
}
function lifetimeStatusBadge(p){
  if(p.linked&&p.purchaseStatus==="Completed"&&p.entitlementStatus==="Active")return badge("Linked");
  if(!p.linked){
    if(p.productState==="Archived")return badge("Archived");
    if(p.productState==="Unavailable")return badge("Temporarily Unavailable");
    return badge("Needs Assignment");
  }
  return badge(p.entitlementStatus||p.purchaseStatus||"Review");
}
function lifetimeRows(){
  const rows=LIFETIME_ADMIN.purchases||[];
  if(!LIFETIME_ADMIN.loaded)return '<tr><td colspan="6"><div class="empty">Loading lifetime purchases…</div></td></tr>';
  if(!rows.length)return '<tr><td colspan="6"><div class="empty">No lifetime story purchases yet.</div></td></tr>';
  return rows.map(p=>`<tr><td><strong>${esc(p.userName||"Deleted user")}</strong><small style="display:block;color:var(--muted);margin-top:3px">${esc(p.userEmail||"")}</small></td><td><strong>${esc(p.originalTitle||"Purchased story")}</strong><small style="display:block;color:var(--muted);margin-top:3px">Purchased ${esc(adminDate(p.purchasedAt,{withTime:true}))}</small></td><td>${p.currentTitle?`<strong>${esc(p.currentTitle)}</strong><small style="display:block;color:var(--muted);margin-top:3px">${esc(p.currentStoryId||"")}</small>`:'<span class="muted">—</span>'}</td><td><strong>${esc(financeMoney(p.amount,p.currency||"USD"))}</strong></td><td>${lifetimeStatusBadge(p)}</td><td class="right"><button class="secondary small" data-lifetime-view="${esc(p.purchaseId)}">Review</button></td></tr>`).join("");
}
function lifetimeView(){
  const s=LIFETIME_ADMIN.summary||{};
  return `<div class="metrics four">${metric("Purchases",Number(s.purchases||0),"historical records")}${metric("Active access",Number(s.activeEntitlements||0),"lifetime entitlements","ok")}${metric("Needs assignment",Number(s.needsAssignment||0),Number(s.needsAssignment||0)?"manual review needed":"all linked",Number(s.needsAssignment||0)?"warn":"ok")}${metric("Recorded gross",financeMoney(s.grossRecorded||0),"before refunds")}</div>${surf("Purchased story reconciliation","Original purchase snapshots never change. Current assignment can be repaired after story renames, replacements or reimports.",`<div class="toolbar"><div class="search"><span>⌕</span><input id="lifetimeSearch" placeholder="Search user or story"></div><div class="tool-group"><select class="select" id="lifetimeFilter"><option value="all">All purchases</option><option value="linked">Linked</option><option value="needs">Needs Assignment</option><option value="archived">Archived</option><option value="inactive">Inactive entitlement</option></select><button class="secondary" id="reconcileLifetime">Run reconciliation</button><button class="secondary" id="refreshLifetime">Refresh</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>User</th><th>Purchased As</th><th>Current Story</th><th>Paid</th><th>Status</th><th class="right">Action</th></tr></thead><tbody id="lifetimeBody">${lifetimeRows()}</tbody></table></div>`)} `;
}
function filteredLifetimePurchases(){
  const q=(document.querySelector("#lifetimeSearch")?.value||"").trim().toLowerCase(),f=document.querySelector("#lifetimeFilter")?.value||"all";
  return (LIFETIME_ADMIN.purchases||[]).filter(p=>{
    const match=!q||[p.userName,p.userEmail,p.originalTitle,p.currentTitle,p.paypalOrderId,p.paypalCaptureId].some(v=>String(v||"").toLowerCase().includes(q));
    const status=f==="all"||(f==="linked"&&p.linked)||(f==="needs"&&!p.linked&&!['Archived','Unavailable'].includes(String(p.productState||'')))||(f==="archived"&&p.productState==="Archived")||(f==="inactive"&&p.entitlementStatus!=="Active");
    return match&&status;
  });
}
function paintLifetimeRows(){
  const body=document.querySelector("#lifetimeBody");if(!body)return;
  const original=LIFETIME_ADMIN.purchases;LIFETIME_ADMIN.purchases=filteredLifetimePurchases();body.innerHTML=lifetimeRows();LIFETIME_ADMIN.purchases=original;bindLifetimeRowActions();
}
function bindLifetimeRowActions(){ document.querySelectorAll("[data-lifetime-view]").forEach(b=>b.onclick=()=>openLifetimePurchase(b.dataset.lifetimeView)); }
function openLifetimePurchase(id){
  const p=(LIFETIME_ADMIN.purchases||[]).find(x=>String(x.purchaseId)===String(id));if(!p)return;
  const options=(LIFETIME_ADMIN.stories||[]).map(s=>`<option value="${esc(s.id)}" ${s.id===p.currentStoryId?"selected":""}>${esc(s.title)}${s.linkedPurchaseCount>0&&s.linkedProductId!==p.permanentStoryId?` · ${s.linkedPurchaseCount} owner${s.linkedPurchaseCount===1?"":"s"}`:""}</option>`).join("");
  openDrawer(`<span class="drawer-kicker">Lifetime purchase</span><h2 id="drawerTitle">${esc(p.originalTitle||"Purchased story")}</h2><p class="drawer-sub">${esc(p.userName||"Deleted user")} · ${esc(p.userEmail||"")}</p><div class="drawer-section"><h3>Purchase history</h3><div class="detail-grid"><div class="detail"><span>Purchased on</span><strong>${esc(adminDate(p.purchasedAt,{withTime:true}))}</strong></div><div class="detail"><span>Paid</span><strong>${esc(financeMoney(p.amount,p.currency||"USD"))}</strong></div><div class="detail"><span>Original title</span><strong>${esc(p.originalTitle||"—")}</strong></div><div class="detail"><span>Original story ID</span><strong><code>${esc(p.originalStoryId||"—")}</code></strong></div><div class="detail"><span>Original Drive folder</span><strong><code>${esc(p.originalDriveFolderId||"—")}</code></strong></div><div class="detail"><span>PayPal Order</span><strong><code>${esc(p.paypalOrderId||"—")}</code></strong></div><div class="detail"><span>PayPal Capture</span><strong><code>${esc(p.paypalCaptureId||"—")}</code></strong></div><div class="detail"><span>Entitlement</span><strong>${esc(p.entitlementStatus||"—")}</strong></div></div>${p.originalDriveUrl?`<label class="field" style="margin-top:10px"><span>Original Drive URL</span><input value="${esc(p.originalDriveUrl)}" readonly></label>`:""}</div><div class="drawer-section"><h3>Current assignment</h3><div class="detail-grid"><div class="detail"><span>Status</span><strong>${p.linked?"Linked ✓":p.productState==="Archived"?"Archived · purchase protected":p.productState==="Unavailable"?"Temporarily Unavailable":"Needs Assignment"}</strong></div><div class="detail"><span>Current title</span><strong>${esc(p.currentTitle||"—")}</strong></div><div class="detail"><span>Current story ID</span><strong><code>${esc(p.currentStoryId||"—")}</code></strong></div><div class="detail"><span>Permanent ID</span><strong><code>${esc(p.permanentStoryId||"—")}</code></strong></div></div><label class="field" style="margin-top:12px"><span>Assign current story</span><select id="lifetimeAssignStory"><option value="">Choose story…</option>${options}</select><small>A story already owned through another permanent identity will be blocked from reassignment.</small></label><label class="field" style="margin-top:10px"><span>Admin note</span><textarea id="lifetimeAssignNote" rows="2" placeholder="Optional reason for this assignment"></textarea></label><div class="drawer-actions"><button class="primary" id="assignLifetimeStory">Assign Current Story</button><button class="secondary" id="markLifetimeUnavailable">Mark Temporarily Unavailable</button></div></div>`);
  const assign=document.querySelector("#assignLifetimeStory"),unavailable=document.querySelector("#markLifetimeUnavailable");
  if(assign)assign.onclick=async()=>{const storyId=document.querySelector("#lifetimeAssignStory")?.value||"";if(!storyId){toast("Choose a current story first.");return}assign.disabled=true;try{await backendJson("/api/admin/lifetime-purchases/assignment",{method:"PUT",body:JSON.stringify({permanentStoryId:p.permanentStoryId,storyId,action:"assign",note:document.querySelector("#lifetimeAssignNote")?.value||""})});closeDrawer();await loadBackendLifetimePurchases();render("lifetime",{noHash:true,keepScroll:true});toast("Lifetime story assignment updated.")}catch(error){toast(error.message||"Unable to assign story.")}finally{assign.disabled=false}};
  if(unavailable)unavailable.onclick=async()=>{if(!confirm("Mark this purchased story temporarily unavailable? The purchase history remains and the customer will keep seeing the purchase as being updated."))return;unavailable.disabled=true;try{await backendJson("/api/admin/lifetime-purchases/assignment",{method:"PUT",body:JSON.stringify({permanentStoryId:p.permanentStoryId,action:"unavailable",note:document.querySelector("#lifetimeAssignNote")?.value||""})});closeDrawer();await loadBackendLifetimePurchases();render("lifetime",{noHash:true,keepScroll:true});toast("Purchase kept safely; story marked Needs Assignment.")}catch(error){toast(error.message||"Unable to update assignment.")}finally{unavailable.disabled=false}};
}
function bindLifetime(){
  if(!LIFETIME_ADMIN.loaded){loadBackendLifetimePurchases().then(()=>render("lifetime",{noHash:true,keepScroll:true})).catch(error=>toast(error.message||"Unable to load lifetime purchases."));return}
  bindLifetimeRowActions();const search=document.querySelector("#lifetimeSearch"),filter=document.querySelector("#lifetimeFilter"),refresh=document.querySelector("#refreshLifetime"),reconcile=document.querySelector("#reconcileLifetime");
  if(search)search.oninput=paintLifetimeRows;if(filter)filter.onchange=paintLifetimeRows;
  if(refresh)refresh.onclick=async()=>{refresh.disabled=true;try{await loadBackendLifetimePurchases();render("lifetime",{noHash:true,keepScroll:true});toast("Lifetime purchases refreshed.")}catch(error){toast(error.message||"Unable to refresh.")}finally{refresh.disabled=false}};
  if(reconcile)reconcile.onclick=async()=>{reconcile.disabled=true;reconcile.textContent="Reconciling…";try{const r=await backendJson("/api/admin/lifetime-purchases/reconcile",{method:"POST",body:"{}"});await loadBackendLifetimePurchases();render("lifetime",{noHash:true,keepScroll:true});toast(`${r.created||0} created · ${r.relinked||0} relinked · ${r.needsAssignment||0} need assignment.`)}catch(error){toast(error.message||"Reconciliation failed.")}finally{reconcile.disabled=false;reconcile.textContent="Run reconciliation"}};
}

function financeMoney(value,currency="USD"){
  if(value===null||value===undefined||value==="")return "—";
  const n=Number(value);if(!Number.isFinite(n))return "—";
  const abs=Math.abs(n).toFixed(2),sign=n<0?"-":"";
  return currency==="USD"?`${sign}$${abs}`:`${sign}${esc(currency||"USD")} ${abs}`;
}
function financeMonthlyChart(){
  const list=Array.isArray(FINANCE.monthly)?FINANCE.monthly:[];
  if(!list.length)return '<div class="empty">No real payment revenue recorded yet.</div>';
  const max=Math.max(1,...list.map(x=>Number(x.amount)||0));
  return `<div class="chart"><div class="chart-y"><span>${financeMoney(max)}</span><span>${financeMoney(max/2)}</span><span>$0</span></div><div class="bars">${list.map(x=>`<div class="bar-wrap"><div class="bar" style="--bar:${Math.max(2,Math.round((Number(x.amount||0)/max)*100))}%" title="${esc(financeMoney(x.amount,x.currency||'USD'))}"></div><span>${esc(x.label||x.month||"")}</span></div>`).join("")}</div></div>`;
}
async function loadBackendFinance(limit=1200){
  const payload=await backendJson(`/api/admin/finance?limit=${Math.max(1,Math.min(2000,Number(limit)||1200))}`);
  FINANCE={loaded:true,rows:Array.isArray(payload.rows)?payload.rows:[],summary:{grossRevenue:0,refunded:0,successful:0,failed:0,adminGrants:0,activePaidSubscriptions:0,...(payload.summary||{})},monthly:Array.isArray(payload.monthly)?payload.monthly:[]};
  return FINANCE;
}
function financeFilteredRows(){
  const q=$("#financeSearch")?.value.trim().toLowerCase()||"",filter=$("#financeFilter")?.value||"all";
  return (FINANCE.rows||[]).filter(r=>{
    const matchesText=!q||`${r.user||""} ${r.email||""} ${r.type||""} ${r.plan||""} ${r.status||""} ${r.environment||""} ${r.reference||""} ${r.subscriptionId||""} ${r.note||""}`.toLowerCase().includes(q);
    const matchesFilter=filter==="hidden"?Boolean(r.hidden):(!r.hidden&&(filter==="all"||String(r.status||"").toLowerCase()===filter));
    return matchesText&&matchesFilter;
  });
}
function financeRowMarkup(rows){
  if(!rows.length)return '<tr><td colspan="8"><div class="empty">No real payment records match this view.</div></td></tr>';
  return rows.map(r=>`<tr style="${r.hidden?"opacity:.6":""}"><td>${esc(adminDate(r.date,{withTime:true}))}</td><td><strong>${esc(r.user||"Unknown user")}</strong>${r.email?`<small style="display:block;color:var(--muted);margin-top:2px">${esc(r.email)}</small>`:""}</td><td>${esc(r.type||"Payment")}${r.environment?`<small style="display:block;margin-top:5px">${badge(r.environment==="sandbox"?"Sandbox":r.environment==="live"?"Live":r.environment==="admin"?"Admin":"Legacy")}</small>`:""}${r.excludedFromRevenue&&r.status==="Paid"?'<small style="display:block;margin-top:4px;color:var(--muted)">Excluded from revenue</small>':""}</td><td>${esc(r.plan||"—")}</td><td><strong>${esc(financeMoney(r.amount,r.currency||"USD"))}</strong></td><td>${badge(r.status||"Processed")}</td><td><code title="${esc(r.subscriptionId||"")}">${esc(r.reference||r.subscriptionId||"—")}</code>${r.note?`<small style="display:block;color:var(--muted);margin-top:4px">${esc(r.note)}</small>`:""}</td><td><button class="secondary small" data-finance-edit="${esc(r.recordKey||"")}">Edit</button></td></tr>`).join("");
}
function renderFinanceRows(){
  const body=$("#financeBody"),summary=$("#financeSummary");if(!body)return;
  const rows=financeFilteredRows();body.innerHTML=financeRowMarkup(rows);if(summary){const visible=(FINANCE.rows||[]).filter(r=>!r.hidden).length;summary.textContent=`Showing ${rows.length} records · ${visible} visible · ${(FINANCE.rows||[]).length-visible} hidden`}bindFinanceRowActions();
}
function bindFinanceRowActions(){
  $$('[data-finance-edit]').forEach(b=>b.onclick=()=>openFinanceRecordEditor(b.dataset.financeEdit));
}
function openFinanceRecordEditor(recordKey){
  const r=(FINANCE.rows||[]).find(x=>x.recordKey===recordKey);if(!r)return;
  const isGrant=r.environment==="admin"||r.type==="Admin Grant";
  openDrawer(`<span class="drawer-kicker">Finance</span><h2 id="drawerTitle">Edit finance record</h2><p class="drawer-sub">This changes only how Finance classifies/displays the record. It does not delete the PayPal subscription or change the member's access.</p><div class="drawer-section"><div class="detail-grid"><div class="detail"><span>User</span><strong>${esc(r.user||"Unknown")}</strong></div><div class="detail"><span>Type</span><strong>${esc(r.type||"Payment")}</strong></div><div class="detail"><span>Plan</span><strong>${esc(r.plan||"—")}</strong></div><div class="detail"><span>Amount</span><strong>${esc(financeMoney(r.amount,r.currency||"USD"))}</strong></div></div></div><form class="form" id="financeOverrideForm" style="padding:0"><label class="field"><span>Payment environment</span><select id="financeEnvironment" ${isGrant?"disabled":""}><option value="legacy" ${r.environment==="legacy"?"selected":""}>Legacy / unknown</option><option value="sandbox" ${r.environment==="sandbox"?"selected":""}>Sandbox test</option><option value="live" ${r.environment==="live"?"selected":""}>Live payment</option>${isGrant?'<option value="admin" selected>Admin grant</option>':""}</select><small>Sandbox payments stay visible but are automatically excluded from business revenue.</small></label><label class="setting"><span><strong>Count in revenue</strong><small>Turn this off for tests, corrections or records you do not want in revenue totals.</small></span><input class="toggle" id="financeCountRevenue" type="checkbox" ${!r.excludedFromRevenue&&r.environment!=="sandbox"&&r.status==="Paid"?"checked":""} ${r.status!=="Paid"||isGrant?"disabled":""}></label><label class="setting"><span><strong>Hide from Finance ledger</strong><small>Safer than deleting the underlying PayPal/payment record. Hidden records can be restored from the Hidden records filter.</small></span><input class="toggle" id="financeHidden" type="checkbox" ${r.hidden?"checked":""}></label><label class="field"><span>Admin note</span><textarea id="financeNote" rows="3" placeholder="Optional note about this record">${esc(r.note||"")}</textarea></label><div class="form-actions"><button class="primary">Save finance record</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form>`);
  const env=$("#financeEnvironment"),count=$("#financeCountRevenue");
  if(env&&!isGrant)env.onchange=()=>{if(env.value==="sandbox"){count.checked=false;count.disabled=true}else if(r.status==="Paid"){count.disabled=false}};
  const form=$("#financeOverrideForm");if(form)form.onsubmit=async e=>{e.preventDefault();const environment=isGrant?"admin":env.value;try{await backendJson('/api/admin/finance/override',{method:'PUT',body:JSON.stringify({recordKey:r.recordKey,environment,excludeFromRevenue:r.status==="Paid"?!count.checked:true,hidden:$("#financeHidden").checked,note:$("#financeNote").value.trim()})});closeDrawer();await loadBackendFinance(1200);render("finance",{noHash:true,keepScroll:true});toast(environment==="sandbox"?"Saved as Sandbox. Excluded from revenue.":"Finance record updated.")}catch(error){toast(error.message||"Unable to update finance record.")}};
}
function surf(title,sub,body,extra=""){ return `<section class="surface"><div class="surface-head"><div><h2>${title}</h2>${sub?`<p>${sub}</p>`:""}</div>${extra}</div>${body}</section>`; }
function generatedCoverUrl(id){ return `/api/story-cover/${encodeURIComponent(id)}`; }
function nextStoryOrder(){ return stories.reduce((max,story)=>Math.max(max,Number(story.order)||0),0)+1; }
const DRIVE_DUPLICATE_THRESHOLD=.78;
function matchText(value=""){
  return String(value).toLowerCase().replace(/\.[a-z0-9]{2,5}$/i,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(w=>w&&!(["the","a","an","s"].includes(w))).join(" ");
}
function editDistanceRaw(a,b){a=String(a||"");b=String(b||"");if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}return prev[b.length]}
function tokenSimilarity(a,b){a=String(a||"");b=String(b||"");if(!a||!b)return 0;return Math.max(0,1-editDistanceRaw(a,b)/Math.max(a.length,b.length))}
function titleSimilarity(a,b){
  const aa=matchText(a),bb=matchText(b);if(!aa||!bb)return 0;if(aa===bb)return 1;
  const compactA=aa.replace(/\s+/g,""),compactB=bb.replace(/\s+/g,"");
  const charScore=Math.max(0,1-editDistanceRaw(compactA,compactB)/Math.max(1,compactA.length+compactB.length));
  const aw=aa.split(" "),bw=bb.split(" "),used=new Set();let fuzzySum=0;
  for(const word of aw){let best=0,bestIndex=-1;for(let i=0;i<bw.length;i++){if(used.has(i))continue;const score=tokenSimilarity(word,bw[i]);if(score>best){best=score;bestIndex=i}}if(bestIndex>=0&&best>=.5){used.add(bestIndex);fuzzySum+=best}}
  const fuzzyScore=(2*fuzzySum)/Math.max(1,aw.length+bw.length);
  return Math.min(1,.7*charScore+.3*fuzzyScore);
}
function bestStoryMatch(name){let best=null,score=0;for(const story of stories){const s=titleSimilarity(name,story.title);if(s>score){score=s;best=story}}return {story:best,score}}
function extractDriveInputs(text=""){
  const raw=String(text||"");const out=[],seen=new Set();
  const urls=raw.match(/https?:\/\/drive\.google\.com\/[^\s,;]+/gi)||[];
  const tokens=raw.split(/[\s,;]+/).filter(Boolean);
  [...urls,...tokens].forEach(v=>{const cleaned=String(v).replace(/[)\]}>.,]+$/g,"").trim();if(!cleaned)return;if(/drive\.google\.com/i.test(cleaned)||/^[A-Za-z0-9_-]{10,}$/.test(cleaned)){if(!seen.has(cleaned)){seen.add(cleaned);out.push(cleaned)}}});
  return out;
}
function driveFolderId(value=""){
  const text=String(value||"").trim();if(!text)return "";
  let m=text.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/);if(m)return m[1];
  m=text.match(/[?&]id=([A-Za-z0-9_-]{10,})/);if(m)return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text)?text:"";
}
async function analyzeDriveWithProgress(links,onProgress=()=>{},signal=null){
  const ids=[];const seenIds=new Set();for(const link of links){const id=driveFolderId(link);if(id&&!seenIds.has(id)){seenIds.add(id);ids.push(id)}}
  if(!ids.length)throw new Error("Paste at least one valid Google Drive folder link.");
  const result={roots:ids.length,scannedFolders:0,scannedFiles:0,audioProbeFolders:0,ambiguousCount:0,ambiguous:[],elapsedMs:0,rootResults:[],stories:[]};
  const seenStories=new Set(),startedAll=Date.now();
  for(let rootIndex=0;rootIndex<ids.length;rootIndex++){
    if(signal?.aborted)throw new DOMException("Drive scan stopped by Admin.","AbortError");
    const rootId=ids[rootIndex],rootStarted=Date.now(),nodesById=new Map(),visited=new Set();let pending,chunk=0,rootErrors=[];
    try{
      while(true){
        if(signal?.aborted)throw new DOMException("Drive scan stopped by Admin.","AbortError");
        const body={rootId};if(pending!==undefined)body.pending=pending;
        const part=await backendJson("/api/admin/drive/chunk",{method:"POST",body:JSON.stringify(body),signal});chunk++;
        for(const node of Array.isArray(part.nodes)?part.nodes:[]){const id=String(node?.id||"").trim();if(id)nodesById.set(id,{id,name:String(node?.name||"").trim(),parentId:String(node?.parentId||"").trim(),depth:Math.max(0,Number(node?.depth||0)),ownerEmail:String(node?.ownerEmail||"").trim()})}
        for(const id of Array.isArray(part.processedIds)?part.processedIds:[]){const text=String(id||"").trim();if(text)visited.add(text)}
        if(Array.isArray(part.errors))rootErrors.push(...part.errors);
        const next=[],queued=new Set();for(const item of Array.isArray(part.nextPending)?part.nextPending:[]){const id=String(item?.id||item||"").trim();if(!id||visited.has(id)||queued.has(id))continue;queued.add(id);next.push({id,parentId:String(item?.parentId||"").trim(),depth:Math.max(0,Number(item?.depth||0))})}
        onProgress({phase:"chunk",rootIndex:rootIndex+1,totalRoots:ids.length,rootId,chunk,folders:nodesById.size,pending:next.length,elapsedMs:Date.now()-rootStarted});
        if(part.done||next.length===0)break;if(chunk>=200)throw new Error(`Drive root ${rootId} exceeded the 200-chunk safety limit.`);pending=next;
      }
      if(signal?.aborted)throw new DOMException("Drive scan stopped by Admin.","AbortError");
      const payload=await backendJson("/api/admin/drive/classify",{method:"POST",body:JSON.stringify({rootId,nodes:[...nodesById.values()]}),signal});
      const rootElapsed=Date.now()-rootStarted;payload.scannedFolders=nodesById.size;payload.indexedFolders=nodesById.size;payload.traversalChunks=chunk;payload.elapsedMs=rootElapsed;
      result.scannedFolders+=nodesById.size;result.scannedFiles+=Number(payload.checkedFiles??payload.scannedFiles??0);result.audioProbeFolders+=Number(payload.audioProbeFolders||0);
      if(Array.isArray(payload.ambiguous))result.ambiguous.push(...payload.ambiguous);
      const rr=Array.isArray(payload.rootResults)&&payload.rootResults[0]?{...payload.rootResults[0]}:{ok:true,rootFolderId:rootId,rootDriveUrl:`https://drive.google.com/drive/folders/${encodeURIComponent(rootId)}`,storiesFound:Number(payload.count||0),foldersDiscovered:nodesById.size};
      rr.foldersDiscovered=nodesById.size;rr.traversalChunks=chunk;rr.folderReadErrors=rootErrors.length;rr.elapsedMs=rootElapsed;result.rootResults.push(rr);
      const rows=Array.isArray(payload.candidates)?payload.candidates:(Array.isArray(payload.stories)?payload.stories:[]);
      let rootStoryCount=0;for(const item of rows){const folderId=String(item.storyFolderId||item.folderId||"").trim();if(!folderId||seenStories.has(folderId))continue;seenStories.add(folderId);rootStoryCount++;result.stories.push({folderId,title:String(item.title||"Untitled Story").trim()||"Untitled Story",driveUrl:String(item.driveUrl||`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`),rootFolderId:String(item.rootFolderId||rootId).trim(),rootFolderName:String(item.rootFolderName||"").trim(),rootDriveUrl:String(item.rootDriveUrl||`https://drive.google.com/drive/folders/${encodeURIComponent(rootId)}`).trim(),rootOwnerEmail:String(item.rootOwnerEmail||"").trim(),folderPath:String(item.folderPath||"").trim(),audioFiles:Number.isFinite(Number(item.audioFiles))?Number(item.audioFiles):null,depth:Number(item.depth||0),detection:String(item.detection||"").trim()})}
      onProgress({phase:"done",rootIndex:rootIndex+1,totalRoots:ids.length,rootId,chunk,folders:nodesById.size,pending:0,stories:Number(payload.count||rows.length||rootStoryCount),elapsedMs:rootElapsed,rootResult:rr});
    }catch(error){if(signal?.aborted||error?.name==="AbortError")throw new DOMException("Drive scan stopped by Admin.","AbortError");const rootElapsed=Date.now()-rootStarted;const rr={ok:false,rootFolderId:rootId,rootDriveUrl:`https://drive.google.com/drive/folders/${encodeURIComponent(rootId)}`,error:String(error?.message||error||"Drive scan failed"),elapsedMs:rootElapsed};result.rootResults.push(rr);onProgress({phase:"error",rootIndex:rootIndex+1,totalRoots:ids.length,rootId,chunk,folders:nodesById.size,pending:pending?.length||0,elapsedMs:rootElapsed,error:rr.error})}
  }
  result.elapsedMs=Date.now()-startedAll;result.ambiguousCount=result.ambiguous.length;result.stories.sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:"base"}));return result;
}

const COVER_AUTO_MATCH_THRESHOLD=.82;
const COVER_STRONG_FILENAME_THRESHOLD=.92;
let coverOcrLibraryPromise=null;
function loadCoverOcrLibrary(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(coverOcrLibraryPromise)return coverOcrLibraryPromise;
  coverOcrLibraryPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/tesseract.min.js";script.async=true;script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error("Image-text reader did not initialize."));script.onerror=()=>reject(new Error("Image-text reader could not load. Filename matching will still work."));document.head.appendChild(script)});return coverOcrLibraryPromise;
}
function ocrTitleScore(text,title){
  const body=matchText(text),target=matchText(title);if(!body||!target)return 0;if(body.includes(target))return 1;
  const words=body.split(" "),tw=target.split(" ");let windowBest=0;for(let size=Math.max(1,tw.length-1);size<=Math.min(words.length,tw.length+2);size++)for(let i=0;i+size<=words.length;i++)windowBest=Math.max(windowBest,titleSimilarity(words.slice(i,i+size).join(" "),target));
  let sum=0;for(const w of tw){let best=0;for(const ow of words)best=Math.max(best,tokenSimilarity(w,ow));sum+=best}const coverage=sum/Math.max(1,tw.length);return Math.min(1,Math.max(windowBest,coverage*.92));
}
function bestStoryMatchFromImageText(text){let best=null,score=0;for(const story of stories){const s=ocrTitleScore(text,story.title);if(s>score){score=s;best=story}}return {story:best,score}}
async function readCoverImageText(file,worker){
  if("TextDetector" in window){try{const bitmap=await createImageBitmap(file),detector=new TextDetector(),blocks=await detector.detect(bitmap);bitmap.close?.();const text=(blocks||[]).map(x=>x.rawValue||"").join(" ").trim();if(text)return text}catch{}}
  if(!worker)return "";try{const out=await worker.recognize(file);return String(out?.data?.text||"").trim()}catch{return ""}
}

function driveLink(url,label){return url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:esc(label)}
function driveSourceLine(item,label="Scanned source"){
  const rootLabel=item.rootFolderName||"Drive root",owner=item.rootOwnerEmail||item.driveRootOwnerEmail||"Owner email unavailable",rootUrl=item.rootDriveUrl||item.driveRootUrl||"";
  const path=item.folderPath||item.drivePath||"";
  return `<small style="display:block;margin-top:5px"><strong>${esc(label)}:</strong> ${driveLink(rootUrl,rootLabel)} · ${esc(owner)}</small>${path?`<small style="display:block;margin-top:3px"><strong>Path:</strong> ${esc(path)}</small>`:""}`;
}
function coverDropMarkup(prefix,current=""){
  const preview=current?`<img id="${prefix}CoverPreview" src="${esc(current)}" alt="Cover preview">`:`<div id="${prefix}CoverPreview" class="cover-preview-empty">.svg</div>`;
  return `<div class="story-cover-picker"><label class="story-cover-drop" id="${prefix}CoverDrop"><input id="${prefix}CoverFile" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"><span class="story-cover-drop-icon">⇧</span><strong>Drop cover image here</strong><small>or tap to choose · image opens in crop / zoom editor before saving</small></label><div class="story-cover-preview">${preview}<div class="cover-preview-actions"><button class="secondary small" type="button" id="${prefix}AdjustCover">Adjust / zoom</button><button class="text-btn" type="button" id="${prefix}ReplaceCover">Replace</button></div></div></div>`;
}
function bindStoryCoverPicker(prefix){
  const input=$(`#${prefix}CoverFile`),drop=$(`#${prefix}CoverDrop`);
  if(!input||!drop)return;
  const setPreview=blob=>{
    input._coverFile=blob;
    const url=URL.createObjectURL(blob);let preview=$(`#${prefix}CoverPreview`);
    if(preview?.tagName==="IMG")preview.src=url;else if(preview){const img=document.createElement("img");img.id=`${prefix}CoverPreview`;img.alt="Cover preview";img.src=url;preview.replaceWith(img)}
    drop.classList.add("has-file");
  };
  const editFile=async file=>{
    if(!file)return;
    if(!/^image\/(jpeg|jpg|png|webp|avif)$/i.test(file.type)){toast("Use a JPG, PNG, WEBP or AVIF cover image.");return}
    if(file.size>15000000){toast("Cover image is too large. Choose an image under 15 MB.");return}
    try{const adjusted=await adjustImage(file,{title:"Adjust story cover",width:800,height:1000});if(adjusted)setPreview(adjusted)}catch(error){toast(error.message)}
  };
  input.onchange=()=>editFile(input.files?.[0]);
  ["dragenter","dragover"].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add("dragover")}));
  ["dragleave","drop"].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove("dragover")}));
  drop.addEventListener("drop",event=>editFile(event.dataTransfer?.files?.[0]));
  const replace=$(`#${prefix}ReplaceCover`);if(replace)replace.onclick=async()=>{const file=await pickImageFile();if(file)editFile(file)};
  const adjust=$(`#${prefix}AdjustCover`);if(adjust)adjust.onclick=async()=>{
    const pending=input._coverFile;
    const current=pending||$(`#${prefix}CoverPreview`)?.getAttribute("src");
    if(!current||String(current).startsWith("blob:")&&!pending){toast("Choose a cover image first.");return}
    try{const edited=await adjustImage(current,{title:"Adjust story cover",width:800,height:1000});if(edited)setPreview(edited)}catch(error){toast(error.message)}
  };
}
async function optimizeCoverFile(file){
  if(!file)return null;
  const maxBytes=1150000;
  if(file.size<=maxBytes&&file.type!=="image/png"&&file.type!=="image/jpg")return file;
  if(!("createImageBitmap" in window)){if(file.size>maxBytes)throw new Error("This cover is too large for temporary D1 cover storage. Choose a smaller image.");return file}
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,800/bitmap.width,1000/bitmap.height);
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext("2d");context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const makeBlob=quality=>new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
  let blob=await makeBlob(.78);if(blob&&blob.size>maxBytes)blob=await makeBlob(.64);if(blob&&blob.size>maxBytes)blob=await makeBlob(.52);
  if(!blob||blob.size>maxBytes)throw new Error("The site could not shrink this cover enough. Choose a smaller image.");
  return blob;
}
async function uploadCoverFile(storyId,file){
  const id=String(storyId||"").trim();
  if(!id||!stories.some(story=>story.id===id))throw new Error("A selected cover has no valid story match. Set it to Do not apply and try again.");
  if(!file)return generatedCoverUrl(id);
  const optimized=await optimizeCoverFile(file);
  const response=await fetch(`/api/story-cover/${encodeURIComponent(id)}`,{method:"POST",credentials:"same-origin",headers:{"content-type":optimized.type||"image/webp"},body:optimized});
  let payload={};try{payload=await response.json()}catch{}
  if(!response.ok)throw new Error(payload.error||"Unable to upload cover image.");
  return `${payload.cover||generatedCoverUrl(id)}?v=${Date.now()}`;
}
async function resetUploadedCover(storyId){
  const response=await fetch(`/api/story-cover/${encodeURIComponent(storyId)}`,{method:"DELETE",credentials:"same-origin"});
  if(!response.ok)throw new Error("Unable to reset cover image.");
  return generatedCoverUrl(storyId);
}


async function uploadMediaFile(key,file){
  const optimized=await optimizeCoverFile(file);
  const response=await fetch(`/api/admin/media/${encodeURIComponent(key)}`,{method:"POST",credentials:"same-origin",headers:{"content-type":optimized.type||"image/webp"},body:optimized});
  let payload={};try{payload=await response.json()}catch{}
  if(!response.ok)throw new Error(payload.error||"Unable to upload image.");
  return `${payload.url||`/api/media/${encodeURIComponent(key)}`}?v=${Date.now()}`;
}
async function resetMediaFile(key){
  const response=await fetch(`/api/admin/media/${encodeURIComponent(key)}`,{method:"DELETE",credentials:"same-origin"});
  if(!response.ok)throw new Error("Unable to remove image.");
}

async function blobFromSource(source){
  if(source instanceof Blob)return source;
  const response=await fetch(String(source),{cache:"no-store",credentials:"same-origin"});
  if(!response.ok)throw new Error("Unable to load the current image for editing.");
  return response.blob();
}

async function adjustImage(source,{title="Adjust image",width=800,height=1000}={}){
  const blob=await blobFromSource(source);
  const bitmap=await createImageBitmap(blob);
  return new Promise((resolve,reject)=>{
    const layer=document.createElement("div");
    layer.className="image-editor-layer";
    layer.innerHTML=`<div class="image-editor-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="image-editor-head"><div><strong>${esc(title)}</strong><small>Drag the image to reposition it. Use − / + or the slider to zoom.</small></div><button type="button" class="image-editor-close" aria-label="Cancel">×</button></div><div class="image-editor-stage"><canvas width="${width}" height="${height}"></canvas></div><div class="image-editor-controls"><button type="button" data-zoom="out">−</button><input type="range" min="1" max="3" value="1" step="0.01" aria-label="Image zoom"><button type="button" data-zoom="in">＋</button><button type="button" class="secondary small" data-center>Center</button></div><div class="image-editor-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button type="button" class="primary" data-save>Use image</button></div></div>`;
    const previousBodyOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    document.body.appendChild(layer);
    const canvas=$("canvas",layer),ctx=canvas.getContext("2d"),range=$("input[type=range]",layer);
    let zoom=1,panX=0,panY=0,drag=null;
    const clamp=()=>{
      const base=Math.max(width/bitmap.width,height/bitmap.height),sw=bitmap.width*base*zoom,sh=bitmap.height*base*zoom;
      const mx=Math.max(0,(sw-width)/2),my=Math.max(0,(sh-height)/2);
      panX=Math.max(-mx,Math.min(mx,panX));panY=Math.max(-my,Math.min(my,panY));
    };
    const draw=()=>{
      clamp();ctx.clearRect(0,0,width,height);ctx.fillStyle="#eef2f3";ctx.fillRect(0,0,width,height);
      const base=Math.max(width/bitmap.width,height/bitmap.height),sw=bitmap.width*base*zoom,sh=bitmap.height*base*zoom;
      ctx.drawImage(bitmap,(width-sw)/2+panX,(height-sh)/2+panY,sw,sh);
    };
    draw();
    const setZoom=v=>{zoom=Math.max(1,Math.min(3,Number(v)||1));range.value=String(zoom);draw()};
    range.oninput=()=>setZoom(range.value);
    $("[data-zoom=out]",layer).onclick=()=>setZoom(zoom-.12);
    $("[data-zoom=in]",layer).onclick=()=>setZoom(zoom+.12);
    $("[data-center]",layer).onclick=()=>{panX=0;panY=0;setZoom(1)};
    canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,px:panX,py:panY};canvas.setPointerCapture(e.pointerId)};
    canvas.onpointermove=e=>{if(!drag)return;const r=canvas.getBoundingClientRect();panX=drag.px+(e.clientX-drag.x)*(width/r.width);panY=drag.py+(e.clientY-drag.y)*(height/r.height);draw()};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=null};
    const finish=value=>{bitmap.close?.();layer.remove();document.body.style.overflow=previousBodyOverflow;value instanceof Error?reject(value):resolve(value)};
    $(".image-editor-close",layer).onclick=()=>finish(null);$("[data-cancel]",layer).onclick=()=>finish(null);
    $("[data-save]",layer).onclick=()=>canvas.toBlob(out=>out?finish(out):finish(new Error("Unable to prepare the adjusted image.")),"image/webp",.84);
  });
}

function pickImageFile({accept="image/jpeg,image/png,image/webp,image/avif"}={}){
  return new Promise(resolve=>{const input=document.createElement("input");input.type="file";input.accept=accept;input.onchange=()=>resolve(input.files?.[0]||null);input.click()});
}
async function chooseAdjustedImage(options){
  const file=await pickImageFile();if(!file)return null;
  if(file.size>15000000)throw new Error("Choose an image under 15 MB.");
  return adjustImage(file,options);
}

function updateCounts(){
  const sc=$("#storyNavCount"); if(sc) sc.textContent=stories.length;
  const pc=$("#postsNavCount"); if(pc) pc.textContent=POSTS_ADMIN.posts.length;
  const uc=$("#userNavCount"); if(uc) uc.textContent=USERS.length;
  const nc=$("#notificationCount"); if(nc){ const n=NOTICES.filter(x=>x.unread).length; nc.textContent=n; nc.classList.toggle("hidden",n===0); }
  const cc=$("#chatCount"); if(cc){ const n=unreadChats(); cc.textContent=n; cc.classList.toggle("hidden",n===0); }
  const dot=$("#checkNavDot"); if(dot) dot.classList.toggle("hidden",reviewCount()===0);
}

function dashboard(){
  const visible=stories.filter(s=>s.visible).length, hidden=stories.length-visible, chats=unreadChats(), reviews=reviewCount();
  const feed=ACT.slice(0,5).map(a=>`<div class="feed-row"><i>${a.icon}</i><span><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></span><time>${esc(a.time)}</time></div>`).join("");
  const revenueSub=FINANCE.loaded?`${Number(FINANCE.summary.successful||0)} successful payments`:"Loading real finance…";
  return `<div class="metrics five">${metric("Active members",activeUsers(),"Real D1 accounts","ok")}${metric("Recorded revenue",formatMoney(grossRevenue()),revenueSub,"ok")}${metric("Audio stories",stories.length,`${visible} visible · ${hidden} hidden`)}${metric("Unread chats",chats,chats?"Needs attention":"All read",chats?"warn":"ok")}${metric("Story checks",reviews,reviews?"Need review":"Clear",reviews?"warn":"ok")}</div>
  <div class="grid-2"><div>${surf("Revenue overview","Real recorded PayPal payments",financeMonthlyChart(),`<button class="text-btn" data-go="finance">View finance</button>`)}${surf("Recent activity","Latest recorded D1 actions",`<div class="feed">${feed||'<div class="empty">No activity yet.</div>'}</div>`,`<button class="text-btn" data-go="activity">View all</button>`)}</div>
  <div>${surf("Needs attention","Items to review",`<div class="attention"><button data-go="chat"><span class="att-icon">✉</span><span><strong>${chats} unread chat${chats===1?"":"s"}</strong><small>${chats?"Open Chat to read them":"Nothing waiting"}</small></span><span>›</span></button><button data-go="checks"><span class="att-icon warn">!</span><span><strong>${reviews} stor${reviews===1?"y":"ies"} need details</strong><small>${reviews?"Genre or description is missing":"All story details are ready"}</small></span><span>›</span></button><button data-go="payments"><span class="att-icon gray">◈</span><span><strong>PayPal membership billing</strong><small>${FINANCE.loaded?`${Number(FINANCE.summary.activePaidSubscriptions||0)} active paid subscriptions`:"Open Payment Methods to configure"}</small></span><span>›</span></button></div>`)}${surf("Quick actions","Common admin tasks",`<div class="quick-grid"><button data-go="add"><i>＋</i><strong>Add story</strong><small>Manual or Drive import</small></button><button data-user="${USERS[0]?.id||""}"><i>♙</i><strong>Manage member</strong><small>Frontend status actions</small></button><button data-go="membership"><i>◆</i><strong>Edit membership</strong><small>Tiers and benefits</small></button><button data-go="backup"><i>⇩</i><strong>Create backup</strong><small>Export current state</small></button></div>`)}</div></div>`;
}

function assetPreviewStyle(url=""){return url?`style="background-image:url('${esc(url)}');background-size:cover;background-position:center"`:""}
function appearance(){
  return `<div class="appearance-grid"><section class="surface"><div class="surface-head"><div><h2>Brand identity</h2><p>Saved to this site copy. Public branding and uploaded images now read from the backend.</p></div><span class="badge ok">D1 connected</span></div>
  <form class="form" id="appearanceForm"><div class="form-row two"><label class="field"><span>Site name</span><input id="siteName" value="${esc(APPEARANCE.name)}"></label><label class="field"><span>Handle</span><input id="siteHandle" value="${esc(APPEARANCE.handle)}"></label></div><label class="field"><span>Profile description</span><textarea id="siteDescription" rows="3">${esc(APPEARANCE.description)}</textarea></label>
  <div class="asset-grid">
    <div class="asset"><span>Logo</span><div class="asset-preview logo ${APPEARANCE.logo?'has-image':''}" ${assetPreviewStyle(APPEARANCE.logo)}>${APPEARANCE.logo?"":""}</div><div class="asset-actions"><button class="secondary small" type="button" data-asset-replace="logo">Replace</button><button class="secondary small" type="button" data-asset-adjust="logo" ${APPEARANCE.logo?'':'disabled'}>Adjust</button><button class="text-btn" type="button" data-asset-reset="logo">Reset</button></div></div>
    <div class="asset"><span>Profile picture</span><div class="asset-preview avatar ${APPEARANCE.profileImage?'has-image':''}" ${assetPreviewStyle(APPEARANCE.profileImage)}>${APPEARANCE.profileImage?"":""}</div><div class="asset-actions"><button class="secondary small" type="button" data-asset-replace="profile">Replace</button><button class="secondary small" type="button" data-asset-adjust="profile" ${APPEARANCE.profileImage?'':'disabled'}>Adjust</button><button class="text-btn" type="button" data-asset-reset="profile">Reset</button></div></div>
    <div class="asset wide"><span>Banner / cover</span><div class="asset-preview banner ${APPEARANCE.bannerImage?'has-image':''}" ${assetPreviewStyle(APPEARANCE.bannerImage)}></div><div class="asset-actions"><button class="secondary small" type="button" data-asset-replace="banner">Replace</button><button class="secondary small" type="button" data-asset-adjust="banner" ${APPEARANCE.bannerImage?'':'disabled'}>Adjust</button><button class="text-btn" type="button" data-asset-reset="banner">Reset</button></div></div>
  </div>
  <div class="form-row two"><label class="field"><span>Accent color</span><div class="color-field"><input id="accentColor" type="color" value="${esc(APPEARANCE.accent)}"><input id="accentText" value="${esc(APPEARANCE.accent)}"></div></label><label class="field"><span>Profile layout</span><select id="profileLayout"><option ${APPEARANCE.layout==="Integrated banner"?"selected":""}>Integrated banner</option><option ${APPEARANCE.layout==="Compact profile"?"selected":""}>Compact profile</option></select></label></div><div class="form-actions"><button class="primary">Save appearance</button><button class="secondary" id="resetAppearance" type="button">Reset to defaults</button></div></form></section>
  <aside class="surface preview-card"><div class="surface-head"><div><h2>Live preview</h2><p>Public profile preview</p></div><div class="segmented"><button class="active" data-preview="phone">Phone</button><button data-preview="desktop">Desktop</button></div></div><div class="site-preview" id="sitePreview"><div class="preview-top"><span class="preview-logo ${APPEARANCE.logo?'has-image':''}" style="background-color:${esc(APPEARANCE.accent)};${APPEARANCE.logo?`background-image:url('${esc(APPEARANCE.logo)}');background-size:cover;background-position:center;`:''}">${APPEARANCE.logo?'':''}</span><span class="preview-menu">☰</span></div><div class="preview-banner" ${assetPreviewStyle(APPEARANCE.bannerImage)}></div><div class="preview-profile"><div class="preview-avatar" style="background:${esc(APPEARANCE.accent)};${(APPEARANCE.profileImage||APPEARANCE.logo)?`background-image:url('${esc(APPEARANCE.profileImage||APPEARANCE.logo)}');background-size:cover;background-position:center;`:''}"></div><div class="preview-profile-actions"><b>Support</b><b>•••</b></div><strong id="pName">${esc(APPEARANCE.name)}</strong><small id="pHandle">${esc(APPEARANCE.handle)}</small><p id="pDesc">${esc(APPEARANCE.description)}</p></div><div class="preview-tabs"><strong>Stories</strong><span>Membership</span><span>⌕</span></div><div class="preview-section"><strong>Audio Stories</strong><small>${stories.length} stories</small></div><div class="preview-covers"><i></i><i></i><i></i><i></i></div></div></aside></div>`;
}
function settings(){
  const opt=(v,c)=>`<option ${v===c?"selected":""}>${esc(v)}</option>`;
  return `${surf("General settings","Saved to this site copy’s D1 backend. Public behavior updates after refresh.",`<form class="form" id="settingsForm"><div class="form-row three"><label class="field"><span>Site language</span><select id="settingLanguage">${["English","Telugu","Hindi"].map(v=>opt(v,SETTINGS.language)).join("")}</select></label><label class="field"><span>Timezone</span><select id="settingTimezone">${["Asia/Kolkata (IST)","UTC","America/New_York"].map(v=>opt(v,SETTINGS.timezone)).join("")}</select></label><label class="field"><span>Currency</span><select id="settingCurrency">${["USD — US Dollar","INR — Indian Rupee","GBP — Pound Sterling"].map(v=>opt(v,SETTINGS.currency)).join("")}</select></label></div><div class="form-row two"><label class="field"><span>Contact / support email</span><input id="settingSupportEmail" type="email" value="${esc(SETTINGS.supportEmail)}" placeholder="you@example.com"><small>Optional. If set, a Contact action appears in the public account menu.</small></label><label class="field"><span>Public support label</span><input id="settingSupportLabel" value="${esc(SETTINGS.supportLabel)}"></label></div><div class="setting-list"><label class="setting"><span><strong>Show search</strong><small>Allow visitors to search the story library.</small></span><input class="toggle" id="settingSearch" type="checkbox" ${SETTINGS.showSearch?"checked":""}></label><label class="setting"><span><strong>Show member chat</strong><small>Display Chat for active members.</small></span><input class="toggle" id="settingChat" type="checkbox" ${SETTINGS.showChat?"checked":""}></label><label class="setting"><span><strong>Show Support action</strong><small>Visible only to active members.</small></span><input class="toggle" id="settingSupport" type="checkbox" ${SETTINGS.showSupport?"checked":""}></label><label class="setting"><span><strong>Prevent casual text selection</strong><small>Preserve the app-like public browsing behavior.</small></span><input class="toggle" id="settingSelection" type="checkbox" ${SETTINGS.preventSelection?"checked":""}></label></div><div class="form-actions"><button class="primary">Save settings</button></div></form>`)}${surf("Local member preview","Developer-only guest vs active-member testing on localhost",`<div class="form"><label class="setting"><span><strong>Active member preview</strong><small>This is not a production membership system.</small></span><input class="toggle" id="demoMember" type="checkbox"></label></div>`,`<span class="badge" id="demoStatus">Checking…</span>`)}`;
}

function storyRows(list){
  return list.map(s=>`<tr><td><input type="checkbox" data-select-story="${s.id}"></td><td><div class="story-cell"><img src="${esc(s.cover)}" alt=""><span><strong>${esc(s.title)}</strong><small>#${s.order} · ${esc(s.id)}</small></span></div></td><td>${esc(s.genre||"Unverified")}</td><td>${badge(s.visible?"Visible":"Hidden")}</td><td class="right"><span class="actions"><button class="action-btn" data-edit-story="${s.id}" title="Edit">✎</button><button class="action-btn" data-toggle-story="${s.id}" title="Toggle visibility">${s.visible?"◉":"○"}</button><button class="action-btn" data-story-more="${s.id}">⋯</button></span></td></tr>`).join("");
}
function storiesView(){
  return `<section class="surface"><div class="toolbar"><div class="search"><span>⌕</span><input id="storySearch" placeholder="Search title or genre"></div><div class="tool-group"><select class="select" id="storyVisibility"><option value="all">All visibility</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select><button class="secondary" data-go="checks">AI genre + description</button><button class="primary" data-go="add">＋ Add story</button></div></div><div class="bulk hidden" id="bulk"><strong><span id="bulkCount">0</span> selected</strong><span></span><button class="secondary small" data-bulk="show">Show</button><button class="secondary small" data-bulk="hide">Hide</button><button class="secondary small danger" data-bulk="delete">Delete</button></div><div class="table-wrap"><table class="table"><thead><tr><th><input id="selectAll" type="checkbox"></th><th>Story</th><th>Genre</th><th>Visibility</th><th class="right">Actions</th></tr></thead><tbody id="storyBody">${storyRows(stories)}</tbody></table></div><div class="table-foot"><span id="storySummary">Showing ${stories.length} stories</span><div class="pages"><button disabled>‹</button><button class="active">1</button><button disabled>›</button></div></div></section>`;
}
function manualAdd(){
  const nextOrder=nextStoryOrder();
  return `<div class="grid-equal"><section class="surface"><div class="surface-head"><div><h2>Add one story</h2><p>Create a single story record. The site only needs the title, genre, description and private Drive folder.</p></div></div><form class="form" id="manualForm"><label class="field"><span>Story title *</span><input id="mTitle" required placeholder="Example: Wolves of Blood Moon"></label><label class="field"><span>Genre</span><input id="mGenre" placeholder="Romance, Fantasy, Drama..."></label><label class="field"><span>Description</span><textarea id="mDescription" rows="4" placeholder="Short public description"></textarea></label><label class="field"><span>Google Drive story folder *</span><input id="mDrive" required placeholder="https://drive.google.com/drive/folders/..."></label><label class="field"><span>Cover image URL/path</span><input id="mCover" placeholder="Auto-generated .svg cover if left empty"><small>Leave this empty or drop an image below. New stories never reuse another story’s cover.</small></label>${coverDropMarkup("m")}<label class="field"><span>Display order</span><input id="mOrder" type="number" value="${nextOrder}" min="1"><small>Automatically continues after the current last story.</small></label><label class="setting"><span><strong>Visible in public library</strong><small>You can hide it later from Story Library.</small></span><input class="toggle" id="mVisible" type="checkbox" checked></label><div class="form-actions"><button class="primary">Save story</button></div></form></section><aside class="surface helper"><i>＋</i><h3>Manual story workflow</h3><ol><li>Add the story title.</li><li>Add genre and a short description now or fill them later with Story Details AI.</li><li>Paste the private Drive folder.</li><li>Drop a cover, paste a cover path, or let the site generate a unique SVG.</li></ol><div class="callout">Private Drive URLs remain Admin-only. Public story details are title, genre, description and cover.</div></aside></div>`;
}
function driveAdd(){
  return `${surf("Drive Import","Paste one or more Drive folder links. This site scans them through your free Google Apps Script Drive scanner; very large roots are split into reliable chunks automatically.",`<div class="import-grid"><div><label class="field"><span>Google Drive folders</span><textarea id="driveLinks" rows="8" placeholder="Paste one Drive folder URL per line"></textarea><small>The Apps Script runs as your Google account, so it can scan folders that account can access. Drive/source links stay Admin-only.</small></label><div class="form-actions" style="margin-top:10px"><button class="primary" type="button" id="analyzeDrive">Scan Drive folders</button><button class="secondary" type="button" id="driveConnectionInfo">Connection status</button></div><div id="driveLiveProgress" class="hidden" style="margin-top:14px;padding:14px;border:1px solid #dbe4e6;border-radius:12px;background:#f7fafb"><strong style="display:block;margin-bottom:8px">Live Drive scan progress</strong><div id="driveLiveProgressLines" style="display:grid;gap:9px;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:normal"></div></div></div><div class="rules"><h3>Import rules</h3>${[[1,"Discover","Recursively scan folders and detect story folders without opening every audio file."],[2,"Compare","Find exact and fuzzy title duplicates."],[3,"Review","Keep Existing, Use New or Keep Both."],[4,"Import","Approved records enter the D1 Story Library with unique SVG covers."]].map(x=>`<div class="rule"><span>${x[0]}</span><p><strong>${x[1]}</strong><small>${x[2]}</small></p></div>`).join("")}</div></div>`,`<span class="badge ok">Backend scan</span>`)}<section class="surface hidden" id="driveResults"><div class="surface-head"><div><h2>Drive scan results</h2><p id="driveResultText">Review the discovered stories before importing.</p></div><span class="badge" id="driveDuplicateBadge">0 duplicates</span></div><div class="import-summary" id="driveSummary"></div><div class="duplicates" id="dupes"></div><div class="form-actions" style="justify-content:flex-end;padding:14px 18px"><button class="primary" type="button" id="confirmImport">Import approved stories</button></div></section>`;
}
function coversAdd(){ return surf("Cover matching","Choose individual cover images or a whole local cover folder. The matcher uses strong filename matches first, then reads title text from uncertain cover images before asking you to review.",`<div class="cover-source-grid"><label class="upload"><input id="coverFiles" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple><i>⇧</i><strong>Choose cover images</strong><small>PNG, JPG, WEBP, AVIF · select multiple files</small></label><label class="upload"><input id="coverFolder" type="file" accept="image/jpeg,image/png,image/webp,image/avif" webkitdirectory directory multiple><i>▤</i><strong>Choose cover folder</strong><small>The matcher checks filenames and, when needed, title text visible inside the image</small></label></div><div id="coverProcessingStatus" class="hidden" style="margin-top:12px;padding:12px 14px;border:1px solid #dbe4e6;border-radius:12px;background:#f7fafb"><strong id="coverProcessingTitle">Preparing cover matches…</strong><small id="coverProcessingText" style="display:block;margin-top:4px">Apply unlocks only after filename/image-title matching is finished.</small></div><div class="cover-grid hidden" id="coverMatches"></div><div class="form-actions hidden" id="coverMatchActions" style="justify-content:flex-end;margin-top:12px"><button class="secondary" type="button" id="clearCoverMatches">Clear</button><button class="primary" type="button" id="applyCoverMatches">Apply matched covers</button></div>`,`<span class="badge ok">Real upload</span>`); }
function addView(){ return `<div class="tabs"><button class="active" data-add-tab="manual">Manual</button><button data-add-tab="drive">Drive Import</button><button data-add-tab="covers">Covers</button></div><div id="addPanel">${manualAdd()}</div>`; }

function checksView(){
  const rows=stories.map(s=>`<tr><td><div class="story-cell"><img src="${esc(s.cover)}" alt=""><span><strong>${esc(s.title)}</strong><small>${s.lock?"AI updates locked":"Included in AI prompt"}</small></span></div></td><td>${esc(s.genre||"Unverified")}</td><td><small>${esc(s.description||"No description yet")}</small></td><td class="right"><button class="secondary small" data-review="${s.id}">Review</button></td></tr>`).join("");
  return `<div class="metrics three">${metric("Audio stories",stories.length,"Current Story Library")}${metric("With genre",stories.filter(s=>s.genre&&!["Unknown","Unverified"].includes(s.genre)).length,`of ${stories.length} stories`)}${metric("With description",stories.filter(s=>String(s.description||"").trim()).length,`of ${stories.length} stories`)}</div><section class="surface"><div class="surface-head"><div><h2>AI Story Details</h2><p>Creates one fast prompt for every unlocked Story Library title. The AI only returns genre and a short description.</p></div><div class="tool-group"><button class="primary" id="manualAI">Check stories</button></div></div><div class="checker-note"><i>i</i><p><strong>Fast Pocket FM lookup.</strong> The prompt asks for the Pocket FM English genre and a short description. Only genre and one short description are requested; the lookup is intentionally lightweight.</p></div><div class="table-wrap"><table class="table"><thead><tr><th>Story</th><th>Genre</th><th>Description</th><th class="right">Action</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}


function adminPostDate(value){
  const d=new Date(value||"");if(Number.isNaN(d.getTime()))return "—";
  return d.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function adminPostPreview(value="",limit=330){
  const text=String(value||"").trim();return text.length>limit?`${text.slice(0,limit).trim()}…`:text;
}
function adminPostsRows(){
  if(!POSTS_ADMIN.loaded&&POSTS_ADMIN.loading)return '<div class="admin-post-empty"><strong>Loading posts…</strong><span>Reading the Posts database.</span></div>';
  if(!POSTS_ADMIN.posts.length)return '<div class="admin-post-empty"><strong>No posts yet</strong><span>Create your first public announcement.</span></div>';
  return POSTS_ADMIN.posts.map(post=>`<article class="admin-post-card ${post.pinned?"is-pinned":""}">
    <div class="admin-post-card-head">
      <div><h3>${esc(post.title)}</h3><small>${post.status==="Published"?"Published":"Draft"} · ${esc(adminPostDate(post.publishedAt||post.updatedAt||post.createdAt))}</small></div>
      <div class="admin-post-card-badges">${badge(post.status)}${post.pinned?'<span class="badge accent">Pinned</span>':""}</div>
    </div>
    <p class="admin-post-card-copy">${esc(adminPostPreview(post.body))}</p>
    <div class="admin-post-card-actions">
      <button class="secondary small" type="button" data-edit-post="${esc(post.id)}">Edit</button>
      <button class="secondary small" type="button" data-pin-post="${esc(post.id)}">${post.pinned?"Unpin":"Pin"}</button>
      <button class="secondary small" type="button" data-publish-post="${esc(post.id)}">${post.status==="Published"?"Move to Draft":"Publish"}</button>
      <button class="text-btn danger" type="button" data-delete-post="${esc(post.id)}">Delete</button>
    </div>
  </article>`).join("");
}
function postsView(){
  const published=POSTS_ADMIN.posts.filter(p=>p.status==="Published").length;
  const drafts=POSTS_ADMIN.posts.filter(p=>p.status==="Draft").length;
  const pinned=POSTS_ADMIN.posts.filter(p=>p.pinned).length;
  return `<div class="metrics three">${metric("Published",published,"Visible to everyone","ok")}${metric("Drafts",drafts,"Admin only")}${metric("Pinned",pinned,"Shown first")}</div>
  <section class="surface">
    <div class="surface-head"><div><h2>Public Posts</h2><p>Announcements, story updates and important notices. Published posts are visible to guests and logged-in users.</p></div><div class="actions"><button class="secondary small" id="refreshPosts" type="button">Refresh</button><button class="primary" id="addPost" type="button">＋ New post</button></div></div>
    <div class="admin-posts-grid" id="adminPostsList">${adminPostsRows()}</div>
  </section>`;
}
async function loadAdminPosts({rerender=true}={}){
  if(POSTS_ADMIN.loading)return POSTS_ADMIN.posts;
  POSTS_ADMIN.loading=true;
  try{
    const payload=await backendJson("/api/admin/posts");
    POSTS_ADMIN.posts=Array.isArray(payload.posts)?payload.posts:[];
    POSTS_ADMIN.loaded=true;
    updateCounts();
    if(rerender&&route==="posts")render("posts",{noHash:true,keepScroll:true});
    return POSTS_ADMIN.posts;
  }finally{POSTS_ADMIN.loading=false}
}
function getAdminPost(id){return POSTS_ADMIN.posts.find(p=>String(p.id)===String(id))||null}
async function saveAdminPost(id,data){
  const url=id?`/api/admin/posts/${encodeURIComponent(id)}`:"/api/admin/posts";
  const payload=await backendJson(url,{method:id?"PUT":"POST",body:JSON.stringify(data)});
  const post=payload.post;
  if(post){
    const index=POSTS_ADMIN.posts.findIndex(p=>String(p.id)===String(post.id));
    if(index===-1)POSTS_ADMIN.posts.unshift(post);else POSTS_ADMIN.posts[index]=post;
    POSTS_ADMIN.loaded=true;updateCounts();
  }
  return post;
}
function openPostEditor(id=""){
  const post=id?getAdminPost(id):null;
  openDrawer(`<div class="drawer-head"><div><span class="eyebrow">POSTS</span><h2>${post?"Edit post":"New post"}</h2><p>${post?"Update what visitors see on the Posts tab.":"Create an announcement for everyone who visits OX Novels."}</p></div><button class="drawer-close" type="button" data-close>×</button></div>
    <form class="form" id="postEditorForm" data-id="${esc(post?.id||"")}">
      <label class="field"><span>Title</span><input id="postTitle" maxlength="160" required value="${esc(post?.title||"")}" placeholder="Important update"></label>
      <label class="field"><span>Message</span><textarea id="postBody" rows="9" maxlength="8000" required placeholder="Write your announcement…">${esc(post?.body||"")}</textarea><small>Plain text. Line breaks are kept on the public post.</small></label>
      <div class="form-row two">
        <label class="field"><span>Status</span><select id="postStatus"><option ${post?.status==="Published"?"selected":""}>Published</option><option ${post?.status!=="Published"?"selected":""}>Draft</option></select></label>
        <label class="setting" style="align-self:end"><span><strong>Pin this post</strong><small>Pinned posts stay above newer normal posts.</small></span><input class="toggle" id="postPinned" type="checkbox" ${post?.pinned?"checked":""}></label>
      </div>
      <div class="post-editor-preview"><strong>Public behavior:</strong> Published posts are visible to everyone, including guests. Drafts stay only in Admin.</div>
      <div class="form-actions"><button class="primary" type="submit">${post?"Save changes":"Create post"}</button><button class="secondary" type="button" data-close>Cancel</button></div>
    </form>`);
  const form=$("#postEditorForm");
  form.onsubmit=async e=>{
    e.preventDefault();
    const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent=post?"Saving…":"Creating…";
    try{
      await saveAdminPost(form.dataset.id,{title:$("#postTitle").value,body:$("#postBody").value,status:$("#postStatus").value,pinned:$("#postPinned").checked});
      closeDrawer();render("posts",{noHash:true,keepScroll:true});toast(post?"Post updated.":"Post created.");
    }catch(error){toast(error.message||"Unable to save post.");submit.disabled=false;submit.textContent=post?"Save changes":"Create post"}
  };
}
async function toggleAdminPost(id,field){
  const post=getAdminPost(id);if(!post)return;
  const data={title:post.title,body:post.body,status:post.status,pinned:post.pinned};
  if(field==="pin")data.pinned=!post.pinned;
  if(field==="publish")data.status=post.status==="Published"?"Draft":"Published";
  try{await saveAdminPost(id,data);render("posts",{noHash:true,keepScroll:true});toast(field==="pin"?(data.pinned?"Post pinned.":"Post unpinned."):(data.status==="Published"?"Post published.":"Post moved to Draft."))}catch(error){toast(error.message||"Unable to update post.")}
}
async function deleteAdminPost(id){
  const post=getAdminPost(id);if(!post)return;
  if(!confirm(`Delete "${post.title}"?\n\nThis permanently removes the post.`))return;
  try{await backendJson(`/api/admin/posts/${encodeURIComponent(id)}`,{method:"DELETE"});POSTS_ADMIN.posts=POSTS_ADMIN.posts.filter(p=>String(p.id)!==String(id));updateCounts();render("posts",{noHash:true,keepScroll:true});toast("Post deleted.")}catch(error){toast(error.message||"Unable to delete post.")}
}
function bindPosts(){
  const add=()=>openPostEditor("");
  const addButton=$("#addPost"),headerButton=$("#headerAddPost"),refresh=$("#refreshPosts");
  if(addButton)addButton.onclick=add;if(headerButton)headerButton.onclick=add;
  if(refresh)refresh.onclick=()=>loadAdminPosts({rerender:true}).then(()=>toast("Posts refreshed.")).catch(error=>toast(error.message||"Unable to refresh posts."));
  $$("[data-edit-post]").forEach(b=>b.onclick=()=>openPostEditor(b.dataset.editPost));
  $$("[data-pin-post]").forEach(b=>b.onclick=()=>toggleAdminPost(b.dataset.pinPost,"pin"));
  $$("[data-publish-post]").forEach(b=>b.onclick=()=>toggleAdminPost(b.dataset.publishPost,"publish"));
  $$("[data-delete-post]").forEach(b=>b.onclick=()=>deleteAdminPost(b.dataset.deletePost));
  if(!POSTS_ADMIN.loaded&&!POSTS_ADMIN.loading){
    const target=$("#adminPostsList");if(target)target.innerHTML='<div class="admin-post-empty"><strong>Loading posts…</strong><span>Reading the Posts database.</span></div>';
    loadAdminPosts({rerender:true}).catch(error=>{const t=$("#adminPostsList");if(t)t.innerHTML=`<div class="admin-post-empty"><strong>Unable to load posts</strong><span>${esc(error.message)}</span></div>`});
  }
}

function activeLifetimePurchasesForUser(user){
  const rows=Array.isArray(user?.lifetimePurchases)?user.lifetimePurchases:[];
  return rows.filter(p=>String(p?.purchaseStatus||"").toLowerCase()==="completed"&&String(p?.entitlementStatus||"").toLowerCase()==="active");
}
function lifetimeOwnedCount(user){ return activeLifetimePurchasesForUser(user).length; }
function lifetimeBadgeLabel(user){
  const count=lifetimeOwnedCount(user);
  return count?`${count} Lifetime`:"";
}
function adminAccessStatusText(user){
  const parts=[];
  const membership=String(user?.membership||"None");
  if(membership&&membership!=="None")parts.push(membership);
  const lifetime=lifetimeBadgeLabel(user);
  if(lifetime)parts.push(lifetime);
  return parts.length?parts.join(" + "):"None";
}
function adminAccessStatusBadges(user){
  const parts=[];
  const membership=String(user?.membership||"None");
  if(membership&&membership!=="None")parts.push(badge(membership));
  const lifetime=lifetimeBadgeLabel(user);
  if(lifetime)parts.push(badge(lifetime));
  return parts.length?`<span class="actions" style="gap:6px;justify-content:flex-start;flex-wrap:wrap">${parts.join("")}</span>`:badge("None");
}
function adminDisplayPlan(user){
  const lifetime=lifetimeOwnedCount(user);
  const membership=String(user?.membership||"None");
  const plan=String(user?.plan||"None");
  if(lifetime>0&&(membership==="None"||!plan||plan==="None"))return "Lifetime Story Access";
  return plan||"None";
}
function adminDisplayRenewal(user){
  const membership=String(user?.membership||"None");
  if(membership==="None"&&lifetimeOwnedCount(user)>0)return "—";
  return adminDate(user?.renewal);
}

function usersRows(list){ return list.map(u=>{const initials=u.name.split(' ').map(x=>x[0]).join('').slice(0,2);return `<tr><td><input type="checkbox" data-select-user="${u.id}" aria-label="Select ${esc(u.name)}"></td><td><div class="user-cell"><i class="admin-user-avatar">${u.profileImage?`<img src="${esc(u.profileImage)}" alt="" onerror="this.remove();this.parentElement.textContent='${esc(initials)}'">`:esc(initials)}</i><span><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span></div></td><td>${badge(u.account)}</td><td>${adminAccessStatusBadges(u)}</td><td>${esc(adminDisplayPlan(u))}</td><td>${esc(adminDisplayRenewal(u))}</td><td class="right"><span class="actions"><button class="secondary small" data-user="${u.id}">Manage</button><button class="action-btn" data-edit-user="${u.id}" title="Edit user">✎</button><button class="action-btn" data-delete-user="${u.id}" title="Delete user">⌫</button></span></td></tr>`}).join(""); }
function usersView(){
  return `<div class="metrics four">${metric("All users",USERS.length)}${metric("Active",USERS.filter(u=>u.membership==="Active").length)}${metric("Expired",USERS.filter(u=>u.membership==="Expired").length)}${metric("Granted",USERS.filter(u=>u.membership==="Granted").length)}</div><section class="surface"><div class="toolbar"><div class="search"><span>⌕</span><input id="userSearch" placeholder="Search name or email"></div><div class="tool-group"><select class="select" id="userFilter"><option value="all">All users</option><option value="active">Active</option><option value="expired">Expired</option><option value="blocked">Blocked</option><option value="granted">Granted</option><option value="lifetime">Lifetime owners</option></select><button class="secondary" id="telegramSetup">Telegram Setup</button><button class="secondary" id="refreshUsers">Refresh</button><button class="secondary" id="exportUsers">Export CSV</button></div></div><div class="bulk hidden" id="userBulk"><strong><span id="userBulkCount">0</span> selected</strong><span></span><button class="secondary small danger" id="deleteSelectedUsers">Delete selected</button></div><div class="table-wrap"><table class="table"><thead><tr><th><input id="selectAllUsers" type="checkbox" aria-label="Select all visible users"></th><th>User</th><th>Account</th><th>Membership</th><th>Plan</th><th>Renewal / expiry</th><th class="right">Actions</th></tr></thead><tbody id="userBody">${usersRows(USERS)}</tbody></table></div><div class="table-foot"><span id="userSummary">${USERS.length} real D1 users</span><div class="pages"><button disabled>‹</button><button class="active">1</button><button disabled>›</button></div></div></section>`;
}


function promotionsView(){
  return '<section class="surface"><div class="surface-head"><div><h2>Referral partners</h2><p>Add friends and YouTube channels that customers can select in the purchase questionnaire.</p></div></div>'+
    '<form class="form" id="promotionPartnerForm"><div class="form-row two"><label class="field"><span>Friend / channel name</span><input id="promotionPartnerName" maxlength="100" required placeholder="e.g. Rocky"></label><label class="field"><span>YouTube / website URL (optional)</span><input id="promotionPartnerUrl" type="url" maxlength="500" placeholder="https://youtube.com/..."></label></div><div class="form-actions"><button class="primary" type="submit">Add friend</button></div></form>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Friend / channel</th><th>Customers</th><th>Historical payments</th><th class="right">Action</th></tr></thead><tbody id="promotionPartnerRows"><tr><td colspan="4">Loading…</td></tr></tbody></table></div></section>'+
    '<section class="surface"><div class="surface-head"><div><h2>Promotions customers</h2><p>Correct the selected monthly owner when a customer chose the wrong friend. The original selection date and historical payment snapshots are preserved.</p></div></div>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Current source / owner</th><th>Selected</th><th>Payments</th><th class="right">Actions</th></tr></thead><tbody id="promotionCustomerRows"><tr><td colspan="5">Loading…</td></tr></tbody></table></div></section>';
}
async function bindPromotions(){
  const partnerRows=$("#promotionPartnerRows"),customerRows=$("#promotionCustomerRows");
  const load=async()=>{
    try{
      const data=await backendJson("/api/admin/promotions");
      const partners=Array.isArray(data.partners)?data.partners:[];
      const customers=Array.isArray(data.customers)?data.customers:[];
      if(partnerRows)partnerRows.innerHTML=partners.length?partners.map(p=>'<tr><td><strong>'+esc(p.name)+'</strong>'+(p.channel_url?'<small style="display:block">'+esc(p.channel_url)+'</small>':'')+'</td><td>'+Number(p.customer_count||0)+'</td><td>'+Number(p.payment_count||0)+'</td><td class="right"><button class="secondary small danger" data-promo-delete-partner="'+esc(p.id)+'">Delete friend</button></td></tr>').join(""):'<tr><td colspan="4">No referral partners added yet.</td></tr>';
      const partnerOptions=partners.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
      if(customerRows)customerRows.innerHTML=customers.length?customers.map(c=>'<tr><td><strong>'+esc(c.name||"Deleted OX user")+'</strong><small style="display:block">'+esc(c.email||c.user_id)+'</small></td><td><select class="select" data-promo-owner="'+esc(c.user_id)+'"><option value="">Other / unassigned</option>'+partnerOptions+'</select><small style="display:block">'+esc(c.partner_name_snapshot||c.source_label||"—")+'</small></td><td>'+esc(adminDate(c.selected_at))+'</td><td>'+Number(c.payment_count||0)+'</td><td class="right"><button class="secondary small" data-promo-save-owner="'+esc(c.user_id)+'">Save owner</button> <button class="secondary small danger" data-promo-delete-customer="'+esc(c.user_id)+'">Delete customer</button></td></tr>').join(""):'<tr><td colspan="5">No Promotions customers recorded yet.</td></tr>';
      customers.forEach(c=>{const select=$('[data-promo-owner="'+String(c.user_id).replaceAll('"','\\"')+'"]');if(select)select.value=c.partner_id||"";});
      $("[data-promo-delete-partner]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this friend from Promotions? Current attribution rows will be removed; historical payment snapshots will be retained."))return;b.disabled=true;try{await backendJson("/api/admin/promotions/partners/"+encodeURIComponent(b.dataset.promoDeletePartner),{method:"DELETE"});toast("Friend deleted from Promotions. Historical payments retained.");await load()}catch(e){toast(e.message)}finally{b.disabled=false}});
      $("[data-promo-save-owner]").forEach(b=>b.onclick=async()=>{const id=b.dataset.promoSaveOwner,select=$('[data-promo-owner="'+String(id).replaceAll('"','\\"')+'"]');b.disabled=true;try{await backendJson("/api/admin/promotions/customers/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({partnerId:select?select.value:"",sourceLabel:"Other"})});toast("Customer referral owner corrected. Original selection date retained.");await load()}catch(e){toast(e.message)}finally{b.disabled=false}});
      $("[data-promo-delete-customer]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove this customer from Promotions only? Their OX account, membership, and payment history will remain."))return;b.disabled=true;try{await backendJson("/api/admin/promotions/customers/"+encodeURIComponent(b.dataset.promoDeleteCustomer),{method:"DELETE"});toast("Customer removed from Promotions. OX account preserved.");await load()}catch(e){toast(e.message)}finally{b.disabled=false}});
    }catch(error){if(partnerRows)partnerRows.innerHTML='<tr><td colspan="4">'+esc(error.message)+'</td></tr>';if(customerRows)customerRows.innerHTML='<tr><td colspan="5">'+esc(error.message)+'</td></tr>'}
  };
  const form=$("#promotionPartnerForm");
  if(form)form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;try{await backendJson("/api/admin/promotions/partners",{method:"POST",body:JSON.stringify({name:$("#promotionPartnerName").value,channelUrl:$("#promotionPartnerUrl").value})});form.reset();toast("Promotion friend added.");await load()}catch(error){toast(error.message)}finally{button.disabled=false}};
  await load();
}

function chatView(){
  const unread=unreadChats();
  return `<section class="surface chat admin-chat-ui">
    <aside class="conversation-pane">
      <div class="conversation-head"><div><h2>Member Chat</h2><p>Customers who paid at least once</p></div><div class="admin-chat-head-actions"><button class="secondary small" id="openChatBroadcast" type="button">Broadcast</button><span class="badge accent ${unread?"":"hidden"}" id="chatUnreadBadge">${unread} unread</span></div></div>
      <div class="search compact admin-chat-search"><span>⌕</span><input id="chatSearch" placeholder="Search members or conversations"></div>
      <div class="conversation-list" id="convList"></div>
    </aside>
    <div class="message-pane">
      <div class="message-head" id="messageHead"></div>
      <div class="admin-chat-time-context" id="messageTimeContext"></div>
      <div class="messages" id="messages"></div>
      <div class="admin-chat-preview-note">Private conversation between this paid customer and the site Admin.</div>
      <form class="compose" id="messageForm"><textarea id="messageInput" rows="1" placeholder="Write a message…"></textarea><button class="primary">Send</button></form>
    </div>
  </section>`;
}

function notificationsView(){ return surf("Notifications","Real member, Chat, payment and system notices from this website.",`<div class="notification-list" id="noticeList"></div>`,`<div class="tool-group"><div class="segmented"><button class="active" data-notice-filter="all">All</button><button data-notice-filter="unread">Unread</button></div><button class="secondary" id="refreshNotices">Refresh</button><button class="secondary" id="markRead">Mark all read</button></div>`); }

function membershipView(){
  return `<div class="surface-head outside"><div><h2>Membership tiers</h2><p>Tier edits and tier cover images save to D1. Published tiers appear on the public Membership tab.</p></div><button class="primary" id="addTier">＋ Add tier</button></div><div class="tier-grid">${TIERS.map(t=>`<article class="tier ${t.status==='Draft'?'draft':''}"><div class="tier-cover ${t.cover?'has-image':''}" ${t.cover?`style="background-image:url('${esc(t.cover)}');background-size:cover;background-position:center"`:''}>${t.cover?'':'MEMBERSHIP'}</div><div class="tier-body"><div class="tier-title"><h3>${esc(t.name)}</h3>${badge(t.status)}</div><div class="tier-price">${esc(t.price)} <small>${esc(t.cycle)}</small></div><p>${esc(t.description)}</p><ul class="benefits">${t.benefits.map(b=>`<li>${esc(b)}</li>`).join("")}</ul><div class="tier-actions"><button class="secondary" data-tier="${t.id}">Edit tier</button><button class="text-btn" data-tier-copy="${t.id}">Duplicate</button></div></div></article>`).join("")}</div><section class="surface behavior"><div><h3>Public display behavior</h3><p>Phone, tablet and desktop: simple vertical tier flow. No swipe carousel.</p></div><span class="badge ok">Backend connected</span></section>`;
}
function paymentsView(){
  const pp=PROVIDERS["PayPal"], cp=PROVIDERS["Card provider"];
  return `<div class="integration-grid"><article class="integration"><span class="integration-logo paypal">P</span><div><div class="integration-title"><h3>PayPal Membership + Support</h3>${badge(pp.status)}</div><p>Recurring memberships plus one-time member Support payments through PayPal.</p><div class="chips"><span>Checkout</span><span>Subscriptions</span><span>Support</span><span>Webhooks</span></div></div><button class="secondary" data-provider="PayPal">Configure</button></article><article class="integration"><span class="integration-logo">▣</span><div><div class="integration-title"><h3>Card provider</h3>${badge(cp.status)}</div><p>Optional second billing provider. Keep this planned until PayPal membership checkout is fully tested.</p><div class="chips"><span>Cards</span><span>Recurring</span></div></div><button class="secondary" data-provider="Card provider">Configure</button></article></div><section class="surface security"><i>🔒</i><div><h3>PayPal Client Secret stays server-side</h3><p>Admin stores only the public Client ID, Webhook ID, mode and tier Plan IDs. The Client Secret remains in <code>.dev.vars</code> locally and a Worker secret when deployed.</p></div></section>`;
}

function financeView(){
  const s=FINANCE.summary||{};
  const body=FINANCE.loaded?financeRowMarkup(FINANCE.rows||[]):'<tr><td colspan="7"><div class="empty">Loading real PayPal payment data…</div></td></tr>';
  const revenueBreakdown=[Number(s.liveRevenue||0)>0?`Live ${financeMoney(s.liveRevenue)}`:"",Number(s.legacyRevenue||0)>0?`Legacy ${financeMoney(s.legacyRevenue)}`:"",Number(s.sandboxRevenue||0)>0?`Sandbox tests ${financeMoney(s.sandboxRevenue)} excluded`:""].filter(Boolean).join(" · ")||"Completed business payments";
  return `<div class="metrics five">${metric("Gross revenue",financeMoney(s.grossRevenue||0),revenueBreakdown,"ok")}${metric("Successful",Number(s.successful||0),Number(s.sandboxTests||0)?`${s.sandboxTests} sandbox test${Number(s.sandboxTests)===1?"":"s"} excluded`:"payments")}${metric("Refunded",financeMoney(s.refunded||0),"refunds")}${metric("Failed",Number(s.failed||0),"Need follow-up",Number(s.failed||0)?"warn":"ok")}${metric("Admin grants",Number(s.adminGrants||0),"$0 memberships")}</div>${surf("Payment ledger","Real D1 payment events and verified PayPal subscription payments. Sandbox tests stay visible but do not count as revenue.",`<div class="toolbar"><div class="search"><span>⌕</span><input id="financeSearch" placeholder="Search user, plan, status or PayPal reference"></div><div class="tool-group"><select class="select" id="financeFilter"><option value="all">All visible records</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="granted">Granted</option><option value="hidden">Hidden records</option></select><button class="secondary" id="refreshFinance">Refresh</button><button class="secondary" id="exportLedger">Export CSV</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>User</th><th>Type</th><th>Plan</th><th>Amount</th><th>Status</th><th>Reference</th><th>Actions</th></tr></thead><tbody id="financeBody">${body}</tbody></table></div><div class="table-foot"><span id="financeSummary">${FINANCE.loaded?`Showing ${(FINANCE.rows||[]).filter(r=>!r.hidden).length} visible records`:"Loading finance…"}</span><span class="badge ok">D1 + PayPal data</span></div>`,`<span class="badge ok">Real data</span>`)}`;
}

function integrationsView(){
  const drive=INTEGRATIONS.googleDrive||{},paypal=INTEGRATIONS.paypal||{},googleAuth=INTEGRATIONS.googleAuth||{};
  const driveMeta=drive.configured
    ? `${drive.method||"Apps Script"}${drive.api?` · ${drive.api}`:""}`
    : "Apps Script URL or secret is missing.";
  const paypalMeta=paypal.configured
    ? `${String(paypal.mode||"sandbox").toUpperCase()} · ${Number(paypal.planCount||0)} Plan ID${Number(paypal.planCount||0)===1?"":"s"}${paypal.enabled?" · Checkout enabled":" · Checkout disabled"}`
    : "PayPal Client ID or server Client Secret is missing.";
  const googleMeta=googleAuth.clientIdConfigured ? "Google Web Client ID saved for member sign-in." : "Add a Google Web Client ID before members can sign in.";
  return `<div class="integration-grid">
    <article class="integration">
      <span class="integration-logo drive">△</span>
      <div><div class="integration-title"><h3>Google Drive / Apps Script</h3><span id="driveIntegrationBadge">${badge(drive.status||"Checking…")}</span></div>
      <p id="driveIntegrationText">${esc(drive.error||driveMeta)}</p><div class="chips"><span>Drive scanner</span><span>Apps Script</span><span>Real health check</span></div></div>
      <button class="secondary" id="testDriveIntegration">Test connection</button>
    </article>
    <article class="integration">
      <span class="integration-logo paypal">P</span>
      <div><div class="integration-title"><h3>PayPal</h3><span id="paypalIntegrationBadge">${badge(paypal.status||"Checking…")}</span></div>
      <p id="paypalIntegrationText">${esc(paypal.error||paypalMeta)}</p><div class="chips"><span>Subscriptions</span><span>Support</span><span>Plan IDs</span><span>Webhooks</span></div></div>
      <div class="drawer-actions"><button class="secondary" id="testPaypalIntegration">Test connection</button><button class="secondary" data-provider="PayPal">Configure</button></div>
    </article>
    <article class="integration">
      <span class="integration-logo">G</span>
      <div><div class="integration-title"><h3>Google Sign-In</h3><span id="googleAuthIntegrationBadge">${badge(googleAuth.status||"Checking…")}</span></div>
      <p id="googleAuthIntegrationText">${esc(googleMeta)}</p><div class="chips"><span>Members</span><span>Google Identity</span><span>No passwords</span></div></div>
      <button class="secondary" data-provider="Google Sign-In">Configure</button>
    </article>
  </div>
  <section class="surface security"><i>✓</i><div><h3>Statuses on this page are real</h3><p>Drive is tested against Apps Script, PayPal is tested server-side, and Google Sign-In shows whether this site has a valid Google Web Client ID configured.</p></div></section>`;
}

function integrationStatusText(kind,data={}){
  if(kind==="drive"){
    if(data.error)return data.error;
    if(!data.configured)return "Apps Script URL or secret is missing.";
    return `${data.method||"Apps Script"}${data.api?` · ${data.api}`:""}${data.driveApp===false?" · Drive access unavailable":""}`;
  }
  if(data.error)return data.error;
  if(!data.configured)return "PayPal Client ID or server Client Secret is missing.";
  return `${String(data.mode||"sandbox").toUpperCase()} · ${Number(data.planCount||0)} Plan ID${Number(data.planCount||0)===1?"":"s"}${data.webhookConfigured?" · Webhook ID saved":" · Webhook ID not saved"}${data.enabled?" · Checkout enabled":" · Checkout disabled"}`;
}
function paintIntegrationStatus(){
  const drive=INTEGRATIONS.googleDrive||{},paypal=INTEGRATIONS.paypal||{},googleAuth=INTEGRATIONS.googleAuth||{};
  const db=$("#driveIntegrationBadge"),dt=$("#driveIntegrationText"),pb=$("#paypalIntegrationBadge"),pt=$("#paypalIntegrationText"),gb=$("#googleAuthIntegrationBadge"),gt=$("#googleAuthIntegrationText");
  if(db)db.innerHTML=badge(drive.status||"Checking…");if(dt)dt.textContent=integrationStatusText("drive",drive);
  if(pb)pb.innerHTML=badge(paypal.status||"Checking…");if(pt)pt.textContent=integrationStatusText("paypal",paypal);
  if(gb)gb.innerHTML=badge(googleAuth.status||"Checking…");if(gt)gt.textContent=googleAuth.clientIdConfigured?"Google Web Client ID saved for member sign-in.":"Add a Google Web Client ID before members can sign in.";
}
async function loadPaypalProviderConfigStatus(){
  const payload=await backendJson("/api/admin/payments/paypal");
  const cfg=payload.config||{};
  const ready=Boolean(cfg.enabled&&cfg.clientId&&cfg.secretConfigured);
  PROVIDERS["PayPal"]={displayName:"PayPal",status:ready?"Connected":(cfg.enabled?"Test mode":"Not connected")};
  persistLocalState();
  return PROVIDERS["PayPal"];
}
async function loadRealIntegrations({notify=false}={}){
  const data=await backendJson("/api/admin/integrations/status");
  INTEGRATIONS={loaded:true,googleDrive:data.googleDrive||{status:"Not connected"},paypal:data.paypal||{status:"Not connected"},googleAuth:data.googleAuth||{status:"Not configured"}};
  PROVIDERS["Google Drive"]={displayName:"Google Drive / Apps Script",status:INTEGRATIONS.googleDrive.status||"Not connected"};
  PROVIDERS["PayPal"]={...(PROVIDERS["PayPal"]||{displayName:"PayPal"}),status:INTEGRATIONS.paypal.status||"Not connected"};
  persistLocalState();paintIntegrationStatus();
  if(notify){
    const d=INTEGRATIONS.googleDrive,p=INTEGRATIONS.paypal,g=INTEGRATIONS.googleAuth;
    toast(`Drive: ${d.status||"Unknown"} · PayPal: ${p.status||"Unknown"} · Google: ${g.status||"Unknown"}`);
  }
  return data;
}
function bindIntegrations(){
  const run=async button=>{if(button)button.disabled=true;try{await loadRealIntegrations({notify:true})}catch(error){toast(error.message||"Unable to test integrations.")}finally{if(button)button.disabled=false}};
  const drive=$("#testDriveIntegration"),paypal=$("#testPaypalIntegration");if(drive)drive.onclick=()=>run(drive);if(paypal)paypal.onclick=()=>run(paypal);
  if(!INTEGRATIONS.loaded)loadRealIntegrations().catch(error=>{INTEGRATIONS.googleDrive={status:"Connection error",error:error.message};INTEGRATIONS.paypal={status:"Connection error",error:error.message};INTEGRATIONS.googleAuth={status:"Connection error"};paintIntegrationStatus()});
}

function playerCatalogStatusLabel(status=""){
  return ({
    PUBLISHED_CURRENT:"Current",
    MISSING_CATALOG:"Missing",
    SOURCE_CHANGED:"Needs refresh",
    NO_DRIVE_SOURCE:"No Drive source",
    ORPHANED_PUBLISHED:"Orphaned",
    PLAYER_UNAVAILABLE:"Player unavailable"
  })[String(status)]||String(status||"Unknown");
}
function playerCatalogStatusBadge(status=""){
  const label=playerCatalogStatusLabel(status);
  const cls=status==="PUBLISHED_CURRENT"?"ok":status==="SOURCE_CHANGED"||status==="ORPHANED_PUBLISHED"?"warn":"danger";
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function playerCatalogMetric(id,label,value,sub="",cls=""){
  return `<article class="metric" data-player-catalog-metric="${esc(id)}"><label>${esc(label)}</label><strong id="playerCatalogMetric_${esc(id)}">${esc(value)}</strong><small id="playerCatalogMetric_${esc(id)}_sub" class="${esc(cls)}">${esc(sub)}</small></article>`;
}
function paintPlayerCatalogMetrics(){
  const c=PLAYER_CATALOGS.counts||{};
  const values={
    stories:Number(PLAYER_CATALOGS.currentStories||stories.length),
    published:PLAYER_CATALOGS.publishedCatalogs==null?"—":Number(PLAYER_CATALOGS.publishedCatalogs||0),
    current:Number(c.PUBLISHED_CURRENT||0),
    missing:Number(c.MISSING_CATALOG||0),
    changed:Number(c.SOURCE_CHANGED||0),
    orphaned:Number(c.ORPHANED_PUBLISHED||0)
  };
  Object.entries(values).forEach(([key,value])=>{const el=$("#playerCatalogMetric_"+key);if(el)el.textContent=String(value)});
  const publishedSub=$("#playerCatalogMetric_published_sub");
  if(publishedSub){
    publishedSub.textContent=PLAYER_CATALOGS.playerAvailable?"Separate Player account":"Status unavailable";
    publishedSub.className=PLAYER_CATALOGS.playerAvailable?"ok":"warn";
  }
  const currentSub=$("#playerCatalogMetric_current_sub");if(currentSub){currentSub.textContent="Catalog matches Drive source";currentSub.className=values.current?"ok":""}
  const missingSub=$("#playerCatalogMetric_missing_sub");if(missingSub){missingSub.textContent="Needs preparation";missingSub.className=values.missing?"warn":"ok"}
  const changedSub=$("#playerCatalogMetric_changed_sub");if(changedSub){changedSub.textContent="Drive source changed";changedSub.className=values.changed?"warn":"ok"}
  const orphanSub=$("#playerCatalogMetric_orphaned_sub");if(orphanSub){orphanSub.textContent="No matching OX story";orphanSub.className=values.orphaned?"warn":"ok"}
}
function playerCatalogsView(){
  const c=PLAYER_CATALOGS.counts||{};
  const pub=PLAYER_CATALOGS.publishedCatalogs==null?"—":Number(PLAYER_CATALOGS.publishedCatalogs||0);
  const protectedOn=PLAYER_CATALOGS.protectedEnabled===true;
  return `<section class="surface player-delivery-control" style="margin-bottom:13px"><div class="surface-head"><div><h2>Protected Audio Player</h2><p id="playerDeliveryCopy">${protectedOn?"ON · Eligible customers use the protected OX Player.":"OFF · Eligible customers use the direct Google Drive fallback."}</p></div><div class="tool-group"><span class="badge ${protectedOn?"ok":"warn"}" id="playerDeliveryBadge">${protectedOn?"ON":"OFF"}</span><button class="${protectedOn?"secondary":"primary"}" id="togglePlayerDelivery">Turn Player ${protectedOn?"OFF":"ON"}</button></div></div><div class="player-catalog-note"><strong>Emergency fallback.</strong> Turning Player OFF does not delete catalogs or sessions. It only changes where future story opens are sent. You can turn it ON again after checking the Player.</div></section><div class="player-catalog-metrics">
    ${playerCatalogMetric("stories","OX stories",Number(PLAYER_CATALOGS.currentStories||stories.length),"Current D1 library")}
    ${playerCatalogMetric("published","Published Player",pub,PLAYER_CATALOGS.playerAvailable?"Separate Player account":"Status unavailable",PLAYER_CATALOGS.playerAvailable?"ok":"warn")}
    ${playerCatalogMetric("current","Current",Number(c.PUBLISHED_CURRENT||0),"Catalog matches Drive source",Number(c.PUBLISHED_CURRENT||0)?"ok":"")}
    ${playerCatalogMetric("missing","Missing",Number(c.MISSING_CATALOG||0),"Needs preparation",Number(c.MISSING_CATALOG||0)?"warn":"ok")}
    ${playerCatalogMetric("changed","Needs refresh",Number(c.SOURCE_CHANGED||0),"Drive source changed",Number(c.SOURCE_CHANGED||0)?"warn":"ok")}
    ${playerCatalogMetric("orphaned","Orphaned",Number(c.ORPHANED_PUBLISHED||0),"No matching OX story",Number(c.ORPHANED_PUBLISHED||0)?"warn":"ok")}
  </div>
  <section class="surface player-catalog-summary">
    <div class="surface-head"><div><h2>Player catalog reconciliation</h2><p>Read-only live comparison between this OX D1 library and the separate OX Audio Player account. No Cloudflare Player credential is stored in this website.</p></div><div class="tool-group"><button class="secondary small" id="refreshPlayerCatalogs">Refresh</button><button class="secondary small" id="exportPlayerSnapshot">Export production snapshot</button><a class="secondary small player-link-btn" id="openLocalPlayerManager" href="http://127.0.0.1:8792" target="_blank" rel="noopener">Open local manager ↗</a><a class="secondary small player-link-btn" href="${esc(PLAYER_CATALOGS.playerBase||"https://listen.ox-audio-player.workers.dev")}" target="_blank" rel="noopener">Open Player service ↗</a></div></div>
    <div class="player-catalog-health ${PLAYER_CATALOGS.playerAvailable?"ok":"bad"}" id="playerCatalogHealth">${PLAYER_CATALOGS.loading?"Checking Player service…":PLAYER_CATALOGS.playerAvailable?`Player connected · ${Number(PLAYER_CATALOGS.publishedCatalogs||0)} published catalogs · checked ${esc(adminDate(PLAYER_CATALOGS.checkedAt,{withTime:true}))}`:`${esc(PLAYER_CATALOGS.playerError||"Player status has not been loaded yet.")}`}</div>
    <div class="player-catalog-note"><strong>Prepare / refresh stays local.</strong> Use the local Catalog Manager for Drive scanning and automatic retries, then publish with <code>local-player-b6\\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat</code>. This Admin page never receives the Player account credential.</div>
  </section>
  <section class="surface" style="margin-top:13px">
    <div class="toolbar"><div class="search"><span>⌕</span><input id="playerCatalogSearch" placeholder="Search title or story ID"></div><div class="tool-group"><select class="select" id="playerCatalogFilter"><option value="all">All statuses</option><option value="PUBLISHED_CURRENT">Current</option><option value="MISSING_CATALOG">Missing</option><option value="SOURCE_CHANGED">Needs refresh</option><option value="NO_DRIVE_SOURCE">No Drive source</option><option value="ORPHANED_PUBLISHED">Orphaned</option><option value="PLAYER_UNAVAILABLE">Player unavailable</option></select><span class="muted" id="playerCatalogSummary"></span></div></div>
    <div class="table-wrap"><table class="table player-catalog-table"><thead><tr><th>Story</th><th>Catalog status</th><th>Visibility</th><th>Tracks</th><th>Generation</th><th class="right">Actions</th></tr></thead><tbody id="playerCatalogBody"><tr><td colspan="6"><div class="empty">${PLAYER_CATALOGS.loaded?"No Player catalog rows.":"Loading Player catalog status…"}</div></td></tr></tbody></table></div>
  </section>`;
}
function filteredPlayerCatalogRows(){
  const q=String($("#playerCatalogSearch")?.value||"").trim().toLowerCase();
  const f=String($("#playerCatalogFilter")?.value||"all");
  return (PLAYER_CATALOGS.rows||[]).filter(row=>(f==="all"||row.status===f)&&(!q||`${row.title||""} ${row.storyId||""}`.toLowerCase().includes(q)));
}
function paintPlayerCatalogRows(){
  const body=$("#playerCatalogBody");if(!body)return;
  const list=filteredPlayerCatalogRows();
  const summary=$("#playerCatalogSummary");if(summary)summary.textContent=`${list.length} of ${(PLAYER_CATALOGS.rows||[]).length} row(s)`;
  body.innerHTML=list.length?list.map(row=>{
    const id=String(row.storyId||"");
    const localUrl=`http://127.0.0.1:8792/?story=${encodeURIComponent(id)}`;
    const canOpen=Boolean(row.published)&&row.status!=="ORPHANED_PUBLISHED";
    const needsLocal=["MISSING_CATALOG","SOURCE_CHANGED"].includes(row.status);
    return `<tr><td><strong>${esc(row.title||id)}</strong><small style="display:block;color:var(--muted);margin-top:3px">${esc(id)}</small></td><td>${playerCatalogStatusBadge(row.status)}</td><td>${badge(row.visible?"Visible":"Hidden")}</td><td>${Number(row.trackCount||0).toLocaleString()}</td><td><code>${esc(row.generationId||"—")}</code></td><td class="right"><span class="actions player-catalog-actions">${row.hasDriveSource?`<button class="secondary small" data-player-drive-check="${esc(id)}">Check Drive</button>`:""}${needsLocal?`<a class="secondary small player-link-btn" href="${esc(localUrl)}" target="_blank" rel="noopener">Prepare locally ↗</a>`:row.status==="ORPHANED_PUBLISHED"?`<a class="secondary small player-link-btn" href="${esc(localUrl)}" target="_blank" rel="noopener">Clean locally ↗</a>`:""}${canOpen?`<a class="secondary small player-link-btn" href="${esc((PLAYER_CATALOGS.playerBase||"https://listen.ox-audio-player.workers.dev")+"/listen/"+encodeURIComponent(id))}" target="_blank" rel="noopener">Open Player ↗</a>`:""}</span></td></tr>`;
  }).join(""):'<tr><td colspan="6"><div class="empty">No stories match this filter.</div></td></tr>';
  $$('[data-player-drive-check]',body).forEach(button=>button.onclick=()=>checkPlayerStoryDrive(button));
}
async function loadPlayerDelivery(){
  try{
    const data=await backendJson("/api/admin/player-delivery");
    PLAYER_CATALOGS.deliveryLoaded=true;
    PLAYER_CATALOGS.protectedEnabled=data?.config?.enabled===true;
    paintPlayerDeliveryControl();
    return data;
  }catch(error){
    PLAYER_CATALOGS.deliveryLoaded=true;
    paintPlayerDeliveryControl(error.message||"Unable to load Player mode.");
    throw error;
  }
}
function paintPlayerDeliveryControl(error=""){
  const on=PLAYER_CATALOGS.protectedEnabled===true;
  const badge=$("#playerDeliveryBadge"),copy=$("#playerDeliveryCopy"),button=$("#togglePlayerDelivery");
  if(badge){badge.textContent=on?"ON":"OFF";badge.className=`badge ${on?"ok":"warn"}`}
  if(copy)copy.textContent=error?`Status unavailable · ${error}`:(on?"ON · Eligible customers use the protected OX Player.":"OFF · Eligible customers use the direct Google Drive fallback.");
  if(button){button.textContent=`Turn Player ${on?"OFF":"ON"}`;button.className=on?"secondary":"primary"}
}
async function togglePlayerDelivery(button){
  const next=!(PLAYER_CATALOGS.protectedEnabled===true);
  const warning=next
    ?"Turn the protected Player ON? Future eligible story opens will use Player Account B."
    :"Turn the protected Player OFF? Future eligible story opens will use the direct Google Drive fallback until you turn it back on.";
  if(!confirm(warning))return;
  button.disabled=true;
  try{
    const data=await backendJson("/api/admin/player-delivery",{method:"PUT",body:JSON.stringify({enabled:next})});
    PLAYER_CATALOGS.protectedEnabled=data?.config?.enabled===true;
    paintPlayerDeliveryControl();
    toast(PLAYER_CATALOGS.protectedEnabled?"Protected Player enabled.":"Protected Player disabled. Direct Drive fallback is active.");
  }catch(error){toast(error.message||"Unable to change Player mode.")}
  finally{button.disabled=false}
}
async function loadPlayerCatalogs({notify=false}={}){
  PLAYER_CATALOGS.loading=true;
  const health=$("#playerCatalogHealth");if(health)health.textContent="Checking Player service…";
  try{
    const data=await backendJson("/api/admin/player-catalogs");
    PLAYER_CATALOGS={...PLAYER_CATALOGS,...data,loaded:true,loading:false};
    const nav=$("#playerCatalogNavCount");if(nav)nav.textContent=String(Number(data.attention||0));
    if(route==="playerCatalogs"){
      const h=$("#playerCatalogHealth");if(h){h.className=`player-catalog-health ${data.playerAvailable?"ok":"bad"}`;h.textContent=data.playerAvailable?`Player connected · ${Number(data.publishedCatalogs||0)} published catalogs · checked ${adminDate(data.checkedAt,{withTime:true})}`:(data.playerError||"Player status unavailable.")}
      paintPlayerCatalogMetrics();
      paintPlayerCatalogRows();
    }
    if(notify)toast(data.playerAvailable?"Player catalog status refreshed.":(data.playerError||"Player status unavailable."));
    return data;
  }catch(error){
    PLAYER_CATALOGS={...PLAYER_CATALOGS,loaded:true,loading:false,playerAvailable:false,playerError:error.message||"Unable to load Player catalogs."};
    if(route==="playerCatalogs"){const h=$("#playerCatalogHealth");if(h){h.className="player-catalog-health bad";h.textContent=PLAYER_CATALOGS.playerError}paintPlayerCatalogMetrics()}
    if(notify)toast(PLAYER_CATALOGS.playerError);throw error;
  }
}
async function checkPlayerStoryDrive(button){
  const storyId=String(button?.dataset?.playerDriveCheck||"");if(!storyId)return;
  const original=button.textContent;button.disabled=true;button.textContent="Checking…";
  try{
    const r=await backendJson("/api/admin/player-catalogs/drive-check",{method:"POST",body:JSON.stringify({storyId})});
    toast(r.accessible?`Drive accessible${r.folderName?`: ${r.folderName}`:""}`:(r.error||"Drive folder is not accessible."));
  }catch(error){toast(error.message||"Drive check failed.")}
  finally{button.disabled=false;button.textContent=original}
}
function bindPlayerCatalogs(){
  const search=$("#playerCatalogSearch"),filter=$("#playerCatalogFilter");if(search)search.oninput=paintPlayerCatalogRows;if(filter)filter.onchange=paintPlayerCatalogRows;
  const deliveryButton=$("#togglePlayerDelivery");if(deliveryButton)deliveryButton.onclick=()=>togglePlayerDelivery(deliveryButton);
  const refresh=$("#refreshPlayerCatalogs");if(refresh)refresh.onclick=()=>loadPlayerCatalogs({notify:true}).catch(()=>{});
  const exportButton=$("#exportPlayerSnapshot");if(exportButton)exportButton.onclick=async()=>{exportButton.disabled=true;try{const r=await backendJson("/api/admin/player-catalogs/snapshot");if(!r.snapshot)throw new Error("Snapshot was not returned.");download("PRODUCTION-STORY-SNAPSHOT.json",JSON.stringify(r.snapshot,null,2));toast("Production Player story snapshot downloaded.")}catch(error){toast(error.message||"Unable to export snapshot.")}finally{exportButton.disabled=false}};
  if(PLAYER_CATALOGS.loaded)paintPlayerCatalogRows();
  loadPlayerDelivery().catch(()=>{});
  loadPlayerCatalogs().catch(()=>{});
}

function activityRows(list){ return list.map(a=>`<div class="timeline-row"><i>${esc(a.icon||activityIcon(a.type,a.title))}</i><span><strong>${esc(a.title)}</strong><p>${esc(a.detail)}</p></span><time title="${esc(a.createdAt||"")}">${esc(a.time||activityDisplayTime(a.createdAt))}</time></div>`).join(""); }
function activityView(){ return `<section class="surface"><div class="toolbar"><div class="search"><span>⌕</span><input id="activitySearch" placeholder="Search real activity"></div><div class="tool-group"><select class="select" id="activityFilter"><option value="all">All activity</option><option value="story">Stories</option><option value="user">Users</option><option value="payment">Payments</option><option value="system">System</option></select><button class="secondary" id="refreshActivity">Refresh</button><button class="secondary" id="exportActivity">Export</button></div></div><div class="timeline" id="activityRows">${ACT.length?activityRows(ACT):'<div class="empty">Loading recorded activity…</div>'}</div></section>`; }

function backupView(){
  return `<div class="backup-grid"><section class="surface backup-card"><div class="backup-icon">⇩</div><h2>Full D1 backup</h2><p>Download the real website data: stories, posts, users, memberships, chats, images, Finance, Notifications, Activity and non-secret payment settings.</p><button class="primary" id="createBackup">Create full backup</button><small class="muted" style="display:block;margin-top:8px">Admin password, PayPal Client Secret, Google Apps Script secret and login sessions are never exported.</small></section><section class="surface backup-card"><div class="backup-icon">⇧</div><h2>Restore website</h2><p>Restore a full D1 backup. Current website data is replaced and all Admin/member sessions are logged out.</p><label class="secondary file-btn">Choose backup<input id="restoreFile" type="file" accept="application/json,.json"></label><div class="restore-result hidden" id="restoreResult"></div></section><section class="surface backup-card"><div class="backup-icon">⧉</div><h2>Clean clone package</h2><p>Create a fresh independent project ZIP for another owner with the complete code but no users, chats, payments, local database or private secrets.</p><div class="callout"><strong>From the project folder:</strong><br><code>MAKE-CLEAN-CLONE.bat</code></div><button class="secondary" id="cloneDetails" type="button">What the clone contains</button></section></div><section class="surface" style="margin-top:13px"><div class="surface-head"><div><h2>Database maintenance</h2><p>Safe cleanup and current D1 backup status.</p></div><button class="secondary small" id="refreshBackupSummary" type="button">Refresh</button></div><div class="backup-history-row"><span class="file-icon">D1</span><span><strong>Current website data</strong><small id="backupSummaryText">Reading real D1 counts…</small></span><span class="badge ok">Real data</span><button class="text-btn" id="stateDetails" type="button">Details</button></div><div class="backup-history-row"><span class="file-icon">⌫</span><span><strong>Clean deleted-user leftovers</strong><small>Removes orphan user/chat notifications and orphan Sandbox/test Finance rows. Activity Log and Live payment history stay.</small></span><span class="badge warn">Safe cleanup</span><button class="text-btn" id="cleanDeletedUserData" type="button">Clean</button></div></section>`;
}

const VIEWS={dashboard,appearance,settings,stories:storiesView,posts:postsView,add:addView,checks:checksView,playerCatalogs:playerCatalogsView,users:usersView,promotions:promotionsView,chat:chatView,notifications:notificationsView,membership:membershipView,lifetime:lifetimeView,payments:paymentsView,finance:financeView,integrations:integrationsView,activity:activityView,backup:backupView};

function pageActions(r){
  const map={dashboard:'<button class="secondary" data-go="backup">Create backup</button><button class="primary" data-go="add">＋ Add story</button>',stories:'<button class="secondary" data-go="checks">Check all</button><button class="primary" data-go="add">＋ Add story</button>',posts:'<button class="primary" id="headerAddPost">＋ New post</button>',membership:'<button class="primary" id="headerAddTier">＋ Add tier</button>',finance:'<button class="secondary" id="headerLedger">Export ledger</button>'};
  return map[r]||'<a class="secondary" style="display:inline-flex;align-items:center;text-decoration:none" href="/" target="_blank">View site ↗</a>';
}
function openMenu(){ $("#sidebar").classList.add("open"); $("#menuScrim").classList.add("show"); }
function closeMenu(){ $("#sidebar").classList.remove("open"); $("#menuScrim").classList.remove("show"); }
function openDrawer(html){ $("#drawerContent").innerHTML=html; $("#modalLayer").classList.add("open"); $("#modalLayer").setAttribute("aria-hidden","false"); document.body.style.overflow="hidden"; bindDrawer(); }
function closeDrawer(){ $("#modalLayer").classList.remove("open"); $("#modalLayer").setAttribute("aria-hidden","true"); document.body.style.overflow=""; }

function render(r,opts={}){
  if(!VIEWS[r]) r="dashboard";
  if(r!=="chat"&&adminChatLiveTimer){clearInterval(adminChatLiveTimer);adminChatLiveTimer=null}
  route=r;
  const meta=ROUTES[r]; $("#pageTitle").textContent=meta[0]; $("#mobileTitle").textContent=meta[0]; $("#pageSubtitle").textContent=meta[1]; $("#breadcrumb").textContent=meta[2];
  $("#pageActions").innerHTML=pageActions(r); $("#view").innerHTML=VIEWS[r]();
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.go===r));
  if(!opts.noHash&&location.hash!==`#${r}`) history.replaceState(null,"",`#${r}`);
  closeMenu(); bindView(); updateCounts(); void syncNotificationsForOpenedRoute(r);
  if(r==="users") void syncAdminUsersLive({force:true});
  if(!opts.keepScroll) window.scrollTo({top:0,behavior:"instant"}); if(opts.user) setTimeout(()=>openUser(opts.user),0);
}

function bindGlobal(root=document){ $$('[data-go]',root).forEach(b=>b.onclick=()=>render(b.dataset.go)); $$('[data-user]',root).forEach(b=>b.onclick=()=>openUser(b.dataset.user)); }

function bindView(){
  bindGlobal($("#view")); bindGlobal($("#pageActions"));
  if(route==="appearance") bindAppearance();
  if(route==="settings") bindSettings();
  if(route==="stories") bindStories();
  if(route==="posts") bindPosts();
  if(route==="add") bindAdd("manual");
  if(route==="checks") bindChecks();
  if(route==="playerCatalogs") bindPlayerCatalogs();
  if(route==="users") bindUsers();
  if(route==="promotions") bindPromotions();
  if(route==="chat") bindChat();
  if(route==="notifications") bindNotifications();
  if(route==="membership") bindMembership();
  if(route==="lifetime") bindLifetime();
  if(route==="payments"||route==="integrations") $$('[data-provider]').forEach(b=>b.onclick=()=>providerEditor(b.dataset.provider));
  if(route==="integrations") bindIntegrations();
  if(route==="finance") bindFinance();
  if(route==="activity") bindActivity();
  if(route==="backup") bindBackup();
}

function bindAppearance(){
  const update=()=>{ $("#pName").textContent=$("#siteName").value||"Site"; $("#pHandle").textContent=$("#siteHandle").value||""; $("#pDesc").textContent=$("#siteDescription").value; const c=$("#accentColor").value; $$('.preview-logo,.preview-avatar').forEach(x=>x.style.backgroundColor=c); };
  ["siteName","siteHandle","siteDescription"].forEach(id=>$("#"+id).oninput=update);
  $("#accentColor").oninput=e=>{ $("#accentText").value=e.target.value; update(); };
  $("#accentText").oninput=e=>{ if(/^#[0-9a-f]{6}$/i.test(e.target.value)){ $("#accentColor").value=e.target.value; update(); } };
  $("#appearanceForm").onsubmit=e=>{ e.preventDefault(); APPEARANCE={...APPEARANCE,name:$("#siteName").value.trim()||DEFAULT_APPEARANCE.name,handle:$("#siteHandle").value.trim()||DEFAULT_APPEARANCE.handle,description:$("#siteDescription").value.trim(),accent:$("#accentColor").value,layout:$("#profileLayout").value}; persistState(); applyAdminAccent(); applyAdminBranding(); addActivity("system","Appearance updated",`${APPEARANCE.name} · ${APPEARANCE.accent}`,"◐"); toast("Appearance saved. Refresh the public site to see the change."); };
  $("#resetAppearance").onclick=async()=>{ if(!confirm("Reset appearance settings and uploaded brand images to defaults?"))return; for(const key of ["appearance-logo","appearance-profile","appearance-banner"])try{await resetMediaFile(key)}catch{} APPEARANCE=clone(DEFAULT_APPEARANCE); persistState(); applyAdminAccent(); applyAdminBranding(); render("appearance"); toast("Appearance reset."); };
  $$('[data-preview]').forEach(b=>b.onclick=()=>{ $$('[data-preview]').forEach(x=>x.classList.toggle("active",x===b)); $("#sitePreview").classList.toggle("desktop",b.dataset.preview==="desktop"); });

  const spec={logo:{field:"logo",key:"appearance-logo",title:"Adjust site logo",width:700,height:700},profile:{field:"profileImage",key:"appearance-profile",title:"Adjust profile picture",width:800,height:800},banner:{field:"bannerImage",key:"appearance-banner",title:"Adjust banner",width:1400,height:440}};
  async function saveAsset(type,source){
    const cfg=spec[type];if(!cfg)return;
    try{
      let blob=source;
      if(!(blob instanceof Blob)) blob=await chooseAdjustedImage(cfg);
      if(!blob)return;
      if(source instanceof Blob) blob=await adjustImage(source,cfg);
      if(!blob)return;
      const url=await uploadMediaFile(cfg.key,blob);APPEARANCE[cfg.field]=url;persistState();addActivity("system",`${type} image updated`,"Brand image saved to backend storage.","◐");render("appearance");toast(`${type} image saved.`);
    }catch(error){toast(error.message)}
  }
  $$('[data-asset-replace]').forEach(b=>b.onclick=()=>saveAsset(b.dataset.assetReplace,null));
  $$('[data-asset-adjust]').forEach(b=>b.onclick=async()=>{const type=b.dataset.assetAdjust,cfg=spec[type],url=APPEARANCE[cfg.field];if(!url)return;try{const edited=await adjustImage(url,cfg);if(edited){const saved=await uploadMediaFile(cfg.key,edited);APPEARANCE[cfg.field]=saved;persistState();render("appearance");toast(`${type} image adjusted.`)}}catch(error){toast(error.message)}});
  $$('[data-asset-reset]').forEach(b=>b.onclick=async()=>{const type=b.dataset.assetReset,cfg=spec[type];try{await resetMediaFile(cfg.key);APPEARANCE[cfg.field]="";persistState();render("appearance");toast(`${type} image reset.`)}catch(error){toast(error.message)}});
}
function bindSettings(){
  $("#settingsForm").onsubmit=e=>{ e.preventDefault(); SETTINGS={language:$("#settingLanguage").value,timezone:$("#settingTimezone").value,currency:$("#settingCurrency").value,supportEmail:$("#settingSupportEmail").value.trim(),supportLabel:$("#settingSupportLabel").value.trim(),showSearch:$("#settingSearch").checked,showChat:$("#settingChat").checked,showSupport:$("#settingSupport").checked,preventSelection:$("#settingSelection").checked}; persistState(); addActivity("system","Site settings updated",`${SETTINGS.language} · ${SETTINGS.currency}`,"⚙"); toast("Site settings saved in Admin frontend. Public sync comes with backend."); };
  loadDemo();
}
function bindStories(){
  $("#storySearch").oninput=renderStoryFilter; $("#storyVisibility").onchange=renderStoryFilter;
  $("#selectAll").onchange=e=>{ $$('[data-select-story]').forEach(c=>c.checked=e.target.checked); updateBulk(); };
  $$('[data-bulk]').forEach(b=>b.onclick=async()=>{ const ids=$$('[data-select-story]:checked').map(x=>x.dataset.selectStory); if(!ids.length)return; const action=b.dataset.bulk; if(action==="delete"){await deleteAdminStories(ids);return} stories.forEach(s=>{if(ids.includes(s.id))s.visible=action==="show"}); persistState(); addActivity("story","Bulk story action",`${action} applied to ${ids.length} stories.`,"▦"); renderStoryFilter(); updateCounts(); toast("Bulk action saved."); });
  bindStoryRows();
}
function renderStoryFilter(){
  const q=$("#storySearch")?.value.trim().toLowerCase()||"", vis=$("#storyVisibility")?.value||"all";
  const list=stories.filter(s=>(!q||`${s.title} ${s.genre}`.toLowerCase().includes(q))&&(vis==="all"||(vis==="visible"?s.visible:!s.visible))).sort((a,b)=>a.order-b.order);
  $("#storyBody").innerHTML=storyRows(list); $("#storySummary").textContent=`Showing ${list.length} of ${stories.length} stories`; bindStoryRows();
}
function bindStoryRows(){
  $$('[data-edit-story]').forEach(b=>b.onclick=()=>storyEditor(b.dataset.editStory));
  $$('[data-toggle-story]').forEach(b=>b.onclick=()=>{ const s=stories.find(x=>x.id===b.dataset.toggleStory); if(!s)return; s.visible=!s.visible; persistState(); addActivity("story","Story visibility changed",`${s.title} is now ${s.visible?"visible":"hidden"}.`,"▦"); renderStoryFilter(); updateCounts(); toast(`${s.title} is now ${s.visible?"visible":"hidden"}.`); });
  $$('[data-story-more]').forEach(b=>b.onclick=()=>storyMore(b.dataset.storyMore));
  $$('[data-select-story]').forEach(c=>c.onchange=updateBulk);
}
function updateBulk(){ const ids=$$('[data-select-story]:checked').map(x=>x.dataset.selectStory),bar=$("#bulk"); if(!bar)return; bar.classList.toggle("hidden",!ids.length); $("#bulkCount").textContent=ids.length; }

function bindAdd(tab){
  $$('[data-add-tab]').forEach(b=>{ b.classList.toggle("active",b.dataset.addTab===tab); b.onclick=()=>{ const t=b.dataset.addTab; $("#addPanel").innerHTML=t==="manual"?manualAdd():t==="drive"?driveAdd():coversAdd(); bindAdd(t); }; });
  if(tab==="manual"){
    bindStoryCoverPicker("m");
    $("#manualForm").onsubmit=async e=>{
      e.preventDefault();
      const title=$("#mTitle").value.trim(),drive=$("#mDrive").value.trim();
      if(!title||!drive){toast("Story title and Drive folder are required.");return}
      let id=slug(title),n=2;while(stories.some(s=>s.id===id))id=`${slug(title)}-${n++}`;
      const file=$("#mCoverFile")?._coverFile||$("#mCoverFile")?.files?.[0]||null;
      let cover=$("#mCover").value.trim()||generatedCoverUrl(id);
      try{if(file)cover=await uploadCoverFile(id,file)}catch(error){toast(error.message);return}
      const requestedOrder=Number($("#mOrder").value);
      const story={id,title,genre:$("#mGenre").value.trim()||"Unverified",description:$("#mDescription").value.trim(),cover,visible:$("#mVisible").checked,order:Number.isFinite(requestedOrder)&&requestedOrder>0?requestedOrder:nextStoryOrder(),checked:"Never",lock:false,driveUrl:drive};
      stories.push(story);persistState();updateCounts();addActivity("story","Story added",`${story.title} added to the D1 Story Library.`,"＋");
      if(backendSyncReady){clearTimeout(backendSyncTimer);await syncCoreToBackend()}
      toast(file?"Story saved with its uploaded cover.":"Story saved with its own generated cover.");
      render("stories");
    };
  }
  if(tab==="drive"){
    $("#driveConnectionInfo").onclick=async()=>{try{const s=await backendJson("/api/admin/integrations/status");const d=s.googleDrive||{};toast(d.status==="Connected"?"Google Drive / Apps Script scanner is connected.":(d.error||"Google Drive / Apps Script is not connected yet. Run SETUP-GOOGLE-DRIVE.bat."))}catch(error){toast(error.message)}};
    $("#analyzeDrive").onclick=async()=>{
      const button=$("#analyzeDrive");
      if(activeDriveScanController&&!activeDriveScanController.signal.aborted){
        button.disabled=true;button.textContent="Stopping…";activeDriveScanController.abort();toast("Stopping Drive scan…");return;
      }
      const links=extractDriveInputs($("#driveLinks").value);if(!links.length){toast("Paste at least one Drive folder link.");return}
      button.disabled=false;button.textContent="■ Stop scan";button.classList.add("danger");
      activeDriveScanController=new AbortController();const scanSignal=activeDriveScanController.signal;
      const progressBox=$("#driveLiveProgress"),progressLines=$("#driveLiveProgressLines"),progressState=new Map();
      if(progressBox)progressBox.classList.remove("hidden");if(progressLines)progressLines.innerHTML="";
      const drawProgress=info=>{
        const current=progressState.get(info.rootIndex)||{scan:"",done:""};
        if(info.phase==="chunk")current.scan=`[${info.rootIndex}/${info.totalRoots}] Scanning root ${info.rootId} ... chunk ${info.chunk} · ${info.folders} folders read · ${info.pending} pending`;
        if(info.phase==="done"){current.scan=`[${info.rootIndex}/${info.totalRoots}] Scanning root ${info.rootId} ... chunk ${info.chunk} · ${info.folders} folders read · 0 pending`;current.done=`OK · ${info.folders} folders · ${info.stories} stories · ${(info.elapsedMs/1000).toFixed(1)}s total · ${info.chunk} chunks`}
        if(info.phase==="error"){current.scan=`[${info.rootIndex}/${info.totalRoots}] Scanning root ${info.rootId} ...`;current.done=`ERROR after ${(info.elapsedMs/1000).toFixed(1)}s · ${info.error}`}
        progressState.set(info.rootIndex,current);button.textContent="■ Stop scan";
        if(progressLines)progressLines.innerHTML=[...progressState.keys()].sort((a,b)=>a-b).map(key=>{const row=progressState.get(key);return `<div style="padding-bottom:7px;border-bottom:1px solid #e5ecee"><div>${esc(row.scan)}</div>${row.done?`<div style="margin-top:2px;font-weight:800;color:${row.done.startsWith("ERROR")?"#a52b2b":"#196c57"}">${esc(row.done)}</div>`:""}</div>`}).join("");
      };
      try{
        const result=await analyzeDriveWithProgress(links,drawProgress,scanSignal);
        const incoming=(result.stories||[]).map((item,index)=>{
          const best=bestStoryMatch(item.title),isExistingDuplicate=Boolean(best.story&&best.score>=DRIVE_DUPLICATE_THRESHOLD);
          return {...item,matchId:isExistingDuplicate?best.story.id:"",matchTitle:isExistingDuplicate?best.story.title:"",matchStory:isExistingDuplicate?best.story:null,similarity:isExistingDuplicate?best.score:0,action:isExistingDuplicate?(best.score>=.97?"keep":"review"):"import",index,scanGroup:[],scanGroupSize:1};
        });
        pendingDriveBoundaryReviews=(result.ambiguous||[]).map((review,index)=>({...review,index,choice:""}));

        // Cluster near-identical titles found in different pasted roots. This lets Admin
        // choose the correct Drive owner/root instead of silently importing both copies.
        const parent=incoming.map((_,i)=>i);const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
        for(let i=0;i<incoming.length;i++)for(let j=i+1;j<incoming.length;j++)if(titleSimilarity(incoming[i].title,incoming[j].title)>=DRIVE_DUPLICATE_THRESHOLD)join(i,j);
        const groups=new Map();incoming.forEach((_,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i)});
        for(const indexes of groups.values())if(indexes.length>1){indexes.forEach((idx,pos)=>{incoming[idx].scanGroup=indexes.filter(x=>x!==idx);incoming[idx].scanGroupSize=indexes.length;if(!incoming[idx].matchId)incoming[idx].action=pos===0?"import":"skip"})}
        pendingDriveImport=incoming;

        const duplicateGroups=[...groups.values()].filter(g=>g.length>1).length;
        const existingDupes=incoming.filter(x=>x.matchId).length;
        const dupes=duplicateGroups+existingDupes,ready=incoming.filter(x=>x.action==="import").length,boundaryReviews=pendingDriveBoundaryReviews.length;
        const seconds=Number(result.elapsedMs||0)>0?` · ${(Number(result.elapsedMs)/1000).toFixed(1)}s scanner time`:"";
        $("#driveResults").classList.remove("hidden");$("#driveResultText").textContent=`${result.scannedFolders} folders checked from ${result.roots} pasted root${result.roots===1?"":"s"}${seconds}.`;
        $("#driveDuplicateBadge").textContent=boundaryReviews?`${dupes} duplicate · ${boundaryReviews} boundary review${boundaryReviews===1?"":"s"}`:`${dupes} duplicate review${dupes===1?"":"s"}`;
        $("#driveSummary").innerHTML=`<span><strong>${result.roots}</strong><small>roots</small></span><span><strong>${result.scannedFolders}</strong><small>folders checked</small></span><span><strong>${pendingDriveImport.length}</strong><small>stories found</small></span><span><strong>${boundaryReviews}</strong><small>needs review</small></span><span><strong>${ready}</strong><small>ready</small></span>`;
        const rootErrors=(result.rootResults||[]).filter(x=>x&&x.ok===false);
        const warnings=rootErrors.length?`<div style="padding:10px 0 4px;color:#9b4d00"><strong>${rootErrors.length} root link${rootErrors.length===1?"":"s"} could not be scanned.</strong>${rootErrors.map(r=>`<small style="display:block;margin-top:4px">${driveLink(r.rootDriveUrl||"","Open root")} · ${esc(r.error||"Unknown Drive error")}</small>`).join("")}</div>`:"";
        const boundaryHtml=pendingDriveBoundaryReviews.length?`<div style="padding:12px 0"><strong>${pendingDriveBoundaryReviews.length} folder branch${pendingDriveBoundaryReviews.length===1?"":"es"} need a story-boundary choice.</strong><small style="display:block;margin:4px 0 10px">The scanner did not guess. Choose the real story folder, or Ignore if the branch is only content.</small>${pendingDriveBoundaryReviews.map((review,i)=>`<div class="duplicate" data-boundary-row="${i}"><span><strong>${esc(review.folderPath||review.rootFolderName||"Ambiguous Drive branch")}</strong><small>${esc(review.reason||"Folder structure is ambiguous.")}</small>${driveSourceLine(review,"Scanned root")}</span><span class="duplicate-actions" data-boundary-actions="${i}">${(review.options||[]).map((opt,j)=>`<button type="button" data-boundary-choice="${j}">Use ${esc(opt.title||"this folder")}</button>`).join("")}<button type="button" data-boundary-choice="ignore">Ignore</button></span></div>`).join("")}</div>`:"";
        $("#dupes").innerHTML=warnings+boundaryHtml+(pendingDriveImport.length?pendingDriveImport.map((item,i)=>{
          const existing=item.matchStory;
          const scannedSource=driveSourceLine(item,"Scanned root");
          const storyFolder=`<small style="display:block;margin-top:3px"><strong>Story folder:</strong> ${driveLink(item.driveUrl,"Open story folder")}</small>`;
          const existingInfo=existing?`<small style="display:block;margin-top:6px"><strong>${Math.round(item.similarity*100)}% title match:</strong> ${esc(existing.title)}</small>${driveSourceLine(existing,"Existing root")}${existing.driveUrl?`<small style="display:block;margin-top:3px"><strong>Existing story folder:</strong> ${driveLink(existing.driveUrl,"Open existing folder")}</small>`:`<small style="display:block;margin-top:3px">Existing story was added manually / has no Drive folder saved.</small>`}`:"";
          const scanAlternatives=item.scanGroup?.length?`<small style="display:block;margin-top:7px"><strong>Also found in this same scan (${item.scanGroupSize} copies):</strong></small>${item.scanGroup.map(ix=>{const other=pendingDriveImport[ix];return `<small style="display:block;margin-top:3px">${esc(other.title)} · ${driveLink(other.rootDriveUrl,other.rootFolderName||"Drive root")} · ${esc(other.rootOwnerEmail||"Owner email unavailable")}</small>`}).join("")}`:"";
          const isExisting=Boolean(item.matchId);
          const sub=isExisting?`${Math.round(item.similarity*100)}% strong duplicate match with ${esc(item.matchTitle)}`:(item.scanGroupSize>1?`Possible duplicate inside this scan · ${item.scanGroupSize} copies found`:"New story");
          const actions=isExisting?`<button data-drive-action="keep" class="${item.action==="keep"?"active":""}">Keep Existing</button><button data-drive-action="replace" class="${item.action==="review"||item.action==="replace"?"active":""}">Use New</button><button data-drive-action="both" class="${item.action==="both"?"active":""}">Keep Both</button>`:`<button data-drive-action="import" class="${item.action==="import"?"active":""}">Import this</button><button data-drive-action="skip" class="${item.action==="skip"?"active":""}">Skip</button>`;
          return `<div class="duplicate"><span><strong>${esc(item.title)}</strong><small>${sub}</small>${scannedSource}${storyFolder}${existingInfo}${scanAlternatives}</span><span class="duplicate-actions" data-drive-actions="${i}">${actions}</span></div>`;
        }).join(""):`<div class="empty">No story folders were discovered under these roots.</div>`);
        $$('[data-boundary-actions]').forEach(group=>$$('[data-boundary-choice]',group).forEach(btn=>btn.onclick=()=>{const review=pendingDriveBoundaryReviews[Number(group.dataset.boundaryActions)];review.choice=btn.dataset.boundaryChoice;$$('[data-boundary-choice]',group).forEach(x=>x.classList.toggle("active",x===btn))}));
        $$('[data-drive-actions]').forEach(group=>$$('[data-drive-action]',group).forEach(btn=>btn.onclick=()=>{const item=pendingDriveImport[Number(group.dataset.driveActions)];item.action=btn.dataset.driveAction;$$('[data-drive-action]',group).forEach(x=>x.classList.toggle("active",x===btn))}));
        toast(`${pendingDriveImport.length} story folders found${pendingDriveBoundaryReviews.length?` · ${pendingDriveBoundaryReviews.length} need boundary review`:""}.`);
      }catch(error){if(error?.name==="AbortError"||scanSignal.aborted){toast("Drive scan stopped. No partial scan was imported.");if(progressLines)progressLines.insertAdjacentHTML("beforeend",`<div style="font-weight:800;color:#8a4d00">STOPPED by Admin.</div>`)}else toast(error.message)}finally{button.disabled=false;button.textContent="Scan Drive folders";button.classList.remove("danger");if(activeDriveScanController?.signal===scanSignal)activeDriveScanController=null}
    };
    $("#confirmImport").onclick=async()=>{
      if(!pendingDriveImport.length&&!pendingDriveBoundaryReviews.length){toast("Nothing to import.");return}
      const unresolved=pendingDriveBoundaryReviews.filter(r=>!r.choice);if(unresolved.length){toast(`Resolve or Ignore the ${unresolved.length} story-boundary review${unresolved.length===1?"":"s"} first.`);return}
      let imported=0,replaced=0,boundaryImported=0,boundarySkipped=0;
      for(const item of pendingDriveImport){
        if(["keep","skip","review"].includes(item.action))continue;
        const sourceFields={driveRootId:item.rootFolderId||"",driveRootUrl:item.rootDriveUrl||"",driveRootName:item.rootFolderName||"",driveRootOwnerEmail:item.rootOwnerEmail||"",drivePath:item.folderPath||""};
        if(item.action==="replace"&&item.matchId){const existing=stories.find(s=>s.id===item.matchId);if(existing){existing.driveUrl=item.driveUrl;existing.title=item.title||existing.title;Object.assign(existing,sourceFields);existing.checked="Never";replaced++;continue}}
        let id=slug(item.title),n=2;while(stories.some(s=>s.id===id))id=`${slug(item.title)}-${n++}`;
        stories.push({id,title:item.title,genre:"Unverified",description:"",cover:generatedCoverUrl(id),visible:true,order:nextStoryOrder(),checked:"Never",lock:false,driveUrl:item.driveUrl,...sourceFields});imported++;
      }
      for(const review of pendingDriveBoundaryReviews){
        if(review.choice==="ignore")continue;
        const option=(review.options||[])[Number(review.choice)];if(!option)continue;
        const best=bestStoryMatch(option.title||"");if(best.story&&best.score>=DRIVE_DUPLICATE_THRESHOLD){boundarySkipped++;continue}
        const already=pendingDriveImport.some(item=>item.action==="import"&&titleSimilarity(item.title,option.title)>=DRIVE_DUPLICATE_THRESHOLD);if(already){boundarySkipped++;continue}
        let id=slug(option.title||"story"),n=2;while(stories.some(s=>s.id===id))id=`${slug(option.title||"story")}-${n++}`;
        const sourceFields={driveRootId:review.rootFolderId||"",driveRootUrl:review.rootDriveUrl||"",driveRootName:review.rootFolderName||"",driveRootOwnerEmail:review.rootOwnerEmail||"",drivePath:option.folderPath||review.folderPath||""};
        stories.push({id,title:option.title||"Untitled Story",genre:"Unverified",description:"",cover:generatedCoverUrl(id),visible:true,order:nextStoryOrder(),checked:"Never",lock:false,driveUrl:option.driveUrl||"",...sourceFields});imported++;boundaryImported++;
      }
      persistState();updateCounts();if(backendSyncReady){clearTimeout(backendSyncTimer);await syncCoreToBackend()};addActivity("system","Drive import completed",`${imported} new stories imported · ${replaced} existing Drive links replaced${boundaryImported?` · ${boundaryImported} chosen from boundary review`:""}.`,"↔");toast(`${imported} imported · ${replaced} updated${boundarySkipped?` · ${boundarySkipped} boundary choice${boundarySkipped===1?"":"s"} skipped as duplicate`:""}.`);pendingDriveBoundaryReviews=[];render("stories");
    };
  }
  if(tab==="covers"){
    const releaseCoverPreviews=()=>pendingCoverMatches.forEach(m=>{if(m.previewUrl){URL.revokeObjectURL(m.previewUrl);m.previewUrl=""}});
    const ensurePreview=m=>{if(!m.previewUrl)m.previewUrl=URL.createObjectURL(m.file);return m.previewUrl};
    const resolveAutoCoverConflicts=()=>{
      const groups=new Map();pendingCoverMatches.forEach((m,i)=>{if(!m.storyId||m.manual)return;if(!groups.has(m.storyId))groups.set(m.storyId,[]);groups.get(m.storyId).push(i)});
      for(const indexes of groups.values())if(indexes.length>1){indexes.sort((a,b)=>Number(pendingCoverMatches[b].score||0)-Number(pendingCoverMatches[a].score||0));for(const i of indexes.slice(1)){const m=pendingCoverMatches[i];m.storyId="";m.note="Another image has a stronger automatic match for that story. Review manually if needed.";m.method="review"}}
    };
    const renderCoverMatches=()=>{
      const g=$("#coverMatches");if(!g)return;g.classList.toggle("hidden",pendingCoverMatches.length===0);$("#coverMatchActions")?.classList.toggle("hidden",pendingCoverMatches.length===0);
      const processing=$("#coverProcessingStatus"),processingTitle=$("#coverProcessingTitle"),processingText=$("#coverProcessingText"),apply=$("#applyCoverMatches");
      if(processing){processing.classList.toggle("hidden",pendingCoverMatches.length===0&&!coverMatchingBusy);if(processingTitle)processingTitle.textContent=coverMatchingBusy?`Reading cover titles ${coverMatchingDone}/${coverMatchingTotal}…`:"Cover matching ready";if(processingText)processingText.textContent=coverMatchingBusy?"Please wait. Apply stays locked until every selected cover has finished matching.":"Review any Do not apply rows, then apply the confirmed matches."}
      if(apply){apply.disabled=coverMatchingBusy||!pendingCoverMatches.some(m=>Boolean(m.storyId));apply.textContent=coverMatchingBusy?"Matching covers…":"Apply matched covers"}
      g.innerHTML=pendingCoverMatches.map((m,i)=>{
        const label=m.storyId?`${Math.round(Number(m.score||0)*100)}% ${m.method==="image"?"image-title match":m.method==="manual"?"manual match":"filename match"}`:(m.ocrPending?"Reading title text from image…":(m.note||"Do not apply — no confident title match"));
        return `<div class="cover-match" data-cover-row="${i}"><img src="${ensurePreview(m)}" alt=""><span><strong>${esc(m.name||"Cover image")}</strong><small data-cover-label="${i}">${esc(label)}</small><select data-cover-match="${i}"><option value="" ${m.storyId?"":"selected"}>Do not apply</option>${stories.map(st=>`<option value="${st.id}" ${st.id===m.storyId?"selected":""}>${esc(st.title)}</option>`).join("")}</select><span class="cover-match-tools"><button class="secondary small" type="button" data-cover-adjust="${i}">Adjust / zoom</button><button class="secondary small" type="button" data-cover-replace="${i}">Replace</button></span></span></div>`
      }).join("");
      $$('[data-cover-match]').forEach(sel=>sel.onchange=()=>{const m=pendingCoverMatches[Number(sel.dataset.coverMatch)];if(!m)return;m.storyId=sel.value;m.manual=true;m.method=sel.value?"manual":"review";m.score=sel.value?1:0;m.note=sel.value?"":"Do not apply selected manually.";const label=$(`[data-cover-label="${sel.dataset.coverMatch}"]`);if(label)label.textContent=sel.value?"Manual match":"Do not apply selected manually."});
      $$('[data-cover-adjust]').forEach(btn=>btn.onclick=async()=>{const i=Number(btn.dataset.coverAdjust),m=pendingCoverMatches[i];if(!m)return;try{const edited=await adjustImage(m.file,{title:`Adjust ${m.name||"story cover"}`,width:800,height:1000});if(edited){if(m.previewUrl)URL.revokeObjectURL(m.previewUrl);m.file=edited;m.previewUrl="";renderCoverMatches()}}catch(error){toast(error.message)}});
      $$('[data-cover-replace]').forEach(btn=>btn.onclick=async()=>{const i=Number(btn.dataset.coverReplace),m=pendingCoverMatches[i];if(!m)return;const file=await pickImageFile();if(!file)return;if(m.previewUrl)URL.revokeObjectURL(m.previewUrl);const stem=file.name.replace(/\.[^.]+$/,""),best=bestStoryMatch(stem);Object.assign(m,{file,name:file.name,previewUrl:"",storyId:best.story&&best.score>=COVER_STRONG_FILENAME_THRESHOLD?best.story.id:"",score:best.score,method:"filename",manual:false,note:"",ocrPending:false});renderCoverMatches();await smartMatchCover(i,true)});
    };
    const smartMatchCover=async(i,force=false,sharedWorker=null)=>{
      const m=pendingCoverMatches[i];if(!m||m.manual)return;
      if(!force&&Number(m.score||0)>=COVER_STRONG_FILENAME_THRESHOLD)return;
      const controlsOwnBusy=Boolean(force&&!sharedWorker),previousBusy=coverMatchingBusy;
      if(controlsOwnBusy){coverMatchingBusy=true;coverMatchingDone=0;coverMatchingTotal=1}
      m.ocrPending=true;renderCoverMatches();let worker=sharedWorker,ownWorker=false;
      try{
        if(!worker){const lib=await loadCoverOcrLibrary();worker=await lib.createWorker("eng",1);ownWorker=true}
        const text=await readCoverImageText(m.file,worker),ocrBest=bestStoryMatchFromImageText(text);m.ocrText=text;m.ocrPending=false;
        if(ocrBest.story&&ocrBest.score>=.64&&(!m.storyId||ocrBest.score>Number(m.score||0)+.035)){m.storyId=ocrBest.story.id;m.score=ocrBest.score;m.method="image";m.note=""}
        else if(!m.storyId){m.storyId="";m.note=text?"Image title was read, but no story match was confident enough.":"No readable story title was found in the image.";m.method="review"}
      }catch(error){m.ocrPending=false;if(!m.storyId){m.note="Image-title matching unavailable; review this cover manually.";m.method="review"}if(force)toast(error.message||"Image-title matching was unavailable.")}
      finally{if(ownWorker&&worker)try{await worker.terminate()}catch{}if(controlsOwnBusy){coverMatchingBusy=previousBusy;coverMatchingDone=1;coverMatchingTotal=1}}
      resolveAutoCoverConflicts();renderCoverMatches();
    };
    const loadCoverFiles=async filesInput=>{
      const files=[...filesInput].filter(file=>String(file.type||"").startsWith("image/"));if(!files.length){toast("No supported image files were selected.");return}
      releaseCoverPreviews();
      pendingCoverMatches=files.map(file=>{const stem=file.name.replace(/\.[^.]+$/,""),best=bestStoryMatch(stem),accepted=Boolean(best.story&&best.score>=COVER_STRONG_FILENAME_THRESHOLD);return {file,name:file.name,storyId:accepted?best.story.id:"",score:best.score,previewUrl:"",method:"filename",manual:false,note:accepted?"":"",ocrPending:false}});
      resolveAutoCoverConflicts();
      const indexes=pendingCoverMatches.map((m,i)=>(!m.storyId||Number(m.score||0)<COVER_STRONG_FILENAME_THRESHOLD)?i:-1).filter(i=>i>=0);
      coverMatchingBusy=indexes.length>0;coverMatchingDone=0;coverMatchingTotal=indexes.length;renderCoverMatches();
      if(!indexes.length){toast(`${files.length} covers matched confidently from filenames.`);return}
      let worker=null;
      try{
        toast(`${files.length} covers loaded · checking visible title text only where filenames are not strong enough.`);
        const lib=await loadCoverOcrLibrary();worker=await lib.createWorker("eng",1);
        for(let n=0;n<indexes.length;n++){
          const i=indexes[n],m=pendingCoverMatches[i];if(!m||m.manual){coverMatchingDone++;renderCoverMatches();continue}
          m.ocrPending=true;renderCoverMatches();
          const text=await readCoverImageText(m.file,worker),ocrBest=bestStoryMatchFromImageText(text);m.ocrText=text;m.ocrPending=false;
          if(ocrBest.story&&ocrBest.score>=.66){m.storyId=ocrBest.story.id;m.score=ocrBest.score;m.method="image";m.note=""}
          else if(bestStoryMatch(m.name.replace(/\.[^.]+$/,""))?.story&&Number(m.score||0)>=COVER_AUTO_MATCH_THRESHOLD){const fallback=bestStoryMatch(m.name.replace(/\.[^.]+$/,""));m.storyId=fallback.story.id;m.method="filename";m.note="Filename match used after image-title text was inconclusive."}
          else{m.storyId="";m.note=text?"Image title was read, but no story match was confident enough.":"No readable story title was found in the image.";m.method="review"}
          coverMatchingDone++;resolveAutoCoverConflicts();renderCoverMatches();
        }
        toast("Smart cover matching finished. Review Do not apply rows before saving.");
      }catch(error){
        pendingCoverMatches.forEach(m=>{m.ocrPending=false;if(!m.storyId&&!m.note)m.note="Image-title matching unavailable; review manually."});
        toast("Image-title matching could not finish. Strong filename matches are preserved; uncertain covers remain Do not apply.");
      }finally{
        if(worker)try{await worker.terminate()}catch{}
        coverMatchingBusy=false;coverMatchingDone=coverMatchingTotal;resolveAutoCoverConflicts();renderCoverMatches();
      }
    };
    $("#coverFiles").onchange=e=>loadCoverFiles(e.target.files);const coverFolder=$("#coverFolder");if(coverFolder)coverFolder.onchange=e=>loadCoverFiles(e.target.files);
    $("#clearCoverMatches").onclick=()=>{releaseCoverPreviews();$("#coverFiles").value="";if(coverFolder)coverFolder.value="";pendingCoverMatches=[];coverMatchingBusy=false;coverMatchingDone=0;coverMatchingTotal=0;renderCoverMatches()};
    $("#applyCoverMatches").onclick=async()=>{
      if(coverMatchingBusy){toast("Wait until cover title matching finishes first.");return}
      const matches=pendingCoverMatches.filter(m=>Boolean(m.storyId)).map(m=>({storyId:String(m.storyId||"").trim(),file:m.file,name:m.name})).filter(m=>m.storyId&&stories.some(st=>st.id===m.storyId));if(!matches.length){toast("Choose at least one story match.");return}
      const targets=new Map();for(const m of matches){if(!targets.has(m.storyId))targets.set(m.storyId,[]);targets.get(m.storyId).push(m)}const conflicts=[...targets.entries()].filter(([,rows])=>rows.length>1);if(conflicts.length){toast(`${conflicts.length} stor${conflicts.length===1?"y has":"ies have"} more than one selected cover. Set the extras to Do not apply first.`);return}
      let done=0;const applyButton=$("#applyCoverMatches");applyButton.disabled=true;
      try{for(const match of matches){applyButton.textContent=`Applying ${done+1}/${matches.length}…`;const cover=await uploadCoverFile(match.storyId,match.file),story=stories.find(st=>st.id===match.storyId);if(story){story.cover=cover;done++}}persistState();if(backendSyncReady){clearTimeout(backendSyncTimer);await syncCoreToBackend()}addActivity("story","Bulk covers applied",`${done} story covers uploaded.`,"▦");releaseCoverPreviews();pendingCoverMatches=[];render("add");toast(`${done} cover${done===1?"":"s"} applied successfully.`)}catch(error){toast(error.message)}finally{const b=$("#applyCoverMatches");if(b){b.disabled=false;b.textContent="Apply matched covers"}}
    };
  }
}
function bindChecks(){
  const ai=$("#manualAI");if(ai)ai.onclick=()=>manualAIDrawer();
  $$('[data-review]').forEach(b=>b.onclick=()=>statusReview(b.dataset.review));
}

let adminUsersLiveSyncPromise=null;
let adminUsersLastSyncAt=0;

async function syncAdminUsersLive({force=false}={}){
  if(!backendBooted||route!=="users"||document.visibilityState==="hidden")return false;
  if(adminUsersLiveSyncPromise)return adminUsersLiveSyncPromise;
  const now=Date.now();
  if(!force&&now-adminUsersLastSyncAt<2500)return false;
  adminUsersLastSyncAt=now;

  adminUsersLiveSyncPromise=(async()=>{
    try{
      const payload=await backendJson("/api/admin/users");
      USERS=Array.isArray(payload.users)?payload.users:[];
      persistLocalState();
      updateCounts();
      if(route==="users"&&$("#userBody"))renderUsersFilter();
      return true;
    }catch(error){
      console.warn("Admin Users live sync skipped",error);
      return false;
    }finally{
      adminUsersLiveSyncPromise=null;
    }
  })();
  return adminUsersLiveSyncPromise;
}

async function refreshUsersFromBackend({rerender=true}={}){
  try{
    const payload=await backendJson("/api/admin/users");
    USERS=Array.isArray(payload.users)?payload.users:[];
    persistLocalState();
    updateCounts();
    if(rerender&&route==="users")render("users",{keepScroll:true});
    return true;
  }catch(error){
    toast(error.message||"Unable to refresh users.");
    return false;
  }
}
function selectedUserIds(){ return $$('[data-select-user]:checked').map(x=>x.dataset.selectUser); }
function updateUserBulk(){
  const ids=selectedUserIds(), bar=$("#userBulk"), count=$("#userBulkCount");
  if(bar)bar.classList.toggle("hidden",ids.length===0);
  if(count)count.textContent=ids.length;
  const boxes=$$('[data-select-user]'),all=$("#selectAllUsers");
  if(all){all.checked=boxes.length>0&&boxes.every(x=>x.checked);all.indeterminate=boxes.some(x=>x.checked)&&!all.checked}
}
function bindUserRows(){
  $$('[data-user]').forEach(b=>b.onclick=()=>openUser(b.dataset.user));
  $$('[data-edit-user]').forEach(b=>b.onclick=()=>editUser(b.dataset.editUser));
  $$('[data-delete-user]').forEach(b=>b.onclick=()=>deleteUsers([b.dataset.deleteUser]));
  $$('[data-select-user]').forEach(c=>c.onchange=updateUserBulk);
  updateUserBulk();
}

async function loadTelegramSetupStatus(){
  const target=$("#telegramSetupStatus");if(!target)return;
  target.innerHTML='<div class="empty compact">Checking Telegram configuration…</div>';
  try{
    const p=await backendJson("/api/admin/telegram/setup");
    const bot=p.bot?.username?`@${p.bot.username}`:"Not verified";
    const channel=p.channel?.title||"Not verified";
    const webhook=p.webhook?.url||"Not configured";
    const error=p.webhook?.lastErrorMessage||"";
    target.innerHTML=`<div class="telegram-admin-status-grid">
      <div><span>Worker secrets</span><strong>${p.configured?"Configured":"Missing"}</strong></div>
      <div><span>Bot</span><strong>${esc(bot)}</strong></div>
      <div><span>Channel</span><strong>${esc(channel)}</strong></div>
      <div><span>Invite permission</span><strong>${p.canInviteUsers?"Enabled":"Missing"}</strong></div>
      <div class="wide"><span>Webhook</span><strong>${esc(webhook)}</strong></div>
      ${error?`<div class="wide telegram-admin-error"><span>Telegram error</span><strong>${esc(error)}</strong></div>`:""}
    </div>`;
    const setup=$("#configureTelegramWebhook");
    if(setup){
      const expectedWebhook="https://oxnovels.top/api/telegram/webhook";
      const webhookConnected=String(p.webhook?.url||"")===expectedWebhook && !p.webhook?.lastErrorMessage;
      setup.disabled=!p.configured || webhookConnected;
      setup.textContent=webhookConnected ? "Webhook connected ✓" : "Verify & configure webhook";
    }
  }catch(error){
    target.innerHTML=`<div class="empty compact">${esc(error.message||"Unable to check Telegram.")}</div>`;
    const setup=$("#configureTelegramWebhook");
    if(setup){setup.disabled=false;setup.textContent="Verify & configure webhook"}
  }
}
function openTelegramSetup(){
  openDrawer(`<span class="drawer-kicker">Users</span><h2 id="drawerTitle">Telegram Backup Setup</h2>
    <p class="drawer-sub">Verify @OXNovelsBackupBot, the private OX Novels Backup channel and Telegram webhook.</p>
    <div class="drawer-section"><div id="telegramSetupStatus"><div class="empty compact">Checking Telegram configuration…</div></div>
      <div class="admin-repair-warning"><strong>Required Worker secrets:</strong> TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID and TELEGRAM_WEBHOOK_SECRET. Never paste the bot token into this Admin page.</div>
      <div class="form-actions"><button class="primary" type="button" id="configureTelegramWebhook">Verify & configure webhook</button><button class="secondary" type="button" id="refreshTelegramSetup">Refresh</button></div>
    </div>`);
  $("#configureTelegramWebhook").onclick=async()=>{
    const b=$("#configureTelegramWebhook");b.disabled=true;b.textContent="Configuring…";
    try{
      const p=await backendJson("/api/admin/telegram/setup",{method:"POST",body:"{}"});
      toast(`Telegram connected · ${p.channel?.title||"channel"} · webhook active.`);
      b.textContent="Webhook connected ✓";
      await loadTelegramSetupStatus();
    }catch(error){
      toast(error.message||"Unable to configure Telegram webhook.");
      b.disabled=false;
      b.textContent="Verify & configure webhook"
    }
  };
  $("#refreshTelegramSetup").onclick=()=>void loadTelegramSetupStatus();
  void loadTelegramSetupStatus();
}

function bindUsers(){
  $("#userSearch").oninput=renderUsersFilter;
  $("#userFilter").onchange=renderUsersFilter;
  $("#telegramSetup").onclick=()=>openTelegramSetup();
  $("#refreshUsers").onclick=()=>refreshUsersFromBackend();
  $("#exportUsers").onclick=()=>csv("ox-novels-users.csv",[["Name","Email","Account","Access status","Membership","Lifetime stories","Plan","Renewal"],...USERS.map(u=>[u.name,u.email,u.account,adminAccessStatusText(u),u.membership,lifetimeOwnedCount(u),adminDisplayPlan(u),u.renewal])]);
  $("#selectAllUsers").onchange=e=>{$$('[data-select-user]').forEach(c=>c.checked=e.target.checked);updateUserBulk()};
  $("#deleteSelectedUsers").onclick=()=>deleteUsers(selectedUserIds());
  bindUserRows();
}
function filteredUsers(){ const q=$("#userSearch")?.value.trim().toLowerCase()||"",f=$("#userFilter")?.value||"all"; return USERS.filter(u=>(!q||`${u.name} ${u.email}`.toLowerCase().includes(q))&&(f==="all"||(f==="active"&&u.membership==="Active")||(f==="expired"&&u.membership==="Expired")||(f==="blocked"&&u.account==="Blocked")||(f==="granted"&&u.membership==="Granted")||(f==="lifetime"&&lifetimeOwnedCount(u)>0))); }
function renderUsersFilter(){ const list=filteredUsers(); $("#userBody").innerHTML=usersRows(list); const summary=$("#userSummary");if(summary)summary.textContent=`Showing ${list.length} of ${USERS.length} real D1 users`; const all=$("#selectAllUsers");if(all){all.checked=false;all.indeterminate=false} bindUserRows(); }

function chatInitials(name="") { return String(name).trim().split(/\s+/).filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"U"; }
function chatRealUser(c){ return USERS.find(u=>u.id===c.userId||u.id===c.id||u.email===c.email); }
function chatUserTimezone(c){ const u=chatRealUser(c); return c.timezone||c.userTimezone||u?.timezone||""; }
function chatAdminTimezone(){ return Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"; }
function chatClock(value,zone=""){
  const d=value instanceof Date?value:new Date(value); if(!Number.isFinite(d.getTime()))return "—";
  try{return new Intl.DateTimeFormat([], {hour:"numeric",minute:"2-digit",timeZone:zone||undefined}).format(d)}catch{return d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}
}
function chatRelative(value){
  const d=value instanceof Date?value:new Date(value); if(!Number.isFinite(d.getTime()))return "";
  const sec=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));
  if(sec<45)return "just now"; const min=Math.floor(sec/60); if(min<60)return `${min} min ago`;
  const hr=Math.floor(min/60),rem=min%60; if(hr<24)return rem?`${hr} hr ${rem} min ago`:`${hr} hr ago`;
  const day=Math.floor(hr/24); return day===1?"yesterday":`${day} days ago`;
}
function chatReceipt(state=""){
  const value=String(state).toLowerCase();
  if(value==="seen")return '<span class="admin-chat-receipt is-seen" title="Seen" aria-label="Seen">✓✓</span>';
  if(value==="delivered")return '<span class="admin-chat-receipt is-delivered" title="Delivered" aria-label="Delivered">✓✓</span>';
  return '<span class="admin-chat-receipt is-sent" title="Sent" aria-label="Sent">✓</span>';
}
function setAdminChatMobileMode(open){
  const shell=document.querySelector('.admin-chat-ui');
  if(!shell)return;
  shell.classList.toggle('mobile-chat-open',Boolean(open));
}
function bindAdminJumpLatest(){
  const messages=$("#messages"),pane=document.querySelector('.admin-chat-ui .message-pane');
  if(!messages||!pane)return;
  let jump=pane.querySelector('.admin-chat-jump-latest');
  if(!jump){
    jump=document.createElement('button');jump.type='button';jump.className='admin-chat-jump-latest';jump.hidden=true;
    jump.setAttribute('aria-label','Jump to newest messages');jump.setAttribute('title','Jump to newest messages');jump.innerHTML='<span aria-hidden="true">↓</span>';pane.append(jump);
  }
  const update=()=>{const distance=messages.scrollHeight-messages.scrollTop-messages.clientHeight;jump.hidden=distance<72||!activeConv};
  messages.onscroll=update;jump.onclick=()=>{messages.scrollTo({top:messages.scrollHeight,behavior:'smooth'});setTimeout(update,180)};requestAnimationFrame(update);
}
async function pollAdminChatStatus(){
  if(!backendBooted)return;
  try{
    const payload=await backendJson('/api/admin/chat/status',{headers:{}});
    backendChatReady=true;backendChatUnreadTotal=Number(payload.unread||0);updateCounts();
    if(route==='chat'){const badge=$("#chatUnreadBadge");if(badge){badge.textContent=`${backendChatUnreadTotal} unread`;badge.classList.toggle('hidden',backendChatUnreadTotal===0)}}
  }catch{}
}
function startAdminChatStatusPolling(){
  if(adminChatStatusTimer)clearInterval(adminChatStatusTimer);
  void pollAdminChatStatus();
  adminChatStatusTimer=setInterval(pollAdminChatStatus,8000);
}
async function loadAdminChatConversations({keepSelection=true}={}){
  const payload=await backendJson('/api/admin/chat/conversations',{headers:{}});
  CHAT_CONV=Array.isArray(payload.conversations)?payload.conversations:[];
  backendChatReady=true;backendChatUnreadTotal=CHAT_CONV.reduce((n,c)=>n+Number(c.unread||0),0);
  if(!keepSelection||!CHAT_CONV.some(c=>c.id===activeConv))activeConv='';
  updateCounts();
  return CHAT_CONV;
}
async function loadAdminChatMessages(userId,{seen=true,forceBottom=false}={}){
  if(!userId)return;
  const c=CHAT_CONV.find(x=>x.id===userId);if(!c)return;
  const messagesEl=$("#messages"),nearBottom=messagesEl?messagesEl.scrollHeight-messagesEl.scrollTop-messagesEl.clientHeight<84:true;
  const payload=await backendJson(`/api/admin/chat/messages/${encodeURIComponent(userId)}${seen?'?seen=1':''}`,{headers:{}});
  c.messages=(Array.isArray(payload.messages)?payload.messages:[]).map(m=>({
    id:m.id,side:m.sender==='admin'?'out':'in',text:m.body,sentAt:m.createdAt,state:m.state||'sent'
  }));
  if(seen){
    c.unread=0;backendChatUnreadTotal=CHAT_CONV.reduce((n,x)=>n+Number(x.unread||0),0);
    let noticeChanged=false;
    NOTICES.forEach(n=>{if(n.type==="chat"&&String(n.userId||"")===String(userId)&&n.unread){n.unread=false;noticeChanged=true}});
    updateCounts();renderConv();
    if(noticeChanged&&route==="notifications")renderNotices(document.querySelector('[data-notice-filter].active')?.dataset.noticeFilter||"all");
  }
  renderMessages({forceBottom:forceBottom||nearBottom});
}
async function refreshAdminChat({loadMessages=true}={}){
  try{
    await loadAdminChatConversations({keepSelection:true});
    renderConv();
    if(activeConv&&loadMessages)await loadAdminChatMessages(activeConv,{seen:true,forceBottom:false});
    else renderMessages();
  }catch(error){
    const target=$("#convList");if(target&&!CHAT_CONV.length)target.innerHTML=`<div class="empty">${esc(error.message||'Unable to load Chat.')}</div>`;
  }
}

let CHAT_BROADCAST_PREVIEW=null;

function broadcastHistoryTime(value){
  const d=new Date(value||"");if(Number.isNaN(d.getTime()))return "—";
  return d.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function broadcastRecipientSummary(item){
  const bits=[item.membership&&item.membership!=="None"?item.membership:"",Number(item.lifetimeCount||0)>0?`${Number(item.lifetimeCount)} Lifetime`:""].filter(Boolean);
  return bits.join(" · ")||"Paid once · Chat enabled";
}
function invalidateBroadcastPreview(){
  CHAT_BROADCAST_PREVIEW=null;
  const box=$("#broadcastPreview");
  if(box)box.innerHTML='<span class="muted">Preview recipients before sending.</span>';
  const send=$("#sendBroadcast");if(send)send.disabled=true;
}
function updateBroadcastAudienceFields(){
  const audience=$("#broadcastAudience")?.value||"all";
  const random=$("#broadcastRandomWrap"),selected=$("#broadcastSelectedWrap");
  if(random)random.hidden=audience!=="random";
  if(selected)selected.hidden=audience!=="selected";
  invalidateBroadcastPreview();
}
function selectedBroadcastUserIds(){
  return $$("[data-broadcast-user]:checked").map(input=>String(input.dataset.broadcastUser));
}
function renderBroadcastSelectedUsers(query=""){
  const target=$("#broadcastUserList");if(!target)return;
  const q=String(query||"").trim().toLowerCase();
  const list=CHAT_CONV.filter(c=>!q||`${c.user} ${c.email||""} ${c.status||""}`.toLowerCase().includes(q));
  target.innerHTML=list.length?list.map(c=>`<label class="broadcast-user-choice"><input type="checkbox" data-broadcast-user="${esc(c.id)}"><span><strong>${esc(c.user)}</strong><small>${esc(c.email||c.status||"Chat enabled")}</small></span></label>`).join(""):'<div class="empty">No Chat-enabled users match this search.</div>';
  $$("[data-broadcast-user]").forEach(input=>input.onchange=invalidateBroadcastPreview);
}
async function loadBroadcastHistory(){
  const target=$("#broadcastHistory");if(!target)return;
  target.innerHTML='<div class="empty">Loading broadcast history…</div>';
  try{
    const payload=await backendJson("/api/admin/chat/broadcasts?limit=12");
    const rows=Array.isArray(payload.broadcasts)?payload.broadcasts:[];
    target.innerHTML=rows.length?rows.map(row=>`<div class="broadcast-history-row"><div><strong>${esc(row.audienceLabel||"Broadcast")}</strong><small>${Number(row.recipientCount||0)} recipient${Number(row.recipientCount||0)===1?"":"s"} · ${esc(broadcastHistoryTime(row.createdAt))}</small></div><p>${esc(row.body||"")}</p></div>`).join(""):'<div class="empty">No broadcasts sent yet.</div>';
  }catch(error){target.innerHTML=`<div class="empty">${esc(error.message||"Unable to load broadcast history.")}</div>`}
}
async function previewBroadcastRecipients(){
  const audience=$("#broadcastAudience")?.value||"all";
  const randomCount=Number($("#broadcastRandomCount")?.value||5);
  const selectedIds=audience==="selected"?selectedBroadcastUserIds():[];
  if(audience==="selected"&&!selectedIds.length){toast("Select at least one user.");return}

  const button=$("#previewBroadcast"),box=$("#broadcastPreview");
  if(button){button.disabled=true;button.textContent="Previewing…"}
  try{
    const payload=await backendJson("/api/admin/chat/broadcast/preview",{method:"POST",body:JSON.stringify({audience,randomCount,selectedIds})});
    CHAT_BROADCAST_PREVIEW=payload;
    const names=(payload.recipients||[]).map(item=>`<span class="broadcast-preview-user"><strong>${esc(item.name)}</strong><small>${esc(broadcastRecipientSummary(item))}</small></span>`).join("");
    box.innerHTML=`<div class="broadcast-preview-count"><strong>${Number(payload.count||0)}</strong><span>recipient${Number(payload.count||0)===1?"":"s"} · ${esc(payload.audienceLabel||"Audience")}</span></div>${names?`<div class="broadcast-preview-users">${names}</div>`:""}${payload.truncated?'<small class="muted">Showing the first 20 recipients.</small>':""}`;
    const send=$("#sendBroadcast");if(send)send.disabled=Number(payload.count||0)===0;
  }catch(error){CHAT_BROADCAST_PREVIEW=null;box.innerHTML=`<div class="callout">${esc(error.message||"Unable to preview recipients.")}</div>`;const send=$("#sendBroadcast");if(send)send.disabled=true}
  finally{if(button){button.disabled=false;button.textContent="Preview recipients"}}
}
async function sendChatBroadcast(){
  const text=$("#broadcastBody")?.value.trim()||"";
  if(!text){toast("Write a broadcast message first.");return}
  if(!CHAT_BROADCAST_PREVIEW||!Number(CHAT_BROADCAST_PREVIEW.count||0)){toast("Preview recipients first.");return}

  const count=Number(CHAT_BROADCAST_PREVIEW.count||0);
  const label=CHAT_BROADCAST_PREVIEW.audienceLabel||"selected audience";
  if(!confirm(`Send this message to ${count} user${count===1?"":"s"}?\n\nAudience: ${label}\n\nThis will appear in each user's existing OX Chat.`))return;

  const send=$("#sendBroadcast");if(send){send.disabled=true;send.textContent="Sending…"}
  try{
    const payload=await backendJson("/api/admin/chat/broadcast/send",{method:"POST",body:JSON.stringify({
      body:text,
      audience:CHAT_BROADCAST_PREVIEW.audience,
      audienceLabel:CHAT_BROADCAST_PREVIEW.audienceLabel,
      recipientIds:CHAT_BROADCAST_PREVIEW.recipientIds,
      randomCount:Number($("#broadcastRandomCount")?.value||5)
    })});
    closeDrawer();
    await loadAdminChatConversations({keepSelection:true});renderConv();
    if(activeConv)await loadAdminChatMessages(activeConv,{seen:true,forceBottom:false});
    toast(`Broadcast sent to ${Number(payload.count||0)} user${Number(payload.count||0)===1?"":"s"}.`);
  }catch(error){
    if(error.code==="RECIPIENTS_CHANGED")invalidateBroadcastPreview();
    toast(error.message||"Unable to send broadcast.");
    if(send){send.disabled=false;send.textContent="Send Broadcast"}
  }
}
async function openChatBroadcast(){
  if(!CHAT_CONV.length){
    try{await loadAdminChatConversations({keepSelection:true});renderConv()}catch(error){toast(error.message||"Unable to load Chat-enabled customers.");return}
  }
  CHAT_BROADCAST_PREVIEW=null;
  openDrawer(`<span class="drawer-kicker">Member Chat</span>
    <h2 id="drawerTitle">Broadcast Message</h2>
    <p class="drawer-sub">Send the same Admin message into multiple existing customer chats. Only permanently Chat-enabled paid customers can receive broadcasts.</p>
    <div class="drawer-section">
      <label class="field"><span>Message</span><textarea id="broadcastBody" rows="6" maxlength="2000" placeholder="Write your message…"></textarea><small>Maximum 2,000 characters.</small></label>
      <label class="field"><span>Send to</span><select id="broadcastAudience">
        <option value="all">All Chat-enabled users</option>
        <option value="active">Active members</option>
        <option value="lifetime">Lifetime Story customers</option>
        <option value="expired_cancelled">Expired / cancelled members</option>
        <option value="active_lifetime">Active + Lifetime users</option>
        <option value="selected">Selected users</option>
        <option value="random">Random users</option>
      </select></label>
      <div id="broadcastRandomWrap" hidden><label class="field"><span>Random recipients</span><select id="broadcastRandomCount"><option>5</option><option>10</option><option>25</option><option>50</option></select><small>If fewer users qualify, all available users are used.</small></label></div>
      <div id="broadcastSelectedWrap" hidden>
        <label class="field"><span>Select users</span><input id="broadcastUserSearch" placeholder="Search name or email"></label>
        <div class="broadcast-user-list" id="broadcastUserList"></div>
      </div>
      <div class="broadcast-preview" id="broadcastPreview"><span class="muted">Preview recipients before sending.</span></div>
      <div class="drawer-actions"><button class="secondary" type="button" id="previewBroadcast">Preview recipients</button><button class="primary" type="button" id="sendBroadcast" disabled>Send Broadcast</button></div>
    </div>
    <div class="drawer-section"><div class="broadcast-history-head"><h3>Recent broadcast history</h3><button class="text-btn" type="button" id="refreshBroadcastHistory">Refresh</button></div><div id="broadcastHistory"><div class="empty">Loading broadcast history…</div></div></div>`);

  renderBroadcastSelectedUsers();
  $("#broadcastAudience").onchange=updateBroadcastAudienceFields;
  $("#broadcastRandomCount").onchange=invalidateBroadcastPreview;
  $("#broadcastBody").oninput=()=>{};
  $("#broadcastUserSearch").oninput=e=>renderBroadcastSelectedUsers(e.target.value);
  $("#previewBroadcast").onclick=previewBroadcastRecipients;
  $("#sendBroadcast").onclick=sendChatBroadcast;
  $("#refreshBroadcastHistory").onclick=loadBroadcastHistory;
  void loadBroadcastHistory();
}

function bindChat(){
  setAdminChatMobileMode(Boolean(activeConv));
  CHAT_CONV=[];renderConv();renderMessages();
  const target=$("#convList");if(target)target.innerHTML='<div class="empty">Loading chat-enabled customers…</div>';
  void refreshAdminChat({loadMessages:true});
  const search=$("#chatSearch");if(search)search.oninput=renderConv;
  const broadcast=$("#openChatBroadcast");if(broadcast)broadcast.onclick=()=>void openChatBroadcast();
  const form=$("#messageForm");if(form)form.onsubmit=async e=>{
    e.preventDefault();const input=$("#messageInput"),text=input.value.trim();if(!text||!activeConv)return;
    const button=form.querySelector('button[type="submit"],button.primary');if(button)button.disabled=true;
    try{
      await backendJson(`/api/admin/chat/messages/${encodeURIComponent(activeConv)}`,{method:'POST',body:JSON.stringify({body:text})});
      input.value='';await loadAdminChatConversations({keepSelection:true});renderConv();await loadAdminChatMessages(activeConv,{seen:true,forceBottom:true});
    }catch(error){toast(error.message||'Unable to send message.')}finally{if(button)button.disabled=false;input.focus()}
  };
  if(adminChatLiveTimer)clearInterval(adminChatLiveTimer);
  adminChatLiveTimer=setInterval(()=>{if(route==='chat')void refreshAdminChat({loadMessages:Boolean(activeConv)})},4000);
}
function renderConv(){
  const q=$("#chatSearch")?.value.trim().toLowerCase()||"";
  const list=CHAT_CONV.filter(c=>!q||`${c.user} ${c.email||""} ${c.preview||""}`.toLowerCase().includes(q));
  const target=$("#convList");if(!target)return;
  target.innerHTML=list.length?list.map(c=>{
    const initials=chatInitials(c.user),photo=c.profileImage||"",avatar=photo?`<img src="${esc(photo)}" alt="" onerror="this.remove();this.parentElement.textContent='${esc(initials)}'">`:esc(initials);
    const ago=c.latestAt?chatRelative(c.latestAt):"";
    return `<button class="conversation ${c.id===activeConv?'active':''}" data-conv="${esc(c.id)}"><i class="admin-user-avatar">${avatar}</i><span class="conversation-copy"><strong>${esc(c.user)}</strong><p>${esc(c.preview||'No messages yet')}</p></span><span class="conversation-meta"><time>${esc(ago)}</time>${c.unread?`<span class="unread">${Number(c.unread)}</span>`:''}</span></button>`;
  }).join(""):'<div class="empty">No chat-enabled customers match this search.</div>';
  const badge=$("#chatUnreadBadge");if(badge){badge.textContent=`${backendChatUnreadTotal} unread`;badge.classList.toggle('hidden',backendChatUnreadTotal===0)}
  $$('[data-conv]').forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.conv;
    // Desktop: clicking the selected member again deselects it. Mobile uses Back,
    // but the same toggle is harmless if this handler is reached there.
    if(activeConv===id){activeConv='';setAdminChatMobileMode(false);renderConv();renderMessages();return}
    activeConv=id;setAdminChatMobileMode(true);renderConv();renderMessages();
    try{await loadAdminChatConversations({keepSelection:true});renderConv();await loadAdminChatMessages(activeConv,{seen:true,forceBottom:true})}catch(error){toast(error.message||'Unable to open conversation.')}
  });
}
function renderMessages({forceBottom=false}={}){
  const c=CHAT_CONV.find(x=>x.id===activeConv),head=$("#messageHead"),messages=$("#messages"),context=$("#messageTimeContext"),form=$("#messageForm"),note=document.querySelector('.admin-chat-preview-note');
  if(!head||!messages)return;
  if(!c){
    head.innerHTML='<div class="admin-chat-select-prompt"><strong>Select a member</strong><small>Choose a chat-enabled customer to open their conversation.</small></div>';
    if(context)context.innerHTML='';messages.innerHTML='<div class="admin-chat-empty"><strong>No conversation selected</strong><span>Select a member from the list to view messages.</span></div>';
    if(form)form.classList.add('hidden');if(note)note.classList.add('hidden');const old=document.querySelector('.admin-chat-jump-latest');if(old)old.hidden=true;return;
  }
  if(form)form.classList.remove('hidden');if(note)note.classList.remove('hidden');
  const initials=chatInitials(c.user),photo=c.profileImage||"",avatar=photo?`<img src="${esc(photo)}" alt="" onerror="this.remove();this.parentElement.textContent='${esc(initials)}'">`:esc(initials);
  const userZone=chatUserTimezone(c),adminZone=chatAdminTimezone(),now=new Date();
  head.innerHTML=`<button class="admin-chat-mobile-back" type="button" aria-label="Back to members">←</button><div class="msg-person"><i class="admin-user-avatar">${avatar}</i><span><strong>${esc(c.user)}</strong><small>${esc(c.status)}${c.email?` · ${esc(c.email)}`:''}</small></span></div><span class="badge ok">Chat enabled</span>`;
  const back=head.querySelector('.admin-chat-mobile-back');if(back)back.onclick=()=>{activeConv='';setAdminChatMobileMode(false);renderConv();renderMessages()};
  if(context)context.innerHTML=`<span><small>User local time</small><strong>${userZone?esc(chatClock(now,userZone)):'—'}</strong><em>${userZone?esc(userZone):'Waiting for member timezone'}</em></span><span><small>Your local time</small><strong>${esc(chatClock(now,adminZone))}</strong><em>${esc(adminZone)}</em></span>`;
  const rows=c.messages||[];
  messages.innerHTML=rows.length?rows.map(m=>{
    const userClock=userZone?chatClock(m.sentAt,userZone):'—',adminClock=chatClock(m.sentAt,adminZone),relative=chatRelative(m.sentAt);
    const meta=m.side==='in'?`User ${esc(userClock)} · You ${esc(adminClock)} · ${esc(relative)}`:`You ${esc(adminClock)}${userZone?` · User ${esc(userClock)}`:''} · ${esc(relative)} ${chatReceipt(m.state)}`;
    return `<div class="message ${m.side}"><div class="bubble">${esc(m.text)}</div><small class="admin-chat-message-meta">${meta}</small></div>`;
  }).join(''):'<div class="admin-chat-empty"><strong>No messages yet</strong><span>Send the first message to this customer.</span></div>';
  requestAnimationFrame(()=>{if(forceBottom)messages.scrollTop=messages.scrollHeight;bindAdminJumpLatest()});
}

function bindNotifications(){
  renderNotices();
  $$('[data-notice-filter]').forEach(b=>b.onclick=()=>{$$('[data-notice-filter]').forEach(x=>x.classList.toggle("active",x===b));renderNotices(b.dataset.noticeFilter)});
  const refresh=$("#refreshNotices");if(refresh)refresh.onclick=async()=>{refresh.disabled=true;try{await loadBackendNotifications(250);renderNotices(document.querySelector('[data-notice-filter].active')?.dataset.noticeFilter||"all");toast("Notifications refreshed.")}catch(error){toast(error.message)}finally{refresh.disabled=false}};
  const mark=$("#markRead");if(mark)mark.onclick=async()=>{mark.disabled=true;try{await markAllBackendNotificationsRead();NOTICES.forEach(n=>n.unread=false);updateCounts();renderNotices(document.querySelector('[data-notice-filter].active')?.dataset.noticeFilter||"all");toast("All notifications marked as read.")}catch(error){toast(error.message)}finally{mark.disabled=false}};
  if(!backendNotificationsReady)loadBackendNotifications(250).then(()=>{if(route==="notifications")renderNotices(document.querySelector('[data-notice-filter].active')?.dataset.noticeFilter||"all")}).catch(error=>{const target=$("#noticeList");if(target)target.innerHTML=`<div class="empty">Unable to load notifications: ${esc(error.message)}</div>`});
}
function renderNotices(filter="all"){
  const list=NOTICES.filter(n=>filter==="all"||n.unread),target=$("#noticeList");if(!target)return;
  target.innerHTML=list.length?list.map(n=>`<div class="notice-item ${n.unread?"unread-row":""}" data-notice="${n.id}"><i>${n.icon}</i><span><strong>${esc(n.title)}</strong><p>${esc(n.text)}</p></span><time>${esc(n.time)}</time></div>`).join(""):`<div class="empty">No real notifications in this view.</div>`;
  $$('[data-notice]').forEach(el=>el.onclick=async()=>{const n=NOTICES.find(x=>x.id===el.dataset.notice);if(!n)return;if(n.unread){n.unread=false;updateCounts();el.classList.remove("unread-row");try{await markBackendNotificationRead(n.rawId||n.id)}catch{n.unread=true;updateCounts()}}if(n.go)render(n.go);else renderNotices(filter)});
}

function bindMembership(){ $("#addTier").onclick=()=>tierEditor(); const h=$("#headerAddTier");if(h)h.onclick=()=>tierEditor(); $$('[data-tier]').forEach(b=>b.onclick=()=>tierEditor(b.dataset.tier)); $$('[data-tier-copy]').forEach(b=>b.onclick=()=>{const src=TIERS.find(t=>t.id===b.dataset.tierCopy);if(!src)return;let id=slug(`${src.name}-copy`),n=2;while(TIERS.some(t=>t.id===id))id=`${slug(src.name)}-copy-${n++}`;const cp=clone(src);cp.id=id;cp.name=`${src.name} Copy`;cp.status="Draft";TIERS.push(cp);persistState();addActivity("system","Membership tier duplicated",`${src.name} → ${cp.name}`,"◆");render("membership");toast("Tier duplicated as Draft.")}); }
function bindFinance(){
  bindFinanceRowActions();
  const exportFinance=()=>{const rows=financeFilteredRows();csv("ox-novels-finance.csv",[["Date","User","Email","Type","Environment","Plan","Amount","Currency","Status","Counted in revenue","Hidden","Note","Reference","Subscription ID"],...rows.map(r=>[r.date||"",r.user||"",r.email||"",r.type||"",r.environment||"",r.plan||"",r.amount===null||r.amount===undefined?"":r.amount,r.currency||"USD",r.status||"",r.excludedFromRevenue?"No":"Yes",r.hidden?"Yes":"No",r.note||"",r.reference||"",r.subscriptionId||""])] )};
  const exp=$("#exportLedger");if(exp)exp.onclick=exportFinance;const h=$("#headerLedger");if(h)h.onclick=exportFinance;
  const search=$("#financeSearch"),filter=$("#financeFilter");if(search)search.oninput=renderFinanceRows;if(filter)filter.onchange=renderFinanceRows;
  const refresh=$("#refreshFinance");if(refresh)refresh.onclick=async()=>{refresh.disabled=true;refresh.textContent="Refreshing…";try{await loadBackendFinance(1200);render("finance",{noHash:true,keepScroll:true});toast("Finance refreshed.")}catch(error){toast(error.message)}finally{if(refresh){refresh.disabled=false;refresh.textContent="Refresh"}}};
  if(!FINANCE.loaded)loadBackendFinance(1200).then(()=>{if(route==="finance")render("finance",{noHash:true,keepScroll:true})}).catch(error=>{const body=$("#financeBody");if(body)body.innerHTML=`<tr><td colspan="8"><div class="empty">Unable to load finance: ${esc(error.message)}</div></td></tr>`});
}
function bindActivity(){
  $("#activitySearch").oninput=renderActivityFilter;$("#activityFilter").onchange=renderActivityFilter;
  $("#exportActivity").onclick=()=>csv("ox-novels-activity.csv",[["Type","Title","Detail","Recorded At"],...ACT.map(a=>[a.type,a.title,a.detail,a.createdAt||a.time])]);
  const refresh=$("#refreshActivity");if(refresh)refresh.onclick=async()=>{refresh.disabled=true;refresh.textContent="Refreshing…";try{await loadBackendActivity(1000);renderActivityFilter();toast("Activity refreshed.")}catch(error){toast(error.message)}finally{refresh.disabled=false;refresh.textContent="Refresh"}};
  loadBackendActivity(1000).then(renderActivityFilter).catch(error=>{const target=$("#activityRows");if(target)target.innerHTML=`<div class="empty">Unable to load activity: ${esc(error.message)}</div>`});
}
function renderActivityFilter(){
  const target=$("#activityRows");if(!target)return;
  const q=$("#activitySearch")?.value.trim().toLowerCase()||"",f=$("#activityFilter")?.value||"all";
  const list=ACT.filter(a=>(!q||`${a.title} ${a.detail}`.toLowerCase().includes(q))&&(f==="all"||a.type===f));
  target.innerHTML=list.length?activityRows(list):'<div class="empty">No recorded activity matches this view.</div>';
}

function storyEditor(id){
  const s=stories.find(x=>x.id===id);if(!s)return;
  const cover=s.cover||generatedCoverUrl(s.id);
  openDrawer(`<span class="drawer-kicker">Story Library</span><h2 id="drawerTitle">Edit story</h2><p class="drawer-sub">Public story details are title, genre and description. Private Drive details stay Admin-only.</p><form class="form" id="editStoryForm" data-id="${s.id}" style="padding:0"><label class="field"><span>Title</span><input id="eTitle" value="${esc(s.title)}"></label><label class="field"><span>Genre</span><input id="eGenre" value="${esc(s.genre||"Unverified")}"></label><label class="field"><span>Description</span><textarea id="eDescription" rows="3">${esc(s.description||"")}</textarea></label><label class="field"><span>Display order</span><input id="eOrder" type="number" min="1" value="${s.order}"></label><label class="field"><span>Cover image URL/path</span><input id="eCover" value="${esc(cover)}" placeholder="Auto-generated .svg"><small>Drop a new image below, paste another cover URL/path, or reset to the generated .svg.</small></label>${coverDropMarkup("e",cover)}<div class="form-actions compact"><button class="secondary small" type="button" id="resetStoryCover">Use generated .svg</button></div><label class="field"><span>Private Drive folder</span><input id="eDrive" value="${esc(s.driveUrl||"")}" placeholder="Stored server-side"></label><label class="setting"><span><strong>Visible in public library</strong><small>Hidden stories remain available to admin.</small></span><input class="toggle" id="eVisible" type="checkbox" ${s.visible?"checked":""}></label><div class="form-actions"><button class="primary">Save changes</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form>`);
}
function storyMore(id){ const s=stories.find(x=>x.id===id);if(!s)return;openDrawer(`<span class="drawer-kicker">Story</span><h2 id="drawerTitle">${esc(s.title)}</h2><p class="drawer-sub">Quick actions for this story record.</p><div class="drawer-section"><div class="detail-grid"><div class="detail"><span>Genre</span><strong>${esc(s.genre||"Unverified")}</strong></div><div class="detail"><span>Visibility</span><strong>${s.visible?"Visible":"Hidden"}</strong></div><div class="detail"><span>AI updates</span><strong>${s.lock?"Locked":"Allowed"}</strong></div></div></div><div class="drawer-section"><h3>Actions</h3><div class="drawer-actions"><button class="secondary" data-quick-check="${s.id}">Check genre + description</button><button class="secondary" data-quick-edit="${s.id}">Edit story</button><button class="secondary danger" data-quick-delete="${s.id}">Delete preview</button></div></div>`); }
function statusReview(id){ const s=stories.find(x=>x.id===id);if(!s)return;openDrawer(`<span class="drawer-kicker">AI Story Details</span><h2 id="drawerTitle">Review ${esc(s.title)}</h2><p class="drawer-sub">Edit genre and description manually, and optionally lock them from future pasted AI results.</p><div class="drawer-section"><form class="form" id="overrideForm" data-id="${s.id}" style="padding:0"><label class="field"><span>Genre</span><input id="oGenre" value="${esc(s.genre||"Unverified")}"></label><label class="field"><span>Description</span><textarea id="oDescription" rows="5">${esc(s.description||"")}</textarea></label><label class="choice"><span><input name="mode" value="proceed" type="radio" ${!s.lock?"checked":""}> <strong>Proceed</strong></span><small>Apply now. A future pasted AI result may update it again.</small></label><label class="choice"><span><input name="mode" value="lock" type="radio" ${s.lock?"checked":""}> <strong>Proceed & Lock</strong></span><small>Keep this genre/description until you unlock it.</small></label><div class="form-actions"><button class="primary">Apply changes</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form></div>`); }
function manualCheckerPrompt(){
  const unlocked=stories.filter(s=>!s.lock).map(s=>({id:s.id,title:s.title}));
  const expected=unlocked.length;
  return `FAST POCKET FM GENRE + DESCRIPTION FOR ${String(APPEARANCE?.name || "THIS SITE").toUpperCase()}

Every supplied title is intended to be an English Pocket FM audio story. Process ALL ${expected} titles in one answer.

FIRST PASS — move quickly through the complete list:
1. Search: Pocket FM "<story title>" English genre description.
2. Prefer the official Pocket FM result/page or a clear Pocket FM search snippet.
3. Return only a useful broad genre and ONE short description sentence.
4. Do not research status, episode count, source URL, confidence, author or publication history.
5. Do not repeatedly cross-check. Finish every title first.

SECOND PASS — only after the full first pass is complete:
6. Collect every record whose genre would otherwise be "Other".
7. Re-check each of those once using a simpler normal web query such as:
   "<story title> audio story genre description"
   and, if useful, "<story title> Pocket FM genre description".
8. Search snippets / older indexed Pocket FM mentions are enough. A live Pocket FM page is NOT required.
9. If the snippet/synopsis clearly indicates a broad genre, use that genre instead of "Other". Examples: Billionaire Romance, Contemporary Romance, Drama, Fantasy, Romantasy, Sci-Fi, Suspense & Thriller, Systems and Superpowers.
10. Only leave genre as "Other" when that one quick re-check still gives no reasonable genre clue. Never invent a detailed plot just to avoid Other.
11. Keep each description to ONE short sentence. If only a broad synopsis can be established, summarize only what the search evidence supports.
12. Return every supplied id in the original order. Do not stop early and do not return a sample.

RETURN ONLY VALID JSON. No markdown and no explanation.
Exact shape:
{"stories":[{"id":"same-ox-id","genre":"Fantasy","description":"One short sentence."}]}

STORIES (${expected}):
${JSON.stringify(unlocked)}`;
}

function manualAIDrawer(){
  const expectedStories=stories.filter(s=>!s.lock),expectedIds=expectedStories.map(s=>String(s.id)),expectedSet=new Set(expectedIds);
  openDrawer(`<span class="drawer-kicker">AI Story Details</span><h2 id="drawerTitle">Fast genre + description lookup</h2><p class="drawer-sub">One prompt contains all ${expectedIds.length} unlocked stories. It asks only for Pocket FM genre and one short description.</p><div class="drawer-section"><label class="field"><span>Prepared AI prompt</span><textarea id="manualAIPrompt" rows="11" readonly>${esc(manualCheckerPrompt())}</textarea></label><div class="form-actions compact"><button class="primary" type="button" id="copyAIPrompt">Copy AI prompt</button></div></div><div class="drawer-section"><label class="field"><span>Paste AI JSON result</span><textarea id="manualAIResult" rows="11" placeholder='{"stories":[{"id":"...","genre":"Fantasy","description":"..."}]}'></textarea></label><small>The site checks that every unlocked story ID is present before applying it.</small><div class="form-actions"><button class="primary" type="button" id="applyAIResult">Apply AI results</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></div>`);
  $("#copyAIPrompt").onclick=async()=>{try{await navigator.clipboard.writeText($("#manualAIPrompt").value);toast(`AI prompt copied · ${expectedIds.length} stories.`)}catch{toast("Select and copy the AI prompt manually.")}};
  $("#applyAIResult").onclick=async()=>{
    let data;try{data=JSON.parse($("#manualAIResult").value.trim())}catch{toast("Paste valid JSON from the AI.");return}
    if(!Array.isArray(data?.stories)){toast("The JSON must contain a stories array.");return}
    const receivedIds=data.stories.map(r=>String(r?.id||"")).filter(Boolean),receivedSet=new Set(receivedIds);
    const missing=expectedIds.filter(id=>!receivedSet.has(id)),duplicates=receivedIds.filter((id,i,a)=>a.indexOf(id)!==i&&expectedSet.has(id));
    if(missing.length||duplicates.length){const parts=[];if(missing.length)parts.push(`${missing.length} missing: ${missing.slice(0,8).join(", ")}${missing.length>8?"…":""}`);if(duplicates.length)parts.push(`${new Set(duplicates).size} duplicate ID${new Set(duplicates).size===1?"":"s"}`);toast(`AI result is incomplete · ${parts.join(" · ")}`);return}
    let updated=0;
    for(const r of data.stories){const story=stories.find(x=>x.id===String(r.id||""));if(!story||story.lock)continue;story.genre=String(r.genre||"Other").trim()||"Other";story.description=String(r.description||"Pocket FM story; public synopsis is no longer available.").trim();story.checked="Just now";story.genreLastChecked=new Date().toISOString();updated++}
    persistState();if(backendSyncReady){clearTimeout(backendSyncTimer);await syncCoreToBackend()}addActivity("story","AI story details applied",`${updated} stories updated with genre and description.`,"✓");closeDrawer();render("checks");toast(`${updated} story details applied.`)
  };
}
function openUser(id){
  const u=USERS.find(x=>x.id===id);if(!u)return;
  const lifetimeDetails=(u.lifetimePurchases||[]).length?`<div class="drawer-section"><h3>Lifetime Story Access: ${lifetimeOwnedCount(u)} active</h3>${u.lifetimePurchases.map(p=>`<div class="backup-history-row"><span class="file-icon">∞</span><span><strong>${esc(p.title||"Purchased story")}</strong><small>Purchased ${esc(adminDate(p.purchasedAt,{withTime:true}))} · ${esc(financeMoney(p.amount,p.currency||"USD"))}</small></span>${p.linked?'<span class="badge ok">Linked</span>':p.productState==="Archived"?'<span class="badge warn">Archived</span>':'<span class="badge warn">Needs Assignment</span>'}</div>`).join("")}<button class="secondary small" type="button" data-go="lifetime" style="margin-top:10px">Open Lifetime Purchases</button></div>`:"";
  const paypalDetails=u.billingProvider==="PayPal"?`<div class="drawer-section"><h3>PayPal subscription</h3><div class="detail-grid"><div class="detail"><span>Subscription status</span><strong>${esc(u.subscriptionStatus||"—")}</strong></div><div class="detail"><span>Auto-renew</span><strong>${u.autoRenew===true?"On":u.autoRenew===false?"Off":"—"}</strong></div><div class="detail"><span>Next billing</span><strong>${esc(adminDate(u.nextBillingAt,{withTime:true}))}</strong></div><div class="detail"><span>Last payment</span><strong>${esc(adminDate(u.lastPaymentAt,{withTime:true}))}</strong></div><div class="detail"><span>Access until</span><strong>${esc(adminDate(u.accessUntil,{withTime:true}))}</strong></div><div class="detail"><span>Subscription ID</span><strong><code>${esc(u.subscriptionId||"—")}</code></strong></div></div></div>`:"";
  openDrawer(`<span class="drawer-kicker">User details</span><h2 id="drawerTitle">${esc(u.name)}</h2><p class="drawer-sub">${esc(u.email)}</p><div class="drawer-section"><div class="detail-grid"><div class="detail"><span>Account status</span><strong>${esc(u.account)}</strong></div><div class="detail"><span>Access status</span><strong>${u.testControls?.enabled?'<span class="badge test">TEST MODE</span> ':''}${esc(adminAccessStatusText(u))}</strong></div><div class="detail"><span>Plan</span><strong>${esc(adminDisplayPlan(u))}</strong></div><div class="detail"><span>Payment status</span><strong>${esc(u.payment)}</strong></div><div class="detail"><span>Chat access</span><strong>${u.paidOnce?"Enabled permanently":u.manualChatUnlocked?"Manually unlocked":"Locked"}</strong></div><div class="detail"><span>Account created</span><strong>${esc(adminDate(u.joined,{withTime:true}))}</strong></div><div class="detail"><span>Last login</span><strong>${esc(adminDate(u.lastLogin,{withTime:true}))}</strong></div><div class="detail"><span>Renewal / expiry</span><strong>${esc(adminDate(u.renewal,{withTime:true}))}</strong></div><div class="detail"><span>Latest amount</span><strong>${esc(u.amount)}</strong></div></div></div>${lifetimeDetails}${paypalDetails}<div class="drawer-section"><h3>Account management</h3><div class="drawer-actions"><button class="secondary" data-edit-user="${u.id}">Edit user</button><button class="secondary danger" data-delete-user="${u.id}">Delete user</button></div></div><div class="drawer-section"><h3>Membership actions</h3><div class="drawer-actions"><button class="primary" data-user-action="grant" data-user-id="${u.id}">Grant membership</button><button class="secondary" data-user-action="extend" data-user-id="${u.id}">Extend / Renew</button><button class="secondary" data-user-action="cancel" data-user-id="${u.id}">Cancel access</button><button class="secondary danger" data-user-action="block" data-user-id="${u.id}">${u.account==="Blocked"?"Unblock user":"Block user"}</button></div></div><div class="drawer-section"><h3>Chat access repair</h3><p class="drawer-sub">Use this only when a verified successful payment did not unlock Chat. This does not create or edit a payment, membership, or subscription record.</p><div class="drawer-actions"><button class="${u.manualChatUnlocked?"secondary":"primary"}" data-user-action="unlock-chat" data-user-id="${u.id}" ${u.manualChatUnlocked?"disabled":""}>${u.manualChatUnlocked?"Chat manually unlocked ✓":"Unlock Chat manually"}</button></div></div><div class="drawer-section"><h3>Status separation</h3><p class="drawer-sub">Account access, membership access, payment history and Chat access are tracked separately. After the first successful real payment, Chat stays enabled even if membership later expires or is cancelled.</p></div>`);
}

function editUser(id){
  const u=USERS.find(x=>x.id===id);if(!u)return;
  const expiry=String(u.accessUntil||"").match(/^\d{4}-\d{2}-\d{2}/)?.[0]||"";
  const tierOptions=TIERS.map(t=>`<option value="${esc(t.id)}" ${String(u.membershipTierId||"")===String(t.id)?"selected":""}>${esc(t.name)} · ${esc(t.price||"")}${t.status!=="Published"?" · Draft":""}</option>`).join("");
  const currentAmount=String(u.amount||"").replace(/[^0-9.]/g,"");
  const test=u.testControls||{configured:false,enabled:false,simulatePaidOnce:true,chatEnabled:true,telegramEnabled:true,membershipStatus:"Active",lifetimeEnabled:false,lifetimeStoryId:"",purchasedSectionEnabled:true};
  const testStoryOptions=[...stories].sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""))).map(s=>`<option value="${esc(s.id)}" ${String(test.lifetimeStoryId||"")===String(s.id)?"selected":""}>${esc(s.title||"Story")}</option>`).join("");
  const lifetimeRows=(u.lifetimePurchases||[]).length
    ? u.lifetimePurchases.map(p=>`<div class="admin-user-lifetime-row">
        <div><strong>${esc(p.title||"Purchased story")}</strong><small>${esc(p.purchaseStatus||"")} · ${esc(p.entitlementStatus||"")} · ${esc(financeMoney(p.amount,p.currency||"USD"))} · ${esc(adminDate(p.purchasedAt,{withTime:true}))}</small></div>
        <button class="secondary small danger" type="button" data-remove-lifetime-purchase="${esc(p.purchaseId)}">Remove record</button>
      </div>`).join("")
    : '<div class="empty compact">No Lifetime Story purchase records on this user.</div>';

  openDrawer(`<span class="drawer-kicker">Users</span><h2 id="drawerTitle">Edit user</h2><p class="drawer-sub">Manual repair tools save directly to production D1. PayPal subscription attachment is verified with PayPal before OX accepts it.</p>
    <form class="form" id="editUserForm" data-id="${u.id}" style="padding:0">
      <div class="drawer-section admin-user-edit-section">
        <h3>Account & membership</h3>
        <label class="field"><span>Name</span><input id="editUserName" value="${esc(u.name)}" required maxlength="80"></label>
        <label class="field"><span>Email</span><input id="editUserEmail" type="email" value="${esc(u.email)}" required maxlength="180"></label>
        <div class="form-row two"><label class="field"><span>Account status</span><select id="editUserAccount"><option ${u.account==="Active"?"selected":""}>Active</option><option ${u.account==="Blocked"?"selected":""}>Blocked</option></select></label><label class="field"><span>Membership status</span><select id="editUserMembership">${["None","Active","Granted","Expired","Cancelled"].map(v=>`<option ${u.membership===v?"selected":""}>${v}</option>`).join("")}</select></label></div>
        <label class="field"><span>Plan</span><input id="editUserPlan" value="${esc(u.plan||"None")}" maxlength="120"></label>
        <label class="field"><span>Renewal / expiry</span><input id="editUserExpiry" type="date" value="${expiry}"><small>Leave empty for no expiry date.</small></label>
        <div class="form-actions"><button class="primary">Save user details</button></div>
      </div>

      <div class="drawer-section admin-user-edit-section test-account-lab">
        <div class="test-account-lab-head"><div><h3>Test Account Lab</h3><p class="drawer-sub">A separate simulation layer. It never creates revenue, payments, real Lifetime purchases or subscription IDs.</p></div><span class="badge test">${test.enabled?"TEST MODE ON":"TEST MODE OFF"}</span></div>
        <label class="toggle-row test-master-toggle"><span><strong>Test Account Mode</strong><small>ON = use the simulations below. OFF = immediately return to the account's real untouched state.</small></span><input id="testModeEnabled" type="checkbox" ${test.enabled?"checked":""}></label>
        <div class="test-controls-grid">
          <label class="field"><span>Membership simulation</span><select id="testMembershipStatus">${["None","Active","Granted","Expired","Cancelled"].map(v=>`<option ${test.membershipStatus===v?"selected":""}>${v}</option>`).join("")}</select><small>Access behavior only; no billing.</small></label>
          <label class="toggle-row"><span><strong>Simulate Paid Once</strong><small>Paid-once UI/state only.</small></span><input id="testPaidOnce" type="checkbox" ${test.simulatePaidOnce?"checked":""}></label>
          <label class="toggle-row"><span><strong>Chat access</strong><small>Show/use Member Chat without a real payment.</small></span><input id="testChatEnabled" type="checkbox" ${test.chatEnabled?"checked":""}></label>
          <label class="toggle-row"><span><strong>Telegram eligibility</strong><small>Allow the private Telegram Backup flow for this test account.</small></span><input id="testTelegramEnabled" type="checkbox" ${test.telegramEnabled?"checked":""}></label>
          <label class="toggle-row"><span><strong>Lifetime Story access</strong><small>Simulate ownership of one story with $0 revenue.</small></span><input id="testLifetimeEnabled" type="checkbox" ${test.lifetimeEnabled?"checked":""}></label>
          <label class="field"><span>Simulated Lifetime Story</span><select id="testLifetimeStory"><option value="">Select story…</option>${testStoryOptions}</select></label>
          <label class="toggle-row"><span><strong>Show Purchased section</strong><small>Show/hide the simulated story in Purchased.</small></span><input id="testPurchasedSection" type="checkbox" ${test.purchasedSectionEnabled?"checked":""}></label>
        </div>
        <div class="admin-repair-warning"><strong>Safe lab:</strong> Test Mode never writes Finance revenue, payment events, PayPal/Dodo transactions, real <code>paid_once_at</code>, or real Lifetime purchase records.</div>
        <div class="form-actions compact"><button class="primary" type="button" id="saveTestControls">Save Test Controls</button></div>
      </div>

      <div class="drawer-section admin-user-edit-section">
        <h3>PayPal subscription repair</h3>
        <p class="drawer-sub">Attach a real PayPal subscription to this OX account. OX verifies the I-… ID with PayPal first. A legacy RAPTOR subscription with a numeric PayPal custom_id is also registered for future RAPTOR webhook updates.</p>
        <label class="field"><span>PayPal Subscription ID</span><input id="editPaypalSubscriptionId" value="${esc(u.subscriptionId||"")}" maxlength="90" placeholder="I-XXXXXXXXXXXX"><small>${u.subscriptionId?`Currently linked: ${esc(u.subscriptionId)}`:"No PayPal subscription is currently linked."}</small></label>
        <label class="field"><span>OX access tier</span><select id="editPaypalTier">${tierOptions||'<option value="">No membership tiers</option>'}</select><small>This controls OX access only. It does not change the customer's PayPal billing plan or price.</small></label>
        <label class="field"><span>Legacy monthly amount (optional fallback)</span><input id="editPaypalLegacyPrice" inputmode="decimal" value="${Number(currentAmount)>0?esc(currentAmount):""}" placeholder="24.99"><small>Usually OX reads the amount from the PayPal Plan automatically. Use this only if an old RAPTOR Plan price cannot be read.</small></label>
        <div class="admin-repair-warning"><strong>Important:</strong> Attach/Detach does not create, cancel, refund or change a PayPal subscription. It only repairs which OX account the verified subscription belongs to.</div>
        <div class="form-actions compact"><button class="primary" type="button" id="attachPaypalSubscription">Verify & attach</button>${u.subscriptionId?'<button class="secondary danger" type="button" id="detachPaypalSubscription">Detach from OX</button>':""}</div>
      </div>

      <div class="drawer-section admin-user-edit-section">
        <h3>Telegram Backup</h3>
        <p class="drawer-sub">Paid-once customers can link one Telegram account and join the private OX Novels Backup channel.</p>
        <div class="telegram-user-status">
          <span class="badge ${u.telegram?.joined?"ok":(u.telegram?.connected?"warn":"")}">${u.telegram?.joined?"Backup Joined":(u.telegram?.connected?"Connected · Not Joined":"Not Connected")}</span>
          ${u.telegram?.username?`<strong>@${esc(u.telegram.username)}</strong>`:""}
          ${u.telegram?.telegramUserId?`<small>Telegram ID ${esc(u.telegram.telegramUserId)}</small>`:""}
        </div>
        ${u.telegram?.connected?'<div class="form-actions compact"><button class="secondary danger" type="button" id="resetTelegramConnection">Reset Telegram connection</button></div>':'<p class="field-help">The customer can connect from OX Member Chat after their first genuine payment.</p>'}
        <div class="admin-repair-warning"><strong>Reset only removes the OX ↔ Telegram link.</strong> It does not forcibly remove a person who is already inside the Telegram channel.</div>
      </div>

      <div class="drawer-section admin-user-edit-section">
        <h3>Lifetime Story purchase records</h3>
        <p class="drawer-sub">Remove an incorrect/test purchase entirely from OX. This removes the user's story entitlement and linked OX lifetime revenue/payment record. It does NOT send a refund.</p>
        <div class="admin-user-lifetime-list">${lifetimeRows}</div>
      </div>

      <div class="form-actions"><button class="secondary" type="button" data-close-modal>Close</button></div>
    </form>`);
}

async function deleteUsers(ids){
  ids=[...new Set((ids||[]).filter(Boolean))];if(!ids.length)return;
  const names=ids.map(id=>USERS.find(u=>u.id===id)?.name).filter(Boolean);
  const label=ids.length===1?(names[0]||"this user"):`${ids.length} selected users`;
  if(!confirm(`Permanently delete ${label}?\n\nTheir login sessions and account record will be removed. Any verified lifetime-purchase history is preserved for audit/recovery and will reconnect automatically if the same verified Google email signs in again.`))return;
  try{
    const payload=await backendJson("/api/admin/users",{method:"DELETE",body:JSON.stringify({ids})});
    USERS=USERS.filter(u=>!ids.includes(u.id));persistLocalState();updateCounts();closeDrawer();if(route==="users")render("users",{keepScroll:true});toast(`${payload.deleted||ids.length} user${(payload.deleted||ids.length)===1?"":"s"} deleted.`);
  }catch(error){toast(error.message||"Unable to delete users.")}
}
function tierEditor(id="new"){
  const existing=TIERS.find(x=>x.id===id), t=existing||{name:"New Membership",price:"$17.99",cycle:"/ month",description:"",status:"Draft",benefits:["Complete story library"],cover:""};
  const preview=t.cover?`<img id="tierCoverPreview" src="${esc(t.cover)}" alt="Current membership tier cover">`:`<div class="cover-preview-empty" id="tierCoverEmpty">No tier image</div>`;
  openDrawer(`<span class="drawer-kicker">Membership</span><h2 id="drawerTitle">${id==="new"?"Add membership tier":"Edit membership tier"}</h2><p class="drawer-sub">Tier details and the tier image save to this site copy's backend. Published tiers appear on the public Membership tab.</p><form class="form" id="tierForm" data-id="${existing?existing.id:"new"}" data-cover="${esc(t.cover||"")}" style="padding:0"><label class="field"><span>Tier name</span><input id="tierName" value="${esc(t.name)}" required></label><div class="form-row two"><label class="field"><span>Price</span><input id="tierPrice" value="${esc(t.price)}" required></label><label class="field"><span>Billing cycle</span><select id="tierCycle"><option ${t.cycle==="/ month"?"selected":""}>/ month</option><option ${t.cycle==="/ year"?"selected":""}>/ year</option></select></label></div><label class="field"><span>Description</span><textarea id="tierDescription" rows="3">${esc(t.description)}</textarea></label><label class="field"><span>Membership tier image</span><small>Drop/select an image, then reposition or zoom it before saving. You can replace, adjust, or reset it later.</small></label><div class="story-cover-picker tier-image-picker"><label class="story-cover-drop" id="tierCoverDrop"><input id="tierCoverFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><span>⇧</span><strong>Drop tier image</strong><small>or click to choose</small></label><div class="story-cover-preview" id="tierCoverPreviewWrap">${preview}</div></div><div class="form-actions compact tier-image-actions"><button class="secondary small" type="button" id="tierReplaceImage">Replace</button><button class="secondary small" type="button" id="tierAdjustImage" ${t.cover?"":"disabled"}>Adjust / zoom</button><button class="secondary small" type="button" id="tierResetImage" ${t.cover?"":"disabled"}>Reset image</button></div><label class="field"><span>Benefits</span><textarea id="tierBenefits" rows="5">${esc(t.benefits.join("\n"))}</textarea><small>One benefit per line.</small></label><label class="field"><span>Status</span><select id="tierStatus"><option ${t.status==="Published"?"selected":""}>Published</option><option ${t.status==="Draft"?"selected":""}>Draft</option></select></label><div class="form-actions"><button class="primary">Save tier</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form>`);
}
async function paypalProviderEditor(){
  try{
    const payload=await backendJson("/api/admin/payments/paypal");
    const cfg=payload.config||{};
    const tiers=Array.isArray(payload.tiers)?payload.tiers:[];
    const webhookUrl=`${location.origin}/api/payments/paypal/webhook`;
    const tierFields=tiers.map(t=>`<label class="field"><span>${esc(t.name)} · ${esc(t.price)} ${esc(t.cycle||"")}</span><input data-paypal-plan="${esc(t.id)}" value="${esc(t.planId||"")}" placeholder="P-XXXXXXXXXXXX"><small>PayPal Plan ID for this site tier${t.status!=="Published"?" · tier is currently Draft":""}.</small></label>`).join("");
    openDrawer(`<span class="drawer-kicker">Payments</span><h2 id="drawerTitle">Configure PayPal Subscriptions</h2><p class="drawer-sub">Connect this independent site copy to its own PayPal REST app and recurring plans.</p><form class="form" id="paypalForm" style="padding:0"><div class="drawer-section"><label class="toggle-row"><span><strong>Enable PayPal checkout</strong><small>Join Membership uses PayPal only after all required settings are ready.</small></span><input id="paypalEnabled" type="checkbox" ${cfg.enabled?"checked":""}></label><div class="form-row two" style="margin-top:10px"><label class="field"><span>Mode</span><select id="paypalMode"><option value="sandbox" ${cfg.mode!=="live"?"selected":""}>Sandbox</option><option value="live" ${cfg.mode==="live"?"selected":""}>Live</option></select></label><label class="field"><span>Client Secret</span><input value="${cfg.secretConfigured?"Configured in server ✓":"Not configured"}" disabled><small>Never stored in this Admin page.</small></label></div><label class="field"><span>PayPal Client ID</span><input id="paypalClientId" value="${esc(cfg.clientId||"")}" autocomplete="off" placeholder="Client ID"></label><label class="field"><span>PayPal Webhook ID</span><input id="paypalWebhookId" value="${esc(cfg.webhookId||"")}" autocomplete="off" placeholder="Webhook ID"></label><label class="field"><span>Webhook URL</span><input value="${esc(webhookUrl)}" readonly><small>Use this exact HTTPS path when the website is deployed. Localhost cannot receive PayPal internet webhooks directly.</small></label></div><div class="drawer-section"><h3>Membership Plan IDs</h3><p class="drawer-sub">Each published site tier needs the PayPal recurring Plan ID created for that same price/cycle.</p>${tierFields||'<p class="drawer-sub">Create a membership tier first.</p>'}</div><div class="drawer-section"><h3>One-time Support payments</h3><p class="drawer-sub">Active members can enter a whole-dollar amount. Set the minimum Support amount for this site copy below.</p><label class="toggle-row"><span><strong>Enable Support checkout</strong><small>Show a working one-time PayPal Support checkout to active members.</small></span><input id="paypalSupportEnabled" type="checkbox" ${cfg.supportEnabled?"checked":""}></label><label class="field" style="margin-top:10px"><span>Support PayPal.Me link or email</span><input id="paypalSupportTarget" type="text" value="${esc(cfg.supportTarget||cfg.supportEmail||"")}" autocomplete="off" placeholder="https://paypal.me/yourname"><small>PayPal.Me example: https://paypal.me/yourname. The site adds the member's amount automatically.</small></label><label class="field" style="margin-top:10px"><span>Minimum Support amount (USD)</span><input id="paypalSupportMinAmount" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" value="${esc(String(cfg.supportMinAmount||9))}" autocomplete="off" placeholder="9"><small>Whole dollars only. Allowed range: $1 to $10,000.</small></label></div><div class="callout"><strong>Server secret:</strong> add <code>PAYPAL_CLIENT_SECRET=...</code> to <code>.dev.vars</code> for local testing, then restart the local backend. When deployed, use a Cloudflare Worker secret instead.</div><div class="form-actions"><button class="primary">Save PayPal settings</button><button class="secondary" type="button" id="testPaypal">Test connection</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form>`);
    const form=$("#paypalForm");
    const supportMinInput=$("#paypalSupportMinAmount");
    if(supportMinInput){
      const cleanSupportMin=()=>{supportMinInput.value=supportMinInput.value.replace(/\D/g,"").slice(0,5)};
      supportMinInput.addEventListener("beforeinput",e=>{if(e.data&&/\D/.test(e.data))e.preventDefault()});
      supportMinInput.addEventListener("input",cleanSupportMin);
      supportMinInput.addEventListener("paste",()=>requestAnimationFrame(cleanSupportMin));
    }
    form.onsubmit=async e=>{
      e.preventDefault();
      const plans={};$$('[data-paypal-plan]',form).forEach(input=>plans[input.dataset.paypalPlan]=input.value.trim());
      try{
        const saved=await backendJson("/api/admin/payments/paypal",{method:"PUT",body:JSON.stringify({enabled:$("#paypalEnabled").checked,mode:$("#paypalMode").value,clientId:$("#paypalClientId").value.trim(),webhookId:$("#paypalWebhookId").value.trim(),supportEnabled:$("#paypalSupportEnabled").checked,supportTarget:$("#paypalSupportTarget").value.trim(),supportMinAmount:$("#paypalSupportMinAmount").value.trim(),plans})});
        PROVIDERS["PayPal"]={displayName:"PayPal",status:saved.config?.enabled&&(saved.config?.clientId&&saved.config?.secretConfigured)?"Connected":(saved.config?.enabled?"Test mode":"Not connected")};INTEGRATIONS.loaded=false;persistLocalState();closeDrawer();render("payments");toast("PayPal settings saved.");
      }catch(error){toast(error.message||"Unable to save PayPal settings.")}
    };
    $("#testPaypal").onclick=async()=>{const b=$("#testPaypal");b.disabled=true;try{const plans={};$$('[data-paypal-plan]',form).forEach(input=>plans[input.dataset.paypalPlan]=input.value.trim());await backendJson("/api/admin/payments/paypal",{method:"PUT",body:JSON.stringify({enabled:$("#paypalEnabled").checked,mode:$("#paypalMode").value,clientId:$("#paypalClientId").value.trim(),webhookId:$("#paypalWebhookId").value.trim(),supportEnabled:$("#paypalSupportEnabled").checked,supportTarget:$("#paypalSupportTarget").value.trim(),supportMinAmount:$("#paypalSupportMinAmount").value.trim(),plans})});const r=await backendJson("/api/admin/payments/paypal/test",{method:"POST",body:"{}"});const bad=(r.planChecks||[]).filter(x=>!x.ok);toast(bad.length?`PayPal connected, but ${bad.length} Plan ID check${bad.length===1?"":"s"} failed.`:"PayPal connection and configured Plan IDs are valid.")}catch(error){toast(error.message||"PayPal test failed.")}finally{b.disabled=false}};
  }catch(error){toast(error.message||"Unable to load PayPal settings.")}
}

async function googleAuthProviderEditor(){
  try{
    const data=await backendJson("/api/admin/auth/google"),cfg=data.config||{};
    openDrawer(`<span class="drawer-kicker">Member authentication</span><h2 id="drawerTitle">Configure Google Sign-In</h2><p class="drawer-sub">One Google button handles both sign-up and login. Members do not create a password.</p><form class="form" id="googleAuthForm" style="padding:0"><div class="drawer-section"><label class="field"><span>Google Web Client ID</span><input id="googleClientId" value="${esc(cfg.clientId||"")}" placeholder="1234567890-abc.apps.googleusercontent.com"><small>Create an OAuth 2.0 Web application client in Google Cloud. Add localhost, the Cloudflare preview URL while testing, and the final live domain as Authorized JavaScript origins.</small></label></div><div class="callout">This Client ID is public configuration, not a secret. Every clean clone should use its own Google OAuth client.</div><div class="form-actions"><button class="primary">Save Google Sign-In</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form>`);
    bindDrawer();const form=$("#googleAuthForm");if(form)form.onsubmit=async e=>{e.preventDefault();try{await backendJson("/api/admin/auth/google",{method:"PUT",body:JSON.stringify({clientId:$("#googleClientId").value.trim()})});closeDrawer();await loadRealIntegrations();render("integrations");toast("Google Sign-In settings saved.")}catch(error){toast(error.message||"Unable to save Google Sign-In settings.")}};
  }catch(error){toast(error.message||"Unable to load Google Sign-In settings.")}
}

async function providerEditor(name){
  if(name==="Google Sign-In") return googleAuthProviderEditor();
  if(name==="PayPal") return paypalProviderEditor();
  const p=PROVIDERS[name]||{displayName:name,status:"Not connected"};
  openDrawer(`<span class="drawer-kicker">Integration</span><h2 id="drawerTitle">Configure ${esc(name)}</h2><p class="drawer-sub">This integration does not use a manual connection status.</p><form class="form" id="providerForm" data-provider="${esc(name)}" style="padding:0"><div class="drawer-section"><label class="field"><span>Display name</span><input id="providerDisplay" value="${esc(p.displayName||name)}"></label><label class="field" style="margin-top:10px"><span>Connection status</span><select id="providerStatus">${["Not connected","Test mode","Connected","Planned"].map(v=>`<option ${v===p.status?"selected":""}>${v}</option>`).join("")}</select></label></div><div class="callout">Connection status is determined by the backend health check, not by a manual selector.</div><div class="form-actions"><button class="primary">Save frontend settings</button><button class="secondary" type="button" data-close-modal>Cancel</button></div></form>`);
}

function bindDrawer(){
  bindGlobal($("#drawerContent"));
  $$('[data-close-modal]').forEach(b=>b.onclick=closeDrawer);
  const edit=$("#editStoryForm");if(edit){
    bindStoryCoverPicker("e");
    const resetButton=$("#resetStoryCover");if(resetButton)resetButton.onclick=async()=>{
      try{const cover=await resetUploadedCover(edit.dataset.id);$("#eCover").value=cover;const preview=$("#eCoverPreview");if(preview?.tagName==="IMG")preview.src=`${cover}?t=${Date.now()}`;toast("Uploaded cover removed. The unique generated .svg will be used.")}catch(error){toast(error.message)}
    };
    edit.onsubmit=async e=>{
      e.preventDefault();const s=stories.find(x=>x.id===edit.dataset.id);if(!s)return;
      const file=$("#eCoverFile")?._coverFile||$("#eCoverFile")?.files?.[0]||null;
      let cover=$("#eCover").value.trim()||generatedCoverUrl(s.id);
      try{if(file)cover=await uploadCoverFile(s.id,file)}catch(error){toast(error.message);return}
      s.title=$("#eTitle").value.trim()||s.title;s.genre=$("#eGenre").value.trim()||"Unverified";s.description=$("#eDescription").value.trim();s.order=Number($("#eOrder").value)||s.order;s.cover=cover;s.driveUrl=$("#eDrive").value.trim();s.visible=$("#eVisible").checked;persistState();addActivity("story","Story edited",`${s.title} metadata saved.`,"▦");closeDrawer();if(route==="stories")render("stories");toast(file?"Story and cover saved.":"Story changes saved.")
    };
  }
  const ov=$("#overrideForm"); if(ov) ov.onsubmit=e=>{e.preventDefault();const s=stories.find(x=>x.id===ov.dataset.id);if(!s)return;s.genre=$("#oGenre").value.trim()||"Other";s.description=$("#oDescription").value.trim();s.lock=$('input[name="mode"]:checked',ov)?.value==="lock";s.checked="Just now";persistState();addActivity("story","Manual story details updated",`${s.title} · ${s.genre} · ${s.lock?"locked":"AI updates allowed"}.`,"✓");closeDrawer();render("checks");toast(s.lock?"Story details applied and locked.":"Story details applied.")};
  const tf=$("#tierForm"); if(tf){
    const fileInput=$("#tierCoverFile"),drop=$("#tierCoverDrop"),previewWrap=$("#tierCoverPreviewWrap"),adjustBtn=$("#tierAdjustImage"),resetBtn=$("#tierResetImage");
    let previewUrl="";
    const currentTier=TIERS.find(t=>t.id===tf.dataset.id);
    const revokePreview=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=""}};
    const showTierBlob=blob=>{revokePreview();previewUrl=URL.createObjectURL(blob);previewWrap.innerHTML=`<img id="tierCoverPreview" src="${previewUrl}" alt="Adjusted membership tier cover">`;tf._tierCoverBlob=blob;tf._tierCoverReset=false;adjustBtn.disabled=false;resetBtn.disabled=false};
    const editTierFile=async file=>{if(!file)return;try{if(!String(file.type||"").startsWith("image/"))throw new Error("Choose an image file.");const edited=await adjustImage(file,{title:"Adjust membership tier image",width:1200,height:680});if(edited)showTierBlob(edited)}catch(error){toast(error.message)}};
    if(fileInput)fileInput.onchange=()=>editTierFile(fileInput.files?.[0]);
    if(drop){["dragenter","dragover"].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add("dragover")}));["dragleave","drop"].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove("dragover")}));drop.addEventListener("drop",event=>editTierFile(event.dataTransfer?.files?.[0]));}
    const replaceBtn=$("#tierReplaceImage");if(replaceBtn)replaceBtn.onclick=async()=>{const file=await pickImageFile();if(file)editTierFile(file)};
    if(adjustBtn)adjustBtn.onclick=async()=>{const source=tf._tierCoverBlob||tf.dataset.cover;if(!source){toast("Choose a tier image first.");return}try{const edited=await adjustImage(source,{title:"Adjust membership tier image",width:1200,height:680});if(edited)showTierBlob(edited)}catch(error){toast(error.message)}};
    if(resetBtn)resetBtn.onclick=()=>{revokePreview();tf._tierCoverBlob=null;tf._tierCoverReset=true;previewWrap.innerHTML='<div class="cover-preview-empty" id="tierCoverEmpty">No tier image</div>';adjustBtn.disabled=true;resetBtn.disabled=true;toast("Tier image will be removed when you save.")};
    tf.onsubmit=async e=>{
      e.preventDefault();const name=$("#tierName").value.trim();if(!name){toast("Tier name is required.");return}
      let tier=TIERS.find(t=>t.id===tf.dataset.id),isNew=!tier;
      if(!tier){let id=slug(name),n=2;while(TIERS.some(t=>t.id===id))id=`${slug(name)}-${n++}`;tier={id,cover:"",order:TIERS.length+1};TIERS.push(tier)}
      try{
        if(tf._tierCoverReset){try{await resetMediaFile(`tier-cover-${tier.id}`)}catch{}tier.cover=""}
        if(tf._tierCoverBlob)tier.cover=await uploadMediaFile(`tier-cover-${tier.id}`,tf._tierCoverBlob);
      }catch(error){if(isNew)TIERS=TIERS.filter(x=>x!==tier);toast(error.message||"Unable to save tier image.");return}
      tier.name=name;tier.price=$("#tierPrice").value.trim()||"$0.00";tier.cycle=$("#tierCycle").value;tier.description=$("#tierDescription").value.trim();tier.benefits=$("#tierBenefits").value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);tier.status=$("#tierStatus").value;tier.cover=tier.cover||"";
      revokePreview();persistState();addActivity("system","Membership tier saved",`${tier.name} is ${tier.status}.`,"◆");closeDrawer();render("membership");toast(`${tier.name} saved as ${tier.status}.`)
    };
  }
  const pf=$("#providerForm"); if(pf) pf.onsubmit=e=>{e.preventDefault();const name=pf.dataset.provider;PROVIDERS[name]={displayName:$("#providerDisplay").value.trim()||name,status:$("#providerStatus").value};persistState();addActivity("system","Integration setting updated",`${name} → ${PROVIDERS[name].status}.`,"↔");closeDrawer();render(route);toast(`${name} frontend settings saved.`)};
  $$('[data-quick-check]').forEach(b=>b.onclick=()=>{closeDrawer();manualAIDrawer()});
  $$('[data-quick-edit]').forEach(b=>b.onclick=()=>storyEditor(b.dataset.quickEdit));
  $$('[data-quick-delete]').forEach(b=>b.onclick=async()=>{const s=stories.find(x=>x.id===b.dataset.quickDelete);if(s)await deleteAdminStories([s.id],{closeAfter:true})});
  const euf=$("#editUserForm");if(euf){
    euf.onsubmit=async e=>{e.preventDefault();const id=euf.dataset.id;try{const payload=await backendJson(`/api/admin/users/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({name:$("#editUserName").value.trim(),email:$("#editUserEmail").value.trim(),account:$("#editUserAccount").value,membership:$("#editUserMembership").value,plan:$("#editUserPlan").value.trim(),expiry:$("#editUserExpiry").value})});const i=USERS.findIndex(u=>u.id===id);if(i!==-1)USERS[i]={...USERS[i],...payload.user};persistLocalState();closeDrawer();if(route==="users")render("users",{keepScroll:true});toast("User saved.")}catch(error){toast(error.message||"Unable to save user.")}};
    const saveTest=$("#saveTestControls");if(saveTest)saveTest.onclick=()=>saveTestAccountControls(euf.dataset.id);
    const telegramReset=$("#resetTelegramConnection");if(telegramReset)telegramReset.onclick=()=>resetTelegramConnectionForUser(euf.dataset.id);
    const attach=$("#attachPaypalSubscription");if(attach)attach.onclick=()=>attachPaypalSubscriptionForUser(euf.dataset.id);
    const detach=$("#detachPaypalSubscription");if(detach)detach.onclick=()=>detachPaypalSubscriptionForUser(euf.dataset.id);
    $$('[data-remove-lifetime-purchase]',euf).forEach(b=>b.onclick=()=>hardDeleteLifetimePurchase(euf.dataset.id,b.dataset.removeLifetimePurchase));
  }
  $$('[data-edit-user]').forEach(b=>b.onclick=()=>editUser(b.dataset.editUser));
  $$('[data-delete-user]').forEach(b=>b.onclick=()=>deleteUsers([b.dataset.deleteUser]));
  $$('[data-user-action]').forEach(b=>b.onclick=()=>applyUserAction(b.dataset.userId,b.dataset.userAction));
}


async function refreshOneAdminUser(id,{reopenEdit=false}={}){
  await refreshUsersFromBackend({rerender:false});
  persistLocalState();
  if(route==="users")render("users",{keepScroll:true});
  if(reopenEdit)setTimeout(()=>editUser(id),0);
}



async function saveTestAccountControls(id){
  const lifetimeEnabled=$("#testLifetimeEnabled")?.checked===true;
  const lifetimeStoryId=$("#testLifetimeStory")?.value||"";
  if(lifetimeEnabled&&!lifetimeStoryId){toast("Choose a story for simulated Lifetime access.");return}
  const body={
    enabled:$("#testModeEnabled")?.checked===true,
    simulatePaidOnce:$("#testPaidOnce")?.checked===true,
    chatEnabled:$("#testChatEnabled")?.checked===true,
    telegramEnabled:$("#testTelegramEnabled")?.checked===true,
    membershipStatus:$("#testMembershipStatus")?.value||"None",
    lifetimeEnabled,
    lifetimeStoryId,
    purchasedSectionEnabled:$("#testPurchasedSection")?.checked===true
  };
  const b=$("#saveTestControls");if(b){b.disabled=true;b.textContent="Saving…"}
  try{
    await backendJson(`/api/admin/users/${encodeURIComponent(id)}/test-controls`,{method:"PUT",body:JSON.stringify(body)});
    closeDrawer();
    await refreshOneAdminUser(id,{reopenEdit:true});
    toast(body.enabled?"Test Account Mode enabled. No revenue/payment records changed.":"Test Account Mode disabled. Original account state restored.");
  }catch(error){
    toast(error.message||"Unable to save Test Account controls.");
    if(b){b.disabled=false;b.textContent="Save Test Controls"}
  }
}

async function resetTelegramConnectionForUser(id){
  const u=USERS.find(x=>x.id===id);if(!u)return;
  if(!confirm(`Reset Telegram connection for ${u.name||u.email}?\n\nThis removes the OX ↔ Telegram account link. It does NOT remove a person who is already inside the Telegram channel.`))return;
  const b=$("#resetTelegramConnection");if(b){b.disabled=true;b.textContent="Resetting…"}
  try{
    await backendJson(`/api/admin/users/${encodeURIComponent(id)}/telegram/reset`,{method:"DELETE"});
    closeDrawer();
    await refreshOneAdminUser(id,{reopenEdit:true});
    toast("Telegram connection reset.");
  }catch(error){toast(error.message||"Unable to reset Telegram connection.");if(b){b.disabled=false;b.textContent="Reset Telegram connection"}}
}

async function attachPaypalSubscriptionForUser(id){
  const subscriptionId=$("#editPaypalSubscriptionId")?.value.trim().toUpperCase()||"";
  const tierId=$("#editPaypalTier")?.value||"";
  const legacyPrice=$("#editPaypalLegacyPrice")?.value.trim()||"";
  if(!/^I-[A-Z0-9]+$/i.test(subscriptionId)){toast("Enter a valid PayPal I-… subscription ID.");return}
  if(!confirm(`Verify and attach ${subscriptionId} to this OX user?\n\nOX will read the current subscription directly from PayPal. This does not change the customer's PayPal plan or billing price.`))return;

  const button=$("#attachPaypalSubscription");if(button){button.disabled=true;button.textContent="Verifying…"}
  try{
    const payload=await backendJson(`/api/admin/users/${encodeURIComponent(id)}/paypal-subscription`,{
      method:"POST",body:JSON.stringify({subscriptionId,tierId,legacyPrice})
    });
    LIFETIME_ADMIN.loaded=false;FINANCE.loaded=false;
    const sub=payload.subscription||{};
    closeDrawer();
    await refreshOneAdminUser(id,{reopenEdit:true});
    toast(`${sub.raptorLegacy?"RAPTOR / PayPal subscription repaired":"PayPal subscription attached"} · ${sub.status||"Verified"}${sub.planAmount?` · $${sub.planAmount}`:""}.`);
  }catch(error){
    toast(error.message||"Unable to attach PayPal subscription.");
    if(button){button.disabled=false;button.textContent="Verify & attach"}
  }
}

async function detachPaypalSubscriptionForUser(id){
  const u=USERS.find(x=>x.id===id);if(!u?.subscriptionId){toast("No PayPal subscription is linked.");return}
  if(!confirm(`Detach ${u.subscriptionId} from this OX user?\n\nThis does NOT cancel the customer's PayPal subscription or issue any refund. It only removes the OX link. Existing membership fields are left unchanged so you can edit them separately.`))return;
  const button=$("#detachPaypalSubscription");if(button){button.disabled=true;button.textContent="Detaching…"}
  try{
    await backendJson(`/api/admin/users/${encodeURIComponent(id)}/paypal-subscription`,{
      method:"DELETE",body:JSON.stringify({subscriptionId:u.subscriptionId})
    });
    FINANCE.loaded=false;
    closeDrawer();
    await refreshOneAdminUser(id,{reopenEdit:true});
    toast("PayPal subscription detached from OX. PayPal itself was not cancelled.");
  }catch(error){
    toast(error.message||"Unable to detach PayPal subscription.");
    if(button){button.disabled=false;button.textContent="Detach from OX"}
  }
}

async function hardDeleteLifetimePurchase(id,purchaseId){
  const u=USERS.find(x=>x.id===id);
  const p=u?.lifetimePurchases?.find(row=>String(row.purchaseId)===String(purchaseId));
  if(!p)return;
  const label=p.title||"this Lifetime Story";
  if(!confirm(`Remove the Lifetime purchase record for "${label}"?\n\nThis is a HARD DELETE inside OX:\n• removes this user's Lifetime Story ownership\n• removes the purchase from Lifetime Purchases / recorded lifetime gross\n• removes the linked OX PayPal lifetime Finance event when present\n• does NOT send a PayPal/Dodo refund\n\nUse this only for test payments or an incorrect record.`))return;

  const button=document.querySelector(`[data-remove-lifetime-purchase="${CSS.escape(String(purchaseId))}"]`);
  if(button){button.disabled=true;button.textContent="Removing…"}
  try{
    await backendJson(`/api/admin/lifetime-purchases/${encodeURIComponent(purchaseId)}`,{method:"DELETE"});
    LIFETIME_ADMIN.loaded=false;FINANCE.loaded=false;
    closeDrawer();
    await refreshOneAdminUser(id,{reopenEdit:true});
    toast("Lifetime purchase record removed from OX.");
  }catch(error){
    toast(error.message||"Unable to remove Lifetime purchase.");
    if(button){button.disabled=false;button.textContent="Remove record"}
  }
}

async function applyUserAction(id,action){
  const u=USERS.find(x=>x.id===id);if(!u)return;
  try{
    const payload=await backendJson(`/api/admin/users/${encodeURIComponent(id)}/action`,{
      method:"POST",
      body:JSON.stringify({action})
    });
    if(payload.user){
      const index=USERS.findIndex(x=>x.id===id);
      if(index!==-1)USERS[index]={...USERS[index],...payload.user};
    }
    persistLocalState();
    addActivity("user","User status changed",payload.detail||`${u.name} updated.`,"♙");
    if(route==="users")render("users",{keepScroll:true});
    openUser(id);
    toast(payload.detail||"User updated.");
  }catch(error){
    toast(error.message||"Unable to update user.");
  }
}

function download(name,content,type="application/json"){ const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function csv(name,rows){ download(name,rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"),"text/csv;charset=utf-8"); }

function backupCountSummary(meta={}){
  const c=meta.counts||{};
  const media=Number(meta.mediaBytes||0);
  const mediaLabel=media>=1024*1024?`${(media/1024/1024).toFixed(1)} MB media`:`${Math.round(media/1024)} KB media`;
  return `${Number(c.stories||0)} stories · ${Number(c.posts||0)} posts · ${Number(c.users||0)} users · ${Number(c.chat_messages||0)} messages · ${Number(c.chat_broadcasts||0)} broadcasts · ${Number(c.payment_events||0)} payment events · ${mediaLabel}`;
}

async function loadBackupSummary(){
  const out=$("#backupSummaryText");
  try{
    const payload=await backendJson("/api/admin/backup?summary=1");
    const meta=payload.backup||{};
    if(out)out.textContent=backupCountSummary(meta);
    return meta;
  }catch(error){if(out)out.textContent="Unable to read D1 backup status.";throw error}
}

function bindBackup(){
  loadBackupSummary().catch(()=>{});
  const refresh=$("#refreshBackupSummary");if(refresh)refresh.onclick=()=>loadBackupSummary().then(()=>toast("Backup status refreshed.")).catch(error=>toast(error.message||"Unable to refresh backup status."));
  $("#createBackup").onclick=async()=>{
    const button=$("#createBackup");button.disabled=true;button.textContent="Creating backup…";
    try{
      const payload=await backendJson("/api/admin/backup");
      const backup=payload.backup;
      if(!backup)throw new Error("Backup was not returned.");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      download(`${slug(APPEARANCE.name || "Story Site")}-D1-Backup-${stamp}.json`,JSON.stringify(backup));
      addActivity("system","Full D1 backup created",backupCountSummary(backup),"⇩");
      toast("Full D1 backup downloaded.");
    }catch(error){toast(error.message||"Unable to create backup.")}
    finally{button.disabled=false;button.textContent="Create full backup"}
  };
  $("#restoreFile").onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    const out=$("#restoreResult");out.classList.remove("hidden");
    try{
      const data=JSON.parse(await file.text());
      if(!data||data.format!=="ox-novels-d1-backup"||Number(data.version)!==1||!data.tables){pendingRestore=null;out.textContent="This is not a compatible full site D1 backup.";return}
      pendingRestore=data;
      out.innerHTML=`<strong>Valid site D1 backup</strong><br><small>${esc(backupCountSummary(data))}<br>Created ${esc(adminDate(data.createdAt||"",{withTime:true}))}</small><div style="margin-top:8px"><button class="danger small" id="applyRestore" type="button">Restore this backup</button></div>`;
      $("#applyRestore").onclick=applyRestoreData;
    }catch{pendingRestore=null;out.textContent="Unable to read this JSON backup."}
  };
  const clone=$("#cloneDetails");if(clone)clone.onclick=()=>alert("MAKE-CLEAN-CLONE.bat creates a separate ZIP with the complete site code and migrations, but excludes .dev.vars, .wrangler/local D1, node_modules, users, chats, payments, backups and private owner files. The new owner gets a fresh database when they run INIT-LOCAL-BACKEND.bat.");
  const details=$("#stateDetails");if(details)details.onclick=()=>loadBackupSummary().then(meta=>alert(`Website real D1 data\n\n${backupCountSummary(meta)}\n\nSecrets exported: No\nSessions exported: No`)).catch(error=>toast(error.message||"Unable to read backup details."));
  const clean=$("#cleanDeletedUserData");if(clean)clean.onclick=async()=>{
    if(!confirm("Clean leftovers from users that were already deleted?\n\nThis removes orphan user/chat notifications and orphan Sandbox/test Finance records. Activity Log and Live payment history are preserved."))return;
    clean.disabled=true;
    try{const r=await backendJson("/api/admin/maintenance/deleted-user-cleanup",{method:"POST",body:"{}"});await Promise.all([loadBackendNotifications(250),loadBackendFinance(1200),loadBackendActivity(500)]);updateCounts();if(route==="backup")loadBackupSummary().catch(()=>{});toast(`${r.removedNotifications||0} notification(s) · ${r.removedPayments||0} test Finance record(s) removed.`)}catch(error){toast(error.message||"Cleanup failed.")}finally{clean.disabled=false}
  };
}

async function applyRestoreData(){
  if(!pendingRestore)return;
  const typed=prompt("This replaces the current website data and logs everyone out.\n\nType RESTORE to continue:","");
  if(typed!=="RESTORE"){toast("Restore cancelled.");return}
  const button=$("#applyRestore");if(button){button.disabled=true;button.textContent="Restoring…"}
  try{
    await backendJson("/api/admin/backup",{method:"POST",body:JSON.stringify({confirm:"RESTORE",backup:pendingRestore})});
    pendingRestore=null;
    alert("Backup restored successfully. Admin and member sessions were cleared for safety. Sign in again.");
    location.href="/admin.html";
  }catch(error){if(button){button.disabled=false;button.textContent="Restore this backup"}toast(error.message||"Restore failed.")}
}


async function loadDemo(){
  const toggle=$("#demoMember"),status=$("#demoStatus");
  try{const r=await fetch('/api/session',{cache:'no-store'}),s=await r.json();toggle.checked=s.membershipActive===true;status.textContent=s.membershipActive?'Active member preview':'Guest preview';toggle.onchange=async e=>{try{const res=await fetch('/api/demo/member',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({active:e.target.checked})}),p=await res.json();if(!res.ok)throw new Error(p.error||'Unable to change preview.');status.textContent=p.membershipActive?'Active member preview':'Guest preview';toast(p.membershipActive?'Member preview enabled.':'Guest preview enabled.')}catch(err){e.target.checked=!e.target.checked;toast(err.message)}}}catch{toggle.disabled=true;status.textContent='Preview unavailable'}
}

function bootAdmin(){
  if(backendBooted)return;backendBooted=true;
  const label=$("#adminBackendLabel");if(label){label.textContent="D1 connected";label.classList.add("backend-status")}
  applyAdminAccent(); updateCounts(); render(location.hash.slice(1)||'dashboard',{noHash:true});
  if(route!=="activity")loadBackendActivity(100).then(()=>{if(route==="dashboard")render("dashboard",{noHash:true,keepScroll:true})}).catch(error=>console.warn("Activity feed unavailable",error));
  if(route!=="finance")loadBackendFinance(1200).then(()=>{if(route==="dashboard")render("dashboard",{noHash:true,keepScroll:true})}).catch(error=>console.warn("Finance summary unavailable",error));
  loadBackendNotifications(250).then(()=>{if(route==="notifications")renderNotices("all")}).catch(error=>console.warn("Notifications unavailable",error));
  loadPaypalProviderConfigStatus().then(()=>{if(route==="payments")render("payments",{noHash:true,keepScroll:true})}).catch(error=>console.warn("PayPal configuration status unavailable",error));
  startAdminNotificationPolling();
  startAdminChatStatusPolling();
}

async function init(){
  $("#openMenu").onclick=openMenu; $("#closeMenu").onclick=closeMenu; $("#menuScrim").onclick=closeMenu; $("#modalLayer").onclick=e=>{if(e.target.matches('[data-close-modal]'))closeDrawer()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeMenu()}});
  $$('.nav-item,[data-go="dashboard"]',document).forEach(b=>{if(b.dataset.go)b.onclick=()=>render(b.dataset.go)});
  window.addEventListener('hashchange',()=>{if(backendBooted)render(location.hash.slice(1)||'dashboard',{noHash:true})});
  window.addEventListener('pageshow',()=>{if(backendBooted&&route==="users")void syncAdminUsersLive({force:true})});
  window.addEventListener('focus',()=>{if(backendBooted&&route==="users")void syncAdminUsersLive({force:true})});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==="visible"&&backendBooted&&route==="users")void syncAdminUsersLive({force:true})});
  setInterval(()=>{if(backendBooted&&route==="users"&&document.visibilityState==="visible")void syncAdminUsersLive()},5000);

  $("#adminLoginForm").onsubmit=async e=>{
    e.preventDefault();const input=$("#adminPassword"),err=$("#backendGateError");err.textContent="";
    try{await loginToBackend(input.value);input.value=""}catch(error){
      if(error.status===429||error.code==="ADMIN_TEMP_LOCKED")startAdminLoginLockout(error.retryAfterSeconds||900);
      else{err.textContent=error.message;input.select()}
    }
  };
  $("#adminLogout").onclick=async()=>{try{await backendJson("/api/admin/logout",{method:"POST",body:"{}"})}catch{}backendSyncReady=false;backendBooted=false;if(adminChatStatusTimer)clearInterval(adminChatStatusTimer);if(adminChatLiveTimer)clearInterval(adminChatLiveTimer);if(adminNotificationTimer)clearInterval(adminNotificationTimer);adminChatStatusTimer=adminChatLiveTimer=adminNotificationTimer=null;showBackendGate("You are logged out of this website's Admin.",{login:true});};

  if(await checkBackendAccess()) bootAdmin();
}
document.addEventListener('DOMContentLoaded',init);
