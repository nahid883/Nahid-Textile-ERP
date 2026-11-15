const C="nte-v1";
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(["./","manifest.json","icon-192.png"])).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
self.addEventListener("fetch",e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=="GET"||!(u.origin===location.origin||/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)$/.test(u.host)))return;
 e.respondWith(fetch(r).then(x=>{if(x.ok){const y=x.clone();caches.open(C).then(c=>c.put(r,y));}return x;})
  .catch(()=>caches.match(r).then(m=>m||caches.match("./"))));
});
