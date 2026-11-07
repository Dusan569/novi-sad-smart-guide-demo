// One complete, immutable app shell per release. Google responses/keys are never cached.
const RELEASE = '067';
// Scope separation keeps a preview from changing the public root's offline shell.
const CACHE_PREFIX = 'nssg-shell:'+new URL('./',self.location.href).pathname+':';
const CACHE = CACHE_PREFIX+'v0.6.7';
const VERSIONED = ['google-maps-engine.js','google-maps-config.js','google-routing-ui.js',
  'google-places-ui.js','google-maps.css','attractions-guide-v062.js','attractions-guide-v062.css',
  'discovery-v050.js','discovery-v050.css','discovery-v051.js','discovery-v051.css','tour-session-v067.css'];
const ASSETS = ['./index.html', ...VERSIONED.map(file=>'./'+file+'?v='+RELEASE),
  './manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install', event => {
  // Bypass HTTP cache as well as the old worker. A failed asset aborts the upgrade.
  event.waitUntil(caches.open(CACHE)
    .then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const scope=new URL('./',self.location.href);
  const isApp=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html');
  // Never put network HTML into the installed cache: that mixed new HTML and old JS.
  // Exact matches retain the release query string; never ignoreSearch across versions.
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(isApp?'./index.html':request);
    return cached||fetch(request);
  }));
});
