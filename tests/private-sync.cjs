const assert=require('node:assert/strict');require('../sync.js');
(async()=>{
 const rows=Array.from({length:1205},(_,i)=>({id:'q'+i,amount:'0.10',side:i===0?'credit':'debit',status:i===1?'pending':'completed',classification:i===2?'betrieblich':'privat'}));
 const calls=[],data={privat:[{id:'cached'}]},storage={length:0};
 const client={from(table){assert.equal(table,'qonto_transactions');calls.push(table);return {select(){return this},order(){return this},async range(a,b){return {data:rows.slice(a,b+1),error:null}}}}};
 const sync=new LokalSync(client,data,storage,'local',()=>{},()=>{});await sync.readPrivate();assert.equal(calls.length,2);assert.equal(data.privat.length,1203);assert.ok(!data.privat.some(r=>['q1','q2'].includes(r.id)));
 assert.ok(data.privat.some(r=>r.id==='q0'&&r.side==='credit'));
 const before=JSON.stringify(data);sync.stopped=true;rows.push({id:'late',side:'debit',status:'completed',classification:'privat',amount:1});await sync.readPrivate();assert.equal(JSON.stringify(data),before);
 const failing=new LokalSync({from(){return {select(){return this},order(){return this},async range(){return {error:{message:'Unavailable'}}}}}},data,storage,'local',()=>{},()=>{});
 await assert.rejects(()=>failing.readPrivate());assert.equal(JSON.stringify(data),before);
 console.log('PASS read-only private sync pagination >1000, completed debit/credit classification, stopped-session race and error preserves cache');
})().catch(e=>{console.error(e);process.exitCode=1});
