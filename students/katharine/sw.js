/* Scope is katharine/ only. Never delete unrelated caches or learner storage. */
const SHELL='katharine-shell-v1',AUDIO='katharine-audio-v1',ROOT=new URL('./',self.location),CORE=['./','index.html','styles.css','scheduler.js','app.js','data.js','audio-manifest.js','audio-manifest.json','icon.svg','manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL).then(c=>c.addAll(CORE))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);const shared=new URL('../shared/',ROOT);if(e.request.method!=='GET'||u.origin!==ROOT.origin||!(u.pathname.startsWith(ROOT.pathname)||u.pathname.startsWith(shared.pathname)))return;
if(u.pathname.includes('/audio/')||u.pathname.includes('/pdfs/')){e.respondWith(caches.open(AUDIO).then(async c=>{const old=await c.match(e.request);if(old)return old;const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r;}));return;}
e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(SHELL).then(c=>c.put(e.request,copy));}return r;}).catch(async()=>{const c=await caches.open(SHELL);return await c.match(e.request)||(e.request.mode==='navigate'?await c.match('index.html'):Response.error());}));});
