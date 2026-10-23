import type { PracticePattern } from "./types";

export type TrainerBackingStyle = "rock" | "funk" | "shuffle";
export type TrainerBackingNote = { step: number; kind: "bass" | "chord" | "shaker"; frequency: number; duration: number; level: number };

export function trainerBackingNotes(pattern: PracticePattern, style: TrainerBackingStyle): TrainerBackingNote[] {
  const stepsPerBeat = pattern.subdivision / 4;
  const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
  const bars = Math.max(1, Number(meter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1));
  const beatsPerBar = pattern.beats / bars;
  const barSteps = Math.max(1, Math.round(beatsPerBar * stepsPerBeat));
  const totalSteps = Math.max(1, Math.round(pattern.beats * stepsPerBeat));
  const roots = [55, 65.4, 73.4, 49];
  const notes: TrainerBackingNote[] = [];
  for (let step = 0; step < totalSteps; step += 1) {
    const bar = Math.floor(step / barSteps);
    const localStep = step % barSteps;
    const beat = Math.floor(localStep / stepsPerBeat);
    const withinBeat = localStep % stepsPerBeat;
    const root = roots[bar % roots.length];
    const bassHit = beat === 0 || beat === 2 || (style === "funk" && beat === 1 && withinBeat === stepsPerBeat - 1);
    const chordHit = style === "shuffle" ? (withinBeat === 0 && (beat === 1 || beat === 3)) : (withinBeat === 0 && (beat === 1 || beat === 3));
    if (bassHit) notes.push({ step, kind: "bass", frequency: beat === 2 ? root * 1.5 : root, duration: 0.22, level: 0.095 });
    if (chordHit) notes.push({ step, kind: "chord", frequency: root * 2, duration: 0.14, level: 0.035 });
    const swungOffbeat = style === "shuffle" && (stepsPerBeat === 3 ? withinBeat === 2 : withinBeat === stepsPerBeat - 1);
    const straightOffbeat = style !== "shuffle" && stepsPerBeat >= 2 && withinBeat === Math.floor(stepsPerBeat / 2);
    if (swungOffbeat || straightOffbeat) notes.push({ step, kind: "shaker", frequency: 3600, duration: 0.045, level: 0.012 });
  }
  return notes;
}

export function scheduleTrainerBackingWindow(context: AudioContext, pattern: PracticePattern, style: TrainerBackingStyle, bpm: number, startAtMs: number, nowMs: number, windowMs: number, scheduled: Set<number>, activeNodes?: Set<AudioScheduledSourceNode>) {
  const events = trainerBackingNotes(pattern, style);
  const stepsPerBeat = pattern.subdivision / 4;
  const totalSteps = Math.max(1, Math.round(pattern.beats * stepsPerBeat));
  const stepMs = 60_000 / bpm / stepsPerBeat;
  const first = Math.max(0, Math.floor((nowMs - startAtMs) / stepMs));
  const last = Math.floor((nowMs + windowMs - startAtMs) / stepMs);
  for (let absoluteStep = first; absoluteStep <= last; absoluteStep += 1) {
    const atMs = startAtMs + absoluteStep * stepMs;
    if (atMs < nowMs - 80 || atMs > nowMs + windowMs) continue;
    const step = absoluteStep % totalSteps;
    events.forEach((event, index) => {
      if (event.step !== step) return;
      const key = absoluteStep * 32 + index;
      if (scheduled.has(key)) return;
      scheduled.add(key);
      const eventAt = context.currentTime + Math.max(0, (atMs - performance.now()) / 1000);
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = event.kind === "bass" ? "sine" : event.kind === "chord" ? "triangle" : "sawtooth";
      oscillator.frequency.setValueAtTime(event.frequency, eventAt);
      filter.type = event.kind === "shaker" ? "highpass" : "lowpass";
      filter.frequency.setValueAtTime(event.kind === "shaker" ? 4200 : 1200, eventAt);
      gain.gain.setValueAtTime(0.0001, eventAt);
      gain.gain.exponentialRampToValueAtTime(event.level, eventAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, eventAt + event.duration);
      oscillator.connect(filter); filter.connect(gain); gain.connect(context.destination);
      if (activeNodes) {
        activeNodes.add(oscillator);
        oscillator.addEventListener("ended", () => activeNodes.delete(oscillator), { once: true });
      }
      oscillator.start(eventAt); oscillator.stop(eventAt + event.duration + 0.01);
    });
  }
}
