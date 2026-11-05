export type PracticeBass = {
  resume: () => Promise<void>;
  play: (part: "root" | "fifth") => void;
  schedule: (part: "root" | "fifth", atMs: number, frequency?: number) => void;
  scheduleChord: (frequencies: number[], atMs: number) => void;
  setLevel: (level: number) => void;
  silence: () => void;
  close: () => Promise<void>;
};

export function createPracticeBass(): PracticeBass | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.2;
  master.connect(context.destination);

  const active = new Set<OscillatorNode>();
  const silence = () => { active.forEach(node => { try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }); active.clear(); };
  const scheduleTone = (frequency: number, atMs: number, duration: number, amplitude: number) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const now = context.currentTime + Math.max(0, atMs - performance.now()) / 1000;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.99, now + duration * 0.8);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(amplitude, now + 0.016);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      active.add(oscillator);
      oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + duration + 0.01);
    };
  const play = (part: "root" | "fifth", atMs = performance.now(), frequency?: number) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const now = context.currentTime + Math.max(0, atMs - performance.now()) / 1000;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency ?? (part === "root" ? 65.41 : 98), now);
      oscillator.frequency.exponentialRampToValueAtTime((frequency ?? (part === "root" ? 65.41 : 98)) * 0.75, now + 0.19);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.52, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(envelope);
      envelope.connect(master);
      active.add(oscillator);
      oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + 0.25);
    };
  return {
    resume: async () => { if (context.state === "suspended") await context.resume(); },
    play: (part) => play(part),
    schedule: play,
    scheduleChord: (frequencies, atMs) => frequencies.slice(0, 4).forEach(frequency => scheduleTone(frequency, atMs, 0.44, 0.18 / Math.max(1, frequencies.length))),
    setLevel: level => { master.gain.value = Math.max(0, Math.min(1, level)) * 0.28; },
    silence,
    close: async () => { silence(); await context.close(); }
  };
}
