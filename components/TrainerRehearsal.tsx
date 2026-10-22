"use client";
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { TrainerRoutineStep } from '@/lib/trainer-enhancements';
import type { TrainerChallenge } from '@/lib/trainer-challenge';
import type { PracticePattern } from '@/lib/types';
type Stage = 'idle' | 'preparing' | 'playing' | 'rest' | 'done';
export function TrainerRehearsal({ steps, patterns, phase, disabled, playingRemaining, challenge, onPrepare, onStart, onEnd, onStop }: { challenge?: TrainerChallenge | null; playingRemaining: number; steps: TrainerRoutineStep[]; patterns: PracticePattern[]; phase: string; disabled: boolean; onPrepare: (step: TrainerRoutineStep, seconds: number) => void; onStart: () => void; onEnd: () => void; onStop: () => void }) {
  const [seconds, setSeconds] = useState(60), [rest, setRest] = useState(10), [stage, setStage] = useState<Stage>('idle');
  const [queue, setQueue] = useState<TrainerRoutineStep[]>([]), [index, setIndex] = useState(0), [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState(''), launched = useRef(false);
  const actions = useEffectEvent((action: 'start' | 'prepare' | 'stop' | 'end', step?: TrainerRoutineStep) => {
    if (action === 'start') onStart(); if (action === 'prepare' && step) onPrepare(step, seconds); if (action === 'stop') onStop(); if (action === 'end') onEnd();
  });
  useEffect(() => {
    if (stage !== 'preparing') return;
    const timer = window.setTimeout(() => { launched.current = false; actions('start'); setStage('playing'); }, 100);
    return () => window.clearTimeout(timer);
  }, [stage, index]);
  useEffect(() => {
    if (stage !== 'playing') return;
    if (['loading', 'count-in', 'running', 'paused'].includes(phase)) launched.current = true;
    if (phase === 'complete') {
      const timer = window.setTimeout(() => {
        if (index + 1 >= queue.length) { setStage('done'); actions('end'); setMessage('Timed rehearsal complete.'); }
        else { setRemaining(rest); setStage('rest'); }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'idle' && launched.current) {
      const timer = window.setTimeout(() => { setStage('idle'); actions('end'); setMessage('Rehearsal stopped.'); }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [phase, stage, index, queue.length, rest]);
  useEffect(() => {
    if (stage !== 'rest') return;
    const advance = () => { const next = index + 1; actions('prepare', queue[next]); setIndex(next); setStage('preparing'); };
    if (remaining <= 0) { const timer = window.setTimeout(advance, 0); return () => window.clearTimeout(timer); }
    const timer = window.setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [stage, remaining, index, queue]);
  const active = ['preparing', 'playing', 'rest'].includes(stage);
  const begin = (accepted?: TrainerChallenge) => {
    const source: TrainerRoutineStep[] = accepted ? [{ patternId: accepted.pattern.id, bpm: accepted.bpm, repetitions: 4, fillPatternId: '', fillAfterBars: 1 }] : steps;
    const duration = accepted?.durationSeconds ?? seconds;
    const available = source.filter(step => patterns.some(pattern => pattern.id === step.patternId));
    if (!available.length) { setMessage('Add available patterns to your personal routine first.'); return; }
    setSeconds(duration); setQueue(available); setIndex(0); setMessage('Timed rehearsal uses scored mode and your selected input.'); launched.current = false;
    onPrepare(available[0], duration); setStage('preparing');
  };
  return <details className="trainer-rehearsal"><summary>Timed rehearsal with rests</summary><p>Play each pattern in your personal routine for the selected duration, with a rest before the next. Timed rehearsals use scored mode and skip routine checkpoint gates. Count-ins and pauses do not count toward playing time.</p><fieldset disabled={active || disabled}><label>Time per drill<select value={seconds} onChange={event => setSeconds(Number(event.target.value))}>{[30, 60, 120].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label><label>Rest between drills<select value={rest} onChange={event => setRest(Number(event.target.value))}>{[0, 5, 10, 20, 30].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label><button type="button" disabled={!steps.length} onClick={() => begin()}>Start timed rehearsal</button>{challenge && <button type="button" onClick={() => begin(challenge)}>Start accepted challenge</button>}</fieldset>{active && <div role="status"><p>{stage === 'rest' ? `Rest · ${remaining} seconds` : `Drill ${index + 1} of ${queue.length} · ${playingRemaining} seconds remaining · ${phase}`}</p><p>Next: {patterns.find(pattern => pattern.id === queue[index + 1]?.patternId)?.name ?? 'End of rehearsal'}</p><button type="button" onClick={() => { setStage('idle'); launched.current = false; onStop(); setMessage('Rehearsal cancelled.'); }}>Cancel timed rehearsal</button></div>}<p role="status">{message}</p></details>;
}
