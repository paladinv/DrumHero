'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { DrumPart, DrumSong } from '@/lib/song-library';
import { BUILDER_VOICES, sectionClips, VOICE_LABEL, type ArrangementBar } from '@/lib/song-builder';
import { deleteBuilderVersion, readBuilderVersions, saveBuilderVersion, type BuilderVersion } from '@/lib/song-builder-storage';
import { arrangementWav, SHEET_HEIGHT, SHEET_WIDTH } from '@/lib/song-builder-export';
import { buildArrangementBars } from '@/lib/song-builder';
import type { DrumMixSettings } from '@/lib/audio';
import { DEFAULT_NOTATION_OPTIONS, drawNotationPage, notationBarAtPoint, notationCellAtPoint, paginateNotation, type NotationOptions, type NotationView } from '@/lib/song-builder-notation';
import type { SongInstrument } from '@/lib/types';
export { SongBuilderBackingTrack, type BackingTrackHandle } from './SongBuilderBackingTrack';

export function SongBuilderNotationCanvas({song,bars,view,options,page=0,cursor,selectedRange,onBarClick,onCellClick,entryVoice='hihat',zoom=1,label}:{song:DrumSong;bars:ArrangementBar[];view:NotationView;options:NotationOptions;page?:number;cursor?:{barIndex:number;fraction:number}|null;selectedRange?:[number,number];onBarClick?:(index:number)=>void;onCellClick?:(cell:{barIndex:number;step:number;instrument:SongInstrument})=>void;entryVoice?:SongInstrument;zoom?:number;label?:string}){
  const canvasRef=useRef<HTMLCanvasElement>(null),pages=useMemo(()=>paginateNotation(bars,options),[bars,options]),safePage=Math.max(0,Math.min(pages.length-1,page));
  const cursorBarIndex=cursor?.barIndex,cursorFraction=cursor?.fraction,rangeStart=selectedRange?.[0],rangeEnd=selectedRange?.[1];
  useEffect(()=>{
    const target=canvasRef.current;if(!target)return;
    try{const renderCursor=cursorBarIndex===undefined?null:{barIndex:cursorBarIndex,fraction:cursorFraction??0},renderRange=rangeStart===undefined||rangeEnd===undefined?undefined:[rangeStart,rangeEnd] as [number,number],rendered=drawNotationPage(song,bars,view,safePage,renderCursor,options,renderRange),context=target.getContext('2d');if(!context)return;target.width=rendered.width;target.height=rendered.height;context.clearRect(0,0,target.width,target.height);context.drawImage(rendered,0,0);}
    catch(error){console.error('Could not draw the notation view.',error);}
  },[song,bars,view,options,safePage,cursorBarIndex,cursorFraction,rangeStart,rangeEnd]);
  const click=(event:MouseEvent<HTMLCanvasElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width*event.currentTarget.width,y=(event.clientY-bounds.top)/bounds.height*event.currentTarget.height;
    if(onCellClick){const cell=notationCellAtPoint(bars,safePage,options,view,x,y,entryVoice);if(cell){onCellClick(cell);return;}}
    if(onBarClick){const index=notationBarAtPoint(bars,safePage,options,x,y);if(index!==undefined)onBarClick(index);}
  };
  return <div className="song-builder-score-canvas-scroll"><div className="song-builder-score-canvas-frame" style={{width:`${Math.round(zoom*100)}%`}}><canvas ref={canvasRef} width={SHEET_WIDTH} height={SHEET_HEIGHT} tabIndex={-1} role="img" aria-label={`${label??song.title} · ${view==='tab'?'drum tab':'percussion staff'} · page ${safePage+1} of ${Math.max(1,pages.length)}${onBarClick?'. Click a measure to seek or select the practice range.':'.'}`} onClick={click}/></div></div>;
}

const comparisonNotationOptions:NotationOptions={...DEFAULT_NOTATION_OPTIONS,barsPerPage:4,barsPerLine:1,orientation:'landscape'};
function SongBuilderNotationPreview({song,bars,view,label}:{song:DrumSong;bars:ArrangementBar[];view:NotationView;label:string}){
  const [page,setPage]=useState(0),pages=useMemo(()=>paginateNotation(bars,comparisonNotationOptions),[bars]),pageCount=Math.max(1,pages.length),safePage=Math.min(page,pageCount-1);
  return <article className="song-builder-notation-preview"><div><strong>{label}</strong>{pageCount>1&&<div className="song-builder-pages"><button type="button" aria-label={`${label} previous notation page`} disabled={!safePage} onClick={()=>setPage(current=>Math.max(0,current-1))}>‹</button><span>{safePage+1}/{pageCount}</span><button type="button" aria-label={`${label} next notation page`} disabled={safePage>=pageCount-1} onClick={()=>setPage(current=>Math.min(pageCount-1,current+1))}>›</button></div>}</div><SongBuilderNotationCanvas song={song} bars={bars} view={view} options={comparisonNotationOptions} page={safePage} zoom={1} label={label}/></article>;
}

