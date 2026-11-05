import type { DrumPart, DrumSong, SongClip, SongSection } from './song-library';
import type { ArrangementBar } from './song-builder';
import type { SongPartHit } from './types';

export type TempoAnchor = { beat: number; seconds: number };
export function normalizeTempoAnchors(input: unknown): TempoAnchor[] {
  if (!Array.isArray(input) || input.length > 256) return [];
  const anchors = input.filter((a): a is TempoAnchor => !!a && Number.isFinite(a.beat) && a.beat >= 0 && Number.isFinite(a.seconds) && a.seconds >= 0).map(a=>({beat:a.beat,seconds:a.seconds})).sort((a,b)=>a.beat-b.beat);
  return anchors.every((a,i)=>!i || (a.beat>anchors[i-1].beat && a.seconds>anchors[i-1].seconds && 60*(a.beat-anchors[i-1].beat)/(a.seconds-anchors[i-1].seconds)>=40 && 60*(a.beat-anchors[i-1].beat)/(a.seconds-anchors[i-1].seconds)<=200)) ? anchors : [];
}
export function mappedSeconds(beat: number, anchors: TempoAnchor[], bpm: number) {
  if (anchors.length<2) return beat*60/bpm;
  const index=Math.max(0,Math.min(anchors.length-2,anchors.findIndex(a=>a.beat>beat)-1));
  const left=beat>=anchors.at(-1)!.beat?anchors.at(-2)!:anchors[index],right=beat>=anchors.at(-1)!.beat?anchors.at(-1)!:anchors[index+1];
  return left.seconds+(beat-left.beat)*(right.seconds-left.seconds)/(right.beat-left.beat);
}
const key=(h:SongPartHit)=>`${h.instrument}:${h.step}`;
export function noteDiff(before: DrumPart, after: DrumPart) {
  const old=new Map(before.hits.map(h=>[key(h),h])),next=new Map(after.hits.map(h=>[key(h),h]));
  const removed=before.hits.filter(h=>!next.has(key(h))),added=after.hits.filter(h=>!old.has(key(h)));
  const changed=after.hits.filter(h=>old.has(key(h)) && JSON.stringify(old.get(key(h)))!==JSON.stringify(h));
  const moved: Array<{from:SongPartHit;to:SongPartHit}>=[];
  const unmatched=[...added];
  for(const hit of removed){const index=unmatched.findIndex(candidate=>candidate.instrument===hit.instrument);if(index>=0)moved.push({from:hit,to:unmatched.splice(index,1)[0]});}
  return {added,removed,changed,moved};
}
export function editLinkedPart(section: SongSection, partId:string, change:(part:DrumPart)=>DrumPart):SongSection {
  const parts=section.parts.map(p=>p.id===partId?change(structuredClone(p)):p);
  const edited=parts.find(p=>p.id===partId),base=parts.find(p=>p.id===edited?.linkedBaseId);
  if(edited && base){
    if(edited.beats!==base.beats || edited.subdivision!==base.subdivision || edited.meter!==base.meter){edited.linkedBaseId=undefined;edited.linkOverrides=undefined;edited.linkRemoved=undefined;}
    else {const diff=noteDiff(base,edited);edited.linkOverrides=[...diff.added,...diff.changed];edited.linkRemoved=diff.removed.map(key);}
  }
  return {...section,parts:parts.map(p=>{
    const parent=parts.find(base=>base.id===p.linkedBaseId);
    if(!parent)return p;
    const overrides=new Map((p.linkOverrides??[]).map(h=>[key(h),h])),removed=new Set(p.linkRemoved??[]);
    const hits=parent.hits.filter(h=>!removed.has(key(h))&&!overrides.has(key(h))).concat([...overrides.values()]);
    if(hits.length>256)throw new Error('This linked update would exceed the 256-note pattern limit. Detach the variation or remove some notes first.');
    return {...p,beats:parent.beats,subdivision:parent.subdivision,meter:parent.meter,hits};
  })};
}
export function pasteSections(song:DrumSong, sections:SongSection[]):DrumSong {
  if(song.sections.length+sections.length>32)throw new Error('A song supports up to 32 sections.');
  const groups=new Map(sections.flatMap(s=>s.endingGroup?[[s.endingGroup,crypto.randomUUID()] as const]:[]));
  const copies=sections.map(section=>{
    const ids=new Map(section.parts.map(p=>[p.id,crypto.randomUUID()]));
    const sourceClips: SongClip[] = section.clips ?? section.parts.map(p=>({id:crypto.randomUUID(),partId:p.id,repeats:1}));
    return {...structuredClone(section),id:crypto.randomUUID(),endingGroup:section.endingGroup?groups.get(section.endingGroup):undefined,parts:section.parts.map(p=>({...structuredClone(p),id:ids.get(p.id)!,linkedBaseId:p.linkedBaseId?ids.get(p.linkedBaseId):undefined})),clips:sourceClips.map(c=>({...c,id:crypto.randomUUID(),partId:ids.get(c.partId)!,layers:c.layers?.filter(id=>ids.has(id)).map(id=>ids.get(id)!),overrides:c.overrides?{...c.overrides,mutedLayers:c.overrides.mutedLayers?.filter(id=>ids.has(id)).map(id=>ids.get(id)!),soloLayer:c.overrides.soloLayer?ids.get(c.overrides.soloLayer):undefined}:undefined,repeatVariants:c.repeatVariants?.filter(variant=>ids.has(variant.partId)).map(variant=>({...variant,partId:ids.get(variant.partId)!}))}))};
  });
  return {...song,sections:[...song.sections,...copies]};
}
export function playabilityHints(part:DrumPart) {
  const groups=new Map<number,SongPartHit[]>();for(const hit of part.hits)groups.set(hit.step,[...(groups.get(hit.step)??[]),hit]);
  return [...groups].flatMap(([step,hits])=>{
    const hands=hits.filter(h=>h.instrument!=='kick'&&!(h.instrument==='openhat'&&h.articulation==='foot-splash'));
    const messages:string[]=[];
    if(hands.length>2)messages.push(`${hands.length} hand strikes at once; consider a foot hi-hat or staggered hits.`);
    if(hits.some(h=>h.instrument==='hihat')&&hits.some(h=>h.instrument==='openhat'))messages.push('Open and closed hi-hat coincide; closing the hat will choke it.');
    return messages.map((message,index)=>({id:`${step}:${index}:${hits.map(key).join(',')}`,step,message}));
  });
}
export function suggestSticking(part:DrumPart):DrumPart {
  const hands=part.hits.filter(h=>h.instrument!=='kick'&&h.articulation!=='foot-splash').sort((a,b)=>a.step-b.step);
  const assignments=new Map(hands.map((h,index)=>[key(h),index%2?'L' as const:'R' as const]));
  return {...part,hits:part.hits.map(h=>assignments.has(key(h))?{...h,sticking:assignments.get(key(h))}:h)};
}

