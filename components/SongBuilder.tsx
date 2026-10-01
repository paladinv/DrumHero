"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createDrumAudio, DEFAULT_DRUM_MIX, type DrumAudio } from "@/lib/audio";
import { CUSTOM_GROOVES_EVENT, readCustomGrooves } from "@/lib/custom-grooves";
import { grooves } from "@/lib/curriculum";
import { allSongs, emptySongLibrary, newSong, normalizeSong, readSongLibrary, writeSongLibrary, type DrumPart, type DrumSong, type SongClip, type SongLibraryState, type SongSection } from "@/lib/song-library";
import { buildArrangementBars, BUILDER_VOICES, cleanMeterLabel, gridBeatLabel, grooveToPart, humanizeArrangementBars, makeBlankPart, meterBeats, partStepCount, sectionClips, varyDrumPart, VOICE_LABEL, type ArrangementBar, type GrooveVariation } from "@/lib/song-builder";
import { arrangementMidi, arrangementMusicXml, arrangementWav, canvasPng, canvasesPdf, drawNotationPage, SHEET_HEIGHT, SHEET_WIDTH, type NotationView } from "@/lib/song-builder-export";
import { DEFAULT_SONG_BUILDER_SETTINGS, readSongBuilderSettings, SONG_INSTRUMENTS, writeSongBuilderSettings, type SongBuilderKitPreset, type SongBuilderSettings } from "@/lib/song-builder-settings";
import { importMidiSong } from "@/lib/song-builder-import";
import { ARRANGEMENT_TEMPLATES, createArrangementTemplate, type ArrangementTemplateId } from "@/lib/song-builder-templates";
import { makeSongProjectFile, MAX_PROJECT_SAMPLE_BYTES, readSongProjectFile } from "@/lib/song-builder-project";
import { deleteCustomSample, readCustomSampleRecords, readCustomSamples, saveCustomSample, saveCustomSampleBlob } from "@/lib/song-builder-samples";
import type { Groove, SongHitArticulation, SongInstrument } from "@/lib/types";

type PlaybackMode = "idle" | "loading" | "count-in" | "playing" | "paused" | "finished";
type PlaybackCue = { at: number; kind: "click" | "hit"; instrument?: SongInstrument; accent?: boolean; velocity?: number; barIndex: number };
type TrackBar = ArrangementBar & { startsAt: number; duration: number };
type PlaybackTrack = { bars: TrackBar[]; cues: PlaybackCue[]; duration: number };
type Position = { barIndex: number; step: number; fraction: number; partId: string };
type SongHistory = { songId: string; past: DrumSong[]; future: DrumSong[] };
type MidiMessageLike = { data: Uint8Array; receivedTime?: number };
type MidiInputLike = { id: string; name?: string; state?: string; open: () => Promise<unknown>; onmidimessage: ((event: MidiMessageLike) => void) | null };
type MidiAccessLike = { inputs: { values: () => IterableIterator<MidiInputLike>; get: (id: string) => MidiInputLike | undefined }; onstatechange: (() => void) | null };
type MidiNavigator = Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> };

const uid = () => crypto.randomUUID();
const clampBpm = (value: number) => Math.max(40, Math.min(200, Math.round(value || 80)));
const safeName = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "drum-hero-song";
const monotonicNow = () => globalThis.performance.now();
const meterSignature = (meter: string) => cleanMeterLabel(meter).match(/(\d+)\s*\/\s*(\d+)/)?.slice(1).join("/") ?? cleanMeterLabel(meter).toLowerCase();

