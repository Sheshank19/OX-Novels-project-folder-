'use strict';
const $=(s)=>document.querySelector(s);
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date=s=>s?new Date(s).toLocaleDateString():'—';
async function api(path,options={}) {
  const r=await fetch('/api/promo/partner/'+path,{credentials:'same-origin',cache:'no-store',...options});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Request failed');return data;
}
function error(s){$('#error').textContent=s||'';}
function show(data){
  $('#loginSection').classList.add('hide');$('#viewer').classList.remove('hide');error('');
  $('#channelName').textContent=data.viewer?.channelName||'My channel';
  const totals=Object.entries(data.totals||{});
  $('#summary').innerHTML=`<div class="metric"><small>Referred customers</small><strong>${data.customers.length}</strong></div>
    <div class="metric"><small>Purchases credited to me</small><strong>${data.ledger.length}</strong></div>`+
    totals.map(([currency,v])=>`<div class="metric"><small>Recorded gross · ${safe(currency)}</small><strong>${safe(currency)} ${Number(v.gross).toFixed(2)}</strong></div>`).join('');
  $('#customers').innerHTML=data.customers.map(c=>`<tr><td>${safe(c.customerName)}<br><small>${safe(c.email)}</small></td>
    <td>${safe(c.sourceName)}</td><td>${safe(c.currentOwner)}</td><td>${date(c.firstMembershipPayment)}</td></tr>`).join('')||'<tr><td colspan="4">No referred customers yet.</td></tr>';
  $('#ledger').innerHTML=data.ledger.map(l=>`<tr><td>${date(l.date)}</td><td>${safe(l.customerName)}<br><small>${safe(l.email)}</small></td>
    <td>${safe(l.kind)}${l.story?'<br>'+safe(l.story):''}</td><td>${safe(l.currency)} ${Number(l.amount).toFixed(2)}</td><td>${safe(l.review)}</td></tr>`).join('')||'<tr><td colspan="5">No verified paid referrals yet.</td></tr>';
}
async function refresh(){try{const data=await api('report');show(data);}catch(e){$('#viewer').classList.add('hide');$('#loginSection').classList.remove('hide');error('Sign in to view your referrals.');}}
$('#loginForm').onsubmit=async e=>{
  e.preventDefault();error('');
  const button=$('#loginForm button');button.disabled=true;
  try{
    await api('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({loginName:$('#loginName').value.trim(),password:$('#loginPassword').value})});
    $('#loginPassword').value='';await refresh();
  }catch(err){error(err.message);}finally{button.disabled=false;}
};
$('#logout').onclick=async()=>{try{await api('logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});}catch{}await refresh();};
refresh();
