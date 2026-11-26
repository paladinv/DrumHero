"use client";

import { useEffect, useRef, useState } from "react";
import { PlayAlongStemMixer, type PlayAlongStemMixerHandle } from "./PlayAlongStemMixer";
import { useLocalization } from "./LocalizationProvider";
import { createPlayAlongPackage, parsePlayAlongPackage, portableStemsFromBackings, type PlayAlongMix, type PlayAlongPart, type PlayAlongSection, type PlayAlongSectionChoice, type PlayAlongStyle } from "@/lib/playalong-package";

type Style = PlayAlongStyle;
type Section = PlayAlongSection;
type SectionChoice = PlayAlongSectionChoice;
type Mix = PlayAlongMix;
type ArrangementPart = PlayAlongPart & { id: string };
type SavedArrangement = { id: string; name: string; parts: ArrangementPart[] };
type StarterArrangement = { id: string; name: string; style: Style; bpm: number; parts: Array<{ section: Section; bars: number }> };
const ARRANGEMENT_KEY = "drum-hero:playalong-arrangements:v1";
const ACTIVE_PROJECT_KEY = "drum-hero:playalong-project:v1";
const styles: Array<{ id: Style; name: string; bpm: number; description: string }> = [
  { id: "rock", name: "Open rock", bpm: 96, description: "Steady bass pulse, bright offbeat chords, and an eighth-note shaker." },
  { id: "funk", name: "Pocket funk", bpm: 92, description: "Syncopated bass and clipped chord stabs leave room for the groove." },
  { id: "shuffle", name: "Blues shuffle", bpm: 108, description: "A swung bass and triplet ride pulse support a relaxed shuffle." },
];
const sections: Array<{ id: Section; name: string }> = [{ id: "verse", name: "Verse" }, { id: "chorus", name: "Chorus" }, { id: "bridge", name: "Bridge" }, { id: "break", name: "Break" }];
const defaultForm: ArrangementPart[] = ["verse", "chorus", "verse", "bridge"].map((section, index) => ({ id: `default-${index}`, section: section as Section, bars: 4 }));
const starterArrangements: StarterArrangement[] = [
  { id: "rock-verse-chorus", name: "Open rock · verse and chorus", style: "rock", bpm: 96, parts: [{ section: "verse", bars: 4 }, { section: "chorus", bars: 4 }, { section: "verse", bars: 4 }, { section: "chorus", bars: 4 }, { section: "bridge", bars: 4 }, { section: "chorus", bars: 4 }] },
  { id: "blues-12-bar", name: "Blues shuffle · 12 bars", style: "shuffle", bpm: 108, parts: [{ section: "verse", bars: 4 }, { section: "bridge", bars: 2 }, { section: "verse", bars: 2 }, { section: "bridge", bars: 2 }, { section: "chorus", bars: 2 }] },
  { id: "funk-break", name: "Pocket funk · break and return", style: "funk", bpm: 92, parts: [{ section: "verse", bars: 4 }, { section: "chorus", bars: 4 }, { section: "break", bars: 2 }, { section: "chorus", bars: 4 }] },
  { id: "half-time-rock", name: "Half-time rock · wide backbeat", style: "rock", bpm: 84, parts: [{ section: "verse", bars: 8 }, { section: "chorus", bars: 8 }, { section: "bridge", bars: 4 }, { section: "chorus", bars: 8 }] },
  { id: "funk-extended-break", name: "Funk build · extended break", style: "funk", bpm: 104, parts: [{ section: "verse", bars: 4 }, { section: "chorus", bars: 4 }, { section: "bridge", bars: 4 }, { section: "break", bars: 4 }, { section: "chorus", bars: 4 }] },
  { id: "slow-shuffle-form", name: "Slow shuffle · 12-bar practice form", style: "shuffle", bpm: 88, parts: [{ section: "verse", bars: 4 }, { section: "bridge", bars: 2 }, { section: "verse", bars: 2 }, { section: "bridge", bars: 2 }, { section: "chorus", bars: 2 }] },
];

