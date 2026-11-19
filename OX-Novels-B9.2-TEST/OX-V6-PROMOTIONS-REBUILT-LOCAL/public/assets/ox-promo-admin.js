'use strict';
const $=(s)=>document.querySelector(s);
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date=s=>s?new Date(s).toLocaleDateString():'—';
let snapshot=null,selected='all';
async function api(path,options={}) {
  const r=await fetch('/api/promo/admin/'+path,{credentials:'same-origin',cache:'no-store',...options});
  const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'Request failed');return v;
}
function setError(s){$('#error').textContent=s||'';}
const post=(path,data)=>api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
function selectedRows(rows){
  if(selected==='all')return rows;
  if(selected==='owner')return rows.filter(x=>x.sourceType==='owner'||x.recipientId==='owner');
  if(selected==='unknown')return rows.filter(x=>x.sourceType==='other');
  return rows.filter(x=>x.partnerId===selected||x.recipientId===selected);
}
function render(){
  const r=snapshot;if(!r)return;
  $('#partners').innerHTML=r.partners.map(p=>`<tr><td>${safe(p.channel_name)}</td><td>${safe(p.login_name)}</td>
    <td>${p.active?'Enabled':'Disabled'}</td><td><div class="row">
    <button class="secondary" data-action="toggle" data-id="${safe(p.id)}">${p.active?'Disable':'Enable'}</button>
    <button class="secondary" data-action="reset" data-id="${safe(p.id)}">Reset password</button>
    <button class="secondary" data-action="rename" data-id="${safe(p.id)}">Rename</button>
    </div></td></tr>`).join('')||'<tr><td colspan="4">No friends added yet.</td></tr>';
  const tabs=[{id:'all',name:'All'},{id:'owner',name:'Mine'},...r.partners.map(p=>({id:p.id,name:p.channel_name})),{id:'unknown',name:'Other / unknown'}];
  $('#tabs').innerHTML=tabs.map(t=>`<button class="tab ${t.id===selected?'active':''}" data-select="${safe(t.id)}">${safe(t.name)}</button>`).join('');
  const customers=selectedRows(r.customers);
  const ledger=selectedRows(r.ledger);
  $('#customers').innerHTML=customers.map(c=>`<tr><td>${safe(c.customerName)}<br><small>${safe(c.email)}</small></td>
    <td>${safe(c.sourceName)}</td><td>${safe(c.currentOwner)}</td><td>${date(c.firstMembershipPayment)}</td>
    <td>${c.hasLifetimePurchase?'Yes':'—'}</td></tr>`).join('')||'<tr><td colspan="5">No matching customers.</td></tr>';
  $('#ledger').innerHTML=ledger.map(l=>`<tr><td>${date(l.date)}</td><td>${safe(l.customerName)}<br><small>${safe(l.email)}</small></td>
    <td>${safe(l.kind)}${l.story?'<br><small>'+safe(l.story)+'</small>':''}</td>
    <td>${safe(l.recipientName)}</td><td>${safe(l.currency)} ${Number(l.amount).toFixed(2)}</td><td>${safe(l.review)}</td></tr>`).join('')||'<tr><td colspan="6">No matching paid transactions.</td></tr>';
  const totals={};for(const l of ledger){totals[l.currency]=(totals[l.currency]||0)+l.amount;}
  $('#totals').innerHTML=`<div class="metric"><small>Selected customers</small><strong>${customers.length}</strong></div>
    <div class="metric"><small>Recorded credited purchases</small><strong>${ledger.length}</strong></div>`+
    Object.entries(totals).map(([c,v])=>`<div class="metric"><small>Gross allocation · ${safe(c)}</small><strong>${safe(c)} ${v.toFixed(2)}</strong></div>`).join('');
  $('#unmatched').textContent=Number(r.unmatchedPaymentEvents||0)?`${r.unmatchedPaymentEvents} Dodo Live successful payment event(s) were not safely matched to a subscription. They are excluded from allocation and need manual review.`:'';
  document.querySelectorAll('[data-select]').forEach(el=>el.onclick=()=>{selected=el.dataset.select;render();});
  document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>manage(el.dataset.id,el.dataset.action));
}
async function load(){try{setError('');snapshot=await api('report');render();}catch(e){setError(e.message+' — Sign in to your original Admin first.');}}
async function manage(id,action){
  const p=snapshot.partners.find(x=>x.id===id);if(!p)return;
  let payload={id};
  if(action==='toggle'){
    if(!confirm(`${p.active?'Disable':'Enable'} ${p.channel_name}?`))return;
    payload.active=!p.active;
  } else if(action==='reset'){
    const password=prompt('Enter a NEW private password (12+ characters). Existing partner sessions will be revoked.');
    if(password===null)return;if(password.length<12)return setError('Password must be at least 12 characters.');
    payload.newPassword=password;
  } else if(action==='rename'){
    const name=prompt('YouTube channel name',p.channel_name);if(name===null)return;payload.channelName=name.trim();
  }
  try{await post('update',payload);await load();}catch(e){setError(e.message);}
}
$('#create').onsubmit=async ev=>{
  ev.preventDefault();setError('');
  const btn=$('#create button[type="submit"]');btn.disabled=true;
  try{
    const data={channelName:$('#channel').value.trim(),loginName:$('#login').value.trim(),password:$('#password').value};
    await post('create',data);$('#password').value='';$('#channel').value='';$('#login').value='';await load();
  }catch(e){setError(e.message);}finally{btn.disabled=false;}
};
$('#refresh').onclick=load;
load();
