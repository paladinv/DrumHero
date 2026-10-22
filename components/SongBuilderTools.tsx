'use client';

import { useEffect, useRef, useState } from 'react';
import type { DrumPart, DrumSong, SongArrangementAutomationPoint, SongSection, SongSectionAutomation } from '@/lib/song-library';
import type { SongInstrument } from '@/lib/types';
import { normalizeSong } from '@/lib/song-library';
import { ARRANGEMENT_CLIPBOARD_KEY, arrangementFlowHints, normalizeTempoAnchors, noteDiff, pasteSections, playabilityHints, suggestSticking, type ArrangementClipboard } from '@/lib/song-builder-tools';
import { builderStorageInventory, deleteBuilderBackingFile, deleteBuilderTake, deleteBuilderVersion } from '@/lib/song-builder-storage';
import type { ArrangementBar } from '@/lib/song-builder';
import { sectionClips, songVoiceLabel, VOICE_LABEL } from '@/lib/song-builder';
import { drawNotationPage, paginateNotation, type NotationOptions, type NotationView } from '@/lib/song-builder-notation';
import { morphDrumParts } from '@/lib/song-builder-creative';

export function SongBuilderClipboard({song,section,onChange,onMessage}:{song:DrumSong;section?:SongSection;onChange:(song:DrumSong)=>void;onMessage:(message:string)=>void}){
  const [available,setAvailable]=useState(false);
  useEffect(()=>{const check=()=>{try{setAvailable(!!localStorage.getItem(ARRANGEMENT_CLIPBOARD_KEY));}catch{setAvailable(false);}};check();window.addEventListener('storage',check);window.addEventListener('drum-hero:arrangement-copied',check);return()=>{window.removeEventListener('storage',check);window.removeEventListener('drum-hero:arrangement-copied',check);};},[]);
  const copy=(sections:SongSection[])=>{try{const value:ArrangementClipboard={version:1,sections:structuredClone(sections)};localStorage.setItem(ARRANGEMENT_CLIPBOARD_KEY,JSON.stringify(value));setAvailable(true);onMessage(`${sections.length} section(s) copied. Choose another song and Paste arrangement.`);}catch{onMessage('The arrangement clipboard could not be saved.');}};
  const paste=()=>{try{const value=JSON.parse(localStorage.getItem(ARRANGEMENT_CLIPBOARD_KEY)??'null') as ArrangementClipboard|null;const validated=value?.version===1?normalizeSong({...song,sections:value.sections}):null;if(!validated)throw new Error('Copy an arrangement first.');onChange(pasteSections(song,validated.sections));onMessage('Pasted independent copies with their meter, notes, and expression.');}catch(error){onMessage(error instanceof Error?error.message:'Could not paste this arrangement.');}};
  return <details className="card song-builder-extra"><summary>Arrangement clipboard</summary><div className="song-builder-actions"><button type="button" onClick={()=>copy(song.sections)}>Copy full arrangement</button><button type="button" disabled={!section} onClick={()=>section&&copy([section])}>Copy selected section</button><button type="button" disabled={!available} onClick={paste}>Paste arrangement</button></div><p>Copied material remains available when you switch songs. New IDs keep pasted edits independent.</p></details>;
}

