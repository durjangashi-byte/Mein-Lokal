// Application integration smoke test with minimal DOM doubles; no browser or external writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
require('../sync.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const els=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',style:{},classList:{add(){},remove(){}},textContent:'',innerHTML:''}]));
for(const m of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const el=els.get(m[1]);el.tagName='SELECT';el.options=[...m[2].matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)/g)].map(o=>({value:o[1]??o[2]}));el.value=el.options[0]?.value||'';el.appendChild=opt=>el.options.push(opt);}
const store=new Map([['rv_sb_url',''],['rv_sb_key','']]);
const ctx=vm.createContext({console,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout(){},window:{addEventListener(){}},document:{body:{classList:{add(){},remove(){}}},getElementById:id=>els.get(id)||null,addEventListener(){},querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),get length(){return store.size},key:i=>Array.from(store.keys())[i],removeItem:k=>store.delete(k)},LOKAL_TABLES:globalThis.LOKAL_TABLES,LokalSync:globalThis.LokalSync});
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
assert.match(els.get('m-erg').textContent,/85/);
// Editing reuses IDs, keeps invoice payment status and recalculates shifts.
const flows=[['ein','e-bar','120','addEinnahme','bar',120],['aus','a-betrag','20','addAusgabe','betrag',20],['mit','m-lohn','20','addSchicht','ausgezahlt',80],['rec','r-betrag','24','addRechnung','betrag',24],['lief','l-zahlungsziel','0','addLieferant','zahlungsziel',0]];
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

await run('importData({ein:D.ein,rec:D.rec,lief:D.lief})');assert.equal(run('D.ein.length'),1);assert.equal(run('D.rec.length'),1);
for(const k of ['ein','aus','mit','rec','lief']){await run(`_del('${k}',D.${k}[0].id)`);assert.equal(run(`D.${k}.length`),0)}
fill('l-name','<img src=x onerror=alert(1)>');await run('addLieferant()');assert.ok(!els.get('lst-lieferanten').innerHTML.includes('<img'));
console.log('PASS boot, five create/edit/delete flows, period totals, invoice paid preservation, edit conflicts/cancel, durable UPDATE queue and double-submit guard, invalid inputs, legacy categories, import');
})().catch(e=>{console.error(e);process.exitCode=1});
