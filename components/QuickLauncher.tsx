"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { lessons, patterns } from "@/lib/curriculum";
import { useLocalization } from "./LocalizationProvider";

type LauncherItem = { href: string; title: string; detail: string; group: "Pages" | "Lessons" | "Grooves and rudiments" | "Songs"; search: string };
type SavedSongSearchItem = { id: string; title: string; artist: string; bpm: number; tags: string[] };
const SONG_LIBRARY_STORAGE_KEY = "drum-hero:song-library:v1";

const pages = [
  ["/assessment", "Initial skill assessment", "placement starting point skills test results"],
  ["/practice/session", "Guided practice", "daily session warmup focus music resume timer"],
  ["/", "Home", "dashboard practice plan recommended next"],
  ["/learn", "Learn", "curriculum lesson class"],
  ["/trainer", "Trainer", "timing midi microphone practice"],
  ["/improvisation", "Improvisation", "trading fours creative musical prompts bass jam"],
  ["/sight-reading", "Sight reading", "notation reading rhythm practice"],
  ["/ear-training", "Ear Training", "rhythm listening memory hear identify reproduce"],
  ["/practice", "Practice Pad", "keyboard touch practice"],
  ["/rudiments", "Rudiments", "sticking technique hands"],
  ["/grooves", "Grooves", "fills rhythm patterns"],
  ["/play-alongs", "Play-alongs", "backing band tempo"],
  ["/song-library", "Song Library", "repertoire arrangements"],
  ["/song-builder", "Song Builder", "compose create arrange"],
  ["/kit", "Kit Guide", "drum setup voices"],
  ["/progress", "Progress", "history backup teacher classroom"],
  ["/about", "About", "help privacy accessibility"]
] as const;

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function readSavedSongs(): SavedSongSearchItem[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(SONG_LIBRARY_STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as { songs?: unknown }).songs)) return [];
    return ((raw as { songs: unknown[] }).songs).slice(0, 1000).flatMap((item): SavedSongSearchItem[] => {
      if (!item || typeof item !== "object") return [];
      const song = item as { id?: unknown; title?: unknown; artist?: unknown; bpm?: unknown; tags?: unknown; archived?: unknown };
      if (song.archived === true || typeof song.id !== "string" || typeof song.title !== "string" || typeof song.artist !== "string") return [];
      return [{
        id: song.id.slice(0, 120),
        title: song.title.slice(0, 160),
        artist: song.artist.slice(0, 120),
        bpm: typeof song.bpm === "number" && Number.isFinite(song.bpm) ? Math.max(0, Math.min(300, song.bpm)) : 0,
        tags: Array.isArray(song.tags) ? song.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30) : []
      }];
    });
  } catch { return []; }
}

function scoreItem(item: LauncherItem, query: string) {
  const title = normalize(item.title);
  const search = normalize(`${item.search} ${item.detail}`);
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (search.includes(query)) return 3;
  const words = query.split(/\s+/).filter(Boolean);
  return words.length && words.every((word) => title.includes(word) || search.includes(word)) ? 4 : -1;
}

export function QuickLauncher() {
  const { t } = useLocalization();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [savedSongs, setSavedSongs] = useState<SavedSongSearchItem[]>([]);

  useEffect(() => {
    const load = () => setSavedSongs(readSavedSongs());
    const timer = window.setTimeout(load, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === SONG_LIBRARY_STORAGE_KEY) load(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("drum-hero:song-library-change", load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("drum-hero:song-library-change", load);
    };
  }, []);

  const items = useMemo<LauncherItem[]>(() => [
    ...pages.map(([href, title, search]) => ({ href, title: t(title), detail: t("Pages"), group: "Pages" as const, search })),
    ...lessons.map((lesson) => ({
      href: `/learn?lesson=${encodeURIComponent(lesson.id)}`,
      title: t(`lesson.${lesson.id}.title`),
      detail: `${t(lesson.level)} · ${lesson.duration} min`,
      group: "Lessons" as const,
      search: `${lesson.id} ${lesson.summary} ${lesson.goals.join(" ")}`
    })),
    ...(query.trim() ? [{
      href: `/song-library?q=${encodeURIComponent(query.trim())}`,
      title: t("Search Song Library for {query}", { query: query.trim() }),
      detail: t("Songs"),
      group: "Songs" as const,
      search: "song library repertoire"
    }] : []),
    ...savedSongs.map((song) => ({
      href: `/song-library?song=${encodeURIComponent(song.id)}`,
      title: song.title,
      detail: [song.artist, song.bpm ? `${song.bpm} BPM` : ""].filter(Boolean).join(" · ") || t("Songs"),
      group: "Songs" as const,
      search: `${song.id} ${song.artist} ${song.tags.join(" ")}`
    })),
    ...patterns.map((pattern) => ({
      href: `/trainer?pattern=${encodeURIComponent(pattern.id)}`,
      title: t(pattern.name),
      detail: `${pattern.level} · ${pattern.defaultBpm} BPM`,
      group: "Grooves and rudiments" as const,
      search: `${pattern.id} ${pattern.name} ${pattern.description} ${"focus" in pattern ? pattern.focus : ""} ${"sticking" in pattern ? pattern.sticking : ""}`
    }))
  ], [query, savedSongs, t]);

  const results = useMemo(() => {
    const normalized = normalize(query.trim());
    if (!normalized) return items.slice(0, 12);
    return items
      .map((item) => ({ item, score: scoreItem(item, normalized) }))
      .filter((result) => result.score >= 0)
      .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 18)
      .map(({ item }) => item);
  }, [items, query]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setQuery("");
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);
  const groups = ["Pages", "Lessons", "Grooves and rudiments", "Songs"] as const;

  return <>
    <button className="quick-launcher-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${t("Search Drum Hero")} (Ctrl or Command K)`}>
      <span aria-hidden="true">⌕</span><span>{t("Search Drum Hero")}</span><kbd>Ctrl/⌘ K</kbd>
    </button>
    <dialog ref={dialogRef} className="quick-launcher" aria-labelledby="quick-launcher-title" onClose={close} onClick={(event) => { if (event.target === dialogRef.current) close(); }}>
      <div className="quick-launcher-panel">
        <div className="quick-launcher-heading"><h2 id="quick-launcher-title">{t("Search Drum Hero")}</h2><button type="button" className="button-secondary" onClick={close} aria-label={t("Close")}>×</button></div>
        <label className="quick-launcher-search"><span className="sr-only">{t("Search pages, lessons, grooves, rudiments, and songs")}</span><span aria-hidden="true">⌕</span><input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search pages, lessons, grooves, rudiments, and songs")} autoComplete="off" /></label>
        <p className="quick-launcher-hint">{t("Press Ctrl K or Command K anytime")}</p>
        <div className="quick-launcher-results" aria-label={t("Search Drum Hero")}>
          {groups.map((group) => {
            const groupItems = results.filter((item) => item.group === group);
            return groupItems.length ? <section className="quick-launcher-group" key={group} aria-label={t(group)}>
              <h3>{t(group)}</h3>
              {groupItems.map((item) => <Link className="quick-launcher-result" key={item.href} href={item.href} aria-current={pathname === item.href.split("?")[0] ? "page" : undefined} onClick={close}>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span><span aria-hidden="true">↗</span>
              </Link>)}
            </section> : null;
          })}
          {results.length === 0 && <p className="quick-launcher-empty" role="status">{t("No results. Try another search.")}</p>}
        </div>
      </div>
    </dialog>
  </>;
}
