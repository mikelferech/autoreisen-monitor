const CACHE = "mfe-viajes-v2.4.33-r1";
const ICON_CACHE = "mfe-viajes-notification-icon-v1";
const INSTALL_ICON_CACHE = "mfe-viajes-install-icon-v1";
const INSTALL_MANIFEST_CACHE = "mfe-viajes-install-manifest-v1";
const NOTIFICATION_ICON_URL = new URL("./icons/notification-icon", self.location.href).href;
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./seed-data.js",
  "./firebase-config.js", "./receipt-utils.js?v=2.4.24-r1", "./drive-utils.js?v=2.4.24-r1", "./product-image-utils.js?v=2.4.24-r1", "./color-utils.js?v=2.4.24-r1", "./manifest.webmanifest", "./icons/app-icon.svg", "./icons/gc26-logo.png", "./icons/notification-badge.svg", "./icons/google-drive.svg", "./icons/google-maps-pin-official.png?v=2.4.24-r1", "./icons/accuweather-official.png?v=2.4.24-r1", "./icons/google-g.svg", "./icons/tripadvisor.svg", "./icons/booking.svg", "./icons/pdf-file.png?v=2.4.24-r1", "./icons/price-history.png?v=2.4.24-r1", "./icons/excel-file.png?v=2.4.24-r1", "./icons/save-disk.png?v=2.4.24-r1", "./icons/pdf-logo-white.png", "./icons/google-wallet-user.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(k => k.startsWith("mfe-viajes-v") && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("message", event=>{
  if(event.data?.type==="SET_NOTIFICATION_ICON"&&event.data.iconUrl){
    event.waitUntil((async()=>{
      try{
        const response=await fetch(event.data.iconUrl);
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const cache=await caches.open(ICON_CACHE);
        await cache.put(NOTIFICATION_ICON_URL,response.clone());
      }catch(error){console.warn("No se pudo guardar el icono dinámico",error);}
    })());
    return;
  }
  if(event.data?.type==="SET_INSTALL_MANIFEST"&&event.data.url&&event.data.manifest){
    event.waitUntil((async()=>{
      const reply=(payload)=>{try{event.ports?.[0]?.postMessage(payload);}catch{}};
      try{
        const cache=await caches.open(INSTALL_MANIFEST_CACHE);
        const body=JSON.stringify(event.data.manifest);
        const response=new Response(body,{status:200,headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"no-store"}});
        await cache.put(String(event.data.url),response);
        reply({ok:true});
      }catch(error){
        console.warn('No se pudo guardar el manifest dinámico',error);
        reply({ok:false,error:String(error?.message||error)});
      }
    })());
    return;
  }
  if(event.data?.type!=="SET_INSTALL_ICONS"||!Array.isArray(event.data.icons)||!event.data.icons.length)return;
  event.waitUntil((async()=>{
    const reply=(payload)=>{try{event.ports?.[0]?.postMessage(payload);}catch{}};
    try{
      const cache=await caches.open(INSTALL_ICON_CACHE);
      await Promise.all(event.data.icons.map(async entry=>{
        const url=String(entry?.url||'').trim();
        const dataUrl=String(entry?.dataUrl||'').trim();
        if(!url||!dataUrl)return;
        const response=await fetch(dataUrl);
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        await cache.put(url,response.clone());
      }));
      reply({ok:true});
    }catch(error){
      console.warn('No se pudieron guardar los iconos de instalación',error);
      reply({ok:false,error:String(error?.message||error)});
    }
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith((async()=>{
    const icon=await caches.open(ICON_CACHE).then(cache=>cache.match(event.request));
    if(icon)return icon;
    const installIcon=await caches.open(INSTALL_ICON_CACHE).then(cache=>cache.match(event.request));
    if(installIcon)return installIcon;
    const installManifest=await caches.open(INSTALL_MANIFEST_CACHE).then(cache=>cache.match(event.request));
    if(installManifest)return installManifest;
    try{
      const response=await fetch(event.request);
      const copy=response.clone();
      caches.open(CACHE).then((cache)=>cache.put(event.request,copy));
      return response;
    }catch{
      return (await caches.match(event.request)) || (event.request.mode === "navigate" ? await caches.match("./index.html") : Response.error());
    }
  })());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async()=>{
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = { body:event.data?.text() || "" }; }
    const data = payload.data || payload;
    const cachedIcon=await caches.open(ICON_CACHE).then(cache=>cache.match(NOTIFICATION_ICON_URL));
    const title = data.title || payload.notification?.title || "GC 27";
    const options = {
      body: data.body || payload.notification?.body || "Tienes un aviso pendiente.",
      icon: data.icon || (cachedIcon ? NOTIFICATION_ICON_URL : "./icons/gc26-logo.png"),
      badge: "./icons/notification-badge.svg",
      data: { url:data.url || "./" },
      tag: data.tag || "mfe-viajes",
      renotify: true
    };
    await self.registration.showNotification(title, options);
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.href).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list => {
    for (const client of list) { if (client.url.startsWith(self.location.origin) && "focus" in client) { client.navigate(target); return client.focus(); } }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
