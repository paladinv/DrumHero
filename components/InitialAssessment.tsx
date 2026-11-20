'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assessmentBorderlineAttempts, assessmentComparison, assessmentConfidence, assessmentConfirmationLabel, assessmentConfirmationVariant, assessmentContent, assessmentDomains, assessmentEducatorReview, assessmentGoalLabel, assessmentInternalPulseProbe, assessmentMicroPractice, assessmentPattern, assessmentPracticeReadiness, assessmentPracticeTip, assessmentProbeVariant, assessmentProbeVariantIndex, assessmentQuality, assessmentQuestionChoiceSeed, assessmentQuestionsForResult, assessmentReadingFollowUpQuestion, assessmentReadingSummary, assessmentRecommendation, assessmentRecommendationDetails, assessmentTier, assessmentTransferFollowUpVariant, assessmentTransferPracticeContext, assessmentTransferProbe, assessmentTransferVariant, appendAssessment, assessTempoProgress, assessmentTrend, nextAssessmentProbe, scoreTempoAttempt, selectAssessmentQuestions, shuffledAssessmentChoices, updateAssessmentResult, type AssessmentAdaptation, type AssessmentEducatorComparison, type AssessmentGoal, type AssessmentInput, type AssessmentProbe, type AssessmentQuizFormat, type AssessmentResult } from '@/lib/assessment';
import { AssessmentPlayer, type AssessmentPhase } from '@/lib/assessment-player';
import { getTrainerDeviceProfile, parseTrainerState, trainerStorageKey, type TrainerRound } from '@/lib/trainer';
import { compactNotation } from '@/lib/song-compact-notation';
import { sightNotationBars, type SightExercise } from '@/lib/sight-reading';
import type { DrumSong } from '@/lib/song-library';
import { lessons, patterns } from '@/lib/curriculum';
import type { Instrument } from '@/lib/types';
import { useProgress } from './ProgressProvider';
import { useLocalization } from './LocalizationProvider';
import { useAssessment } from './useAssessment';
import styles from './InitialAssessment.module.css';
const voices: Instrument[]=['kick','snare','hihat','tom','crash'];
const assessmentReflectionDomains=['pulse','subdivisions','coordination'] as const;
const keys=['Space','KeyF','KeyJ','KeyK','KeyL'];
const song: DrumSong={id:'assessment',title:'Assessment notation',artist:'Drum Hero',difficulty:'Beginner',bpm:60,meter:'4/4',tags:[],notes:'',sections:[],createdAt:'',updatedAt:''};
export function AssessmentNotation({probe,adaptation,bars=1}:{probe:AssessmentProbe;adaptation:AssessmentAdaptation;bars?:1|4}) {
  const host=useRef<HTMLDivElement>(null);
  const pattern=useMemo(()=>assessmentPattern(probe,adaptation,bars),[probe,adaptation,bars]);
  useEffect(()=>{
    const exercise:SightExercise={version:1,seed:0,settings:{level:'Beginner',bpm:probe.bpm,bars,meter:'4/4',triplets:probe.subdivision===12,snareOnly:false,focusVoice:'mixed',focusRhythm:'mixed',style:'varied',density:'balanced'},subdivision:probe.subdivision,beatsPerBar:4,stepsPerBar:probe.subdivision,hits:pattern.hits};
    const {canvas}=compactNotation(song,sightNotationBars(exercise),'staff',0);
    const description=pattern.hits.map(h=>`Bar ${Math.floor(h.step/probe.subdivision)+1}, beat ${(h.step%probe.subdivision)*4/probe.subdivision+1}: ${h.instrument}${h.accent?', accent':''}`).join('. ');
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${bars}-bar percussion notation. ${description}`);host.current?.replaceChildren(canvas);
  },[pattern,probe,bars]);
  return <><div ref={host} className={styles.notes}/><details><summary>Counted note descriptions</summary><p>{pattern.hits.map(h=>`Bar ${Math.floor(h.step/probe.subdivision)+1}, beat ${(h.step%probe.subdivision)*4/probe.subdivision+1}: ${h.instrument}${h.accent?', accent':''}`).join('. ')}</p></details></>;
}
function AssessmentRhythmGuide({probe,adaptation,bars=4}:{probe:AssessmentProbe;adaptation:AssessmentAdaptation;bars?:1|4}){
  const pattern=useMemo(()=>assessmentPattern(probe,adaptation,bars),[probe,adaptation,bars]);
  return <div className={styles.rhythmGuide} role="group" aria-label={`${bars}-bar rhythm cue. Notation is not shown or scored in this mode.`}>
    <p>{`Rhythm cue · ${bars} bars · notation is not shown or scored in this mode.`}</p>
    <ol>{Array.from({length:bars},(_,bar)=>{
      const hits=pattern.hits.filter(hit=>Math.floor(hit.step/probe.subdivision)===bar);
      const text=hits.length?hits.map(hit=>`beat ${((hit.step%probe.subdivision)*4/probe.subdivision+1).toFixed(2)} ${hit.instrument}${hit.accent?', accent':''}`).join('; '):'rest for the full bar';
      return <li key={bar}><strong>Bar {bar+1}:</strong> {text}</li>;
    })}</ol>
  </div>;
}
export function InitialAssessment(){const {profileId,hydrated}=useProgress();return hydrated?<AssessmentSession key={profileId} profileId={profileId}/>:<p role="status">Loading assessment…</p>;}
function AssessmentSession({profileId}:{profileId:string}) {
  const {t,formatDate}=useLocalization();
  const {store,draft:savedDraft,ready,save,saveDraft,clearDraft,error}=useAssessment(profileId);
  const [source,setSource]=useState<AssessmentInput>('keyboard');
  const [adaptation,setAdaptation]=useState<AssessmentAdaptation>('standard');
  const [goal,setGoal]=useState<AssessmentGoal>('balanced');
  const [quizFormat,setQuizFormat]=useState<AssessmentQuizFormat>('visual');
  const [rhythmFirst,setRhythmFirst]=useState(false);
  const [largeNotation,setLargeNotation]=useState(false);
  const [slowDemonstration,setSlowDemonstration]=useState(false);
  const [extendedCountIn,setExtendedCountIn]=useState(false);
  const [largePads,setLargePads]=useState(false);
  const [spokenCues,setSpokenCues]=useState(false);
  const [hapticCues,setHapticCues]=useState(false);
  const [educatorMode,setEducatorMode]=useState(false);
  const [teacherLevels,setTeacherLevels]=useState<AssessmentEducatorComparison['teacherEstimatedLevel']>({pulse:null,subdivisions:null,coordination:null,reading:null});
  const [pilotCode,setPilotCode]=useState('');
  const [stage,setStage]=useState<'setup'|'tasks'|'results'>('setup');
  const [draft,setDraft]=useState<AssessmentResult|null>(null);
  const [phase,setPhase]=useState<AssessmentPhase>('idle');
  const [beat,setBeat]=useState(0);
  const [message,setMessage]=useState('');
  const [checked,setChecked]=useState(false);
  const [mappingReviewed,setMappingReviewed]=useState(false);
  const [soundEnabled,setSoundEnabled]=useState(false);
  const [checkHits,setCheckHits]=useState(0);
  const [checkedVoices,setCheckedVoices]=useState<Set<Instrument>>(()=>new Set());
  const [checkVelocityRange,setCheckVelocityRange]=useState<{min:number;max:number}|null>(null);
  const [transferActive,setTransferActive]=useState(false);
  const [inputs,setInputs]=useState<{id:string;name:string}[]>([]);
  const [midiId,setMidiId]=useState('');
  const [savedTimingProfile,setSavedTimingProfile]=useState<{latencyMs:number;latencyCalibrated?:boolean}>({latencyMs:0,latencyCalibrated:false});
  const [trainerRounds,setTrainerRounds]=useState<TrainerRound[]>([]);
  const midi=useRef<MIDIAccess|null>(null);
  const alive=useRef(true);
  const player=useMemo(()=>new AssessmentPlayer((next,count)=>{setPhase(next);setBeat(count);}),[]);
  const resultHeading=useRef<HTMLHeadingElement>(null);
  const padsRef=useRef<HTMLDivElement>(null);
  const active=['loading','demonstration','count-in','playing'].includes(phase);
  const probe=draft?nextAssessmentProbe(draft):null;
  const probeVariantIndex=probe&&draft?assessmentProbeVariantIndex(draft,probe):0;
  const borderline=draft?assessmentBorderlineAttempts(draft):[];
  const microPractice=draft?assessmentMicroPractice(draft):null;
  const transferPractice=draft?assessmentTransferPracticeContext(trainerRounds,draft):null;
  const readingSummary=draft?assessmentReadingSummary(draft):null;
  const requiredCheckVoices:Instrument[]=adaptation==='single-voice'?['snare']:adaptation==='hands-only'?['tom','snare','hihat']:['kick','snare','hihat'];
  const question=draft&&!probe?assessmentQuestionsForResult(draft).find(q=>!draft.answers.some(a=>a.questionId===q.id)&&!draft.skipped.includes(q.id)):undefined;
  const internalPulseProbe=assessmentInternalPulseProbe();
  const quality=draft?assessmentQuality(draft):null;
  const choices=useMemo(()=>question&&draft?shuffledAssessmentChoices(question,assessmentQuestionChoiceSeed(draft,question)):[],[question,draft]);
  const finish=useCallback((result:AssessmentResult,early=false)=>{
    player.stop();clearDraft();setMessage('Assessment complete. Review your results below.');const final={...result,playedAt:new Date().toISOString(),endedEarly:early};setDraft(final);save(appendAssessment(store,final));setStage('results');
  },[clearDraft,player,save,store]);
  useEffect(()=>{if(stage==='tasks'&&draft&&!probe&&!question){const id=setTimeout(()=>finish(draft),0);return()=>clearTimeout(id);}},[stage,draft,probe,question,finish]);
  useEffect(()=>{if(stage==='results')resultHeading.current?.focus();},[stage]);
  useEffect(()=>{if(!draft||stage==='setup')return;setLargeNotation(draft.largeNotation??false);setSlowDemonstration(draft.slowDemonstration??false);setExtendedCountIn(draft.extendedCountIn??false);setLargePads(draft.largePads??false);setSpokenCues(draft.spokenCountIn??false);setHapticCues(draft.hapticCountIn??false);},[draft,stage]);
  useEffect(()=>{if(phase==='playing'&&source==='keyboard')padsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();},[phase,source]);
  useEffect(()=>{
    if(phase!=='count-in'||beat<1)return;
    if(spokenCues&&beat===1&&'speechSynthesis'in window){window.speechSynthesis.cancel();const phrase='One, two, three, four';const utterance=new SpeechSynthesisUtterance(extendedCountIn?`${phrase}. ${phrase}.`:phrase);utterance.rate=1.05;window.speechSynthesis.speak(utterance);}
    if(hapticCues&&'vibrate'in navigator)navigator.vibrate(beat===1?[35,25,18]:18);
  },[beat,extendedCountIn,hapticCues,phase,spokenCues]);
  useEffect(()=>{
    alive.current=true;
    const interrupt=()=>{if(document.hidden&&player.phase!=='idle'){player.stop(true);setTransferActive(false);setMessage('Interrupted probe discarded. Restart it with a fresh count-in.');}};
    document.addEventListener('visibilitychange',interrupt);
    const blur=()=>{if(player.phase==='playing'||player.phase==='count-in'){player.stop(true);setTransferActive(false);}};window.addEventListener('blur',blur);
    return()=>{alive.current=false;document.removeEventListener('visibilitychange',interrupt);window.removeEventListener('blur',blur);player.stop();if(midi.current){midi.current.inputs.forEach(i=>i.onmidimessage=null);midi.current.onstatechange=null;}};
  },[player]);
  const acceptHit=useCallback((voice:Instrument,input:AssessmentInput,at=performance.now(),velocity?:number)=>{
    if(input!==source)return;
    if(stage==='setup'){
      if(soundEnabled){
        setCheckHits(n=>n+1);
        setCheckedVoices(previous=>{const next=new Set(previous);next.add(voice);const nextVoice=requiredCheckVoices.find(target=>!next.has(target));if(nextVoice)setMessage(`Input check: now strike ${nextVoice}. Listen for the matching sound.`);else{setChecked(true);setMessage('Input check complete. Listen to each preview and confirm the drum sounds match their labels.');}return next;});
        if(Number.isInteger(velocity)&&velocity!>0&&velocity!<=127)setCheckVelocityRange(previous=>({min:Math.min(previous?.min??velocity!,velocity!),max:Math.max(previous?.max??velocity!,velocity!)}));
      }
      player.hit(voice,at,velocity);return;
    }
    player.hit(voice,at,velocity);
  },[source,stage,player,soundEnabled,requiredCheckVoices]);
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
        setMidiId(current=>{if(current&&!available.some(i=>i.id===current)){player.stop(true);setTransferActive(false);setChecked(false);setMappingReviewed(false);setCheckedVoices(new Set());setCheckHits(0);setCheckVelocityRange(null);setMessage('MIDI disconnected. Reconnect and repeat the voice and sound check.');}return available.some(i=>i.id===current)?current:available[0]?.id??'';});
      };access.onstatechange=refresh;refresh();
    }catch(err){setMessage(err instanceof Error?err.message:'Could not connect MIDI.');}
  };
  const enable=async()=>{setChecked(false);setMappingReviewed(false);setCheckedVoices(new Set());setCheckHits(0);setCheckVelocityRange(null);try{await player.check();if(!alive.current)return;setSoundEnabled(true);padsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();setMessage(`Input check: now strike ${requiredCheckVoices[0]}. Listen for the matching sound.`);}catch(err){setSoundEnabled(false);setMessage(String(err));}};
  const begin=()=>{
    if(!checked||!mappingReviewed||!ready)return;
    const inputProfile=source==='midi'?`midi:${midiId}`:source;
    const timingProfile=getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))),inputProfile);
    const timingCorrectionMs=timingProfile.latencyMs;
    const id=crypto.randomUUID();
    const next:AssessmentResult={version:1,contentVersion:assessmentContent.version,id,playedAt:new Date().toISOString(),input:source,inputProfile,adaptation,goal,quizFormat,rhythmFirst,largeNotation,slowDemonstration,extendedCountIn,largePads,spokenCountIn:spokenCues,hapticCountIn:hapticCues,questionIds:selectAssessmentQuestions(id,rhythmFirst?'audio':quizFormat,store.results),timingCorrectionMs,timingCalibrated:timingProfile.latencyCalibrated===true,attempts:[],answers:[],skipped:[],endedEarly:false,...(educatorMode?{educatorComparison:{teacherEstimatedLevel:teacherLevels,recommendedLessonFits:null,disagreementNotes:'',pilotCode:pilotCode.trim()}}:{})};
    setDraft(next);saveDraft(next);player.stop();setStage('tasks');setMessage('');
  };
  useEffect(()=>{
    const inputProfile=source==='midi'?`midi:${midiId}`:source;
    try { setSavedTimingProfile(getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))),inputProfile)); }
    catch { setSavedTimingProfile({latencyMs:0,latencyCalibrated:false}); }
  },[profileId,source,midiId]);
  useEffect(()=>{
    const key=trainerStorageKey(profileId);
    const load=()=>{try{setTrainerRounds(parseTrainerState(localStorage.getItem(key)).rounds);}catch{setTrainerRounds([]);}};
    const storage=(event:StorageEvent)=>{if(event.key===key)load();};
    load();window.addEventListener('storage',storage);window.addEventListener('drum-hero:trainer-change',load);
    return()=>{window.removeEventListener('storage',storage);window.removeEventListener('drum-hero:trainer-change',load);};
  },[profileId]);
  const resume=()=>{
    if(!savedDraft)return;setSource(savedDraft.input);setAdaptation(savedDraft.adaptation);setGoal(savedDraft.goal??'balanced');setQuizFormat(savedDraft.quizFormat??'visual');setRhythmFirst(savedDraft.rhythmFirst??false);setLargeNotation(savedDraft.largeNotation??false);setSlowDemonstration(savedDraft.slowDemonstration??false);setExtendedCountIn(savedDraft.extendedCountIn??false);setLargePads(savedDraft.largePads??false);setSpokenCues(savedDraft.spokenCountIn??false);setHapticCues(savedDraft.hapticCountIn??false);if(savedDraft.input==='midi')setMidiId(savedDraft.inputProfile.replace(/^midi:/,''));setDraft(savedDraft);setChecked(true);setSoundEnabled(false);setStage('tasks');setMessage('Resumed saved assessment. Restart the current task with a fresh count-in.');
  };
  const startProbe=async()=>{
    if(!probe||!draft)return;if(source==='midi'&&midi.current?.inputs.get(midiId)?.state!=='connected'){setMessage('Reconnect MIDI before restarting this probe.');return;}
    try{
      const state=parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
      const correction=draft.timingCorrectionMs??getTrainerDeviceProfile(state,draft.inputProfile).latencyMs;
      await player.play(probe,adaptation,correction,probeVariantIndex,result=>{const updated={...draft,attempts:[...draft.attempts,result]};setDraft(updated);saveDraft(updated);setMessage(result.dynamicsContrast===null&&probe.domain==='dynamics'?'Dynamics unmeasured: the input did not provide varied velocities.':result.passed?'Tier demonstrated.':'Try once more, or skip this domain.');},{demonstrationBpm:slowDemonstration?Math.max(45,Math.round(probe.bpm*.75/5)*5):probe.bpm,countInBeats:extendedCountIn?8:4});
    }catch(err){setMessage(String(err));}
  };
  const lesson=draft?lessons.find(l=>l.id===assessmentRecommendation(draft)):undefined;
  const practicePatternId=lesson?assessmentContent.focusPatterns[lesson.id]??lesson.practicePatternId??'first-beat':undefined;
  const practicePattern=practicePatternId?patterns.find(pattern=>pattern.id===practicePatternId):undefined;
  const practiceReadiness=draft&&practicePatternId?assessmentPracticeReadiness(trainerRounds,draft,practicePatternId):null;
  const comparison=draft?assessmentComparison(draft,store.results):null;
  const trend=draft?assessmentTrend(draft,store.results):[];
  const tempoProgress=draft?assessTempoProgress(draft):null;
  const updateResult=(updated:AssessmentResult)=>{setDraft(updated);save(updateAssessmentResult(store,updated));};
  const updateReflection=(domain:typeof assessmentReflectionDomains[number],rating:''|'easy'|'about-right'|'hard'|'input-issue')=>{
    if(!draft)return;
    const reflections=(draft.reflections??[]).filter(row=>row.domain!==domain);
    if(rating)reflections.push({domain,rating});
    updateResult({...draft,reflections});
  };
  const runTransfer=async()=>{
    if(!draft||!ready)return;if(draft.transferFollowUpAttempt){setMessage('Both progress checks are already saved. Retake the assessment to start a new before-and-after comparison.');return;}const fresh=assessmentTransferProbe();if(!fresh){setMessage('Fresh-pattern content is unavailable.');return;}
    if(source==='midi'&&midi.current?.inputs.get(midiId)?.state!=='connected'){setMessage('Reconnect MIDI before trying the fresh pattern.');return;}
    try{
      const state=parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
      const correction=draft.timingCorrectionMs??getTrainerDeviceProfile(state,draft.inputProfile).latencyMs;
      setTransferActive(true);
      const followUp=Boolean(draft.transferAttempt);
      await player.play(fresh,adaptation,correction,followUp?assessmentTransferFollowUpVariant(draft):assessmentTransferVariant(draft),attempt=>{
        const attemptedAt=new Date().toISOString();
        const updated=followUp?{...draft,transferFollowUpAttempt:attempt,transferFollowUpAttemptedAt:attemptedAt}:{...draft,transferAttempt:attempt,transferAttemptedAt:attemptedAt};setDraft(updated);setTransferActive(false);
        save({...store,results:store.results.map(row=>row.id===updated.id?updated:row)});
        setMessage(`${followUp?'After-practice check':'Before-practice baseline'} saved · ${attempt.accuracy}% matched. This does not change your starting tier.`);
      },{demonstrationBpm:slowDemonstration?Math.max(45,Math.round(fresh.bpm*.75/5)*5):fresh.bpm,countInBeats:extendedCountIn?8:4});
    }catch(err){setTransferActive(false);setMessage(String(err));}
  };
  const runInternalPulse=async()=>{
    if(!draft||!internalPulseProbe||!ready)return;
    if(source==='midi'&&midi.current?.inputs.get(midiId)?.state!=='connected'){setMessage('Reconnect MIDI before trying the pulse check.');return;}
    try{
      const correction=draft.timingCorrectionMs??getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))),draft.inputProfile).latencyMs;setTransferActive(true);
      await player.play(internalPulseProbe,adaptation,correction,0,attempt=>{
        const updated={...draft,internalPulseAttempt:attempt};setDraft(updated);setTransferActive(false);save({...store,results:store.results.map(row=>row.id===updated.id?updated:row)});
        setMessage(attempt.passed?'You held the pulse through the quiet bars.':'The quiet bars changed your timing. Try the pulse lesson, then repeat this check on a later assessment.');
      },{dropoutAfterBars:2,demonstrationBpm:slowDemonstration?Math.max(45,Math.round(internalPulseProbe.bpm*.75/5)*5):internalPulseProbe.bpm,countInBeats:extendedCountIn?8:4});
    }catch(err){setTransferActive(false);setMessage(String(err));}
  };
  const runTempoCheck=async()=>{
    if(!draft||!tempoProgress?.nextBpm)return;
    if(source==='midi'&&midi.current?.inputs.get(midiId)?.state!=='connected'){setMessage('Reconnect MIDI before trying the tempo check.');return;}
    const base=assessmentContent.probes.find(p=>p.id===assessmentContent.tempoCheck.probeId);
    if(!base){setMessage('Tempo-check content is unavailable.');return;}
    const bpm=tempoProgress.nextBpm;
    try{
      setTransferActive(true);
      await player.play({...base,bpm},adaptation,draft.timingCorrectionMs??0,0,attempt=>{
        const step=scoreTempoAttempt(bpm,attempt);const updated={...draft,tempoAttempts:[...(draft.tempoAttempts??[]),step]};
        updateResult(updated);setTransferActive(false);setMessage(step.passed?`Pulse held at ${bpm} BPM.`:`Tempo check at ${bpm} BPM needs another try or can stop here.`);
      },{demonstrationBpm:slowDemonstration?Math.max(45,Math.round(bpm*.75/5)*5):bpm,countInBeats:extendedCountIn?8:4});
    }catch(err){setTransferActive(false);setMessage(String(err));}
  };
  const runConfirmation=async(reference:AssessmentProbe,originalVariant:number)=>{
    if(!draft)return;
    if(source==='midi'&&midi.current?.inputs.get(midiId)?.state!=='connected'){setMessage('Reconnect MIDI before confirming this result.');return;}
    try{
      setTransferActive(true);
      await player.play(reference,adaptation,draft.timingCorrectionMs??0,assessmentConfirmationVariant(draft,reference,originalVariant),attempt=>{
        const original=draft.attempts.filter(row=>row.probeId===reference.id).at(-1);
        const updated={...draft,confirmations:[...(draft.confirmations??[]),{probeId:reference.id,attempt}]};updateResult(updated);setTransferActive(false);
        setMessage(original?assessmentConfirmationLabel(original,attempt):'Follow-up check complete.');
      },{demonstrationBpm:slowDemonstration?Math.max(45,Math.round(reference.bpm*.75/5)*5):reference.bpm,countInBeats:extendedCountIn?8:4});
    }catch(err){setTransferActive(false);setMessage(String(err));}
  };
  const emptyTeacherComparison=():AssessmentEducatorComparison=>({teacherEstimatedLevel:teacherLevels,recommendedLessonFits:null,disagreementNotes:''});
  const updateEducatorComparison=(patch:Partial<AssessmentEducatorComparison>)=>{if(!draft)return;updateResult({...draft,educatorComparison:{...(draft.educatorComparison??emptyTeacherComparison()),...patch}});};
  return <div className={styles.root} data-large-notation={largeNotation?'true':'false'} data-large-pads={largePads?'true':'false'}>
    <p>{t('This is a starting-point estimate, not a certification. Lessons stay available and assessment results stay separate from practice scores.')}</p>
    {stage==='setup'&&<section className="card"><fieldset disabled={active}><legend>{t('Assessment setup')}</legend><div className={styles.controls}>
      <label>{t('Input')}<select value={source} onChange={e=>{player.stop();setSource(e.target.value as AssessmentInput);setChecked(false);setMappingReviewed(false);setCheckedVoices(new Set());setCheckHits(0);setCheckVelocityRange(null);setSoundEnabled(false);}}><option value="keyboard">{t('Keyboard')}</option><option value="touch">{t('Touch pads')}</option><option value="midi">MIDI</option></select></label>
      <label>{t('Access needs')}<select value={adaptation} onChange={e=>{setAdaptation(e.target.value as AssessmentAdaptation);setChecked(false);setMappingReviewed(false);setCheckedVoices(new Set());setCheckHits(0);setCheckVelocityRange(null);}}><option value="standard">{t('Full kit')}</option><option value="hands-only">{t('Hands only · kick mapped to tom')}</option><option value="single-voice">{t('Single voice · one-hand friendly')}</option></select></label>
      <label>{t('Learning goal')}<select value={goal} onChange={e=>setGoal(e.target.value as AssessmentGoal)}><option value="balanced">{t('Build a balanced foundation')}</option><option value="play-with-others">{t('Play with others')}</option><option value="read-notation">{t('Read drum notation')}</option><option value="play-expressively">{t('Play expressively')}</option></select></label>
      <label className={styles.check}><input type="checkbox" checked={rhythmFirst} onChange={e=>setRhythmFirst(e.target.checked)}/>{t('Use screen-reader-first rhythm cues')}</label>
      {rhythmFirst?<p>{t('Playing tasks use a spoken-friendly text rhythm guide instead of staff notation. Listening questions replace notation questions, and reading is reported as untested.')}</p>:<label>{t('Question format')}<select value={quizFormat} onChange={e=>setQuizFormat(e.target.value as AssessmentQuizFormat)}><option value="visual">{t('Notation and listening')}</option><option value="audio">{t('Audio questions only')}</option></select></label>}
      {source==='midi'&&<><button onClick={connect}>{t('Connect MIDI')}</button><label>{t('MIDI device')}<select value={midiId} onChange={e=>{player.stop();setMidiId(e.target.value);setChecked(false);setMappingReviewed(false);setCheckedVoices(new Set());setCheckHits(0);setCheckVelocityRange(null);setSoundEnabled(false);}}>{inputs.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label></>}
    </div><p>{t('Hands-only maps kick to tom. Single voice keeps pulse and subdivisions on snare and skips coordination; it does not assess physical independence. Dynamics is measured only with varied MIDI velocities.')}</p><label className={styles.check}><input type="checkbox" checked={largeNotation} onChange={e=>setLargeNotation(e.target.checked)}/>{t('Use larger notation')}</label><label className={styles.check}><input type="checkbox" checked={slowDemonstration} onChange={e=>setSlowDemonstration(e.target.checked)}/>{t('Play demonstrations more slowly')}</label><label className={styles.check}><input type="checkbox" checked={extendedCountIn} onChange={e=>setExtendedCountIn(e.target.checked)}/>{t('Use an eight-beat count-in')}</label><label className={styles.check}><input type="checkbox" checked={largePads} onChange={e=>setLargePads(e.target.checked)}/>{t('Use larger touch targets')}</label><p className="muted">{t('These access choices change the demo or controls only; scored passages keep the task tempo.')}</p><p role="status">{savedTimingProfile.latencyCalibrated?`${t('Timing calibrated')} · ${Math.round(savedTimingProfile.latencyMs)} ms`:t('Timing not calibrated; close timing results may be less reliable.')}</p><Link href="/trainer?setup=1">{t('Input mapping and timing calibration')}</Link>
    <label className={styles.check}><input type="checkbox" checked={spokenCues} onChange={e=>setSpokenCues(e.target.checked)}/>{t('Speak the four-beat count-in')}</label><label className={styles.check}><input type="checkbox" checked={hapticCues} onChange={e=>setHapticCues(e.target.checked)}/>{t('Use haptic count-in when supported')}</label>
    <details className={styles.educator}><summary>{t('Educator review · enter an independent estimate before starting')}</summary><p>{t('These estimates are saved anonymously with the result. Record your view before the learner sees the assessment recommendation.')}</p>{(['pulse','subdivisions','coordination','reading'] as const).map(domain=><label key={domain}>{t(domain)}<select value={teacherLevels[domain]??''} onChange={e=>{const value=e.target.value;setTeacherLevels(current=>({...current,[domain]:value===''?null:Number(value)}));}}><option value="">{t('Not assessed')}</option><option value="1">{t('Needs foundation')}</option><option value="2">{t('Developing')}</option><option value="3">{t('Independent')}</option></select></label>)}<label>{t('Optional non-identifying pilot code')}<input maxLength={40} value={pilotCode} onChange={e=>setPilotCode(e.target.value.replace(/[^A-Za-z0-9_-]/g,''))}/></label><p>{t('Use a teacher-assigned code without names or contact details to compare repeat assessments.')}</p><label className={styles.check}><input type="checkbox" checked={educatorMode} onChange={e=>setEducatorMode(e.target.checked)}/>{t('Attach these estimates to the assessment')}</label></details>
    {!rhythmFirst&&quizFormat==='visual'&&<p>{t('Notation-led mode includes two listening and three notation questions. A brief extra notation check may appear when a reading answer conflicts with playing evidence.')}</p>}{!rhythmFirst&&quizFormat==='audio'&&<p>{t('Audio-only questions replace notation questions. Notation skill will be reported as untested.')}</p>}
    <div className={styles.actions}><button onClick={enable}>{t('Enable sound and check input')}</button><button disabled={!checked||!mappingReviewed||!ready||(source==='midi'&&!midiId)} onClick={begin}>{t('Begin assessment')}</button>{savedDraft&&<button className="button-secondary" onClick={resume}>{t('Resume saved assessment')}</button>}</div><p>{t('Unscored input check')}: {checkHits} {t('hits received')} · {t('Required voices')}: {requiredCheckVoices.map(v=>`${t(v)} ${checkedVoices.has(v)?'✓':'○'}`).join(', ')}{checked?' ✓':''}</p><p className="muted">{t('Play each requested voice and listen to its preview. If a MIDI drum sounds wrong, update its mapping before continuing.')}</p>{checked&&<label className={styles.check}><input type="checkbox" checked={mappingReviewed} onChange={e=>setMappingReviewed(e.target.checked)}/>{t('I heard each expected drum sound for its label')}</label>}{source==='midi'&&checkVelocityRange&&<p className="muted">{t('MIDI velocity range seen during setup')}: {checkVelocityRange.min}–{checkVelocityRange.max}. {checkVelocityRange.max-checkVelocityRange.min<8?t('Dynamics may be reported as unmeasured if strokes stay this similar.'):t('Velocity variation is available for the dynamics check.')}</p>}{savedDraft&&<p className="muted">{t('Saved progress')}: {savedDraft.attempts.length} {t('playing tasks')} · {savedDraft.answers.length} {t('questions answered')}. {t('The interrupted task restarts with a fresh count-in.')}</p>}</fieldset></section>}
    {stage==='tasks'&&draft&&probe&&<section className="card"><h2>{t(probe.name)} · {probe.domain} {probe.tier}/{probe.domain==='dynamics'?1:3}</h2>{draft.rhythmFirst?<AssessmentRhythmGuide probe={assessmentProbeVariant(probe,probeVariantIndex)} adaptation={adaptation} bars={4}/>:<AssessmentNotation probe={assessmentProbeVariant(probe,probeVariantIndex)} adaptation={adaptation} bars={4}/>}<p>{probe.bpm} BPM · {t(draft.rhythmFirst?'Listen to the demonstration, follow the count-in, then play the four-bar rhythm guide with the metronome.':'Read the four-bar score above. Listen to the demonstration, follow the count-in, then play with the metronome.')} {extendedCountIn?t('The count-in repeats for eight beats.'):t('The count-in lasts four beats.')}</p><div className={styles.actions}><button disabled={active} onClick={startProbe}>{phase==='paused'?t('Restart interrupted probe'):t('Demonstrate and play')}</button><button onClick={()=>{player.stop();const next={...draft,skipped:[...draft.skipped,probe.id]};setDraft(next);saveDraft(next);}}>{t('Skip this domain')}</button></div></section>}
    {stage==='tasks'&&draft&&question&&<section className="card"><h2>{t(question.kind==='listening'?'Listening question':'Notation question')}</h2>{question.kind==='reading'?<><AssessmentNotation probe={assessmentContent.probes.find(p=>p.id===question.probeId)!} adaptation="single-voice"/><p>{t(question.prompt)}</p></>:<><p>{t(question.prompt)}</p><button disabled={active} onClick={async()=>{try{await player.play(assessmentContent.probes.find(p=>p.id===question.probeId)!,'standard',0);}catch(err){setMessage(String(err));}}}>{t('Play rhythm')}</button></>}<div className={styles.actions}>{choices.map(c=><button disabled={active} key={c.choice} onClick={()=>{player.stop();let next:AssessmentResult={...draft,answers:[...draft.answers,{questionId:question.id,choice:c.choice}]};const followUp=assessmentReadingFollowUpQuestion(next,question.id,store.results);if(followUp)next={...next,questionIds:[...(next.questionIds??[]),followUp.id]};setDraft(next);saveDraft(next);}}>{t(c.label)}</button>)}<button onClick={()=>{player.stop();const next={...draft,skipped:[...draft.skipped,question.id]};setDraft(next);saveDraft(next);}}>{t('Skip question')}</button></div></section>}
    <p className={styles.status} role="status">{t(phase==='demonstration'?'Listen to the demonstration':phase==='count-in'?'Count-in':phase==='playing'?'Play':phase==='paused'?'Paused — restart this probe':phase==='loading'?'Preparing audio':message)}{phase==='count-in'||phase==='playing'?` · ${beat}`:''}</p>
    {(stage!=='results'||transferActive)&&<div ref={padsRef} className={styles.pads}>{voices.filter(v=>adaptation!=='single-voice'||v==='snare').filter(v=>adaptation!=='hands-only'||v!=='kick').map(voice=><button key={voice} data-assessment-pad disabled={source==='midi'||((stage==='tasks'||transferActive)&&phase!=='playing')} onPointerDown={e=>{e.preventDefault();acceptHit(voice,source);}} onClick={e=>{if(e.detail===0)acceptHit(voice,source);}}>{t(voice)} · {keys[voices.indexOf(voice)].replace('Key','')}</button>)}</div>}
    {stage==='tasks'&&draft&&<div className={styles.actions}>{active&&<button onClick={()=>player.stop(true)}>{t('Pause and discard this attempt')}</button>}<button onClick={()=>finish(draft,true)}>{t('End assessment and view results')}</button></div>}
    {stage==='results'&&draft&&<section className="card"><h2 ref={resultHeading} tabIndex={-1}>{t('Assessment results')}</h2><p>{draft.input} · {draft.adaptation} · {formatDate(new Date(draft.playedAt))} · {draft.timingCalibrated?t('Timing calibrated'):t('Timing not calibrated')}</p><p>{t(draft.endedEarly?'Ended early: coverage is incomplete.':'Starting-point estimate. Skipped and untested skills are not scored.')}</p><p>{t('Keyboard and touch results describe input coordination, not physical limb independence.')}</p><p><strong>{t('Your learning goal')}:</strong> {t(assessmentGoalLabel(draft.goal))}</p>
      <div className={styles.tableScroll}><table><caption>{t('Skill diagnostic')}</caption><thead><tr><th>{t('Skill')}</th><th>{t('Highest tier')}</th><th>{t('Confidence')}</th><th>{t('Matched')}</th><th>{t('Misses / extras')}</th><th>{t('Timing')}</th></tr></thead><tbody>{assessmentDomains.map(domain=>{const attempts=draft.attempts.filter(a=>a.probeId.startsWith(`${domain}-`));const latest=attempts.at(-1);const confidence=assessmentConfidence(draft,domain);const direction=latest?.meanOffsetMs==null?'':latest.meanOffsetMs>0?t('late'):latest.meanOffsetMs<0?t('early'):t('on time');return <tr key={domain}><th>{t(domain)}</th><td>{latest?`${assessmentTier(draft,domain)}/3`:t('Untested')}</td><td>{t(confidence)}</td><td>{latest?`${latest.accuracy}% · ${latest.score} ${t('score')}`:'—'}</td><td>{latest?`${latest.misses} / ${latest.extras}`:'—'}</td><td>{latest?.meanAbsoluteMs!=null?`${Math.round(latest.meanAbsoluteMs)} ms ${direction}${latest.meanOffsetMs!=null?` (${Math.round(Math.abs(latest.meanOffsetMs))} ms)`:''}${latest.timingSpreadMs!=null?` · ${t('spread')} ${Math.round(latest.timingSpreadMs)} ms`:''}`:'—'}</td></tr>;})}</tbody></table></div>
      {draft.reflections?.some(row=>row.rating==='input-issue')&&<aside className={styles.notice}><strong>{t('You reported input trouble.')}</strong><p>{t('Review the input mapping or timing correction before interpreting the affected result. This feedback does not change your score.')}</p><Link href="/trainer?setup=1">{t('Review input mapping and calibration')}</Link></aside>}
      {quality&&<aside className={styles.notice} aria-label={t('Measurement quality')}><strong>{t('Measurement quality')}: {t(quality.level)}</strong><p>{quality.evidenceTasks}/{quality.expectedTasks} {t('core tasks produced evidence')}</p><ul>{quality.flags.map(flag=><li key={flag}>{t(flag)}</li>)}</ul></aside>}
      {borderline.length>0&&<section className={styles.optionalCheck}><h3>{t('Quick confirmation for a close result')}</h3><p>{t('A short alternate pattern can show whether a result near the cutoff is repeatable. This check never changes your starting tier.')}</p>{borderline.map(({probe:closeProbe,attempt})=><div className={styles.actions} key={closeProbe.id}><span>{t(closeProbe.name)} · {attempt.score} {t('score')} · {attempt.meanAbsoluteMs===null?'—':`${Math.round(attempt.meanAbsoluteMs)} ms`}</span><button disabled={active||transferActive} onClick={()=>runConfirmation(closeProbe,attempt.variant??0)}>{t('Confirm this result')}</button></div>)}</section>}
      {(draft.confirmations??[]).map(row=>{const initial=draft.attempts.filter(attempt=>attempt.probeId===row.probeId).at(-1);const probe=assessmentContent.probes.find(item=>item.id===row.probeId);return <p key={row.probeId}><strong>{t('Confirmation')} · {t(probe?.name??row.probeId)}:</strong> {initial?t(assessmentConfirmationLabel(initial,row.attempt)):t('Follow-up complete')} · {row.attempt.accuracy}% {t('matched')} · {row.attempt.meanAbsoluteMs===null?'—':`${Math.round(row.attempt.meanAbsoluteMs)} ms`}</p>;})}
      <p className="muted">{t('Timing spread shows how much hit offsets vary; lower is steadier.')}</p>
      <p className="muted">{t('Confidence reflects the number of probes, retries, and distance from the scoring cutoff. It is a guide, not a statistical guarantee.')}</p>
      <p><strong>{t('Practice tip')}:</strong> {t(assessmentPracticeTip(draft))}</p>
      <p><strong>{t('Reading')}:</strong> {draft.rhythmFirst||draft.quizFormat==='audio'?t('Not assessed in this rhythm or audio-only mode.'):readingSummary?.tier!==null&&readingSummary?.tier!==undefined?`${t('Tier')} ${readingSummary.tier}/3 · ${readingSummary.correct}/${readingSummary.total} ${t('correct')}`:`${t('Incomplete')} · ${readingSummary?.correct??0}/${readingSummary?.total??0} ${t('correct')} · ${readingSummary?.answered??0}/${readingSummary?.total??0} ${t('answered')}`}</p>
      {!draft.rhythmFirst&&draft.quizFormat!=='audio'&&readingSummary&&<><p><strong>{t('Reading by area')}:</strong> {assessmentDomains.map(domain=>{const area=readingSummary.byDomain[domain];return area.total?`${t(domain)} ${area.correct}/${area.answered} ${t('correct')} · ${area.answered}/${area.total} ${t('answered')}`:null;}).filter(Boolean).join(' · ')||t('No notation questions answered')}</p>{readingSummary.provisional&&<p className="muted">{t('Reading evidence is provisional where only one notation question was available for an area.')}</p>}</>}
      {comparison&&<p>{t('Progress since your last comparable assessment')} · {formatDate(new Date(comparison.previous.playedAt))}: {comparison.summary}</p>}
      {trend.length>1&&<div className={styles.tableScroll}><table><caption>{t('Recent comparable progress')} · {t('same input, adaptation, content, timing, and access setup')}</caption><thead><tr><th>{t('Date')}</th><th>{t('Pulse')}</th><th>{t('Subdivisions')}</th><th>{t('Coordination')}</th></tr></thead><tbody>{trend.map(row=>{const cell=(value:typeof row.pulse)=>value.tier===null?t('Untested'):`${value.tier}/3 · ${value.matched===null?'—':`${value.matched}%`} · ${value.timing===null?'—':`${Math.round(value.timing)} ms`}`;return <tr key={row.id}><th>{formatDate(new Date(row.playedAt))}</th><td>{cell(row.pulse)}</td><td>{cell(row.subdivisions)}</td><td>{cell(row.coordination)}</td></tr>;})}</tbody></table></div>}
      <p>{t('Dynamics')}: {(()=>{const a=draft.attempts.find(a=>a.probeId==='dynamics-1');return !a||a.dynamicsContrast===null?t('Unmeasured'):a.passed?t('Demonstrated'):`${t('Needs practice')} · ${a.dynamicsContrast} ${t('velocity contrast')}`;})()}</p>
      <fieldset className={styles.educator}><legend>{t('How did the assessed skills feel?')}</legend><p className="muted">{t('Optional learner feedback. It is saved as context and does not change your score or tier.')}</p>{assessmentReflectionDomains.filter(domain=>draft.attempts.some(attempt=>attempt.probeId.startsWith(`${domain}-`))).map(domain=><label key={domain}>{t(domain)}<select value={draft.reflections?.find(row=>row.domain===domain)?.rating??''} onChange={event=>updateReflection(domain,event.target.value as ''|'easy'|'about-right'|'hard'|'input-issue')}><option value="">{t('No response')}</option><option value="easy">{t('Easy')}</option><option value="about-right">{t('About right')}</option><option value="hard">{t('Hard')}</option><option value="input-issue">{t('Input felt unreliable')}</option></select></label>)}</fieldset>
      <ul>{assessmentQuestionsForResult(draft).map(q=>{const answer=draft.answers.find(a=>a.questionId===q.id);return <li key={q.id}>{t(q.kind)}: {answer?t(answer.choice===q.answer?'Correct':'Needs practice'):t('Untested')} · {t('Answer')}: {t(q.choices[q.answer])}</li>;})}</ul>
      <p>{t('Untested tasks')}: {[...assessmentContent.probes.filter(p=>!['transfer','internal-pulse'].includes(p.domain)&&!draft.attempts.some(a=>a.probeId===p.id)).map(p=>t(p.name)),...assessmentQuestionsForResult(draft).filter(q=>!draft.answers.some(a=>a.questionId===q.id)&&!draft.skipped.includes(q.id)).map(q=>`${t(q.kind==='listening'?'Listening question':'Notation question')} ${assessmentContent.questions.indexOf(q)+1}`)].join(', ')||t('None')}</p>
      {lesson&&<><h3>{t('Suggested lesson')}: {t(lesson.title)}</h3><p><strong>{t('Why this lesson')}:</strong> {t(assessmentRecommendationDetails(draft)?.evidence??'')}</p><p><strong>{t('Next goal')}:</strong> {t(assessmentRecommendationDetails(draft)?.goal??'')}</p>{microPractice&&<aside className={styles.notice}><strong>{t('60-second practice example')} · {microPractice.bpm} BPM{microPractice.voice?` · ${t(microPractice.voice)}`:''}</strong>{microPractice.probe&&(draft.rhythmFirst?<AssessmentRhythmGuide probe={microPractice.probe} adaptation={draft.adaptation} bars={4}/>:<AssessmentNotation probe={microPractice.probe} adaptation={draft.adaptation} bars={4}/>)}<p>{t('This example uses a phrase from the assessment. Practice this skill opens the lesson pattern in Trainer.')}{practicePattern?` ${t('Lesson pattern')}: ${t(practicePattern.name)}.`:''}</p><ol>{microPractice.steps.map(step=><li key={step}>{t(step)}</li>)}</ol></aside>}<div className={styles.actions}><button disabled={!ready} onClick={()=>{const next=appendAssessment(store,draft);if(save({...next,appliedId:draft.id}))setMessage('Starting plan applied to Home and daily practice.');}}>{t('Use this starting plan')}</button><Link className="button-secondary" href={`/trainer?pattern=${encodeURIComponent(practicePatternId??"first-beat")}&bpm=${microPractice?.bpm??72}&adaptation=${draft.adaptation === "hands-only" ? "seated" : draft.adaptation}&assessmentFollowUp=1&assessmentId=${encodeURIComponent(draft.id)}`}>{t('Practice this skill')}</Link></div>{practiceReadiness&&<p className="muted" role="status">{practiceReadiness.ready?t('Ready for an assessment recheck'):`${Math.min(practiceReadiness.consecutive,3)}/3 ${t('consecutive scored rounds meet the recheck targets')}`} · {t('Same input, adaptation, and timing setup are required.')}</p>}{draft.transferAttempt&&<p>{t('Before practice')}: {draft.transferAttempt.accuracy}% {t('matched')} · {draft.transferAttempt.score} {t('score')} · {draft.transferAttempt.meanAbsoluteMs===null?'—':`${Math.round(draft.transferAttempt.meanAbsoluteMs)} ms`} {t('timing error')}.</p>}{draft.transferAttempt&&<label>{t('Practice outside Drum Hero (optional minutes)')}<input type="number" min="0" max="600" step="5" value={draft.reportedPracticeMinutes??''} onChange={event=>{const value=event.target.value;const minutes=value===''?undefined:Math.min(600,Math.max(0,Math.round(Number(value)/5)*5));const updated={...draft,...(minutes===undefined?{}:{reportedPracticeMinutes:minutes})};if(minutes===undefined)delete updated.reportedPracticeMinutes;updateResult(updated);}}/></label>}{draft.transferFollowUpAttempt&&draft.transferAttempt&&<><p><strong>{t('After practice')}:</strong> {draft.transferFollowUpAttempt.accuracy}% {t('matched')} ({draft.transferFollowUpAttempt.accuracy-draft.transferAttempt.accuracy>=0?'+':''}{draft.transferFollowUpAttempt.accuracy-draft.transferAttempt.accuracy} {t('points')}) · {draft.transferFollowUpAttempt.meanAbsoluteMs===null?'—':`${Math.round(draft.transferFollowUpAttempt.meanAbsoluteMs)} ms`} {t('timing error')}.</p><p className="muted">{t('Checks recorded')}: {draft.transferAttemptedAt?formatDate(new Date(draft.transferAttemptedAt)):'—'} → {draft.transferFollowUpAttemptedAt?formatDate(new Date(draft.transferFollowUpAttemptedAt)):'—'}. {t('Between these checks')}: {transferPractice?.rounds??0} {t('comparable scored Trainer rounds')}{transferPractice?.minutes!==null&&transferPractice?.minutes!==undefined?` · ${transferPractice.minutes} ${t('estimated app minutes')}`:''}{draft.reportedPracticeMinutes!==undefined?` · ${draft.reportedPracticeMinutes} ${t('minutes reported outside Drum Hero')}`:''}.</p></>}<p className="muted">{t('Record the fresh-pattern baseline before practice. After practicing the suggested skill, return for one follow-up on a different version of the pattern.')}</p></>}
      {!draft.transferFollowUpAttempt&&<div className={styles.actions}><button disabled={active||transferActive} onClick={runTransfer}>{phase==='paused'&&transferActive?t('Restart interrupted probe'):draft.transferAttempt?t('Check progress after practice'):t('Record pre-practice baseline')}</button><span>{draft.transferAttempt?t('Optional · use after practicing the suggested skill.'):t('Optional · record this before starting the suggested practice plan.')}</span></div>}
      {draft.transferAttempt&&<p><strong>{t('Pre-practice baseline')}:</strong> {draft.transferAttempt.accuracy}% {t('matched')} · {draft.transferAttempt.score} {t('score')} · {draft.transferAttempt.misses} {t('misses')} · {draft.transferAttempt.extras} {t('extras')}.</p>}
      {draft.transferFollowUpAttempt&&draft.transferAttempt&&<p><strong>{t('After-practice check')}:</strong> {draft.transferFollowUpAttempt.accuracy}% {t('matched')} ({draft.transferFollowUpAttempt.accuracy-draft.transferAttempt.accuracy>=0?'+':''}{draft.transferFollowUpAttempt.accuracy-draft.transferAttempt.accuracy} {t('percentage points')}) · {draft.transferFollowUpAttempt.score} {t('score')} · {draft.transferFollowUpAttempt.meanAbsoluteMs===null?'—':`${Math.round(draft.transferFollowUpAttempt.meanAbsoluteMs)} ms`} {t('timing error')}.</p>}
      {internalPulseProbe&&<div className={styles.actions}>{draft.internalPulseAttempt?<p><strong>{t('Internal pulse')}:</strong> {draft.internalPulseAttempt.passed?t('Demonstrated'):t('Needs practice')} · {t('click-off timing')} {draft.internalPulseAttempt.clickOffMeanAbsoluteMs===null?'—':`${Math.round(draft.internalPulseAttempt.clickOffMeanAbsoluteMs??0)} ms`} · {t('drift')} {draft.internalPulseAttempt.dropoutDriftMs===null?'—':`${Math.round(draft.internalPulseAttempt.dropoutDriftMs??0)} ms`}</p>:<><button disabled={active||transferActive} onClick={runInternalPulse}>{phase==='paused'&&transferActive?t('Restart interrupted probe'):t('Try the internal-pulse check')}</button><span>{t('Optional · the click stops after two bars; keep playing for two more bars.')}</span></>}</div>}
      {internalPulseProbe&&draft.internalPulseAttempt&&<p>{t('This check is separate from your demonstrated tiers and does not change your starting plan.')}</p>}
      <section className={styles.optionalCheck}><h3>{t('Optional tempo range')}</h3><p>{t('This separate pulse check keeps rhythmic complexity fixed and steps through 60, 72, 84, and 90 BPM. It does not change your skill tiers.')}</p>{tempoProgress?.attempts.length? <ul>{assessmentContent.tempoCheck.bpms.map(bpm=>{const attempts=tempoProgress.attempts.filter(a=>a.bpm===bpm);return attempts.length?<li key={bpm}>{bpm} BPM · {attempts.at(-1)?.passed?t('Demonstrated'):t('Not yet steady')} · {attempts.at(-1)?.accuracy}% {t('matched')} · {attempts.length} {t('attempts')}</li>:null;})}</ul>:null}{tempoProgress?.highestBpm!==null&&tempoProgress?.highestBpm!==undefined&&<p><strong>{t('Highest demonstrated tempo')}:</strong> {tempoProgress.highestBpm} BPM</p>}{tempoProgress?.nextBpm?<button disabled={active||transferActive} onClick={runTempoCheck}>{t('Play pulse at')} {tempoProgress.nextBpm} BPM{tempoProgress.attempts.filter(a=>a.bpm===tempoProgress.nextBpm).length?` · ${t('retry')}`:''}</button>:tempoProgress?.complete&&tempoProgress.attempts.length>0?<p>{t('Tempo range check complete. Higher untested speeds remain unknown.')}</p>:<button disabled={active||transferActive} onClick={runTempoCheck}>{t('Try tempo range check')} · {assessmentContent.tempoCheck.bpms[0]}–{assessmentContent.tempoCheck.bpms.at(-1)} BPM</button>}</section>
      {draft.timingCorrectionMs!==undefined&&<p className="muted">{t('Saved timing correction used')}: {Math.round(draft.timingCorrectionMs)} ms.</p>}
      {draft.educatorComparison&&<section className={styles.educator}><h3>{t('Educator review')}</h3><p>{t('Independent estimate entered before the learner started')}:</p><ul>{(['pulse','subdivisions','coordination','reading'] as const).map(domain=><li key={domain}>{t(domain)}: {draft.educatorComparison?.teacherEstimatedLevel[domain]==null?t('Not assessed'):t(({1:'Needs foundation',2:'Developing',3:'Independent'} as Record<number,string>)[draft.educatorComparison?.teacherEstimatedLevel[domain]??0]??'Not assessed')}</li>)}</ul><label>{t('Did the suggested lesson fit?')}<select value={draft.educatorComparison.recommendedLessonFits==null?'':draft.educatorComparison.recommendedLessonFits?'yes':'no'} onChange={e=>updateEducatorComparison({recommendedLessonFits:e.target.value===''?null:e.target.value==='yes'})}><option value="">{t('Not reviewed yet')}</option><option value="yes">{t('Yes')}</option><option value="no">{t('No')}</option></select></label><label>{t('What explains any disagreement?')}<textarea maxLength={1000} value={draft.educatorComparison.disagreementNotes} onChange={e=>updateEducatorComparison({disagreementNotes:e.target.value})}/></label></section>}
      {!store.results.some(r=>r.id===draft.id)&&<button onClick={()=>save(appendAssessment(store,draft))}>{t('Save result')}</button>}
      <button className="button-secondary" onClick={()=>{const data=JSON.stringify(assessmentEducatorReview(draft,transferPractice),null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='drum-hero-educator-review.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>{t('Download anonymous educator review')}</button><p className="muted">{t('The review copy omits learner name, result date, and MIDI device ID. If supplied, the non-identifying pilot code is included to link retakes.')}</p>
      <button onClick={()=>{player.stop();clearDraft();setStage('setup');setDraft(null);setChecked(false);setMappingReviewed(false);setCheckedVoices(new Set());setCheckHits(0);setCheckVelocityRange(null);setSoundEnabled(false);setTransferActive(false);setEducatorMode(false);setTeacherLevels({pulse:null,subdivisions:null,coordination:null,reading:null});setMessage('');}}>{t('Retake assessment')}</button>
    </section>}
    {error&&<p role="alert">{t(error)}</p>}
    <section className="card"><h2>{t('Assessment history')}</h2><p>{store.results.length}/20 · {t('Results stay on this device and are included in local backups.')}</p>{store.appliedId&&<button onClick={()=>save({...store,appliedId:null})}>{t('Stop using assessment plan')}</button>}<ul>{[...store.results].reverse().map(r=><li key={r.id}>{formatDate(new Date(r.playedAt))} · {r.input} · {r.adaptation}{store.appliedId===r.id?` · ${t('Applied')}`:''}<div className={styles.actions}><button disabled={active||stage==='tasks'} onClick={()=>{player.stop();setSource(r.input);setAdaptation(r.adaptation);setGoal(r.goal??'balanced');setQuizFormat(r.quizFormat??'visual');if(r.input==='midi')setMidiId(r.inputProfile.replace(/^midi:/,''));setDraft(r);setStage('results');}}>{t('View result')}</button><button disabled={active||stage==='tasks'} onClick={()=>{if(window.confirm(t('Delete this assessment? Its applied plan will also be removed.'))){save({...store,results:store.results.filter(x=>x.id!==r.id),appliedId:store.appliedId===r.id?null:store.appliedId});if(draft?.id===r.id){setDraft(null);setStage('setup');}}}}>{t('Delete')}</button></div></li>)}</ul></section>
  </div>;
}
