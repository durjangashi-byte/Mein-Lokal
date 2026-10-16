/* Qonto bank sync UI. Credentials never enter the browser. */
(function(){
 const escQ=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateQ=t=>t?String(t).slice(0,10):'';
 const eurQ=n=>Number(n||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 function suggested(t){return t?.raw?.suggested_category||'sonstiges'}
 const PRIVATE_CATS=['Geliehen / Geldtransfer','Shopping','Essen privat','Familie','Versicherung','Mobilfunk','Tabakwaren','Online / Abos','Sonstiges privat'];
 function privateCat(t){const s=((t.label||'')+' '+(t.reference||'')).toLowerCase();if(s.includes('geliehen'))return 'Geliehen / Geldtransfer';if(/zara|tk maxx|jd sports|otto|panda design/.test(s))return 'Shopping';if(/mcdonald|masterkoefte|masterköfte/.test(s))return 'Essen privat';if(/babyone/.test(s))return 'Familie';if(/versicherung|alexander melnik/.test(s))return 'Versicherung';if(/ortel/.test(s))return 'Mobilfunk';if(/dietz|tabak/.test(s))return 'Tabakwaren';if(/joyclub|pm international|liberty/.test(s))return 'Online / Abos';return 'Sonstiges privat'}
 function classification(t){return t.classification||'unklar'}
 function privateSummary(data){const rows=(data||[]).filter(t=>classification(t)==='privat'&&t.side==='debit');const by={};let total=0;rows.forEach(t=>{const k=t.private_category||privateCat(t),a=Number(t.amount||0);total+=a;by[k]=(by[k]||0)+a});return {rows,total,by}}
 function renderPrivate(data){const selected=typeof dashboardPeriod==='undefined'?'':dashboardPeriod;data=(data||[]).filter(t=>t.status==='completed'&&(!selected||(typeof qontoBookingDate==='function'?qontoBookingDate(t):dateQ(t.settled_at||t.emitted_at)).startsWith(selected)));const el=document.getElementById('qonto-private');if(!el)return;const s=privateSummary(data),income=(data||[]).filter(t=>classification(t)==='privat'&&t.side==='credit').reduce((sum,t)=>sum+Math.round(Number(t.amount)*100),0)/100;const cats=Object.entries(s.by).sort((a,b)=>b[1]-a[1]);el.innerHTML='<div class="sec-hd">Private Einnahmen & Ausgaben</div><p class="summary-note">Zeitraum der Übersicht: '+escQ(selected||'alle Monate')+' · Einlagen und Entnahmen sind getrennt vom betrieblichen Ergebnis.</p><div class="totals-card"><div class="t-row"><span>Private Ausgaben</span><strong class="amtr">'+eurQ(s.total)+'</strong></div><div class="t-row"><span>Private Einnahmen</span><strong class="amtg">'+eurQ(income)+'</strong></div><div class="t-row"><span>Private Buchungen</span><strong>'+(s.rows.length+(data||[]).filter(t=>classification(t)==='privat'&&t.side==='credit').length)+'</strong></div></div>'+(cats.length?'<div class="card">'+cats.map(([k,v])=>'<div class="setting-row"><div><div class="setting-lbl">'+escQ(k)+'</div></div><strong>'+eurQ(v)+'</strong></div>').join('')+'</div>':'<div class="empty"><p>Noch keine privaten Buchungen klassifiziert</p></div>')}
 const importing=new Set();
 let loadVersion=0;
 const current=(client,user)=>SB===client&&authUser===user&&!!user;
 function duplicate(t){const d=dateQ(t.settled_at||t.emitted_at),a=Number(t.amount);return t.side==='debit'?D.aus.some(x=>x.datum===d&&Math.abs(Number(x.betrag)-a)<.01):false}
 function isCardPayout(t){
  if(t?.side!=='credit')return false;
  const text=[t.label,t.reference,t.raw?.label,t.raw?.reference].filter(Boolean).join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ');
  return /zahlungen vor ort|angeforderte zahlungen|kartenauszahlung|kartenabrechnung|card payout|card settlement/.test(text);
 }
 window.isQontoCardPayout=isCardPayout;
 function cardReconciliation(data){
  const payouts=(data||[]).filter(isCardPayout).sort((a,b)=>dateQ(a.settled_at).localeCompare(dateQ(b.settled_at)));
  const income=(D.ein||[]).filter(e=>Number(e.karte)>0).map(e=>({...e,_used:false}));
  return payouts.map(p=>{
   const pd=new Date(dateQ(p.settled_at)+'T12:00:00'), amount=Math.round(Number(p.amount)*100);
   const candidates=income.filter(e=>!e._used&&new Date(e.datum+'T12:00:00')<=pd&&(pd-new Date(e.datum+'T12:00:00'))/86400000<=7);
   let chosen=null;
   for(let mask=1;mask<(1<<Math.min(candidates.length,12));mask++){let sum=0,rows=[];for(let i=0;i<Math.min(candidates.length,12);i++)if(mask&(1<<i)){sum+=Math.round(Number(candidates[i].karte)*100);rows.push(candidates[i])}if(sum===amount){chosen=rows;break}}
   if(chosen)chosen.forEach(e=>e._used=true);
   return {p,chosen};
  });
 }
 function renderCardReconciliation(data){
  const el=document.getElementById('qonto-card-check');if(!el)return;
  const rows=cardReconciliation(data), matched=rows.filter(x=>x.chosen).length;
  el.innerHTML='<div class="sec-hd">Kartenabgleich</div><div class="totals-card"><div class="t-row"><span>Qonto-Auszahlungen abgeglichen</span><strong>'+matched+' / '+rows.length+'</strong></div></div><div class="card">'+rows.slice().reverse().map(x=>{const p=x.p;return '<div class="setting-row"><div><div class="setting-lbl">'+escQ(dateQ(p.settled_at))+' · '+eurQ(p.amount)+'</div><div class="setting-sub">'+(x.chosen?'✓ passt zu '+x.chosen.map(e=>escQ(e.datum)+' · Karte '+eurQ(e.karte)).join(' + '):'Noch keine passende Kartenerfassung')+'</div></div><strong class="'+(x.chosen?'amtg':'ca')+'">'+(x.chosen?'✓':'Prüfen')+'</strong></div>'}).join('')+'</div>';
 } function install(){
  const more=document.querySelector('#p-mehr .more-menu'); if(!more||document.getElementById('p-bank'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='more-link';btn.onclick=()=>switchTab('bank');
  btn.innerHTML='<span>🏦</span><span><strong>Bank · Qonto</strong><small>Kontobewegungen synchronisieren und übernehmen</small></span><span class="more-arrow">›</span>';
  more.insertBefore(btn,more.lastElementChild);
  const panel=document.createElement('div');panel.className='panel';panel.id='p-bank';
  panel.innerHTML='<div class="sec-hd">Bank · Qonto</div><div class="card"><div class="card-hd">🏦 Qonto Verbindung</div><div style="padding:14px 16px"><p class="summary-note" id="qonto-status">Bereit. Zugangsdaten werden ausschließlich serverseitig gespeichert.</p></div><button class="btn-primary" id="qonto-sync-btn" onclick="qontoSync()">Jetzt synchronisieren</button></div><div id="qonto-summary"></div><div class="sec-hd">Noch nicht übernommene Bankbewegungen</div><div id="qonto-list"><div class="empty"><p>Noch nicht geladen</p></div></div>';
  panel.innerHTML=panel.innerHTML.replace('<div id="qonto-summary"></div>','<div id="qonto-summary"></div><div id="qonto-card-check"></div><div id="qonto-private"></div>');
  document.querySelector('.content')?.appendChild(panel);
 }
 window.renderPrivateOutflows=()=>{
  renderPrivate(typeof D!=='undefined'?D.privat||[]:[]);
  const el=document.getElementById('qonto-private');if(!el||typeof privateItems!=='function')return;
  const selected=typeof dashboardPeriod==='undefined'?'':dashboardPeriod;
  el.innerHTML+=privateItems(selected).slice().sort((a,b)=>b.datum.localeCompare(a.datum)).map(r=>'<div class="payment-card"><div class="payment-top"><h3 style="overflow-wrap:anywhere">'+escQ(r.beschreibung)+'</h3><strong class="'+(r.art==='credit'?'amtg':'amtr')+'">'+(r.art==='credit'?'+':'−')+eurQ(r.betrag)+'</strong></div><p>'+escQ(r.datum)+' · '+escQ(r.kategorie)+'</p></div>').join('');
 };
 async function load(){
  if(!SB||!authUser)return;
  const client=SB,user=authUser,version=++loadVersion;
  const {data,error}=await client.from('qonto_transactions').select('*').order('settled_at',{ascending:false}).limit(300);
  const list=document.getElementById('qonto-list');if(!list||!current(client,user)||version!==loadVersion)return;
  if(error){list.innerHTML='<div class="empty"><p>'+escQ(error.message)+'</p></div>';return}
  window.renderPrivateOutflows();
  renderCardReconciliation(data||[]);
  const open=(data||[]).filter(t=>!t.imported_kind&&!t.imported_id&&!t.ignored&&classification(t)!=='privat'&&!(D.bank||[]).some(r=>r.qonto_transaction_id===t.id));
  document.getElementById('qonto-summary').innerHTML='<div class="totals-card"><div class="t-row"><span>Bankbewegungen geladen</span><strong>'+data.length+'</strong></div><div class="t-row"><span>Noch zu prüfen</span><strong>'+open.length+'</strong></div></div>';
  if(!open.length){list.innerHTML='<div class="empty"><p>Alles geprüft ✓</p></div>';return}
  list.innerHTML=open.map(t=>{const dup=duplicate(t),debit=t.side==='debit',label=t.label||t.reference||'Bankbewegung';return '<div class="payment-card"><div class="payment-top"><h3>'+escQ(label)+'</h3><strong class="'+(debit?'amtr':'amtg')+'">'+(debit?'-':'+')+eurQ(t.amount)+'</strong></div><p>'+escQ(dateQ(t.settled_at||t.emitted_at))+' · '+(debit?'Ausgang':'Eingang')+(dup?' · ⚠️ möglicher Doppeleintrag':'')+'</p>'+(t.reference?'<p>'+escQ(t.reference)+'</p>':'')+'<div class="payment-actions">'+(isCardPayout(t)?'<span class="summary-note">Kartenauszahlung · bereits im Tagesumsatz erfasst</span>':debit?'<button class="edit-btn" onclick="qontoImport(\''+escQ(t.id)+'\',\'aus\')">Als Ausgabe übernehmen</button>':'<button class="edit-btn" onclick="qontoImport(\''+escQ(t.id)+'\',\'sonstige\')">Als sonstige Einnahme übernehmen</button>')+'<button class="edit-btn" onclick="qontoClassify(\''+escQ(t.id)+'\',\'betrieblich\')">Betrieblich</button><button class="edit-btn" onclick="qontoClassify(\''+escQ(t.id)+'\',\'privat\')">Privat</button><button class="edit-btn" onclick="qontoIgnore(\''+escQ(t.id)+'\')">Ignorieren</button></div></div>'}).join('');
 }
 window.qontoSync=async function(){
  const b=document.getElementById('qonto-sync-btn'),s=document.getElementById('qonto-status');if(!SB||!authUser||b?.disabled)return;
  const client=SB,user=authUser;
  if(b)b.disabled=true;if(s)s.textContent='Qonto wird synchronisiert …';
  try{
   const {data,error}=await client.functions.invoke('qonto-sync',{body:{action:'sync'}});
   if(!current(client,user))return;
   if(error){let m=error.message;try{m=(await error.context.json()).error||m}catch{}throw new Error(m)}
   await syncEngine?.sync();if(!current(client,user))return;
   if(s)s.textContent='Synchronisiert: '+(data?.synced||0)+' Bewegungen aus '+(data?.accounts||0)+' Konto/Konten.';
   await load();
  }catch(e){if(current(client,user)&&s)s.textContent=e.message||String(e)}finally{if(b)b.disabled=false}
 };
 window.qontoImport=async function(id,kind){
  if(!SB||!authUser||importing.has(id))return;
  const client=SB,user=authUser;importing.add(id);
  try{
   const {data:t,error}=await client.from('qonto_transactions').select('*').eq('id',id).single();
   if(!current(client,user))return;
   if(error)throw error;
   if(!t)return;
   if(t.imported_kind||t.imported_id||t.ignored||classification(t)==='privat'){toast('Diese Bankbewegung kann nicht erneut übernommen werden.','a');return;}
   if(isCardPayout(t)){toast('Kartenauszahlungen sind bereits im Tagesumsatz erfasst.','a');return;}
   if(t.side==='credit'){
    const {error:rpcError}=await client.rpc('lokal_import_qonto_income',{p_transaction_id:id});
    if(!current(client,user))return;
    if(rpcError)throw rpcError;
    await syncEngine?.sync();
    if(!current(client,user))return;
    savedToast('Sonstige Bankeinnahme übernommen');await load();return;
   }
   if(t.side!=='debit'||kind!=='aus')return;
   if(duplicate(t)&&!confirm('Es gibt bereits einen Eintrag mit gleichem Datum und Betrag. Trotzdem übernehmen?'))return;
   const datum=dateQ(t.settled_at||t.emitted_at)||today(), amount=Number(t.amount), desc=(t.label||t.reference||'Qonto').slice(0,180);
   const row={id:newId(),datum,kat:suggested(t),beschr:desc,betrag:amount,rechnung_id:null};
   if(!await persistChange('insert','aus',row)||!current(client,user))return;
   const {error:u}=await client.from('qonto_transactions').update({imported_kind:'aus',imported_id:row.id,updated_at:new Date().toISOString()}).eq('id',id);
   if(!current(client,user))return;
   if(u){toast('Buchung übernommen, Bankstatus konnte nicht markiert werden.','a');return;}
   savedToast('Qonto-Buchung übernommen');await load();
  }catch(e){if(current(client,user))toast(e.message||String(e),'r');}finally{importing.delete(id);}
 };
 window.qontoClassify=async function(id,kind){
  if(!SB||!authUser||!['privat','betrieblich'].includes(kind))return;
  const client=SB,user=authUser,patch={classification:kind,updated_at:new Date().toISOString()};
  const {data:t,error:readError}=await client.from('qonto_transactions').select('*').eq('id',id).single();
  if(!current(client,user))return;
  if(readError){toast(readError.message,'r');return;}
  if(!t||t.imported_kind||t.imported_id||t.ignored)return;
  patch.private_category=kind==='privat'?privateCat(t):null;
  const {error}=await client.from('qonto_transactions').update(patch).eq('id',id);
  if(!current(client,user))return;
  if(error)toast(error.message,'r');else{savedToast(kind==='privat'?'Als privat markiert':'Als betrieblich markiert');await syncEngine?.sync();if(current(client,user))await load();}
 };
 window.qontoIgnore=async function(id){
  if(!SB||!authUser)return;
  const client=SB,user=authUser;
  const {data:t,error:readError}=await client.from('qonto_transactions').select('*').eq('id',id).single();
  if(!current(client,user))return;
  if(readError){toast(readError.message,'r');return;}
  if(!t||t.imported_kind||t.imported_id)return;
  const {error}=await client.from('qonto_transactions').update({ignored:true,updated_at:new Date().toISOString()}).eq('id',id);
  if(!current(client,user))return;
  if(error)toast(error.message,'r');else await load();
 };
 const oldSwitch=window.switchTab;
 const hook=()=>{install();window.renderPrivateOutflows();const orig=window.switchTab;if(typeof orig==='function'&&!orig.__qonto){const wrapped=function(name){const r=orig.apply(this,arguments);if(name==='bank')load();return r};wrapped.__qonto=true;window.switchTab=wrapped}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,0));else setTimeout(hook,0);
 window.addEventListener('load',()=>setTimeout(hook,0));
})();