export function SongBuilderTempoMap({song,bars,onChange}:{song:DrumSong;bars:ArrangementBar[];onChange:(song:DrumSong)=>void}){
  const [measure,setMeasure]=useState(1),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
  const anchors=song.referenceTempoMap??[];
  const add=()=>{const index=Math.max(0,Math.min(bars.length,measure-1)),beat=bars.slice(0,index).reduce((n,b)=>n+b.beats,0);const proposed=[...anchors.filter(a=>a.beat!==beat),{beat,seconds}];const normalized=normalizeTempoAnchors(proposed);if(normalized.length!==proposed.length){setError('Anchors must advance in time and imply a tempo between 40 and 200 BPM.');return;}onChange({...song,referenceTempoMap:normalized});setError('');};
  return <details className="card song-builder-extra"><summary>Reference-track tempo map</summary><p>Match measure starts to seconds from the backing track’s first downbeat. Add at least two anchors. Drums follow each interval’s tempo; the final tempo continues after the last anchor.</p><div className="song-builder-tool-fields"><label>Measure boundary<input type="number" min={1} max={bars.length+1} value={measure} onChange={e=>setMeasure(Math.max(1,Math.min(bars.length+1,Number(e.target.value)||1)))}/></label><label>Seconds from first downbeat<input type="number" min={0} step={.01} value={seconds} onChange={e=>setSeconds(Math.max(0,Number(e.target.value)||0))}/></label><button type="button" disabled={!bars.length} onClick={add}>Set tempo anchor</button></div><ul>{anchors.map((anchor,index)=><li key={anchor.beat}>Beat {anchor.beat+1} → {anchor.seconds.toFixed(2)} s{index>0?` · ${(60*(anchor.beat-anchors[index-1].beat)/(anchor.seconds-anchors[index-1].seconds)).toFixed(1)} BPM`:''} <button type="button" onClick={()=>onChange({...song,referenceTempoMap:anchors.filter(a=>a!==anchor)})}>Remove anchor</button></li>)}</ul><button type="button" disabled={!anchors.length} onClick={()=>onChange({...song,referenceTempoMap:[]})}>Clear tempo map</button><p role="status">{error}</p></details>;
}

export function SongBuilderNoteChanges({before,after}:{before:DrumPart;after:DrumPart}){
  const diff=noteDiff(before,after);
  return <section className="song-builder-note-diff" aria-label="Musical edit preview"><strong>{diff.added.length} added · {diff.removed.length} removed · {diff.changed.length} expression changes · {diff.moved.length} possible moves</strong><ul>{diff.added.slice(0,24).map(h=><li className="added" key={`a:${h.instrument}:${h.step}`}>+ {VOICE_LABEL[h.instrument]} step {h.step+1}</li>)}{diff.removed.slice(0,24).map(h=><li className="removed" key={`r:${h.instrument}:${h.step}`}>− {VOICE_LABEL[h.instrument]} step {h.step+1}</li>)}{diff.changed.slice(0,24).map(h=><li key={`c:${h.instrument}:${h.step}`}>~ {VOICE_LABEL[h.instrument]} step {h.step+1}: velocity {h.velocity??86}{h.accent?' · accent':''}</li>)}</ul>{diff.moved.slice(0,12).map((m,i)=><small key={i}>{VOICE_LABEL[m.from.instrument]} {m.from.step+1} → {m.to.step+1} · </small>)}</section>;
}
export function SongBuilderPatternMorph({source,targets,onPreview,onInsert}:{source:DrumPart;targets:Array<{key:string;sectionName:string;part:DrumPart}>;onPreview:(part:DrumPart)=>void;onInsert:(part:DrumPart)=>boolean}){
  const [targetKey,setTargetKey]=useState(''),[amount,setAmount]=useState(50),[preview,setPreview]=useState<DrumPart|null>(null);
  const target=targets.find(item=>item.key===targetKey);
  useEffect(()=>{if(!targets.some(item=>item.key===targetKey))setTargetKey(targets[0]?.key??'');setPreview(null);},[source.id,targets,targetKey]);
  return <details className="song-builder-pattern-morph"><summary>Morph this pattern toward another groove</summary>{targets.length?<><label>Target groove<select value={target?.key??''} onChange={event=>{setTargetKey(event.target.value);setPreview(null);}}>{targets.map(item=><option key={item.key} value={item.key}>{item.sectionName} · {item.part.name}</option>)}</select></label><label>Morph amount · {amount}%<input type="range" min={0} max={100} step={5} value={amount} onChange={event=>{setAmount(Number(event.target.value));setPreview(null);}}/></label><p>The target is resampled onto the source pattern’s grid and duration. The source and target remain unchanged.</p><button type="button" disabled={!target} onClick={()=>target&&setPreview(morphDrumParts(source,target.part,amount))}>Generate morph preview</button>{preview&&<><SongBuilderNoteChanges before={source} after={preview}/><button type="button" onClick={()=>onPreview(preview)}>Audition morph</button><button type="button" onClick={()=>{if(onInsert(preview))setPreview(null);}}>Insert independent pattern</button><button type="button" onClick={()=>setPreview(null)}>Discard preview</button></>}</>:<p>Add a second pattern to morph this groove toward it.</p>}</details>;
}
export function SongBuilderPlayability({part,onChange}:{part:DrumPart;onChange:(part:DrumPart)=>void}){
  const dismissed=part.playabilityDismissed??[];
  const hints=playabilityHints(part).filter(h=>!dismissed.includes(h.id));
  return <details className="song-builder-extra"><summary>Drummer playability · {hints.length} hints</summary><p>Heuristics assume two hands. Dismiss intentional exceptions; these hints do not block playback or export.</p><button type="button" onClick={()=>onChange(suggestSticking(part))}>Suggest alternating sticking</button><button type="button" onClick={()=>onChange({...part,playabilityDismissed:[]})}>Show dismissed hints</button><ul>{hints.map(h=><li key={h.id}>Step {h.step+1}: {h.message} <button type="button" onClick={()=>onChange({...part,playabilityDismissed:[...dismissed,h.id]})}>Dismiss</button></li>)}</ul></details>;
}

