import type { Instrument } from "./types";

export type DrumAudio = { click: (accent?: boolean) => void; hit: (instrument: Instrument) => void; close: () => void };

export function createDrumAudio(): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const tone = (frequency: number, duration: number, gainValue = 0.13, type: OscillatorType = "sine") => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  };
  return {
    click: (accent = false) => tone(accent ? 1300 : 900, 0.045, 0.09, "square"),
    hit: (instrument) => {
      const settings: Record<Instrument, [number, number, OscillatorType]> = { kick:[72,0.16,"sine"], snare:[190,0.09,"sawtooth"], hihat:[3100,0.035,"square"], tom:[125,0.14,"sine"], crash:[2100,0.22,"sawtooth"] };
      const [frequency, duration, type] = settings[instrument]; tone(frequency, duration, instrument === "hihat" ? 0.035 : 0.11, type);
    },
    close: () => { void context.close(); }
  };
}

declare global { interface Window { webkitAudioContext?: typeof AudioContext; render_game_to_text?: () => string; advanceTime?: (ms: number) => void } }
