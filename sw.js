/* Push only: no business data or sessions cached by this worker. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Mein Lokal',{body:data.body||'Zahlungen prüfen',tag:data.tag||'lokal-payments',icon:'icon-192.png',data:{url:'https://durjangashi-byte.github.io/Mein-Lokal/?view=rechnungen'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url='https://durjangashi-byte.github.io/Mein-Lokal/?view=rechnungen';
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const client=clients.find(c=>c.url.startsWith('https://durjangashi-byte.github.io/Mein-Lokal/'));if(client){client.postMessage({type:'open-payments'});await client.focus();}else await self.clients.openWindow(url);}));
});