function parseParts(value: unknown): ArrangementPart[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const parts = value.flatMap((item, index): ArrangementPart[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ArrangementPart>;
    if (!sections.some((entry) => entry.id === candidate.section) || !Number.isInteger(candidate.bars) || Number(candidate.bars) < 1 || Number(candidate.bars) > 16 || (candidate.bpm !== undefined && (!Number.isInteger(candidate.bpm) || Number(candidate.bpm) < 55 || Number(candidate.bpm) > 160))) return [];
    return [{ id: typeof candidate.id === "string" ? candidate.id.slice(0, 80) : `part-${index}`, section: candidate.section as Section, bars: Number(candidate.bars), ...(candidate.bpm === undefined ? {} : { bpm: Number(candidate.bpm) }) }];
  });
  return parts.length === value.length && parts.reduce((total, part) => total + part.bars, 0) <= 64 ? parts : null;
}

function readSavedArrangements(raw: string | null): SavedArrangement[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.slice(0, 25).flatMap((item): SavedArrangement[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<SavedArrangement>;
      const parts = parseParts(candidate.parts);
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !candidate.name.trim() || !parts) return [];
      return [{ id: candidate.id.slice(0, 80), name: candidate.name.trim().slice(0, 60), parts }];
    });
  } catch { return []; }
}

function readActiveProject(raw: string | null) {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const form = parseParts(value.form);
    const mix = value.mix as Partial<Mix> | undefined;
    if (!form || typeof value.name !== "string" || !value.name.trim() || value.name.length > 60
      || typeof value.style !== "string" || !styles.some((item) => item.id === value.style)
      || typeof value.section !== "string" || (value.section !== "full-form" && !sections.some((item) => item.id === value.section))
      || !Number.isInteger(value.bpm) || Number(value.bpm) < 55 || Number(value.bpm) > 160
      || !mix || ["synthesized", "bass", "harmony", "shaker", "click", "fill"].some((key) => typeof mix[key as keyof Mix] !== "boolean")) return null;
    return { name: value.name.trim(), style: value.style as Style, section: value.section as SectionChoice, bpm: Number(value.bpm), mix: mix as Mix, form };
  } catch { return null; }
}

function tone(context: AudioContext, frequency: number, at: number, duration: number, volume: number, waveform: OscillatorType = "sine") {
  const oscillator = context.createOscillator(); const gain = context.createGain();
  oscillator.type = waveform; oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + duration + 0.02);
}

function noise(context: AudioContext, at: number, duration: number, volume: number, filterFrequency: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const channel = buffer.getChannelData(0); for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource(); const filter = context.createBiquadFilter(); const gain = context.createGain();
  source.buffer = buffer; filter.type = "highpass"; filter.frequency.value = filterFrequency;
  gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start(at); source.stop(at + duration);
}

function eventsFor(style: Style, section: Section, bar: number, step: number, sectionEnding: boolean) {
  const harmony = section === "break" ? [] : section === "bridge" ? [style === "shuffle" ? 6 : 8] : section === "chorus" ? (style === "funk" ? [0, 4, 8, 12] : [0, 4, 8, 12]) : style === "funk" ? [2, 7, 10, 14] : [4, 12];
  const bass = section === "break" ? [] : style === "funk" && section !== "bridge" ? [0, 3, 6, 10, 12, 15] : [0, 8];
  const shaker = section === "break" ? [] : style === "shuffle" ? [0, 2, 3, 5, 6, 8, 9, 11] : section === "bridge" ? [0, 4, 8, 12] : Array.from({ length: 8 }, (_, index) => index * 2);
  if (style === "shuffle") {
    const thirds = section === "bridge" ? [0, 3, 6, 9] : [0, 2, 3, 5, 6, 8, 9, 11];
    return { bass: section !== "break" && step % 3 === 0 && (section !== "bridge" || Math.floor(step / 3) % 2 === 0), bassFifth: step === 6, chord: harmony.includes(step), shaker: section !== "break" && shaker.includes(step), accent: section === "chorus" && bar === 0 && step === 0, ride: section !== "break" && thirds.includes(step), fill: section !== "break" && sectionEnding && step >= 8 };
  }
  return { bass: bass.includes(step), bassFifth: step === 8, chord: harmony.includes(step), shaker: shaker.includes(step), accent: section === "chorus" && bar === 0 && step === 0, ride: false, fill: section !== "break" && sectionEnding && step >= 12 };
}