export function SongBuilderArrangementFeedback({bars}:{bars:ArrangementBar[]}){
  const hints=arrangementFlowHints(bars);
  if(!bars.length)return null;
  return <details className="card song-builder-extra"><summary>Arrangement flow check · {hints.length} notes</summary><p>Checks for long silent passages, large density shifts between sections, and abrupt tempo changes. These are optional review prompts; intentional breaks and contrasts are valid arrangements.</p>{hints.length?<ul>{hints.map(hint=><li key={hint.id}>{hint.message}</li>)}</ul>:<p>No large flow changes detected by these simple checks.</p>}</details>;
}

export function SongBuilderAccessibleScore({bars,onSeek}:{bars:ArrangementBar[];onSeek:(bar:ArrangementBar)=>void}){
  const [page,setPage]=useState(0),pageSize=50,pageCount=Math.max(1,Math.ceil(bars.length/pageSize));
  useEffect(()=>setPage(0),[bars]);
  const totalHits=bars.reduce((sum,bar)=>sum+bar.hits.length,0);
  const visible=bars.slice(page*pageSize,(page+1)*pageSize);
  return <details className="card song-builder-accessible-score"><summary>Accessible text score · {bars.length} measures · {totalHits} notes</summary><p>Use the measure buttons to move the playhead. Notes are listed by quarter-note beat and include dynamics and articulations.</p>{pageCount>1&&<nav aria-label="Text score pages"><button type="button" disabled={page===0} onClick={()=>setPage(value=>Math.max(0,value-1))}>Previous measures</button><span>Measures {page*pageSize+1}–{Math.min(bars.length,(page+1)*pageSize)} of {bars.length}</span><button type="button" disabled={page===pageCount-1} onClick={()=>setPage(value=>Math.min(pageCount-1,value+1))}>Next measures</button></nav>}<ol>{visible.map((bar,index)=>{
    const groups=new Map<number,string[]>();
    for(const hit of [...bar.hits].sort((a,b)=>a.beat-b.beat||a.instrument.localeCompare(b.instrument))){
      const beat=Number((hit.beat+1).toFixed(3));
      const expression=hit.ghost?'ghost':hit.accent?'accent':'normal';
      const articulation=hit.articulation&&hit.articulation!=='normal'?` · ${hit.articulation.replaceAll('-',' ')}`:'';
      const sticking=hit.sticking?` · ${hit.sticking}`:'';
      const description=`${songVoiceLabel({voiceLabels:bar.voiceLabels},hit.instrument)} · ${expression}${articulation}${sticking} · velocity ${hit.velocity}`;
      groups.set(beat,[...(groups.get(beat)??[]),description]);
    }
    return <li key={`${bar.sectionId}:${bar.index}`}><h3><button type="button" onClick={()=>onSeek(bar)}>Measure {page*pageSize+index+1} · {bar.sectionName} · {bar.meter} · {bar.bpm} BPM</button></h3>{bar.rehearsalCue&&<p><strong>Rehearsal cue:</strong> {bar.rehearsalCue}</p>}{groups.size?<ul>{[...groups].map(([beat,notes])=><li key={beat}>Beat {beat}: {notes.join('; ')}</li>)}</ul>:<p>Rest for this measure.</p>}</li>;
  })}</ol></details>;
}

