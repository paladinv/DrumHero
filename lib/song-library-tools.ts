import { allSongs, songPartEvidenceFingerprint, type DrumPart, type DrumSong, type Setlist, type SongLibraryState, type SongSection } from './song-library';
import { setlistEntries, withSetlistEntries } from './song-library-next';
import { meterBeats, sectionClips } from './song-builder';
import { buildSongTimeline } from './song-practice';
import type { SongInstrument, SongPartHit } from './types';
export const PAD_VOICES: SongInstrument[] = ['kick','snare','hihat','tom','crash'];
export const DEFAULT_SUBSTITUTIONS: Partial<Record<SongInstrument, SongInstrument>> = { openhat:'hihat', ride:'hihat', rimshot:'snare', cowbell:'crash', shaker:'hihat', tambourine:'hihat' };
export type ArrangementDiffLine = { location: string; change: "added" | "removed" | "edited"; detail: string };
export function compareSongDrumArrangements(before: DrumSong, after: DrumSong, limit = 40): ArrangementDiffLine[] {
 const lines:ArrangementDiffLine[]=[];
 const oldSections=new Map(before.sections.map(section=>[section.id,section])),newSections=new Map(after.sections.map(section=>[section.id,section]));
 const sectionIds=[...new Set([...oldSections.keys(),...newSections.keys()])];
 if(before.sections.map(section=>section.id).join("|")!==after.sections.map(section=>section.id).join("|"))lines.push({location:"Arrangement",change:"edited",detail:"Section order changed"});
 for(const id of sectionIds){
  const oldSection=oldSections.get(id),newSection=newSections.get(id),sectionName=newSection?.name??oldSection?.name??"Unnamed section";
  if(!oldSection||!newSection){lines.push({location:sectionName,change:newSection?"added":"removed",detail:`Section ${newSection?"added":"removed"}`});continue;}
  if(oldSection.name!==newSection.name||oldSection.kind!==newSection.kind||oldSection.bpm!==newSection.bpm||oldSection.meter!==newSection.meter||JSON.stringify(oldSection.feel)!==JSON.stringify(newSection.feel))lines.push({location:sectionName,change:"edited",detail:"Section name, tempo, meter, or feel changed"});
  if(JSON.stringify([oldSection.clips,oldSection.repeats,oldSection.tempoRamp,oldSection.automation,oldSection.marker,oldSection.pickupBeats,oldSection.rehearsalCues,oldSection.endingGroup,oldSection.endingPass,oldSection.endingRepeats])!==JSON.stringify([newSection.clips,newSection.repeats,newSection.tempoRamp,newSection.automation,newSection.marker,newSection.pickupBeats,newSection.rehearsalCues,newSection.endingGroup,newSection.endingPass,newSection.endingRepeats]))lines.push({location:sectionName,change:"edited",detail:"Section playback, repeat, tempo-ramp, or cue settings changed"});
  const oldParts=new Map(oldSection.parts.map(part=>[part.id,part])),newParts=new Map(newSection.parts.map(part=>[part.id,part]));
  const partIds=[...new Set([...oldParts.keys(),...newParts.keys()])];
  if(oldSection.parts.map(part=>part.id).join("|")!==newSection.parts.map(part=>part.id).join("|"))lines.push({location:sectionName,change:"edited",detail:"Part order changed"});
  for(const partId of partIds){
   const oldPart=oldParts.get(partId),newPart=newParts.get(partId),partName=newPart?.name??oldPart?.name??"Unnamed part",location=`${sectionName} / ${partName}`;
   if(!oldPart||!newPart){lines.push({location,change:newPart?"added":"removed",detail:`Part ${newPart?"added":"removed"}`});continue;}
   if(oldPart.name!==newPart.name||oldPart.bpm!==newPart.bpm||oldPart.beats!==newPart.beats||oldPart.subdivision!==newPart.subdivision||oldPart.meter!==newPart.meter)lines.push({location,change:"edited",detail:"Part name, tempo, meter, or grid length changed"});
   if(oldPart.sticking!==newPart.sticking||oldPart.dynamics!==newPart.dynamics)lines.push({location,change:"edited",detail:"Part sticking or dynamics notes changed"});
   const oldHits=new Map(oldPart.hits.map(hit=>[`${hit.step}:${hit.instrument}`,hit])),newHits=new Map(newPart.hits.map(hit=>[`${hit.step}:${hit.instrument}`,hit]));
   const barBeats=meterBeats(newPart.meter??newSection.meter??after.meter,newPart.beats),partForBar=newPart,stepBar=(hit:SongPartHit)=>Math.floor((hit.step*4/partForBar.subdivision)/barBeats)+1;
   for(const key of new Set([...oldHits.keys(),...newHits.keys()])){
    const oldHit=oldHits.get(key),newHit=newHits.get(key),hit=newHit??oldHit!;
    const position=`bar ${stepBar(hit)}, step ${hit.step+1}`;
    if(!oldHit)lines.push({location,change:"added",detail:`Added ${newHit!.instrument} at ${position}${newHit!.accent?" · accent":""}${newHit!.sticking?` · ${newHit!.sticking}`:""}`});
    else if(!newHit)lines.push({location,change:"removed",detail:`Removed ${oldHit.instrument} at ${position}`});
    else if(JSON.stringify([oldHit.accent,oldHit.velocity,oldHit.ghost,oldHit.sticking,oldHit.articulation,oldHit.timingOffsetMs])!==JSON.stringify([newHit.accent,newHit.velocity,newHit.ghost,newHit.sticking,newHit.articulation,newHit.timingOffsetMs]))lines.push({location,change:"edited",detail:`Changed ${newHit.instrument} at ${position} · ${[oldHit.accent?"accent":"normal",oldHit.ghost?"ghost":"full",oldHit.sticking??"no sticking"].join(" / ")} → ${[newHit.accent?"accent":"normal",newHit.ghost?"ghost":"full",newHit.sticking??"no sticking"].join(" / ")}`});
   }
  }
 }
 return lines.slice(0,Math.max(1,Math.min(100,limit)));
}
export function missingKitVoices(part: DrumPart, available = PAD_VOICES) { return [...new Set(part.hits.map(hit=>hit.instrument))].filter(voice=>!available.includes(voice)); }
export function substitutePart(part: DrumPart, substitutions: Partial<Record<SongInstrument,SongInstrument>>, available = PAD_VOICES): DrumPart {
  const hits = new Map<string, DrumPart['hits'][number]>();
  for(const hit of part.hits) { const instrument = available.includes(hit.instrument) ? hit.instrument : substitutions[hit.instrument]; if(!instrument || !available.includes(instrument)) throw new Error(`Choose a supported substitute for ${hit.instrument}.`); const key=`${hit.step}:${instrument}`, previous=hits.get(key); hits.set(key,{...hit,instrument,accent:!!hit.accent||!!previous?.accent,velocity:Math.max(hit.velocity??80,previous?.velocity??0)}); }
  return {...structuredClone(part),id:crypto.randomUUID(),name:`${part.name} · practice kit`,hits:[...hits.values()]};
}
export function compareSections(current: SongSection[], previous: SongSection[]) {
  const ids=[...new Set([...current,...previous].map(section=>section.id))];
  return ids.map(id=>{const before=previous.find(section=>section.id===id),after=current.find(section=>section.id===id);const beforeBars=before?buildSongTimeline({id:'diff',title:'',artist:'',difficulty:'Beginner',bpm:80,meter:'4/4',tags:[],notes:'',createdAt:'',updatedAt:'',sections:[before]}).bars:[];const afterBars=after?buildSongTimeline({id:'diff',title:'',artist:'',difficulty:'Beginner',bpm:80,meter:'4/4',tags:[],notes:'',createdAt:'',updatedAt:'',sections:[after]}).bars:[];
    const changedBars=Array.from({length:Math.max(beforeBars.length,afterBars.length)},(_,index)=>index).filter(index=>JSON.stringify(beforeBars[index] && {hits:beforeBars[index].hits,bpm:beforeBars[index].bpm,meter:beforeBars[index].meter})!==JSON.stringify(afterBars[index] && {hits:afterBars[index].hits,bpm:afterBars[index].bpm,meter:afterBars[index].meter})).map(index=>index+1);
    return {id,name:after?.name??before!.name,status:!before?'added':!after?'removed':JSON.stringify(before)!==JSON.stringify(after)||current.findIndex(section=>section.id===id)!==previous.findIndex(section=>section.id===id)?'changed':'same',changedBars,before,after};});
}
export function restoreSection(song: DrumSong, sections: SongSection[], sectionId: string): DrumSong {
  const restored=sections.find(section=>section.id===sectionId); if(!restored) return song;
  const exists=song.sections.some(section=>section.id===sectionId);
  return {...song,sections:exists?song.sections.map(section=>section.id===sectionId?structuredClone(restored):section):[...song.sections,structuredClone(restored)],updatedAt:new Date().toISOString()};
}
export type BulkAction = {kind:'archive'; archived:boolean}|{kind:'favorite'; favorite:boolean}|{kind:'tag';tag:string}|{kind:'collection';id:string}|{kind:'remove-collection';id:string}|{kind:'setlist';id:string}|{kind:'schedule';dueAt:string};
export function bulkLibraryAction(state: SongLibraryState, songIds: string[], action: BulkAction): SongLibraryState {
  const selected=allSongs(state).filter(song=>songIds.includes(song.id));
  if(action.kind==='favorite') {const selectedIds=new Set(selected.map(song=>song.id));return {...state,favorites:action.favorite?[...new Set([...state.favorites,...selectedIds])]:state.favorites.filter(id=>!selectedIds.has(id))};}
  if(action.kind==='archive'||action.kind==='tag') {const changed=selected.map(song=>({...song,bundled:false,updatedAt:new Date().toISOString(),...(action.kind==='archive'?{archived:action.archived}:{tags:[...new Set([...song.tags,action.tag.trim().slice(0,40)])].filter(Boolean).slice(0,20)})})); return {...state,songs:[...state.songs.filter(song=>!songIds.includes(song.id)),...changed]};}
  if(action.kind==='collection'||action.kind==='remove-collection') {const target=state.collections.find(collection=>collection.id===action.id);if(target?.smartRules)throw new Error('Smart collections follow their saved rules. Update the rules from the current browse filters instead of changing membership by hand.');return {...state,collections:state.collections.map(collection=>collection.id!==action.id?collection:action.kind==='collection'?{...collection,songIds:[...new Set([...collection.songIds,...selected.map(song=>song.id)])]}:{...collection,songIds:collection.songIds.filter(id=>!songIds.includes(id))})};}
  if(action.kind==='setlist') return {...state,setlists:state.setlists.map(plan=>{if(plan.id!==action.id)return plan;const entries=setlistEntries(plan),present=new Set(entries.map(entry=>entry.songId)),additions=selected.filter(song=>!present.has(song.id)).map(song=>({id:crypto.randomUUID(),songId:song.id,repetitions:1,breakSeconds:0,countInBeats:4,note:''}));return withSetlistEntries(plan,[...entries,...additions]);})};
  if(Number.isNaN(Date.parse(action.dueAt))) throw new Error('Choose a valid schedule date.');
  return {...state,schedules:[...state.schedules,...selected.map(song=>({id:crypto.randomUUID(),songId:song.id,dueAt:action.dueAt,note:'Bulk practice schedule'}))]};
}
export function setlistTiming(plan: Pick<Setlist,'songIds'|'sectionIds'|'targets'|'transitions'|'entries'> & {id?:string}, songs: DrumSong[]) {
  let elapsed=0;
  const items=setlistEntries({...plan,id:plan.id??'timing'}).map(entry=>{const songId=entry.songId;const song=songs.find(song=>song.id===songId),target=entry,transition=entry;const countInMs=(transition?.countInBeats??4)*60000/(target?.bpm??song?.bpm??80),durationMs=song?buildSongTimeline(song,{sectionId:entry.sectionId,partId:target?.partId,targetBpm:target?.bpm,repetitions:target?.repetitions,allowUnclippedPart:false}).durationMs:0;const startsAtMs=elapsed;elapsed+=durationMs+countInMs+(transition?.breakSeconds??0)*1000;return {entryId:entry.id,songId,startsAtMs,durationMs,countInMs,breakSeconds:transition?.breakSeconds??0,missing:!song};});
  return {items,totalMs:elapsed};
}
export function practiceAdvice(state: SongLibraryState, song: DrumSong) {
  return song.sections.flatMap(section=>section.parts.flatMap(part=>{const attempts=(state.progress.find(progress=>progress.songId===song.id&&progress.sectionId===section.id)?.attempts??[]).filter(attempt=>attempt.partId===part.id&&attempt.completePart!==false&&attempt.patternFingerprint===songPartEvidenceFingerprint(part)&&!['self','unknown'].includes(attempt.inputMode)).slice(-5);if(!attempts.length)return [];
    const average=Math.round(attempts.reduce((sum,attempt)=>sum+attempt.score,0)/attempts.length),diagnostics=attempts.flatMap(attempt=>attempt.timing?[attempt.timing]:[]),offset=diagnostics.length?Math.round(diagnostics.reduce((sum,timing)=>sum+timing.meanOffsetMs,0)/diagnostics.length):0;
    const voices=new Map<string,number>();diagnostics.forEach(timing=>timing.voices.forEach(voice=>voices.set(voice.instrument,(voices.get(voice.instrument)??0)+voice.missed)));
    const weakest=[...voices].sort((a,b)=>b[1]-a[1])[0];
    return [{sectionId:section.id,partId:part.id,title:`${section.name} · ${part.name}`,averageScore:average,bpm:Math.max(40,Math.round((section.bpm??song.bpm)*(average<80?.8:1))),reason:average<80?`${average}% across ${attempts.length} recent attempts. Slow down and isolate this part.`:`${average}% across ${attempts.length} recent attempts. Practice a clean section entry.`,exercise:weakest&&weakest[1]>0?`Focus on ${weakest[0]}: ${weakest[1]} missed targets in recent rounds.`:Math.abs(offset)>20?`Hits tend ${offset>0?'late':'early'} (${Math.abs(offset)} ms). Play quarter notes with the click, then restore the groove.`:'Alternate one bar with the guide and one bar without it.'}];})).sort((a,b)=>a.averageScore-b.averageScore||a.bpm-b.bpm).slice(0,4);
}
export function alignedOnsets(onsets:number[],offsetMs:number) { return onsets.map(time=>time+Math.max(-5000,Math.min(5000,offsetMs))/1000); }
export function formatDuration(ms:number) { const seconds=Math.round(ms/1000); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; }

