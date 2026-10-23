export type PracticeBass = {
  resume: () => Promise<void>;
  play: (part: "root" | "fifth") => void;
  schedule: (part: "root" | "fifth", atMs: number, frequency?: number) => void;
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
    silence,
    close: async () => { silence(); await context.close(); }
  };
}
