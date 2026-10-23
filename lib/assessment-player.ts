import { createDrumAudio, type DrumAudio } from './audio';
import { assessmentPattern, assessmentProbeVariant, scoreAssessment, type AssessmentAdaptation, type AssessmentAttempt, type AssessmentHit, type AssessmentProbe } from './assessment';
import type { Instrument } from './types';
export type AssessmentPhase = 'idle' | 'loading' | 'demonstration' | 'count-in' | 'playing' | 'paused';
/** Owns only transient audio and input. Persistence belongs to the assessment, never normal practice. */
export class AssessmentPlayer {
  private audio: DrumAudio | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private ticker: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private capture: { start: number; end: number; correction: number; hits: AssessmentHit[] } | null = null;
  phase: AssessmentPhase = 'idle';
  constructor(private changed: (phase: AssessmentPhase, beat: number) => void) {}
  private set(phase: AssessmentPhase, beat = 0) { this.phase = phase; this.changed(phase, beat); }
  stop(paused = false) {
    this.generation++; this.timers.forEach(clearTimeout); this.timers=[];
    if (this.ticker) clearInterval(this.ticker); this.ticker=null;
    this.capture=null; this.audio?.close(); this.audio=null; this.set(paused ? 'paused' : 'idle');
  }
  private async prepare() {
    this.stop(); const generation = this.generation; this.set('loading');
    const audio = createDrumAudio(undefined, undefined, () => this.stop(true)); this.audio=audio;
    const loaded = audio ? await audio.ready : false;
    if (generation !== this.generation) return null;
    if (!audio || !loaded) { this.stop(); throw new Error('Drum sounds could not load. Check audio output or the offline download.'); }
    audio.setClickSound('woodblock'); return { audio, generation };
  }
  async check() { const ready=await this.prepare(); if (ready) this.set('idle'); }
  hit(instrument: Instrument, at = performance.now(), velocity?: number) {
    const round = this.capture;
    if (round && at >= round.start-100 && at <= round.end+100 && round.hits.length < 10000) round.hits.push({ instrument, atMs: at-round.start-round.correction, velocity });
    if (!round && this.phase === 'idle') this.audio?.hit(instrument, false, velocity);
  }
  async play(probe: AssessmentProbe, adaptation: AssessmentAdaptation, correction: number, variant = 0, complete?: (result: AssessmentAttempt) => void) {
    const ready = await this.prepare(); if (!ready) return;
    const { audio, generation }=ready;
    const selected = assessmentProbeVariant(probe, variant);
    const pattern=assessmentPattern(selected,adaptation,1);
    const beatMs=60000/probe.bpm, base=performance.now()+200, demoEnd=base+4*beatMs;
    const schedule=(at: number, fn:()=>void)=>this.timers.push(setTimeout(()=>{ if(this.generation===generation)fn(); },Math.max(0,at-performance.now())));
    this.set('demonstration');
    for(const h of pattern.hits) audio.scheduleHit(h.instrument,base+h.step*beatMs*4/probe.subdivision,h.accent,h.accent?110:55);
    if(!complete) { schedule(demoEnd+100,()=>this.stop()); return; }
    const start=demoEnd+4*beatMs, end=start+16*beatMs;
    for(let i=0;i<20;i++)audio.scheduleClick(demoEnd+i*beatMs,i%4===0);
    schedule(demoEnd,()=>this.set('count-in',1));
    schedule(start-100,()=>{this.capture={start,end,correction,hits:[]};});
    schedule(start,()=>this.set('playing',1));
    this.ticker=setInterval(()=>{
      const now=performance.now();
      if(now>=demoEnd&&now<start)this.set('count-in',Math.min(4,Math.floor((now-demoEnd)/beatMs)+1));
      else if(now>=start&&now<end)this.set('playing',Math.floor((now-start)/beatMs)+1);
    },50);
      schedule(end+110,()=>{ const result=scoreAssessment(selected,adaptation,this.capture?.hits??[],variant);this.stop();complete(result); });
  }
}
