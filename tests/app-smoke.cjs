// Application integration smoke test with minimal DOM doubles; no browser or external writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
require('../sync.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const els=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',style:{},classList:{add(){},remove(){}},textContent:'',innerHTML:''}]));
const store=new Map([['rv_sb_url',''],['rv_sb_key','']]);
const ctx=vm.createContext({console,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout(){},window:{addEventListener(){}},document:{body:{classList:{add(){},remove(){}}},getElementById:id=>els.get(id)||null,addEventListener(){},querySelectorAll:()=>[]},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},LOKAL_TABLES:globalThis.LOKAL_TABLES,LokalSync:globalThis.LokalSync});
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
await run('importData({ein:D.ein,rec:D.rec,lief:D.lief})');assert.equal(run('D.ein.length'),1);assert.equal(run('D.rec.length'),1);
for(const k of ['ein','aus','mit','rec','lief']){await run(`_del('${k}',D.${k}[0].id)`);assert.equal(run(`D.${k}.length`),0)}
fill('l-name','<img src=x onerror=alert(1)>');await run('addLieferant()');assert.ok(!els.get('lst-lieferanten').innerHTML.includes('<img'));
console.log('PASS boot, five input flows and renders, invoice status, overnight shift, duplicate-safe import, five deletes');
})().catch(e=>{console.error(e);process.exitCode=1});