export function SongBuilderVoiceAutomation({automation,voices,labels,onChange}:{automation?:SongSectionAutomation;voices:SongInstrument[];labels:Record<SongInstrument,string>;onChange:(value:SongSectionAutomation)=>void}){
  const curves=automation?.voices??{};
  const active=Object.values(curves).filter(curve=>curve?.volumeFrom!==undefined||curve?.volumeTo!==undefined).length;
  const edit=(voice:SongInstrument,key:'volumeFrom'|'volumeTo',value:number)=>onChange({...automation,voices:{...curves,[voice]:{...curves[voice],[key]:value}}});
  const clear=(voice:SongInstrument)=>{const next={...curves};delete next[voice];onChange({...automation,voices:Object.keys(next).length?next:undefined});};
  return <details className="song-builder-voice-automation"><summary>Per voice volume curves · {active} active</summary><p>Shape each drum voice across this section. These curves follow repeated passes and affect playback and WAV exports.</p>{voices.map(voice=>{const curve=curves[voice],from=curve?.volumeFrom??1,to=curve?.volumeTo??from;return <details key={voice}><summary>{labels[voice]}{curve?' · curve set':''}</summary><div className="song-builder-automation-lanes"><label>Start · {Math.round(from*100)}%<input aria-label={`${labels[voice]} volume at section start`} type="range" min={0} max={1} step={0.01} value={from} onChange={event=>edit(voice,'volumeFrom',Number(event.target.value))}/></label><label>End · {Math.round(to*100)}%<input aria-label={`${labels[voice]} volume at section end`} type="range" min={0} max={1} step={0.01} value={to} onChange={event=>edit(voice,'volumeTo',Number(event.target.value))}/></label><button type="button" disabled={!curve} onClick={()=>clear(voice)}>Clear {labels[voice]} curve</button></div></details>;})}</details>;
}

export function SongBuilderArrangementAutomation({points,bars,voices,labels,onChange}:{points?:SongArrangementAutomationPoint[];bars:ArrangementBar[];voices:SongInstrument[];labels:Record<SongInstrument,string>;onChange:(value:SongArrangementAutomationPoint[])=>void}){
  const [measure,setMeasure]=useState(1),[voice,setVoice]=useState<SongInstrument|'all'>('all'),[property,setProperty]=useState<'volume'|'pan'|'velocity'>('volume');
  const keyBeat=measure<=1?0:bars.slice(0,Math.min(bars.length,measure-1)).reduce((sum,bar)=>sum+bar.beats,0);
  const laneVoice=voice==='all'?undefined:voice;
  const point=points?.find(item=>Math.abs(item.beat-keyBeat)<0.001&&item.instrument===laneVoice);
  const fallback=property==='volume'?1:property==='pan'?0:1;
  const value=point?.[property]??fallback,min=property==='pan'?-1:0,max=property==='velocity'?2:1;
  const saveValue=(next:number)=>{
    const current=[...(points??[])];
    const index=current.findIndex(item=>Math.abs(item.beat-keyBeat)<0.001&&item.instrument===laneVoice);
    const updated={...(index>=0?current[index]:{}),beat:keyBeat,instrument:laneVoice,[property]:next} as SongArrangementAutomationPoint;
    if(index>=0)current[index]=updated;else current.push(updated);
    onChange(current.sort((a,b)=>a.beat-b.beat).slice(0,512));
  };
  const remove=(item:SongArrangementAutomationPoint)=>onChange((points??[]).filter(point=>point!==item));
  const format=(item:SongArrangementAutomationPoint)=>[['volume','Volume'],['pan','Pan'],['velocity','Velocity']].flatMap(([key,label])=>{const number=item[key as 'volume'|'pan'|'velocity'];return number===undefined?[]:[`${label} ${key==='pan'?Math.round(number*100):Math.round(number*100)}${key==='pan'?'%':''}`];}).join(' · ');
  return <details className="song-builder-arrangement-automation"><summary>Arrangement automation · {points?.length??0} keyframes</summary><p>Place keyframes at measure boundaries. Curves continue through section changes and repeats, and control overall or per voice volume, pan, and velocity.</p><div className="song-builder-tool-fields"><label>Measure boundary<input type="number" min={1} max={bars.length+1} value={measure} onChange={event=>setMeasure(Math.max(1,Math.min(bars.length+1,Number(event.target.value)||1)))}/></label><label>Voice<select value={voice} onChange={event=>setVoice(event.target.value as SongInstrument|'all')}><option value="all">All voices</option>{voices.map(item=><option key={item} value={item}>{labels[item]}</option>)}</select></label><label>Automation<select value={property} onChange={event=>setProperty(event.target.value as typeof property)}><option value="volume">Volume</option><option value="pan">Pan</option><option value="velocity">Velocity scale</option></select></label></div><label>{property==='pan'?'Pan':property==='velocity'?'Velocity scale':'Volume'} · {property==='pan'?`${Math.round(value*100)}%`:property==='velocity'?`${Math.round(value*100)}%`:`${Math.round(value*100)}%`}<input type="range" min={min} max={max} step={property==='velocity'?0.05:0.01} value={value} onChange={event=>saveValue(Number(event.target.value))}/></label><div className="song-builder-actions"><button type="button" onClick={()=>saveValue(value)}>Set keyframe at measure {measure}</button>{(points??[]).length>0&&<button type="button" onClick={()=>onChange([])}>Clear arrangement automation</button>}</div>{!!points?.length&&<ul>{points.map((item,index)=><li key={`${item.beat}:${item.instrument??'all'}:${index}`}><span>Beat {item.beat} · {item.instrument?labels[item.instrument]:'All voices'} · {format(item)}</span><button type="button" aria-label={`Remove automation point at beat ${item.beat}`} onClick={()=>remove(item)}>Remove</button></li>)}</ul>}</details>;
}