export function SongBuilderNotationNavigator({song,bars,view,onViewChange,options,onOptionsChange,activeBar,activeFraction,range,onRangeChange,onSeek,onPractice,onScoreEdit,follow}:{song:DrumSong;bars:ArrangementBar[];view:NotationView;onViewChange:(view:NotationView)=>void;options:NotationOptions;onOptionsChange?:(options:NotationOptions)=>void;activeBar:number;activeFraction:number;range:[number,number];onRangeChange:(start:number,end:number)=>void;onSeek:(bar:number)=>void;onPractice:()=>void;onScoreEdit?:(barIndex:number,step:number,instrument:SongInstrument)=>void;follow:boolean}){
  const [page,setPage]=useState(0),[pageRequest,setPageRequest]=useState<{bar:number;page:number}|null>(null),[zoom,setZoom]=useState(1),[rangeMode,setRangeMode]=useState(false),[pendingStart,setPendingStart]=useState<number|null>(null);
  const [editMode,setEditMode]=useState(false),[entryVoice,setEntryVoice]=useState<SongInstrument>('hihat'),[entryBar,setEntryBar]=useState(0),[entryStep,setEntryStep]=useState(0);
  const pages=useMemo(()=>paginateNotation(bars,options),[bars,options]),pageCount=Math.max(1,pages.length);
  const activePage=activeBar<0?-1:pages.findIndex(items=>items.includes(bars[activeBar]));
  const requestedPage=pageRequest?.bar===activeBar?pageRequest.page:-1;
  const visiblePage=follow&&activePage>=0?(requestedPage>=0?requestedPage:activePage):page;
  const safePage=Math.max(0,Math.min(visiblePage,pageCount-1));
  const showPage=(next:number)=>{const target=Math.max(0,Math.min(pageCount-1,next));if(follow&&activeBar>=0)setPageRequest({bar:activeBar,page:target});else setPage(target);};
  const chooseBar=(index:number)=>{
    if(!rangeMode){setPageRequest(null);onSeek(index);return;}
    if(pendingStart===null){setPendingStart(index);onRangeChange(index,index);}
    else{onRangeChange(Math.min(pendingStart,index),Math.max(pendingStart,index));setPendingStart(null);setRangeMode(false);}
  };
  const tempoDomain=useMemo(()=>bars.reduce<[number,number]>(([minimum,maximum],bar)=>[Math.min(minimum,bar.bpm),Math.max(maximum,bar.bpm)],[song.bpm,song.bpm]),[bars,song.bpm]);
  const maxBpm=tempoDomain[1],bpmSpan=Math.max(8,tempoDomain[1]-tempoDomain[0]);
  const points=useMemo(()=>bars.map((bar,index)=>({x:bars.length===1?50:8+index/(bars.length-1)*84,y:8+(maxBpm-bar.bpm)/bpmSpan*54,bar,index})),[bars,bpmSpan,maxBpm]);
  const safeEntryBar=Math.max(0,Math.min(bars.length-1,entryBar)),entryMeasure=bars[safeEntryBar],entryStepCount=Math.max(1,Math.round((entryMeasure?.beats??4)*(entryMeasure?.subdivision??8)/4));
  return <section className="card song-builder-score-navigator" aria-label="Notation arrangement overview">
    <div className="song-builder-section-heading"><div><span className="eyebrow">Score overview</span><h2>Follow the notation.</h2><p>Choose a measure in the drum tab or percussion staff to seek. The score cursor follows playback.</p></div><div className="song-builder-actions"><button type="button" aria-pressed={view==='tab'} onClick={()=>onViewChange('tab')}>Drum tab</button><button type="button" aria-pressed={view==='staff'} onClick={()=>onViewChange('staff')}>Percussion staff</button></div></div>
    <div className="song-builder-score-nav-controls"><button type="button" aria-pressed={rangeMode} onClick={()=>{setRangeMode(value=>!value);setPendingStart(null);}}>{rangeMode?(pendingStart===null?'Choose range start in score':'Choose range end in score'):'Select practice range in score'}</button><span>{rangeMode?'Choose two measures on the notation.':`Practice range · measures ${range[0]+1}–${range[1]+1}`}</span><label>Seek to measure<select aria-label="Seek to measure from notation" value={Math.max(0,Math.min(bars.length-1,activeBar))} onChange={event=>{setPageRequest(null);onSeek(Number(event.target.value));}}>{bars.map((bar,index)=><option key={`${bar.sectionId}:${bar.index}:${index}`} value={index}>Measure {index+1} · {bar.sectionName} · {bar.bpm} BPM</option>)}</select></label><label>Score zoom · {Math.round(zoom*100)}%<input type="range" min={0.65} max={1.6} step={0.05} value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><label className="song-builder-check"><input type="checkbox" checked={options.largePrint===true} onChange={event=>onOptionsChange?.({...options,largePrint:event.target.checked})}/>Large print</label><label className="song-builder-check"><input type="checkbox" checked={options.highContrast===true} onChange={event=>onOptionsChange?.({...options,highContrast:event.target.checked})}/>High contrast</label>{pageCount>1&&<div className="song-builder-pages"><button type="button" disabled={safePage===0} onClick={()=>showPage(safePage-1)}>Previous score page</button><span>Page {safePage+1} of {pageCount}</span><button type="button" disabled={safePage===pageCount-1} onClick={()=>showPage(safePage+1)}>Next score page</button></div>}<button className="button" type="button" onClick={onPractice}>Practice measures {range[0]+1}–{range[1]+1}</button></div>
    {onScoreEdit&&<div className="song-builder-score-edit-controls"><label className="song-builder-check"><input type="checkbox" checked={editMode} onChange={event=>setEditMode(event.target.checked)}/>Edit notes in notation</label>{editMode&&<><span>Click a note position in the {view==='tab'?'voice lane':'staff'} to cycle rest → hit → accent → rest.</span><label>Drum voice<select value={entryVoice} onChange={event=>setEntryVoice(event.target.value as SongInstrument)}>{BUILDER_VOICES.map(voice=><option key={voice} value={voice}>{song.voiceLabels?.[voice]||VOICE_LABEL[voice]}</option>)}</select></label><label>Measure<select value={safeEntryBar} onChange={event=>{setEntryBar(Number(event.target.value));setEntryStep(0);}}>{bars.map((bar,index)=><option key={`${bar.sectionId}:${bar.index}:${index}`} value={index}>Measure {index+1} · {bar.sectionName} · {bar.partName}</option>)}</select></label><label>Grid step<input type="number" min={1} max={entryStepCount} value={Math.min(entryStepCount,entryStep+1)} onChange={event=>setEntryStep(Math.max(0,Math.min(entryStepCount-1,Number(event.target.value)-1)))}/></label><button type="button" disabled={!entryMeasure} onClick={()=>entryMeasure&&onScoreEdit(safeEntryBar,entryStep,entryVoice)}>Cycle selected note</button></>}</div>}
    <SongBuilderNotationCanvas song={song} bars={bars} view={view} options={options} page={safePage} cursor={activeBar>=0?{barIndex:activeBar,fraction:activeFraction}:null} selectedRange={range} onBarClick={editMode?undefined:chooseBar} onCellClick={editMode&&onScoreEdit?(cell)=>{setEntryBar(cell.barIndex);setEntryStep(cell.step);setEntryVoice(cell.instrument);onScoreEdit(cell.barIndex,cell.step,cell.instrument);}:undefined} entryVoice={entryVoice} zoom={zoom}/>
    <div className="song-builder-tempo-curve"><div><strong>Tempo through the arrangement</strong><small>Each point uses the effective measure tempo, including section ramps. Select a point to jump there.</small></div><svg viewBox="0 0 100 70" role="group" aria-label="Interactive tempo curve by measure"><polyline points={points.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5"/>{points.map(({x,y,bar,index})=><circle key={`${bar.index}:${index}`} cx={x} cy={y} r={activeBar===index?2.4:1.5} className={activeBar===index?'active':''} role="button" tabIndex={0} aria-label={`Measure ${index+1}, ${bar.bpm} BPM, ${bar.sectionName}`} onClick={()=>onSeek(index)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSeek(index);}}}/>)}</svg><div className="song-builder-tempo-labels"><span>{bars[0]?.bpm??song.bpm} BPM</span><span>{bars.at(-1)?.bpm??song.bpm} BPM</span></div></div>
  </section>;
}

function compareSongNotes(current:DrumSong,saved:DrumSong){
  const flatten=(song:DrumSong)=>new Map(song.sections.flatMap(section=>section.parts.flatMap(part=>part.hits.map(hit=>[`${section.id}:${part.id}:${hit.instrument}:${hit.step}`,JSON.stringify(hit)] as const))));
  const now=flatten(current),before=flatten(saved);
  return {added:[...now.keys()].filter(key=>!before.has(key)).length,removed:[...before.keys()].filter(key=>!now.has(key)).length,changed:[...now.keys()].filter(key=>before.has(key)&&now.get(key)!==before.get(key)).length};
}
function compareRangeBars(source:ArrangementBar[],other:ArrangementBar[],start:number,end:number){
  return Array.from({length:end-start+1},(_,offset)=>{const index=start-1+offset,bar=source[index]??other[index];return bar?source[index]??{...bar,index,number:index+1,hits:[],sectionName:'No measure',partName:'No measure'}:undefined;}).filter((bar):bar is ArrangementBar=>!!bar);
}
function notationDiffBars(primary:ArrangementBar[],comparison:ArrangementBar[],side:'current'|'saved'){
  return primary.map((bar,index)=>{
    const other=comparison[index],matched=new Set<string>();
    const key=(hit:ArrangementBar['hits'][number])=>`${hit.instrument}:${hit.beat.toFixed(4)}`;
    const expression=(hit:ArrangementBar['hits'][number])=>JSON.stringify([hit.accent,hit.velocity,hit.ghost,hit.articulation,hit.sticking]);
    const hits=bar.hits.map(hit=>{
      const match=other?.hits.find(item=>key(item)===key(hit));
      if(!match)return {...hit,diffStatus:side==='current'?'added' as const:'removed' as const};
      matched.add(key(hit));return {...hit,diffStatus:expression(hit)===expression(match)?undefined:'changed' as const};
    });
    const unmatched=(other?.hits??[]).filter(hit=>!matched.has(key(hit))).map(hit=>{
      const beat=Math.max(0,Math.min(Math.max(0,bar.beats-0.0001),hit.beat));
      return {...hit,beat,fraction:bar.beats?beat/bar.beats:0,step:Math.max(0,Math.round(beat*bar.subdivision/4)),sourceSubdivision:bar.subdivision,diffStatus:side==='current'?'removed' as const:'added' as const,ghost:true};
    });
    return {...bar,hits:[...hits,...unmatched]};
  });
}

export function SongBuilderVersions({song,onRestore,mix,swing}:{song:DrumSong;onRestore:(song:DrumSong)=>void;mix:DrumMixSettings;swing:number}){
  const [versions,setVersions]=useState<BuilderVersion[]>([]),[name,setName]=useState(''),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0),[compareId,setCompareId]=useState(''),[compareStart,setCompareStart]=useState(1),[compareEnd,setCompareEnd]=useState(0),[preview,setPreview]=useState<{song:DrumSong;current:string;saved:string}|null>(null),[rendering,setRendering]=useState(false),[restoreScope,setRestoreScope]=useState<'section'|'pattern'>('section'),[restoreSectionId,setRestoreSectionId]=useState(''),[restorePartId,setRestorePartId]=useState(''),[diffNotationView,setDiffNotationView]=useState<NotationView>('staff');
  const previewUrls=useRef<string[]>([]),renderRequest=useRef(0);
  const selected=versions.find(version=>version.id===compareId);
  const currentBars=useMemo(()=>buildArrangementBars(song),[song]);
  const savedBars=useMemo(()=>selected?buildArrangementBars(selected.song):[],[selected]);
  const maxCompareBars=Math.max(currentBars.length,savedBars.length,1),safeCompareStart=Math.max(1,Math.min(maxCompareBars,compareStart)),safeCompareEnd=Math.max(safeCompareStart,Math.min(maxCompareBars,compareEnd||maxCompareBars));
  const currentCompareBars=useMemo(()=>compareRangeBars(currentBars,savedBars,safeCompareStart,safeCompareEnd),[currentBars,savedBars,safeCompareStart,safeCompareEnd]);
  const savedCompareBars=useMemo(()=>compareRangeBars(savedBars,currentBars,safeCompareStart,safeCompareEnd),[savedBars,currentBars,safeCompareStart,safeCompareEnd]);
  const currentDiffBars=useMemo(()=>notationDiffBars(currentCompareBars,savedCompareBars,'current'),[currentCompareBars,savedCompareBars]);
  const savedDiffBars=useMemo(()=>notationDiffBars(savedCompareBars,currentCompareBars,'saved'),[savedCompareBars,currentCompareBars]);
  const barDiffs=useMemo(()=>Array.from({length:safeCompareEnd-safeCompareStart+1},(_,offset)=>{
    const index=safeCompareStart-1+offset,current=currentBars[index],saved=savedBars[index];
    const signature=(bar:ArrangementBar|undefined)=>bar?JSON.stringify({section:bar.sectionName,part:bar.partName,meter:bar.meter,bpm:bar.bpm,hits:bar.hits.map(hit=>[hit.instrument,Number(hit.beat.toFixed(3)),hit.velocity,hit.accent,hit.ghost,hit.articulation])}):"missing";
    return {measure:index+1,current,saved,changed:signature(current)!==signature(saved)};
  }).filter(item=>item.changed),[currentBars,savedBars,safeCompareStart,safeCompareEnd]);
  const clearPreview=()=>{renderRequest.current+=1;previewUrls.current.forEach(url=>URL.revokeObjectURL(url));previewUrls.current=[];setPreview(null);};
  useEffect(()=>{let active=true;void readBuilderVersions(song.id).then(rows=>{if(active)setVersions(rows);}).catch(()=>{if(active)setMessage('Recovery storage is unavailable. Export a song project to keep a copy.');});return()=>{active=false;};},[song.id,refresh]);
  useEffect(()=>{if(song.bundled)return;const timer=window.setTimeout(()=>{void saveBuilderVersion(song,'Autosave','autosave').then(()=>setRefresh(n=>n+1)).catch(()=>setMessage('Recovery storage is full. Export a song project to keep a copy.'));},1500);return()=>clearTimeout(timer);},[song]);
  useEffect(()=>()=>{renderRequest.current+=1;previewUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  useEffect(()=>{renderRequest.current+=1;previewUrls.current.forEach(url=>URL.revokeObjectURL(url));previewUrls.current=[];},[song]);
  const renderComparison=async()=>{
    if(!selected)return;clearPreview();const request=renderRequest.current,comparisonSong=song;setRendering(true);setMessage(`Rendering measures ${safeCompareStart}–${safeCompareEnd} with the current kit settings…`);
    try{const {readCustomSamples}=await import('@/lib/song-builder-samples');const samples=await readCustomSamples();const currentBlob=await arrangementWav(currentCompareBars,swing,mix,samples);const savedBlob=await arrangementWav(savedCompareBars,swing,mix,samples);const urls=[URL.createObjectURL(currentBlob),URL.createObjectURL(savedBlob)];if(request!==renderRequest.current){urls.forEach(url=>URL.revokeObjectURL(url));return;}previewUrls.current=urls;setPreview({song:comparisonSong,current:urls[0]!,saved:urls[1]!});setMessage(`A/B audio is ready for measures ${safeCompareStart}–${safeCompareEnd}.`);}
    catch(error){setMessage(error instanceof Error?error.message:'Could not render this comparison.');}
    finally{setRendering(false);}
  };
  const diff=useMemo(()=>selected?compareSongNotes(song,selected.song):null,[song,selected]);
  const currentPreview=preview?.song===song?preview:null;
  const restoreFragment=(version:BuilderVersion)=>{
    const next=structuredClone(song),sourceSection=version.song.sections.find(section=>section.id===restoreSectionId);
    if(!sourceSection){setMessage('That section is not available in the saved version.');return;}
    if(restoreScope==='section'){
      const index=next.sections.findIndex(section=>section.id===sourceSection.id);
      if(index<0)next.sections.push(structuredClone(sourceSection));else next.sections[index]=structuredClone(sourceSection);
    }else{
      const sourcePart=sourceSection.parts.find(part=>part.id===restorePartId);
      if(!sourcePart){setMessage('That pattern is not available in the saved version.');return;}
      let targetSection=next.sections.find(section=>section.id===sourceSection.id);
      if(!targetSection){targetSection={...structuredClone(sourceSection),parts:[],clips:[]};next.sections.push(targetSection);}
      const existing=targetSection.parts.findIndex(part=>part.id===sourcePart.id);
      if(existing<0)targetSection.parts.push(structuredClone(sourcePart));else targetSection.parts[existing]=structuredClone(sourcePart);
      const savedClips=sectionClips(sourceSection).filter(clip=>clip.partId===sourcePart.id);
      const currentClips=sectionClips(targetSection);
      if(!currentClips.some(clip=>clip.partId===sourcePart.id))targetSection.clips=[...currentClips,...(savedClips.length?savedClips.map(clip=>({...structuredClone(clip),id:crypto.randomUUID()})):[{id:crypto.randomUUID(),partId:sourcePart.id,repeats:1}])];
    }
    onRestore({...next,bundled:false});
    setMessage(`Recovered ${restoreScope==='section'?`section “${sourceSection.name}”`:`pattern from “${sourceSection.name}”`} from ${version.label}.`);
  };
  return <details className="card song-builder-versions"><summary>Versions and recovery</summary>
    <form className="song-builder-tool-actions" onSubmit={e=>{e.preventDefault();void saveBuilderVersion(song,name,'named').then(()=>{setRefresh(n=>n+1);setName('');setMessage('Named version saved.');}).catch(()=>setMessage('Could not save this version.'));}}><label>Version name<input required maxLength={60} placeholder="Simpler chorus" value={name} onChange={e=>setName(e.target.value)}/></label><button type="submit">Save version</button></form>
    <p>Recent autosaves and named versions include the title, tempo, sections, and notes.</p>
    {versions.length>0&&<section className="song-builder-version-compare">
      <h3>Compare with current song</h3>
      <label>Saved version<select disabled={rendering} value={compareId} onChange={event=>{clearPreview();setCompareId(event.target.value);setRestoreSectionId('');setRestorePartId('');setCompareStart(1);setCompareEnd(0);}}><option value="">Choose a version…</option>{versions.map(version=><option key={version.id} value={version.id}>{version.label} · {version.kind} · {new Date(version.createdAt).toLocaleString()}</option>)}</select></label>
      {selected&&diff&&<>
        <p>Current song vs “{selected.label}”: {diff.added} added notes · {diff.removed} removed notes · {diff.changed} changed hits. Tempo {song.bpm} vs {selected.song.bpm} BPM · {song.sections.length} vs {selected.song.sections.length} sections.</p>
        <div className="song-builder-tool-fields"><label>First measure<input type="number" min={1} max={maxCompareBars} value={safeCompareStart} onChange={event=>{clearPreview();setCompareStart(Math.max(1,Math.min(maxCompareBars,Number(event.target.value)||1)));}}/></label><label>Last measure<input type="number" min={safeCompareStart} max={maxCompareBars} value={safeCompareEnd} onChange={event=>{clearPreview();setCompareEnd(Math.max(safeCompareStart,Math.min(maxCompareBars,Number(event.target.value)||maxCompareBars)));}}/></label></div>
        <p>{barDiffs.length} measure(s) differ in this range.</p>
        {barDiffs.length>0&&<details><summary>Review measure changes ({barDiffs.length})</summary><ol>{barDiffs.slice(0,40).map(item=><li key={item.measure}>Measure {item.measure}: current {item.current?`${item.current.sectionName} · ${item.current.partName} · ${item.current.hits.length} hits · ${item.current.meter}`:"no measure"}; saved {item.saved?`${item.saved.sectionName} · ${item.saved.partName} · ${item.saved.hits.length} hits · ${item.saved.meter}`:"no measure"}.</li>)}</ol></details>}
        <div className="song-builder-actions" role="group" aria-label="Version difference notation"><button type="button" aria-pressed={diffNotationView==='staff'} onClick={()=>setDiffNotationView('staff')}>Percussion staff</button><button type="button" aria-pressed={diffNotationView==='tab'} onClick={()=>setDiffNotationView('tab')}>Drum tab</button><span>+ added · − removed · ~ expression changed</span></div>
        <div className="song-builder-notation-compare"><SongBuilderNotationPreview song={song} bars={currentDiffBars} view={diffNotationView} label={`Current · measures ${safeCompareStart}–${safeCompareEnd}`}/><SongBuilderNotationPreview song={selected.song} bars={savedDiffBars} view={diffNotationView} label={`${selected.label} · measures ${safeCompareStart}–${safeCompareEnd}`}/></div>
        <button type="button" disabled={rendering||!currentBars.length||!savedBars.length} onClick={()=>void renderComparison()}>{rendering?'Rendering A/B audio…':`Render A/B measures ${safeCompareStart}–${safeCompareEnd}`}</button>
        {currentPreview&&<div className="song-builder-version-audio"><label>Current · measures {safeCompareStart}–{safeCompareEnd}<audio controls preload="none" src={currentPreview.current}/></label><label>{selected.label} · measures {safeCompareStart}–{safeCompareEnd}<audio controls preload="none" src={currentPreview.saved}/></label></div>}
      </>}
      {selected&&<details className="song-builder-selective-recovery"><summary>Recover one section or pattern</summary><label>Recovery scope<select value={restoreScope} onChange={event=>setRestoreScope(event.target.value as 'section'|'pattern')}><option value="section">Whole section</option><option value="pattern">One pattern</option></select></label><label>Saved section<select value={restoreSectionId} onChange={event=>{setRestoreSectionId(event.target.value);setRestorePartId('');}}><option value="">Choose a section…</option>{selected.song.sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label>{restoreScope==='pattern'&&<label>Saved pattern<select value={restorePartId} onChange={event=>setRestorePartId(event.target.value)}><option value="">Choose a pattern…</option>{selected.song.sections.find(section=>section.id===restoreSectionId)?.parts.map(part=><option key={part.id} value={part.id}>{part.name}</option>)}</select></label>}<button type="button" disabled={!restoreSectionId||(restoreScope==='pattern'&&!restorePartId)} onClick={()=>void saveBuilderVersion(song,'Before selective recovery','autosave').then(()=>{restoreFragment(selected);setRefresh(n=>n+1);}).catch(()=>setMessage('Could not preserve the current arrangement before recovery.'))}>Recover selected {restoreScope}</button></details>}
    </section>}
    <ul className="song-builder-version-list">{versions.map(version=><li key={version.id}><span><strong>{version.label}</strong> · {version.kind} · {new Date(version.createdAt).toLocaleString()}</span><button type="button" onClick={()=>{void saveBuilderVersion(song,'Before restore','autosave').then(()=>{onRestore({...structuredClone(version.song),id:song.id,bundled:false});setMessage(`Restored ${version.label}. The previous arrangement is in recovery.`);setRefresh(n=>n+1);}).catch(()=>setMessage('Could not preserve the current arrangement before restoring.'));}}>Restore</button><button type="button" aria-label={`Delete version ${version.label}`} onClick={()=>{if(compareId===version.id){clearPreview();setCompareId('');}void deleteBuilderVersion(version.id).then(()=>setRefresh(n=>n+1));}}>Delete</button></li>)}</ul>
    <p role="status">{message||`${versions.length} saved versions · up to 12 autosaves and 20 named versions per song`}</p>
  </details>;
}

type PatternChoice={key:string;sectionName:string;part:DrumPart;section:DrumSong['sections'][number]};
const patternPositionLabel=(key:string)=>{const [voice,beatOffset]=key.split(':');return `${voice} at beat ${Number((Number(beatOffset)+1).toFixed(3))}`;};
function comparisonSongForPattern(song:DrumSong,choice:PatternChoice,tempo:number):DrumSong{return {...song,bpm:tempo,sections:[{...choice.section,id:`compare-${choice.part.id}`,name:choice.part.name,parts:[{...structuredClone(choice.part),bpm:tempo}],clips:[{id:`compare-clip-${choice.part.id}`,partId:choice.part.id,repeats:1}],repeats:1,bpm:tempo,meter:choice.part.meter??choice.section.meter??song.meter,tempoRamp:undefined,automation:undefined,endingGroup:undefined,endingPass:undefined,endingRepeats:undefined}]};}
export function SongBuilderPatternCompare({song,mix,swing}:{song:DrumSong;mix:DrumMixSettings;swing:number}){
  const patterns=useMemo<PatternChoice[]>(()=>song.sections.flatMap(section=>section.parts.map(part=>({key:`${section.id}:${part.id}`,sectionName:section.name,part,section}))),[song]);
  const defaultFirst=patterns[0]?.key??'',defaultSecond=patterns.find(item=>item.key!==defaultFirst)?.key??defaultFirst;
  const [firstId,setFirstId]=useState(defaultFirst),[secondId,setSecondId]=useState(defaultSecond),[tempoOverride,setTempoOverride]=useState<number|null>(null),[urls,setUrls]=useState<[string,string]|null>(null),[rendering,setRendering]=useState(false),[message,setMessage]=useState('');
  const tempo=tempoOverride??song.bpm;
  const [notationView,setNotationView]=useState<NotationView>('staff');
  const request=useRef(0);
  const urlsRef=useRef<[string,string]|null>(null);
  const first=patterns.find(item=>item.key===firstId)??patterns[0],second=patterns.find(item=>item.key===secondId)??patterns.find(item=>item.key!==first?.key)??first;
  const clear=()=>{request.current++;urlsRef.current?.forEach(url=>URL.revokeObjectURL(url));urlsRef.current=null;setUrls(null);};
  useEffect(()=>()=>{request.current++;urlsRef.current?.forEach(url=>URL.revokeObjectURL(url));urlsRef.current=null;},[]);
  const differences=useMemo(()=>{
    if(!first||!second)return null;
    const flatten=(part:DrumPart)=>new Map(part.hits.map(hit=>[`${hit.instrument}:${(hit.step*4/part.subdivision).toFixed(4)}`,JSON.stringify({accent:hit.accent,velocity:hit.velocity,ghost:hit.ghost,articulation:hit.articulation,sticking:hit.sticking})] as const));
    const a=flatten(first.part),b=flatten(second.part);
    return {added:[...b.keys()].filter(key=>!a.has(key)),removed:[...a.keys()].filter(key=>!b.has(key)),changed:[...a.keys()].filter(key=>a.has(key)&&b.has(key)&&a.get(key)!==b.get(key))};
  },[first,second]);
  const firstScoreSong=useMemo(()=>first?comparisonSongForPattern(song,first,tempo):null,[song,first,tempo]);
  const secondScoreSong=useMemo(()=>second?comparisonSongForPattern(song,second,tempo):null,[song,second,tempo]);
  const firstScoreBars=useMemo(()=>firstScoreSong?buildArrangementBars(firstScoreSong):[],[firstScoreSong]);
  const secondScoreBars=useMemo(()=>secondScoreSong?buildArrangementBars(secondScoreSong):[],[secondScoreSong]);
  const render=async()=>{
    if(!first||!second)return;
    clear();const id=request.current;setRendering(true);setMessage('Rendering both patterns with the same tempo and kit…');
    try{
      const {readCustomSamples}=await import('@/lib/song-builder-samples'),samples=await readCustomSamples();
      const a=await arrangementWav(firstScoreBars,swing,mix,samples),b=await arrangementWav(secondScoreBars,swing,mix,samples),next:[string,string]=[URL.createObjectURL(a),URL.createObjectURL(b)];
      if(id!==request.current){next.forEach(url=>URL.revokeObjectURL(url));return;}urlsRef.current=next;setUrls(next);setMessage('A/B previews are ready.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not render these patterns.');}
    finally{setRendering(false);}
  };
  return <details className="card song-builder-pattern-compare"><summary>Pattern A/B comparison</summary><p>Compare the actual drum notation and audio at the same tempo and kit.</p>{patterns.length<2?<p>Add a second pattern to compare.</p>:<><div className="song-builder-tool-fields"><label>Pattern A<select value={first?.key??''} onChange={event=>{clear();setFirstId(event.target.value);}}>{patterns.map(item=><option key={item.key} value={item.key}>{item.sectionName} · {item.part.name}</option>)}</select></label><label>Pattern B<select value={second?.key??''} onChange={event=>{clear();setSecondId(event.target.value);}}>{patterns.map(item=><option key={item.key} value={item.key}>{item.sectionName} · {item.part.name}</option>)}</select></label><label>Shared tempo · BPM<input type="number" min={40} max={200} value={tempo} onChange={event=>{clear();setTempoOverride(Math.max(40,Math.min(200,Number(event.target.value)||80)));}}/></label></div><div className="song-builder-actions" role="group" aria-label="Comparison notation"><button type="button" aria-pressed={notationView==='staff'} onClick={()=>setNotationView('staff')}>Percussion staff</button><button type="button" aria-pressed={notationView==='tab'} onClick={()=>setNotationView('tab')}>Drum tab</button></div><div className="song-builder-notation-compare"><SongBuilderNotationPreview song={firstScoreSong??song} bars={firstScoreBars} view={notationView} label={`A · ${first?.part.name??'Pattern A'}`}/><SongBuilderNotationPreview song={secondScoreSong??song} bars={secondScoreBars} view={notationView} label={`B · ${second?.part.name??'Pattern B'}`}/></div>{differences&&<p>{differences.added.length} notes added in B · {differences.removed.length} only in A · {differences.changed.length} expression changes. Notation keeps each pattern’s own meter and grid.</p>}<button type="button" disabled={rendering||!first||!second||first.key===second.key} onClick={()=>void render()}>{rendering?'Rendering…':'Render A/B audio'}</button>{differences&&<details className="song-builder-pattern-diff"><summary>Review note changes ({differences.added.length+differences.removed.length+differences.changed.length})</summary><ul>{[...differences.added.map(key=>({key,label:`B adds ${patternPositionLabel(key)}`,kind:'added'})),...differences.removed.map(key=>({key,label:`A only ${patternPositionLabel(key)}`,kind:'removed'})),...differences.changed.map(key=>({key,label:`Changed ${patternPositionLabel(key)}`,kind:'changed'}))].slice(0,24).map((item,index)=><li className={item.kind} key={`${item.kind}:${item.key}:${index}`}>{item.label}</li>)}</ul></details>}{urls&&<div className="song-builder-version-audio"><label>{first?.part.name}<audio controls preload="none" src={urls[0]}/></label><label>{second?.part.name}<audio controls preload="none" src={urls[1]}/></label></div>}</> }<p role="status">{message}</p></details>;
}

export function SongBuilderTimeline({song,bars,activeBar,onSeek,onSelect,onMove,follow,onFollow,loopBounds,onLoopChange,loopDisabled}:{song:DrumSong;bars:ArrangementBar[];activeBar:number;onSeek:(bar:number)=>void;onSelect:(sectionId:string,clipId?:string)=>void;onMove:(sectionId:string,clipId:string,targetId:string)=>void;follow:boolean;onFollow:(value:boolean)=>void;loopBounds:[number,number];onLoopChange:(bounds:[number,number])=>void;loopDisabled:boolean}){
  const container=useRef<HTMLDivElement>(null);
  const [zoom,setZoom]=useState(1),[collapsed,setCollapsed]=useState<string[]>([]),[loopSnap,setLoopSnap]=useState<"bar"|"beat"|"eighth"|"sixteenth">("sixteenth");
  useEffect(()=>{const row=container.current,target=row?.querySelector<HTMLElement>(`[data-timeline-bar="${activeBar}"]`);if(follow&&row&&target)row.scrollTo({left:target.offsetLeft-row.offsetLeft-row.clientWidth/2+target.clientWidth/2,behavior:'smooth'});},[activeBar,follow]);
  const total=Math.round(bars.reduce((sum,bar)=>sum+bar.beats*60/bar.bpm,0));
  const beatsPerBar=Math.max(1,bars[0]?.beats??4),snapStep=loopSnap==="bar"?1:loopSnap==="beat"?1/beatsPerBar:loopSnap==="eighth"?1/(beatsPerBar*2):1/(beatsPerBar*4);
  const snapLoop=(value:number)=>Math.round(value/snapStep)*snapStep;
  return <section className="card song-builder-timeline" aria-label="Visual song timeline"><div className="song-builder-section-heading"><h2>Song timeline</h2><strong>{bars.length} measures · {Math.floor(total/60)}:{String(total%60).padStart(2,'0')}</strong></div><label className="song-builder-check"><input type="checkbox" checked={follow} onChange={e=>onFollow(e.target.checked)}/>Follow playhead</label><label>Loop snap<select aria-label="Loop boundary snap" value={loopSnap} onChange={e=>setLoopSnap(e.target.value as typeof loopSnap)}><option value="bar">Measure</option><option value="beat">Beat</option><option value="eighth">Eighth note</option><option value="sixteenth">Sixteenth note</option></select></label><label>Timeline zoom · {Math.round(zoom*100)}%<input type="range" min={0.5} max={3} step={0.25} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><div className="song-builder-timeline-sections">{song.sections.map((section,index)=>{const matches=bars.filter(b=>b.sectionId===section.id),first=bars.findIndex(b=>b.sectionId===section.id),meters=[...new Set(matches.map(bar=>bar.meter))],seconds=matches.reduce((sum,bar)=>sum+bar.beats*60/bar.bpm,0),voiceCounts=BUILDER_VOICES.map(voice=>({voice,count:matches.reduce((sum,bar)=>sum+bar.hits.filter(hit=>hit.instrument===voice||(voice==='openhat'&&hit.articulation==='foot-splash')).length,0)})),peak=Math.max(1,...voiceCounts.map(item=>item.count));return <article key={section.id} style={{flexBasis:180*zoom,flexGrow:Math.max(1,matches.reduce((sum,bar)=>sum+bar.beats*60/bar.bpm,0)),borderTopColor:['#e85348','#588371','#a273b5','#c79336'][index%4]}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();try{const source=JSON.parse(e.dataTransfer.getData('application/drumhero-clip')) as {sectionId:string;clipId:string};if(source.sectionId&&source.clipId)onMove(source.sectionId,source.clipId,section.id);}catch{/* Ignore unrelated drags. */}}}><button type="button" onClick={()=>{onSelect(section.id);if(first>=0)onSeek(first);}}><strong>{section.name}</strong><small>{matches.length} bars · {Math.floor(seconds/60)}:{String(Math.round(seconds%60)).padStart(2,'0')} · {section.bpm??song.bpm} BPM{section.tempoRamp?` → ${section.tempoRamp.targetBpm}`:''} · {meters.join(' → ')||section.meter||song.meter} · ×{section.repeats??1}</small></button><div className="song-builder-activity" role="img" aria-label={`Drum activity in ${section.name}: ${voiceCounts.map(item=>`${VOICE_LABEL[item.voice]} ${item.count}`).join(', ')}`}>{voiceCounts.map(item=><span key={item.voice} title={`${VOICE_LABEL[item.voice]} · ${item.count} hits`}><i style={{width:`${item.count/peak*100}%`}}/><small>{VOICE_LABEL[item.voice].slice(0,1)}</small></span>)}</div><button type="button" aria-expanded={!collapsed.includes(section.id)} onClick={()=>setCollapsed(current=>current.includes(section.id)?current.filter(id=>id!==section.id):[...current,section.id])}>{collapsed.includes(section.id)?"Show clips":"Hide clips"}</button><div hidden={collapsed.includes(section.id)}>{sectionClips(section).map(clip=><button type="button" draggable key={clip.id} onDragStart={e=>e.dataTransfer.setData('application/drumhero-clip',JSON.stringify({sectionId:section.id,clipId:clip.id}))} onClick={()=>onSelect(section.id,clip.id)} title={`Drag to another section${clip.layers?.length?`; ${clip.layers.length} independent drum layer(s)`:''}`}>{section.parts.find(p=>p.id===clip.partId)?.name} ×{clip.repeats}{clip.layers?.length?` · +${clip.layers.length} layers`:''}</button>)}</div><small>Drop a clip here to move it into this section.</small></article>;})}</div>{bars.length>0&&<div className="song-builder-loop-ruler" aria-label="Drag loop boundaries"><strong>Loop boundaries · {loopBounds[0].toFixed(2)} → {loopBounds[1].toFixed(2)} measures</strong><div className="song-builder-loop-track"><span style={{left:`${loopBounds[0]/bars.length*100}%`,width:`${(loopBounds[1]-loopBounds[0])/bars.length*100}%`}}/><input aria-label="Timeline loop start" type="range" min={0} max={bars.length} step={snapStep} value={loopBounds[0]} disabled={loopDisabled} onChange={e=>onLoopChange([Math.min(loopBounds[1]-snapStep,snapLoop(Number(e.target.value))),loopBounds[1]])}/><input aria-label="Timeline loop end" type="range" min={0} max={bars.length} step={snapStep} value={loopBounds[1]} disabled={loopDisabled} onChange={e=>onLoopChange([loopBounds[0],Math.max(loopBounds[0]+snapStep,snapLoop(Number(e.target.value)))])}/></div><small>Choose measure, beat, eighth-note, or sixteenth-note snap for the loop handles. Arrow keys adjust the selected boundary.</small></div>}<div className="song-builder-timeline-bars" ref={container}>{bars.map((bar,index)=><button type="button" key={index} style={{minWidth:Math.max(36,54*zoom)}} data-timeline-bar={index} aria-current={activeBar===index?'step':undefined} aria-label={`Seek to measure ${index+1}, ${bar.sectionName}, ${bar.bpm} BPM`} onClick={()=>onSeek(index)}><strong>{index+1}</strong><small>{bar.meter}</small></button>)}</div></section>;
}
