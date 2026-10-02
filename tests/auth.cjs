const assert=require('node:assert/strict');require('../auth.js');
const owner={id:'owner',email_confirmed_at:'2026-10-02',is_anonymous:false,app_metadata:{lokal_access:'owner'}};
(async()=>{
assert.equal(LokalAuth.isOwner(owner),true);
for(const user of [null,{...owner,email_confirmed_at:null},{...owner,is_anonymous:true},{...owner,app_metadata:{},user_metadata:{lokal_access:'owner'}}])assert.equal(LokalAuth.isOwner(user),false);
let unlock=0,lock=0,message='',user=owner,fail=false,passkeyCalls=0,passwordSeen=false;
const client={auth:{getUser:async()=>({data:{user},error:fail?new Error('offline'):null}),signInWithPassword:async args=>{passwordSeen=args.password==='fixture';return {error:null}},signInWithPasskey:async()=>{passkeyCalls++;return {error:{code:'passkey_disabled'}}},registerPasskey:async()=>({error:null}),signOut:async()=>({error:null})}};
const auth=new LokalAuth(client,{onUnlock:()=>unlock++,onLock:()=>lock++,onMessage:m=>message=m});
await auth.check();assert.equal(unlock,1);await auth.check();assert.equal(unlock,1);assert.equal(lock,0);user={...owner,app_metadata:{}};await auth.check();assert.equal(unlock,1);assert.match(message,/freigeschaltet/);
user=owner;fail=true;await auth.check();assert.equal(unlock,1);fail=false;
await auth.password('fixture@example.test','fixture');assert.equal(passwordSeen,true);
globalThis.PublicKeyCredential=function(){};globalThis.isSecureContext=true;
assert.equal(await auth.signInPasskey(),false);assert.equal(passkeyCalls,1);assert.match(message,/aktiviert/);
user={...owner,app_metadata:{}};assert.equal(await auth.registerPasskey(),false);
user=owner;assert.equal(await auth.registerPasskey(),true);
auth.stop();await auth.check();assert.equal(unlock,1);
assert.match(LokalAuth.errorMessage({name:'NotAllowedError'}),/abgebrochen/);
console.log('PASS server-verified owner gate, unconfirmed/anonymous/forged-metadata denial, network fail-closed, password flow, disabled/cancelled passkeys, registration authorization, stopped-controller race');
})().catch(e=>{console.error(e);process.exitCode=1});
