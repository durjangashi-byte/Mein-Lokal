// Exercise the deployed Qonto handler with local Qonto and database stubs only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
let code=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/qonto-sync/index.ts'),'utf8'),{disableExperimentalWarning:true});
code=code.replace(/^import .*withSupabase.*;\s*/m,'').replace('export default','globalThis.handler=');
let calls=0,upserts=[];
const ctx=vm.createContext({Response,URL,console,Deno:{env:{get:()=> 'test-server-only'}},withSupabase:(options,callback)=>{assert.equal(options.auth,'user');return callback;},fetch:async url=>{calls++;return new Response(JSON.stringify(String(url).includes('/organization')?{organization:{bank_accounts:[{id:'account'}]}}:{transactions:[{id:'test-bank',amount_cents:1234,side:'credit',label:'Test',settled_at:'2026-10-01T12:00:00Z'}],meta:{}}),{status:200});}});
vm.runInContext(code,ctx);
const request=()=>new Request('https://local.test',{method:'POST'});
const invoke=claims=>ctx.handler.fetch(request(),{userClaims:claims,supabaseAdmin:{from:()=>({upsert:async(rows,options)=>{upserts.push({rows,options});return {error:null};}})}});
(async()=>{
 for(const claims of [{},{sub:'user'},{sub:'user',user_metadata:{lokal_access:'owner'}},{sub:'user',app_metadata:{lokal_access:'staff'}},{sub:'user',app_metadata:{lokal_access:'owner'},is_anonymous:true}])assert.equal((await invoke(claims)).status,403);
 assert.equal(calls,0);assert.equal(upserts.length,0);
 const response=await invoke({sub:'owner',app_metadata:{lokal_access:'owner'},is_anonymous:false});assert.equal(response.status,200);assert.equal((await response.json()).synced,1);assert.equal(upserts.length,1);assert.equal(upserts[0].rows[0].user_id,'owner');assert.equal(upserts[0].rows[0].amount,12.34);
 // The sync updates source data only, preserving existing classification/import markers.
 for(const field of ['imported_kind','imported_id','classification','ignored'])assert.equal(field in upserts[0].rows[0],false);
 console.log('PASS Qonto edge rejects nonowner/anonymous/forged metadata before bank access; owner sync preserves import markers');
})().catch(e=>{console.error(e);process.exitCode=1;});
