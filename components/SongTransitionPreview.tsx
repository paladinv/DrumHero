"use client";
import { useState } from 'react';
import { buildSongTimeline } from '@/lib/song-practice';
import type { DrumSong, SongSection } from '@/lib/song-library';
import type { SetlistEntry } from '@/lib/song-library-next';
import { SongSessionPlayer } from './SongSessionPlayer';
export function transitionSong(from:DrumSong,to:DrumSong,a:SetlistEntry,b:SetlistEntry):DrumSong{
 const ending=buildSongTimeline(from,{sectionId:a.sectionId,partId:a.partId,targetBpm:a.bpm,repetitions:a.repetitions}).bars.slice(-2),opening=buildSongTimeline(to,{sectionId:b.sectionId,partId:b.partId,targetBpm:b.bpm,repetitions:b.repetitions}).bars.slice(0,2);
 if(!ending.length||!opening.length)return {...from,sections:[]};
 const pauseBeats=b.breakSeconds*(b.bpm??to.bpm)/60;const rests=[];for(let beats=pauseBeats;beats>0;beats-=32)rests.push(Math.min(32,beats));
 const sections:SongSection[]=[...ending.map(bar=>({bar,label:'Ending'})),...rests.map(beats=>({bar:{...opening[0],beats,bpm:b.bpm??to.bpm,hits:[],sectionName:'Break'},label:'Break'})),...(b.countInBeats?[{bar:{...opening[0],beats:b.countInBeats,bpm:opening[0]?.bpm??to.bpm,hits:Array.from({length:b.countInBeats},(_,beat)=>({beat,instrument:'hihat' as const,accent:beat===0,velocity:0.5})),sectionName:'Count in'},label:'Count in'}]:[]),...opening.map(bar=>({bar,label:'Opening'}))].map(({bar,label},index)=>({id:`transition-${index}`,name:`${label}: ${bar.sectionName??to.title}`,kind:'other' as const,notes:'',meter:bar.meter,bpm:bar.bpm,parts:[{id:`transition-part-${index}`,name:label,bpm:bar.bpm,beats:bar.beats,subdivision:12 as const,hits:bar.hits.map(hit=>({instrument:hit.instrument,step:Math.round(hit.beat*3),accent:hit.accent,velocity:hit.velocity}))}]}));
 // Use each source bar's own subdivision to preserve straight and triplet timing.
 sections.forEach((section,index)=>{const source=index<ending.length?ending[index]:index>=sections.length-opening.length?opening[index-(sections.length-opening.length)]:undefined;if(source){const part=(index<ending.length?from:to).sections.flatMap(s=>s.parts).find(p=>p.id===source.partId);const subdivision=part?.subdivision??16;section.parts[0].subdivision=subdivision;section.parts[0].hits=source.hits.map(hit=>({instrument:hit.instrument,step:Math.round(hit.beat*subdivision/4),accent:hit.accent,velocity:hit.velocity}));}});
 return {...from,id:`transition:${a.id}:${b.id}`,title:`${from.title} → ${to.title}`,bpm:from.bpm,sections};
}
export function SongTransitionPreview({from,to,entry,next}:{from:DrumSong;to:DrumSong;entry:SetlistEntry;next:SetlistEntry}){const [open,setOpen]=useState(false);return <div><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close':'Preview'} transition to {to.title}</button>{open&&<><p>Last two bars, {next.breakSeconds}-second break, {next.countInBeats}-beat count-in, then first two bars. {next.note}</p><SongSessionPlayer song={transitionSong(from,to,entry,next)} preview countInBeats={0}/></>}</div>;}
