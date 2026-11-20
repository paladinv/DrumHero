"use client";

import { useState } from "react";
import { DEFAULT_DRUM_MIX, type DrumMixSettings } from "@/lib/audio";
import { normalizeDrumMix } from "@/lib/song-builder-settings";
import { SONG_INSTRUMENTS, type SongInstrument } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

const voices: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "tom", "crash", "ride", "rimshot"];
const presets = {
  natural: { name: "Natural", sample: 0, pitch: 0, decay: 1, level: 0.82 },
  punchy: { name: "Punchy", sample: 1, pitch: 1, decay: 0.78, level: 0.92 },
  dry: { name: "Dry", sample: 0, pitch: -1, decay: 0.48, level: 0.78 },
  bright: { name: "Bright", sample: 2, pitch: 2, decay: 0.88, level: 0.86 },
} as const;

export function ImprovisationKitEditor({ mix, disabled, onChange }: { mix: DrumMixSettings; disabled: boolean; onChange: (mix: DrumMixSettings) => void }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const patchVoice = (voice: SongInstrument, key: "levels" | "pan" | "sampleIndex" | "pitch" | "decay" | "muted", value: number | boolean) => {
    const normalized = normalizeDrumMix(mix);
    onChange(normalizeDrumMix({ ...normalized, [key]: { ...normalized[key], [voice]: value } }));
  };
  const applyPreset = (preset: keyof typeof presets) => {
    const selected = presets[preset];
    const sampleIndex = { ...DEFAULT_DRUM_MIX.sampleIndex };
    const pitch = { ...DEFAULT_DRUM_MIX.pitch };
    const decay = { ...DEFAULT_DRUM_MIX.decay };
    const levels = { ...DEFAULT_DRUM_MIX.levels };
    for (const voice of voices) {
      sampleIndex[voice] = selected.sample;
      pitch[voice] = selected.pitch;
      decay[voice] = selected.decay;
      levels[voice] = selected.level;
    }
    onChange(normalizeDrumMix({ ...mix, sampleIndex, pitch, decay, levels, muted: DEFAULT_DRUM_MIX.muted, solo: "" }));
  };
  return <details className={`${styles.advanced} ${styles.kitEditor}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Customize drum sounds")}</summary>
    <p>{t("Choose a kit character, then adjust each voice. These settings affect this practice session and its replay.")}</p>
    <div className={styles.transport} role="group" aria-label={t("Drum sound presets")}>
      {(Object.keys(presets) as Array<keyof typeof presets>).map(key => <button key={key} type="button" className="button-secondary" disabled={disabled} onClick={() => applyPreset(key)}>{t(presets[key].name)}</button>)}
      <button type="button" className="button-secondary" disabled={disabled} onClick={() => onChange(DEFAULT_DRUM_MIX)}>{t("Reset kit")}</button>
    </div>
    <div className={styles.kitRows}>
      {voices.map(voice => <fieldset key={voice} className={styles.kitVoice}>
        <legend>{t(voice)}</legend>
        <label>{t("Sample")}<select disabled={disabled} value={mix.sampleIndex[voice]} onChange={event => patchVoice(voice, "sampleIndex", Number(event.target.value))}>{Array.from({ length: voice === "snare" || voice === "tom" || voice === "rimshot" ? 3 : 4 }, (_, index) => <option value={index} key={index}>{t("Sound {number}", { number: index + 1 })}</option>)}</select></label>
        <label>{t("Level")}<input aria-label={t("{voice} level", { voice: t(voice) })} type="range" min="0" max="1" step="0.05" disabled={disabled} value={mix.levels[voice]} onChange={event => patchVoice(voice, "levels", Number(event.target.value))} /></label>
        <label>{t("Pitch")} · {mix.pitch[voice]} st<input aria-label={t("{voice} pitch", { voice: t(voice) })} type="range" min="-12" max="12" step="1" disabled={disabled} value={mix.pitch[voice]} onChange={event => patchVoice(voice, "pitch", Number(event.target.value))} /></label>
        <label>{t("Decay")}<input aria-label={t("{voice} decay", { voice: t(voice) })} type="range" min="0.1" max="1" step="0.05" disabled={disabled} value={mix.decay[voice]} onChange={event => patchVoice(voice, "decay", Number(event.target.value))} /></label>
        <label>{t("Pan")}<input aria-label={t("{voice} pan", { voice: t(voice) })} type="range" min="-1" max="1" step="0.1" disabled={disabled} value={mix.pan[voice]} onChange={event => patchVoice(voice, "pan", Number(event.target.value))} /></label>
        <label className={styles.check}><input type="checkbox" disabled={disabled} checked={mix.muted[voice]} onChange={event => patchVoice(voice, "muted", event.target.checked)} />{t("Mute {voice}", { voice: t(voice) })}</label>
      </fieldset>)}
    </div>
    <small>{t("Output voices available in the full Song Builder kit: {count}.", { count: SONG_INSTRUMENTS.length })}</small>
  </details>;
}
