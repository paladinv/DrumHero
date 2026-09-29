"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CUSTOM_GROOVES_EVENT, parseCustomGrooves, readCustomGrooves, writeCustomGrooves } from "@/lib/custom-grooves";
import type { Groove, Instrument, PatternHit, Rudiment } from "@/lib/types";

const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const voiceLabel: Record<Instrument, string> = { kick: "K", snare: "S", hihat: "H", tom: "T", crash: "C" };

export function PatternLibrary({ items, kind }: { items: Array<Groove | Rudiment>; kind: "groove" | "rudiment" }) {
  const [level, setLevel] = useState("All");
  const [query, setQuery] = useState("");
  const [customGrooves, setCustomGrooves] = useState<Groove[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [name, setName] = useState("");
  const [style, setStyle] = useState("Custom");
  const [bpm, setBpm] = useState(80);
  const [subdivision, setSubdivision] = useState<8 | 16>(8);
  const [hits, setHits] = useState<PatternHit[]>([]);
  const [builderMessage, setBuilderMessage] = useState("");

  useEffect(() => {
    const load = () => setCustomGrooves(readCustomGrooves());
    const timer = window.setTimeout(load, 0);
    window.addEventListener(CUSTOM_GROOVES_EVENT, load);
    return () => { window.clearTimeout(timer); window.removeEventListener(CUSTOM_GROOVES_EVENT, load); };
  }, []);

  const libraryItems = useMemo(() => kind === "groove" ? [...items, ...customGrooves] : items, [customGrooves, items, kind]);
  const styles = useMemo(() => [...new Set(libraryItems.flatMap((item) => "style" in item ? [item.style] : []))].sort(), [libraryItems]);
  const [styleFilter, setStyleFilter] = useState("All");
  const filtered = useMemo(() => libraryItems.filter((item) =>
    (level === "All" || item.level === level) &&
    (styleFilter === "All" || ("style" in item && item.style === styleFilter)) &&
    (!query.trim() || `${item.name} ${item.description} ${"style" in item ? item.style + " " + item.focus : ""}`.toLowerCase().includes(query.trim().toLowerCase()))
  ), [libraryItems, level, query, styleFilter]);

  const toggleCell = (step: number, instrument: Instrument) => setHits((current) => {
    const old = current.find((hit) => hit.step === step && hit.instrument === instrument);
    if (!old) return [...current, { step, instrument }];
    if (!old.accent) return current.map((hit) => hit === old ? { ...hit, accent: true } : hit);
    return current.filter((hit) => hit !== old);
  });

  const saveCustomGroove = () => {
    const title = name.trim();
    if (!title) { setBuilderMessage("Add a name before saving your groove."); return; }
    if (!hits.length) { setBuilderMessage("Add at least one drum hit to the pattern."); return; }
    const levelForPattern = subdivision === 16 || hits.length > 18 ? "Advanced" : hits.length > 10 ? "Intermediate" : "Beginner";
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const next: Groove = {
      id,
      name: title,
      level: levelForPattern,
      description: `A custom ${subdivision === 8 ? "eighth-note" : "sixteenth-note"} groove created in Drum Hero.`,
      subdivision,
      beats: 4,
      defaultBpm: bpm,
      tempoRange: [Math.max(40, bpm - 25), Math.min(200, bpm + 35)],
      style: style.trim() || "Custom",
      focus: "Keep the pulse steady and shape the accents.",
      meter: "4/4",
      feel: "straight",
      hits: hits.slice().sort((a, b) => a.step - b.step)
    };
    const updated = [...customGrooves, next].slice(-100);
    if (!writeCustomGrooves(updated)) { setBuilderMessage("Could not save this groove in browser storage."); return; }
    setCustomGrooves(updated);
    setLevel("All"); setStyleFilter("All"); setQuery(""); setName(""); setHits([]); setBuilderOpen(false); setBuilderMessage("");
  };

  const deleteCustomGroove = (id: string) => {
    const updated = customGrooves.filter((item) => item.id !== id);
    if (writeCustomGrooves(updated)) setCustomGrooves(updated);
  };

  return <>
    <section className="groove-library-tools" aria-label={`${kind} library filters`}>
      <div><span className="eyebrow">{kind === "groove" ? `${libraryItems.length} grooves · ${customGrooves.length} custom` : "Technique library"}</span><h2>{kind === "groove" ? "Choose a pocket." : "Choose a rudiment."}</h2></div>
      <div className="groove-library-filters">
        <label>Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "groove" ? "Try funk, shuffle, odd meter…" : "Find a rudiment…"} /></label>
        <label>Level<select value={level} onChange={(event) => setLevel(event.target.value)}><option>All</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        {kind === "groove" && <label>Style<select value={styleFilter} onChange={(event) => setStyleFilter(event.target.value)}><option>All</option>{styles.map((item) => <option key={item}>{item}</option>)}</select></label>}
        {kind === "groove" && <button type="button" className="button" onClick={() => setBuilderOpen((open) => !open)}>{builderOpen ? "Close builder" : "Create a groove"}</button>}
      </div>
    </section>
    {kind === "groove" && <p className="groove-key" aria-label="Pattern key"><strong>Read each step:</strong> K kick · S snare · H hi-hat guide · T tom · C crash · + simultaneous hits · A accent. In the custom builder, cycle each cell through rest, hit, and accent.</p>}
    {kind === "groove" && builderOpen && <section className="card custom-groove-builder" aria-label="Custom groove builder">
      <div><span className="eyebrow">Make it yours</span><h2>Build a four beat groove.</h2><p>Click a cell to add a hit, click again to accent it, then click once more to clear it. Your grooves stay in this browser and appear in the Trainer.</p></div>
      <div className="custom-groove-fields"><label>Groove name<input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. My backbeat variation" /></label><label>Style<input maxLength={40} value={style} onChange={(event) => setStyle(event.target.value)} /></label><label>Starting tempo<input type="number" min={40} max={200} value={bpm} onChange={(event) => setBpm(Math.max(40, Math.min(200, Number(event.target.value) || 80)))} /></label><label>Grid<select value={subdivision} onChange={(event) => { setSubdivision(Number(event.target.value) as 8 | 16); setHits([]); }}><option value={8}>Eighth notes · 8 steps</option><option value={16}>Sixteenth notes · 16 steps</option></select></label></div>
      <div className="custom-groove-grid" aria-label={`${subdivision} step groove editor`}>
        <div className="custom-groove-row custom-groove-count" style={{ gridTemplateColumns: `72px repeat(${subdivision}, minmax(28px,1fr))` }}><span>Voice</span>{Array.from({ length: subdivision }, (_, step) => <small key={step}>{step + 1}</small>)}</div>
        {voices.map((instrument) => <div className="custom-groove-row" key={instrument} style={{ gridTemplateColumns: `72px repeat(${subdivision}, minmax(28px,1fr))` }}><strong>{instrument}</strong>{Array.from({ length: subdivision }, (_, step) => {
          const hit = hits.find((item) => item.step === step && item.instrument === instrument);
          const status = !hit ? "rest" : hit.accent ? "accent" : "hit";
          return <button key={step} type="button" className={`custom-groove-cell ${status}`} aria-pressed={Boolean(hit)} aria-label={`Step ${step + 1}, ${instrument}: ${status}. Activate to cycle.`} onClick={() => toggleCell(step, instrument)}>{hit ? voiceLabel[instrument] + (hit.accent ? "A" : "") : "·"}</button>;
        })}</div>)}
      </div>
      <p className="custom-groove-guidance">Difficulty is estimated from the step density and subdivision. Use accents to create a dynamics exercise.</p>
      <div className="transport"><button className="button" type="button" onClick={saveCustomGroove}>Save groove</button><button className="button-secondary" type="button" onClick={() => { setHits([]); setBuilderMessage(""); }}>Clear steps</button></div>
      {builderMessage && <p role="status">{builderMessage}</p>}
    </section>}
    {filtered.length ? <section className="card-grid" aria-label={`${kind} patterns`}>{filtered.map((item) => {
      const cells = Math.round(item.beats * (item.subdivision / 4));
      const cellLabels = Array.from({ length: cells }, (_, step) => {
        const stepHits = item.hits.filter((hit) => hit.step === step);
        const label = stepHits.map((hit) => `${voiceLabel[hit.instrument]}${hit.accent ? "A" : ""}`).join("+");
        return { step, label };
      });
      const isCustom = item.id.startsWith("custom-");
      return <article className={`card level-${item.level}`} key={item.id}>
        <span className="level-mark">{item.level} · {item.defaultBpm} BPM{isCustom ? " · Custom" : ""}</span><h3>{item.name}</h3><p>{item.description}</p>
        {"sticking" in item ? <><div className="sticking" aria-label={`Sticking ${item.sticking}`}>{item.sticking}</div><p><strong>Coach:</strong> {item.coaching}</p></> : <>
          <div className="chips"><span className="chip">{item.style}</span><span className="chip">{item.meter ?? `${item.beats}/4`}</span><span className="chip">{item.feel === "triplet" ? "Triplet feel" : `${item.subdivision} step grid`}</span></div>
          <p><strong>Focus:</strong> {item.focus}</p>
          <div className="groove-step-preview" role="img" aria-label={`${item.name} pattern, steps left to right: ${cellLabels.map(({ step, label }) => `${step + 1} ${label || "rest"}`).join(", ")}`} style={{ gridTemplateColumns: `repeat(${cells}, minmax(26px,1fr))` }}>{cellLabels.map(({ step, label }) => <span className={label.includes("A") ? "accented" : ""} key={step}><small>{step + 1}</small><b>{label || "·"}</b></span>)}</div>
        </>}
        <div className="transport"><Link className="button" href={`/trainer?pattern=${item.id}`}>Train {kind}</Link><Link className="button-secondary" href={`/practice?pattern=${item.id}`}>Practice Pad</Link>{isCustom && <button className="button-secondary" type="button" onClick={() => deleteCustomGroove(item.id)} aria-label={`Delete custom groove ${item.name}`}>Delete</button>}</div>
      </article>;
    })}</section> : <div className="empty-state"><h3>No {kind} match that filter</h3><p>Change the search, level, or style to see more patterns.</p></div>}
  </>;
}
