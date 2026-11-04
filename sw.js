// Novi Sad Smart Guide v0.6.0 Google Maps — offline UI shell, NOT offline maps/geofencing.
const CACHE = 'nssg-demo-v0.6.4-tour-routing';
const ASSETS = ['./', './index.html','./google-maps-engine.js','./google-maps-config.js','./google-routing-ui.js','./google-places-ui.js','./google-maps.css','./attractions-guide-v062.js','./attractions-guide-v062.css','./discovery-v050.js','./discovery-v050.css','./discovery-v051.js','./discovery-v051.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate', event => {event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('nssg-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  if(req.mode==='navigate')event.respondWith(fetch(req).then(res=>{if(res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',clone));}return res;}).catch(()=>caches.match('./index.html')));
  else event.respondWith(caches.match(req,{ignoreSearch:true}).then(cached=>cached||fetch(req)));
});
