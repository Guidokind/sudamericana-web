const CACHE='lluvias-shell-v0.1.2';
const SHELL=['./','./index.html','./app.css','./app.js','./manifest.webmanifest','./icons/lluvias-192.png','./icons/lluvias-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lluvias-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const req=event.request, url=new URL(req.url);
  if(req.method!=='GET') return;
  if(url.pathname.includes('/reportes')||url.pathname.includes('/usuarios/')) return;
  if(url.origin===self.location.origin){
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;})).catch(()=>caches.match('./index.html')));
    return;
  }
  // Dependencias de la app: se guardan luego del primer uso exitoso.
  if(url.hostname==='unpkg.com') event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;})));
  // No se hace descarga masiva ni caché programática de tiles OSM/Esri.
});
