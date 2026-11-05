"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { useLocalization } from "./LocalizationProvider";

const HOME_SHORTCUTS_KEY = "drum-hero:home-shortcuts:v1";
const MAX_SHORTCUTS = 6;

const shortcutOptions = [
  { id: "learn", href: "/learn", label: "dashboard.tool.learn.title" },
  { id: "trainer", href: "/trainer", label: "Trainer" },
  { id: "practice", href: "/practice", label: "Practice Pad" },
  { id: "sight-reading", href: "/sight-reading", label: "Sight reading" },
  { id: "ear-training", href: "/ear-training", label: "Rhythm ear training" },
  { id: "improvisation", href: "/improvisation", label: "Improvisation" },
  { id: "song-library", href: "/song-library", label: "dashboard.tool.songs.title" },
  { id: "grooves", href: "/grooves", label: "dashboard.tool.grooves.title" },
  { id: "rudiments", href: "/rudiments", label: "dashboard.tool.rudiments.title" }
] as const;

type ShortcutId = (typeof shortcutOptions)[number]["id"];
const defaultShortcuts: ShortcutId[] = ["learn", "grooves", "rudiments"];
const shortcutIds = new Set<string>(shortcutOptions.map((item) => item.id));

function parseShortcuts(raw: string | null): ShortcutId[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return defaultShortcuts;
    const parsed = [...new Set(value.filter((id): id is ShortcutId => typeof id === "string" && shortcutIds.has(id)))].slice(0, MAX_SHORTCUTS);
    return parsed.length ? parsed : defaultShortcuts;
  } catch { return defaultShortcuts; }
}

export function HomeShortcutPicker({ profileId }: { profileId: string }) {
  const { t } = useLocalization();
  const storageKey = learnerStorageKey(HOME_SHORTCUTS_KEY, profileId);
  const [selected, setSelected] = useState<ShortcutId[]>(defaultShortcuts);

  useEffect(() => {
    const load = () => {
      try { setSelected(parseShortcuts(window.localStorage.getItem(storageKey))); }
      catch { setSelected(defaultShortcuts); }
    };
    const timer = window.setTimeout(load, 0);
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === storageKey) load(); };
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); };
  }, [storageKey]);

  const updateSelected = (id: ShortcutId, checked: boolean) => {
    const next = checked ? [...selected, id] : selected.filter((item) => item !== id);
    if (!next.length || next.length > MAX_SHORTCUTS) return;
    setSelected(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the selection for this visit. */ }
  };

  const orderedShortcuts = [
    ...selected.map((id) => shortcutOptions.find((item) => item.id === id)).filter((item): item is (typeof shortcutOptions)[number] => !!item)
  ];

  return <div className="dashboard-explore">
    <div className="section-heading dashboard-section-heading"><div><span className="eyebrow">{t("Explore")}</span><h2>{t("Build your skills.")}</h2></div></div>
    <details className="home-shortcut-settings">
      <summary>{t("Customize Home shortcuts")}</summary>
      <p>{t("Choose up to six activities for this learner profile. The rest remain available from search and navigation.")}</p>
      <fieldset>
        <legend>{t("Show between one and six shortcuts")}</legend>
        {shortcutOptions.map((item) => <label key={item.id}>
          <input type="checkbox" checked={selected.includes(item.id)} disabled={(!selected.includes(item.id) && selected.length >= MAX_SHORTCUTS) || (selected.includes(item.id) && selected.length === 1)} onChange={(event) => updateSelected(item.id, event.target.checked)} />
          {t(item.label)}
        </label>)}
      </fieldset>
    </details>
    <nav className="dashboard-shortcuts" aria-label={t("Your shortcuts")}>
      {orderedShortcuts.map((item) => <Link className="dashboard-shortcut" href={item.href} key={item.id}><span>{t(item.label)}</span><span aria-hidden="true">↗</span></Link>)}
    </nav>
  </div>;
}
