export type PracticeBass = {
  resume: () => Promise<void>;
  play: (part: "root" | "fifth") => void;
  close: () => Promise<void>;
};

export function createPracticeBass(): PracticeBass | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.2;
  master.connect(context.destination);

  return {
    resume: async () => { if (context.state === "suspended") await context.resume(); },
    play: (part) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const now = context.currentTime;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(part === "root" ? 65.41 : 98, now);
      oscillator.frequency.exponentialRampToValueAtTime(part === "root" ? 49 : 73.5, now + 0.19);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.52, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(now);
      oscillator.stop(now + 0.25);
    },
    close: async () => { await context.close(); }
  };
}
