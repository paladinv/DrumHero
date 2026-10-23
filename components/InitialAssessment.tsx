'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assessmentComparison, assessmentContent, assessmentDomains, assessmentEducatorReview, assessmentPattern, assessmentProbeVariant, assessmentQuestionsForResult, assessmentRecommendation, assessmentRecommendationDetails, assessmentTier, appendAssessment, nextAssessmentProbe, shuffledAssessmentChoices, type AssessmentAdaptation, type AssessmentInput, type AssessmentProbe, type AssessmentResult } from '@/lib/assessment';
import { AssessmentPlayer, type AssessmentPhase } from '@/lib/assessment-player';
import { getTrainerDeviceProfile, parseTrainerState, trainerStorageKey } from '@/lib/trainer';
import { compactNotation } from '@/lib/song-compact-notation';
import { sightNotationBars, type SightExercise } from '@/lib/sight-reading';
import type { DrumSong } from '@/lib/song-library';
import { lessons } from '@/lib/curriculum';
import type { Instrument } from '@/lib/types';
import { useProgress } from './ProgressProvider';
import { useLocalization } from './LocalizationProvider';
import { useAssessment } from './useAssessment';
import styles from './InitialAssessment.module.css';
const voices: Instrument[]=['kick','snare','hihat','tom','crash'];
const keys=['Space','KeyF','KeyJ','KeyK','KeyL'];
const song: DrumSong={id:'assessment',title:'Assessment notation',artist:'Drum Hero',difficulty:'Beginner',bpm:60,meter:'4/4',tags:[],notes:'',sections:[],createdAt:'',updatedAt:''};
export function AssessmentNotation({probe,adaptation,bars=1}:{probe:AssessmentProbe;adaptation:AssessmentAdaptation;bars?:1|4}) {
  const host=useRef<HTMLDivElement>(null);
  const pattern=useMemo(()=>assessmentPattern(probe,adaptation,bars),[probe,adaptation,bars]);
  useEffect(()=>{
    const exercise:SightExercise={version:1,seed:0,settings:{level:'Beginner',bpm:probe.bpm,bars,meter:'4/4',triplets:probe.subdivision===12,snareOnly:false,focusVoice:'mixed',focusRhythm:'mixed',style:'varied'},subdivision:probe.subdivision,beatsPerBar:4,stepsPerBar:probe.subdivision,hits:pattern.hits};
    const {canvas}=compactNotation(song,sightNotationBars(exercise),'staff',0);
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Percussion notation. Counted note descriptions follow.');host.current?.replaceChildren(canvas);
  },[pattern,probe,bars]);
  return <><div ref={host} className={styles.notes}/><details><summary>Counted note descriptions</summary><p>{pattern.hits.map(h=>`Bar ${Math.floor(h.step/probe.subdivision)+1}, beat ${(h.step%probe.subdivision)*4/probe.subdivision+1}: ${h.instrument}${h.accent?', accent':''}`).join('. ')}</p></details></>;
}
export function InitialAssessment(){const {profileId,hydrated}=useProgress();return hydrated?<AssessmentSession key={profileId} profileId={profileId}/>:<p role="status">Loading assessment…</p>;}
function AssessmentSession({profileId}:{profileId:string}) {
  const {t,formatDate}=useLocalization();
  const {store,ready,save,error}=useAssessment(profileId);
  const [source,setSource]=useState<AssessmentInput>('keyboard');
  const [adaptation,setAdaptation]=useState<AssessmentAdaptation>('standard');
  const [stage,setStage]=useState<'setup'|'tasks'|'results'>('setup');
  const [draft,setDraft]=useState<AssessmentResult|null>(null);
  const [phase,setPhase]=useState<AssessmentPhase>('idle');
  const [beat,setBeat]=useState(0);
  const [message,setMessage]=useState('');
  const [checked,setChecked]=useState(false);
  const [soundEnabled,setSoundEnabled]=useState(false);
  const [checkHits,setCheckHits]=useState(0);
  const [inputs,setInputs]=useState<{id:string;name:string}[]>([]);
  const [midiId,setMidiId]=useState('');
  const midi=useRef<MIDIAccess|null>(null);
  const alive=useRef(true);
  const player=useMemo(()=>new AssessmentPlayer((next,count)=>{setPhase(next);setBeat(count);}),[]);
  const resultHeading=useRef<HTMLHeadingElement>(null);
  const padsRef=useRef<HTMLDivElement>(null);
  const active=['loading','demonstration','count-in','playing'].includes(phase);
  const probe=draft?nextAssessmentProbe(draft):null;
  const probeVariantIndex=probe&&draft&&probe.alternates?.length?(Array.from(draft.id).reduce((n,c)=>n+c.charCodeAt(0),0)+draft.attempts.filter(a=>a.probeId===probe.id).length)%(probe.alternates.length+1):0;
  const question=draft&&!probe?assessmentQuestionsForResult(draft).find(q=>!draft.answers.some(a=>a.questionId===q.id)&&!draft.skipped.includes(q.id)):undefined;
  const choices=useMemo(()=>question&&draft?shuffledAssessmentChoices(question,Array.from(draft.id).reduce((n,c)=>n+c.charCodeAt(0),0)+assessmentContent.questions.indexOf(question)):[],[question,draft]);
  const finish=useCallback((result:AssessmentResult,early=false)=>{
    player.stop();setMessage('Assessment complete. Review your results below.');const final={...result,playedAt:new Date().toISOString(),endedEarly:early};setDraft(final);save(appendAssessment(store,final));setStage('results');
  },[player,save,store]);
  useEffect(()=>{if(stage==='tasks'&&draft&&!probe&&!question){const id=setTimeout(()=>finish(draft),0);return()=>clearTimeout(id);}},[stage,draft,probe,question,finish]);
  useEffect(()=>{if(stage==='results')resultHeading.current?.focus();},[stage]);
  useEffect(()=>{if(phase==='playing'&&source==='keyboard')padsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();},[phase,source]);
  useEffect(()=>{
    alive.current=true;
    const interrupt=()=>{if(document.hidden&&player.phase!=='idle'){player.stop(true);setMessage('Interrupted probe discarded. Restart it with a fresh count-in.');}};
    document.addEventListener('visibilitychange',interrupt);
    const blur=()=>{if(player.phase==='playing'||player.phase==='count-in')player.stop(true);};window.addEventListener('blur',blur);
    return()=>{alive.current=false;document.removeEventListener('visibilitychange',interrupt);window.removeEventListener('blur',blur);player.stop();if(midi.current){midi.current.inputs.forEach(i=>i.onmidimessage=null);midi.current.onstatechange=null;}};
  },[player]);
  const acceptHit=useCallback((voice:Instrument,input:AssessmentInput,at=performance.now(),velocity?:number)=>{
    if(input!==source)return;
    if(stage==='setup'){setCheckHits(n=>n+1);if(soundEnabled)setChecked(true);}
    player.hit(voice,at,velocity);
  },[source,stage,player,soundEnabled]);
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      if(source!=='keyboard'||event.repeat||event.ctrlKey||event.altKey||event.metaKey||(event.target instanceof Element&&event.target.closest('input,select,textarea,[contenteditable],a,button:not([data-assessment-pad])')))return;
      const index=keys.indexOf(event.code);if(index>=0){event.preventDefault();acceptHit(voices[index],'keyboard');}
    };window.addEventListener('keydown',down);return()=>window.removeEventListener('keydown',down);
  },[acceptHit,source]);
  useEffect(()=>{
    if(!midi.current)return;
    midi.current.inputs.forEach(input=>{input.onmidimessage=source==='midi'&&input.id===midiId?event=>{
      const data=event.data;if(!data||(data[0]&0xf0)!==0x90||data[2]===0)return;
      let voice:Instrument|null=null;try{voice=getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))),`midi:${midiId}`).midiMap[data[1]];}catch{/* Default mapping remains available through Trainer. */}
      if(voice)acceptHit(voice,'midi',event.timeStamp,data[2]);
    }:null;});
  },[midiId,source,inputs,acceptHit,profileId]);
  const connect=async()=>{
    try{
      if(!navigator.requestMIDIAccess)throw new Error('MIDI is unavailable in this browser. Choose keyboard or touch.');
      const access=await navigator.requestMIDIAccess({sysex:false});if(!alive.current)return;midi.current=access;
      const refresh=()=>{
        const available=[...access.inputs.values()].filter(i=>i.state==='connected');setInputs(available.map(i=>({id:i.id,name:i.name??'MIDI input'})));
        setMidiId(current=>{if(current&&!available.some(i=>i.id===current)){player.stop(true);setChecked(false);setMessage('MIDI disconnected. Reconnect to restart the current probe.');}return available.some(i=>i.id===current)?current:available[0]?.id??'';});
      };access.onstatechange=refresh;refresh();
    }catch(err){setMessage(err instanceof Error?err.message:'Could not connect MIDI.');}
  };
  const enable=async()=>{try{await player.check();if(!alive.current)return;setSoundEnabled(true);padsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();setMessage('Strike a pad or key. Check that you can hear it.');}catch(err){setMessage(String(err));}};
  const begin=()=>{
    if(!checked||!ready)return;
    setDraft({version:1,id:crypto.randomUUID(),playedAt:new Date().toISOString(),input:source,inputProfile:source==='midi'?`midi:${midiId}`:source,adaptation,attempts:[],answers:[],skipped:[],endedEarly:false});player.stop();setStage('tasks');setMessage('');
  };
  const startProbe=async()=>{
    if(!probe||!draft)return;if(source==='midi'&&midi.current?.inputs.get(midiId)?.state!=='connected'){setMessage('Reconnect MIDI before restarting this probe.');return;}
    try{
      const state=parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
      const correction=getTrainerDeviceProfile(state,draft.inputProfile).latencyMs;
      await player.play(probe,adaptation,correction,probeVariantIndex,result=>{setDraft(current=>current?{...current,attempts:[...current.attempts,result]}:current);setMessage(result.dynamicsContrast===null&&probe.domain==='dynamics'?'Dynamics unmeasured: the input did not provide varied velocities.':result.passed?'Tier demonstrated.':'Try once more, or skip this domain.');});
    }catch(err){setMessage(String(err));}
  };
  const lesson=draft?lessons.find(l=>l.id===assessmentRecommendation(draft)):undefined;
  const comparison=draft?assessmentComparison(draft,store.results):null;
  return <div className={styles.root}>
    <p>{t('This is a starting-point estimate, not a certification. Lessons stay available and assessment results stay separate from practice scores.')}</p>
    {stage==='setup'&&<section className="card"><fieldset disabled={active}><legend>{t('Assessment setup')}</legend><div className={styles.controls}>
      <label>{t('Input')}<select value={source} onChange={e=>{player.stop();setSource(e.target.value as AssessmentInput);setChecked(false);setSoundEnabled(false);}}><option value="keyboard">{t('Keyboard')}</option><option value="touch">{t('Touch pads')}</option><option value="midi">MIDI</option></select></label>
      <label>{t('Access needs')}<select value={adaptation} onChange={e=>setAdaptation(e.target.value as AssessmentAdaptation)}><option value="standard">{t('Full kit')}</option><option value="hands-only">{t('Hands only')}</option><option value="single-voice">{t('Single voice')}</option></select></label>
      {source==='midi'&&<><button onClick={connect}>{t('Connect MIDI')}</button><label>{t('MIDI device')}<select value={midiId} onChange={e=>{setMidiId(e.target.value);setChecked(false);}}>{inputs.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label></>}
    </div><p>{t('Hands-only uses tom instead of kick. Single-voice omits coordination. Dynamics is measured only with varied MIDI velocities.')}</p><Link href="/trainer?setup=1">{t('Input mapping and timing calibration')}</Link>
    <div className={styles.actions}><button onClick={enable}>{t('Enable sound and check input')}</button><button disabled={!checked||!ready||(source==='midi'&&!midiId)} onClick={begin}>{t('Begin assessment')}</button></div><p>{t('Unscored input check')}: {checkHits} {t('hits received')}{checked?' ✓':''}</p></fieldset></section>}
    {stage==='tasks'&&draft&&probe&&<section className="card"><h2>{t(probe.name)} · {probe.domain} {probe.tier}/{probe.domain==='dynamics'?1:3}</h2><p>{probe.bpm} BPM · {t('Four bars. Listen to the demonstration, follow four count-in beats, then play with the metronome.')}</p><AssessmentNotation probe={assessmentProbeVariant(probe,probeVariantIndex)} adaptation={adaptation}/><div className={styles.actions}><button disabled={active} onClick={startProbe}>{phase==='paused'?t('Restart interrupted probe'):t('Demonstrate and play')}</button><button onClick={()=>{player.stop();setDraft({...draft,skipped:[...draft.skipped,probe.id]});}}>{t('Skip this domain')}</button></div></section>}
    {stage==='tasks'&&draft&&question&&<section className="card"><h2>{t(question.kind==='listening'?'Listening question':'Notation question')}</h2><p>{t(question.prompt)}</p>{question.kind==='reading'&&<AssessmentNotation probe={assessmentContent.probes.find(p=>p.id===question.probeId)!} adaptation="single-voice"/>}{question.kind==='listening'&&<button disabled={active} onClick={async()=>{try{await player.play(assessmentContent.probes.find(p=>p.id===question.probeId)!,'standard',0);}catch(err){setMessage(String(err));}}}>{t('Play rhythm')}</button>}<div className={styles.actions}>{choices.map(c=><button disabled={active} key={c.choice} onClick={()=>{player.stop();setDraft({...draft,answers:[...draft.answers,{questionId:question.id,choice:c.choice}]});}}>{t(c.label)}</button>)}<button onClick={()=>{player.stop();setDraft({...draft,skipped:[...draft.skipped,question.id]});}}>{t('Skip question')}</button></div></section>}
    <p className={styles.status} role="status">{t(phase==='demonstration'?'Listen to the demonstration':phase==='count-in'?'Count-in':phase==='playing'?'Play':phase==='paused'?'Paused — restart this probe':phase==='loading'?'Preparing audio':message)}{phase==='count-in'||phase==='playing'?` · ${beat}`:''}</p>
    {stage!=='results'&&<div ref={padsRef} className={styles.pads}>{voices.filter(v=>adaptation!=='single-voice'||v==='snare').filter(v=>adaptation!=='hands-only'||v!=='kick').map(voice=><button key={voice} data-assessment-pad disabled={source==='midi'||(stage==='tasks'&&phase!=='playing')} onPointerDown={e=>{e.preventDefault();acceptHit(voice,source);}} onClick={e=>{if(e.detail===0)acceptHit(voice,source);}}>{t(voice)} · {keys[voices.indexOf(voice)].replace('Key','')}</button>)}</div>}
    {stage==='tasks'&&draft&&<div className={styles.actions}>{active&&<button onClick={()=>player.stop(true)}>{t('Pause and discard this attempt')}</button>}<button onClick={()=>finish(draft,true)}>{t('End assessment and view results')}</button></div>}
    {stage==='results'&&draft&&<section className="card"><h2 ref={resultHeading} tabIndex={-1}>{t('Assessment results')}</h2><p>{draft.input} · {draft.adaptation} · {formatDate(new Date(draft.playedAt))}</p><p>{t(draft.endedEarly?'Ended early: coverage is incomplete.':'Starting-point estimate. Skipped and untested skills are not scored.')}</p><p>{t('Keyboard and touch results describe input coordination, not physical limb independence.')}</p>
      <div className={styles.tableScroll}><table><caption>{t('Skill diagnostic')}</caption><thead><tr><th>{t('Skill')}</th><th>{t('Highest tier')}</th><th>{t('Matched')}</th><th>{t('Misses / extras')}</th><th>{t('Timing')}</th></tr></thead><tbody>{assessmentDomains.map(domain=>{const attempts=draft.attempts.filter(a=>a.probeId.startsWith(domain));const latest=attempts.at(-1);const direction=latest?.meanOffsetMs==null?'':latest.meanOffsetMs>0?t('late'):latest.meanOffsetMs<0?t('early'):t('on time');return <tr key={domain}><th>{t(domain)}</th><td>{latest?`${assessmentTier(draft,domain)}/3`:t('Untested')}</td><td>{latest?`${latest.accuracy}% · ${latest.score} ${t('score')}`:'—'}</td><td>{latest?`${latest.misses} / ${latest.extras}`:'—'}</td><td>{latest?.meanAbsoluteMs!=null?`${Math.round(latest.meanAbsoluteMs)} ms ${direction}${latest.meanOffsetMs!=null?` (${Math.round(Math.abs(latest.meanOffsetMs))} ms)`:''}${latest.timingSpreadMs!=null?` · ${t('spread')} ${Math.round(latest.timingSpreadMs)} ms`:''}`:'—'}</td></tr>;})}</tbody></table></div>
      <p className="muted">{t('Timing spread shows how much hit offsets vary; lower is steadier.')}</p>
      {comparison&&<p>{t('Progress since your last comparable assessment')} · {formatDate(new Date(comparison.previous.playedAt))}: {comparison.summary}</p>}
      <p>{t('Dynamics')}: {(()=>{const a=draft.attempts.find(a=>a.probeId==='dynamics-1');return !a||a.dynamicsContrast===null?t('Unmeasured'):a.passed?t('Demonstrated'):`${t('Needs practice')} · ${a.dynamicsContrast} ${t('velocity contrast')}`;})()}</p>
      <ul>{assessmentQuestionsForResult(draft).map(q=>{const answer=draft.answers.find(a=>a.questionId===q.id);return <li key={q.id}>{t(q.kind)}: {answer?t(answer.choice===q.answer?'Correct':'Needs practice'):t('Untested')} · {t('Answer')}: {t(q.choices[q.answer])}</li>;})}</ul>
      <p>{t('Untested tasks')}: {[...assessmentContent.probes.filter(p=>!draft.attempts.some(a=>a.probeId===p.id)).map(p=>t(p.name)),...assessmentQuestionsForResult(draft).filter(q=>!draft.answers.some(a=>a.questionId===q.id)&&!draft.skipped.includes(q.id)).map(q=>`${t(q.kind==='listening'?'Listening question':'Notation question')} ${assessmentContent.questions.indexOf(q)+1}`)].join(', ')||t('None')}</p>
      {lesson&&<><h3>{t('Suggested lesson')}: {t(lesson.title)}</h3><p><strong>{t('Why this lesson')}:</strong> {t(assessmentRecommendationDetails(draft)?.evidence??'')}</p><p><strong>{t('Next goal')}:</strong> {t(assessmentRecommendationDetails(draft)?.goal??'')}</p><div className={styles.actions}><button disabled={!ready} onClick={()=>{const next=appendAssessment(store,draft);if(save({...next,appliedId:draft.id}))setMessage('Starting plan applied to Home and daily practice.');}}>{t('Use this starting plan')}</button><Link className="button-secondary" href={`/trainer?pattern=${encodeURIComponent(assessmentContent.focusPatterns[lesson.id] ?? lesson.practicePatternId ?? "first-beat")}&adaptation=${draft.adaptation === "hands-only" ? "seated" : draft.adaptation}`}>{t('Practice this skill')}</Link></div></>}
      {!store.results.some(r=>r.id===draft.id)&&<button onClick={()=>save(appendAssessment(store,draft))}>{t('Save result')}</button>}
      <button className="button-secondary" onClick={()=>{const data=JSON.stringify(assessmentEducatorReview(draft),null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='drum-hero-educator-review.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>{t('Download anonymous educator review')}</button><p className="muted">{t('The review copy omits learner name, result date, and MIDI device ID.')}</p>
      <button onClick={()=>{player.stop();setStage('setup');setDraft(null);setChecked(false);setSoundEnabled(false);setMessage('');}}>{t('Retake assessment')}</button>
    </section>}
    {error&&<p role="alert">{t(error)}</p>}
    <section className="card"><h2>{t('Assessment history')}</h2><p>{store.results.length}/20 · {t('Results stay on this device and are included in local backups.')}</p>{store.appliedId&&<button onClick={()=>save({...store,appliedId:null})}>{t('Stop using assessment plan')}</button>}<ul>{[...store.results].reverse().map(r=><li key={r.id}>{formatDate(new Date(r.playedAt))} · {r.input} · {r.adaptation}{store.appliedId===r.id?` · ${t('Applied')}`:''}<div className={styles.actions}><button disabled={active||stage==='tasks'} onClick={()=>{player.stop();setDraft(r);setStage('results');}}>{t('View result')}</button><button disabled={active||stage==='tasks'} onClick={()=>{if(window.confirm(t('Delete this assessment? Its applied plan will also be removed.'))){save({...store,results:store.results.filter(x=>x.id!==r.id),appliedId:store.appliedId===r.id?null:store.appliedId});if(draft?.id===r.id){setDraft(null);setStage('setup');}}}}>{t('Delete')}</button></div></li>)}</ul></section>
  </div>;
}
