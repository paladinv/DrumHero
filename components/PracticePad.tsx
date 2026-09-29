"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { patterns } from "@/lib/curriculum";
import { allSongs, readSongLibrary, recordSongScore, songPartPattern, writeSongLibrary } from "@/lib/song-library";
import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from "@/lib/scoring";
import { CUSTOM_GROOVES_EVENT, readCustomGrooves } from "@/lib/custom-grooves";
import type { Instrument, PracticePattern, RatedHit, SessionResult } from "@/lib/types";
import { useProgress } from "./ProgressProvider";
import { DrumKitCanvas, type DrumKitCanvasHandle } from "./DrumKitCanvas";

type Mode="idle"|"loading"|"count-in"|"playing"|"paused"|"results";
type ExpectedHit={at:number;instrument:Instrument;matched:boolean};
const instruments:Array<{id:Instrument;key:string;code:string}>=[
  {id:"kick",key:"Space",code:"Space"},{id:"snare",key:"F",code:"KeyF"},{id:"hihat",key:"J",code:"KeyJ"},{id:"tom",key:"K",code:"KeyK"},{id:"crash",key:"L",code:"KeyL"}
];

export function PracticePad({initialPatternId}:{initialPatternId?:string}){
  const [libraryPatterns,setLibraryPatterns]=useState<PracticePattern[]>([]);
  const [customGrooves,setCustomGrooves]=useState<PracticePattern[]>([]);
  const availablePatterns=[...patterns,...libraryPatterns,...customGrooves];
  const initial=availablePatterns.find((item)=>item.id===initialPatternId)??patterns[0];
  const [patternId,setPatternId]=useState(initialPatternId??initial.id);
  const pattern=availablePatterns.find((item)=>item.id===patternId)??patterns[0];
  const [bpm,setBpm]=useState(initial.defaultBpm);
  useEffect(()=>{const timer=window.setTimeout(()=>{const songs=allSongs(readSongLibrary());const next=songs.flatMap((song)=>song.sections.flatMap((section)=>section.parts.map((part)=>songPartPattern(song,section,part))));setLibraryPatterns(next);const match=next.find((item)=>item.id===initialPatternId);if(match)setBpm(match.defaultBpm)},0);return()=>window.clearTimeout(timer)},[initialPatternId]);
  useEffect(()=>{const load=()=>{const next=readCustomGrooves();setCustomGrooves(next);const match=next.find((item)=>item.id===initialPatternId);if(match)setBpm(match.defaultBpm)};const timer=window.setTimeout(load,0);window.addEventListener(CUSTOM_GROOVES_EVENT,load);return()=>{window.clearTimeout(timer);window.removeEventListener(CUSTOM_GROOVES_EVENT,load)}},[initialPatternId]);
  const [mode,setModeState]=useState<Mode>("idle");
  const modeRef=useRef<Mode>("idle");
  const setMode=(next:Mode)=>{modeRef.current=next;setModeState(next)};
  const [playhead,setPlayhead]=useState(-1);
  const [countIn,setCountIn]=useState(4);
  const [rated,setRated]=useState<RatedHit[]>([]);
  const ratedRef=useRef<RatedHit[]>([]);
  const [lastHit,setLastHit]=useState<RatedHit|null>(null);
  const [audioMessage,setAudioMessage]=useState("Audio begins when you press Start.");
  const [result,setResult]=useState<SessionResult|null>(null);
  const resultHeadingRef=useRef<HTMLHeadingElement|null>(null);
  const intervalRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const expectedRef=useRef<ExpectedHit[]>([]);
  const startAtRef=useRef(0);
  const pauseAtRef=useRef(0);
  const lastStepRef=useRef(-1);
  const audioRef=useRef<DrumAudio|null>(null);
  const startRequestRef=useRef(0);
  const kitRef=useRef<DrumKitCanvasHandle>(null);
  const {recordSession,progress,setSound}=useProgress();
  const totalSteps=pattern.beats*(pattern.subdivision/4);

  const clearClock=useCallback(()=>{if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null}},[]);
  const appendRated=useCallback((hit:RatedHit)=>{ratedRef.current=[...ratedRef.current,hit];setRated(ratedRef.current);setLastHit(hit)},[]);

  const finish=useCallback(()=>{
    clearClock();
    expectedRef.current.forEach((expected)=>{if(!expected.matched){expected.matched=true;appendRated({instrument:expected.instrument,rating:"miss",offsetMs:null})}});
    const summary=summarizeHits(ratedRef.current,pattern.id,pattern.name,bpm);
    setResult(summary);recordSession(summary);if(pattern.id.startsWith("song:")){const [,songId,sectionId]=pattern.id.split(":");writeSongLibrary(recordSongScore(readSongLibrary(),songId,sectionId,summary.score))}setMode("results");setPlayhead(totalSteps-1);
  },[appendRated,bpm,clearClock,pattern.id,pattern.name,recordSession,totalSteps]);

  const tick=useCallback((now=performance.now())=>{
    const beatMs=60_000/bpm;
    if(now<startAtRef.current){setCountIn(Math.max(1,Math.ceil((startAtRef.current-now)/beatMs)));return}
    if(modeRef.current==="count-in")setMode("playing");
    const stepMs=stepDurationMs(bpm,pattern.subdivision);
    const step=Math.min(totalSteps-1,Math.max(0,Math.floor((now-startAtRef.current)/stepMs)));
    if(step!==lastStepRef.current){lastStepRef.current=step;setPlayhead(step);if(progress.settings.sound){if(step%(pattern.subdivision/4)===0)audioRef.current?.click(step===0);pattern.hits.filter((hit)=>hit.step===step).forEach((hit)=>audioRef.current?.hit(hit.instrument))}}
    expectedRef.current.forEach((expected)=>{if(!expected.matched&&now-expected.at>100){expected.matched=true;appendRated({instrument:expected.instrument,rating:"miss",offsetMs:null})}});
    if(now>startAtRef.current+totalSteps*stepMs+125)finish();
  },[appendRated,bpm,finish,pattern.hits,pattern.subdivision,progress.settings.sound,totalSteps]);

  const startClock=useCallback(()=>{clearClock();intervalRef.current=setInterval(()=>tick(),20)},[clearClock,tick]);

  const reset=useCallback(()=>{startRequestRef.current+=1;clearClock();setMode("idle");setPlayhead(-1);setCountIn(4);ratedRef.current=[];setRated([]);setLastHit(null);setResult(null);expectedRef.current=[];lastStepRef.current=-1},[clearClock]);

  const start=async()=>{
    reset();
    const request=startRequestRef.current;
    if(!audioRef.current)audioRef.current=createDrumAudio();
    const audio=audioRef.current;
    if(!audio)setAudioMessage("Web Audio is unavailable; visual timing remains active.");
    else if(progress.settings.sound){
      setAudioMessage("Loading recorded drum sounds…");
      setMode("loading");
      const complete=await audio.ready;
      if(startRequestRef.current!==request)return;
      setAudioMessage(complete?"Recorded drum sounds and metronome are ready.":"Some recorded samples failed to load; unavailable drum voices will be silent.");
    }else setAudioMessage("Sound is muted; visual timing remains active.");
    if(startRequestRef.current!==request)return;
    const beatMs=60_000/bpm;const stepMs=stepDurationMs(bpm,pattern.subdivision);const patternStart=performance.now()+beatMs*4;
    startAtRef.current=patternStart;
    expectedRef.current=pattern.hits.map((hit)=>({at:patternStart+hit.step*stepMs,instrument:hit.instrument,matched:false}));
    setMode("count-in");startClock();
  };

  const pause=()=>{if(modeRef.current!=="playing")return;pauseAtRef.current=performance.now();clearClock();setMode("paused")};
  const resume=()=>{if(modeRef.current!=="paused")return;const shift=performance.now()-pauseAtRef.current;startAtRef.current+=shift;expectedRef.current.forEach((hit)=>{hit.at+=shift});setMode("playing");startClock()};

  const hit=useCallback((instrument:Instrument)=>{
    if(modeRef.current!=="playing")return;
    const now=performance.now();const closest=findClosestExpected(now,expectedRef.current,instrument);
    let value:RatedHit;
    if(closest.index>=0&&Math.abs(closest.offset)<=100){expectedRef.current[closest.index].matched=true;value={instrument,rating:classifyOffset(closest.offset),offsetMs:Math.round(closest.offset)}}
    else value={instrument,rating:"extra",offsetMs:null};
    appendRated(value);kitRef.current?.hit(instrument);if(progress.settings.sound)audioRef.current?.hit(instrument);
  },[appendRated,progress.settings.sound]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.repeat)return;const item=instruments.find((instrument)=>instrument.code===event.code);if(item){event.preventDefault();hit(item.id)}if(event.code==="KeyF"&&event.altKey){event.preventDefault();void(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen())}};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[hit]);
  useEffect(()=>()=>{clearClock();audioRef.current?.close()},[clearClock]);
  useEffect(()=>{if(result)resultHeadingRef.current?.focus()},[result]);
  useEffect(()=>{window.render_game_to_text=()=>{const nextTarget=expectedRef.current.find((target)=>!target.matched);return JSON.stringify({coordinateSystem:"time flows left to right across numbered steps",mode:modeRef.current,pattern:pattern.name,bpm,playhead,countIn,expectedHits:pattern.hits.length,recordedHits:ratedRef.current.length,lastHit,nextTargetInMs:nextTarget?Math.round(nextTarget.at-performance.now()):null,controls:{kick:"Space",snare:"F",hihat:"J",tom:"K",crash:"L"}})};window.advanceTime=(ms)=>{startAtRef.current-=ms;expectedRef.current.forEach((target)=>{target.at-=ms});tick()};return()=>{delete window.render_game_to_text;delete window.advanceTime}},[bpm,countIn,lastHit,pattern.hits.length,pattern.name,playhead,tick]);

  const live=summarizeHits(rated,pattern.id,pattern.name,bpm,"live");
  const changePattern=(id:string)=>{reset();const next=availablePatterns.find((item)=>item.id===id)??patterns[0];setPatternId(id);setBpm(next.defaultBpm)};
  const changeBpm=(value:number)=>{reset();setBpm(Math.min(200,Math.max(40,value)))};
  return <div className="practice-layout">
    <section className="practice-console" aria-label="Practice controls">
      <div className="practice-controls"><label>Pattern<select value={pattern.id} onChange={(event)=>changePattern(event.target.value)}>{availablePatterns.map((item)=><option value={item.id} key={item.id}>{item.name} · {item.level}</option>)}</select></label><label>Tempo <span>{bpm} BPM</span><input aria-label="Tempo" type="range" min="40" max="200" value={bpm} onChange={(event)=>changeBpm(Number(event.target.value))}/></label><button className="sound-toggle" aria-pressed={progress.settings.sound} onClick={()=>setSound(!progress.settings.sound)}>{progress.settings.sound?"Sound on":"Sound off"}</button></div>
      <div className="practice-stage">
        <div className="stage-top"><div><span className="label">{pattern.level} · {pattern.subdivision}th notes</span><h2>{pattern.name}</h2></div><div className={`mode-pill mode-${mode}`}>{mode}</div></div>
        <p>{pattern.description}</p>
        <div className="timeline" style={{gridTemplateColumns:`repeat(${totalSteps},minmax(30px,1fr))`}} aria-label="Pattern timeline">{Array.from({length:totalSteps},(_,step)=>{const stepHits=pattern.hits.filter((item)=>item.step===step);return <div className={step===playhead?"timeline-step active":"timeline-step"} key={step}><span>{step+1}</span>{stepHits.map((target,index)=><i className={`voice-${target.instrument}`} title={target.instrument} key={`${target.instrument}-${index}`}>{target.instrument.slice(0,1).toUpperCase()}</i>)}</div>})}</div>
        <DrumKitCanvas ref={kitRef} compact interactive={false} label="Practice pad 3D drum kit" />
        <div className="transport">{mode==="idle"||mode==="results"?<button id="start-btn" className="button" onClick={(event)=>{event.currentTarget.blur();start()}}>{mode==="results"?"Try again":"Start 4-count"}</button>:null}{mode==="playing"?<button className="button" onClick={pause}>Pause</button>:null}{mode==="paused"?<button className="button" onClick={resume}>Resume</button>:null}<button className="button-secondary" onClick={reset} disabled={mode==="idle"}>Reset</button><span className="audio-status" role="status">{audioMessage}</span></div>
        {mode==="count-in"?<div className="count-in" role="status" aria-live="assertive"><span>Get ready</span><strong>{countIn}</strong></div>:null}
      </div>
      <div className="drum-pads" aria-label="Playable drum pads">{instruments.map((instrument)=><button className={`drum-pad pad-${instrument.id}`} key={instrument.id} onPointerDown={()=>hit(instrument.id)} disabled={mode!=="playing"}><span>{instrument.id}</span><kbd>{instrument.key}</kbd></button>)}</div>
    </section>
    <aside className="score-panel" aria-label="Live timing score"><span className="label">Live feedback</span><strong className="live-score">{result?.score??live.score}</strong><span>score</span><div className="score-grid"><div><b>{result?.great??live.great}</b><span>Great</span></div><div><b>{result?.good??live.good}</b><span>Good</span></div><div><b>{result?.miss??live.miss}</b><span>Miss</span></div><div><b>{result?.extra??live.extra}</b><span>Extra</span></div></div><div className="last-hit" role="status" aria-live="polite">{lastHit?<><strong className={`rating-${lastHit.rating}`}>{lastHit.rating}</strong><span>{lastHit.offsetMs===null?lastHit.instrument:`${lastHit.offsetMs>0?"+":""}${lastHit.offsetMs} ms · ${lastHit.instrument}`}</span></>:<span>Your latest hit appears here.</span>}</div>{result?<div className="result-summary"><h3 ref={resultHeadingRef} tabIndex={-1}>Loop complete</h3><p><strong>{result.accuracy}%</strong> accuracy · <strong>{result.maxCombo}</strong> max combo</p></div>:null}<p className="scoring-note">Great ≤ 50 ms · Good ≤ 100 ms. Alt+F toggles fullscreen.</p></aside>
  </div>;
}
