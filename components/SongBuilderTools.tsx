'use client';

import { useEffect, useRef, useState } from 'react';
import type { DrumPart, DrumSong, SongArrangementAutomationPoint, SongFeel, SongSection, SongSectionAutomation, SongSectionTempoPoint } from '@/lib/song-library';
import type { SongInstrument } from '@/lib/types';
import { normalizeSong } from '@/lib/song-library';
import { ARRANGEMENT_CLIPBOARD_KEY, arrangementFlowHints, normalizeTempoAnchors, noteDiff, pasteSections, playabilityHints, suggestLimbAssignments, suggestSticking, type ArrangementClipboard } from '@/lib/song-builder-tools';
import { builderStorageInventory, deleteBuilderBackingFile, deleteBuilderTake, deleteBuilderVersion } from '@/lib/song-builder-storage';
import type { ArrangementBar } from '@/lib/song-builder';
import { sectionClips, songVoiceLabel, varyDrumPart, VOICE_LABEL } from '@/lib/song-builder';
import { drawNotationPage, paginateNotation, type NotationOptions, type NotationView } from '@/lib/song-builder-notation';
import { morphDrumParts } from '@/lib/song-builder-creative';
import type { DrumMixSettings } from '@/lib/audio';
import { suggestReferenceTempoMap, type ReferenceTempoSuggestion } from '@/lib/song-builder-audio-analysis';

type TaskGuideWorkspace = "compose" | "arrange" | "rehearse" | "export";
type TaskGuideStep = { title: string; detail: string; workspace: TaskGuideWorkspace; target: string };
const taskGuides: Record<"transition" | "chart", { name: string; steps: TaskGuideStep[] }> = {
  transition: { name: "Build a section transition", steps: [
    { title: "Choose the section", detail: "Select the groove that leads into the change, then check the next section’s first pattern.", workspace: "compose", target: ".song-builder-grid" },
    { title: "Shape the fill", detail: "Choose a meter-matched fill and set its length, density, and complexity.", workspace: "compose", target: ".song-builder-fill-assistant" },
    { title: "Audition the transition", detail: "Play the surrounding groove, fill, and arrival together before inserting it.", workspace: "compose", target: ".song-builder-fill-assistant" },
    { title: "Rehearse the landing", detail: "Loop the final measures and listen for a clear arrival on the next section’s downbeat.", workspace: "rehearse", target: ".song-builder-toolbar" }
  ] },
  chart: { name: "Prepare a print-ready chart", steps: [
    { title: "Check the arrangement", detail: "Review section order, repeats, tempo changes, and rehearsal cues.", workspace: "arrange", target: ".song-builder-arrangement" },
    { title: "Set the notation view", detail: "Choose drum tab or percussion staff, paper size, spacing, and section breaks.", workspace: "export", target: ".song-builder-notation" },
    { title: "Review page previews", detail: "Check measure density and labels, then adjust measures per line or page breaks if needed.", workspace: "export", target: ".song-builder-export-pages" },
    { title: "Download the chart", detail: "Export the full song or the selected section as PNG or PDF.", workspace: "export", target: ".song-builder-export-actions" }
  ] }
};

export function SongBuilderTaskGuide({ onNavigate }: { onNavigate: (workspace: TaskGuideWorkspace, target: string) => void }) {
  const [guide, setGuide] = useState<keyof typeof taskGuides | "">("");
  const [stepIndex, setStepIndex] = useState(0);
  const active = guide ? taskGuides[guide] : undefined;
  const step = active?.steps[Math.min(stepIndex, active.steps.length - 1)];
  return <section className="song-builder-task-guide" aria-label="Guided Song Builder tasks">
    <div><strong>Guided tasks</strong><p>Follow a focused workflow for a transition or a print-ready chart.</p></div>
    <div className="song-builder-actions"><button type="button" aria-pressed={guide === "transition"} onClick={() => { setGuide("transition"); setStepIndex(0); }}>Build a section transition</button><button type="button" aria-pressed={guide === "chart"} onClick={() => { setGuide("chart"); setStepIndex(0); }}>Prepare a print-ready chart</button>{guide && <button type="button" onClick={() => setGuide("")}>Close guide</button>}</div>
    {active && step && <div className="song-builder-task-guide-step" aria-live="polite"><strong>{active.name} · Step {stepIndex + 1} of {active.steps.length}: {step.title}</strong><p>{step.detail}</p><div className="song-builder-actions"><button type="button" onClick={() => onNavigate(step.workspace, step.target)}>Open this area</button><button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(index => Math.max(0, index - 1))}>Back</button><button type="button" onClick={() => stepIndex + 1 === active.steps.length ? setGuide("") : setStepIndex(index => index + 1)}>{stepIndex + 1 === active.steps.length ? "Finish" : "Next step"}</button></div></div>}
  </section>;
}

