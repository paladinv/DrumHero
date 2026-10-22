"use client";

import { useMemo, useState } from "react";
import { trainerFillFacets } from "@/lib/trainer-next";
import type { Groove } from "@/lib/types";

export function TrainerFillBrowser({ fills, selectedId, disabled, onSelect }: { fills: Groove[]; selectedId: string; disabled: boolean; onSelect: (id: string) => void }) {
  const [sticking, setSticking] = useState("All");
  const [orchestration, setOrchestration] = useState("All");
  const [length, setLength] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const rows = useMemo(() => fills.map(pattern => ({ pattern, facets: trainerFillFacets(pattern) })), [fills]);
  const choices = (key: "sticking" | "orchestration" | "length" | "difficulty") => ["All", ...new Set(rows.map(row => row.facets[key]))];
  const visible = rows.filter(row => (sticking === "All" || row.facets.sticking === sticking) && (orchestration === "All" || row.facets.orchestration === orchestration) && (length === "All" || row.facets.length === length) && (difficulty === "All" || row.facets.difficulty === difficulty));
  const selected = fills.find(item => item.id === selectedId);
  return <div className="trainer-fill-browser">
    <div className="trainer-fill-filters">
      <label>Sticking<select value={sticking} disabled={disabled} onChange={event => setSticking(event.target.value)}>{choices("sticking").map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Orchestration<select value={orchestration} disabled={disabled} onChange={event => setOrchestration(event.target.value)}>{choices("orchestration").map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Length<select value={length} disabled={disabled} onChange={event => setLength(event.target.value)}>{choices("length").map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Difficulty<select value={difficulty} disabled={disabled} onChange={event => setDifficulty(event.target.value)}>{choices("difficulty").map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <label>Fill<select value={selectedId} disabled={disabled || !fills.length} onChange={event => onSelect(event.target.value)}>
      {!visible.some(row => row.pattern.id === selectedId) && selected && <option value={selected.id}>Current selection · {selected.name}</option>}
      {visible.length ? visible.map(({ pattern, facets }) => <option key={pattern.id} value={pattern.id}>{pattern.name} · {facets.sticking} · {facets.orchestration} · {pattern.level}</option>) : <option value="">No fills match these filters</option>}
    </select></label>
    <small>{visible.length} of {fills.length} compatible fills. Facets are inferred from the fill name and drum voices so custom fill patterns stay searchable.</small>
  </div>;
}
