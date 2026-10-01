// Explicit opt-in live integration test. Uses only disposable negative IDs and removes them.
// SUPABASE_TEST_SDK=/path/to/pinned/browser-bundle.js node tests/live-sync.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
vm.runInThisContext(fs.readFileSync(process.env.SUPABASE_TEST_SDK,'utf8'));
require('../sync.js');
const url=process.env.SUPABASE_URL||'https://ofrowanjbedqbmpgtkkv.supabase.co';
const key=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_LHuJndu2b6HOopA2OId3hg_WssZ5wDe';
class Storage {constructor(){this.m=new Map()}get length(){return this.m.size}key(i){return [...this.m.keys()][i]}getItem(k){return this.m.get(k)||null}setItem(k,v){this.m.set(k,v)}removeItem(k){this.m.delete(k)}}
const data=()=>Object.fromEntries(Object.keys(LOKAL_TABLES).map(k=>[k,[]]));
let offline=false;
const a=supabase.createClient(url,key,{auth:{persistSession:false},global:{fetch:(u,o)=>{if(offline)return Promise.reject(new Error('TEST offline'));return fetch(u,{...o,signal:AbortSignal.timeout(10000)})}}});
const b=supabase.createClient(url,key,{auth:{persistSession:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(10000)})}});
let da=data(),db=data(),storage=new Storage(),sa=new LokalSync(a,da,storage,url,()=>{},()=>{}),sb=new LokalSync(b,db,new Storage(),url,()=>{},()=>{});
const base=-Date.now()*1000;
const rows={ein:{id:base,datum:'2000-01-01',bar:1,karte:2,tip:0,gaeste:1,notiz:'SYNC TEST'},aus:{id:base-1,datum:'2000-01-01',kat:'sonstiges',beschr:'SYNC TEST',betrag:1},mit:{id:base-2,datum:'2000-01-01',name:'SYNC TEST',pos:'Test',von:'10:00',bis:'11:00',stunden:1,lohn:1,ausgezahlt:1},rec:{id:base-3,beschr:'SYNC TEST',betrag:1,faellig:'2000-01-01',notiz:'SYNC TEST',bezahlt:false},lief:{id:base-4,name:'SYNC TEST',kat:'sonstiges',kontakt:'',zahlungsziel:14,notiz:'SYNC TEST'}};
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Timeout '+label+' '+sa.error+' '+sb.error)}

(async()=>{try{
 assert.equal(typeof a.from('rechnungen').select('*').catch,'undefined');console.log('PASS original .catch() root cause reproduced');
 sa.start();sb.start();clearInterval(sa.timer);clearInterval(sb.timer);
 await until(()=>sa.live&&sb.live&&sa.loaded&&sb.loaded,'initial read / Realtime');console.log('PASS two independent clients connected');
 for(const k of Object.keys(rows)){sa.enqueue('insert',k,rows[k]);await sa.sync();await until(()=>db[k].some(r=>r.id===rows[k].id),'Realtime INSERT '+k);console.log('PASS realtime INSERT',k)}
 sb.enqueue('update','rec',{id:rows.rec.id,bezahlt:true});await sb.sync();await until(()=>da.rec.find(r=>r.id===rows.rec.id)?.bezahlt,'reverse UPDATE');console.log('PASS reverse realtime invoice UPDATE');
 // Idempotent insert replay must not undo the other client's later update.
 sa.enqueue('insert','rec',rows.rec);await sa.sync();assert.equal(da.rec.find(r=>r.id===rows.rec.id).bezahlt,true);console.log('PASS lost-acknowledgement insert replay preserves newer update');
 offline=true;sa.enqueue('update','lief',{id:rows.lief.id,notiz:'offline recovery'});await sa.sync();assert.ok(sa.pending().length);assert.match(sa.error,/offline/);sa.stop();
 // Same device cache + durable outbox, new engine (page reload).
 sa=new LokalSync(a,da,storage,url,()=>{},()=>{});offline=false;await sa.sync();await until(()=>db.lief.find(r=>r.id===rows.lief.id)?.notiz==='offline recovery','offline replay');assert.equal(sa.pending().length,0);console.log('PASS offline queue survives engine restart and reaches second client');
 for(const k of Object.keys(rows)){sa.enqueue('delete',k,{id:rows[k].id});await sa.sync();await until(()=>!db[k].some(r=>r.id===rows[k].id),'Realtime DELETE '+k);console.log('PASS realtime DELETE',k)}
 }finally{offline=false;sa.stop();sb.stop();await sa.running;await sb.running;for(const k of Object.keys(rows)){const r=await b.from(LOKAL_TABLES[k].name).delete().eq('id',rows[k].id);if(r.error)throw r.error;}await a.removeAllChannels();await b.removeAllChannels();console.log('Test records removed');}})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
