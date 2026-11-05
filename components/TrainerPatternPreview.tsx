"use client";

import { useMemo, useState } from "react";
import type { Instrument, PracticePattern } from "@/lib/types";

const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

export function TrainerPatternPreview({ pattern, bpm, disabled, onPreview }: {
  pattern: PracticePattern;
  bpm: number;
  disabled: boolean;
  onPreview: (speed: 1 | 0.75 | 0.5, voice?: Instrument) => void;
}) {
  const [speed, setSpeed] = useState<1 | 0.75 | 0.5>(1);
  const [voice, setVoice] = useState<"all" | Instrument>("all");
  const availableVoices = useMemo(() => voices.filter(item => pattern.hits.some(hit => hit.instrument === item)), [pattern.hits]);
  return <section className="trainer-pattern-preview" aria-label="Listen to selected pattern">
    <div><strong>Hear this groove first</strong><small>{pattern.name} · reference at {Math.max(pattern.tempoRange[0], Math.round(bpm * speed))} BPM</small></div>
    <label>Playback speed<select value={speed} disabled={disabled} onChange={event => setSpeed(Number(event.target.value) as typeof speed)}><option value={1}>Current tempo</option><option value={0.75}>75% speed</option><option value={0.5}>50% speed</option></select></label>
    <label>Listen for<select value={voice} disabled={disabled} onChange={event => setVoice(event.target.value as typeof voice)}><option value="all">Full kit</option>{availableVoices.map(item => <option key={item} value={item}>{item} only</option>)}</select></label>
    <button type="button" className="button-secondary" disabled={disabled} onClick={() => onPreview(speed, voice === "all" ? undefined : voice)}>Play pattern reference</button>
    <small>Listen for the pulse and the selected voice, then play the pattern yourself.</small>
  </section>;
}