export function SongBuilderClipboard({song,section,onChange,onMessage}:{song:DrumSong;section?:SongSection;onChange:(song:DrumSong)=>void;onMessage:(message:string)=>void}){
  const [available,setAvailable]=useState(false);
  useEffect(()=>{const check=()=>{try{setAvailable(!!localStorage.getItem(ARRANGEMENT_CLIPBOARD_KEY));}catch{setAvailable(false);}};check();window.addEventListener('storage',check);window.addEventListener('drum-hero:arrangement-copied',check);return()=>{window.removeEventListener('storage',check);window.removeEventListener('drum-hero:arrangement-copied',check);};},[]);
  const copy=(sections:SongSection[])=>{try{const value:ArrangementClipboard={version:1,sections:structuredClone(sections)};localStorage.setItem(ARRANGEMENT_CLIPBOARD_KEY,JSON.stringify(value));setAvailable(true);onMessage(`${sections.length} section(s) copied. Choose another song and Paste arrangement.`);}catch{onMessage('The arrangement clipboard could not be saved.');}};
  const paste=()=>{try{const value=JSON.parse(localStorage.getItem(ARRANGEMENT_CLIPBOARD_KEY)??'null') as ArrangementClipboard|null;const validated=value?.version===1?normalizeSong({...song,sections:value.sections}):null;if(!validated)throw new Error('Copy an arrangement first.');onChange(pasteSections(song,validated.sections));onMessage('Pasted independent copies with their meter, notes, and expression.');}catch(error){onMessage(error instanceof Error?error.message:'Could not paste this arrangement.');}};
  return <details className="card song-builder-extra"><summary>Arrangement clipboard</summary><div className="song-builder-actions"><button type="button" onClick={()=>copy(song.sections)}>Copy full arrangement</button><button type="button" disabled={!section} onClick={()=>section&&copy([section])}>Copy selected section</button><button type="button" disabled={!available} onClick={paste}>Paste arrangement</button></div><p>Copied material remains available when you switch songs. New IDs keep pasted edits independent.</p></details>;
}

