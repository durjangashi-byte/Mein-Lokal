// Application integration smoke test with minimal DOM doubles; no browser or external writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
require('../sync.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const els=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',style:{},classList:{add(){},remove(){}},textContent:'',innerHTML:'',replaceChildren(){this.innerHTML=''}}]));
for(const m of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const el=els.get(m[1]);el.tagName='SELECT';el.options=[...m[2].matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)/g)].map(o=>({value:o[1]??o[2]}));el.value=el.options[0]?.value||'';el.appendChild=opt=>el.options.push(opt);}
const store=new Map([['rv_sb_url',''],['rv_sb_key','']]);
const ctx=vm.createContext({console,clearReceiptContext(){},receiptButton(){return ''},crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout(){},window:{addEventListener(){}},document:{body:{classList:{add(){},remove(){}}},getElementById:id=>els.get(id)||null,addEventListener(){},querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),get length(){return store.size},key:i=>Array.from(store.keys())[i],removeItem:k=>store.delete(k)},LOKAL_TABLES:globalThis.LOKAL_TABLES,LokalSync:globalThis.LokalSync});
vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
const run=code=>vm.runInContext(code,ctx);const fill=(id,v)=>els.get(id).value=v;
(async()=>{
assert.equal(run('authUser'),null);
assert.equal(await run("persistChange('insert','ein',{id:1})"),false);
run("authUser={id:'test-owner'};renderAll()");
fill('e-bar','100');fill('e-karte','50');fill('e-tip','5');await run('addEinnahme()');assert.equal(run('D.ein.length'),1);
fill('a-beschr','Test');fill('a-betrag','10');await run('addAusgabe()');assert.equal(run('D.aus.length'),1);
fill('m-name','Test');fill('m-von','22:00');fill('m-bis','02:00');fill('m-lohn','15');await run('addSchicht()');assert.equal(run('D.mit[0].stunden'),4);assert.equal(run('D.mit[0].ausgezahlt'),60);
fill('r-beschr','Test');fill('r-betrag','12');await run('addRechnung()');assert.equal(run('D.rec.length'),1);await run('toggleBezahlt(D.rec[0].id)');assert.equal(run('D.rec[0].bezahlt'),true);
fill('l-name','Test');await run('addLieferant()');assert.equal(run('D.lief.length'),1);
for(const id of ['lst-ein','lst-aus','lst-mit','lst-rechnungen-bezahlt','lst-lieferanten','monat-cards'])assert.ok(els.get(id).innerHTML,'render '+id);
assert.match(els.get('m-erg').textContent,/35/);
// Editing reuses IDs, keeps invoice payment status and recalculates shifts.
const flows=[['ein','e-bar','120','addEinnahme','bar',70],['aus','a-betrag','20','addAusgabe','betrag',20],['mit','m-lohn','20','addSchicht','ausgezahlt',80],['rec','r-notiz','Bezahlt geprüft','addRechnung','notiz','Bezahlt geprüft'],['lief','l-zahlungsziel','0','addLieferant','zahlungsziel',0]];
for(const [key,field,value,fn,prop,expected] of flows){const id=run(`D.${key}[0].id`);run(`editEntry('${key}',${id})`);assert.equal(els.get('cancel-'+key).hidden,false);fill(field,value);await run(fn+'()');assert.equal(run(`D.${key}.length`),1);assert.equal(run(`D.${key}[0].id`),id);assert.equal(run(`D.${key}[0].${prop}`),expected);assert.equal(els.get('cancel-'+key).hidden,true);}
assert.equal(run('D.rec[0].bezahlt'),true);
// Cancel does not mutate; known remote changes/deletion block stale editors.
run("editEntry('aus',D.aus[0].id)");fill('a-betrag','999');run("cancelEdit('aus')");assert.equal(run('D.aus[0].betrag'),20);
run("editEntry('ein',D.ein[0].id);D.ein[0].bar=130");fill('e-bar','140');await run('addEinnahme()');assert.equal(run('D.ein[0].bar'),130);run("cancelEdit('ein')");
// Period totals exclude other months; outstanding invoices remain separate.
run("D.ein.push({id:42,datum:'1999-01-02',bar:1000,karte:0,tip:0,gaeste:0,notiz:''});renderAll()");assert.match(els.get('dh-before-labor').textContent,/165/);assert.match(els.get('dh-val').textContent,/85/);
run("dashboardPeriod='1999-01';renderDashboard();updateMetrics()");assert.match(els.get('m-ein').textContent,/1.000/);run("dashboardPeriod='';renderAll()");assert.match(els.get('m-ein').textContent,/1.185/);run("D.ein.pop();dashboardPeriod=today().slice(0,7);renderAll()");
// Durable outbox receives UPDATE, not INSERT; resubmission is ignored.
run("syncEngine=new LokalSync({},D,localStorage,'test',()=>renderAll(),setSyncStatus);syncEngine.sync=()=>Promise.resolve()");
run("editEntry('aus',D.aus[0].id)");fill('a-betrag','25');await Promise.all([run('addAusgabe()'),run('addAusgabe()')]);
assert.equal(run('syncEngine.pending().length'),1);assert.equal(run('syncEngine.pending()[0].type'),'update');assert.equal(run('D.aus[0].betrag'),25);
run("setSyncStatus('offline')");assert.match(els.get('save-status').textContent,/1 Änderung.*auf Gerät gespeichert/);
run("setSyncStatus('error','Testfehler')");assert.match(els.get('save-detail').textContent,/Testfehler/);
run("syncEngine=null");
// Invalid values refuse writes; unfamiliar legacy select values stay editable.
fill('a-betrag','-1');await run('addAusgabe()');assert.equal(run('D.aus.length'),1);
run("D.lief[0].kat='Altbestand';editEntry('lief',D.lief[0].id)");assert.equal(els.get('l-kat').value,'Altbestand');run("cancelEdit('lief')");

// Searchable individual drill-down: period isolation, no caps/deduplication, safe text and original editing links.
const original=run('JSON.stringify(D)');
run("D.ein=[{id:101,datum:'2026-10-07',bar:1015.4,karte:142.6,tip:0,notiz:'Gesamtumsatz'}];D.aus=[{id:102,datum:'2026-10-07',kat:'getraenke',beschr:'Ackermann Getränke',betrag:284.21},{id:103,datum:'2026-10-07',kat:'schulden',beschr:'Darlehen Bobo',betrag:1000},{id:104,datum:'2026-09-01',kat:'getraenke',beschr:'September',betrag:20},{id:105,datum:'2026-10-08',kat:'personal',beschr:'Sabrina',betrag:84},{id:106,datum:'2026-10-08',kat:'sonstiges',beschr:'<img src=x onerror=alert(1)>',betrag:1}];D.mit=[{id:107,datum:'2026-10-08',name:'Sabrina Schicht',von:'10:00',bis:'12:00',stunden:2,lohn:15,ausgezahlt:30}];dashboardPeriod='2026-10';selectedMonth='2026-10';renderDashboard();renderMonat()");
const beforeSearch=run('JSON.stringify(D)');
assert.equal(run("bookingRows('dashboard').length"),6);
assert.equal((els.get('dashboard-bookings').innerHTML.match(/class="booking-entry"/g)||[]).length,6);
assert.ok(!els.get('dashboard-bookings').innerHTML.includes('September'));
assert.ok(!els.get('dashboard-bookings').innerHTML.includes('<img'));
assert.match(els.get('dashboard-bookings').innerHTML,/editEntry\('aus',102\)/);
fill('dashboard-booking-query','ackermann');run("renderBookings('dashboard')");
assert.match(els.get('dashboard-bookings').innerHTML,/Ackermann/);assert.match(els.get('dashboard-bookings').innerHTML,/ open>/);assert.match(els.get('dashboard-booking-count').textContent,/1 von 6/);
for(const query of ['284,21','284.21','2026-10-07','getränke']){fill('dashboard-booking-query',query);run("renderBookings('dashboard')");assert.match(els.get('dashboard-bookings').innerHTML,/Ackermann/);}
fill('dashboard-booking-query','absent');run("renderBookings('dashboard')");assert.match(els.get('dashboard-bookings').innerHTML,/Keine passenden/);
run("resetBookingSearch('dashboard')");fill('dashboard-booking-kind','schulden');run("renderBookings('dashboard')");assert.match(els.get('dashboard-bookings').innerHTML,/Darlehen/);assert.ok(!els.get('dashboard-bookings').innerHTML.includes('Ackermann'));
fill('monat-booking-query','Sabrina');run("renderBookings('monat')");assert.match(els.get('monat-booking-count').textContent,/2 von 6/);assert.equal(els.get('dashboard-booking-kind').value,'schulden');
assert.equal(run('JSON.stringify(D)'),beforeSearch);
run("resetBookingSearch('dashboard');resetBookingSearch('monat');D.aus=Array.from({length:125},(_,i)=>({id:200+i,datum:'2026-10-08',kat:'sonstiges',beschr:'Gleiche Beschreibung',betrag:1}));renderBookings('dashboard')");
assert.equal((els.get('dashboard-bookings').innerHTML.match(/class="booking-entry"/g)||[]).length,127);
run('Object.assign(D,'+original+')');run("dashboardPeriod=today().slice(0,7);selectedMonth=dashboardPeriod;renderAll()");

// New payment UI: amount correction before payment, idempotent local submit, snooze and series actions.
await run('reversePayment(D.rec[0].id)');
const paymentId=run('D.rec[0].id');
await run(`payInvoice(${paymentId},18,today())`);assert.equal(run('D.rec[0].betrag'),18);assert.equal(run('D.rec[0].bezahlt'),true);
assert.equal(await run(`payInvoice(${paymentId},99,today())`),false);assert.equal(run('D.rec[0].betrag'),18);
await run(`reversePayment(${paymentId})`);const due=run('D.rec[0].faellig');await run(`snoozePayment(${paymentId},addDays(today(),1))`);assert.equal(run('D.rec[0].faellig'),due);assert.equal(run('D.rec[0].erinnerung_am'),run('addDays(today(),1)'));
await run(`setSeries(${paymentId},'pause')`);assert.equal(run('D.rec[0].pausiert'),true);await run(`setSeries(${paymentId},'resume')`);assert.equal(run('D.rec[0].pausiert'),false);
fill('r-search','nonexistent');run('renderRechnungen()');assert.match(els.get('lst-rechnungen-offen').innerHTML,/Keine passenden/);fill('r-search','');
run('useProvider(D.lief[0].id)');assert.equal(els.get('r-anbieter').value,run('D.lief[0].name'));
assert.equal(run("addDays('2026-03-28',2)"),'2026-03-30');
assert.equal(globalThis.LokalSync.normalize('rec',{id:1}).serie_id,null);
assert.equal(globalThis.LokalSync.normalize('aus',{id:2}).rechnung_id,null);

await run('importData({ein:D.ein,rec:D.rec,lief:D.lief})');assert.equal(run('D.ein.length'),1);assert.equal(run('D.rec.length'),1);
await run('reversePayment(D.rec[0].id)');
for(const k of ['ein','aus','mit','rec','lief']){await run(`_del('${k}',D.${k}[0].id)`);assert.equal(run(`D.${k}.length`),0)}
fill('l-name','<img src=x onerror=alert(1)>');await run('addLieferant()');assert.ok(!els.get('lst-lieferanten').innerHTML.includes('<img'));
console.log('PASS individual booking search, period isolation, all rows without caps, debts/shifts separated, escaped text, read-only drill-down, boot, five create/edit/delete flows, period totals, invoice paid preservation, edit conflicts/cancel, durable UPDATE queue and double-submit guard, invalid inputs, legacy categories, import');
})().catch(e=>{console.error(e);process.exitCode=1});

