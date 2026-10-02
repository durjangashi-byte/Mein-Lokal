/* Shared sync engine. Existing tables; no schema changes or privileged keys. */
(function (root) {
  const tables = {
    ein: {name:'einnahmen', order:'datum', ascending:false},
    aus: {name:'ausgaben', order:'datum', ascending:false},
    mit: {name:'schichten', order:'datum', ascending:false},
    rec: {name:'rechnungen', order:'faellig', ascending:true},
    lief: {name:'lieferanten', order:'name', ascending:true}
  };
  class LokalSync {
    constructor(client, data, storage, project, onData, onStatus) {
      Object.assign(this, {client,data,storage,onData,onStatus});
      this.prefix = 'rv4_pending:' + project + ':';
      this.live = false;
      this.loaded = false;
      this.stopped = false;
      this.error = '';
    }
    pending() {
      const items=[];
      for(let i=0;i<this.storage.length;i++) {
        const key=this.storage.key(i);
        if(key?.startsWith(this.prefix)) {
          let op;try{op=JSON.parse(this.storage.getItem(key));}catch{throw new Error('Beschädigte Warteschlange. Bitte Backup sichern und Support kontaktieren.');}
          if(!tables[op?.table]||!['insert','update','delete'].includes(op.type)||!Number.isSafeInteger(op.id)||!op.row)throw new Error('Ungültiger Eintrag in der Warteschlange.');
          items.push({...op,key});
        }
      }
      return items.sort((a,b)=>a.time-b.time || a.key.localeCompare(b.key));
    }
    status(busy=false) {
      if(this.stopped) return;
      const n=this.pending().length;
      const offline=typeof navigator!=='undefined' && navigator.onLine===false;
      const state=offline?'offline':this.error?'error':busy?'syncing':!this.loaded?'syncing':this.live&&!n?'synced':'waiting';
      this.onStatus(state, [this.error, n?`${n} Änderung(en) auf diesem Gerät warten auf Übertragung.`:'',this.lastSync?`Letzter Abgleich: ${this.lastSync.toLocaleTimeString('de-DE')}`:''].filter(Boolean).join(' '));
    }
    overlay(arr, op) {
      const index=arr.findIndex(row=>row.id===op.id);
      if(op.type==='delete') { if(index>=0) arr.splice(index,1); }
      else if(op.type==='insert') { if(index<0) arr.push({...op.row}); }
      else if(index>=0) arr[index]={...arr[index],...op.row};
    }
    enqueue(type,key,row) {
      if(!tables[key] || !['insert','update','delete'].includes(type)) throw new Error('Ungültige Änderung');
      this.clock=Math.max(Date.now()*1000,(this.clock||0)+1);
      if(!Number.isSafeInteger(row.id))throw new Error('Ungültige Eintrags-ID');
      const op={type,table:key,id:row.id,row:{...row},time:this.clock};
      // Persist BEFORE changing the UI: quota/private-mode errors cannot lose a write silently.
      this.storage.setItem(this.prefix+crypto.randomUUID(),JSON.stringify(op));
      this.overlay(this.data[key],op);
      this.onData();
      this.status(true);
    }
    async write(op) {
      const table=this.client.from(tables[op.table].name);
      let result;
      if(op.type==='insert') {
        // Retry after a lost acknowledgement must not duplicate or overwrite a newer row.
        result=await table.upsert(op.row,{onConflict:'id',ignoreDuplicates:true}).select('id');
        if(!result.error && !result.data?.length) {
          result=await this.client.from(tables[op.table].name).select('id').eq('id',op.id).single();
        }
      } else if(op.type==='update') {
        result=await table.update(op.row).eq('id',op.id).select('id');
        if(!result.error && !result.data?.length) throw new Error('Eintrag fehlt oder Änderung nicht erlaubt.');
      } else result=await table.delete().eq('id',op.id).select('id');
      if(result.error) throw result.error;
      if(op.type==='delete') {
        const check=await this.client.from(tables[op.table].name).select('id').eq('id',op.id);
        if(check.error) throw check.error;
        if(check.data.length) throw new Error('Löschen nicht erlaubt.');
      }
    }
    static normalize(key,row) {
      if(!Number.isSafeInteger(row.id))throw new Error('Eintrags-ID außerhalb des sicheren Zahlenbereichs.');
      const shape={ein:{datum:'',bar:0,karte:0,tip:0,gaeste:0,notiz:''},aus:{datum:'',kat:'',beschr:'',betrag:0},mit:{datum:'',name:'',pos:'',von:'',bis:'',stunden:0,lohn:0,ausgezahlt:0},rec:{beschr:'',betrag:0,faellig:'',notiz:'',bezahlt:false},lief:{name:'',kat:'',kontakt:'',zahlungsziel:0,notiz:''}}[key];
      const result={id:row.id};
      for(const [field,fallback] of Object.entries(shape)) {
        const value=row[field]??fallback;
        result[field]=typeof fallback==='number'?(Number.isFinite(Number(value))?Number(value):0):typeof fallback==='boolean'?value===true:String(value);
      }
      for(const date of ['datum','faellig'])if(date in result && !/^\d{4}-\d{2}-\d{2}$/.test(result[date]))result[date]='';
      return result;
    }
    async read(key) {
      const spec=tables[key], rows=[];
      for(let offset=0;;offset+=1000) {
        const result=await this.client.from(spec.name).select('*').order('id').range(offset,offset+999);
        if(result.error) throw result.error;
        rows.push(...result.data.map(row=>LokalSync.normalize(key,row)));
        if(result.data.length<1000) break;
      }
      for(const op of this.pending().filter(op=>op.table===key)) this.overlay(rows,op);
      rows.sort((a,b)=>String(a[spec.order]||'').localeCompare(String(b[spec.order]||''))*(spec.ascending?1:-1) || b.id-a.id);
      if(!this.stopped) this.data[key]=rows;
    }
    async run() {
      if(typeof navigator!=='undefined' && navigator.onLine===false){this.status();return;}
      this.error='';
      this.status(true);
      const errors=[];
      const blocked=new Set();
      for(const op of this.pending()) {
        if(this.stopped) return;
        // Preserve write order per record while allowing other records to sync.
        const record=op.table+':'+op.id;
        if(blocked.has(record)) continue;
        try { await this.write(op); if(!this.stopped)this.storage.removeItem(op.key); }
        catch(e) { blocked.add(record); errors.push(`${tables[op.table].name}: ${e.message||e}`); }
      }
      const results=await Promise.allSettled(Object.keys(tables).map(async key=>{
        try { await this.read(key); } catch(e) {throw new Error(`${tables[key].name}: ${e.message||e}`);}
      }));
      if(this.stopped) return;
      results.forEach(r=>{if(r.status==='rejected')errors.push(r.reason.message);});
      this.loaded=results.every(r=>r.status==='fulfilled');
      this.error=[...new Set(errors)].join(' · ');
      if(this.loaded && !errors.length) this.lastSync=new Date();
      this.onData();
      this.status();
    }
    async sync() {
      if(this.stopped) return;
      this.again=true;
      if(this.running) return this.running;
      this.running=(async()=>{
        do {
          this.again=false;
          const work=()=>this.stopped?undefined:this.run();
          if(globalThis.navigator?.locks) await navigator.locks.request(this.prefix,work);
          else await work();
        } while(this.again && !this.stopped);
      })().catch(e=>{this.error=e.message||String(e);this.status();}).finally(()=>{this.running=null;});
      return this.running;
    }
    start() {
      if(this.channel||this.stopped)return;
      this.channel=this.client.channel('restaurant-changes-'+crypto.randomUUID());
      for(const spec of Object.values(tables)) this.channel.on('postgres_changes',{event:'*',schema:'public',table:spec.name},()=>this.sync());
      this.channel.subscribe(status=>{
        if(this.stopped)return;
        this.live=status==='SUBSCRIBED';
        this.status();
        if(this.live)this.sync(); // catches changes missed while reconnecting
      });
      this.timer=setInterval(()=>this.sync(),30000); // recovery even if a WebSocket event is missed
      this.sync();
    }
    stop() {
      this.stopped=true;
      clearInterval(this.timer);
      if(this.channel)this.client.removeChannel(this.channel);
    }
  }
  root.LokalSync=LokalSync;
  root.LOKAL_TABLES=tables;
})(globalThis);
