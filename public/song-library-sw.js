/* Offline caching is opt-in and stores selected Drum Hero pages and static learning assets. */
const PREFIX='drum-hero-song-offline-';
const META=PREFIX+'meta';
const OFFLINE_ROUTES=['/','/learn','/practice','/trainer','/rudiments','/grooves','/kit','/song-library','/song-builder','/progress','/about','/play-alongs'];
const allowed=path=>path.startsWith('/_next/static/')||path.startsWith('/audio/drums/')||path.startsWith('/models/drums/')||path==='/drum-hero-logo.svg'||path==='/manifest.webmanifest';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function hash(response){const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
async function settings(){const response=await (await caches.open(META)).match('/song-offline-status');return response?response.json():null;}
self.addEventListener('message',event=>{
 const port=event.ports[0];if(!port)return;
 event.waitUntil((async()=>{let downloadCacheName=null,previousCacheName=null;try{
  if(event.data?.type==='status'){port.postMessage({status:await settings()});return;}
  if(event.data?.type==='remove'){for(const key of await caches.keys())if(key.startsWith(PREFIX))await caches.delete(key);port.postMessage({removed:true});return;}
  if(event.data?.type==='verify'){
   const status=await settings();if(!status)throw Error('Download the offline interface first.');const meta=await (await caches.open(META)).match('/song-offline-integrity');if(!meta)throw Error('Update this download to enable integrity checks.');const expected=await meta.json(),cache=await caches.open(status.name),missing=[],corrupt=[];let bytes=0;for(const [path,value] of Object.entries(expected)){const response=await cache.match(path,{ignoreVary:true});if(!response){missing.push(path);continue;}const data=await response.clone().arrayBuffer();bytes+=data.byteLength;if(await hash(response)!==value.sha256)corrupt.push(path);}port.postMessage({verification:{checked:Object.keys(expected).length,missing,corrupt,bytes,verifiedAt:new Date().toISOString()}});return;
  }
  if(event.data?.type!=='download')return;
  const manifestResponse=await fetch('/song-offline-assets.json',{cache:'no-store'});if(!manifestResponse.ok)throw Error('The offline asset list is unavailable. Use a production build.');
  const manifest=await manifestResponse.json();if(!/^[a-f0-9]{16}$/.test(manifest.version)||!Array.isArray(manifest.assets))throw Error('Invalid offline asset list.');
  const urls=manifest.assets.filter(path=>typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&allowed(path));if(urls.length!==manifest.assets.length||urls.length>2000||!Array.isArray(manifest.routes)||manifest.routes.some(path=>!OFFLINE_ROUTES.includes(path)))throw Error('Unsupported offline asset list.');
  const previous=await settings();previousCacheName=previous?.name??null;const name=PREFIX+manifest.version;downloadCacheName=name;const cache=await caches.open(name);let done=0;
  for(let index=0;index<urls.length;index+=6){await Promise.all(urls.slice(index,index+6).map(async path=>{const response=await fetch(path,{cache:'reload'});if(!response.ok)throw Error(`Could not download ${path}`);if(!manifest.integrity?.[path]?.sha256||await hash(response.clone())!==manifest.integrity[path].sha256)throw Error(`Integrity check failed for ${path}. Rebuild or retry the download.`);await cache.put(path,response);done++;}));port.postMessage({done,total:urls.length+manifest.routes.length});}
  const pages={};let pageBytesTotal=0;for(const route of manifest.routes){const page=await fetch(route,{headers:{Accept:'text/html'},cache:'no-store'});if(!page.ok||!page.headers.get('content-type')?.includes('text/html'))throw Error(`Could not download ${route}.`);const pageBytes=await page.clone().arrayBuffer(),pageHash=await hash(page.clone());pageBytesTotal+=pageBytes.byteLength;pages[route]={bytes:pageBytes.byteLength,sha256:pageHash};await cache.put(route,page);done++;port.postMessage({done,total:urls.length+manifest.routes.length});}
  const status={name,version:manifest.version,savedAt:new Date().toISOString(),count:urls.length+manifest.routes.length,bytes:(manifest.totalBytes??0)+pageBytesTotal,routes:manifest.routes};await (await caches.open(META)).put('/song-offline-integrity',new Response(JSON.stringify({...manifest.integrity,...pages})));await (await caches.open(META)).put('/song-offline-status',new Response(JSON.stringify(status)));
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==META&&key!==name&&key!==previous?.name)await caches.delete(key);
  port.postMessage({status,done:urls.length+manifest.routes.length,total:urls.length+manifest.routes.length});
 }catch(error){if(downloadCacheName&&downloadCacheName!==previousCacheName){try{await caches.delete(downloadCacheName);}catch{}}port.postMessage({error:error.message||'Offline download failed.'});}})());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const navigation=request.mode==='navigate'&&OFFLINE_ROUTES.includes(url.pathname);if(!navigation&&!allowed(url.pathname))return;
 event.respondWith((async()=>{try{return await fetch(request);}catch{
  const status=await settings();if(!status)throw Error('Offline library has not been downloaded.');
  const cache=await caches.open(status.name);const response=await cache.match(url.pathname,{ignoreVary:true});if(response)return response;
  if(!navigation)for(const key of await caches.keys()){if(key.startsWith(PREFIX)&&key!==META&&key!==status.name){const previous=await (await caches.open(key)).match(url.pathname,{ignoreVary:true});if(previous)return previous;}}
  throw Error('This resource is not available offline.');
 }})());
});
