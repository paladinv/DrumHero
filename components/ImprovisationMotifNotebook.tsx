"use client";

import { useEffect, useMemo, useState } from "react";
import { improvisationPhraseSettings, meterParts, playerPhraseStart, stepDuration, type ImprovisationHit, type ImprovisationTake } from "@/lib/improvisation";
import { learnerStorageKey } from "@/lib/learner-profiles";
import type { Instrument } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

export const IMPROVISATION_MOTIFS_KEY = "drum-hero:improvisation-motifs:v1";
type Motif = { id: string; name: string; meter: string; bars: number; hits: Array<{ step: number; instrument: Instrument }> };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

function readMotifs(raw: string | null): Motif[] {
  try {
    const data = JSON.parse(raw ?? "null");
    if (data?.version !== 1 || !Array.isArray(data.motifs)) return [];
    return data.motifs.slice(-12).flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Partial<Motif>;
      if (typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || typeof item.meter !== "string" || !Number.isInteger(item.bars) || !Array.isArray(item.hits) || item.hits.length < 1 || item.hits.length > 64) return [];
      const hits = item.hits.filter(hit => hit && Number.isFinite(hit.step) && hit.step >= 0 && voices.includes(hit.instrument));
      return hits.length === item.hits.length ? [{ id: item.id, name: item.name.slice(0, 64), meter: item.meter, bars: item.bars!, hits }] : [];
    });
  } catch { return []; }
}

function phraseHits(take: ImprovisationTake, phrase: number) {
  const settings = improvisationPhraseSettings(take.settings, phrase);
  const start = playerPhraseStart(take.settings, phrase), end = start + settings.bars * meterParts(settings).stepsPerBar * stepDuration(settings);
  return take.hits.filter(hit => hit.atMs >= start && hit.atMs < end).map(hit => ({ ...hit, step: (hit.atMs - start) / stepDuration(settings) }));
}

function motifCoverage(motif: Motif, take: ImprovisationTake, phrase: number) {
  const settings = improvisationPhraseSettings(take.settings, phrase);
  if (settings.meter !== motif.meter || settings.bars !== motif.bars) return null;
  const response = phraseHits(take, phrase), used = new Set<number>();
  let matched = 0;
  for (const target of motif.hits) {
    let best = -1, distance = Infinity;
    response.forEach((hit, index) => {
      const delta = Math.abs(hit.step - target.step);
      if (!used.has(index) && hit.instrument === target.instrument && delta <= 0.5 && delta < distance) { best = index; distance = delta; }
    });
    if (best >= 0) { used.add(best); matched += 1; }
  }
  return { matched, total: motif.hits.length, observed: response.length };
}