export function SongBuilderCueList({bars,onSeek}:{bars:ArrangementBar[];onSeek:(bar:number)=>void}){
  const cues=bars.filter(bar=>bar.rehearsalCue);
  if(!cues.length)return null;
  return <section className="card song-builder-cue-list" aria-label="Rehearsal cue roadmap"><h2>Rehearsal cues</h2><ul>{cues.map(bar=><li key={`${bar.sectionId}:${bar.index}`}><button type="button" onClick={()=>onSeek(bar.index)}>Measure {bar.number} · {bar.sectionName}</button><span>{bar.rehearsalCue}</span></li>)}</ul></section>;
}

export function SongBuilderStorage({songId,onBackup,onCleanup}:{songId:string;onBackup:()=>void;onCleanup:()=>void}){
  const [inventory,setInventory]=useState<Awaited<ReturnType<typeof builderStorageInventory>>|null>(null),[message,setMessage]=useState(''),[revision,setRevision]=useState(0),[lastBackup,setLastBackup]=useState(''),[reminder,setReminder]=useState(true);
  useEffect(()=>{let active=true;void builderStorageInventory(songId).then(value=>{if(!active)return;setInventory(value);try{const saved=localStorage.getItem(`drum-hero:builder-backup:${songId}`);setLastBackup(saved??'');setReminder(!saved||Date.now()-Date.parse(saved)>7*86400000);}catch{/* Optional reminder. */}}).catch(()=>{if(active)setMessage('Local storage inventory is unavailable.');});return()=>{active=false;};},[songId,revision]);
  const clean=async(action:()=>Promise<void>)=>{try{await action();setRevision(n=>n+1);onCleanup();setMessage('Selected local asset removed.');}catch{setMessage('Could not remove that asset.');}};
  const size=(bytes:number)=>`${(bytes/1024/1024).toFixed(2)} MB`;
  return <details className="card song-builder-extra"><summary>Local storage and backups</summary><p>{lastBackup?`Last complete backup: ${new Date(lastBackup).toLocaleString()}`:'No complete project backup recorded for this song.'} {reminder?'A fresh backup is recommended.':''}</p><button type="button" onClick={onBackup}>Download complete backup</button><button type="button" onClick={()=>setRevision(n=>n+1)}>Refresh storage</button>{inventory&&<><p>Backing audio {size(inventory.bytes.backing)} · takes {size(inventory.bytes.takes)} · versions {size(inventory.bytes.versions)}.</p>{inventory.quota?.quota&&<p>Browser origin usage {size(inventory.quota.usage??0)} of an estimated {size(inventory.quota.quota)} quota. Other app data shares this allowance.</p>}<ul>{inventory.backings.map(track=><li key={track.id}>{track.name} · {size(track.blob.size)}{track.source?` · source: ${track.source}`:''}{track.rights?` · rights: ${track.rights}`:''} <button type="button" onClick={()=>{if(confirm(`Remove “${track.name}” from this device? Keep a complete backup first.`))void clean(()=>deleteBuilderBackingFile(track.id));}}>Remove backing audio</button></li>)}{inventory.takes.map(t=><li key={t.id}>{t.name} · {t.hits.length} hits <button type="button" onClick={()=>{if(confirm(`Delete take ${t.name}?`))void clean(()=>deleteBuilderTake(t.id));}}>Delete take</button></li>)}{inventory.versions.map(v=><li key={v.id}>{v.label} · {v.kind} <button type="button" onClick={()=>{if(confirm(`Delete recovery version ${v.label}?`))void clean(()=>deleteBuilderVersion(v.id));}}>Delete version</button></li>)}</ul></>}<p role="status">{message}</p></details>;
}