export function SongBuilderTempoMap({song,bars,onChange}:{song:DrumSong;bars:ArrangementBar[];onChange:(song:DrumSong)=>void}){
  const [measure,setMeasure]=useState(1),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[analyzing,setAnalyzing]=useState(false),[suggestion,setSuggestion]=useState<ReferenceTempoSuggestion|null>(null);
  const anchors=song.referenceTempoMap??[];
  const add=()=>{const index=Math.max(0,Math.min(bars.length,measure-1)),beat=bars.slice(0,index).reduce((n,b)=>n+b.beats,0);const proposed=[...anchors.filter(a=>a.beat!==beat),{beat,seconds}];const normalized=normalizeTempoAnchors(proposed);if(normalized.length!==proposed.length){setError('Anchors must advance in time and imply a tempo between 40 and 200 BPM.');return;}onChange({...song,referenceTempoMap:normalized});setError('');};
  const analyze=async(file?:File)=>{if(!file)return;setAnalyzing(true);setError('');setSuggestion(null);try{setSuggestion(await suggestReferenceTempoMap(file));}catch(reason){setError(reason instanceof Error?reason.message:'Could not analyze this reference track.');}finally{setAnalyzing(false);}};
  const applySuggestion=()=>{if(!suggestion)return;const normalized=normalizeTempoAnchors(suggestion.anchors);if(normalized.length!==suggestion.anchors.length){setError('The proposed map contains a tempo interval outside 40–200 BPM. Review its anchors and use manual editing.');return;}onChange({...song,referenceTempoMap:normalized});setSeconds(suggestion.firstBeatSeconds);setSuggestion(null);setError('Reviewed tempo map applied. Add or move anchors to refine the alignment.');};
  return <details className="card song-builder-extra"><summary>Reference-track tempo map</summary><p>Match measure starts to seconds from the backing track’s first downbeat. Add at least two anchors. Drums follow each interval’s tempo; the final tempo continues after the last anchor.</p><div className="song-builder-auto-align"><label>Suggest anchors from a local audio file<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac" disabled={analyzing} onChange={event=>void analyze(event.target.files?.[0])}/></label><p>Analysis runs in this browser. It estimates a first beat and local tempo over eight-second windows; review every suggestion before applying it.</p>{analyzing&&<p role="status">Analyzing reference audio…</p>}{suggestion&&<section aria-label="Suggested reference tempo map"><h4>Suggested map · {suggestion.windows.length} tempo windows</h4><p>First beat near {suggestion.firstBeatSeconds.toFixed(2)} seconds · median estimate {suggestion.medianBpm} BPM.</p><ul>{suggestion.windows.map((window,index)=><li key={window.fromSeconds}>Audio {window.fromSeconds.toFixed(1)}–{window.toSeconds.toFixed(1)} seconds · about {window.bpm} BPM{index===0?' · first window':''}</li>)}</ul><div className="song-builder-actions"><button type="button" onClick={applySuggestion}>Apply reviewed tempo map</button><button type="button" onClick={()=>setSuggestion(null)}>Discard suggestion</button></div></section>}</div><div className="song-builder-tool-fields"><label>Measure boundary<input type="number" min={1} max={bars.length+1} value={measure} onChange={e=>setMeasure(Math.max(1,Math.min(bars.length+1,Number(e.target.value)||1)))}/></label><label>Seconds from first downbeat<input type="number" min={0} step={.01} value={seconds} onChange={e=>setSeconds(Math.max(0,Math.min(3600,Number(e.target.value)||0)))}/></label><button type="button" disabled={!bars.length} onClick={add}>Set tempo anchor</button></div><ul>{anchors.map((anchor,index)=><li key={anchor.beat}>Beat {anchor.beat+1} → {anchor.seconds.toFixed(2)} s{index>0?` · ${(60*(anchor.beat-anchors[index-1].beat)/(anchor.seconds-anchors[index-1].seconds)).toFixed(1)} BPM`:''} <button type="button" onClick={()=>onChange({...song,referenceTempoMap:anchors.filter(a=>a!==anchor)})}>Remove anchor</button></li>)}</ul><button type="button" disabled={!anchors.length} onClick={()=>onChange({...song,referenceTempoMap:[]})}>Clear tempo map</button><p role="status">{error}</p></details>;
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
  const automatic=suggestLimbAssignments(part);
  const autoLimb=(hit:DrumPart['hits'][number])=>automatic[`${hit.instrument}:${hit.step}`]??'right-hand';
  return <details className="song-builder-extra"><summary>Drummer playability · {hints.length} conflicts</summary><p>Assign each simultaneous hit to a hand or foot. Automatic suggestions use sticking where available, alternate hands, and place kick and foot splash on separate feet. These prompts do not block playback or export.</p><button type="button" onClick={()=>onChange(suggestSticking(part))}>Suggest alternating sticking</button><button type="button" onClick={()=>onChange({...part,playabilityDismissed:[]})}>Show dismissed hints</button><div className="song-builder-limb-assignments"><h4>Limb assignments</h4>{[...part.hits].sort((a,b)=>a.step-b.step||a.instrument.localeCompare(b.instrument)).map(hit=>{const key=`${hit.instrument}:${hit.step}`,current=part.limbAssignments?.[key];return <label key={key}>{hit.instrument} · step {hit.step+1}<select aria-label={`${hit.instrument} hit at step ${hit.step+1} limb`} value={current??''} onChange={event=>{const next={...part.limbAssignments};if(event.target.value)next[key]=event.target.value as NonNullable<typeof current>;else delete next[key];onChange({...part,limbAssignments:next});}}><option value="">Auto · {autoLimb(hit).replace('-', ' ')}</option><option value="right-hand">Right hand</option><option value="left-hand">Left hand</option><option value="right-foot">Right foot</option><option value="left-foot">Left foot</option></select></label>;})}</div><ul>{hints.map(h=><li key={h.id}>Step {h.step+1}: {h.message} <button type="button" onClick={()=>onChange({...part,playabilityDismissed:[...dismissed,h.id]})}>Dismiss</button></li>)}</ul></details>;
}