function sectionAtBar(parts: ArrangementPart[], position: number): { section: Section; barWithin: number; ending: boolean; bpm?: number } {
  let offset = 0;
  for (const part of parts) {
    if (position < offset + part.bars) return { section: part.section, barWithin: position - offset, ending: position === offset + part.bars - 1, bpm: part.bpm };
    offset += part.bars;
  }
  return { section: parts[0]?.section ?? "verse", barWithin: 0, ending: true, bpm: parts[0]?.bpm };
}

function stepTime(startAt: number, absoluteStep: number, settings: { style: Style; section: SectionChoice; bpm: number; form: ArrangementPart[] }) {
  const stepsPerBar = settings.style === "shuffle" ? 12 : 16;
  const stepsPerBeat = settings.style === "shuffle" ? 3 : 4;
  if (settings.section !== "full-form") return startAt + absoluteStep * (60 / settings.bpm / stepsPerBeat);
  const stepsPerForm = settings.form.reduce((total, part) => total + part.bars * stepsPerBar, 0);
  const secondsPerForm = settings.form.reduce((total, part) => total + part.bars * (240 / (part.bpm ?? settings.bpm)), 0);
  const cycle = Math.floor(absoluteStep / stepsPerForm);
  let remainingSteps = absoluteStep % stepsPerForm;
  let offset = cycle * secondsPerForm;
  for (const part of settings.form) {
    const partSteps = part.bars * stepsPerBar;
    const partBpm = part.bpm ?? settings.bpm;
    if (remainingSteps >= partSteps) {
      remainingSteps -= partSteps;
      offset += part.bars * (240 / partBpm);
    } else {
      return startAt + offset + remainingSteps * (60 / partBpm / stepsPerBeat);
    }
  }
  return startAt + offset;
}

function stepPositionAt(startAt: number, now: number, scheduledThrough: number, settings: { style: Style; section: SectionChoice; bpm: number; form: ArrangementPart[] }) {
  let low = 0;
  let high = Math.max(0, scheduledThrough);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (stepTime(startAt, middle, settings) <= now) low = middle;
    else high = middle - 1;
  }
  const currentAt = stepTime(startAt, low, settings);
  const nextAt = stepTime(startAt, low + 1, settings);
  if (now <= currentAt || nextAt <= currentAt) return low;
  return low + Math.min(1, (now - currentAt) / (nextAt - currentAt));
}

const PLAYALONG_BACKING_ID = "playalong-studio";

