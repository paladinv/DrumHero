import { readdir,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
async function files(directory,prefix=''){const entries=await readdir(directory,{withFileTypes:true});return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(`${directory}/${entry.name}`,`${prefix}${entry.name}/`):[`${prefix}${entry.name}`]))).flat();}
const assets=[...(await files('.next/static')).filter(path=>/\.(js|css|woff2?)$/.test(path)).map(path=>`/_next/static/${path}`),...(await files('public/audio/drums')).filter(path=>path.endsWith('.wav')).map(path=>`/audio/drums/${path}`),...(await files('public/models/drums')).filter(path=>path.endsWith('.glb')).map(path=>`/models/drums/${path}`),'/drum-hero-logo.svg','/manifest.webmanifest'];
const routes=['/','/learn','/practice','/practice/session','/trainer','/improvisation','/ear-training','/sight-reading','/assessment','/rudiments','/grooves','/kit','/song-library','/song-builder','/progress','/about','/play-alongs'];
const serviceWorker=await readFile('public/song-library-sw.js','utf8');
const workerSource=ts.createSourceFile('song-library-sw.js',serviceWorker,ts.ScriptTarget.Latest,false,ts.ScriptKind.JS);
let workerRoutes;
const findOfflineRoutes=(node)=>{
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='OFFLINE_ROUTES'&&ts.isArrayLiteralExpression(node.initializer)){
  workerRoutes=node.initializer.elements.map(item=>ts.isStringLiteralLike(item)?item.text:null);
 }
 ts.forEachChild(node,findOfflineRoutes);
};
findOfflineRoutes(workerSource);
if(!workerRoutes||workerRoutes.some(route=>typeof route!=='string'))throw new Error('Could not read the literal OFFLINE_ROUTES array from public/song-library-sw.js.');
if(new Set(routes).size!==routes.length||new Set(workerRoutes).size!==workerRoutes.length||routes.length!==workerRoutes.length||routes.some(route=>!workerRoutes.includes(route)))throw new Error('Offline route lists in scripts/build-song-offline.mjs and public/song-library-sw.js must match.');
const integrity=Object.fromEntries(await Promise.all(assets.map(async path=>{const content=await readFile(path.startsWith('/_next/static/')?path.replace('/_next/','.next/'):`public${path}`);return [path,{bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')}];})));
const totalBytes=Object.values(integrity).reduce((sum,item)=>sum+item.bytes,0),version=createHash('sha256').update(JSON.stringify({integrity,routes})).digest('hex').slice(0,16);
await writeFile('public/song-offline-assets.json',JSON.stringify({version,assets,routes,integrity,totalBytes}));console.log(`Offline Drum Hero: ${assets.length} assets and ${routes.length} pages, ${(totalBytes/1048576).toFixed(1)} MB in build ${version}`);
