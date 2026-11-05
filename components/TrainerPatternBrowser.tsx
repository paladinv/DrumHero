"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { PracticePattern } from "@/lib/types";

type PatternKind = "groove" | "fill" | "rudiment" | "song" | "custom";
type PatternBrowserState = { favorites: string[]; recent: string[] };

function storageKey(profileId: string) {
  return `drum-hero:trainer-pattern-browser:v1:${profileId}`;
}

function readState(key: string): PatternBrowserState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object") return { favorites: [], recent: [] };
    const record = value as Record<string, unknown>;
    const clean = (input: unknown) => Array.isArray(input)
      ? input.filter((item): item is string => typeof item === "string" && item.length <= 200).slice(0, 30)
      : [];
    return { favorites: clean(record.favorites), recent: clean(record.recent).slice(0, 10) };
  } catch { return { favorites: [], recent: [] }; }
}

function kindOf(pattern: PracticePattern, rudimentIds: Set<string>): PatternKind {
  if (rudimentIds.has(pattern.id)) return "rudiment";
  if (pattern.id.startsWith("song:")) return "song";
  if (pattern.id.startsWith("custom-")) return "custom";
  if ("style" in pattern && /fill/i.test(String(pattern.style))) return "fill";
  return "groove";
}

function meterOf(pattern: PracticePattern) {
  if ("meter" in pattern && typeof pattern.meter === "string") {
    const match = pattern.meter.match(/(\d+\s*\/\s*\d+)/);
    if (match) return match[1]!.replaceAll(" ", "");
  }
  if (pattern.subdivision === 8 && pattern.beats % 3 === 0) return `${pattern.beats}/8`;
  return `${pattern.beats}/4`;
}

export const TrainerPatternBrowser = memo(function TrainerPatternBrowser({ patterns, selectedId, profileId, rudimentIds, disabled, nameFor, onSelect }: {
  patterns: PracticePattern[];
  selectedId: string;
  profileId: string;
  rudimentIds: Set<string>;
  disabled: boolean;
  nameFor: (pattern: PracticePattern) => string;
  onSelect: (pattern: PracticePattern) => void;
}) {
  const key = storageKey(profileId);
  const [saved, setSaved] = useState<PatternBrowserState>({ favorites: [], recent: [] });
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | PatternKind>("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [level, setLevel] = useState("all");
  const [meter, setMeter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSaved(readState(key)); setReady(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);

  const meters = useMemo(() => [...new Set(patterns.map(meterOf))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [patterns]);
  const styles = useMemo(() => [...new Set(patterns.map(pattern => "style" in pattern ? String(pattern.style) : "Groove"))].sort(), [patterns]);
  const levels = useMemo(() => [...new Set(patterns.map(pattern => pattern.level))].sort(), [patterns]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return patterns.filter(pattern => {
      const title = nameFor(pattern);
      const tags = "tags" in pattern && Array.isArray(pattern.tags) ? pattern.tags.join(" ") : "";
      const styleText = "style" in pattern ? String(pattern.style) : "";
      const text = `${title} ${pattern.name} ${pattern.description} ${styleText} ${tags} ${pattern.id}`.toLocaleLowerCase();
      return (!normalized || text.includes(normalized)) && (kind === "all" || kindOf(pattern, rudimentIds) === kind) &&
        (styleFilter === "all" || ("style" in pattern ? String(pattern.style) : "Groove") === styleFilter) &&
        (level === "all" || pattern.level === level) && (meter === "all" || meterOf(pattern) === meter) &&
        (!favoritesOnly || saved.favorites.includes(pattern.id));
    }).sort((a, b) => Number(saved.favorites.includes(b.id)) - Number(saved.favorites.includes(a.id)) || nameFor(a).localeCompare(nameFor(b)));
  }, [favoritesOnly, kind, level, meter, nameFor, patterns, query, rudimentIds, saved.favorites, styleFilter]);

  const persist = (next: PatternBrowserState) => {
    setSaved(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Favorites remain usable for this visit. */ }
  };
  const choose = (pattern: PracticePattern) => {
    persist({ ...saved, recent: [pattern.id, ...saved.recent.filter(id => id !== pattern.id)].slice(0, 10) });
    onSelect(pattern);
  };
  const toggleFavorite = (patternId: string) => {
    const favorites = saved.favorites.includes(patternId)
      ? saved.favorites.filter(id => id !== patternId)
      : [patternId, ...saved.favorites].slice(0, 30);
    persist({ ...saved, favorites });
  };
  const recentPatterns = saved.recent.flatMap(id => {
    const item = patterns.find(pattern => pattern.id === id);
    return item ? [item] : [];
  });

  return <section className="trainer-pattern-browser" aria-label="Find a practice pattern">
    <label>Find a pattern<input type="search" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} placeholder="Search grooves, fills, styles…" /></label>
    <div className="trainer-pattern-filters">
      <label>Type<select value={kind} disabled={disabled} onChange={event => setKind(event.target.value as typeof kind)}><option value="all">All types</option><option value="groove">Grooves</option><option value="fill">Fills</option><option value="rudiment">Rudiments</option><option value="song">Song parts</option><option value="custom">Custom patterns</option></select></label>
      <label>Style<select value={styleFilter} disabled={disabled} onChange={event => setStyleFilter(event.target.value)}><option value="all">All styles</option>{styles.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Level<select value={level} disabled={disabled} onChange={event => setLevel(event.target.value)}><option value="all">All levels</option>{levels.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Meter<select value={meter} disabled={disabled} onChange={event => setMeter(event.target.value)}><option value="all">All meters</option>{meters.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <div className="trainer-pattern-browser-tools">
      <button type="button" className="button-secondary" aria-pressed={favoritesOnly} disabled={disabled || !saved.favorites.length} onClick={() => setFavoritesOnly(value => !value)}>{favoritesOnly ? "Show all patterns" : `Show favorites (${saved.favorites.length})`}</button>
      {recentPatterns.length > 0 && <div className="trainer-pattern-recent"><span>Recent:</span>{recentPatterns.slice(0, 4).map(item => <button key={item.id} type="button" className="button-secondary" disabled={disabled} onClick={() => choose(item)}>{nameFor(item)}</button>)}</div>}
    </div>
    <p className="trainer-pattern-count" aria-live="polite">{ready ? `${visible.length} pattern${visible.length === 1 ? "" : "s"} found` : "Loading saved patterns…"}</p>
    <ul className="trainer-pattern-results">
      {visible.slice(0, 80).map(item => <li key={item.id}>
        <button type="button" className={`trainer-pattern-choice${item.id === selectedId ? " is-selected" : ""}`} aria-pressed={item.id === selectedId} disabled={disabled} onClick={() => choose(item)}>
          <strong>{nameFor(item)}</strong><span>{kindOf(item, rudimentIds)} · {item.level} · {meterOf(item)}</span>
        </button>
        <button type="button" className="trainer-pattern-favorite" aria-label={`${saved.favorites.includes(item.id) ? "Remove from" : "Add to"} favorite patterns: ${nameFor(item)}`} aria-pressed={saved.favorites.includes(item.id)} disabled={disabled} onClick={() => toggleFavorite(item.id)}>{saved.favorites.includes(item.id) ? "★" : "☆"}</button>
      </li>)}
    </ul>
    {visible.length > 80 && <small>Showing the first 80 matches. Narrow the search to find a specific pattern.</small>}
    {!visible.length && <p>No patterns match those filters. Try a broader search.</p>}
  </section>;
});