export function SongBuilderArrangementFeedback({song,bars}:{song:DrumSong;bars:ArrangementBar[]}){
  const [styleFocus,setStyleFocus]=useState<'auto'|'pop-rock'|'funk-hiphop'|'jazz-blues'|'metal-punk'>('auto');
  const hints=arrangementFlowHints(bars);
  if(!bars.length)return null;
  const tags=`${song.title} ${song.tags.join(' ')} ${song.sections.map(section=>`${section.name} ${section.feel?.kind??''}`).join(' ')}`.toLowerCase();
  const style=styleFocus==='auto'?/jazz|blues|shuffle/.test(tags)?'jazz-blues':/funk|hip.?hop|hiphop/.test(tags)?'funk-hiphop':/metal|punk/.test(tags)?'metal-punk':'pop-rock':styleFocus;
  const bySection=song.sections.map(section=>({section,bars:bars.filter(bar=>bar.sectionId===section.id)}));
  const styleHints:Array<{id:string;message:string}>=[];
  if(style==='pop-rock'||style==='metal-punk'){
    bySection.filter(item=>item.section.kind==='chorus'&&item.bars.length).forEach(item=>{
      const index=bySection.indexOf(item),previousVerse=[...bySection.slice(0,index)].reverse().find(candidate=>candidate.section.kind==='verse'&&candidate.bars.length);
      if(previousVerse){const verseDensity=previousVerse.bars.reduce((sum,bar)=>sum+bar.hits.length,0)/previousVerse.bars.length,chorusDensity=item.bars.reduce((sum,bar)=>sum+bar.hits.length,0)/item.bars.length;if(chorusDensity<=verseDensity)styleHints.push({id:`chorus-lift:${item.section.id}`,message:`${item.section.name}: consider a cymbal, kick, or density lift to distinguish the chorus from ${previousVerse.section.name}; the current average hit count does not rise.`});}
      const first=item.bars[0];if(first&&!first.hits.some(hit=>['crash','ride','openhat'].includes(hit.instrument)))styleHints.push({id:`chorus-arrival:${item.section.id}`,message:`${item.section.name}: there is no cymbal hit on its first measure. Add one if you want a stronger band arrival.`});
    });
  }else if(style==='funk-hiphop'){
    bySection.filter(item=>item.section.kind==='verse'&&item.bars.length).forEach(item=>{const index=bySection.indexOf(item),prior=[...bySection.slice(0,index)].reverse().find(candidate=>candidate.section.kind==='verse'&&candidate.bars.length);if(prior){const density=(rows:ArrangementBar[])=>rows.reduce((sum,bar)=>sum+bar.hits.length,0)/rows.length,base=density(prior.bars),current=density(item.bars);if(Math.abs(current-base)>Math.max(3,base*.4))styleHints.push({id:`pocket:${item.section.id}`,message:`${item.section.name}: its note density differs from ${prior.section.name} by more than 40%. Check whether the pocket change is intentional.`});}});
  }else if(style==='jazz-blues'){
    bySection.filter(item=>item.bars.length&&(item.section.feel?.kind==='swing'||item.section.feel?.kind==='shuffle'||style==='jazz-blues')).forEach(item=>{const timekeeping=item.bars.reduce((sum,bar)=>sum+bar.hits.filter(hit=>['ride','hihat','openhat'].includes(hit.instrument)).length,0),beats=item.bars.reduce((sum,bar)=>sum+bar.beats,0);if(timekeeping<beats*.5)styleHints.push({id:`timekeeping:${item.section.id}`,message:`${item.section.name}: fewer than half a ride/hi-hat timekeeping hits per beat on average. Add or keep a pulse if the section should feel flowing.`});});
  }
  const allHints=[...hints,...styleHints];
  return <details className="card song-builder-extra"><summary>Arrangement flow check · {allHints.length} notes</summary><p>Checks for long silent passages, large density shifts between sections, and abrupt tempo changes, then adds optional style-aware prompts. These suggestions never block playback or export.</p><label>Style focus<select value={styleFocus} onChange={event=>setStyleFocus(event.target.value as typeof styleFocus)}><option value="auto">Auto · {style.replace('-', ' / ')}</option><option value="pop-rock">Pop / rock</option><option value="funk-hiphop">Funk / hip-hop</option><option value="jazz-blues">Jazz / blues</option><option value="metal-punk">Metal / punk</option></select></label>{allHints.length?<ul>{allHints.map(hint=><li key={hint.id}>{hint.message}</li>)}</ul>:<p>No large flow or selected-style changes detected by these simple checks.</p>}</details>;
}

