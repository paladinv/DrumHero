export type OfflineVerification={checked:number;missing:string[];corrupt:string[];bytes:number;verifiedAt:string};
export async function verifyOfflineCache():Promise<OfflineVerification>{
 if(typeof caches==='undefined'||!crypto.subtle)throw Error('Offline integrity checks are unavailable in this browser.');
 const meta=await caches.open('drum-hero-song-offline-meta'),[statusResponse,integrityResponse]=await Promise.all([meta.match('/song-offline-status'),meta.match('/song-offline-integrity')]);if(!statusResponse)throw Error('Download the offline interface first.');if(!integrityResponse)throw Error('Update the offline download to enable integrity checks.');
 const status=await statusResponse.json(),expected=await integrityResponse.json(),cache=await caches.open(status.name),missing:string[]=[],corrupt:string[]=[];let bytes=0;
 for(const [path,raw] of Object.entries(expected)){const reference=raw as {sha256:string},response=await cache.match(path,{ignoreVary:true});if(!response){missing.push(path);continue;}const data=await response.arrayBuffer();bytes+=data.byteLength;const digest=await crypto.subtle.digest('SHA-256',data),hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');if(hash!==reference.sha256)corrupt.push(path);}
 return {checked:Object.keys(expected).length,missing,corrupt,bytes,verifiedAt:new Date().toISOString()};
}
