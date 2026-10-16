/* Separate business bank income, using the shared durable sync engine. */
(function(){
 const categories={bankueberweisung:'Banküberweisung',cashback:'Cashback',sonstiges:'Sonstige Einnahme',bankeinnahme:'Bankeinnahme'};
 let draft=null,busy=false,month=today().slice(0,7),query='';
 function panel(){return document.getElementById('sonstige-einnahmen-panel');}
 function install(){
  if(panel())return;
  const root=document.getElementById('p-einnahmen');if(!root)return;
  const p=document.createElement('section');p.id='sonstige-einnahmen-panel';
  p.innerHTML=`<div class="sec-hd">Sonstige betriebliche Einnahmen</div><div class="card"><div class="card-hd">Banküberweisungen & Cashback</div><div style="padding:16px"><p class="summary-note">Separat vom Restaurant-Tagesumsatz. Kartenauszahlungen sind bereits im Kartenumsatz enthalten und dürfen hier nicht erfasst werden.</p><div class="field"><label for="bank-month">Monat</label><input type="month" id="bank-month"></div><div class="field"><label for="bank-query">Suchen</label><input type="search" id="bank-query" placeholder="Beschreibung, Kategorie oder Betrag"></div><button type="button" class="edit-btn" id="bank-all">Alle Monate</button><p id="bank-total" aria-live="polite"></p><form id="bank-form"><input type="hidden" id="bank-id"><p id="bank-edit-hint" class="summary-note"></p><div class="field"><label for="bank-date">Datum</label><input id="bank-date" type="date" required></div><div class="field"><label for="bank-amount">Betrag (€)</label><input id="bank-amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div><div class="field"><label for="bank-category">Kategorie</label><select id="bank-category">${Object.entries(categories).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div class="field"><label for="bank-description">Beschreibung</label><input id="bank-description" maxlength="500" required></div><button type="submit" class="btn-primary" id="bank-save">Einnahme speichern</button><button type="button" class="edit-btn" id="bank-cancel">Abbrechen / Zurücksetzen</button></form></div></div><div id="bank-list"></div>`;
  root.appendChild(p);
  document.getElementById('bank-month').value=month;
  document.getElementById('bank-date').value=today();
  document.getElementById('bank-month').onchange=e=>{month=e.target.value;render();};
  document.getElementById('bank-query').oninput=e=>{query=e.target.value;render();};
  document.getElementById('bank-all').onclick=()=>{month='';document.getElementById('bank-month').value='';render();};
  document.getElementById('bank-form').onsubmit=save;
  document.getElementById('bank-cancel').onclick=reset;
  document.getElementById('bank-list').onclick=async e=>{
   const edit=e.target.closest('[data-bank-edit]'),del=e.target.closest('[data-bank-delete]');
   if(edit)window.editBankIncome(Number(edit.dataset.bankEdit));
   if(del&&!busy&&authUser){const row=D.bank.find(r=>r.id===Number(del.dataset.bankDelete));if(!row||!confirm('Diese sonstige Einnahme wirklich löschen?'))return;busy=true;try{if(await persistChange('delete','bank',{id:row.id})){if(draft?.id===row.id)reset();savedToast('Einnahme gelöscht');}}finally{busy=false;}}
  };
 }
 function reset(){draft=null;const f=document.getElementById('bank-form');if(!f)return;f.reset();document.getElementById('bank-date').value=today();document.getElementById('bank-id').value='';document.getElementById('bank-edit-hint').textContent='';document.getElementById('bank-save').textContent='Einnahme speichern';}
 function render(){
  install();if(!panel())return;
  const rows=authUser?D.bank.filter(r=>(!month||r.datum.startsWith(month))&&[r.datum,r.beschreibung,categories[r.kategorie],r.quelle,eur(r.betrag),r.betrag].join(' ').toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'))):[];
  document.getElementById('bank-total').textContent=rows.length+' Einträge · '+eur(bankSum(rows));
  document.getElementById('bank-list').innerHTML=rows.slice().sort((a,b)=>b.datum.localeCompare(a.datum)||b.id-a.id).map(r=>`<div class="payment-card"><div class="payment-top"><h3 style="overflow-wrap:anywhere">${esc(r.beschreibung)}</h3><strong class="amtg">${eur(r.betrag)}</strong></div><p>${fmt(r.datum)} · ${esc(categories[r.kategorie]||r.kategorie)} · ${esc(r.quelle)}</p><div class="payment-actions"><button type="button" class="edit-btn" data-bank-edit="${r.id}">Bearbeiten</button><button type="button" class="edit-btn" data-bank-delete="${r.id}">Löschen</button></div></div>`).join('')||'<p class="summary-note">Keine passenden Bankeinnahmen.</p>';
 }
 async function save(e){
  e.preventDefault();if(busy||!authUser)return;
  const value=id=>document.getElementById(id).value;
  const datum=value('bank-date'),betrag=Number(value('bank-amount')),kategorie=value('bank-category'),beschreibung=value('bank-description').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(datum)||!Number.isFinite(betrag)||betrag<=0||Math.abs(betrag*100-Math.round(betrag*100))>0.00001||!categories[kategorie]||!beschreibung){toast('Bitte Datum, Beschreibung und einen positiven Betrag mit höchstens zwei Nachkommastellen eingeben.','r');return;}
  if(/zahlungen[ -]vor[ -]ort|angeforderte zahlungen|kartenauszahlung|kartenabrechnung|card payout|card settlement/i.test(beschreibung)){toast('Kartenauszahlungen dürfen nicht erneut als Einnahme erfasst werden.','r');return;}
  if(draft){const current=D.bank.find(r=>r.id===draft.id);if(!current||['id','datum','betrag','kategorie','beschreibung','quelle','qonto_transaction_id'].some(key=>current[key]!==draft[key])){toast('Eintrag inzwischen geändert. Bitte erneut öffnen.','r');return;}}
  if(!draft&&D.bank.some(r=>r.datum===datum&&Math.round(r.betrag*100)===Math.round(betrag*100)&&r.beschreibung.toLocaleLowerCase('de')===beschreibung.toLocaleLowerCase('de'))){toast('Diese Einnahme ist bereits vorhanden.','r');return;}
  busy=true;document.getElementById('bank-save').disabled=true;
  try{const row={...(draft||{id:newId(),quelle:'manuell',qonto_transaction_id:null}),datum,betrag:Math.round(betrag*100)/100,kategorie,beschreibung};if(await persistChange(draft?'update':'insert','bank',row)){reset();savedToast();}}finally{busy=false;document.getElementById('bank-save').disabled=false;}
 }
 window.editBankIncome=id=>{if(!authUser)return;install();const row=D.bank.find(r=>r.id===id);if(!row)return;draft={...row};switchTab('einnahmen');for(const [field,key] of [['id','id'],['date','datum'],['amount','betrag'],['category','kategorie'],['description','beschreibung']])document.getElementById('bank-'+field).value=row[key];document.getElementById('bank-edit-hint').textContent='Bestehende Einnahme bearbeiten · '+(row.quelle==='qonto'?'Qonto-Verknüpfung bleibt erhalten.':'');document.getElementById('bank-save').textContent='Änderungen speichern';document.getElementById('bank-form').scrollIntoView({behavior:'smooth',block:'center'});};
 window.renderBankIncome=render;
 window.resetBankIncome=()=>{reset();query='';if(panel()){document.getElementById('bank-query').value='';document.getElementById('bank-list').replaceChildren();document.getElementById('bank-total').textContent='';}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
