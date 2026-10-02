/* Native Supabase Passkeys (experimental API, SDK pinned in index.html).
   Server RLS must also be enabled using security/enable-owner-access.sql. */
(function(root){
  class LokalAuth {
    constructor(client,{onUnlock,onLock,onMessage}) {
      Object.assign(this,{client,onUnlock,onLock,onMessage});
      this.generation=0;this.busy=false;this.stopped=false;this.activeUserId=null;
    }
    static isOwner(user) {
      return !!(user?.id && user.email_confirmed_at && !user.is_anonymous && user.app_metadata?.lokal_access==='owner');
    }
    async start() {
      this.subscription=this.client.auth.onAuthStateChange(event=>{
        if(this.stopped)return;
        if(event==='SIGNED_OUT'){this.activeUserId=null;this.generation++;this.onLock();}
        // Never await Auth methods inside its callback (SDK holds an internal lock).
        setTimeout(()=>this.check(),0);
      }).data.subscription;
      await this.check();
    }
    async check() {
      const generation=++this.generation;
      if(this.stopped)return;
      try {
        const {data,error}=await this.client.auth.getUser();
        if(this.stopped||generation!==this.generation)return;
        if(error||!data.user){this.activeUserId=null;this.onLock();this.onMessage('Melde dich mit deinem Passkey oder per E-Mail an.');return;}
        if(!LokalAuth.isOwner(data.user)){
          this.activeUserId=null;this.onLock();this.onMessage('Deine E-Mail ist bestätigt. Dieses Konto muss noch für dein Lokal freigeschaltet werden.');return;
        }
        if(this.activeUserId!==data.user.id){await this.onUnlock(data.user);this.activeUserId=data.user.id;}
      } catch(e){if(!this.stopped&&generation===this.generation){this.activeUserId=null;this.onLock();this.onMessage('Anmeldung konnte nicht geprüft werden. Bitte Verbindung prüfen und erneut versuchen.');}}
    }
    async action(work,success) {
      if(this.busy)return false;
      this.busy=true;
      try {const result=await work();if(result.error)throw result.error;if(this.stopped)return false;this.onMessage(success);return true;}
      catch(e){this.onMessage(LokalAuth.errorMessage(e));return false;}
      finally{this.busy=false;}
    }
    static errorMessage(error) {
      const code=error.code||error.name||'';
      if(code==='passkey_disabled')return 'Passkeys müssen zuerst in Supabase aktiviert werden. Bis dahin kannst du dich per E-Mail anmelden.';
      if(/NotAllowed|CANCEL|ABORT/i.test(code))return 'Die Face-ID-/Passkey-Abfrage wurde abgebrochen. Du kannst es erneut versuchen.';
      if(/webauthn_challenge_expired/.test(code))return 'Die Anfrage ist abgelaufen. Bitte erneut mit Passkey anmelden.';
      if(/credential_not_found/.test(code))return 'Für dieses Konto ist auf diesem Gerät noch kein Passkey verfügbar. Nutze die E-Mail-Anmeldung.';
      return error.message||'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
    }
    async signInPasskey() {
      if(!root.PublicKeyCredential || !root.isSecureContext){this.onMessage('Dieser Browser unterstützt hier keine Passkeys. Öffne die App in Safari über HTTPS oder nutze die E-Mail-Anmeldung.');return false;}
      return this.action(()=>this.client.auth.signInWithPasskey(),'Passkey bestätigt. Anmeldung wird geprüft …');
    }
    async registerPasskey() {
      return this.action(async()=>{
      // Use a fresh server-validated user, never user_metadata or a DOM flag.
      const {data,error}=await this.client.auth.getUser();
      if(error||!LokalAuth.isOwner(data.user))throw new Error('Bitte zuerst mit deinem freigeschalteten Konto anmelden.');
      if(!root.PublicKeyCredential || !root.isSecureContext)throw new Error('Passkeys sind in diesem Browser nicht verfügbar.');
      return this.client.auth.registerPasskey();},'Passkey gespeichert. Du kannst dich künftig mit Face ID, Touch ID oder deiner Gerätesperre anmelden.');
    }
    async password(email,password) {
      if(!email||!password){this.onMessage('Bitte E-Mail und Passwort eingeben.');return false;}
      return this.action(()=>this.client.auth.signInWithPassword({email,password}),'Anmeldung wird geprüft …');
    }
    async email(email) {
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){this.onMessage('Bitte eine gültige E-Mail-Adresse eingeben.');return false;}
      return this.action(()=>this.client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:'https://durjangashi-byte.github.io/Mein-Lokal/'}}),'Prüfe dein E-Mail-Postfach und öffne den Anmeldelink. Falls deine E-Mail einen Code enthält, kannst du ihn unten eingeben.');
    }
    async verify(email,token) {
      if(!email||!/^\d{6,10}$/.test(token)){this.onMessage('Bitte E-Mail-Adresse und den vollständigen Code aus der E-Mail eingeben.');return false;}
      return this.action(()=>this.client.auth.verifyOtp({email,token,type:'email'}),'E-Mail bestätigt. Anmeldung wird geprüft …');
    }
    async signOut() {
      return this.action(()=>this.client.auth.signOut({scope:'local'}),'Auf diesem Gerät abgemeldet.');
    }
    stop(){this.stopped=true;this.generation++;this.subscription?.unsubscribe();}
  }
  root.LokalAuth=LokalAuth;
})(globalThis);