export function arrangementFlowHints(bars:ArrangementBar[]) {
  const hints:Array<{id:string;message:string}> = [];
  for(let index=0;index<bars.length;){
    const bar=bars[index]!;
    if(bar.hits.length){index+=1;continue;}
    let end=index+1;while(end<bars.length&&bars[end]?.sectionId===bar.sectionId&&!bars[end]?.hits.length)end+=1;
    if(end-index>=2)hints.push({id:`silence:${bar.sectionId}:${index}`,message:`Measures ${index+1}–${end} in ${bar.sectionName} are silent. Check that the break is intentional or add a cue for the return.`});
    index=end;
  }
  for(let index=1;index<bars.length;index+=1){
    const before=bars[index-1]!,after=bars[index]!;
    if(before.sectionId===after.sectionId)continue;
    const left=bars.slice(Math.max(0,index-2),index),right=bars.slice(index,Math.min(bars.length,index+2));
    const leftDensity=left.reduce((sum,item)=>sum+item.hits.length,0)/left.length,rightDensity=right.reduce((sum,item)=>sum+item.hits.length,0)/right.length;
    const larger=Math.max(leftDensity,rightDensity);
    if(larger>=6&&Math.abs(leftDensity-rightDensity)>=Math.max(5,larger*0.7))hints.push({id:`density:${before.sectionId}:${after.sectionId}`,message:`Drum density changes sharply between ${before.sectionName} (${Math.round(leftDensity)} hits per measure) and ${after.sectionName} (${Math.round(rightDensity)}). Audition the transition or add a fill if it feels abrupt.`});
    if(Math.abs(before.bpm-after.bpm)>=20)hints.push({id:`tempo:${before.sectionId}:${after.sectionId}`,message:`Tempo changes from ${before.bpm} to ${after.bpm} BPM at ${after.sectionName}. Check that the change is clear to the player.`});
  }
  return hints.slice(0,12);
}

export type ArrangementClipboard={version:1;sections:SongSection[]};
export const ARRANGEMENT_CLIPBOARD_KEY='drum-hero:arrangement-clipboard:v1';