function SheetThumbnail({song,bars,view,index,options}:{song:DrumSong;bars:ArrangementBar[];view:NotationView;index:number;options:NotationOptions}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const canvas=drawNotationPage(song,bars,view,index,null,options),target=ref.current;if(!target)return;target.width=canvas.width;target.height=canvas.height;target.getContext('2d')?.drawImage(canvas,0,0);},[song,bars,view,index,options]);
  return <canvas ref={ref} aria-label={`Export page ${index+1}`} role="img"/>;
}
export function SongBuilderExportPreparation({song,bars,view,options,onChange}:{song:DrumSong;bars:ArrangementBar[];view:NotationView;options:NotationOptions;onChange:(options:NotationOptions)=>void}){
  const [show,setShow]=useState(false),[batch,setBatch]=useState(0);const pages=paginateNotation(bars,options);const safeBatch=Math.min(batch,Math.max(0,Math.ceil(pages.length/12)-1));
  // Dense grids and long labels need a wider measure, irrespective of image resolution.
  const warnings=bars.filter(bar=>new Set(bar.hits.map(h=>h.step)).size>Math.floor(30/(options.barsPerLine??2))||`${bar.sectionName} ${bar.annotation??''}`.length>80);
  return <details className="card song-builder-extra" onToggle={e=>setShow(e.currentTarget.open)}><summary>Export preparation · {pages.length} pages</summary><div className="song-builder-tool-fields"><label>Paper size<select value={options.paperSize??'letter'} onChange={e=>onChange({...options,paperSize:e.target.value as 'letter'|'a4'})}><option value="letter">US Letter</option><option value="a4">A4</option></select></label><label>Orientation<select value={options.orientation??'landscape'} onChange={e=>onChange({...options,orientation:e.target.value as 'portrait'|'landscape'})}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label></div><p>{warnings.length?`${warnings.length} measure(s) may be crowded or have long labels. Use fewer measures per line/page and shorter annotations.`:'No crowded measures or long labels detected.'} Preview every page before downloading.</p>{warnings.length>0&&<p>Check measures {warnings.slice(0,24).map(b=>b.number).join(', ')}.</p>}{pages.length>12&&<label>Page group<select value={Math.min(batch,Math.floor((pages.length-1)/12))} onChange={e=>setBatch(Number(e.target.value))}>{Array.from({length:Math.ceil(pages.length/12)},(_,i)=><option key={i} value={i}>{i*12+1}–{Math.min(pages.length,(i+1)*12)}</option>)}</select></label>}{show&&<div className="song-builder-export-pages">{pages.slice(safeBatch*12,safeBatch*12+12).map((_,i)=><figure key={safeBatch*12+i}><SheetThumbnail song={song} bars={bars} view={view} index={safeBatch*12+i} options={options}/><figcaption>Page {safeBatch*12+i+1}</figcaption></figure>)}</div>}</details>;
}
