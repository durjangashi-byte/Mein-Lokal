// Darlehen-Berechnung (D&S Automaten) ohne Browser.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ctx=vm.createContext({window:{},document:{readyState:'complete',getElementById:()=>null,querySelector:()=>null},esc:s=>String(s),eur:v=>v.toFixed(2)+' €',today:()=>'2026-11-18'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../darlehen.js'),'utf8'),ctx);
const {LOANS,status}=ctx.window.LokalDarlehen,loan=LOANS[0];
const r=(datum,betrag,beschr='Darlehen D&S Automaten – Rate')=>({id:Math.random(),datum,betrag,beschr,kat:'schulden'});
const rows=[r('2026-05-24',950),r('2026-06-24',850),r('2026-07-30',790),r('2026-08-25',300),r('2026-09-23',445.26),r('2026-10-03',1000,'Darlehen Bobo'),{id:9,datum:'2026-09-01',betrag:99,beschr:'D&S Automaten Miete',kat:'sonstiges'}];
const s=status(loan,rows,'2026-11-18');
assert.equal(s.list.length,5);assert.equal(s.getilgt,3335.26);assert.equal(s.rest,6664.74);assert.equal(s.frist,'2027-05-06');
assert.equal(s.tageBis,169);assert.equal(s.lage,'knapp');assert.ok(s.noetig>1150&&s.noetig<1250,'noetig '+s.noetig);
assert.ok(s.prognoseRest>3500&&s.prognoseRest<4000,'prognose '+s.prognoseRest);assert.equal(s.zinsJahr,Math.round(s.prognoseRest*7.2)/100);
const done=status(loan,[...rows,r('2026-11-20',6664.74)],'2026-11-20');assert.equal(done.rest,0);assert.equal(done.lage,'fertig');assert.equal(done.noetig,0);
const late=status(loan,rows,'2027-06-01');assert.equal(late.lage,'zins');assert.equal(late.noetig,6664.74);
console.log('darlehen ok',JSON.stringify({noetig:s.noetig,schnitt:s.schnitt,prognose:s.prognoseRest,zins:s.zinsJahr}));