export function ImprovisationMotifNotebook({ profileId, takes, currentTake }: { profileId: string; takes: ImprovisationTake[]; currentTake?: ImprovisationTake | null }) {
  const { t } = useLocalization();
  const availableTakes = useMemo(() => [...takes, ...(currentTake && !takes.some(take => take.id === currentTake.id) ? [currentTake] : [])], [takes, currentTake]);
  const [motifs, setMotifs] = useState<Motif[]>([]), [loadedKey, setLoadedKey] = useState("");
  const [sourceTakeId, setSourceTakeId] = useState(""), [sourcePhrase, setSourcePhrase] = useState(0), [targetTakeId, setTargetTakeId] = useState(""), [name, setName] = useState("");
  const key = learnerStorageKey(IMPROVISATION_MOTIFS_KEY, profileId);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setMotifs(readMotifs(localStorage.getItem(key))); } catch { setMotifs([]); }
      setSourceTakeId(""); setTargetTakeId(""); setLoadedKey(key);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    if (loadedKey !== key) return;
    try { localStorage.setItem(key, JSON.stringify({ version: 1, motifs: motifs.slice(-12) })); } catch { /* The notebook remains usable for this visit. */ }
  }, [key, loadedKey, motifs]);

  const sourceTake = availableTakes.find(take => take.id === sourceTakeId);
  const targetTake = availableTakes.find(take => take.id === targetTakeId);
  const sourceSettings = sourceTake ? improvisationPhraseSettings(sourceTake.settings, sourcePhrase) : null;
  const sourceOptions = availableTakes.map(take => ({ take, label: `${take.name} · ${new Date(take.createdAt).toLocaleDateString()}` }));
  const saveMotif = () => {
    if (!sourceTake || !sourceSettings || motifs.length >= 12) return;
    const hits = phraseHits(sourceTake, sourcePhrase).slice(0, 64).map(hit => ({ step: hit.step, instrument: hit.instrument }));
    if (!hits.length) return;
    const item = { id: crypto.randomUUID(), name: name.trim().slice(0, 64) || t("Motif from phrase {phrase}", { phrase: sourcePhrase + 1 }), meter: sourceSettings.meter, bars: sourceSettings.bars, hits };
    setMotifs(current => [...current, item].slice(-12)); setName("");
  };

  return <section className="card" aria-label={t("Improvisation motif notebook")}>
    <h2>{t("Motif notebook")}</h2>
    <p>{t("Save a rhythm from one of your takes, then see how often its notes reappear in later phrases. This is a musical reference, not a creativity score. Motifs stay on this learner profile.")}</p>
    <div className={styles.settings}>
      <label>{t("Source take")}<select value={sourceTakeId} onChange={event => { setSourceTakeId(event.target.value); setSourcePhrase(0); }}><option value="">{t("Choose a take")}</option>{sourceOptions.map(({ take, label }) => <option key={take.id} value={take.id}>{label}</option>)}</select></label>
      {sourceTake && <label>{t("Phrase to save")}<select value={sourcePhrase} onChange={event => setSourcePhrase(Number(event.target.value))}>{Array.from({ length: sourceTake.phrases }, (_, phrase) => <option value={phrase} key={phrase}>{t("Phrase {phrase}", { phrase: phrase + 1 })}</option>)}</select></label>}
      <label>{t("Motif name")}<input maxLength={64} value={name} onChange={event => setName(event.target.value)} placeholder={t("e.g. Opening rhythm")} /></label>
      <button type="button" className="button-secondary" disabled={!sourceTake || !phraseHits(sourceTake, sourcePhrase).length || motifs.length >= 12} onClick={saveMotif}>{t("Save phrase as motif")}</button>
    </div>
    {motifs.length > 0 && <>
      <label className={styles.rating}>{t("Track motif across take")}<select value={targetTakeId} onChange={event => setTargetTakeId(event.target.value)}><option value="">{t("Choose a take")}</option>{sourceOptions.map(({ take, label }) => <option key={take.id} value={take.id}>{label}</option>)}</select></label>
      <ul className={styles.history}>{motifs.map(motif => <li key={motif.id}><strong>{motif.name}</strong> · {motif.meter} · {motif.hits.length} {t("notes")}<button type="button" className="button-secondary" onClick={() => setMotifs(current => current.filter(item => item.id !== motif.id))}>{t("Delete motif {name}", { name: motif.name })}</button>
        {targetTake && <ol aria-label={t("Motif appearances in {name}", { name: targetTake.name })}>{Array.from({ length: targetTake.phrases }, (_, phrase) => {
          const coverage = motifCoverage(motif, targetTake, phrase);
          return <li key={phrase}>{t("Phrase {phrase}", { phrase: phrase + 1 })}: {coverage ? t("{matched} of {total} motif notes found · {observed} notes played", { matched: coverage.matched, total: coverage.total, observed: coverage.observed }) : t("Different meter or phrase length")}</li>;
        })}</ol>}
      </li>)}</ul>
    </>}
    {!motifs.length && <p>{t("Save a phrase from a captured take to start your notebook.")}</p>}
  </section>;
}
