"use client";

import { useState } from "react";
import { improvisationScoreGrid, meterParts, type ImprovisationSettings } from "@/lib/improvisation";
import type { Instrument } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

export function ImprovisationChallengeBuilder({ settings, onChange }: { settings: ImprovisationSettings; onChange: (settings: ImprovisationSettings) => void }) {
  const { t } = useLocalization();
  const [targetVoice, setTargetVoice] = useState<Instrument>(settings.customChallenge.hits.at(-1)?.instrument ?? "snare");
  const { numerator, stepsPerPulse } = meterParts(settings);
  const beatCount = settings.bars * numerator;
  const grid = improvisationScoreGrid(settings);
  const toggleAllowed = (voice: Instrument) => {
    const current = settings.customChallenge.allowed;
    const allowed = current.includes(voice) ? current.filter(item => item !== voice) : [...current, voice];
    if (!allowed.length) return;
    onChange({ ...settings, customChallenge: { ...settings.customChallenge, allowed } });
  };
  const toggleTarget = (step: number) => {
    const exists = settings.customChallenge.hits.some(hit => hit.step === step && hit.instrument === targetVoice);
    const hits = exists
      ? settings.customChallenge.hits.filter(hit => !(hit.step === step && hit.instrument === targetVoice))
      : [...settings.customChallenge.hits, { step, instrument: targetVoice }].slice(-128);
    const allowed = exists || settings.customChallenge.allowed.includes(targetVoice) ? settings.customChallenge.allowed : [...settings.customChallenge.allowed, targetVoice];
    onChange({ ...settings, customChallenge: { ...settings.customChallenge, hits, allowed } });
  };
  const toggleRest = (beat: number) => {
    const rests = settings.customChallenge.rests.includes(beat)
      ? settings.customChallenge.rests.filter(item => item !== beat)
      : [...settings.customChallenge.rests, beat];
    const start = beat * stepsPerPulse, end = start + stepsPerPulse;
    const hits = rests.includes(beat) ? settings.customChallenge.hits.filter(hit => hit.step < start || hit.step >= end) : settings.customChallenge.hits;
    onChange({ ...settings, customChallenge: { ...settings.customChallenge, rests, hits } });
  };

  return <section className={styles.challengeBuilder} aria-label={t("Custom challenge builder")}>
    <h3>{t("Design the response rules")}</h3>
    <p>{t("Outlined notes are required targets. Mark silent beats and choose which drums are allowed. Extra notes are otherwise welcome.")}</p>
    <label>{t("Target drum")}<select value={targetVoice} onChange={event => setTargetVoice(event.target.value as Instrument)}>{VOICES.map(voice => <option key={voice} value={voice}>{t(voice)}</option>)}</select></label>
    <div className={styles.challengeGrid} role="group" aria-label={t("Custom target notes on the score grid")}>
      {grid.map((mark, index) => {
        const active = settings.customChallenge.hits.some(hit => hit.step === mark.step && hit.instrument === targetVoice);
        const blocked = settings.customChallenge.rests.includes(Math.floor(mark.step / stepsPerPulse));
        const beat = Math.floor(mark.step / stepsPerPulse);
        const label = mark.label ?? String(Math.round(mark.step * 4) + 1);
        return <button type="button" key={`${mark.step}-${index}`} disabled={blocked} aria-pressed={active} aria-label={t("Toggle {voice} target at count {count}", { voice: t(targetVoice), count: label })} className={`${active ? styles.grooveOn : ""} ${mark.beat ? styles.grooveBarStart : ""}`} onClick={() => toggleTarget(mark.step)}>{label}</button>;
      })}
    </div>
    <fieldset className={styles.settings}><legend>{t("Allowed drums")}</legend>
      {VOICES.map(voice => <label className={styles.check} key={voice}><input type="checkbox" checked={settings.customChallenge.allowed.includes(voice)} disabled={settings.customChallenge.hits.some(hit => hit.instrument === voice)} onChange={() => toggleAllowed(voice)} />{t(voice)}</label>)}
    </fieldset>
    <div className={styles.customRestGrid} role="group" aria-label={t("Custom requested rests")}>
      <strong>{t("Leave these displayed beats empty")}</strong>
      {Array.from({ length: beatCount }, (_, beat) => <button type="button" key={beat} aria-pressed={settings.customChallenge.rests.includes(beat)} className={`${settings.customChallenge.rests.includes(beat) ? styles.grooveOn : ""} ${beat > 0 && beat % numerator === 0 ? styles.grooveBarStart : ""}`} onClick={() => toggleRest(beat)}>{t("Bar {bar}, beat {beat}", { bar: Math.floor(beat / numerator) + 1, beat: beat % numerator + 1 })}</button>)}
    </div>
    <p>{t("This challenge repeats the same rules in each player phrase. Change meter or bar length to redraw its score grid.")}</p>
  </section>;
}