export function PlayAlongStudio() {
  const { t } = useLocalization();
  const [style, setStyle] = useState<Style>("rock");
  const [section, setSection] = useState<SectionChoice>("verse");
  const [form, setForm] = useState<ArrangementPart[]>(defaultForm);
  const [savedArrangements, setSavedArrangements] = useState<SavedArrangement[]>([]);
  const [arrangementReady, setArrangementReady] = useState(false);
  const [projectReady, setProjectReady] = useState(false);
  const [arrangementName, setArrangementName] = useState("My arrangement");
  const [savedArrangementId, setSavedArrangementId] = useState("");
  const [starterArrangementId, setStarterArrangementId] = useState("");
  const [message, setMessage] = useState("Choose a style and press Play. These original backing parts are synthesized in your browser.");
  const [trainerChallenge, setTrainerChallenge] = useState<{ name: string; bpm: number; style: Style } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const packageImportRef = useRef<HTMLInputElement>(null);
  const [bpm, setBpm] = useState(96);
  const [mix, setMix] = useState<Mix>({ synthesized: true, bass: true, harmony: true, shaker: true, click: false, fill: true });
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState(1);
  const [beat, setBeat] = useState(1);
  const contextRef = useRef<AudioContext | null>(null);
  const backingTrackRef = useRef<PlayAlongStemMixerHandle>(null);
  const timerRef = useRef<number | null>(null);
  const startAtRef = useRef(0);
  const stepRef = useRef(0);
  const controlsRef = useRef({ style, section, bpm, mix, form });
  useEffect(() => { controlsRef.current = { style, section, bpm, mix, form }; }, [style, section, bpm, mix, form]);
  const currentStyle = styles.find((item) => item.id === style)!;
  const formBars = form.reduce((total, part) => total + part.bars, 0);

  function applyStarterArrangement(id: string) {
    const starter = starterArrangements.find((item) => item.id === id);
    if (!starter) return;
    setStyle(starter.style);
    setBpm(starter.bpm);
    setSection("full-form");
    setForm(starter.parts.map((part) => ({ ...part, id: crypto.randomUUID() })));
    setArrangementName(starter.name);
    setSavedArrangementId("");
    setMessage(t("Loaded {name}. Customize the form, then save or export it with your backing stems.", { name: starter.name }));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedArrangements(readSavedArrangements(localStorage.getItem(ARRANGEMENT_KEY)));
      const project = readActiveProject(localStorage.getItem(ACTIVE_PROJECT_KEY));
      if (project) {
        setStyle(project.style);
        setSection(project.section);
        setForm(project.form.map((part) => ({ ...part, id: crypto.randomUUID() })));
        setArrangementName(project.name);
        setBpm(project.bpm);
        setMix(project.mix);
      }
      setArrangementReady(true);
      setProjectReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!arrangementReady) return;
    try { localStorage.setItem(ARRANGEMENT_KEY, JSON.stringify(savedArrangements)); }
    catch { window.setTimeout(() => setMessage("Saved arrangements could not be updated. Export the form before clearing browser storage."), 0); }
  }, [arrangementReady, savedArrangements]);

  useEffect(() => {
    if (!projectReady) return;
    try {
      localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify({
        name: arrangementName,
        style,
        section,
        bpm,
        mix,
        form: form.map(({ section: partSection, bars, bpm: partBpm }) => ({ section: partSection, bars, ...(partBpm === undefined ? {} : { bpm: partBpm }) })),
      }));
    } catch { window.setTimeout(() => setMessage("Play-Along settings could not be saved. Export a full package to keep a copy."), 0); }
  }, [arrangementName, bpm, form, mix, projectReady, section, style]);

  useEffect(() => {
    if (!projectReady) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("trainerChallenge") !== "1") return;
      const challengeStyle = styles.find(item => item.id === params.get("style"))?.id;
      const requestedBpm = Number(params.get("bpm"));
      if (!challengeStyle || !Number.isFinite(requestedBpm)) return;
      const challenge = { name: (params.get("name") ?? "Trainer groove").trim().slice(0, 60) || "Trainer groove", bpm: Math.max(55, Math.min(160, Math.round(requestedBpm))), style: challengeStyle };
      setTrainerChallenge(challenge);
      setStyle(challenge.style);
      setBpm(challenge.bpm);
      setSection("full-form");
      setArrangementName(`${challenge.name} challenge`);
      setSavedArrangementId("");
      setMix({ synthesized: true, bass: true, harmony: true, shaker: true, click: false, fill: true });
      setMessage("Press Play loop to start the synthesized backing for this challenge.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [projectReady]);

  const updateForm = (next: ArrangementPart[]) => { setForm(next); setSavedArrangementId(""); };

  const saveArrangement = () => {
    const name = arrangementName.trim().slice(0, 60);
    if (!name || !parseParts(form)) { setMessage("Give the arrangement a name and keep its form within 64 bars."); return; }
    const saved = { id: savedArrangementId || crypto.randomUUID(), name, parts: form.map((part) => ({ ...part })) };
    const next = [saved, ...savedArrangements.filter((item) => item.id !== saved.id)].slice(0, 25);
    setSavedArrangements(next); setSavedArrangementId(saved.id); setArrangementName(name); setMessage(`“${name}” saved on this device.`);
  };

  const exportArrangement = () => {
    const payload = { format: "drum-hero-playalong-form-v1", name: arrangementName.trim().slice(0, 60) || "My arrangement", parts: form.map(({ section: partSection, bars, bpm: partBpm }) => ({ section: partSection, bars, ...(partBpm === undefined ? {} : { bpm: partBpm }) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "drum-hero-playalong-form.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importArrangement = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 50_000) throw new Error("Arrangement file is too large.");
      const value = JSON.parse(await file.text()) as { format?: string; name?: string; parts?: unknown };
      const parts = parseParts(value.parts);
      if (value.format !== "drum-hero-playalong-form-v1" || !parts) throw new Error("Choose a valid Drum Hero play-along form.");
      updateForm(parts.map((part) => ({ ...part, id: crypto.randomUUID() })));
      setStarterArrangementId("");
      setSection("full-form"); setArrangementName(typeof value.name === "string" ? value.name.slice(0, 60) : "Imported arrangement");
      setMessage("Arrangement imported. Save it here or export it for another device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this arrangement."); }
    finally { if (importRef.current) importRef.current.value = ""; }
  };

  const exportPackage = () => {
    try {
      const mixer = backingTrackRef.current;
      const stems = mixer?.getStems() ?? [];
      if (stems.length && !mixer?.isRightsConfirmed()) throw new Error(t('Confirm that you own or have permission to use these audio files.'));
      const rightsReview = mixer?.shareReadiness() ?? { ready: true, unreviewed: 0 };
      if (!rightsReview.ready) throw new Error(t('Add a source or attribution plus a license or permission note to every imported stem before exporting a shareable package.'));
      const blob = createPlayAlongPackage({
        name: arrangementName,
        style,
        section,
        bpm,
        stemTempo: backingTrackRef.current?.getTempo() ?? bpm,
        mix,
        form,
        stems: portableStemsFromBackings(backingTrackRef.current?.getStems() ?? []),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeName = arrangementName.trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 60) || "play-along";
      anchor.href = url;
      anchor.download = "drum-hero-" + safeName + ".drumhero";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage(t("Full Play-Along package exported with arrangement, settings, stems, and attribution."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Could not export this Play-Along package."));
    }
  };

  const importPackage = async (file?: File) => {
    if (!file) return;
    try {
      const project = await parsePlayAlongPackage(file);
      const mixer = backingTrackRef.current;
      if (!mixer) throw new Error(t("Play-Along audio is still loading. Try again in a moment."));
      if (project.stems.length && !mixer.isRightsConfirmed()) throw new Error(t("Confirm that you own or have permission to use these audio files."));
      if (!window.confirm(t("Importing this package replaces the current Play-Along settings and imported stems on this device."))) return;
      await mixer.replaceStems(project.stems, project.stemTempo);
      setStyle(project.style);
      setSection(project.section);
      setForm(project.form.map((part) => ({ ...part, id: crypto.randomUUID() })));
      setSavedArrangementId("");
      setStarterArrangementId("");
      setArrangementName(project.name);
      setBpm(project.bpm);
      setMix(project.mix);
      setMessage(t("Play-Along package imported. Review the arrangement and attribution before sharing or using the audio."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Could not import this Play-Along package."));
    } finally {
      if (packageImportRef.current) packageImportRef.current.value = "";
    }
  };

  const stop = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null; backingTrackRef.current?.pause(); setPlaying(false); setMessage("Stopped. Change the style, section, mix, or tempo and start again.");
  };

  useEffect(() => () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); backingTrackRef.current?.pause(); void contextRef.current?.close(); }, []);

  const start = async () => {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio is not available in this browser.");
      const context = contextRef.current ?? new AudioContextConstructor(); contextRef.current = context;
      await context.resume();
      stepRef.current = 0; startAtRef.current = context.currentTime + 0.18; setBar(1); setBeat(1); setPlaying(true);
      setMessage(section === "full-form" ? `Playing a repeating ${formBars}-bar form. Section tempos are scheduled on the audio clock.` : "Looping a four-bar section. Stop playback before changing tempo, section, or mix.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start audio playback."); }
  };

  useEffect(() => {
    if (!playing) return;
    const context = contextRef.current;
    if (!context) return;
    const settings = controlsRef.current;
    const stepCount = settings.style === "shuffle" ? 12 : 16;
    timerRef.current = window.setInterval(() => {
      const now = context.currentTime;
      while (stepTime(startAtRef.current, stepRef.current, settings) < now + 0.12) {
        const absoluteStep = stepRef.current;
        const barIndex = Math.floor(absoluteStep / stepCount);
        const step = absoluteStep % stepCount;
        const at = stepTime(startAtRef.current, absoluteStep, settings);
        const sectionInfo = settings.section === "full-form"
          ? sectionAtBar(settings.form, barIndex % settings.form.reduce((total, part) => total + part.bars, 0))
          : { section: settings.section, barWithin: barIndex % 4, ending: barIndex % 4 === 3 };
        const event = eventsFor(settings.style, sectionInfo.section, sectionInfo.barWithin, step, sectionInfo.ending);
        const root = [55, 65, 73, 49][barIndex % 4];
        if (settings.mix.synthesized && event.bass && settings.mix.bass) tone(context, event.bassFifth ? root * 1.5 : root, at, 0.26, 0.24, "triangle");
        if (settings.mix.synthesized && event.chord && settings.mix.harmony) {
          const minorChord = barIndex % 4 === 0 || barIndex % 4 === 2;
          const notes = [root * 2, root * 2 * (minorChord ? 1.2 : 1.25), root * 3];
          notes.forEach((frequency) => tone(context, frequency, at, 0.16, event.accent ? 0.065 : 0.045, "triangle"));
        }
        if (settings.mix.synthesized && event.shaker && settings.mix.shaker) noise(context, at, settings.style === "shuffle" ? 0.035 : 0.024, 0.035, settings.style === "shuffle" ? 6500 : 7800);
        if (settings.mix.synthesized && event.ride && settings.mix.shaker) noise(context, at, 0.045, 0.025, 5400);
        if (settings.mix.synthesized && event.fill && settings.mix.fill) tone(context, [190, 155, 125, 92][stepCount - 1 - step] ?? 110, at, 0.09, 0.08, "triangle");
        const beatStep = settings.style === "shuffle" ? step % 3 === 0 : step % 4 === 0;
        if (settings.mix.synthesized && event.accent) tone(context, 1040, at, 0.05, 0.12, "square");
        else if (beatStep && settings.mix.click) tone(context, 760, at, 0.035, 0.045, "sine");
        if (beatStep) { setBar(barIndex % (settings.section === "full-form" ? settings.form.reduce((total, part) => total + part.bars, 0) : 4) + 1); setBeat(settings.style === "shuffle" ? Math.floor(step / 3) + 1 : Math.floor(step / 4) + 1); }
        stepRef.current += 1;
      }
      const backingTempo = backingTrackRef.current?.getTempo();
      if (backingTempo && now >= startAtRef.current) {
        const stepsPerBar = settings.style === "shuffle" ? 12 : 16;
        const stepsPerBeat = stepsPerBar / 4;
        const loopBars = settings.section === "full-form" ? settings.form.reduce((total, part) => total + part.bars, 0) : 4;
        const loopSteps = loopBars * stepsPerBar;
        const musicalStep = stepPositionAt(startAtRef.current, now, stepRef.current, settings) % loopSteps;
        const barIndex = Math.floor(musicalStep / stepsPerBar);
        const localTempo = settings.section === "full-form" ? sectionAtBar(settings.form, barIndex).bpm ?? settings.bpm : settings.bpm;
        const backingPositionMs = musicalStep * 60_000 / (stepsPerBeat * backingTempo);
        backingTrackRef.current?.sync(backingPositionMs, localTempo / backingTempo);
      }
    }, 25);
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); timerRef.current = null; };
  }, [playing]);

  return <section className="playalong-studio card" aria-labelledby="playalong-heading">
    <div className="playalong-live"><span className="eyebrow">{t("Playback style")}</span><h2 id="playalong-heading">{currentStyle.name}</h2><p>{mix.synthesized ? currentStyle.description : t("The style sets the count and timing; only the imported track and selected click play.")}</p><div className="playalong-position" aria-live="off"><strong>{String(bar).padStart(2, "0")}</strong><span>bar</span><strong>{beat}</strong><span>beat</span><span className={playing ? "mode-pill mode-playing" : "mode-pill mode-idle"}>{playing ? "playing" : "stopped"}</span></div></div>
    {trainerChallenge && <p className="playalong-trainer-challenge" role="status">Trainer challenge loaded · {trainerChallenge.name} · {trainerChallenge.style} · {trainerChallenge.bpm} BPM. The studio’s synthesized backing is ready; start playback and match your drum part to its bar and beat position.</p>}
    <div className="playalong-controls">
      <label>Backing style<select value={style} disabled={playing} onChange={(event) => { const next = event.target.value as Style; setStyle(next); setBpm(styles.find((item) => item.id === next)!.bpm); }}>
        {styles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Arrangement<select value={section} disabled={playing} onChange={(event) => setSection(event.target.value as SectionChoice)}><option value="full-form">Custom form · {formBars} bars</option>{sections.map((item) => <option key={item.id} value={item.id}>Loop {item.name.toLowerCase()}</option>)}</select></label>
      {section === "full-form" && <fieldset className="playalong-form-builder" disabled={playing}><legend>Arrange sections</legend><p>Choose a section and length for each part. Forms repeat; fills mark the end of each part. Set a part tempo or use the main tempo.</p><label>{t("Starter arrangement")}<select value={starterArrangementId} onChange={(event) => { setStarterArrangementId(event.target.value); applyStarterArrangement(event.target.value); }}><option value="">{t("Choose an original starter form")}</option>{starterArrangements.map((item) => <option key={item.id} value={item.id}>{t(item.name)} · {item.parts.reduce((total, part) => total + part.bars, 0)} bars</option>)}</select></label><small>{t("Starter backing parts are synthesized in Drum Hero. Imported stems still need their own rights and attribution notes.")}</small>{form.map((part, index) => <div className="playalong-form-part" key={part.id}><span>Part {index + 1}</span><label>Section<select value={part.section} onChange={(event) => updateForm(form.map((current, itemIndex) => itemIndex === index ? { ...current, section: event.target.value as Section } : current))}>{sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Bars<select value={part.bars} onChange={(event) => { const remaining = 64 - form.reduce((total, item, itemIndex) => total + (itemIndex === index ? 0 : item.bars), 0); const bars = Math.max(1, Math.min(remaining, Number(event.target.value))); updateForm(form.map((current, itemIndex) => itemIndex === index ? { ...current, bars } : current)); }}>{Array.from({ length: 16 }, (_, itemIndex) => itemIndex + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Tempo · BPM<input type="number" min="55" max="160" step="1" value={part.bpm ?? bpm} onChange={(event) => updateForm(form.map((current, itemIndex) => itemIndex === index ? { ...current, bpm: Math.max(55, Math.min(160, Number(event.target.value))) } : current))} /></label><button type="button" className="button-secondary" aria-label={`Use main tempo for part ${index + 1}`} disabled={part.bpm === undefined} onClick={() => updateForm(form.map((current, itemIndex) => itemIndex === index ? { ...current, bpm: undefined } : current))}>Use main tempo</button><button type="button" className="button-secondary" disabled={form.length <= 1} aria-label={`Remove part ${index + 1}`} onClick={() => updateForm(form.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}<div className="playalong-form-library"><label>Arrangement name<input maxLength={60} value={arrangementName} onChange={(event) => setArrangementName(event.target.value)} /></label><label>Saved forms<select value={savedArrangementId} onChange={(event) => { const saved = savedArrangements.find((item) => item.id === event.target.value); if (saved) { setForm(saved.parts.map((part) => ({ ...part }))); setSavedArrangementId(saved.id); setStarterArrangementId(""); setArrangementName(saved.name); } else setSavedArrangementId(""); }}><option value="">Choose saved form</option>{savedArrangements.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.parts.reduce((total, part) => total + part.bars, 0)} bars</option>)}</select></label></div><div className="song-actions"><button type="button" className="button-secondary" disabled={form.length >= 8 || formBars >= 64} onClick={() => updateForm([...form, { id: crypto.randomUUID(), section: "verse", bars: Math.min(4, 64 - formBars) }])}>Add section</button><button type="button" onClick={saveArrangement} disabled={!arrangementName.trim()}>Save form</button><button type="button" className="button-secondary" onClick={() => { setSavedArrangements((items) => items.filter((item) => item.id !== savedArrangementId)); setSavedArrangementId(""); setMessage("Saved arrangement removed from this device."); }} disabled={!savedArrangementId}>Delete saved form</button><button type="button" className="button-secondary" onClick={exportArrangement}>Export form</button><button type="button" className="button-secondary" onClick={() => importRef.current?.click()}>Import form</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importArrangement(event.target.files?.[0])} /></div><small>{formBars} bars total · up to 8 parts and 64 bars · forms are stored on this device unless exported.</small></fieldset>}
      <label>Tempo · {bpm} BPM<input type="range" min="55" max="160" step="1" value={bpm} disabled={playing} onChange={(event) => setBpm(Number(event.target.value))} /></label>
      <fieldset disabled={playing}><legend>Mix</legend><label><input type="checkbox" checked={mix.synthesized} onChange={(event) => setMix({ ...mix, synthesized: event.target.checked })} /> {t("Synthesized backing parts")}</label>{(["bass", "harmony", "shaker", "fill", "click"] as const).map((stem) => <label key={stem}><input type="checkbox" checked={mix[stem]} onChange={(event) => setMix({ ...mix, [stem]: event.target.checked })} /> {stem === "harmony" ? "Chord accompaniment" : stem === "shaker" ? "Shaker / ride" : stem === "click" ? "Metronome click" : stem === "fill" ? "Section-end fills" : "Bass"}</label>)}<small>{t("Turn synthesized parts off to use an imported backing track on its own; the click remains separate.")}</small></fieldset>
      <PlayAlongStemMixer ref={backingTrackRef} key={PLAYALONG_BACKING_ID} songId={PLAYALONG_BACKING_ID} tempo={bpm} />
      <div className="song-actions">
        <button type="button" className="button-secondary" onClick={exportPackage}>{t("Export full Play-Along package")}</button>
        <button type="button" className="button-secondary" disabled={playing} onClick={() => packageImportRef.current?.click()}>{t("Import full Play-Along package")}</button>
        <input ref={packageImportRef} type="file" accept=".drumhero,application/vnd.drumhero.playalong" hidden onChange={(event) => void importPackage(event.currentTarget.files?.[0])} />
      </div>
      <div className="transport"><button type="button" className="button" onClick={() => void start()} disabled={playing}>Play loop</button><button type="button" className="button-secondary" onClick={stop} disabled={!playing}>Stop</button></div>
      <p role="status">{message}</p>
      <small>Tempo and section changes apply when playback restarts. Headphones can help keep the backing parts out of a nearby microphone.</small>
    </div>
  </section>;
}