export function appendPracticeVariation(song:DrumSong,sectionId:string,part:DrumPart):DrumSong {
 return {...song,sections:song.sections.map(section=>section.id===sectionId?{...section,clips:sectionClips(section),parts:[...section.parts,part]}:section)};
}
export type GrooveVariationStyle='half-time-backbeat'|'double-time-cymbals'|'ending-fill';
export function generateGrooveVariation(part:DrumPart,style:GrooveVariationStyle,id=crypto.randomUUID()):DrumPart {
 const subdivision:DrumPart['subdivision']=style==='double-time-cymbals'&&part.subdivision===4?8:style==='ending-fill'&&part.subdivision===4?16:part.subdivision;
 const scale=subdivision/part.subdivision,beats=part.beats,stepCount=Math.max(1,Math.round(beats*subdivision/4));
 const hits=new Map<string,DrumPart['hits'][number]>();
 const add=(hit:DrumPart['hits'][number])=>{const key=`${hit.step}:${hit.instrument}`,old=hits.get(key);hits.set(key,old?{...old,...hit,accent:!!old.accent||!!hit.accent,velocity:Math.max(old.velocity??0,hit.velocity??0)}:hit);};
 const copied=part.hits.map(hit=>({...hit,step:Math.round(hit.step*scale)}));
 if(style==='half-time-backbeat'){
  const beatCount=beats,centerBeat=Math.max(0,Math.floor(beatCount/2)),targetStep=Math.max(0,Math.min(stepCount-1,Math.round(centerBeat*subdivision/4)));
  for(const hit of copied)add(hit.instrument==='snare'?{...hit,step:targetStep}:hit);
  return {...structuredClone(part),id,name:`${part.name} · half-time`,subdivision,hits:[...hits.values()]};
 }
 copied.forEach(add);
 if(style==='double-time-cymbals'){
  const voice=part.hits.find(hit=>['hihat','openhat','ride'].includes(hit.instrument))?.instrument??'hihat';
  for(let beat=0;beat<beats;beat++){
   const step=Math.round((beat+.5)*subdivision/4);
   if(step<stepCount&&!hits.has(`${step}:${voice}`))add({step,instrument:voice,velocity:64,accent:false});
  }
  return {...structuredClone(part),id,name:`${part.name} · double-time cymbals`,subdivision,hits:[...hits.values()]};
 }
 const stepsPerBeat=Math.max(1,Math.round(subdivision/4)),start=Math.max(0,stepCount-stepsPerBeat),voices=['snare','tom'] as const;
 for(let step=start;step<stepCount;step++){
  const voice=voices[(step-start)%voices.length]!;
  if(!hits.has(`${step}:${voice}`))add({step,instrument:voice,velocity:step===stepCount-1?105:70,accent:step===stepCount-1,articulation:'roll'});
 }
 return {...structuredClone(part),id,name:`${part.name} · ending fill`,subdivision,hits:[...hits.values()]};
}