export function SongBuilderArrangementSuggestions({song,onApply,onPreview,previewing}:{song:DrumSong;onApply:(song:DrumSong)=>void;onPreview:(sections:SongSection[])=>void;previewing:boolean}){
  const [form,setForm]=useState<'aaba'|'verse-chorus'|'abac'>('verse-chorus');
  const [sourceId,setSourceId]=useState('');
  const [feel,setFeel]=useState<'keep'|'straight'|'swing'|'shuffle'>('keep');
  const [preview,setPreview]=useState<SongSection[]|null>(null);
  const source=song.sections.find(section=>section.id===sourceId)??song.sections.find(section=>section.kind==='verse')??song.sections[0];
  const prepare=(section:SongSection,name:string,kind:SongSection['kind'],variant=false):SongSection=>{
    const copy=structuredClone(section);
    const partIds=new Map(section.parts.map(part=>[part.id,crypto.randomUUID()]));
    copy.id=crypto.randomUUID();copy.name=name;copy.kind=kind;copy.repeats=1;copy.endingGroup=undefined;copy.endingPass=undefined;copy.endingRepeats=undefined;
    copy.parts=section.parts.map(part=>{const next=variant?varyDrumPart(part,'half-time'):structuredClone(part);return {...next,id:partIds.get(part.id)!,sourceId:undefined,linkedBaseId:undefined,linkOverrides:undefined,linkRemoved:undefined};});
    copy.clips=sectionClips(section).map(clip=>({...structuredClone(clip),id:crypto.randomUUID(),partId:partIds.get(clip.partId)!,layers:clip.layers?.flatMap(id=>partIds.has(id)?[partIds.get(id)!]:[]),overrides:clip.overrides?{...clip.overrides,mutedLayers:clip.overrides.mutedLayers?.flatMap(id=>partIds.has(id)?[partIds.get(id)!]:[]),soloLayer:clip.overrides.soloLayer?partIds.get(clip.overrides.soloLayer):undefined}:undefined,repeatVariants:clip.repeatVariants?.filter(item=>partIds.has(item.partId)).map(item=>({...item,partId:partIds.get(item.partId)!}))}));
    copy.rehearsalCues=section.rehearsalCues?.map(cue=>({...cue,id:crypto.randomUUID()}));
    const selectedFeel:SongFeel|undefined=feel==='keep'?copy.feel:{kind:feel,amount:feel==='shuffle'?66.7:feel==='swing'?58:50};
    copy.feel=selectedFeel;
    return copy;
  };
  const generate=()=>{
    if(!source)return;
    const existingB=song.sections.find(section=>section.id!==source.id&&(section.kind==='chorus'||section.kind==='bridge'));
    const sourceB=song.sections.find(section=>section.id!==source.id&&section.kind==='chorus')??existingB;
    const sourceC=song.sections.find(section=>section.id!==source.id&&section.kind==='bridge')??song.sections.find(section=>section.id!==source.id&&section.kind==='outro');
    const b=existingB??prepare(source,'B · contrasting half-time',form==='aaba'?'bridge':'chorus',true);
    const c=sourceC??prepare(source,'C · lighter variation','other',true);
    const sequence=form==='aaba'
      ? [prepare(source,`A · ${source.name}`,source.kind),prepare(source,`A reprise · ${source.name}`,source.kind),prepare(b,`B · ${b.name}`,b.kind),prepare(source,`A return · ${source.name}`,source.kind)]
      : form==='verse-chorus'
        ? [prepare(source,`Verse · ${source.name}`,'verse'),prepare(sourceB??b,`Chorus · ${(sourceB??b).name}`,'chorus'),prepare(source,`Verse reprise · ${source.name}`,'verse'),prepare(sourceB??b,`Chorus return · ${(sourceB??b).name}`,'chorus')]
        : [prepare(source,`A · ${source.name}`,source.kind),prepare(b,`B · ${b.name}`,b.kind),prepare(source,`A return · ${source.name}`,source.kind),prepare(c,`C · ${c.name}`,c.kind)];
    setPreview(sequence);
  };
  const apply=()=>{
    if(!preview)return;
    try{if(song.sections.length+preview.length>32)throw new Error('This form needs more room. Remove a few sections first.');onApply({...song,sections:[...song.sections,...preview]});setPreview(null);}
    catch(error){window.alert(error instanceof Error?error.message:'Could not add this arrangement form.');}
  };
  return <details className="card song-builder-extra"><summary>Arrangement form ideas</summary><p>Generate a complete section sequence from a groove you choose. Repeated sections get independent pattern copies.</p><div className="song-builder-tool-fields"><label>Starting groove<select value={source?.id??''} onChange={event=>{setSourceId(event.target.value);setPreview(null);}}>{song.sections.map(section=><option key={section.id} value={section.id}>{section.name} · {section.kind}</option>)}</select></label><label>Song form<select value={form} onChange={event=>{setForm(event.target.value as typeof form);setPreview(null);}}><option value="verse-chorus">Verse · chorus · verse · chorus</option><option value="aaba">AABA</option><option value="abac">ABAC</option></select></label><label>Feel for preview<select value={feel} onChange={event=>{setFeel(event.target.value as typeof feel);setPreview(null);}}><option value="keep">Keep each section feel</option><option value="straight">Straight</option><option value="swing">Swing</option><option value="shuffle">Shuffle</option></select></label></div><button type="button" disabled={!source} onClick={generate}>Generate form preview</button>{preview&&<section className="song-builder-arrangement-preview"><h3>Preview · {preview.length} new sections</h3><ol>{preview.map((section,index)=><li key={section.id}><strong>{section.name}</strong> · {section.parts.length} patterns · {section.parts.reduce((sum,part)=>sum+part.hits.length,0)} hits · {section.meter??song.meter} · {section.feel?.kind??'straight'}</li>)}</ol><button type="button" aria-pressed={previewing} onClick={()=>onPreview(preview)}>{previewing?'Stop audio preview':'Hear this form'}</button><button type="button" disabled={song.sections.length+preview.length>32} onClick={apply}>Append this form to the song</button><button type="button" onClick={()=>setPreview(null)}>Discard preview</button></section>}</details>;
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

export function SongBuilderHealthCheck({song,bars,mix,sampleNames,notation,onNavigate}:{song:DrumSong;bars:ArrangementBar[];mix:DrumMixSettings;sampleNames:Partial<Record<SongInstrument,string>>;notation:NotationOptions;onNavigate:(workspace:TaskGuideWorkspace,target:string)=>void}){
  const findings:Array<{kind:"review"|"info";text:string;workspace:TaskGuideWorkspace;target:string}>=[];
  for(const section of song.sections){
    const clips=sectionClips(section),used=new Set(clips.flatMap(clip=>[clip.partId,...(clip.layers??[]),...(clip.repeatVariants??[]).map(variant=>variant.partId)]));
    if(!clips.length)findings.push({kind:"review",text:`${section.name} has no clips, so it contributes no notes to playback or exports.`,workspace:"arrange",target:".song-builder-arrangement"});
    const orphaned=section.parts.filter(part=>!used.has(part.id));
    if(orphaned.length)findings.push({kind:"info",text:`${section.name} has ${orphaned.length} unused pattern${orphaned.length===1?"":"s"}; they stay in the editor but are not played.`,workspace:"compose",target:".song-builder-pattern-editor"});
    const empty=section.parts.filter(part=>used.has(part.id)&&part.hits.length===0);
    if(empty.length)findings.push({kind:"review",text:`${section.name} plays ${empty.length} empty pattern${empty.length===1?"":"s"}. Check whether the silence is intentional.`,workspace:"compose",target:".song-builder-pattern-editor"});
  }
  const silent=bars.filter(bar=>bar.hits.length===0);
  if(bars.length&&!bars.some(bar=>bar.hits.length))findings.push({kind:"review",text:"The full arrangement contains no drum hits; audio and MIDI exports will be silent.",workspace:"compose",target:".song-builder-pattern-editor"});
  const dense=bars.filter(bar=>new Set(bar.hits.map(hit=>hit.step)).size>=16);
  if(dense.length)findings.push({kind:"review",text:`${dense.length} measure${dense.length===1?"":"s"} contain 16 or more active grid positions; inspect notation spacing before printing.`,workspace:"export",target:".song-builder-notation"});
  const changes=bars.flatMap((bar,index)=>index>0&&bar.sectionId!==bars[index-1]?.sectionId&&Math.abs(bar.bpm-bars[index-1]!.bpm)/bars[index-1]!.bpm>=0.15?[`${bars[index-1]!.sectionName} → ${bar.sectionName} (${Math.round(bars[index-1]!.bpm)} → ${Math.round(bar.bpm)} BPM)`]:[]);
  if(changes.length)findings.push({kind:"review",text:`Abrupt section tempo changes: ${[...new Set(changes)].slice(0,4).join('; ')}.`,workspace:"arrange",target:".song-builder-arrangement"});
  const missing=new Set<SongInstrument>();
  for(const bar of bars)for(const hit of bar.hits){const voice=hit.articulation==='foot-splash'?'openhat':hit.instrument;if((bar.kitMix??mix).sampleIndex[voice]<0&&!sampleNames[voice])missing.add(voice);}
  if(missing.size)findings.push({kind:"review",text:`Custom samples are missing for ${[...missing].map(voice=>VOICE_LABEL[voice]).join(', ')}. Choose a built-in sound or restore those samples.`,workspace:"rehearse",target:".song-builder-mixer"});
  if(paginateNotation(bars,notation).length>30)findings.push({kind:"info",text:"The full chart exceeds the 30-page PNG limit. Export a PDF or select a section for PNG.",workspace:"export",target:".song-builder-notation"});
  const longSeconds=bars.reduce((sum,bar)=>sum+bar.beats*60/bar.bpm,0);
  if(longSeconds>180)findings.push({kind:"info",text:`The arrangement runs about ${Math.round(longSeconds/60)} minutes. Export long audio in sections; aligned stem archives have a three-minute limit.`,workspace:"export",target:".song-builder-notation"});
  const visible=findings.slice(0,24);
  return <details className="card song-builder-health-check"><summary>Project health · {visible.length ? `${visible.filter(item=>item.kind==="review").length} review items` : "ready to review"}</summary><p>Checks that arrangement content is connected and gives a quick pre-export review. Findings are suggestions; intentional silence and unused sketches are fine.</p>{visible.length?<ul>{visible.map((finding,index)=><li key={`${finding.text}:${index}`}><span className={`song-builder-health-${finding.kind}`}>{finding.kind==="review"?"Review":"Info"}</span> {finding.text} <button type="button" onClick={()=>onNavigate(finding.workspace,finding.target)}>Open</button></li>)}</ul>:<p>No empty patterns, crowded measures, or export-size issues found.</p>}{silent.length>0&&silent.length<bars.length&&<p>{silent.length} silent measure{silent.length===1?"":"s"} across the song may be intentional breaks.</p>}</details>;
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
  return <details className="card song-builder-extra" onToggle={e=>setShow(e.currentTarget.open)}><summary>Export preparation · {pages.length} pages</summary><div className="song-builder-tool-fields"><label>Paper size<select value={options.paperSize??'letter'} onChange={e=>onChange({...options,paperSize:e.target.value as 'letter'|'a4'})}><option value="letter">US Letter</option><option value="a4">A4</option></select></label><label>Orientation<select value={options.orientation??'landscape'} onChange={e=>onChange({...options,orientation:e.target.value as 'portrait'|'landscape'})}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label className="song-builder-check"><input type="checkbox" checked={options.largePrint===true} onChange={e=>onChange({...options,largePrint:e.target.checked})}/>Large print · fewer measures per page</label><label className="song-builder-check"><input type="checkbox" checked={options.highContrast===true} onChange={e=>onChange({...options,highContrast:e.target.checked})}/>High contrast</label></div><p>{warnings.length?`${warnings.length} measure(s) may be crowded or have long labels. Use fewer measures per line/page and shorter annotations.`:'No crowded measures or long labels detected.'} Preview every page before downloading.</p>{warnings.length>0&&<p>Check measures {warnings.slice(0,24).map(b=>b.number).join(', ')}.</p>}{pages.length>12&&<label>Page group<select value={Math.min(batch,Math.floor((pages.length-1)/12))} onChange={e=>setBatch(Number(e.target.value))}>{Array.from({length:Math.ceil(pages.length/12)},(_,i)=><option key={i} value={i}>{i*12+1}–{Math.min(pages.length,(i+1)*12)}</option>)}</select></label>}{show&&<div className="song-builder-export-pages">{pages.slice(safeBatch*12,safeBatch*12+12).map((_,i)=><figure key={safeBatch*12+i}><SheetThumbnail song={song} bars={bars} view={view} index={safeBatch*12+i} options={options}/><figcaption>Page {safeBatch*12+i+1}</figcaption></figure>)}</div>}</details>;
}

export function SongBuilderTempoAutomation({section,baseBpm,measureCount,onChange}:{section:SongSection|null;baseBpm:number;measureCount:number;onChange:(next:SongSection)=>void}){
  const [measure,setMeasure]=useState(1),[bpm,setBpm]=useState(section?.tempoPoints?.find(point=>point.measure===1)?.bpm??section?.bpm??baseBpm),[curve,setCurve]=useState<SongSectionTempoPoint['curve']>(section?.tempoPoints?.find(point=>point.measure===1)?.curve??'linear');
  if(!section)return null;
  const points=section.tempoPoints??[],maxMeasure=Math.max(1,measureCount),safeMeasure=Math.max(1,Math.min(maxMeasure,measure));
  const selectMeasure=(next:number)=>{const bounded=Math.max(1,Math.min(maxMeasure,next)),point=points.find(item=>item.measure===bounded);setMeasure(bounded);setBpm(point?.bpm??section.bpm??baseBpm);setCurve(point?.curve??'linear');};
  const savePoint=()=>{const existing=points.find(point=>point.measure===safeMeasure),nextPoint:SongSectionTempoPoint={id:existing?.id??crypto.randomUUID(),measure:safeMeasure,bpm:Math.max(40,Math.min(200,Math.round(bpm||baseBpm))),curve};onChange({...section,tempoRamp:undefined,tempoPoints:[...points.filter(point=>point.measure!==safeMeasure),nextPoint].sort((a,b)=>a.measure-b.measure)});};
  return <details className="card song-builder-tempo-automation"><summary>Tempo points · {points.length||'section ramp'}</summary><p>Set BPM points at measures in this section. Curves shape the transition to the next point; playback, notation, and MIDI export follow the same measure tempo.</p><div className="song-builder-tool-fields"><label>Measure<select value={safeMeasure} onChange={event=>selectMeasure(Number(event.target.value))}>{Array.from({length:maxMeasure},(_,index)=><option key={index+1} value={index+1}>Measure {index+1}</option>)}</select></label><label>Tempo · BPM<input type="number" min={40} max={200} value={bpm} onChange={event=>setBpm(Math.max(40,Math.min(200,Number(event.target.value)||40)))}/></label><label>Curve to next point<select value={curve} onChange={event=>setCurve(event.target.value as SongSectionTempoPoint['curve'])}><option value="linear">Linear</option><option value="ease-in">Accelerate into the change</option><option value="ease-out">Ease out of the change</option><option value="ease-in-out">Ease in and out</option></select></label><button type="button" onClick={savePoint}>{points.some(point=>point.measure===safeMeasure)?'Update tempo point':'Add tempo point'}</button></div>{points.length>0?<ul>{points.map(point=><li key={point.id}><span>Measure {point.measure} · {point.bpm} BPM · {point.curve}</span><button type="button" onClick={()=>{if(measure===point.measure){const next=points.find(item=>item.measure!==point.measure);setBpm(next?.bpm??section.bpm??baseBpm);setCurve(next?.curve??'linear');}onChange({...section,tempoPoints:points.filter(item=>item.id!==point.id)});}}>Remove</button></li>)}</ul>:<small>Adding a point replaces the section’s simple ramp. Without points, the existing section ramp is used.</small>}</details>;
}

export function SongBuilderProjectChecklist({items,onChange}:{items:Array<{id:string;label:string;done:boolean;custom?:boolean}>;onChange:(items:Array<{id:string;label:string;done:boolean;custom?:boolean}>)=>void}){
  const [draft,setDraft]=useState(''),completed=items.filter(item=>item.done).length;
  return <details className="card song-builder-project-checklist"><summary>Project checklist · {completed}/{items.length} complete</summary><p>Track the finishing passes for this song. Progress is saved with the song’s builder settings and project backup.</p><progress max={Math.max(1,items.length)} value={completed} aria-label={`${completed} of ${items.length} project checklist items complete`}/><ul>{items.map(item=><li key={item.id}><label><input type="checkbox" checked={item.done} onChange={event=>onChange(items.map(current=>current.id===item.id?{...current,done:event.target.checked}:current))}/><span>{item.label}</span></label>{item.custom&&<button type="button" aria-label={`Remove ${item.label}`} onClick={()=>onChange(items.filter(current=>current.id!==item.id))}>Remove</button>}</li>)}</ul><form onSubmit={event=>{event.preventDefault();const label=draft.trim().slice(0,100);if(!label||items.length>=40)return;onChange([...items,{id:crypto.randomUUID(),label,done:false,custom:true}]);setDraft('');}}><label>Add project task<input maxLength={100} value={draft} onChange={event=>setDraft(event.target.value)} placeholder="e.g. Confirm the ending live"/></label><button type="submit" disabled={!draft.trim()||items.length>=40}>Add task</button></form><button type="button" onClick={()=>onChange(items.map(item=>({...item,done:false})))}>Reset checklist</button></details>;
}