function copyAsPersonalSong(song: DrumSong): DrumSong {
  return { ...structuredClone(song), id: uid(), title: `${song.title} copy`, bundled: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function playbackTrack(song: DrumSong, sectionId?: string, swing = 50, clickSubdivision = 1, range?: [number, number], humanizeAmount = 0, humanizeSeed = 1729, bpmOffset = 0): PlaybackTrack {
  const unfilteredBars = buildArrangementBars(song, sectionId);
  const selectedBars = unfilteredBars.slice(Math.max(0, range ? range[0] - 1 : 0), range ? Math.max(range[0], range[1]) : undefined);
  const sourceBars = humanizeArrangementBars(selectedBars.map((bar) => ({ ...bar, bpm: clampBpm(bar.bpm + bpmOffset) })), humanizeAmount, humanizeSeed);
  const offset = sectionId ? Math.max(0, buildArrangementBars(song).find((bar) => bar.sectionId === sectionId)?.index ?? 0) : 0;
  const bars: TrackBar[] = [];
  const cues: PlaybackCue[] = [];
  let cursor = 0;
  for (const source of sourceBars) {
    const duration = source.beats * 60_000 / source.bpm;
    const bar: TrackBar = { ...source, index: source.index + offset, startsAt: cursor, duration };
    bars.push(bar);
    const quarterMs = 60_000 / source.bpm;
    const clickStep = quarterMs / Math.max(1, clickSubdivision);
    for (let clickAt = 0, subdivision = 0; clickAt < duration - 0.00001; clickAt += clickStep, subdivision += 1) {
      cues.push({ at: cursor + clickAt, kind: "click", barIndex: bar.index, accent: subdivision % clickSubdivision === 0 && clickAt === 0 });
    }
    for (const hit of source.hits) {
      const gridPosition = hit.step % source.subdivision;
      const swingableOffbeat = (source.subdivision === 8 && gridPosition % 2 === 1) || (source.subdivision === 16 && gridPosition % 4 === 2);
      const swingDelay = swingableOffbeat ? quarterMs * (Math.max(50, Math.min(75, swing)) - 50) / 100 : 0;
      const hitAt = cursor + hit.beat * quarterMs + swingDelay;
      const articulation = hit.articulation ?? "normal";
      const strikes: Array<[number, number]> = articulation === "flam" ? [[-34, 0.48], [0, 1]]
        : articulation === "drag" ? [[-58, 0.35], [-29, 0.58], [0, 1]]
        : articulation === "buzz" ? [[0, 1], [18, 0.72], [36, 0.62], [54, 0.52]]
        : [[0, 1]];
      for (const [delay, velocityScale] of strikes) cues.push({
        at: Math.max(cursor, hitAt + delay),
        kind: "hit",
        instrument: articulation === "foot-splash" ? "openhat" : hit.instrument,
        accent: hit.accent,
        velocity: Math.max(1, Math.round(hit.velocity * velocityScale)),
        barIndex: bar.index
      });
    }
    cursor += duration;
  }
  cues.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "click" ? -1 : 1));
  return { bars, cues, duration: cursor };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function encodeSample(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

function decodeSample(base64: string, type: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

export function SongBuilder({ initialSongId = "" }: { initialSongId?: string }) {
  const [library, setLibrary] = useState<SongLibraryState>(emptySongLibrary);
  const libraryRef = useRef<SongLibraryState>(emptySongLibrary());
  const [ready, setReady] = useState(false);
  const [customGrooves, setCustomGrooves] = useState<Groove[]>([]);
  const [selectedSongId, setSelectedSongId] = useState(initialSongId);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [activeClipId, setActiveClipId] = useState("");
  const [activePartId, setActivePartId] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [artistDraft, setArtistDraft] = useState("");
  const [songDraft, setSongDraft] = useState<{ songId: string; title: string; artist: string } | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "fills">("all");
  const [notationView, setNotationView] = useState<NotationView>("tab");
  const [previewScope, setPreviewScope] = useState("song");
  const [previewPage, setPreviewPage] = useState(0);
  const [playScope, setPlayScope] = useState("song");
  const [playDrums, setPlayDrums] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [loop, setLoop] = useState(false);
  const [countInBeats, setCountInBeats] = useState(4);
  const [metronomeSubdivision, setMetronomeSubdivision] = useState(1);
  const [swing, setSwing] = useState(50);
  const [builderSettings, setBuilderSettings] = useState<SongBuilderSettings>(DEFAULT_SONG_BUILDER_SETTINGS);
  const builderSettingsRef = useRef(builderSettings);
  const [midiInputs, setMidiInputs] = useState<Array<{ id: string; name: string }>>([]);
  const [midiStatus, setMidiStatus] = useState("Connect a MIDI drum kit to record hits.");
  const [midiRecording, setMidiRecording] = useState(false);
  const [kitPresetName, setKitPresetName] = useState("");
  const [kitSampleVoice, setKitSampleVoice] = useState<SongInstrument>("kick");
  const [customSampleNames, setCustomSampleNames] = useState<Partial<Record<SongInstrument, string>>>({});
  const [templateChoice, setTemplateChoice] = useState<ArrangementTemplateId>("pop-form");
  const [transitionLength, setTransitionLength] = useState<"keep" | "one-bar">("keep");
  const [transitionCrash, setTransitionCrash] = useState(false);
  const [velocityVoice, setVelocityVoice] = useState<SongInstrument>("snare");
  const [gridPaintMode, setGridPaintMode] = useState<"cycle" | "hit" | "erase">("cycle");
  const [practiceRangeStart, setPracticeRangeStart] = useState(1);
  const [practiceRangeEnd, setPracticeRangeEnd] = useState(1);
  const [grooveVariation, setGrooveVariation] = useState<GrooveVariation>("hat-lift");
  const [gridCellSize, setGridCellSize] = useState(34);
  const [selectedCell, setSelectedCell] = useState<{ instrument: SongInstrument; step: number } | null>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [hasCopiedHits, setHasCopiedHits] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [history, setHistory] = useState<SongHistory>({ songId: "", past: [], future: [] });
  const historyRef = useRef<SongHistory>({ songId: "", past: [], future: [] });
  const undoActionRef = useRef<() => void>(() => {});
  const redoActionRef = useRef<() => void>(() => {});
  const [previewSourceId, setPreviewSourceId] = useState("");
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>("idle");
  const playbackModeRef = useRef<PlaybackMode>("idle");
  const [countIn, setCountIn] = useState(4);
  const [position, setPosition] = useState<Position | null>(null);
  const [message, setMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("Changes save on this device.");
  const [playingStatus, setPlayingStatus] = useState("Playback uses the recorded drum samples.");
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const midiFileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const paintRef = useRef<{ pointerId: number; mode: "hit" | "erase" } | null>(null);
  const hitClipboardRef = useRef<Array<{ offset: number; hit: DrumPart["hits"][number] }>>([]);
  const audioSetupRef = useRef<Promise<DrumAudio | null> | null>(null);
  const audioRef = useRef<DrumAudio | null>(null);
  const timerRef = useRef<number | null>(null);
  const trackRef = useRef<PlaybackTrack | null>(null);
  const startAtRef = useRef(0);
  const countInStartRef = useRef(0);
  const lastCountRef = useRef(-1);
  const cueIndexRef = useRef(0);
  const previousPositionRef = useRef("");
  const requestRef = useRef(0);
  const pausedAtRef = useRef(0);
  const previewTimersRef = useRef<number[]>([]);
  const previewRequestRef = useRef(0);
  const draggedClipIdRef = useRef("");
  const midiAccessRef = useRef<MidiAccessLike | null>(null);
  const songRef = useRef<DrumSong | null>(null);
  const recordMidiHitRef = useRef<(instrument: SongInstrument, velocity: number, time: number) => void>(() => {});
  const practiceTempoOffsetRef = useRef(0);
  const practiceLoopCountRef = useRef(0);
  const buildPracticeTrackRef = useRef<(tempoOffset: number) => PlaybackTrack>(() => ({ bars: [], cues: [], duration: 0 }));
  const optionsRef = useRef({ playDrums, metronome, loop, countInBeats, metronomeSubdivision });

  useEffect(() => {
    optionsRef.current = { playDrums, metronome, loop, countInBeats, metronomeSubdivision };
  }, [playDrums, metronome, loop, countInBeats, metronomeSubdivision]);

  const changeBuilderSettings = (change: (current: SongBuilderSettings) => SongBuilderSettings) => {
    setBuilderSettings((current) => {
      const next = change(current);
      builderSettingsRef.current = next;
      audioRef.current?.setMix(next.mix);
      return next;
    });
  };

  const setPlaybackMode = (next: PlaybackMode) => {
    playbackModeRef.current = next;
    setPlaybackModeState(next);
  };

  const saveHistory = (next: SongHistory) => {
    historyRef.current = next;
    setHistory(next);
  };

  const clearPreview = () => {
    previewRequestRef.current += 1;
    previewTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    previewTimersRef.current = [];
    setPreviewSourceId("");
  };

  function clearClock() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stopPlayback() {
    requestRef.current += 1;
    clearClock();
    setPlaybackMode("idle");
    setPosition(null);
    trackRef.current = null;
    cueIndexRef.current = 0;
    previousPositionRef.current = "";
  }

  function persistSong(input: DrumSong, recordHistory = true, preservePlayback = false) {
    const song = normalizeSong({ ...input, bundled: false, updatedAt: new Date().toISOString() });
    if (!song) { setSavedMessage("This song could not be saved. Check its title and arrangement."); return; }
    const previous = libraryRef.current.songs.find((item) => item.id === song.id);
    const currentHistory = historyRef.current.songId === song.id ? historyRef.current : { songId: song.id, past: [], future: [] };
    if (recordHistory && previous && JSON.stringify(previous) !== JSON.stringify(song)) {
      saveHistory({ songId: song.id, past: [...currentHistory.past, previous].slice(-60), future: [] });
    } else if (currentHistory !== historyRef.current) {
      saveHistory(currentHistory);
    }
    if (!preservePlayback && playbackModeRef.current !== "idle" && playbackModeRef.current !== "finished") {
      stopPlayback();
      setMidiRecording(false);
    }
    const next = { ...libraryRef.current, songs: [...libraryRef.current.songs.filter((item) => item.id !== song.id), song].slice(-500) };
    libraryRef.current = next;
    songRef.current = song;
    setLibrary(next);
    setSelectedSongId(song.id);
    try {
      writeSongLibrary(next);
      setSavedMessage("All changes saved on this device.");
    } catch {
      setSavedMessage("Storage is full. Export a library backup before continuing to edit.");
    }
  }

  const undo = () => {
    const current = historyRef.current;
    if (!song || current.songId !== song.id || !current.past.length) return;
    const previous = current.past[current.past.length - 1];
    if (!previous) return;
    saveHistory({ songId: song.id, past: current.past.slice(0, -1), future: [...current.future, song].slice(-60) });
    persistSong(previous, false);
  };

  const redo = () => {
    const current = historyRef.current;
    if (!song || current.songId !== song.id || !current.future.length) return;
    const next = current.future[current.future.length - 1];
    if (!next) return;
    saveHistory({ songId: song.id, past: [...current.past, song].slice(-60), future: current.future.slice(0, -1) });
    persistSong(next, false);
  };

  const recordMidiHit = (instrument: SongInstrument, velocity: number, receivedAt: number) => {
    const currentSong = songRef.current;
    let track = trackRef.current;
    if (!currentSong || !track || playbackModeRef.current !== "playing" || track.duration <= 0) return;
    const rawElapsed = receivedAt - startAtRef.current;
    if (rawElapsed < 0) return;
    const elapsed = optionsRef.current.loop ? rawElapsed % track.duration : rawElapsed;
    const bar = track.bars.find((item) => elapsed >= item.startsAt && elapsed < item.startsAt + item.duration);
    if (!bar) return;
    const part = currentSong.sections.find((item) => item.id === bar.sectionId)?.parts.find((item) => item.id === bar.partId);
    if (!part) return;
    const quarterMs = 60_000 / bar.bpm;
    const stepDuration = quarterMs * 4 / part.subdivision;
    const localStep = Math.max(0, Math.round((elapsed - bar.startsAt) / stepDuration));
    const step = Math.max(0, Math.min(partStepCount(part) - 1, Math.round((bar.partBeatOffset + localStep * 4 / part.subdivision) * part.subdivision / 4)));
    const boundedVelocity = Math.max(1, Math.min(127, Math.round(velocity)));
    const existing = part.hits.find((hit) => hit.step === step && hit.instrument === instrument);
    const nextSong: DrumSong = {
      ...currentSong,
      sections: currentSong.sections.map((item) => item.id !== bar.sectionId ? item : {
        ...item,
        parts: item.parts.map((candidate) => candidate.id !== bar.partId ? candidate : {
          ...candidate,
          hits: existing
            ? candidate.hits.map((hit) => hit.step === step && hit.instrument === instrument ? { ...hit, velocity: boundedVelocity, accent: boundedVelocity >= 112, ghost: boundedVelocity < 40 } : hit)
            : [...candidate.hits, { step, instrument, velocity: boundedVelocity, accent: boundedVelocity >= 112, ghost: boundedVelocity < 40 }]
        })
      })
    };
    const currentSection = currentSong.sections.find((item) => item.id === bar.sectionId);
    persistSong(nextSong, true, true);
    setActiveSectionId(bar.sectionId);
    setActivePartId(bar.partId);
    setActiveClipId(currentSection ? sectionClips(currentSection).find((clip) => clip.partId === bar.partId)?.id ?? "" : "");
    setSelectedCell({ instrument, step });
    setMessage(`${VOICE_LABEL[instrument]} recorded at step ${step + 1}.`);
  };

  const connectMidi = async () => {
    const requestMidi = (navigator as MidiNavigator).requestMIDIAccess;
    if (!requestMidi) { setMidiStatus("Web MIDI is not available in this browser. Use the computer-keyboard layout while recording."); return; }
    try {
      const access = await requestMidi.call(navigator);
      midiAccessRef.current = access;
      const refreshInputs = () => {
        const connected = [...access.inputs.values()].filter((input) => input.state !== "disconnected").map((input) => ({ id: input.id, name: input.name || "MIDI input" }));
        setMidiInputs(connected);
        if (!connected.length) setMidiStatus("MIDI is enabled. Connect a drum kit or controller.");
        else if (!connected.some((input) => input.id === builderSettingsRef.current.midiInputId)) {
          changeBuilderSettings((current) => ({ ...current, midiInputId: connected[0]?.id ?? "" }));
          setMidiStatus(`${connected.length} MIDI input${connected.length === 1 ? "" : "s"} available.`);
        }
      };
      access.onstatechange = refreshInputs;
      refreshInputs();
      const selected = access.inputs.get(builderSettingsRef.current.midiInputId) ?? access.inputs.values().next().value;
      await selected?.open();
      if (selected) setMidiStatus(`Connected to ${selected.name || "MIDI input"}.`);
    } catch {
      setMidiStatus("MIDI access was unavailable. Check browser permission and try again.");
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = readSongLibrary();
      const storedSettings = readSongBuilderSettings();
      libraryRef.current = next;
      setLibrary(next);
      builderSettingsRef.current = storedSettings;
      setBuilderSettings(storedSettings);
      setReady(true);
      setCustomGrooves(readCustomGrooves());
      void readCustomSampleRecords().then((records) => setCustomSampleNames(Object.fromEntries(records.map((record) => [record.instrument, record.name])) as Partial<Record<SongInstrument, string>>)).catch(() => {});
      if (initialSongId) setSelectedSongId(initialSongId);
    }, 0);
    const reloadCustom = () => setCustomGrooves(readCustomGrooves());
    const reloadSongs = () => {
      const next = readSongLibrary();
      libraryRef.current = next;
      setLibrary(next);
    };
    window.addEventListener(CUSTOM_GROOVES_EVENT, reloadCustom);
    window.addEventListener("storage", reloadSongs);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CUSTOM_GROOVES_EVENT, reloadCustom);
      window.removeEventListener("storage", reloadSongs);
      if (timerRef.current) window.clearInterval(timerRef.current);
      previewRequestRef.current += 1;
      previewTimersRef.current.forEach((previewTimer) => window.clearTimeout(previewTimer));
      audioRef.current?.close();
    };
  }, [initialSongId]);

  useEffect(() => {
    const stopPainting = () => { paintRef.current = null; };
    window.addEventListener("pointerup", stopPainting);
    window.addEventListener("pointercancel", stopPainting);
    return () => {
      window.removeEventListener("pointerup", stopPainting);
      window.removeEventListener("pointercancel", stopPainting);
    };
  }, []);

  const songs = useMemo(() => allSongs(library), [library]);
  const song = songs.find((item) => item.id === selectedSongId);
  useEffect(() => { songRef.current = song ?? null; }, [song]);
  useEffect(() => {
    recordMidiHitRef.current = recordMidiHit;
  });
  useEffect(() => {
    builderSettingsRef.current = builderSettings;
    audioRef.current?.setMix(builderSettings.mix);
    if (ready) writeSongBuilderSettings(builderSettings);
  }, [builderSettings, ready]);
  useEffect(() => {
    if (!midiRecording || !builderSettings.midiInputId) return;
    const input = midiAccessRef.current?.inputs.get(builderSettings.midiInputId);
    if (!input) return;
    const onMessage = (event: MidiMessageLike) => {
      const status = event.data[0] ?? 0;
      const note = event.data[1] ?? -1;
      const velocity = event.data[2] ?? 0;
      if ((status & 0xf0) !== 0x90 || velocity <= 0) return;
      const entry = SONG_INSTRUMENTS.find((voice) => builderSettingsRef.current.midiNotes[voice] === note);
      if (entry) recordMidiHitRef.current(entry, velocity, event.receivedTime ?? monotonicNow());
    };
    input.onmidimessage = onMessage;
    void input.open().catch(() => setMidiStatus("Could not open that MIDI input."));
    return () => { if (input.onmidimessage === onMessage) input.onmidimessage = null; };
  }, [midiRecording, builderSettings.midiInputId]);
  useEffect(() => {
    if (!midiRecording) return;
    const keyboardVoices: Record<string, SongInstrument> = { a: "kick", s: "snare", d: "hihat", f: "tom", g: "crash", h: "openhat", j: "ride", k: "rimshot" };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']"))) return;
      const voice = keyboardVoices[event.key.toLowerCase()];
      if (!voice) return;
      event.preventDefault();
      recordMidiHitRef.current(voice, 92, monotonicNow());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [midiRecording]);
  useEffect(() => {
    undoActionRef.current = undo;
    redoActionRef.current = redo;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redoActionRef.current();
      else undoActionRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const section = song?.sections.find((item) => item.id === activeSectionId) ?? song?.sections[0];
  const clips = section ? sectionClips(section) : [];
  const activeClip = clips.find((item) => item.id === activeClipId) ?? clips[0];
  const part = section?.parts.find((item) => item.id === activePartId) ?? section?.parts.find((item) => item.id === activeClip?.partId);
  const selectedHit = part && selectedCell ? part.hits.find((hit) => hit.step === selectedCell.step && hit.instrument === selectedCell.instrument) : undefined;
  const stepsPerBeat = part ? part.subdivision / 4 : 1;
  const stepsPerMeasure = part ? Math.max(1, Math.round(meterBeats(part.meter || section?.meter || song?.meter || "4/4", part.beats) * stepsPerBeat)) : 1;
  const beatLabels = part ? Array.from({ length: partStepCount(part) }, (_, step) => gridBeatLabel(part.meter || section?.meter || song?.meter || "4/4", part.subdivision, step, stepsPerMeasure)) : [];
  const sources = useMemo(() => [...grooves, ...customGrooves], [customGrooves]);
  const activeMeter = part?.meter || section?.meter || song?.meter || "4/4";
  const fillSuggestions = part ? sources
    .filter((item) => /fill|transition/i.test(`${item.name} ${item.style} ${item.description}`) && meterSignature(item.meter || `${item.beats}/4`) === meterSignature(activeMeter))
    .sort((left, right) => Math.abs(left.beats - part.beats) - Math.abs(right.beats - part.beats) || left.name.localeCompare(right.name))
    .slice(0, 3) : [];
  const visibleSources = useMemo(() => sources.filter((item) => {
    const query = sourceQuery.trim().toLowerCase();
    const isFill = /fill/i.test(`${item.name} ${item.style} ${item.description}`);
    return (sourceFilter === "all" || isFill) && (!query || `${item.name} ${item.style} ${item.description} ${item.focus}`.toLowerCase().includes(query));
  }), [sources, sourceFilter, sourceQuery]);
  const notationBars = useMemo(() => {
    const selectedSong = songs.find((item) => item.id === selectedSongId);
    return selectedSong ? buildArrangementBars(selectedSong, previewScope === "song" ? undefined : previewScope) : [];
  }, [songs, selectedSongId, previewScope]);
  const playbackBars = song ? buildArrangementBars(song, playScope === "song" ? undefined : playScope) : [];
  const practiceBarCount = Math.max(1, playbackBars.length);
  const safePracticeStart = Math.max(1, Math.min(practiceBarCount, practiceRangeStart));
  const safePracticeEnd = Math.max(safePracticeStart, Math.min(practiceBarCount, practiceRangeEnd));
  const songTitleDraft = songDraft && songDraft.songId === song?.id ? songDraft.title : song?.title ?? "";
  const songArtistDraft = songDraft && songDraft.songId === song?.id ? songDraft.artist : song?.artist ?? "";
  const pageCount = Math.max(1, Math.ceil(notationBars.length / builderSettings.notation.barsPerPage));
  const currentPage = Math.max(0, Math.min(previewPage, pageCount - 1));
  const barsPerPage = builderSettings.notation.barsPerPage;
  const cursorOnPage = position && position.barIndex >= currentPage * barsPerPage && position.barIndex < (currentPage + 1) * barsPerPage ? position : null;
  const cursorPercent = cursorOnPage ? ((130 + (cursorOnPage.barIndex - currentPage * barsPerPage) * ((SHEET_WIDTH - 172) / Math.max(1, Math.min(barsPerPage, notationBars.length - currentPage * barsPerPage))) + 14 + cursorOnPage.fraction * Math.max(1, (SHEET_WIDTH - 172) / Math.max(1, Math.min(barsPerPage, notationBars.length - currentPage * barsPerPage)) - 28)) / SHEET_WIDTH) * 100 : 0;

  useEffect(() => {
    const target = previewCanvasRef.current;
    if (!target || !song) return;
    try {
      const page = drawNotationPage(song, notationBars, notationView, currentPage, null, builderSettings.notation);
      const context = target.getContext("2d");
      if (!context) return;
      target.width = page.width;
      target.height = page.height;
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(page, 0, 0);
    } catch (error) {
      console.error("Could not draw the notation preview.", error);
    }
  }, [song, notationBars, notationView, currentPage, builderSettings.notation]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    audioRef.current?.close();
  }, []);

  const updateSong = (change: (current: DrumSong) => DrumSong) => {
    if (!song) return;
    const editable = song.bundled ? copyAsPersonalSong(song) : song;
    const next = change(editable);
    persistSong(next);
  };

  const updateSection = (sectionId: string, change: (current: SongSection) => SongSection) => updateSong((current) => ({
    ...current,
    sections: current.sections.map((item) => item.id === sectionId ? change(item) : item)
  }));

  const updatePart = (partId: string, change: (current: DrumPart) => DrumPart) => {
    if (!section) return;
    updateSection(section.id, (current) => ({ ...current, parts: current.parts.map((item) => item.id === partId ? change(item) : item) }));
  };

  const createSong = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!titleDraft.trim() || !artistDraft.trim()) return;
    const fresh = newSong(titleDraft.trim(), artistDraft.trim());
    const firstSection: SongSection = { id: uid(), name: "Verse", kind: "verse", notes: "", parts: [], clips: [], repeats: 1, meter: fresh.meter };
    fresh.sections = [firstSection];
    setSelectedClipIds([]);
    setSelectedCell(null);
    setActiveSectionId(firstSection.id);
    setActiveClipId("");
    setActivePartId("");
    persistSong(fresh);
    setTitleDraft("");
    setArtistDraft("");
    setMessage("");
  };

  const addSection = () => {
    if (!song) return;
    const next: SongSection = { id: uid(), name: "New section", kind: "verse", notes: "", parts: [], clips: [], repeats: 1, meter: song.meter };
    updateSong((current) => ({ ...current, sections: [...current.sections, next] }));
    setSelectedClipIds([]);
    setSelectedCell(null);
    setActiveSectionId(next.id);
    setActiveClipId("");
    setActivePartId("");
  };

  const duplicateSection = (sectionToCopyId = section?.id) => {
    if (!song || !sectionToCopyId) return;
    const sourceSection = song.sections.find((item) => item.id === sectionToCopyId);
    if (!sourceSection) return;
    const copy = structuredClone(sourceSection);
    const idMap = new Map(copy.parts.map((item) => [item.id, uid()]));
    const duplicate: SongSection = {
      ...copy,
      id: uid(),
      name: `${sourceSection.name} copy`,
      parts: copy.parts.map((item) => ({ ...item, id: idMap.get(item.id)! })),
      clips: sectionClips(sourceSection).map((clip) => ({ ...clip, id: uid(), partId: idMap.get(clip.partId) ?? clip.partId }))
    };
    updateSong((current) => {
      const index = current.sections.findIndex((item) => item.id === sourceSection.id);
      const sections = [...current.sections];
      sections.splice(index + 1, 0, duplicate);
      return { ...current, sections };
    });
    setActiveSectionId(duplicate.id);
    setSelectedClipIds([]);
    setSelectedCell(null);
    setActiveClipId(duplicate.clips?.[0]?.id ?? "");
    setActivePartId(duplicate.clips?.[0]?.partId ?? "");
  };

  const moveSection = (sectionId: string, offset: -1 | 1) => updateSong((current) => {
    const sections = [...current.sections];
    const index = sections.findIndex((item) => item.id === sectionId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= sections.length) return current;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    return { ...current, sections };
  });

  const deleteSection = (sectionId: string) => {
    if (!song || !window.confirm("Delete this section and its patterns?")) return;
    updateSong((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== sectionId) }));
    if (activeSectionId === sectionId) { setActiveSectionId(""); setActiveClipId(""); setActivePartId(""); setSelectedClipIds([]); setSelectedCell(null); }
    if (previewScope === sectionId) setPreviewScope("song");
    if (playScope === sectionId) setPlayScope("song");
  };

  const addBlankPattern = () => {
    if (!song || !section) return;
    const next = makeBlankPart(`Pattern ${section.parts.length + 1}`, section.meter || song.meter, section.bpm || song.bpm);
    const clip = { id: uid(), partId: next.id, repeats: 1 };
    updateSection(section.id, (current) => ({ ...current, parts: [...current.parts, next], clips: [...sectionClips(current), clip] }));
    setSelectedClipIds([]);
    setSelectedCell(null);
    setActiveClipId(clip.id);
    setActivePartId(next.id);
  };

  const insertSource = (source: Groove) => {
    if (!song || !section) return;
    clearPreview();
    const emptyArrangement = song.sections.every((item) => item.parts.length === 0);
    const bpm = emptyArrangement ? source.defaultBpm : section.bpm || song.bpm;
    const next = grooveToPart(source, bpm);
    const clip: SongClip = { id: uid(), partId: next.id, repeats: 1 };
    updateSong((current) => ({
      ...current,
      bpm: emptyArrangement ? bpm : current.bpm,
      meter: emptyArrangement ? cleanMeterLabel(source.meter || current.meter) : current.meter,
      sections: current.sections.map((item) => item.id === section.id ? { ...item, parts: [...item.parts, next], clips: [...sectionClips(item), clip] } : item)
    }));
    setActiveClipId(clip.id);
    setActivePartId(next.id);
    setMessage(`${source.name} added as an editable pattern. It will play at the song tempo.`);
  };

  const prepareTransitionPart = (source: Groove) => {
    const next = grooveToPart(source, section?.bpm || song?.bpm || source.defaultBpm);
    if (transitionLength === "one-bar" && part) {
      const targetBeats = meterBeats(activeMeter, part.beats);
      const representableBeats = Math.max(0.5, Math.round(targetBeats * next.subdivision / 4) * 4 / next.subdivision);
      if (next.beats > representableBeats) {
        next.beats = representableBeats;
        next.hits = next.hits.filter((hit) => hit.step < Math.ceil(representableBeats * next.subdivision / 4));
      }
    }
    if (transitionCrash) {
      const step = Math.max(0, partStepCount(next) - 1);
      const ending = next.hits.find((hit) => hit.step === step && hit.instrument === "crash");
      if (ending) Object.assign(ending, { accent: true, velocity: Math.max(ending.velocity ?? 86, 112) });
      else next.hits.push({ step, instrument: "crash", accent: true, velocity: 112 });
    }
    return next;
  };

  const insertFillTransition = (source: Groove) => {
    if (!song || !section) return;
    clearPreview();
    const next = prepareTransitionPart(source);
    const clip: SongClip = { id: uid(), partId: next.id, repeats: 1 };
    updateSong((current) => ({
      ...current,
      sections: current.sections.map((item) => {
        if (item.id !== section.id) return item;
        const currentClips = sectionClips(item);
        const selectedIndex = currentClips.findIndex((candidate) => candidate.id === activeClip?.id);
        const insertAt = selectedIndex < 0 ? currentClips.length : selectedIndex + 1;
        return {
          ...item,
          parts: [...item.parts, next],
          clips: [...currentClips.slice(0, insertAt), clip, ...currentClips.slice(insertAt)]
        };
      })
    }));
    setSelectedClipIds([]);
    setSelectedCell(null);
    setActiveClipId(clip.id);
    setActivePartId(next.id);
    setMessage(`${source.name} inserted after ${activeClip ? part?.name : "the current section"} as an independent, editable fill.`);
  };

  const ensureDrumAudio = async () => {
    if (audioRef.current) return audioRef.current;
    if (!audioSetupRef.current) {
      audioSetupRef.current = (async () => {
        const customSamples = await readCustomSamples().catch(() => ({}));
        return createDrumAudio(builderSettingsRef.current.mix, customSamples);
      })();
    }
    const audio = await audioSetupRef.current;
    audioSetupRef.current = null;
    audioRef.current = audio;
    return audio;
  };

  const previewFillInContext = async (source: Groove) => {
    if (!part || !section || !song || !activeClip || !["idle", "finished"].includes(playbackMode)) return;
    clearPreview();
    const request = previewRequestRef.current;
    const previewToken = `context:${source.id}`;
    setPreviewSourceId(previewToken);
    const audio = await ensureDrumAudio();
    if (request !== previewRequestRef.current) return;
    if (!audio || !await audio.ready) { setMessage("Samples could not be loaded for this transition preview."); clearPreview(); return; }
    const fillPart = prepareTransitionPart(source);
    const currentBeats = meterBeats(part.meter || section.meter || song.meter, part.beats);
    const previousStart = Math.max(0, part.beats - currentBeats);
    const fillStart = currentBeats;
    const nextClip = clips[clips.findIndex((clip) => clip.id === activeClip.id) + 1];
    const nextPart = nextClip ? section.parts.find((item) => item.id === nextClip.partId) : undefined;
    const bpm = section.bpm || song.bpm;
    const quarterMs = 60_000 / bpm;
    const queue = (pattern: DrumPart | undefined, offset: number, fromBeat: number, toBeat: number) => {
      if (!pattern) return;
      for (const hit of pattern.hits) {
        const beat = hit.step * 4 / pattern.subdivision;
        if (beat < fromBeat || beat >= toBeat) continue;
        const timer = window.setTimeout(() => audio.hit(hit.instrument, hit.accent, hit.velocity ?? (hit.accent ? 118 : 86)), Math.max(0, (offset + beat - fromBeat) * quarterMs));
        previewTimersRef.current.push(timer);
      }
    };
    queue(part, 0, previousStart, part.beats);
    queue(fillPart, currentBeats, 0, fillPart.beats);
    const nextStart = currentBeats + fillPart.beats;
    queue(nextPart, nextStart, 0, Math.min(currentBeats, nextPart?.beats ?? 0));
    const previewDuration = nextStart + Math.min(currentBeats, nextPart?.beats ?? 0);
    previewTimersRef.current.push(window.setTimeout(() => {
      if (request === previewRequestRef.current) setPreviewSourceId("");
      previewTimersRef.current = [];
    }, previewDuration * quarterMs + 100));
    setMessage(nextPart ? `Previewing ${part.name} → ${source.name} → ${nextPart.name}.` : `Previewing ${part.name} → ${source.name} at the end of this section.`);
  };

  const previewSource = async (source: Groove) => {
    if (previewSourceId === source.id) { clearPreview(); return; }
    clearPreview();
    const request = previewRequestRef.current;
    setPreviewSourceId(source.id);
    const audio = await ensureDrumAudio();
    if (request !== previewRequestRef.current) return;
    if (!audio) { setMessage("Audio preview is unavailable in this browser."); setPreviewSourceId(""); return; }
    const readyAudio = await audio.ready;
    if (request !== previewRequestRef.current) return;
    if (!readyAudio) { setMessage("Drum samples could not be loaded for preview."); setPreviewSourceId(""); return; }
    const bpm = song ? section?.bpm ?? song.bpm : source.defaultBpm;
    const quarterMs = 60_000 / bpm;
    const stepMs = quarterMs * 4 / source.subdivision;
    const loopMs = source.beats * quarterMs;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      source.hits.forEach((hit) => {
        const timer = window.setTimeout(() => audio.hit(hit.instrument, hit.accent, hit.accent ? 118 : 86), repeat * loopMs + hit.step * stepMs);
        previewTimersRef.current.push(timer);
      });
    }
    previewTimersRef.current.push(window.setTimeout(() => {
      if (request === previewRequestRef.current) setPreviewSourceId("");
      previewTimersRef.current = [];
    }, loopMs * 2));
  };

  const moveClip = (clipId: string, offset: -1 | 1) => {
    if (!section) return;
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      const index = next.findIndex((item) => item.id === clipId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, clips: next };
    });
  };

  const reorderClip = (sourceId: string, targetId: string) => {
    if (!section || sourceId === targetId) return;
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      const from = next.findIndex((item) => item.id === sourceId);
      const to = next.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(from < to ? to - 1 : to, 0, moved);
      return { ...current, clips: next };
    });
  };

  const moveSelectedClips = (direction: -1 | 1) => {
    if (!section || !selectedClipIds.length) return;
    const selected = new Set(selectedClipIds);
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      if (direction < 0) {
        for (let index = 1; index < next.length; index += 1) {
          if (selected.has(next[index]?.id ?? "") && !selected.has(next[index - 1]?.id ?? "")) [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
        }
      } else {
        for (let index = next.length - 2; index >= 0; index -= 1) {
          if (selected.has(next[index]?.id ?? "") && !selected.has(next[index + 1]?.id ?? "")) [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
        }
      }
      return { ...current, clips: next };
    });
  };

  const duplicateSelectedClips = () => {
    if (!section || !selectedClipIds.length) return;
    const selected = clips.filter((clip) => selectedClipIds.includes(clip.id));
    if (!selected.length) return;
    const copiedParts: DrumPart[] = [];
    const copiedClips: SongClip[] = [];
    for (const clip of selected) {
      const original = section.parts.find((candidate) => candidate.id === clip.partId);
      if (!original) continue;
      const copy = { ...structuredClone(original), id: uid(), name: `${original.name} copy`, sourceId: undefined };
      copiedParts.push(copy);
      copiedClips.push({ id: uid(), partId: copy.id, repeats: clip.repeats });
    }
    if (!copiedClips.length) return;
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      const lastSelected = Math.max(...selected.map((clip) => next.findIndex((item) => item.id === clip.id)));
      next.splice(lastSelected + 1, 0, ...copiedClips);
      return { ...current, parts: [...current.parts, ...copiedParts], clips: next };
    });
    setSelectedClipIds(copiedClips.map((clip) => clip.id));
    setActiveClipId(copiedClips[0]?.id ?? "");
    setActivePartId(copiedClips[0]?.partId ?? "");
  };

  const duplicateClip = (clipId: string) => {
    if (!section) return;
    const index = clips.findIndex((item) => item.id === clipId);
    const clip = clips[index];
    if (!clip) return;
    const duplicate = { ...clip, id: uid(), repeats: 1 };
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      next.splice(index + 1, 0, duplicate);
      return { ...current, clips: next };
    });
    setActiveClipId(duplicate.id);
    setActivePartId(duplicate.partId);
  };

  const removeClip = (clipId: string) => {
    if (!section) return;
    updateSection(section.id, (current) => ({ ...current, clips: sectionClips(current).filter((clip) => clip.id !== clipId) }));
    if (activeClipId === clipId) setActiveClipId("");
    setSelectedClipIds((current) => current.filter((id) => id !== clipId));
  };

  const duplicatePattern = () => {
    if (!section || !part || !activeClip) return;
    const duplicate = { ...structuredClone(part), id: uid(), name: `${part.name} copy`, sourceId: undefined };
    const clip = { id: uid(), partId: duplicate.id, repeats: 1 };
    const index = clips.findIndex((item) => item.id === activeClip.id);
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      next.splice(index + 1, 0, clip);
      return { ...current, parts: [...current.parts, duplicate], clips: next };
    });
    setActiveClipId(clip.id);
    setActivePartId(duplicate.id);
  };

  const createPatternVariation = () => {
    if (!section || !part) return;
    const variation = varyDrumPart(part, grooveVariation);
    const clip: SongClip = { id: uid(), partId: variation.id, repeats: 1 };
    const index = activeClip ? clips.findIndex((item) => item.id === activeClip.id) : clips.length - 1;
    updateSection(section.id, (current) => {
      const next = [...sectionClips(current)];
      next.splice(Math.max(0, index + 1), 0, clip);
      return { ...current, parts: [...current.parts, variation], clips: next };
    });
    setSelectedCell(null);
    setActiveClipId(clip.id);
    setActivePartId(variation.id);
    setMessage(`Created an editable ${grooveVariation.replaceAll("-", " ")} variation.`);
  };

  const removePattern = () => {
    if (!section || !part || !window.confirm(`Remove ${part.name} and its arrangement clips?`)) return;
    updateSection(section.id, (current) => ({ ...current, parts: current.parts.filter((item) => item.id !== part.id), clips: sectionClips(current).filter((clip) => clip.partId !== part.id) }));
    setActiveClipId("");
    setActivePartId("");
    setSelectedCell(null);
    setSelectedClipIds([]);
  };

  const cycleCell = (instrument: SongInstrument, step: number) => {
    if (!part) return;
    setSelectedCell({ instrument, step });
    setSelectedCells([`${instrument}:${step}`]);
    const current = part.hits.find((hit) => hit.step === step && hit.instrument === instrument);
    const hits = !current
      ? [...part.hits, { step, instrument, accent: false }]
      : current.accent
        ? part.hits.filter((hit) => hit !== current)
        : part.hits.map((hit) => hit === current ? { ...hit, accent: true } : hit);
    updatePart(part.id, (item) => ({ ...item, hits }));
  };

  const selectGridCell = (event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>, instrument: SongInstrument, step: number) => {
    const key = `${instrument}:${step}`;
    setSelectedCell({ instrument, step });
    if (event.shiftKey && selectedCell?.instrument === instrument) {
      const first = Math.min(selectedCell.step, step);
      const last = Math.max(selectedCell.step, step);
      const range = Array.from({ length: last - first + 1 }, (_, index) => `${instrument}:${first + index}`);
      setSelectedCells((current) => [...new Set([...current, ...range])]);
    } else if (event.metaKey || event.ctrlKey) {
      setSelectedCells((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    } else setSelectedCells([key]);
  };

  const paintGridCell = (instrument: SongInstrument, step: number, mode: "hit" | "erase") => {
    if (!part) return;
    setSelectedCell({ instrument, step });
    const existing = part.hits.some((hit) => hit.step === step && hit.instrument === instrument);
    if ((mode === "hit" && existing) || (mode === "erase" && !existing)) return;
    updatePart(part.id, (current) => ({
      ...current,
      hits: mode === "erase"
        ? current.hits.filter((hit) => hit.step !== step || hit.instrument !== instrument)
        : [...current.hits, { step, instrument, accent: false, velocity: 86 }]
    }));
  };

  const handleGridCellClick = (event: React.MouseEvent<HTMLButtonElement>, instrument: SongInstrument, step: number) => {
    if (event.detail > 0) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) selectGridCell(event, instrument, step);
    else cycleCell(instrument, step);
  };

  const selectedHitLocations = selectedCells.flatMap((key) => {
    const [instrument, rawStep] = key.split(":");
    const step = Number(rawStep);
    return SONG_INSTRUMENTS.includes(instrument as SongInstrument) && Number.isInteger(step) ? [{ instrument: instrument as SongInstrument, step }] : [];
  });

  const copySelectedHits = () => {
    if (!part || !selectedHitLocations.length) return;
    const startStep = Math.min(...selectedHitLocations.map((cell) => cell.step));
    const selectedKeys = new Set(selectedHitLocations.map((cell) => `${cell.instrument}:${cell.step}`));
    hitClipboardRef.current = part.hits
      .filter((hit) => selectedKeys.has(`${hit.instrument}:${hit.step}`))
      .map((hit) => ({ offset: hit.step - startStep, hit: structuredClone(hit) }));
    setHasCopiedHits(hitClipboardRef.current.length > 0);
    setMessage(`${hitClipboardRef.current.length} note${hitClipboardRef.current.length === 1 ? "" : "s"} copied.`);
  };

  const pasteHits = () => {
    if (!part || !selectedCell || !hitClipboardRef.current.length) return;
    const copied = hitClipboardRef.current.flatMap(({ offset, hit }) => {
      const step = selectedCell.step + offset;
      return step < partStepCount(part) ? [{ ...hit, step }] : [];
    });
    if (!copied.length) return;
    const copiedKeys = new Set(copied.map((hit) => `${hit.instrument}:${hit.step}`));
    updatePart(part.id, (current) => ({ ...current, hits: [...current.hits.filter((hit) => !copiedKeys.has(`${hit.instrument}:${hit.step}`)), ...copied] }));
    setSelectedCells(copied.map((hit) => `${hit.instrument}:${hit.step}`));
    setMessage(`${copied.length} note${copied.length === 1 ? "" : "s"} pasted.`);
  };

  const deleteSelectedHits = () => {
    if (!part || !selectedHitLocations.length) return;
    const keys = new Set(selectedHitLocations.map((cell) => `${cell.instrument}:${cell.step}`));
    updatePart(part.id, (current) => ({ ...current, hits: current.hits.filter((hit) => !keys.has(`${hit.instrument}:${hit.step}`)) }));
    setMessage(`${keys.size} selected cell${keys.size === 1 ? "" : "s"} cleared.`);
  };

  const moveSelectedHits = (offset: -1 | 1) => {
    if (!part || !selectedHitLocations.length) return;
    const keys = new Set(selectedHitLocations.map((cell) => `${cell.instrument}:${cell.step}`));
    const moved = part.hits.filter((hit) => keys.has(`${hit.instrument}:${hit.step}`)).map((hit) => ({ ...hit, step: Math.max(0, Math.min(partStepCount(part) - 1, hit.step + offset)) }));
    const destinationKeys = new Set(moved.map((hit) => `${hit.instrument}:${hit.step}`));
    updatePart(part.id, (current) => ({ ...current, hits: [...current.hits.filter((hit) => !keys.has(`${hit.instrument}:${hit.step}`) && !destinationKeys.has(`${hit.instrument}:${hit.step}`)), ...moved] }));
    setSelectedCells(moved.map((hit) => `${hit.instrument}:${hit.step}`));
    if (moved[0]) setSelectedCell({ instrument: moved[0].instrument, step: moved[0].step });
  };

  const changeVelocity = (instrument: SongInstrument, step: number, velocity: number) => {
    if (!part) return;
    updatePart(part.id, (current) => ({ ...current, hits: current.hits.map((hit) => hit.instrument === instrument && hit.step === step ? { ...hit, velocity } : hit) }));
  };

  const changeSelectedHit = (change: (hit: DrumPart["hits"][number]) => DrumPart["hits"][number]) => {
    if (!part || !selectedCell) return;
    updatePart(part.id, (current) => ({
      ...current,
      hits: current.hits.map((hit) => hit.step === selectedCell.step && hit.instrument === selectedCell.instrument ? change(hit) : hit)
    }));
  };

  const setSelectedArticulation = (articulation: SongHitArticulation) => {
    if (!part || !selectedCell) return;
    const fromVoice = selectedCell.instrument;
    const toVoice: SongInstrument = articulation === "foot-splash" ? "openhat" : fromVoice;
    updatePart(part.id, (current) => ({
      ...current,
      hits: current.hits.map((hit) => hit.step === selectedCell.step && hit.instrument === fromVoice
        ? { ...hit, instrument: toVoice, articulation }
        : hit)
    }));
    setSelectedCell({ ...selectedCell, instrument: toVoice });
  };

  const navigateGrid = (event: React.KeyboardEvent<HTMLButtonElement>, voiceIndex: number, step: number) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const direction = directions[event.key];
    if (!direction || !part) return;
    event.preventDefault();
    const nextVoice = Math.max(0, Math.min(BUILDER_VOICES.length - 1, voiceIndex + direction[0]));
    const nextStep = Math.max(0, Math.min(partStepCount(part) - 1, step + direction[1]));
    event.currentTarget.closest(".song-builder-grid")?.querySelector<HTMLButtonElement>(`[data-song-voice="${nextVoice}"][data-song-step="${nextStep}"]`)?.focus();
  };

  const changeSubdivision = (value: number) => {
    if (!part || ![4, 8, 12, 16].includes(value)) return;
    const subdivision = value as DrumPart["subdivision"];
    const maxStep = Math.round(part.beats * subdivision / 4);
    updatePart(part.id, (current) => ({ ...current, subdivision, hits: current.hits.filter((hit) => hit.step < maxStep) }));
  };

  const exportSheet = async (format: "png" | "pdf" | "midi" | "musicxml" | "wav") => {
    if (!song) return;
    const bars = buildArrangementBars(song, previewScope === "song" ? undefined : previewScope);
    if (!bars.length) { setMessage("Add at least one pattern before exporting notation."); return; }
    try {
      const name = `${safeName(song.title)}-${safeName(previewScope === "song" ? "full-song" : song.sections.find((item) => item.id === previewScope)?.name ?? "section")}`;
      if (format === "midi") {
        downloadBlob(arrangementMidi(humanizeArrangementBars(bars, builderSettings.humanizeAmount, builderSettings.humanizeSeed), song.title, builderSettings.midiNotes), `${name}.mid`);
      } else if (format === "musicxml") {
        downloadBlob(arrangementMusicXml(bars, song.title, song.artist, builderSettings.midiNotes), `${name}.musicxml`);
      } else if (format === "wav") {
        setMessage("Rendering WAV audio from the drum samples…");
        const customSamples = await readCustomSamples().catch(() => ({}));
        downloadBlob(await arrangementWav(humanizeArrangementBars(bars, builderSettings.humanizeAmount, builderSettings.humanizeSeed), swing, builderSettings.mix, customSamples), `${name}.wav`);
      } else {
        const pages = Math.ceil(bars.length / builderSettings.notation.barsPerPage);
        if (format === "png" && pages > 30) { setMessage("This arrangement is too long for one PNG. Export the PDF or choose a section."); return; }
        const canvases = Array.from({ length: pages }, (_, page) => drawNotationPage(song, bars, notationView, page, null, builderSettings.notation));
        if (format === "pdf") {
          downloadBlob(canvasesPdf(canvases), `${name}.pdf`);
        } else {
        const image = document.createElement("canvas");
        image.width = SHEET_WIDTH;
        image.height = SHEET_HEIGHT * canvases.length;
        const context = image.getContext("2d");
        if (!context) throw new Error("This browser could not prepare the PNG download.");
        canvases.forEach((page, index) => context.drawImage(page, 0, index * SHEET_HEIGHT));
        downloadBlob(await canvasPng(image), `${name}.png`);
        }
      }
      setMessage(`${format === "musicxml" ? "MusicXML" : format.toUpperCase()} export downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The notation export failed.");
    }
  };

  const tickPlayback = () => {
    let track = trackRef.current;
    if (!track) return;
    const now = monotonicNow();
    const startAt = startAtRef.current;
    const firstBarBpm = track.bars[0]?.bpm ?? song?.bpm ?? 80;
    const beatMs = 60_000 / firstBarBpm;
    if (now < startAt) {
      setPlaybackMode("count-in");
      const beat = Math.max(0, Math.min(optionsRef.current.countInBeats - 1, Math.floor((now - countInStartRef.current) / beatMs)));
      setCountIn(optionsRef.current.countInBeats - beat);
      const clickIndex = Math.floor((now - countInStartRef.current) / (beatMs / Math.max(1, optionsRef.current.metronomeSubdivision)));
      if (clickIndex !== lastCountRef.current) {
        lastCountRef.current = clickIndex;
        if (optionsRef.current.metronome) audioRef.current?.click(clickIndex % optionsRef.current.metronomeSubdivision === 0 && clickIndex === 0);
      }
      return;
    }
    if (playbackModeRef.current !== "playing") setPlaybackMode("playing");
    let elapsed = now - startAt;
    if (track.duration > 0 && elapsed >= track.duration) {
      if (optionsRef.current.loop) {
        if (builderSettingsRef.current.practiceTempoStep <= 0) {
          const loops = Math.floor(elapsed / track.duration);
          startAtRef.current += loops * track.duration;
          practiceLoopCountRef.current += loops;
          cueIndexRef.current = 0;
          elapsed = now - startAtRef.current;
        } else {
          let advanced = 0;
          while (elapsed >= track.duration && advanced < 100) {
            startAtRef.current += track.duration;
            practiceLoopCountRef.current += 1;
            practiceTempoOffsetRef.current = Math.min(120, practiceTempoOffsetRef.current + builderSettingsRef.current.practiceTempoStep);
            track = buildPracticeTrackRef.current(practiceTempoOffsetRef.current);
            trackRef.current = track;
            cueIndexRef.current = 0;
            elapsed = now - startAtRef.current;
            advanced += 1;
          }
        }
      } else {
        const last = track.bars.at(-1);
        setPosition(last ? { barIndex: last.index, step: 0, fraction: 1, partId: last.partId } : null);
        clearClock();
        setPlaybackMode("finished");
        setMidiRecording(false);
        return;
      }
    }
    while (cueIndexRef.current < track.cues.length && track.cues[cueIndexRef.current].at <= elapsed) {
      const cue = track.cues[cueIndexRef.current++];
      if (cue.kind === "click" && optionsRef.current.metronome) audioRef.current?.click(cue.accent);
      if (cue.kind === "hit" && optionsRef.current.playDrums && cue.instrument) audioRef.current?.hit(cue.instrument, cue.accent, cue.velocity);
    }
    const current = track.bars.find((bar) => elapsed >= bar.startsAt && elapsed < bar.startsAt + bar.duration);
    if (current) {
      const beat = (elapsed - current.startsAt) * current.bpm / 60_000;
      const step = Math.max(0, Math.min(partStepCount({ beats: current.partBeats, subdivision: current.subdivision }) - 1, Math.floor((current.partBeatOffset + beat) * current.subdivision / 4)));
      const next = { barIndex: current.index, step, fraction: Math.max(0, Math.min(1, beat / current.measureBeats)), partId: current.partId };
      const signature = `${next.barIndex}:${next.step}:${next.partId}`;
      if (signature !== previousPositionRef.current) {
        previousPositionRef.current = signature;
        setPosition(next);
      }
    }
  };

  const startPlayback = async () => {
    if (!song) return;
    clearPreview();
    const scope = playScope === "song" ? undefined : playScope;
    const range: [number, number] = [safePracticeStart, safePracticeEnd];
    const buildTrack = (tempoOffset: number) => playbackTrack(songRef.current ?? song, scope, swing, metronomeSubdivision, range, builderSettings.humanizeAmount, builderSettings.humanizeSeed, tempoOffset);
    buildPracticeTrackRef.current = buildTrack;
    practiceTempoOffsetRef.current = 0;
    practiceLoopCountRef.current = 0;
    const track = buildTrack(0);
    if (!track.duration || !track.bars.length) { setMessage("Add a pattern before starting playback."); return; }
    stopPlayback();
    const request = requestRef.current;
    trackRef.current = track;
    cueIndexRef.current = 0;
    lastCountRef.current = -1;
    previousPositionRef.current = "";
    const audio = (playDrums || metronome) ? await ensureDrumAudio() : audioRef.current;
    if (requestRef.current !== request) return;
    if (audio && (playDrums || metronome)) {
      setPlaybackMode("loading");
      setPlayingStatus("Loading drum sounds…");
      const readyAudio = await audio.ready;
      if (requestRef.current !== request) return;
      setPlayingStatus(readyAudio ? "Drum sounds are ready." : "Some drum samples are unavailable; visual follow-along still works.");
    } else {
      setPlayingStatus("Visual follow-along is ready.");
    }
    const countBeatMs = 60_000 / (track.bars[0]?.bpm ?? song.bpm);
    countInStartRef.current = monotonicNow();
    startAtRef.current = countInStartRef.current + countBeatMs * countInBeats;
    pausedAtRef.current = 0;
    setCountIn(countInBeats);
    setPlaybackMode(countInBeats > 0 ? "count-in" : "playing");
    timerRef.current = window.setInterval(tickPlayback, 20);
  };

  const pausePlayback = () => {
    if (playbackModeRef.current !== "playing" && playbackModeRef.current !== "count-in") return;
    pausedAtRef.current = monotonicNow();
    clearClock();
    setPlaybackMode("paused");
  };

  const resumePlayback = () => {
    if (playbackModeRef.current !== "paused") return;
    const now = monotonicNow();
    const shift = now - pausedAtRef.current;
    startAtRef.current += shift;
    countInStartRef.current += shift;
    setPlaybackMode(now < startAtRef.current ? "count-in" : "playing");
    timerRef.current = window.setInterval(tickPlayback, 20);
  };

  const toggleLiveRecording = () => {
    if (midiRecording) {
      setMidiRecording(false);
      setMidiStatus("Live recording stopped.");
      return;
    }
    setMidiRecording(true);
    setMidiStatus("Recording armed. MIDI notes and A–K keyboard hits are quantized to the active measure.");
    if (playbackModeRef.current === "idle" || playbackModeRef.current === "finished") void startPlayback();
  };

  const saveKitPreset = () => {
    const name = kitPresetName.trim().slice(0, 40);
    if (!name) return;
    const preset: SongBuilderKitPreset = { id: uid(), name, mix: structuredClone(builderSettings.mix) };
    changeBuilderSettings((current) => ({ ...current, kitPresets: [...current.kitPresets.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), preset].slice(-20) }));
    setKitPresetName("");
    setMessage(`Kit preset “${name}” saved on this device.`);
  };

  const addArrangementTemplate = () => {
    if (!song) return;
    const nextSections = createArrangementTemplate(song, templateChoice);
    const first = nextSections[0];
    const firstClip = first ? sectionClips(first)[0] : undefined;
    updateSong((current) => ({ ...current, meter: current.sections.length ? current.meter : "4/4", sections: [...current.sections, ...nextSections] }));
    if (first && firstClip) {
      setActiveSectionId(first.id);
      setActiveClipId(firstClip.id);
      setActivePartId(firstClip.partId);
      setSelectedCell(null);
      setSelectedCells([]);
      setSelectedClipIds([]);
    }
    setMessage(`${ARRANGEMENT_TEMPLATES.find((item) => item.id === templateChoice)?.label ?? "Arrangement"} template added. Fill the blank patterns with your grooves.`);
  };

  const selectImportedSong = (imported: DrumSong) => {
    const firstSection = imported.sections[0];
    const firstClip = firstSection ? sectionClips(firstSection)[0] : undefined;
    saveHistory({ songId: imported.id, past: [], future: [] });
    setActiveSectionId(firstSection?.id ?? "");
    setActiveClipId(firstClip?.id ?? "");
    setActivePartId(firstClip?.partId ?? "");
    setSelectedCell(null);
    setSelectedCells([]);
    setSelectedClipIds([]);
    setPreviewScope("song");
    setPlayScope("song");
    persistSong(imported, false);
  };

  const importMidiFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error("MIDI files must be 16 MB or smaller.");
      const result = importMidiSong(await file.arrayBuffer(), file.name.replace(/\.midi?$/i, ""));
      selectImportedSong(result.song);
      setMessage(`Imported ${result.noteCount} drum notes${result.ignoredNoteCount ? `; skipped ${result.ignoredNoteCount} unrecognized pitches` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that MIDI file.");
    } finally {
      if (midiFileInputRef.current) midiFileInputRef.current.value = "";
    }
  };

  const exportProjectFile = async () => {
    if (!song) return;
    try {
      const records = await readCustomSampleRecords();
      const selectedCustom = records.filter((record) => builderSettings.mix.sampleIndex[record.instrument] < 0);
      const sampleBytes = selectedCustom.reduce((sum, record) => sum + record.blob.size, 0);
      if (sampleBytes > MAX_PROJECT_SAMPLE_BYTES) throw new Error("The selected custom samples exceed the 24 MB project-file limit. Choose a smaller set of custom samples, then export again.");
      const customSamples = Object.fromEntries(await Promise.all(selectedCustom.map(async (record) => [record.instrument, {
        name: record.name,
        type: record.blob.type || "audio/wav",
        base64: await encodeSample(record.blob)
      }] as const))) as Partial<Record<SongInstrument, { name: string; type: string; base64: string }>>;
      const settings = structuredClone(builderSettings);
      for (const voice of SONG_INSTRUMENTS) {
        if (settings.mix.sampleIndex[voice] < 0 && !customSamples[voice]) settings.mix.sampleIndex[voice] = 0;
      }
      const project = makeSongProjectFile(song, settings, customSamples);
      downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/vnd.drum-hero.song+json" }), `${safeName(song.title)}.drumsong.json`);
      setMessage(`Song project exported with its arrangement, mix, MIDI map${selectedCustom.length ? `, and ${selectedCustom.length} selected custom sample${selectedCustom.length === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export the song project.");
    }
  };

  const importProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("Song project files must be 64 MB or smaller.");
      const input: unknown = JSON.parse(await file.text());
      const project = readSongProjectFile(input);
      if (!project) throw new Error("That is not a supported Drum Hero song project file.");
      const existingRecords = await readCustomSampleRecords().catch(() => []);
      const availableCustomSamples = new Set(existingRecords.map((record) => record.instrument));
      const nextSampleNames = Object.fromEntries(existingRecords.map((record) => [record.instrument, record.name])) as Partial<Record<SongInstrument, string>>;
      const unavailableSamples: SongInstrument[] = [];
      for (const [voice, sample] of Object.entries(project.customSamples ?? {}) as Array<[SongInstrument, NonNullable<typeof project.customSamples>[SongInstrument]]>) {
        if (!sample) continue;
        const previousRecord = existingRecords.find((record) => record.instrument === voice);
        const blob = decodeSample(sample.base64, sample.type);
        const record = await saveCustomSampleBlob(voice, sample.name, blob);
        availableCustomSamples.add(voice);
        nextSampleNames[voice] = record.name;
        if (audioRef.current && !await audioRef.current.setCustomSample(voice, record.blob)) {
          if (previousRecord) await saveCustomSampleBlob(voice, previousRecord.name, previousRecord.blob);
          else await deleteCustomSample(voice);
          availableCustomSamples.delete(voice);
          delete nextSampleNames[voice];
          unavailableSamples.push(voice);
        }
      }
      const importedMix = structuredClone(project.mix);
      for (const voice of SONG_INSTRUMENTS) {
        if (importedMix.sampleIndex[voice] < 0 && !availableCustomSamples.has(voice)) importedMix.sampleIndex[voice] = 0;
      }
      stopPlayback();
      clearPreview();
      selectImportedSong(project.song);
      changeBuilderSettings((current) => ({ ...current, mix: importedMix, midiNotes: project.midiNotes }));
      setCustomSampleNames(nextSampleNames);
      setMessage(`Imported “${project.song.title}” with its saved mix and MIDI map${Object.keys(project.customSamples ?? {}).length ? ` and ${Object.keys(project.customSamples ?? {}).length} custom sample${Object.keys(project.customSamples ?? {}).length === 1 ? "" : "s"}` : ""}${unavailableSamples.length ? `; ${unavailableSamples.length} sample${unavailableSamples.length === 1 ? " was" : "s were"} unavailable and reverted to the built-in kit` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that song project.");
    } finally {
      if (projectFileInputRef.current) projectFileInputRef.current.value = "";
    }
  };

  const importCustomSample = async (file?: File) => {
    if (!file) return;
    try {
      const previousRecord = (await readCustomSampleRecords().catch(() => [])).find((record) => record.instrument === kitSampleVoice);
      const record = await saveCustomSample(kitSampleVoice, file);
      if (audioRef.current && !await audioRef.current.setCustomSample(kitSampleVoice, record.blob)) {
        if (previousRecord) await saveCustomSampleBlob(kitSampleVoice, previousRecord.name, previousRecord.blob);
        else await deleteCustomSample(kitSampleVoice);
        throw new Error("The browser could not decode that audio file.");
      }
      setCustomSampleNames((current) => ({ ...current, [kitSampleVoice]: record.name }));
      changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, sampleIndex: { ...current.mix.sampleIndex, [kitSampleVoice]: -1 } } }));
      setMessage(`${VOICE_LABEL[kitSampleVoice]} sample “${record.name}” saved on this device.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that custom sample.");
    }
  };

  const removeCustomSample = async () => {
    try {
      await deleteCustomSample(kitSampleVoice);
      await audioRef.current?.setCustomSample(kitSampleVoice, null);
      setCustomSampleNames((current) => { const next = { ...current }; delete next[kitSampleVoice]; return next; });
      changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, sampleIndex: { ...current.mix.sampleIndex, [kitSampleVoice]: 0 } } }));
      setMessage(`${VOICE_LABEL[kitSampleVoice]} custom sample removed.`);
    } catch { setMessage("Could not remove that custom sample from this browser."); }
  };

  if (!ready) return <p>Loading Song Builder…</p>;

  return <div className="song-builder">
    <section className="song-builder-toolbar card" aria-label="Song and playback controls">
      <div className="song-builder-song-picker">
        <label>Song<select value={selectedSongId} onChange={(event) => { stopPlayback(); clearPreview(); saveHistory({ songId: "", past: [], future: [] }); setSelectedClipIds([]); setSelectedCell(null); setSelectedCells([]); setSelectedSongId(event.target.value); setActiveSectionId(""); setActiveClipId(""); setActivePartId(""); setPreviewScope("song"); setPlayScope("song"); }}>
          <option value="">Choose a song…</option>
          {songs.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.artist}{item.bundled ? " · example" : ""}</option>)}
        </select></label>
        <Link className="button-secondary" href="/song-library">Song Library</Link>
      </div>
      {song && <div className="song-builder-transport">
        <label>Play<select aria-label="Playback range" value={playScope} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setPlayScope(event.target.value)}>
          <option value="song">Full song</option>
          {song.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {playbackMode === "idle" || playbackMode === "finished" ? <button className="button" type="button" onClick={() => void startPlayback()}>{playbackMode === "finished" ? "Play again" : "Play"}</button> : <button className="button" type="button" onClick={pausePlayback} disabled={playbackMode === "loading" || playbackMode === "paused"}>Pause</button>}
        {playbackMode === "paused" && <button className="button-secondary" type="button" onClick={resumePlayback}>Resume</button>}
        <button className="button-secondary" type="button" onClick={() => { setMidiRecording(false); stopPlayback(); }} disabled={playbackMode === "idle"}>Stop</button>
        <button className="button-secondary" type="button" onClick={undo} disabled={!history.past.length || history.songId !== song.id || !["idle", "finished"].includes(playbackMode)} title="Undo (Ctrl/Cmd+Z)">Undo</button>
        <button className="button-secondary" type="button" onClick={redo} disabled={!history.future.length || history.songId !== song.id || !["idle", "finished"].includes(playbackMode)} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>
        <label className="song-builder-check"><input type="checkbox" checked={playDrums} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setPlayDrums(event.target.checked)} /> Play drums</label>
        <label className="song-builder-check"><input type="checkbox" checked={metronome} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setMetronome(event.target.checked)} /> Metronome</label>
        <label className="song-builder-check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop range</label>
        <label className="song-builder-transport-setting">Count-in beats<select value={countInBeats} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setCountInBeats(Number(event.target.value))}>{Array.from({ length: 9 }, (_, beats) => <option key={beats} value={beats}>{beats}</option>)}</select></label>
        <label className="song-builder-transport-setting">Click subdivision<select value={metronomeSubdivision} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setMetronomeSubdivision(Number(event.target.value))}><option value={1}>Quarter</option><option value={2}>Eighth</option><option value={3}>Triplet</option><option value={4}>Sixteenth</option></select></label>
        <label className="song-builder-transport-setting song-builder-swing">Swing · {swing}%<input type="range" min={50} max={75} step={1} value={swing} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setSwing(Number(event.target.value))} /></label>
        <span className={`song-builder-play-state state-${playbackMode}`} role="status">{playbackMode === "count-in" ? `Count-in · ${countIn}` : playbackMode === "idle" || playbackMode === "finished" ? playingStatus : playbackMode}</span>
      </div>}
      {song && <details className="song-builder-more-tools">
        <summary>Recording, practice, mixer, and export settings</summary>
        <div className="song-builder-tools-grid">
          <section><h3>Live recording</h3><div className="song-builder-tool-actions"><button type="button" onClick={() => void connectMidi()}>Connect MIDI kit</button><label>MIDI input<select value={builderSettings.midiInputId} onChange={(event) => changeBuilderSettings((current) => ({ ...current, midiInputId: event.target.value }))}><option value="">Choose input…</option>{midiInputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}</select></label><button className={midiRecording ? "recording" : ""} type="button" onClick={toggleLiveRecording}>{midiRecording ? "Stop recording" : "Record live input"}</button></div><p role="status">{midiStatus}</p><small>While recording, use A kick · S snare · D closed hat · F tom · G crash · H open hat · J ride · K rimshot. Notes follow the playhead and keep their input velocity.</small></section>
          <section><h3>Practice range and feel</h3><div className="song-builder-tool-fields"><label>Start measure<select disabled={!['idle', 'finished'].includes(playbackMode)} value={safePracticeStart} onChange={(event) => { const value = Number(event.target.value); setPracticeRangeStart(value); if (value > safePracticeEnd) setPracticeRangeEnd(value); }}>{Array.from({ length: practiceBarCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><label>End measure<select disabled={!['idle', 'finished'].includes(playbackMode)} value={safePracticeEnd} onChange={(event) => setPracticeRangeEnd(Math.max(safePracticeStart, Number(event.target.value)))}>{Array.from({ length: practiceBarCount - safePracticeStart + 1 }, (_, index) => <option key={safePracticeStart + index} value={safePracticeStart + index}>{safePracticeStart + index}</option>)}</select></label><label>Raise tempo each loop<select disabled={!['idle', 'finished'].includes(playbackMode)} value={builderSettings.practiceTempoStep} onChange={(event) => changeBuilderSettings((current) => ({ ...current, practiceTempoStep: Number(event.target.value) }))}><option value={0}>Off</option><option value={1}>+1 BPM</option><option value={2}>+2 BPM</option><option value={3}>+3 BPM</option><option value={5}>+5 BPM</option></select></label></div><p>Turn on “Loop range” in the transport to repeat these measures and apply the tempo step.</p><label className="song-builder-setting-slider">Humanize timing and velocity · {builderSettings.humanizeAmount}%<input type="range" min={0} max={100} step={5} value={builderSettings.humanizeAmount} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, humanizeAmount: Number(event.target.value) }))} /></label><label>Repeatable humanize seed<input type="number" min={0} max={2147483647} value={builderSettings.humanizeSeed} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, humanizeSeed: Math.max(0, Number(event.target.value) || 0) }))} /></label></section>
          <section className="song-builder-mixer">
            <h3>Drum kit mixer</h3>
            <label>Load saved kit<select value="" onChange={(event) => { const preset = builderSettings.kitPresets.find((item) => item.id === event.target.value); if (preset) changeBuilderSettings((current) => ({ ...current, mix: structuredClone(preset.mix) })); }}><option value="">Choose a kit preset…</option>{builderSettings.kitPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
            <div className="song-builder-mix-head"><span>Voice</span><span>Level</span><span>Pan</span><span>Sample</span><span>Mute</span><span>Solo</span></div>
            {SONG_INSTRUMENTS.map((voice) => <div className="song-builder-mix-row" key={voice}>
              <strong>{VOICE_LABEL[voice]}</strong>
              <label><span className="visually-hidden">{VOICE_LABEL[voice]} volume</span><input aria-label={`${VOICE_LABEL[voice]} volume`} type="range" min={0} max={100} step={1} value={Math.round(builderSettings.mix.levels[voice] * 100)} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, levels: { ...current.mix.levels, [voice]: Number(event.target.value) / 100 } } }))} /></label>
              <label><span className="visually-hidden">{VOICE_LABEL[voice]} pan</span><input aria-label={`${VOICE_LABEL[voice]} pan`} type="range" min={-100} max={100} step={1} value={Math.round(builderSettings.mix.pan[voice] * 100)} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, pan: { ...current.mix.pan, [voice]: Number(event.target.value) / 100 } } }))} /></label>
              <label><span className="visually-hidden">{VOICE_LABEL[voice]} sample</span><select aria-label={`${VOICE_LABEL[voice]} sample`} value={builderSettings.mix.sampleIndex[voice]} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, sampleIndex: { ...current.mix.sampleIndex, [voice]: Number(event.target.value) } } }))}><option value={-1} disabled={!customSampleNames[voice]}>Custom · {customSampleNames[voice] ?? "none"}</option>{Array.from({ length: voice === "snare" || voice === "tom" || voice === "rimshot" ? 3 : 4 }, (_, index) => <option key={index} value={index}>Sample {index + 1}</option>)}</select></label>
              <label className="song-builder-mix-toggle"><input type="checkbox" aria-label={`Mute ${VOICE_LABEL[voice]}`} checked={builderSettings.mix.muted[voice]} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, muted: { ...current.mix.muted, [voice]: event.target.checked } } }))} />Mute</label>
              <button className="song-builder-solo-button" type="button" aria-pressed={builderSettings.mix.solo === voice} onClick={() => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, solo: current.mix.solo === voice ? "" : voice } }))}>Solo</button>
            </div>)}
            <div className="song-builder-tool-actions"><label>Sample voice<select value={kitSampleVoice} onChange={(event) => setKitSampleVoice(event.target.value as SongInstrument)}>{SONG_INSTRUMENTS.map((voice) => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label><label>Import sample<input type="file" accept="audio/*" onChange={(event) => void importCustomSample(event.target.files?.[0])} /></label><button type="button" onClick={() => void removeCustomSample()} disabled={!customSampleNames[kitSampleVoice]}>Remove custom</button></div>
            <p>Import a WAV, MP3, or OGG sample up to 12 MB per voice. Open hi-hats are choked when another hi-hat voice plays.</p>
            <div className="song-builder-tool-actions"><label>Save kit preset<input maxLength={40} value={kitPresetName} onChange={(event) => setKitPresetName(event.target.value)} placeholder="Warm club kit" /></label><button type="button" onClick={saveKitPreset} disabled={!kitPresetName.trim()}>Save preset</button></div>
          </section>
          <section><h3>MIDI drum map</h3><p>Choose the note numbers your DAW expects. The MIDI and MusicXML exports use this map.</p><div className="song-builder-midi-map">{SONG_INSTRUMENTS.map((voice) => <label key={voice}>{VOICE_LABEL[voice]}<input aria-label={`${VOICE_LABEL[voice]} MIDI note`} type="number" min={0} max={127} value={builderSettings.midiNotes[voice]} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, midiNotes: { ...current.midiNotes, [voice]: Math.max(0, Math.min(127, Number(event.target.value) || 0)) } }))} /></label>)}</div><button className="button-secondary" type="button" onClick={() => changeBuilderSettings((current) => ({ ...current, midiNotes: { ...DEFAULT_SONG_BUILDER_SETTINGS.midiNotes } }))}>Reset General MIDI map</button></section>
        </div>
      </details>}
    </section>

    <div className="song-builder-layout">
      <aside className="song-builder-sidebar card">
        <span className="eyebrow">Your compositions</span>
        <h2>Start a song.</h2>
        <form className="song-builder-new-song" onSubmit={createSong}>
          <label>Title<input id="song-builder-new-title" required maxLength={120} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} placeholder="e.g. The Long Way Home" /></label>
          <label>Artist<input required maxLength={120} value={artistDraft} onChange={(event) => setArtistDraft(event.target.value)} placeholder="Your name" /></label>
          <button className="button" type="submit">Create new song</button>
        </form>
        {song && <section className="song-builder-template-panel" aria-label="Arrangement templates">
          <strong>Start from an arrangement</strong>
          <label>Template<select value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value as ArrangementTemplateId)}>{ARRANGEMENT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
          <small>{ARRANGEMENT_TEMPLATES.find((template) => template.id === templateChoice)?.description}</small>
          <button type="button" onClick={addArrangementTemplate}>Add template</button>
        </section>}
        <section className="song-builder-file-tools" aria-label="Import and share song files">
          <strong>Bring in or share a song</strong>
          <button type="button" onClick={() => midiFileInputRef.current?.click()}>Import MIDI</button>
          <input ref={midiFileInputRef} className="visually-hidden" type="file" accept=".mid,.midi,audio/midi,audio/x-midi" aria-label="Choose a MIDI file" onChange={(event) => void importMidiFile(event.target.files?.[0])} />
          <button type="button" onClick={exportProjectFile} disabled={!song}>Export song project</button>
          <button type="button" onClick={() => projectFileInputRef.current?.click()}>Import song project</button>
          <input ref={projectFileInputRef} className="visually-hidden" type="file" accept=".json,application/json,application/vnd.drum-hero.song+json" aria-label="Choose a Drum Hero song project file" onChange={(event) => void importProjectFile(event.target.files?.[0])} />
        </section>
        {songs.length > 0 && <p className="song-builder-library-note">{songs.filter((item) => !item.bundled).length} personal songs · all edits are shared with your local Song Library.</p>}
        {!songs.length && <p className="song-builder-library-note">Songs are saved in this browser and are available from Song Library.</p>}
        <Link href="/song-library">Browse library and backups</Link>
      </aside>

      {song ? <div className="song-builder-main" role="region" aria-label="Song editor">
        <section className="card song-builder-song-fields">
          <div className="song-builder-song-heading">
            <div><span className="eyebrow">{song.bundled ? "Original example · edits create a copy" : "Personal song · autosaved"}</span><h2>{song.title}</h2></div>
            <span className="song-builder-save" role="status">{savedMessage}</span>
          </div>
          <div className="song-builder-fields">
            <label>Song title<input maxLength={120} value={songTitleDraft} onBlur={() => { if (!songTitleDraft.trim()) setSongDraft({ songId: song.id, title: song.title, artist: songArtistDraft }); }} onChange={(event) => { const title = event.target.value; setSongDraft({ songId: song.id, title, artist: songArtistDraft }); if (title.trim()) updateSong((current) => ({ ...current, title })); }} /></label>
            <label>Artist<input maxLength={120} value={songArtistDraft} onBlur={() => { if (!songArtistDraft.trim()) setSongDraft({ songId: song.id, title: songTitleDraft, artist: song.artist }); }} onChange={(event) => { const artist = event.target.value; setSongDraft({ songId: song.id, title: songTitleDraft, artist }); if (artist.trim()) updateSong((current) => ({ ...current, artist })); }} /></label>
            <label>Tempo · BPM<input type="number" min={40} max={200} value={song.bpm} onChange={(event) => updateSong((current) => ({ ...current, bpm: clampBpm(Number(event.target.value)) }))} /></label>
            <label>Song meter<input maxLength={40} value={song.meter} onChange={(event) => updateSong((current) => ({ ...current, meter: event.target.value.slice(0, 40) }))} /></label>
          </div>
        </section>

        <section className="card song-builder-arrangement" aria-label="Song arrangement">
          <div className="song-builder-section-heading"><div><span className="eyebrow">Arrangement</span><h2>Build the song.</h2></div><button className="button-secondary" type="button" onClick={addSection}>Add section</button></div>
          {song.sections.length ? <div className="song-builder-section-list">{song.sections.map((item, index) => <div className={item.id === section?.id ? "song-builder-section active" : "song-builder-section"} key={item.id}>
            <button type="button" className="song-builder-section-select" aria-pressed={item.id === section?.id} onClick={() => { setSelectedClipIds([]); setSelectedCell(null); setActiveSectionId(item.id); setActiveClipId(sectionClips(item)[0]?.id ?? ""); setActivePartId(sectionClips(item)[0]?.partId ?? ""); }}><strong>{item.name}</strong><small>{item.marker ? `Marker: ${item.marker} · ` : ""}{item.endingPass ? `Ending ${item.endingPass} · ` : ""}{item.kind} · {sectionClips(item).length} clips · repeats {item.endingGroup ? item.endingRepeats ?? 2 : item.repeats ?? 1}</small></button>
            <div className="song-builder-icon-actions"><button type="button" aria-label={`Move ${item.name} up`} disabled={index === 0} onClick={() => moveSection(item.id, -1)}>↑</button><button type="button" aria-label={`Move ${item.name} down`} disabled={index === song.sections.length - 1} onClick={() => moveSection(item.id, 1)}>↓</button><button type="button" aria-label={`Duplicate ${item.name}`} onClick={() => duplicateSection(item.id)}>＋</button><button type="button" aria-label={`Delete ${item.name}`} onClick={() => deleteSection(item.id)}>×</button></div>
          </div>)}</div> : <p>Add an intro, verse, or other section to start the arrangement.</p>}
          {section && <>
            <div className="song-builder-fields song-builder-section-fields">
              <label>Section name<input maxLength={80} value={section.name} onChange={(event) => updateSection(section.id, (current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Section type<select value={section.kind} onChange={(event) => updateSection(section.id, (current) => ({ ...current, kind: event.target.value as SongSection["kind"] }))}><option value="intro">Intro</option><option value="verse">Verse</option><option value="chorus">Chorus</option><option value="bridge">Bridge</option><option value="fill">Fill</option><option value="outro">Outro</option><option value="other">Other</option></select></label>
              <label>Section repeats<input type="number" min={1} max={32} value={section.repeats ?? 1} onChange={(event) => updateSection(section.id, (current) => ({ ...current, repeats: Math.max(1, Math.min(32, Number(event.target.value) || 1)) }))} /></label>
              <label>Section tempo · blank uses {song.bpm} BPM<input type="number" min={40} max={200} placeholder={String(song.bpm)} value={section.bpm ?? ""} onChange={(event) => updateSection(section.id, (current) => ({ ...current, bpm: event.target.value ? clampBpm(Number(event.target.value)) : undefined }))} /></label>
              <label>Tempo-ramp target BPM<input type="number" min={40} max={200} placeholder="Off" value={section.tempoRamp?.targetBpm ?? ""} onChange={(event) => updateSection(section.id, (current) => ({ ...current, tempoRamp: event.target.value ? { targetBpm: clampBpm(Number(event.target.value)), bars: current.tempoRamp?.bars ?? 4 } : undefined }))} /></label>
              <label>Ramp length · bars<input type="number" min={1} max={128} disabled={!section.tempoRamp} value={section.tempoRamp?.bars ?? ""} placeholder="4" onChange={(event) => updateSection(section.id, (current) => ({ ...current, tempoRamp: current.tempoRamp ? { ...current.tempoRamp, bars: Math.max(1, Math.min(128, Number(event.target.value) || 1)) } : undefined }))} /></label>
              <label>Default meter<input maxLength={40} value={section.meter ?? song.meter} onChange={(event) => updateSection(section.id, (current) => ({ ...current, meter: event.target.value.slice(0, 40) }))} /></label>
              <label>Section notes<input maxLength={2000} value={section.notes} onChange={(event) => updateSection(section.id, (current) => ({ ...current, notes: event.target.value }))} /></label>
              <label>Rehearsal marker<input maxLength={80} value={section.marker ?? ""} placeholder="e.g. A · Chorus" onChange={(event) => updateSection(section.id, (current) => ({ ...current, marker: event.target.value || undefined }))} /></label>
              <label>Pickup length<select value={section.pickupBeats ?? 0} onChange={(event) => updateSection(section.id, (current) => ({ ...current, pickupBeats: Number(event.target.value) || undefined }))}><option value={0}>No pickup</option>{[0.5, 1, 1.5, 2, 3, 4].map((beats) => <option key={beats} value={beats}>{beats} beats</option>)}</select></label>
              <label>Repeat group<input maxLength={80} value={section.endingGroup ?? ""} placeholder="e.g. Verse loop" onChange={(event) => updateSection(section.id, (current) => ({ ...current, endingGroup: event.target.value.trim() || undefined }))} /></label>
              <label>Ending<select value={section.endingPass ?? 0} onChange={(event) => updateSection(section.id, (current) => ({ ...current, endingGroup: current.endingGroup || `repeat-${current.id.slice(0, 8)}`, endingPass: Number(event.target.value) === 1 || Number(event.target.value) === 2 ? Number(event.target.value) as 1 | 2 : undefined }))}><option value={0}>Shared section</option><option value={1}>First ending</option><option value={2}>Second ending</option></select></label>
              <label>Repeat group passes<input type="number" min={2} max={8} disabled={!section.endingGroup} value={section.endingRepeats ?? 2} onChange={(event) => updateSection(section.id, (current) => ({ ...current, endingRepeats: Math.max(2, Math.min(8, Number(event.target.value) || 2)) }))} /></label>
            </div>
            <div className="song-builder-clips-heading"><h3>Measure sequence</h3><div className="song-builder-actions"><button type="button" onClick={addBlankPattern}>Add blank pattern</button><button type="button" onClick={() => duplicateSection()}>Duplicate section</button></div></div>
            {clips.length ? <><div className="song-builder-clip-tools"><button type="button" onClick={() => setSelectedClipIds(clips.map((clip) => clip.id))}>Select all</button><button type="button" onClick={() => setSelectedClipIds([])} disabled={!selectedClipIds.length}>Clear selection</button><button type="button" onClick={duplicateSelectedClips} disabled={!selectedClipIds.length}>Duplicate selected</button><button type="button" onClick={() => moveSelectedClips(-1)} disabled={!selectedClipIds.length}>Move selection up</button><button type="button" onClick={() => moveSelectedClips(1)} disabled={!selectedClipIds.length}>Move selection down</button></div><ol className="song-builder-clips">{clips.map((clip, index) => {
              const clipPart = section.parts.find((candidate) => candidate.id === clip.partId);
              if (!clipPart) return null;
              const barsInClip = Math.max(1, Math.ceil(clipPart.beats / meterBeats(clipPart.meter || section.meter || song.meter, clipPart.beats) - 0.00001)) * clip.repeats;
              const active = activeClip?.id === clip.id;
              const playing = position?.partId === clip.partId && (playScope === "song" || playScope === section.id);
              return <li className={`${active ? "active" : ""} ${playing ? "playing" : ""}`} key={clip.id} draggable onDragStart={(event) => { draggedClipIdRef.current = clip.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", clip.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderClip(draggedClipIdRef.current || event.dataTransfer.getData("text/plain"), clip.id); draggedClipIdRef.current = ""; }} onDragEnd={() => { draggedClipIdRef.current = ""; }}>
                <label className="song-builder-clip-check"><input type="checkbox" aria-label={`Select clip ${index + 1}, ${clipPart.name}`} checked={selectedClipIds.includes(clip.id)} onChange={(event) => setSelectedClipIds((current) => event.target.checked ? [...current, clip.id] : current.filter((id) => id !== clip.id))} /></label>
                <button className="song-builder-clip-select" type="button" aria-pressed={active} onClick={() => { setSelectedCell(null); setSelectedCells([]); setActiveClipId(clip.id); setActivePartId(clip.partId); }}><span className="song-builder-clip-number">{index + 1}</span><span><strong>{clipPart.name}</strong><small>{clipPart.meter || section.meter || song.meter} · {barsInClip} {barsInClip === 1 ? "bar" : "bars"}</small></span></button>
                <label>Repeat<input aria-label={`Repeat ${clipPart.name}`} type="number" min={1} max={64} value={clip.repeats} onChange={(event) => updateSection(section.id, (current) => ({ ...current, clips: sectionClips(current).map((item) => item.id === clip.id ? { ...item, repeats: Math.max(1, Math.min(64, Number(event.target.value) || 1)) } : item) }))} /></label>
                <div className="song-builder-icon-actions"><button type="button" aria-label={`Move ${clipPart.name} up`} disabled={index === 0} onClick={() => moveClip(clip.id, -1)}>↑</button><button type="button" aria-label={`Move ${clipPart.name} down`} disabled={index === clips.length - 1} onClick={() => moveClip(clip.id, 1)}>↓</button><button type="button" aria-label={`Duplicate ${clipPart.name} clip`} onClick={() => duplicateClip(clip.id)}>＋</button><button type="button" aria-label={`Remove ${clipPart.name} clip`} onClick={() => removeClip(clip.id)}>×</button></div>
              </li>;
            })}</ol></> : <p className="song-builder-empty">Add a blank pattern or choose a groove or fill below.</p>}
          </>}
        </section>

        {section && <div className="song-builder-edit-columns">
          <section className="card song-builder-pattern-editor" aria-label="Drum tab editor">
            <div className="song-builder-section-heading"><div><span className="eyebrow">Editable drum tab</span><h2>{part?.name ?? "Choose a pattern"}</h2></div>{part && <button className="button-secondary" type="button" onClick={duplicatePattern}>Duplicate pattern</button>}</div>
            {part ? <>
              <div className="song-builder-fields song-builder-part-fields">
                <label>Editing pattern<select value={part.id} onChange={(event) => { setSelectedCell(null); setSelectedCells([]); setActivePartId(event.target.value); }}>{section.parts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>Pattern name<input maxLength={80} value={part.name} onChange={(event) => updatePart(part.id, (current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Pattern meter<input maxLength={40} value={part.meter ?? section.meter ?? song.meter} onChange={(event) => updatePart(part.id, (current) => ({ ...current, meter: event.target.value.slice(0, 40) }))} /></label>
                <label>Length · quarter-note beats<input type="number" min={0.5} max={32} step={0.5} value={part.beats} onChange={(event) => { const beats = Math.max(0.5, Math.min(32, Number(event.target.value) || 4)); updatePart(part.id, (current) => ({ ...current, beats, hits: current.hits.filter((hit) => hit.step < beats * current.subdivision / 4) })); }} /></label>
                <label>Grid<select value={part.subdivision} onChange={(event) => changeSubdivision(Number(event.target.value))}><option value={4}>Quarter notes</option><option value={8}>Eighth notes</option><option value={12}>Triplets</option><option value={16}>Sixteenth notes</option></select></label>
              </div>
              <p className="song-builder-hint">Click a cell to cycle rest → hit → accent → rest. Use arrow keys to move around the grid. This pattern has {partStepCount(part)} steps and plays at {section.bpm ?? song.bpm} BPM.</p>
              <div className="song-builder-grid-tools">
                <label>Pointer tool<select value={gridPaintMode} onChange={(event) => setGridPaintMode(event.target.value as typeof gridPaintMode)}><option value="cycle">Cycle hit state</option><option value="hit">Draw hits</option><option value="erase">Erase hits</option></select></label>
                <span>Drag across cells in Draw or Erase mode. Shift-click selects a range; Ctrl/Cmd-click toggles cells.</span>
                <div className="song-builder-selection-actions">
                  <button type="button" onClick={() => { const all = part.hits.map((hit) => `${hit.instrument}:${hit.step}`); setSelectedCells(all); const hit = part.hits[0]; if (hit) setSelectedCell({ instrument: hit.instrument, step: hit.step }); }} disabled={!part.hits.length}>Select all hits</button>
                  <button type="button" onClick={copySelectedHits} disabled={!selectedHitLocations.length}>Copy</button>
                  <button type="button" onClick={pasteHits} disabled={!selectedCell || !hasCopiedHits}>Paste</button>
                  <button type="button" onClick={() => moveSelectedHits(-1)} disabled={!selectedHitLocations.length}>Move left</button>
                  <button type="button" onClick={() => moveSelectedHits(1)} disabled={!selectedHitLocations.length}>Move right</button>
                  <button type="button" onClick={deleteSelectedHits} disabled={!selectedHitLocations.length}>Delete</button>
                </div>
              </div>
              <label className="song-builder-zoom">Grid zoom · {gridCellSize}px<input type="range" min={24} max={50} step={2} value={gridCellSize} onChange={(event) => setGridCellSize(Number(event.target.value))} /></label>
              <div className="song-builder-grid-scroll"><div className="song-builder-grid" style={{ "--steps": partStepCount(part), "--cell-width": `${gridCellSize}px` } as React.CSSProperties} role="grid" aria-label="Eight-voice drum tab grid" aria-colcount={partStepCount(part) + 1}>
                <div className="song-builder-grid-row song-builder-grid-head" role="row"><strong role="rowheader">Voice</strong>{Array.from({ length: partStepCount(part) }, (_, step) => <span role="columnheader" aria-label={`Step ${step + 1}${beatLabels[step] ? `, beat group ${beatLabels[step]}` : ""}`} key={step}>{beatLabels[step] || "·"}</span>)}</div>
                {BUILDER_VOICES.map((voice, voiceIndex) => <div className="song-builder-grid-row" role="row" key={voice}><strong role="rowheader">{VOICE_LABEL[voice]}</strong>{Array.from({ length: partStepCount(part) }, (_, step) => {
                  const hit = part.hits.find((item) => item.step === step && item.instrument === voice);
                  const isPlayhead = position?.partId === part.id && position.step === step;
                  const articulationName = hit?.articulation && hit.articulation !== "normal" ? hit.articulation.replace("foot-splash", "foot splash") : "";
                  const glyph = hit?.articulation && hit.articulation !== "normal" ? ({ flam: "fl", drag: "dr", buzz: "z", "foot-splash": "FS" } as const)[hit.articulation] : hit?.ghost ? "g" : hit?.accent ? "◆" : hit ? "●" : "·";
                  return <button className={`${hit ? "hit" : ""} ${hit?.accent ? "accented" : ""} ${hit?.ghost ? "ghost" : ""} ${beatLabels[step] ? "beat-start" : ""} ${step > 0 && step % stepsPerMeasure === 0 ? "measure-start" : ""} ${isPlayhead ? "playhead" : ""} ${selectedCells.includes(`${voice}:${step}`) ? "selected-cell" : ""}`} key={step} type="button" role="gridcell" data-song-voice={voiceIndex} data-song-step={step} tabIndex={voiceIndex === 0 && step === 0 ? 0 : -1} aria-label={`${VOICE_LABEL[voice]} step ${step + 1}${beatLabels[step] ? `, beat group ${beatLabels[step]}` : ""}: ${hit ? `${hit.ghost ? "ghost note" : hit.accent ? "accent" : "hit"}${articulationName ? `, ${articulationName}` : ""}` : "rest"}`} aria-selected={selectedCells.includes(`${voice}:${step}`)} onKeyDown={(event) => navigateGrid(event, voiceIndex, step)} onPointerDown={(event) => { if (event.button !== 0) return; const modified = event.shiftKey || event.metaKey || event.ctrlKey; if (modified) { event.preventDefault(); selectGridCell(event, voice, step); return; } if (gridPaintMode === "cycle") { event.preventDefault(); cycleCell(voice, step); return; } event.preventDefault(); selectGridCell(event, voice, step); const mode = gridPaintMode; paintRef.current = { pointerId: event.pointerId, mode }; paintGridCell(voice, step, mode); }} onPointerEnter={(event) => { const activePaint = paintRef.current; if (activePaint?.pointerId === event.pointerId) paintGridCell(voice, step, activePaint.mode); }} onClick={(event) => handleGridCellClick(event, voice, step)}>{glyph}</button>;
                })}</div>)}
              </div></div>
              <div className="song-builder-velocity-editor">
                <div><strong>Velocity lane</strong><label>Voice<select value={velocityVoice} onChange={(event) => setVelocityVoice(event.target.value as SongInstrument)}>{BUILDER_VOICES.map((voice) => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label><span>Adjust each hit’s strike strength.</span></div>
                <div className="song-builder-velocity-lane" aria-label={`${VOICE_LABEL[velocityVoice]} velocity by step`}>
                  {Array.from({ length: partStepCount(part) }, (_, step) => {
                    const laneHit = part.hits.find((hit) => hit.instrument === velocityVoice && hit.step === step);
                    const velocity = laneHit?.velocity ?? (laneHit?.ghost ? 38 : laneHit?.accent ? 118 : 86);
                    return <label key={step} title={`${VOICE_LABEL[velocityVoice]} step ${step + 1}${laneHit ? ` · velocity ${velocity}` : " · rest"}`} className={laneHit ? "has-hit" : ""}><span>{step + 1}</span><i style={{ height: `${Math.max(4, velocity / 127 * 52)}px` }} /><input aria-label={`${VOICE_LABEL[velocityVoice]} step ${step + 1} velocity`} type="range" min={1} max={127} value={velocity} disabled={!laneHit} onFocus={() => laneHit && setSelectedCell({ instrument: velocityVoice, step })} onChange={(event) => changeVelocity(velocityVoice, step, Number(event.target.value))} /></label>;
                  })}
                </div>
              </div>
              <div className="song-builder-hit-tools"><span>{selectedHit && selectedCell ? `${VOICE_LABEL[selectedCell.instrument]} · step ${selectedCell.step + 1}` : "Select a hit to edit its dynamics and articulation."}</span><label>Velocity<input type="range" min={1} max={127} value={selectedHit?.velocity ?? (selectedHit?.ghost ? 38 : selectedHit?.accent ? 118 : 86)} disabled={!selectedHit} onChange={(event) => changeSelectedHit((hit) => ({ ...hit, velocity: Number(event.target.value) }))} /></label><label className="song-builder-check"><input type="checkbox" checked={selectedHit?.ghost ?? false} disabled={!selectedHit} onChange={(event) => changeSelectedHit((hit) => ({ ...hit, ghost: event.target.checked }))} /> Ghost note</label><label>Articulation<select value={selectedHit?.articulation ?? "normal"} disabled={!selectedHit} onChange={(event) => setSelectedArticulation(event.target.value as SongHitArticulation)}><option value="normal">Normal</option><option value="flam">Flam</option><option value="drag">Drag</option><option value="buzz">Buzz roll</option><option value="foot-splash">Hi-hat foot splash</option></select></label><label>Sticking<select value={selectedHit?.sticking ?? ""} disabled={!selectedHit} onChange={(event) => changeSelectedHit((hit) => ({ ...hit, sticking: event.target.value ? event.target.value as "R" | "L" : undefined }))}><option value="">None</option><option value="R">Right hand</option><option value="L">Left hand</option></select></label></div>
              <div className="song-builder-actions"><label>Variation<select value={grooveVariation} onChange={(event) => setGrooveVariation(event.target.value as GrooveVariation)}><option value="snare-shift">Shift snare backbeat</option><option value="hat-lift">Add hi-hat offbeats</option><option value="half-time">Half-time feel</option><option value="double-time">Double-time hats</option></select></label><button className="button-secondary" type="button" onClick={createPatternVariation}>Create editable variation</button><button className="button-secondary" type="button" onClick={() => updatePart(part.id, (current) => ({ ...current, hits: [] }))}>Clear pattern</button><button className="button-secondary" type="button" onClick={removePattern}>Remove pattern</button></div>
            </> : <p>Select a clip or add a pattern to edit its notes.</p>}
          </section>

          <section className="card song-builder-source-panel" aria-label="Grooves and fills">
            <div><span className="eyebrow">Start from a groove</span><h2>Borrow a pocket.</h2><p>Choose a built-in or saved custom groove or fill. Inserted patterns become independent and editable.</p></div>
            <section className="song-builder-fill-assistant" aria-label="Meter matched fill suggestions">
              <div><strong>Fill assistant · {activeMeter}</strong><span>{part ? `Suggestions placed after “${part.name}” in ${section?.name ?? "this section"}.` : "Choose a pattern to get fills that match its meter."}</span></div>
              <div className="song-builder-fill-tools"><label>Fill length<select value={transitionLength} onChange={(event) => setTransitionLength(event.target.value as typeof transitionLength)}><option value="keep">Keep pattern length</option><option value="one-bar">Trim to one bar</option></select></label><label className="song-builder-check"><input type="checkbox" checked={transitionCrash} onChange={(event) => setTransitionCrash(event.target.checked)} /> Add accented crash ending</label></div>
              {fillSuggestions.length ? <div className="song-builder-fill-suggestions">{fillSuggestions.map((source) => <article key={source.id}><div><strong>{source.name}</strong><small>{source.beats} quarter-note beats · {source.subdivision === 12 ? "triplet" : `${source.subdivision}-step`} grid</small></div><button type="button" disabled={!part || !['idle', 'finished'].includes(playbackMode)} onClick={() => void previewFillInContext(source)}>Play in context</button><button type="button" onClick={() => insertFillTransition(source)}>Insert fill</button></article>)}</div> : <p className="song-builder-hint">{part ? `No saved or built-in fills match ${activeMeter} yet. You can still search and insert any pattern below.` : "Select or add a pattern to see matching fills here."}</p>}
            </section>
            <div className="song-builder-source-filters"><label>Search grooves<input type="search" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Rock, shuffle, tom fill…" /></label><label>Show<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | "fills")}><option value="all">All grooves and fills</option><option value="fills">Fills and transitions</option></select></label></div>
            <div className="song-builder-source-list">{visibleSources.map((source) => <article key={source.id}><div><strong>{source.name}</strong><small>{source.style} · {source.meter} · {source.defaultBpm} BPM</small><p>{source.description}</p></div><div className="song-builder-source-buttons"><button className={previewSourceId === source.id ? "previewing" : ""} type="button" aria-pressed={previewSourceId === source.id} disabled={!['idle', 'finished'].includes(playbackMode)} onClick={() => void previewSource(source)}>{previewSourceId === source.id ? "Stop preview" : "Preview"}</button><button type="button" onClick={() => insertSource(source)}>Insert</button></div></article>)}{!visibleSources.length && <p>No patterns match that search.</p>}</div>
            <p className="song-builder-hint">Your custom grooves are loaded from Grooves and update here when saved.</p>
          </section>
        </div>}

        <section className="card song-builder-notation" aria-label="Notation preview and download">
          <div className="song-builder-section-heading"><div><span className="eyebrow">Print and share</span><h2>Read the arrangement.</h2></div>
            <div className="song-builder-export-actions"><label>Show<select value={previewScope} onChange={(event) => { setPreviewScope(event.target.value); setPreviewPage(0); }}><option value="song">Full song</option>{song.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" onClick={() => void exportSheet("png")} disabled={!notationBars.length}>PNG</button><button type="button" onClick={() => void exportSheet("pdf")} disabled={!notationBars.length}>PDF</button><button type="button" onClick={() => void exportSheet("midi")} disabled={!notationBars.length}>MIDI</button><button type="button" onClick={() => void exportSheet("musicxml")} disabled={!notationBars.length}>MusicXML</button><button type="button" onClick={() => void exportSheet("wav")} disabled={!notationBars.length}>WAV audio</button></div>
          </div>
          <div className="song-builder-view-switch" role="group" aria-label="Notation view"><button type="button" aria-pressed={notationView === "tab"} onClick={() => setNotationView("tab")}>Drum tab</button><button type="button" aria-pressed={notationView === "staff"} onClick={() => setNotationView("staff")}>Percussion staff</button><span>{notationView === "tab" ? "K kick · S snare · H hi-hat · T tom · C crash · ◆ accent" : "Kick low · snare center · tom middle · cymbals cross-headed"}</span></div>
          <div className="song-builder-notation-controls" aria-label="Notation layout controls">
            <label>Measures per page<select value={builderSettings.notation.barsPerPage} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, barsPerPage: Number(event.target.value) as 4 | 6 | 8 } }))}><option value={4}>4 · spacious</option><option value={6}>6 · standard</option><option value={8}>8 · compact</option></select></label>
            <label>Cymbal noteheads<select value={builderSettings.notation.cymbalNoteheads} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, cymbalNoteheads: event.target.value as "cross" | "diamond" } }))}><option value="cross">Cross</option><option value="diamond">Diamond</option></select></label>
            <label>Beam grouping<select value={builderSettings.notation.beamGrouping} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, beamGrouping: event.target.value as typeof current.notation.beamGrouping } }))}><option value="auto">Automatic by grid</option><option value="2">Pairs</option><option value="3">Triplets</option><option value="4">Groups of four</option><option value="off">No beams</option></select></label>
            <label className="song-builder-check"><input type="checkbox" checked={builderSettings.notation.showSticking} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, showSticking: event.target.checked } }))} /> Show hand sticking</label>
          </div>
          <div className="song-builder-sheet-wrap"><div className="song-builder-sheet-frame"><canvas ref={previewCanvasRef} width={SHEET_WIDTH} height={SHEET_HEIGHT} role="img" aria-label={`${song.title}, ${notationView === "tab" ? "drum tab" : "percussion staff"} notation, page ${currentPage + 1} of ${pageCount}`} />{cursorOnPage && <span className="song-builder-sheet-cursor" aria-hidden="true" style={{ left: `${cursorPercent}%` }} />}</div></div>
          {pageCount > 1 && <div className="song-builder-pages"><button type="button" onClick={() => setPreviewPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0}>Previous page</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" onClick={() => setPreviewPage((current) => Math.min(pageCount - 1, current + 1))} disabled={currentPage === pageCount - 1}>Next page</button></div>}
          <p className="song-builder-status" role="status">{message || `${notationBars.length} measures · ${savedMessage}`}</p>
        </section>
      </div> : <section className="card song-builder-welcome"><span className="eyebrow">Drum Hero Song Builder</span><h2>Write the part you hear.</h2><p>Create a song from a blank page, or open a song from the shared library. Add sections, build drum patterns, arrange repeats, then listen back or follow the moving playhead.</p><div className="song-builder-welcome-actions"><Link className="button" href="/song-library">Open Song Library</Link><a href="#song-builder-new-title" className="button-secondary">Create a new song</a></div><p>New song title and artist fields are in the left panel.</p></section>}
    </div>
  </div>;
}
