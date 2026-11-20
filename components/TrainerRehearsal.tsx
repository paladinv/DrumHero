"use client";
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { TrainerRoutineStep } from '@/lib/trainer-enhancements';
import type { TrainerChallenge } from '@/lib/trainer-challenge';
import type { PracticePattern } from '@/lib/types';
import type { TrainerRound } from '@/lib/trainer';
type Stage = 'idle' | 'preparing' | 'playing' | 'rest' | 'done';
type DuetResult = { round: TrainerRound; role: "call" | "response"; player: string };
export function TrainerRehearsal({ steps, patterns, selectedPatternId, bpm, phase, disabled, playingRemaining, challenge, round, onPrepare, onStart, onEnd, onStop }: { challenge?: TrainerChallenge | null; round: TrainerRound | null; playingRemaining: number; steps: TrainerRoutineStep[]; patterns: PracticePattern[]; selectedPatternId: string; bpm: number; phase: string; disabled: boolean; onPrepare: (step: TrainerRoutineStep, seconds: number) => void; onStart: () => void; onEnd: () => void; onStop: () => void }) {
  const [seconds, setSeconds] = useState(60), [rest, setRest] = useState(10), [stage, setStage] = useState<Stage>('idle');
  const [queue, setQueue] = useState<TrainerRoutineStep[]>([]), [index, setIndex] = useState(0), [remaining, setRemaining] = useState(0);
  const [activeChallenge, setActiveChallenge] = useState<TrainerChallenge | null>(null), [challengeResults, setChallengeResults] = useState<TrainerRound[]>([]), [playerLabel, setPlayerLabel] = useState("");
  const [callPatternId, setCallPatternId] = useState(selectedPatternId), [responsePatternId, setResponsePatternId] = useState(patterns.find(item => item.id !== selectedPatternId && /fill/i.test(("style" in item ? String(item.style ?? "") : "") + item.name))?.id ?? patterns.find(item => item.id !== selectedPatternId)?.id ?? selectedPatternId);
  const [playerOne, setPlayerOne] = useState("Player A"), [playerTwo, setPlayerTwo] = useState("Player B"), [duetCycles, setDuetCycles] = useState(2);
  const [activeDuet, setActiveDuet] = useState<{ callPattern: PracticePattern; responsePattern: PracticePattern; playerOne: string; playerTwo: string } | null>(null);
  const [duetRoles, setDuetRoles] = useState<Array<"call" | "response">>([]), [duetResults, setDuetResults] = useState<DuetResult[]>([]);
  const [message, setMessage] = useState(''), launched = useRef(false);
  const lastRecordedRound = useRef("");
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
        const currentStep = queue[index];
        if (activeChallenge && round && currentStep && round.patternId === currentStep.patternId && lastRecordedRound.current !== round.id) {
          lastRecordedRound.current = round.id;
          setChallengeResults(previous => [...previous.filter(item => item.patternId !== round.patternId), round]);
        }
        if (activeDuet && round && currentStep && round.patternId === currentStep.patternId && lastRecordedRound.current !== round.id) {
          lastRecordedRound.current = round.id;
          const role = duetRoles[index] ?? "call";
          setDuetResults(previous => [...previous, { round, role, player: role === "call" ? activeDuet.playerOne : activeDuet.playerTwo }]);
        }
        if (index + 1 >= queue.length) { setStage('done'); actions('end'); setMessage('Timed rehearsal complete.'); }
        else { setRemaining(rest); setStage('rest'); }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'idle' && launched.current) {
      const timer = window.setTimeout(() => { setStage('idle'); actions('end'); setMessage('Rehearsal stopped.'); }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeChallenge, activeDuet, duetRoles, phase, round, stage, index, queue, rest]);
  useEffect(() => {
    if (stage !== 'rest') return;
    const advance = () => { const next = index + 1; actions('prepare', queue[next]); setIndex(next); setStage('preparing'); };
    if (remaining <= 0) { const timer = window.setTimeout(advance, 0); return () => window.clearTimeout(timer); }
    const timer = window.setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [stage, remaining, index, queue]);
  const active = ['preparing', 'playing', 'rest'].includes(stage);
  const begin = (accepted?: TrainerChallenge) => {
    const source: TrainerRoutineStep[] = accepted ? accepted.patterns.map(pattern => ({ patternId: pattern.id, bpm: accepted.bpm, repetitions: 4, fillPatternId: '', fillAfterBars: 1 })) : steps;
    const duration = accepted?.durationSeconds ?? seconds;
    const available = source.filter(step => patterns.some(pattern => pattern.id === step.patternId));
    if (!available.length) { setMessage('Add available patterns to your personal routine first.'); return; }
    setActiveDuet(null); setDuetRoles([]); setDuetResults([]); setActiveChallenge(accepted ?? null); setChallengeResults([]); lastRecordedRound.current = "";
    if (accepted) setPlayerLabel("");
    setSeconds(duration); setQueue(available); setIndex(0); setMessage(accepted ? `Challenge target: ${accepted.targetAccuracy}% accuracy. Scores will be checked pattern by pattern.` : 'Timed rehearsal uses scored mode and your selected input.'); launched.current = false;
    onPrepare(available[0], duration); setStage('preparing');
  };
  const beginDuet = () => {
    const callPattern = patterns.find(item => item.id === callPatternId);
    const responsePattern = patterns.find(item => item.id === responsePatternId);
    if (!callPattern || !responsePattern || callPattern.id === responsePattern.id) { setMessage("Choose two different patterns for the call and response."); return; }
    const commonMin = Math.max(callPattern.tempoRange[0], responsePattern.tempoRange[0]);
    const commonMax = Math.min(callPattern.tempoRange[1], responsePattern.tempoRange[1]);
    if (commonMin > commonMax) { setMessage("These patterns do not share a playable tempo. Choose another response pattern."); return; }
    const duetBpm = Math.max(commonMin, Math.min(commonMax, bpm));
    const call: TrainerRoutineStep = { patternId: callPattern.id, bpm: duetBpm, repetitions: 4, fillPatternId: "", fillAfterBars: 1 };
    const response: TrainerRoutineStep = { patternId: responsePattern.id, bpm: duetBpm, repetitions: 4, fillPatternId: "", fillAfterBars: 1 };
    const nextQueue = Array.from({ length: duetCycles }, () => [call, response]).flat();
    const nextRoles = Array.from({ length: duetCycles }, () => ["call", "response"] as const).flat();
    setActiveChallenge(null); setChallengeResults([]); setActiveDuet({ callPattern, responsePattern, playerOne: playerOne.trim() || "Player A", playerTwo: playerTwo.trim() || "Player B" });
    setDuetRoles(nextRoles); setDuetResults([]); setQueue(nextQueue); setIndex(0); setMessage("Call-and-response duet uses alternating scored phrases. Each player's result is listed separately.");
    lastRecordedRound.current = ""; launched.current = false; setSeconds(0); onPrepare(nextQueue[0]!, 0); setStage("preparing");
  };
  const challengeScore = (item: TrainerRound) => item.result && !item.inputClipped && !item.uncertainDetections ? item.result.accuracy : null;
  const failedChallengeSteps = activeChallenge ? activeChallenge.patterns.filter(item => {
    const result = challengeResults.find(roundResult => roundResult.patternId === item.id);
    const accuracy = result ? challengeScore(result) : null;
    return accuracy === null || accuracy < activeChallenge.targetAccuracy;
  }).map(item => ({ patternId: item.id, bpm: activeChallenge.bpm, repetitions: 4 as const, fillPatternId: '', fillAfterBars: 1 as const })) : [];
  const exportResults = (format: "json" | "csv") => {
    if (!activeChallenge) return;
    const results = activeChallenge.patterns.map(item => {
      const result = challengeResults.find(roundResult => roundResult.patternId === item.id);
      const accuracy = result ? challengeScore(result) : null;
      const hits = result?.hits ?? [];
      const offsets = hits.flatMap(hit => hit.rating !== "extra" && typeof hit.offsetMs === "number" ? [hit.offsetMs] : []);
      const typicalTimingMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length) : null;
      const averageOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null;
      return { pattern: item.name, accuracy, passed: accuracy !== null && accuracy >= activeChallenge.targetAccuracy,
        score: result?.result?.score ?? null, great: result?.result?.great ?? null, good: result?.result?.good ?? null,
        missed: result?.result?.miss ?? null, extra: result?.result?.extra ?? null,
        targetCount: hits.filter(hit => hit.rating !== "extra" && hit.transition !== "landing").length,
        typicalTimingMs, averageOffsetMs, input: result?.source ?? null,
        playedAt: result?.playedAt ?? null, durationSeconds: result?.durationSeconds ?? null,
        inputClipped: result?.inputClipped ?? false, uncertainDetections: result?.uncertainDetections ?? 0 };
    });
    const report = { format: "drum-hero-assignment-report", version: 1,
      assignment: { title: activeChallenge.title, goal: activeChallenge.goal, attribution: activeChallenge.attribution, targetAccuracy: activeChallenge.targetAccuracy, bpm: activeChallenge.bpm, durationSeconds: activeChallenge.durationSeconds },
      playerLabel: playerLabel.trim() || null, completedAt: new Date().toISOString(),
      summary: { completed: results.filter(item => item.accuracy !== null).length, passed: results.filter(item => item.passed).length, total: results.length },
      results, privacy: "Contains only the optional player label and assignment results. It excludes recordings, audio, device IDs, and learner profile IDs." };
    const csvCell = (value: unknown) => {
      const cell = typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : String(value ?? "");
      return `"${cell.replaceAll('"', '""')}"`;
    };
    const csv = [["Assignment", "Player label", "Goal", "Pattern", "Target accuracy", "Accuracy", "Passed", "Score", "Great", "Good", "Missed", "Extra", "Targets", "Typical timing ms", "Average timing offset ms", "Input", "Played at", "Duration seconds", "Input clipped", "Uncertain detections"],
      ...results.map(item => [activeChallenge.title, playerLabel.trim(), activeChallenge.goal, item.pattern, activeChallenge.targetAccuracy, item.accuracy, item.passed, item.score, item.great, item.good, item.missed, item.extra, item.targetCount, item.typicalTimingMs, item.averageOffsetMs, item.input, item.playedAt, item.durationSeconds, item.inputClipped, item.uncertainDetections])]
      .map(row => row.map(csvCell).join(",")).join("\r\n");
    const content = format === "json" ? JSON.stringify(report, null, 2) : csv;
    const mime = format === "json" ? "application/json" : "text/csv;charset=utf-8";
    const url = URL.createObjectURL(new Blob([content], { type: mime })), link = document.createElement("a");
    link.href = url; link.download = `drum-hero-assignment-results.${format}`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const retryFailed = () => {
    if (!activeChallenge || !failedChallengeSteps.length) return;
    const failedIds = new Set(failedChallengeSteps.map(item => item.patternId));
    const available = failedChallengeSteps.filter(item => patterns.some(pattern => pattern.id === item.patternId));
    if (!available.length) { setMessage('The patterns that need another pass are no longer available.'); return; }
    setChallengeResults(previous => previous.filter(item => !failedIds.has(item.patternId)));
    lastRecordedRound.current = '';
    setQueue(available); setIndex(0); setMessage(`Retrying ${available.length} pattern${available.length === 1 ? '' : 's'} below the ${activeChallenge.targetAccuracy}% target.`);
    onPrepare(available[0]!, activeChallenge.durationSeconds); setStage('preparing');
  };
  const challengeDone = stage === 'done' && activeChallenge;
  const duetDone = stage === "done" && activeDuet;
  const exportDuet = () => {
    if (!activeDuet) return;
    const rows = duetResults.map(item => ({ player: item.player, role: item.role, pattern: item.round.patternName, bpm: item.round.bpm, accuracy: challengeScore(item.round), score: item.round.result?.score ?? null, playedAt: item.round.playedAt, input: item.round.source }));
    const report = { format: "drum-hero-live-duet", version: 1, callPattern: activeDuet.callPattern.name, responsePattern: activeDuet.responsePattern.name, results: rows, privacy: "Player labels are optional; report excludes audio, device identifiers, and learner profile IDs." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "drum-hero-duet-results.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <details className="trainer-rehearsal">
    <summary>Timed rehearsal, peer challenge & live duet</summary>
    <p>Timed rehearsals use scored mode and skip routine checkpoint gates. Count-ins and pauses do not count toward playing time.</p>
    <fieldset disabled={active || disabled}>
      <label>Time per drill<select value={seconds || 60} onChange={event => setSeconds(Number(event.target.value))}>{[30, 60, 120].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label>
      <label>Rest between drills<select value={rest} onChange={event => setRest(Number(event.target.value))}>{[0, 5, 10, 20, 30].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label>
      <button type="button" disabled={!steps.length} onClick={() => begin()}>Start timed rehearsal</button>
      {challenge && <button type="button" onClick={() => begin(challenge)}>Start accepted challenge</button>}
    </fieldset>
    <details className="trainer-live-duet">
      <summary>Live call-and-response duet</summary>
      <p>Two players take turns on alternating scored phrases. Each handoff follows a short rest and the report separates the two players’ results. Use this on one shared kit or take turns with the same input; it does not record audio.</p>
      <fieldset disabled={active || disabled}>
        <label>Call pattern<select value={callPatternId} onChange={event => setCallPatternId(event.target.value)}>{patterns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Response pattern<select value={responsePatternId} onChange={event => setResponsePatternId(event.target.value)}>{patterns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Player A<input maxLength={40} value={playerOne} onChange={event => setPlayerOne(event.target.value)} /></label>
        <label>Player B<input maxLength={40} value={playerTwo} onChange={event => setPlayerTwo(event.target.value)} /></label>
        <label>Call / response pairs<select value={duetCycles} onChange={event => setDuetCycles(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" disabled={callPatternId === responsePatternId} onClick={beginDuet}>Start live duet</button>
      </fieldset>
    </details>
    {active && <div role="status"><p>{stage === 'rest' ? `Rest · ${remaining} seconds` : activeDuet ? `${duetRoles[index] === "call" ? activeDuet.playerOne : activeDuet.playerTwo} · ${duetRoles[index] === "call" ? "Call" : "Response"} · phrase ${Math.floor(index / 2) + 1} of ${duetCycles} · ${patterns.find(pattern => pattern.id === queue[index]?.patternId)?.name ?? ""} · ${phase}` : `Drill ${index + 1} of ${queue.length} · ${playingRemaining} seconds remaining · ${phase}`}</p><p>Next: {activeDuet ? `${duetRoles[index + 1] === "call" ? activeDuet.playerOne : activeDuet.playerTwo} · ${patterns.find(pattern => pattern.id === queue[index + 1]?.patternId)?.name ?? 'End of duet'}` : patterns.find(pattern => pattern.id === queue[index + 1]?.patternId)?.name ?? 'End of rehearsal'}</p><button type="button" onClick={() => { setStage('idle'); setActiveDuet(null); launched.current = false; onStop(); setMessage('Rehearsal cancelled.'); }}>Cancel rehearsal</button></div>}
    {duetDone && activeDuet && <section className="trainer-challenge-scorecard" aria-live="polite"><h4>Call-and-response duet results</h4><p>{activeDuet.callPattern.name} ↔ {activeDuet.responsePattern.name}</p><ol>{duetResults.map((item, index) => <li key={`${item.round.id}-${index}`}><strong>{item.player} · {item.role === "call" ? "Call" : "Response"}</strong><span>{item.round.patternName} · {challengeScore(item.round) === null ? "Score unavailable · check input quality" : `${challengeScore(item.round)}% accuracy`}</span></li>)}</ol><button type="button" className="button-secondary" disabled={!duetResults.length} onClick={exportDuet}>Download duet report (JSON)</button><small>Player labels are local to this rehearsal and only included if you download the report. Audio, device IDs, and learner profile IDs are excluded.</small></section>}
    {challengeDone && activeChallenge && <section className="trainer-challenge-scorecard" aria-live="polite"><h4>{activeChallenge.title} · results</h4><p>{activeChallenge.goal} · target {activeChallenge.targetAccuracy}%</p><label>Player name or class code (optional)<input maxLength={80} value={playerLabel} onChange={event => setPlayerLabel(event.target.value)} placeholder="Leave blank to keep the report anonymous" /></label><ol>{activeChallenge.patterns.map(item => { const result = challengeResults.find(roundResult => roundResult.patternId === item.id); const accuracy = result ? challengeScore(result) : null; const passed = accuracy !== null && accuracy >= activeChallenge.targetAccuracy; return <li key={item.id} className={passed ? 'passed' : 'needs-work'}><strong>{item.name}</strong><span>{accuracy === null ? result ? 'Score unavailable · check input quality' : 'Not completed' : `${accuracy}% · ${passed ? 'Target met' : `Target ${activeChallenge.targetAccuracy}%`}`}</span></li>; })}</ol><div className="trainer-challenge-score-actions"><button type="button" className="button-secondary" disabled={!failedChallengeSteps.length} onClick={retryFailed}>Retry below-target patterns ({failedChallengeSteps.length})</button><button type="button" className="button-secondary" onClick={() => exportResults("json")}>Download JSON report</button><button type="button" className="button-secondary" onClick={() => exportResults("csv")}>Download CSV report</button></div><small>Reports include the assignment results and selected label only; recordings, device IDs, and learner profile IDs are excluded.</small></section>}
    <p role="status">{message}</p>
  </details>;
}
