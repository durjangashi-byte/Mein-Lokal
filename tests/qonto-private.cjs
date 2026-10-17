// Runs the browser adapter with an in-memory API: no network or production writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../qonto.js'),'utf8');
function harness(){
 const elements=new Map(['qonto-list','qonto-summary','qonto-private','qonto-card-check','qonto-status','qonto-sync-btn','qonto-history','qonto-history-query','qonto-history-month'].map(id=>[id,{innerHTML:'',textContent:'',disabled:false,replaceChildren(){this.innerHTML=''}}]));
 const state={rows:[],writes:[],rpcs:[],persisted:[],toasts:[],syncs:0,rpcError:null};
 const client={from(table){assert.equal(table,'qonto_transactions');let id,patch;const query={select(){return query},eq(k,v){id=v;return query},order(){return query},range(start,end){state.ranges=(state.ranges||[]).concat([[start,end]]);return state.loadPromise||Promise.resolve({data:state.rows.slice(start,end+1),error:null})},single(){return state.readPromise||Promise.resolve({data:state.rows.find(t=>t.id===id),error:null})},update(row){patch=row;return query},then(resolve,reject){state.writes.push({id,patch});return Promise.resolve({error:null}).then(resolve,reject)}};return query},async rpc(name,args){state.rpcs.push({name,args});return state.rpcPromise||{data:123,error:state.rpcError}},functions:{async invoke(){return {data:{synced:0,accounts:1},error:null}}}};
 const ctx={SB:client,authUser:{id:'owner'},syncEngine:{async sync(){state.syncs++}},D:{ein:[],aus:[],bank:[]},document:{readyState:'loading',getElementById:id=>elements.get(id),addEventListener(){},querySelector(){return null}},setTimeout(){},today:()=> '2026-10-16',newId:()=>123,confirm:()=>true,toast:(...a)=>state.toasts.push(a),savedToast:(...a)=>state.toasts.push(a),async persistChange(...a){state.persisted.push(a);return true}};
 ctx.window={addEventListener(){}};vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,state,elements};
}
(async()=>{
 const {ctx,state,elements}=harness(),w=ctx.window;
 for(const label of ['ZAHLUNGEN-VOR-ORT','Zahlungen vor Ort','Angeforderte Zahlungen','Card payout','card settlement','Kartenauszahlung'])assert.equal(w.isQontoCardPayout({side:'credit',label}),true,label);
 assert.equal(w.isQontoCardPayout({side:'debit',label:'Kartenauszahlung'}),false);
 assert.equal(w.isQontoCardPayout({side:'credit',label:'Diakonie Überweisung'}),false);
 const credit={id:'credit',side:'credit',amount:343.8,label:'Diakonie',classification:'betrieblich'};
 state.rows=[credit];await w.qontoImport('credit','ein');
 assert.equal(state.rpcs.length,1);assert.equal(state.rpcs[0].name,'lokal_import_qonto_income');assert.equal(state.rpcs[0].args.p_transaction_id,'credit');assert.equal(state.syncs,1);assert.equal(state.persisted.length,0);assert.equal(state.writes.length,0);assert.equal(ctx.D.ein.length,0);
 assert.match(elements.get('qonto-list').innerHTML,/Als sonstige Einnahme übernehmen/); // business classification stays visible
 for(const patch of [{imported_kind:'sonstige'},{imported_id:42},{ignored:true},{classification:'privat'},{label:'Zahlungen-vor-Ort'}]){state.rows=[{...credit,...patch}];await w.qontoImport('credit','ein');}
 assert.equal(state.rpcs.length,1);assert.equal(state.persisted.length,0);
 state.rows=[{...credit,label:'Zahlungen-vor-Ort'}];await w.qontoSync();assert.equal(state.syncs,2);assert.doesNotMatch(elements.get('qonto-list').innerHTML,/onclick="qontoImport/);assert.match(elements.get('qonto-history').innerHTML,/Kartenauszahlung/);
 state.rows=[credit];state.rpcError={message:'RPC denied'};await w.qontoImport('credit','sonstige');assert.equal(state.syncs,2);assert.match(state.toasts.at(-1)[0],/RPC denied/);
 state.rpcError=null;let resolve;state.rpcPromise=new Promise(r=>resolve=r);const first=w.qontoImport('credit','sonstige');await Promise.resolve();await Promise.resolve();await w.qontoImport('credit','sonstige');const count=state.rpcs.length;resolve({data:123,error:null});await first;assert.equal(state.rpcs.length,count);
 const h=harness();let readDone;h.state.readPromise=new Promise(r=>readDone=r);const pending=h.ctx.window.qontoImport('credit','ein');h.ctx.authUser=null;readDone({data:credit,error:null});await pending;assert.equal(h.state.rpcs.length,0);
 const l=harness();let loadDone;l.state.loadPromise=new Promise(r=>loadDone=r);const loading=l.ctx.window.qontoSync();await Promise.resolve();await Promise.resolve();l.ctx.authUser=null;loadDone({data:[credit],error:null});await loading;assert.equal(l.elements.get('qonto-list').innerHTML,'');
 const history=harness();history.state.rows=Array.from({length:1005},(_,i)=>({id:'row-'+i,label:i===1004?'Late entry':'Booked entry',side:'debit',amount:1,classification:'betrieblich',imported_kind:'aus',imported_id:i+1,settled_at:i===1004?'2025-01-01T12:00:00Z':'2026-10-01T12:00:00Z'}));
 await history.ctx.window.qontoSync();assert.equal(history.state.ranges.length,2);assert.match(history.elements.get('qonto-history').innerHTML,/1005 \/ 1005/);assert.match(history.elements.get('qonto-history').innerHTML,/Late entry/);
 history.elements.get('qonto-history-query').value='Late';history.ctx.window.renderQontoHistory();assert.match(history.elements.get('qonto-history').innerHTML,/1 \/ 1005/);assert.doesNotMatch(history.elements.get('qonto-history').innerHTML,/Booked entry/);
 history.elements.get('qonto-history-query').value='';history.elements.get('qonto-history-month').value='2025-01';history.ctx.window.renderQontoHistory();assert.match(history.elements.get('qonto-history').innerHTML,/1 \/ 1005/);
 history.ctx.window.resetQontoBank();assert.equal(history.elements.get('qonto-history').innerHTML,'');history.ctx.window.renderQontoHistory();assert.doesNotMatch(history.elements.get('qonto-history').innerHTML,/Late entry/);
 console.log('PASS Qonto credit RPC, card/private/import guards, classified visibility, duplicate click, RPC failure and auth races');
})().catch(e=>{console.error(e);process.exitCode=1});
