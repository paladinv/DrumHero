import type { Collection, DrumSong, Setlist, SongLibraryState } from './song-library';
import type { Level, SongInstrument } from './types';
export type PlayerSettings={mode:'keyboard'|'audio'|'self'|'preview';guide:boolean;click:boolean;notation:boolean;countInBeats?:number;countInSubdivision?:1|2|3|4;countInVoice?:'click'|'spoken'};
export type PracticePreset={id:string;songId:string;name:string;sectionId:string;partId?:string;roleId?:string;guideOtherParts?:boolean;practiceLayer?:'all'|'hands'|'feet';leadHand?:'R'|'L';footVoices?:SongInstrument[];bpm:number;repetitions:number;loop:boolean;startBar:number;endBar:number;ramp:boolean;rampStep:number;rampTarget:number;player:PlayerSettings};
export type LibraryFilters={query:string;difficulty:string;collection:string;tags:string[];meter:string;favorites:boolean;archived:boolean;due:boolean;sort:string;bpmMin:number;bpmMax:number;voice:SongInstrument|'All';subdivision:string;feel:string;fills:boolean;samePart:boolean};
export type SavedSongSearch={id:string;name:string;filters:LibraryFilters};
export type SmartPracticeState='any'|'unpracticed'|'recent-needs-work'|'due-review';
export type SmartCollectionRules={difficulty:Level|'All';bpmMin:number;bpmMax:number;meter:string;tags:string[];voice:SongInstrument|'All';subdivision:string;feel:string;fills:boolean;samePart:boolean;practiceState?:SmartPracticeState};
export type SetlistEntry={id:string;songId:string;sectionId?:string;partId?:string;bpm?:number;repetitions:number;breakSeconds:number;countInBeats:number;note:string};
const num=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const str=(value:unknown,max=100)=>typeof value==='string'?value.slice(0,max):'';
const list=(value:unknown,max=100):Record<string,unknown>[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).slice(0,max):[];
export function normalizePlayerSettings(value:unknown):PlayerSettings{const item=(value&&typeof value==='object'?value:{}) as Partial<PlayerSettings>;const subdivision=[1,2,3,4].includes(item.countInSubdivision??1)?item.countInSubdivision as 1|2|3|4:1;return {mode:['keyboard','audio','self','preview'].includes(item.mode??'')?item.mode!:'keyboard',guide:item.guide===true,click:item.click!==false,notation:item.notation!==false,countInBeats:Math.max(0,Math.min(16,Math.round(num(item.countInBeats,4,0,16)))),countInSubdivision:subdivision,countInVoice:item.countInVoice==='spoken'?'spoken':'click'};}
const PRACTICE_VOICES:SongInstrument[]=['kick','snare','hihat','openhat','ride','rimshot','tom','crash','cowbell','shaker','tambourine','custom1','custom2','custom3','custom4','custom5','custom6','custom7','custom8'];
export function normalizePresets(value:unknown):PracticePreset[]{
 return list(value).filter(item=>str(item.id)&&str(item.songId)&&str(item.name,80)).map(item=>{
  const footVoices=Array.isArray(item.footVoices)?[...new Set(item.footVoices.filter((voice):voice is SongInstrument=>PRACTICE_VOICES.includes(voice as SongInstrument)))].slice(0,15):['kick'] as SongInstrument[];
  const practiceLayer=['all','hands','feet'].includes(String(item.practiceLayer))?item.practiceLayer as PracticePreset['practiceLayer']:'all';
  return {id:str(item.id),songId:str(item.songId),name:str(item.name,80),sectionId:str(item.sectionId),partId:str(item.partId)||undefined,roleId:str(item.roleId)||undefined,guideOtherParts:item.guideOtherParts===true,practiceLayer,leadHand:item.leadHand==='L'?'L':'R',footVoices,bpm:num(item.bpm,80,40,200),repetitions:Math.round(num(item.repetitions,1,1,20)),loop:item.loop===true,startBar:Math.round(num(item.startBar,1,1,20000)),endBar:Math.round(num(item.endBar,1,1,20000)),ramp:item.ramp===true,rampStep:num(item.rampStep,5,1,20),rampTarget:num(item.rampTarget,100,40,200),player:normalizePlayerSettings(item.player)};
 });
}
export function normalizeSavedSearches(value: unknown): SavedSongSearch[] {
  return list(value).filter(item => str(item.id) && str(item.name, 80)).map(item => {
    const f = (item.filters && typeof item.filters === "object" ? item.filters : {}) as Record<string, unknown>;
    const bpm = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(40, Math.min(200, Math.round(value))) : fallback;
    const bpmMin = bpm(f.bpmMin, 40), bpmMax = Math.max(bpmMin, bpm(f.bpmMax, 200));
    const voices: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine", "custom1", "custom2", "custom3", "custom4", "custom5", "custom6", "custom7", "custom8"];
    return { id: str(item.id), name: str(item.name, 80), filters: {
      query: str(f.query, 200), difficulty: str(f.difficulty) || "All", collection: str(f.collection) || "All",
      tags: Array.isArray(f.tags) ? f.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12).map(tag => tag.slice(0, 40)) : [],
      meter: str(f.meter, 40) || "All", favorites: f.favorites === true, archived: f.archived === true, due: f.due === true, sort: str(f.sort, 20) || "title",
      bpmMin, bpmMax, voice: voices.includes(f.voice as SongInstrument) ? f.voice as SongInstrument : "All",
      subdivision: ["4", "8", "12", "16"].includes(String(f.subdivision)) ? String(f.subdivision) : "All",
      feel: ["straight", "swing", "shuffle"].includes(String(f.feel)) ? String(f.feel) : "All", fills: f.fills === true, samePart: f.samePart === true
    } };
  });
}
export function normalizeSmartCollectionRules(value: unknown):SmartCollectionRules|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const item=value as Record<string,unknown>,voices:SongInstrument[]=['kick','snare','hihat','openhat','ride','rimshot','tom','crash','cowbell','shaker','tambourine','custom1','custom2','custom3','custom4','custom5','custom6','custom7','custom8'];
 const difficulty=['Beginner','Intermediate','Advanced'].includes(String(item.difficulty))?item.difficulty as Level:'All';
 const bpmMin=Math.round(num(item.bpmMin,40,40,200)),bpmMax=Math.max(bpmMin,Math.round(num(item.bpmMax,200,40,200)));
 return {difficulty,bpmMin,bpmMax,meter:str(item.meter,40)||'All',tags:Array.isArray(item.tags)?[...new Set(item.tags.filter((tag):tag is string=>typeof tag==='string').slice(0,12).map(tag=>tag.slice(0,40)))]:[],voice:voices.includes(item.voice as SongInstrument)?item.voice as SongInstrument:'All',subdivision:['4','8','12','16'].includes(String(item.subdivision))?String(item.subdivision):'All',feel:['straight','swing','shuffle'].includes(String(item.feel))?String(item.feel):'All',fills:item.fills===true,samePart:item.samePart===true,practiceState:['unpracticed','recent-needs-work','due-review'].includes(String(item.practiceState))?item.practiceState as SmartPracticeState:'any'};
}
export function smartRulesFromFilters(filters:LibraryFilters,practiceState:SmartPracticeState='any'):SmartCollectionRules{return {difficulty:filters.difficulty as Level|'All',bpmMin:filters.bpmMin,bpmMax:filters.bpmMax,meter:filters.meter,tags:[...filters.tags],voice:filters.voice,subdivision:filters.subdivision,feel:filters.feel,fills:filters.fills,samePart:filters.samePart,practiceState};}
function matchesPracticeState(song:DrumSong,rule:SmartPracticeState,state?:SongLibraryState):boolean {
 if(rule==='any')return true;
 if(!state)return false;
 const progress=state.progress.filter(item=>item.songId===song.id);
 if(rule==='unpracticed')return !progress.some(item=>item.sessions>0||(item.attempts?.length??0)>0);
 if(rule==='due-review'){
  const dueAt=[...state.reviews.filter(item=>item.songId===song.id).map(item=>item.dueAt),...state.schedules.filter(item=>item.songId===song.id).map(item=>item.dueAt),...progress.map(item=>item.dueAt??'')].filter(Boolean);
  return dueAt.some(value=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now());
 }
 const recentAfter=Date.now()-90*24*60*60*1000;
 return progress.some(item=>(item.attempts??[]).some(attempt=>attempt.completePart!==false&&!['self','unknown'].includes(attempt.inputMode)&&attempt.score<80&&Number.isFinite(Date.parse(attempt.playedAt))&&Date.parse(attempt.playedAt)>=recentAfter));
}
export function matchesSmartCollection(song:DrumSong,rules:SmartCollectionRules,state?:SongLibraryState):boolean {
 const parts=song.sections.flatMap(section=>section.parts.map(part=>({section,part})));
 if(rules.difficulty!=='All'&&song.difficulty!==rules.difficulty)return false;
 if(rules.meter!=='All'&&song.meter!==rules.meter)return false;
 if(!rules.tags.every(tag=>song.tags.includes(tag)))return false;
 const matches=(item:typeof parts[number])=>item.part.bpm>=rules.bpmMin&&item.part.bpm<=rules.bpmMax&&(rules.voice==='All'||item.part.hits.some(hit=>hit.instrument===rules.voice))&&(rules.subdivision==='All'||String(item.part.subdivision)===rules.subdivision)&&(rules.feel==='All'||(item.section.feel?.kind??'straight')===rules.feel)&&(!rules.fills||item.section.kind==='fill'||/fill/i.test(item.part.name)||item.part.hits.some(hit=>['flam','drag','buzz','roll'].includes(hit.articulation??'')));
 if(rules.samePart)return parts.some(matches)&&matchesPracticeState(song,rules.practiceState??'any',state);
 const partBpm=[song.bpm,...parts.map(item=>item.part.bpm)].some(bpm=>bpm>=rules.bpmMin&&bpm<=rules.bpmMax);
 const voiceMatch=rules.voice==='All'||parts.some(item=>item.part.hits.some(hit=>hit.instrument===rules.voice));
 const subdivisionMatch=rules.subdivision==='All'||parts.some(item=>String(item.part.subdivision)===rules.subdivision);
 const feelMatch=rules.feel==='All'||song.sections.some(section=>(section.feel?.kind??'straight')===rules.feel);
 const fillMatch=!rules.fills||song.sections.some(section=>section.kind==='fill'||section.parts.some(part=>/fill/i.test(part.name)||part.hits.some(hit=>['flam','drag','buzz','roll'].includes(hit.articulation??''))));
 return partBpm&&voiceMatch&&subdivisionMatch&&feelMatch&&fillMatch&&matchesPracticeState(song,rules.practiceState??'any',state);
}
export function collectionSongIds(collection:Collection,songs:DrumSong[],state?:SongLibraryState):string[]{return collection.smartRules?songs.filter(song=>matchesSmartCollection(song,collection.smartRules!,state)).map(song=>song.id):collection.songIds;}
export function normalizeSetlistEntries(value:unknown):SetlistEntry[]|undefined{if(!Array.isArray(value))return undefined;const seen=new Set<string>();return list(value,500).filter(item=>{const valid=!!str(item.id)&&!!str(item.songId)&&!seen.has(str(item.id));seen.add(str(item.id));return valid;}).map(item=>({id:str(item.id),songId:str(item.songId),sectionId:str(item.sectionId)||undefined,partId:str(item.partId)||undefined,bpm:typeof item.bpm==='number'?num(item.bpm,80,40,200):undefined,repetitions:Math.round(num(item.repetitions,1,1,20)),breakSeconds:num(item.breakSeconds,0,0,3600),countInBeats:Math.round(num(item.countInBeats,4,0,16)),note:str(item.note,500)}));}
export function setlistEntries(plan:Pick<Setlist,'id'|'entries'|'songIds'|'targets'|'sectionIds'|'transitions'>):SetlistEntry[]{return plan.entries??plan.songIds.map((songId,index)=>({id:`${plan.id}:${index}`,songId,sectionId:plan.sectionIds?.[songId]||undefined,partId:plan.targets?.[songId]?.partId,bpm:plan.targets?.[songId]?.bpm,repetitions:plan.targets?.[songId]?.repetitions??1,breakSeconds:plan.transitions?.[songId]?.breakSeconds??0,countInBeats:plan.transitions?.[songId]?.countInBeats??4,note:plan.transitions?.[songId]?.note??''}));}
export function withSetlistEntries(plan:Setlist,entries:SetlistEntry[]):Setlist{return {...plan,entries,songIds:entries.map(entry=>entry.songId)};}
export function tapTempo(taps:number[]):number|null{const recent=taps.slice(-9),intervals=recent.slice(1).map((at,index)=>at-recent[index]).filter(ms=>ms>=250&&ms<=2000);if(intervals.length<2)return null;const sorted=[...intervals].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],kept=intervals.filter(ms=>Math.abs(ms-median)<median*.25);return kept.length>=2?Math.max(40,Math.min(200,Math.round(60000/(kept.reduce((a,b)=>a+b,0)/kept.length)))):null;}
export function reorderCollection(state:SongLibraryState,id:string,from:string,to:string):SongLibraryState{return {...state,collections:state.collections.map(collection=>{if(collection.id!==id)return collection;const items=[...collection.songIds],a=items.indexOf(from),b=items.indexOf(to);if(a<0||b<0)return collection;items.splice(a,1);items.splice(b,0,from);return {...collection,songIds:items};})};}
export function trendAttempts(state:SongLibraryState,song:DrumSong,partId:string,input:string){return state.progress.filter(progress=>progress.songId===song.id).flatMap(progress=>(progress.attempts??[]).map(attempt=>({...attempt,sectionId:progress.sectionId}))).filter(attempt=>(!partId||attempt.partId===partId)&&(input==='all'||attempt.inputMode===input)).sort((a,b)=>a.playedAt.localeCompare(b.playedAt)).slice(-50);}
