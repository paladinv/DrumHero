"use client";

import { useState } from "react";
import { DEFAULT_IMPROVISATION_SETTINGS, normalizeImprovisationSettings, type ImprovisationSettings } from "@/lib/improvisation";
import { useLocalization } from "./LocalizationProvider";
import { ImprovisationPhrasePreview } from "./ImprovisationPhrasePreview";
import styles from "./ImprovisationStudio.module.css";

const lessons = [
  { id: "backbeat", title: "Rock backbeat", description: "Keep snare accents on beats two and four, then use the spaces between them for short answers.", focus: "Steady pulse with a clear backbeat", settings: { style: "rock", groove: "straight", prompt: "backbeat" } },
  { id: "half-time", title: "Half-time pocket", description: "Let the snare land less often. Keep the pulse steady while each phrase feels wider.", focus: "Fewer snare accents over the same pulse", settings: { style: "rock", groove: "half-time", prompt: "free" } },
  { id: "funk", title: "Funk syncopation", description: "Use short offbeat kick ideas and leave room for the main pulse to stay clear.", focus: "A syncopated kick against a stable pulse", settings: { style: "funk", groove: "style", prompt: "space" } },
  { id: "shuffle", title: "Shuffle triplets", description: "Feel each beat as a long-short triplet pair. Keep the kick and snare relaxed instead of rushing the short note.", focus: "Triplet subdivision and swing", settings: { style: "shuffle", groove: "style", subdivision: "triplet", prompt: "free" } },
  { id: "motif", title: "Motif variation", description: "Repeat a small rhythmic idea, then change its ending so the listener can hear both sameness and change.", focus: "Repeat an idea, vary its ending", settings: { style: "jazz", groove: "style", prompt: "motif" } },
] as const;

export function ImprovisationVocabulary({ settings, disabled, onApply }: { settings: ImprovisationSettings; disabled: boolean; onApply: (settings: ImprovisationSettings) => void }) {
  const { t } = useLocalization();
  const [selectedId, setSelectedId] = useState<(typeof lessons)[number]["id"]>(lessons[0].id);
  const lesson = lessons.find(item => item.id === selectedId) ?? lessons[0];
  const preview = normalizeImprovisationSettings({ ...DEFAULT_IMPROVISATION_SETTINGS, ...settings, ...lesson.settings, mode: "guided", phrases: 1, bars: 2, bpm: Math.min(120, Math.max(60, settings.bpm)), challenge: "none", cyclePrompts: false });
  return <section className="card" aria-label={t("Groove vocabulary lessons")}>
    <h2>{t("Groove vocabulary")}</h2>
    <p>{t("Explore a short musical idea, hear it in notation, and load it into your practice setup.")}</p>
    <div className={styles.settings}>
      <label>{t("Groove idea")}<select value={selectedId} disabled={disabled} onChange={event => setSelectedId(event.target.value as typeof selectedId)}>{lessons.map(item => <option key={item.id} value={item.id}>{t(item.title)}</option>)}</select></label>
      <div><strong>{t("Listening focus")}</strong><p>{t(lesson.focus)}</p></div>
    </div>
    <p>{t(lesson.description)}</p>
    <ImprovisationPhrasePreview settings={preview} disabled={disabled} />
    <button type="button" className="button-secondary" disabled={disabled} onClick={() => onApply(preview)}>{t("Use this groove")}</button>
  </section>;
}
