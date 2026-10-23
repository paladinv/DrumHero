"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createDrumAudio, DEFAULT_DRUM_MIX, type DrumAudio, type DrumMixSettings } from "@/lib/audio";
import { CUSTOM_GROOVES_EVENT, readCustomGrooves, writeCustomGrooves } from "@/lib/custom-grooves";
import { grooves } from "@/lib/curriculum";
import { assertArrangementChangesAllowed, allSongs, emptySongLibrary, newSong, normalizeSong, readSongLibrary, writeSongLibrary, type ArrangementSaveOptions, type DrumPart, type DrumSong, type SongClip, type SongLibraryState, type SongSection } from "@/lib/song-library";
import { buildArrangementBars, BUILDER_VOICES, cleanMeterLabel, gridBeatLabel, grooveToPart, humanizeArrangementBars, makeBlankPart, meterBeats, partStepCount, sectionClips, varyDrumPart, VOICE_LABEL as BASE_VOICE_LABEL, type ArrangementBar, type GrooveVariation } from "@/lib/song-builder";
import { arrangementMidi, arrangementMusicXml, arrangementStemsZip, arrangementWav, canvasPng, canvasesPdf, drawNotationPage, paginateNotation, notationBarAtPoint, notationStaffStepAtPoint, SHEET_WIDTH, SHEET_HEIGHT, type NotationView } from "@/lib/song-builder-export";
import { DEFAULT_SONG_BUILDER_SETTINGS, normalizeSongBuilderSettings, readSongBuilderSettings, SONG_INSTRUMENTS, writeSongBuilderSettings, type SongBuilderExportPreset, type SongBuilderKitPreset, type SongBuilderPerformancePreset, type SongBuilderSettings } from "@/lib/song-builder-settings";
import { createSongFromMidiPreview, previewMidiImport, type MidiImportPreview, type MidiTrackVoiceMapping, type MidiVoiceMapping } from "@/lib/song-builder-import";
import { ARRANGEMENT_TEMPLATES, createArrangementTemplate, instantiateSavedArrangementTemplate, readSavedArrangementTemplates, writeSavedArrangementTemplates, type ArrangementTemplateId, type SavedArrangementTemplate } from "@/lib/song-builder-templates";
import { makeSongProjectFile, MAX_PROJECT_SAMPLE_BYTES, readSongProjectFile, type SongBuilderProjectFile } from "@/lib/song-builder-project";
import { deleteCustomSample, readCustomSampleRecords, readCustomSamples, saveCustomAccentSample, saveCustomAccentSampleBlob, saveCustomSample, saveCustomSampleBlob } from "@/lib/song-builder-samples";
import { applyBuilderTake, arrangementStartTimes, builderTakeMeasureIndex, builderTakeMeasureKey, contextualFillMatch, fitGrooveToMeter, makeClipIndependent, mergeBuilderTakes, moveClipToSection, partToSavedGroove, previewGridChange, quantizeRecordedHit, transformPhrase, type BuilderTake, type PhraseOperation, type RecordedBuilderHit } from "@/lib/song-builder-editing";
import { deleteBuilderTake, readBuilderTakes, saveBuilderTake, readBuilderBacking, saveBuilderBacking } from "@/lib/song-builder-storage";
import { SongBuilderBackingTrack, type BackingTrackHandle } from "./SongBuilderBackingTrack";
import { SongBuilderCollaboration } from "./SongBuilderCollaboration";
import { SongCloudPanel } from "./SongCloudPanel";
import { SongBuilderPatternCompare, SongBuilderTimeline, SongBuilderVersions } from "./SongBuilderWorkspace";
import { packBuilderWorkspace, unpackBuilderWorkspace } from "@/lib/song-builder-backup";
import { createSongShareUrl } from "@/lib/song-builder-share";
import { boundaryTransition, contextualizeFill, creativeVariation, expressionStrikes, morphDrumParts, phraseAwareEnding } from "@/lib/song-builder-creative";
import { playbackTrack, trimPlaybackTrack, type PlaybackTrack } from "@/lib/song-builder-playback";
import { editLinkedPart, mappedSeconds, normalizeTempoAnchors, ARRANGEMENT_CLIPBOARD_KEY } from "@/lib/song-builder-tools";
import { SongBuilderClipboard, SongBuilderTempoMap, SongBuilderNoteChanges, SongBuilderPatternMorph, SongBuilderPlayability, SongBuilderArrangementFeedback, SongBuilderArrangementSuggestions, SongBuilderAccessibleScore, SongBuilderCueList, SongBuilderStorage, SongBuilderExportPreparation, SongBuilderVoiceAutomation, SongBuilderArrangementAutomation, SongBuilderTaskGuide } from './SongBuilderTools';
import type { Groove, SongHitArticulation, SongInstrument } from "@/lib/types";

type PlaybackMode = "idle" | "loading" | "count-in" | "playing" | "paused" | "finished";
type Position = { barIndex: number; step: number; fraction: number; partId: string; clipId?: string };
type SongHistory = { songId: string; past: DrumSong[]; future: DrumSong[] };
type ProjectImportReview = { project: SongBuilderProjectFile; fileName: string; warnings: string[] };
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
  const [selectedClipRepeat, setSelectedClipRepeat] = useState<{ clipId: string; repeat: number } | null>(null);
  const [activePartId, setActivePartId] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [artistDraft, setArtistDraft] = useState("");
  const [songDraft, setSongDraft] = useState<{ songId: string; title: string; artist: string } | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "fills">("all");
  const [meterFitPreview,setMeterFitPreview]=useState<{source:Groove;adapted:Groove}|null>(null);
  const [notationView, setNotationView] = useState<NotationView>("tab");
  const [staffEditMode,setStaffEditMode]=useState(false),[staffEditVoice,setStaffEditVoice]=useState<SongInstrument>("hihat"),[staffEditBarIndex,setStaffEditBarIndex]=useState(0),[staffEditStep,setStaffEditStep]=useState(0);
  const [previewScope, setPreviewScope] = useState("song");
  const [previewPage, setPreviewPage] = useState(0);
  const [playScope, setPlayScope] = useState("song");
  const [playDrums, setPlayDrums] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [includeExportClick, setIncludeExportClick] = useState(false), [includeExportBacking, setIncludeExportBacking] = useState(false);
  const [exportVoice, setExportVoice] = useState<SongInstrument | 'all'>('all');
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false), [arrangementCollapsed, setArrangementCollapsed] = useState(false);
  const [variationDensity, setVariationDensity] = useState(65), [variationComplexity, setVariationComplexity] = useState(30), [variationFill, setVariationFill] = useState(50);
  const [variationPreview, setVariationPreview] = useState<DrumPart | null>(null);
  const [variationSeed, setVariationSeed] = useState(1);
  const [phraseEndingPreview,setPhraseEndingPreview]=useState<DrumPart|null>(null),[phraseFillWindow,setPhraseFillWindow]=useState<'one-beat'|'two-beats'|'measure'>('two-beats'),[preservePhraseBackbeat,setPreservePhraseBackbeat]=useState(true),[addArrivalAccent,setAddArrivalAccent]=useState(true);
  const [loop, setLoop] = useState(false);
  const [countInBeats, setCountInBeats] = useState(4);
  const [metronomeSubdivision, setMetronomeSubdivision] = useState(1);
  const [builderSettings, setBuilderSettings] = useState<SongBuilderSettings>(DEFAULT_SONG_BUILDER_SETTINGS);
  const swing = builderSettings.swing;
  const builderSettingsRef = useRef(builderSettings);
  const [feelDraft,setFeelDraft] = useState({swing:50,amount:0,velocity:0,seed:1729});
  const [midiInputs, setMidiInputs] = useState<Array<{ id: string; name: string }>>([]);
  const [midiStatus, setMidiStatus] = useState("Connect a MIDI drum kit to record hits.");
  const [midiRecording, setMidiRecording] = useState(false), [midiCalibrating, setMidiCalibrating] = useState(false);
  const [midiPreview, setMidiPreview] = useState<MidiImportPreview | null>(null);
  const [projectImportReview, setProjectImportReview] = useState<ProjectImportReview | null>(null);
  const [midiVoiceMapping, setMidiVoiceMapping] = useState<MidiVoiceMapping>({});
  const [midiTrackVoiceMapping, setMidiTrackVoiceMapping] = useState<MidiTrackVoiceMapping>({});
  const [midiExcludedTracks, setMidiExcludedTracks] = useState<number[]>([]);
  const [midiTitle, setMidiTitle] = useState("");
  const [midiArtist, setMidiArtist] = useState("MIDI import");
  const [kitPresetName, setKitPresetName] = useState("");
  const [kitCompareA,setKitCompareA]=useState(""),[kitCompareB,setKitCompareB]=useState("");
  const [performancePresetName, setPerformancePresetName] = useState("");
  const [kitSampleVoice, setKitSampleVoice] = useState<SongInstrument>("kick");
  const [customSampleNames, setCustomSampleNames] = useState<Partial<Record<SongInstrument, string>>>({});
  const [customAccentSampleNames, setCustomAccentSampleNames] = useState<Partial<Record<SongInstrument, string>>>({});
  const [templateChoice, setTemplateChoice] = useState<ArrangementTemplateId>("pop-form");
  const [savedArrangementTemplates,setSavedArrangementTemplates]=useState<SavedArrangementTemplate[]>([]),[savedTemplateChoice,setSavedTemplateChoice]=useState(""),[templateNameDraft,setTemplateNameDraft]=useState("");
  const [exportPresetNameDraft,setExportPresetNameDraft]=useState(""),[exportPresetChoice,setExportPresetChoice]=useState(""),[exportPresetFormat,setExportPresetFormat]=useState<"png"|"pdf">("pdf"),[shareLinkDraft,setShareLinkDraft]=useState("");
  const [transitionLength, setTransitionLength] = useState<"keep" | "one-bar">("keep");
  const [transitionCrash, setTransitionCrash] = useState(false);
  const [transitionContextBars, setTransitionContextBars] = useState<1|2>(1);
  const [transitionFillDensity, setTransitionFillDensity] = useState(68);
  const [transitionFillComplexity, setTransitionFillComplexity] = useState(58);
  const [velocityVoice, setVelocityVoice] = useState<SongInstrument>("snare");
  const [gridPaintMode, setGridPaintMode] = useState<"cycle" | "hit" | "erase" | "select">("cycle");
  const [practiceRangeStart, setPracticeRangeStart] = useState(1);
  const [practiceRangeEnd, setPracticeRangeEnd] = useState(0);
  const [grooveVariation, setGrooveVariation] = useState<GrooveVariation>("hat-lift");
  const [gridCellSize, setGridCellSize] = useState(34);
  const [touchGrid, setTouchGrid] = useState(false), [touchVoice, setTouchVoice] = useState<SongInstrument>("kick");
  const [beginner,setBeginner]=useState(false),[assetRevision,setAssetRevision]=useState(0);
  const [browserFilters,setBrowserFilters]=useState({meter:'',duration:'',grid:'',level:'',voice:'',collection:'all'});
  const [favorites,setFavorites]=useState<string[]>([]),[recentSources,setRecentSources]=useState<string[]>([]);
  const [fractionalLoop,setFractionalLoop]=useState(false),[loopBounds,setLoopBounds]=useState<[number,number]>([0,1]);
  const nextLoopScheduledRef=useRef(0);
  const [phrasePreview,setPhrasePreview]=useState<DrumPart|null>(null);
  const [workspace,setWorkspace] = useState<"compose"|"arrange"|"rehearse"|"export">("compose");
  const [compact,setCompact] = useState(false),[showShortcuts,setShowShortcuts] = useState(false),[followPlayhead,setFollowPlayhead] = useState(true);
  const [seekBar,setSeekBar] = useState<number|null>(null),[gridFocus,setGridFocus] = useState({voice:0,step:0});
  const [pendingGrid,setPendingGrid] = useState<DrumPart["subdivision"]|null>(null);
  const [phraseStart,setPhraseStart] = useState(1),[phraseEnd,setPhraseEnd] = useState(1);
  const [phraseOperation,setPhraseOperation] = useState<PhraseOperation>("crescendo");
  const [swapFrom,setSwapFrom] = useState<SongInstrument>("snare"),[swapTo,setSwapTo] = useState<SongInstrument>("tom");
  const [patternSaveName,setPatternSaveName] = useState(''),[patternSaveTags,setPatternSaveTags] = useState(''),[saveAsFill,setSaveAsFill] = useState(false);
  const [recordMode,setRecordMode] = useState<"overdub"|"replace">("overdub"),[recordLatency,setRecordLatency] = useState(0),[quantizeStrength,setQuantizeStrength] = useState(100),[takeVelocityScale,setTakeVelocityScale]=useState(100);
  const [takes,setTakes] = useState<BuilderTake[]>([]),[selectedTakeId,setSelectedTakeId] = useState(''),[liveHitCount,setLiveHitCount] = useState(0);
  const [comparedTakeId,setComparedTakeId]=useState(''),[takeCompChoices,setTakeCompChoices]=useState<Record<string,'a'|'b'>>({});
  const takeRef = useRef<{songId:string;mode:"overdub"|"replace";hits:RecordedBuilderHit[];targets:BuilderTake["targets"]}|null>(null);
  const backingRef = useRef<BackingTrackHandle|null>(null);
  const selectionLoadedRef=useRef('');
  const [clipMoveTarget,setClipMoveTarget]=useState('');
  const [cueMeasure,setCueMeasure]=useState(1),[cueDraft,setCueDraft]=useState(''),[cueKind,setCueKind]=useState<'band'|'chord'|'lyric'>('band');

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
  const transportActionsRef = useRef<{ toggle: () => void; stop: () => void }>({ toggle: () => {}, stop: () => {} });
  const [countIn, setCountIn] = useState(4);
  const [practiceProgress,setPracticeProgress] = useState({bpm:80,loop:1});
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
  const previewMixRestoreRef=useRef<DrumMixSettings|null>(null);
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
      const id = songRef.current?.id;
      if (id) try { localStorage.setItem(`drum-hero:builder-settings:${id}`, JSON.stringify(next)); } catch { /* Export remains available. */ }
      return next;
    });
  };

  const setSwing = (value: number) => changeBuilderSettings(current=>({...current,swing:value}));

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
    if(previewTimersRef.current.length)audioRef.current?.silence?.();
    previewTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    previewTimersRef.current = [];
    if(previewMixRestoreRef.current){audioRef.current?.setMix(builderSettingsRef.current.mix);previewMixRestoreRef.current=null;}
    setPreviewSourceId("");
  };

  function clearClock() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stopPlayback() {
    finishTake();
    backingRef.current?.pause();
    audioRef.current?.silence?.();
    requestRef.current += 1;
    clearClock();
    setPlaybackMode("idle");
    setPosition(null);
    trackRef.current = null;
    cueIndexRef.current = 0;
    previousPositionRef.current = "";
  }

  function persistSong(input: DrumSong, recordHistory = true, preservePlayback = false, preserveIncomingTimestamp = false) {
    clearPreview();
    const song = normalizeSong({ ...input, bundled: false, updatedAt: preserveIncomingTimestamp ? input.updatedAt : new Date().toISOString() });
    if (!song) { setSavedMessage("This song could not be saved. Check its title and arrangement."); return; }
    try { assertArrangementChangesAllowed(libraryRef.current, { ...libraryRef.current, songs: [...libraryRef.current.songs.filter(item => item.id !== song.id), song] }); } catch (error) { setSavedMessage(error instanceof Error ? error.message : 'Unlock the approved arrangement first.'); return; }
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

  const applyCloudLibrary = (next: SongLibraryState, options?: ArrangementSaveOptions) => {
    libraryRef.current = next;
    setLibrary(next);
    try { writeSongLibrary(next, options); setSavedMessage("Cloud library changes are saved on this device."); }
    catch { setSavedMessage("The cloud review was applied in this session, but local storage could not save it. Export a recovery backup."); }
  };

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

  function finishTake() {
    const recording=takeRef.current;
    if(!recording)return;
    takeRef.current=null;setMidiRecording(false);
    if(!recording.hits.length){setMidiStatus("Recording stopped with no hits. The arrangement was unchanged.");return;}
    const take:BuilderTake={...recording,id:uid(),name:`Take · ${new Date().toLocaleTimeString()}`,createdAt:new Date().toISOString()};
    setTakes(current=>[take,...current].slice(0,10));setSelectedTakeId(take.id);
    void saveBuilderTake(take).catch(()=>setMidiStatus("Take is available in this session, but local storage could not save it."));
    setMidiStatus(`${take.hits.length} hits captured. Preview quantization and apply the take below.`);
  }

  const recordMidiHit = (instrument: SongInstrument, velocity: number, receivedAt: number) => {
    const currentSong=songRef.current,track=trackRef.current,recording=takeRef.current;
    if(!currentSong||!track||!recording||!["playing","count-in"].includes(playbackModeRef.current)||recording.hits.length>=4096)return;
    const elapsed=receivedAt-recordLatency-startAtRef.current;
    if(elapsed<0||elapsed>=track.duration)return;
    const bar=track.bars.find(item=>elapsed>=item.startsAt&&elapsed<item.startsAt+item.duration);
    const part=bar&&currentSong.sections.find(item=>item.id===bar.sectionId)?.parts.find(item=>item.id===bar.partId);
    if(!bar||!part)return;
    const step=(bar.partBeatOffset+(bar.startBeat??0)+(elapsed-bar.startsAt)*bar.bpm/60000)*part.subdivision/4;
    recording.hits.push({sectionId:bar.sectionId,partId:bar.partId,instrument,velocity:Math.max(1,Math.min(127,Math.round(velocity))),step,bpm:bar.bpm,subdivision:part.subdivision,atMs:elapsed});
    setLiveHitCount(recording.hits.length);audioRef.current?.hit(instrument,false,velocity);
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

  const calibrateMidi = async () => {
    if (midiRecording || midiCalibrating) return;
    const input = midiAccessRef.current?.inputs.get(builderSettings.midiInputId);
    if (!input) { setMidiStatus("Connect and select a MIDI input before calibrating."); return; }
    let audio: AudioContext | null = null;
    try {
      audio = new AudioContext();
      await audio.resume();
      const origin = performance.now() + 900, beatMs = 750, offsets: number[] = [], usedBeats = new Set<number>(), previous = input.onmidimessage;
      const onCalibrationMessage = (event: MidiMessageLike) => {
        const status = event.data[0] ?? 0, velocity = event.data[2] ?? 0;
        if ((status & 0xf0) !== 0x90 || velocity <= 0) return;
        const receivedAt = event.receivedTime ?? performance.now(), beat = Math.round((receivedAt - origin) / beatMs);
        const offset = receivedAt - (origin + beat * beatMs);
        if (beat >= 0 && beat < 8 && Math.abs(offset) < beatMs * 0.35 && !usedBeats.has(beat)) { usedBeats.add(beat); offsets.push(offset); }
      };
      input.onmidimessage = onCalibrationMessage;
      setMidiCalibrating(true);
      setMidiStatus("Tap any pad once on each of the next eight slow clicks to estimate your MIDI timing offset.");
      for (let beat = 0; beat < 8; beat += 1) {
        const target = origin + beat * beatMs;
        const at = audio.currentTime + Math.max(0, (target - performance.now()) / 1000);
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.frequency.value = beat % 4 === 0 ? 1100 : 760;
        gain.gain.setValueAtTime(0.08, at); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.055);
        oscillator.connect(gain).connect(audio.destination); oscillator.start(at); oscillator.stop(at + 0.06);
      }
      window.setTimeout(() => {
        if (input.onmidimessage === onCalibrationMessage) input.onmidimessage = previous;
        void audio?.close(); setMidiCalibrating(false);
        if (offsets.length < 4) { setMidiStatus(`Only ${offsets.length} taps matched. Try again and tap once on each click.`); return; }
        offsets.sort((a, b) => a - b);
        const latency = Math.round(offsets[Math.floor(offsets.length / 2)]);
        setRecordLatency(latency);
        changeBuilderSettings(current => ({ ...current, midiLatencyMs: latency }));
        setMidiStatus(`Saved an approximate ${latency} ms MIDI timing correction from ${offsets.length} taps. The estimate includes how you played against the clicks; adjust it manually if needed.`);
      }, Math.max(0, origin - performance.now() + 8 * beatMs + 450));
    } catch {
      await audio?.close().catch(() => {});
      setMidiCalibrating(false);
      setMidiStatus("Could not start the calibration clicks. Check audio permission and try again.");
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setFavorites(JSON.parse(localStorage.getItem('drum-hero:pattern-favorites')??'[]'));setRecentSources(JSON.parse(localStorage.getItem('drum-hero:pattern-recent')??'[]'));setBeginner(localStorage.getItem('drum-hero:builder-beginner')==='true'); } catch { /* Defaults remain available. */ }
      const next = readSongLibrary();
      const storedSettings = readSongBuilderSettings();
      setSavedArrangementTemplates(readSavedArrangementTemplates());
      libraryRef.current = next;
      setLibrary(next);
      builderSettingsRef.current = storedSettings;
      setBuilderSettings(storedSettings);
      setRecordLatency(storedSettings.midiLatencyMs);
      setReady(true);
      setCustomGrooves(readCustomGrooves());
      void readCustomSampleRecords().then((records) => { setCustomSampleNames(Object.fromEntries(records.map((record) => [record.instrument, record.name])) as Partial<Record<SongInstrument, string>>); setCustomAccentSampleNames(Object.fromEntries(records.flatMap((record) => record.accentName ? [[record.instrument, record.accentName] as const] : [])) as Partial<Record<SongInstrument, string>>); }).catch(() => {});
      if (initialSongId) setSelectedSongId(initialSongId);
      else { try { setSelectedSongId(localStorage.getItem("drum-hero:builder-last-song") ?? ""); } catch { /* Selection remains usable without storage. */ } }
    }, 0);
    const reloadCustom = () => setCustomGrooves(readCustomGrooves());
    const reloadSongs = () => {
      const next = readSongLibrary();
      libraryRef.current = next;
      setLibrary(next);
    };
    window.addEventListener(CUSTOM_GROOVES_EVENT, reloadCustom);
    window.addEventListener("storage", reloadSongs);
    window.addEventListener("drum-hero:song-library-change", reloadSongs);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(CUSTOM_GROOVES_EVENT, reloadCustom);
      window.removeEventListener("storage", reloadSongs);
      window.removeEventListener("drum-hero:song-library-change", reloadSongs);
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
  const VOICE_LABEL: Record<SongInstrument, string> = Object.fromEntries(BUILDER_VOICES.map(voice => [voice, song?.voiceLabels?.[voice]?.trim() || BASE_VOICE_LABEL[voice]])) as Record<SongInstrument, string>;
  const customVoiceIds = BUILDER_VOICES.filter(voice => voice.startsWith("custom"));
  const activeCustomVoiceIds = customVoiceIds.filter((voice, index) => index < 4 || !!song?.voiceLabels?.[voice] || !!song?.sections.some(section => section.parts.some(pattern => pattern.hits.some(hit => hit.instrument === voice))));
  const fullSongBars=useMemo(()=>{const source=songs.find(song=>song.id===selectedSongId);return source?buildArrangementBars(source):[];},[songs,selectedSongId]);
  const songBarTimes=useMemo(()=>{const source=songs.find(item=>item.id===selectedSongId);const offset=(source?.referenceTempoMap?.length??0)>=2?mappedSeconds(0,source!.referenceTempoMap!,source!.bpm)*1000:0;return arrangementStartTimes(fullSongBars).map(ms=>ms+offset);},[fullSongBars,songs,selectedSongId]);

  useEffect(() => { songRef.current = song ?? null; }, [song]);
  useEffect(()=>{if(!selectedSongId)return;let active=true;
    try { localStorage.setItem("drum-hero:builder-last-song",selectedSongId); } catch { /* The library still saves independently. */ }
    void readBuilderTakes(selectedSongId).then(rows=>{if(active){setTakes(rows);setSelectedTakeId(rows[0]?.id??'');setComparedTakeId(rows[1]?.id??'');setTakeCompChoices({});}}).catch(()=>{if(active)setTakes([]);});
    const timer=window.setTimeout(()=>{setSeekBar(null);setPracticeRangeStart(1);setPracticeRangeEnd(0);setPendingGrid(null);setGridFocus({voice:0,step:0});
      const current=songRef.current;
      try { const globalSettings=readSongBuilderSettings();const raw = localStorage.getItem(`drum-hero:builder-settings:${selectedSongId}`); const next = normalizeSongBuilderSettings(raw ? {...JSON.parse(raw),performancePresets:globalSettings.performancePresets,exportPresets:globalSettings.exportPresets,midiSeparateTracks:globalSettings.midiSeparateTracks} : globalSettings); setBuilderSettings(next); builderSettingsRef.current = next; setRecordLatency(next.midiLatencyMs); setFeelDraft({swing:next.swing,amount:next.humanizeAmount,velocity:next.humanizeVelocityAmount,seed:next.humanizeSeed}); } catch { /* Use current settings if storage is unavailable. */ }
      setVariationPreview(null);setPhrasePreview(null);setFractionalLoop(false);
      try{const saved=JSON.parse(localStorage.getItem(`drum-hero:builder-selection:${selectedSongId}`)??'null') as {sectionId?:string;clipId?:string;partId?:string}|null;
        const section=current?.sections.find(section=>section.id===saved?.sectionId)??current?.sections.find(section=>sectionClips(section).length>0)??current?.sections[0];
        const clip=section&&sectionClips(section).find(clip=>clip.id===saved?.clipId);
        setActiveSectionId(section?.id??'');setActiveClipId(clip?.id??(section?sectionClips(section)[0]?.id??'':''));setActivePartId(section?.parts.find(part=>part.id===saved?.partId)?.id??clip?.partId??'');
      }catch{/* The first available section remains selected. */}
      selectionLoadedRef.current=selectedSongId;
    },0);
    return()=>{active=false;clearTimeout(timer);};
  },[selectedSongId]);

  useEffect(()=>{setCueMeasure(1);setCueDraft('');},[activeSectionId]);
  useEffect(()=>{setPhraseEndingPreview(null);},[activePartId]);

  useEffect(()=>{if(!selectedSongId||selectionLoadedRef.current!==selectedSongId)return;try{localStorage.setItem(`drum-hero:builder-selection:${selectedSongId}`,JSON.stringify({sectionId:activeSectionId,clipId:activeClipId,partId:activePartId}));}catch{/* Selection can still be changed without storage. */}},[selectedSongId,activeSectionId,activeClipId,activePartId]);
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
    const keyboardVoices: Record<string, SongInstrument> = { a: "kick", s: "snare", d: "hihat", f: "tom", g: "crash", h: "openhat", j: "ride", k: "rimshot", l: "cowbell", y: "shaker", u: "tambourine" };
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
  const section = song?.sections.find((item) => item.id === activeSectionId) ?? song?.sections.find(item=>sectionClips(item).length>0) ?? song?.sections[0];
  const clips = section ? sectionClips(section) : [];
  const sectionIndex = song && section ? song.sections.findIndex(item => item.id === section.id) : -1;
  const nextSection = sectionIndex >= 0 ? song?.sections.slice(sectionIndex + 1).find(item => sectionClips(item).length > 0) : undefined;
  const nextSectionClip = nextSection ? sectionClips(nextSection)[0] : undefined;
  const nextSectionHasPattern = !!nextSection && !!nextSectionClip && nextSection.parts.some(item => item.id === nextSectionClip.partId) && nextSection.parts.length < 256;
  const activeClip = clips.find((item) => item.id === activeClipId) ?? clips[0];
  const part = section?.parts.find((item) => item.id === activePartId) ?? section?.parts.find((item) => item.id === activeClip?.partId);
  const measureCountForClip = (clip: SongClip) => section ? Array.from({ length: Math.max(1, Math.min(64, clip.repeats)) }, (_, index) => {
    const partId = clip.repeatVariants?.find(variant => variant.repeat === index + 1)?.partId ?? clip.partId;
    const clipPart = section.parts.find(candidate => candidate.id === partId);
    return clipPart ? Math.max(1, Math.ceil(clipPart.beats / meterBeats(clipPart.meter || section.meter || song?.meter || "4/4", clipPart.beats) - 0.00001)) : 0;
  }).reduce((total, count) => total + count, 0) : 0;
  const sectionMeasureCount = clips.reduce((total, clip) => total + measureCountForClip(clip), 0);
  const selectedRepeatPartId = activeClip?.repeatVariants?.find(variant => variant.repeat === selectedClipRepeat?.repeat)?.partId ?? activeClip?.partId;
  const editClipRepeat = activeClip && selectedClipRepeat?.clipId === activeClip.id && selectedClipRepeat.repeat <= activeClip.repeats && selectedRepeatPartId === activePartId
    ? selectedClipRepeat.repeat
    : activeClip?.repeatVariants?.find(item => item.partId === activePartId)?.repeat ?? 1;
  const cueMeasureMax = Math.max(1, Math.min(4096, sectionMeasureCount));
  const selectedRehearsalCue = section?.rehearsalCues?.find(cue=>cue.measure===cueMeasure&&(cue.kind??'band')===cueKind);
  const morphTargets = useMemo(()=>song?.sections.flatMap(item=>item.parts.map(target=>({key:`${item.id}:${target.id}`,sectionName:item.name,part:target}))).filter(item=>item.part.id!==part?.id)??[],[song,part?.id]);
  const selectedHit = part && selectedCell ? part.hits.find((hit) => hit.step === selectedCell.step && hit.instrument === selectedCell.instrument) : undefined;
  const stepsPerBeat = part ? part.subdivision / 4 : 1;
  const stepsPerMeasure = part ? Math.max(1, Math.round(meterBeats(part.meter || section?.meter || song?.meter || "4/4", part.beats) * stepsPerBeat)) : 1;
  const beatLabels = part ? Array.from({ length: partStepCount(part) }, (_, step) => gridBeatLabel(part.meter || section?.meter || song?.meter || "4/4", part.subdivision, step, stepsPerMeasure)) : [];
  const sources = useMemo(() => [...grooves, ...customGrooves], [customGrooves]);
  const activeMeter = part?.meter || section?.meter || song?.meter || "4/4";
  const nextFillPattern = (() => {
    const clipIndex = clips.findIndex(clip => clip.id === activeClip?.id);
    const followingClip = clips[clipIndex + 1];
    if (followingClip && section) return section.parts.find(candidate => candidate.id === followingClip.partId);
    return nextSection?.parts.find(candidate => candidate.id === nextSectionClip?.partId);
  })();
  const fillSuggestions = part ? sources
    .filter((item) => /fill|transition/i.test(`${item.name} ${item.style} ${item.description}`) && meterSignature(item.meter || `${item.beats}/4`) === meterSignature(activeMeter))
    .map(source => ({ source, ...contextualFillMatch(source, part, nextFillPattern, meterBeats(activeMeter, part.beats), transitionFillDensity) }))
    .sort((left, right) => right.score - left.score || left.source.name.localeCompare(right.source.name))
    .slice(0, 3) : [];
  const availableGridVoices = beginner ? (['kick','snare','hihat','tom','crash'] as SongInstrument[]) : BUILDER_VOICES.filter(voice=>!voice.startsWith('custom')||activeCustomVoiceIds.includes(voice));
  const gridVoices = touchGrid ? availableGridVoices.filter(voice => voice === touchVoice) : availableGridVoices;
  const visibleSources = useMemo(() => sources.filter((item) => {
    const query = sourceQuery.trim().toLowerCase();
    const isFill = /fill/i.test(`${item.name} ${item.style} ${item.description}`);
    return (!browserFilters.meter || meterSignature(item.meter??'4/4')===browserFilters.meter) && (!browserFilters.duration || item.beats===Number(browserFilters.duration)) && (!browserFilters.grid || item.subdivision===Number(browserFilters.grid)) && (!browserFilters.level || item.level===browserFilters.level) && (!browserFilters.voice || item.hits.some(hit=>hit.instrument===browserFilters.voice)) && (browserFilters.collection==='all'||(browserFilters.collection==='favorites'?favorites:recentSources).includes(item.id)) && (sourceFilter === "all" || isFill) && (!query || `${item.name} ${item.style} ${item.description} ${item.focus} ${item.tags?.join(" ")??""}`.toLowerCase().includes(query));
  }), [sources, sourceFilter, sourceQuery, browserFilters, favorites, recentSources]);
  const notationBars = useMemo(() => {
    const selectedSong = songs.find((item) => item.id === selectedSongId);
    return selectedSong ? buildArrangementBars(selectedSong, previewScope === "song" ? undefined : previewScope).map(bar=>exportVoice==="all"?bar:{...bar,hits:bar.hits.filter(hit=>hit.instrument===exportVoice)}) : [];
  }, [songs, selectedSongId, previewScope, exportVoice]);
  const playbackBars = song ? buildArrangementBars(song, playScope === "song" ? undefined : playScope) : [];
  const activePlaybackCue = position ? trackRef.current?.bars.find(bar=>bar.index===position.barIndex)?.rehearsalCue : undefined;
  const practiceBarCount = Math.max(1, playbackBars.length);
  const safePracticeStart = Math.max(1, Math.min(practiceBarCount, practiceRangeStart));
  const safePracticeEnd = Math.max(safePracticeStart, Math.min(practiceBarCount, practiceRangeEnd || practiceBarCount));
  const songTitleDraft = songDraft && songDraft.songId === song?.id ? songDraft.title : song?.title ?? "";
  const songArtistDraft = songDraft && songDraft.songId === song?.id ? songDraft.artist : song?.artist ?? "";
  const notationPages=paginateNotation(notationBars,builderSettings.notation);
  const pageCount=Math.max(1,notationPages.length);
  const currentPage=Math.max(0,Math.min(previewPage,pageCount-1));
  const fullBarsForCursor=fullSongBars;
  const notationIndex=position ? previewScope==='song' ? position.barIndex : fullBarsForCursor[position.barIndex]?.sectionId===previewScope ? fullBarsForCursor.slice(0,position.barIndex).filter(bar=>bar.sectionId===previewScope).length : -1 : -1;
  useEffect(()=>{
    if(!followPlayhead||notationIndex<0)return;
    const pages=paginateNotation(notationBars,builderSettings.notation),bar=notationBars[notationIndex];
    const next=pages.findIndex(page=>page.includes(bar));
    const timer=window.setTimeout(()=>{if(next>=0)setPreviewPage(next);},0);return()=>clearTimeout(timer);
  },[notationIndex,followPlayhead,notationBars,builderSettings.notation]);

  useEffect(() => {
    const target = previewCanvasRef.current;
    if (!target || !song) return;
    try {
      const page = drawNotationPage(song, notationBars, notationView, currentPage, position && notationIndex >= 0 ? {barIndex:notationIndex,fraction:position.fraction} : null, builderSettings.notation);
      const context = target.getContext("2d");
      if (!context) return;
      target.width = page.width;
      target.height = page.height;
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(page, 0, 0);
    } catch (error) {
      console.error("Could not draw the notation preview.", error);
    }
  }, [song, notationBars, notationView, currentPage, builderSettings.notation, notationIndex, position]);

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

  const addCustomVoice = () => {
    const nextVoice = customVoiceIds.slice(4).find(voice => !activeCustomVoiceIds.includes(voice));
    if (!nextVoice) { setMessage("All eight custom drum lanes are in use. Remove a custom lane to add another."); return; }
    updateSong(current => ({ ...current, voiceLabels: { ...current.voiceLabels, [nextVoice]: BASE_VOICE_LABEL[nextVoice] } }));
    setMessage(`${BASE_VOICE_LABEL[nextVoice]} added. Assign its sample and MIDI note in the mixer and input settings.`);
  };
  const removeCustomVoice = (voice: SongInstrument) => {
    if (!song || !window.confirm(`Remove ${song.voiceLabels?.[voice] || BASE_VOICE_LABEL[voice]} and its notes from this song? Undo can restore the lane.`)) return;
    updateSong(current => {
      const voiceLabels = { ...current.voiceLabels }; delete voiceLabels[voice];
      return {
        ...current,
        voiceLabels: Object.keys(voiceLabels).length ? voiceLabels : undefined,
        arrangementAutomation: current.arrangementAutomation?.filter(point => point.instrument !== voice),
        sections: current.sections.map(section => ({
          ...section,
          parts: section.parts.map(pattern => ({ ...pattern, hits: pattern.hits.filter(hit => hit.instrument !== voice) })),
          clips: section.clips?.map(clip => clip.overrides?.mutedVoices?.includes(voice) ? { ...clip, overrides: { ...clip.overrides, mutedVoices: clip.overrides.mutedVoices.filter(item => item !== voice) } } : clip),
          automation: section.automation ? { ...section.automation, mutedVoices: section.automation.mutedVoices?.filter(item => item !== voice), voices: Object.fromEntries(Object.entries(section.automation.voices ?? {}).filter(([item]) => item !== voice)) } : undefined
        }))
      };
    });
    setMessage(`${song.voiceLabels?.[voice] || BASE_VOICE_LABEL[voice]} and its notes were removed. Undo can restore them.`);
  };

  const toggleStaffNote = (barIndex: number, localStep: number) => {
    const bar=notationBars[barIndex];
    if(!song||!bar)return;
    const section=song.sections.find(item=>item.id===bar.sectionId),part=section?.parts.find(item=>item.id===bar.partId);
    if(!section||!part){setMessage("This score measure no longer has an editable pattern.");return;}
    const step=Math.max(0,Math.min(partStepCount(part)-1,Math.round(bar.partBeatOffset*part.subdivision/4+localStep*4/bar.subdivision*part.subdivision/4)));
    updateSong(current=>{
      const target=current.sections.find(item=>item.id===section.id);
      if(!target)return current;
      const nextSection=editLinkedPart(target,part.id,pattern=>{
        const exists=pattern.hits.some(hit=>hit.instrument===staffEditVoice&&hit.step===step);
        return {...pattern,hits:exists?pattern.hits.filter(hit=>hit.instrument!==staffEditVoice||hit.step!==step):[...pattern.hits,{step,instrument:staffEditVoice,accent:false,velocity:86}]};
      });
      return {...current,sections:current.sections.map(item=>item.id===section.id?nextSection:item)};
    });
    setActiveSectionId(section.id);setActivePartId(part.id);setActiveClipId(bar.clipId??"");setSelectedCell({instrument:staffEditVoice,step});setStaffEditBarIndex(barIndex);setStaffEditStep(localStep);
    setMessage(`${VOICE_LABEL[staffEditVoice]} ${part.hits.some(hit=>hit.instrument===staffEditVoice&&hit.step===step)?"removed from":"added at"} measure ${bar.number}, grid step ${step+1}.`);
  };

  const updateSection = (sectionId: string, change: (current: SongSection) => SongSection) => updateSong((current) => ({
    ...current,
    sections: current.sections.map((item) => item.id === sectionId ? change(item) : item)
  }));

  const updateClip = (sectionId:string,clipId:string,change:(current:SongClip)=>SongClip)=>updateSection(sectionId,current=>({...current,clips:sectionClips(current).map(clip=>clip.id===clipId?change(clip):clip)}));

  const createRepeatVariation = (clip: SongClip, repeat: number) => {
    if (!section || !song || !Number.isInteger(repeat) || repeat < 2 || repeat > clip.repeats || section.parts.length >= 256) return;
    const sourceId = clip.repeatVariants?.find(item => item.repeat === repeat)?.partId ?? clip.partId;
    const source = section.parts.find(item => item.id === sourceId);
    if (!source) return;
    const copy = { ...structuredClone(source), id: uid(), name: `${source.name} · repeat ${repeat}`, sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined };
    updateSection(section.id, current => ({ ...current, parts: [...current.parts, copy], clips: sectionClips(current).map(item => item.id === clip.id ? { ...item, repeatVariants: [...(item.repeatVariants ?? []).filter(variant => variant.repeat !== repeat), { repeat, partId: copy.id }] } : item) }));
    setActiveClipId(clip.id);
    setSelectedClipRepeat({ clipId: clip.id, repeat });
    setActivePartId(copy.id);
    setSelectedCells([]);
    setSelectedCell(null);
    setMessage(`Repeat ${repeat} now has an independent editable pattern.`);
  };

  const setClipEditRepeat = (clip: SongClip, repeat: number) => {
    const partId = clip.repeatVariants?.find(item => item.repeat === repeat)?.partId ?? clip.partId;
    setActiveClipId(clip.id);
    setSelectedClipRepeat({ clipId: clip.id, repeat });
    setActivePartId(partId);
    setSelectedCells([]);
    setSelectedCell(null);
  };

  const saveRehearsalCue = () => {
    if(!section)return;
    const text=cueDraft.trim().slice(0,240);
    if(!text){setMessage('Enter a rehearsal cue before saving.');return;}
    if(cueMeasure<1||cueMeasure>cueMeasureMax){setMessage(`Choose a measure from 1 to ${cueMeasureMax}.`);return;}
    if(!selectedRehearsalCue&&(section.rehearsalCues?.length??0)>=256){setMessage('This section already has 256 rehearsal cues. Update or remove a cue first.');return;}
    updateSection(section.id,current=>({...current,rehearsalCues:[...(current.rehearsalCues??[]).filter(cue=>cue.measure!==cueMeasure||(cue.kind??'band')!==cueKind),{id:uid(),measure:cueMeasure,text,kind:cueKind}].sort((a,b)=>a.measure-b.measure).slice(0,256)}));
    setMessage(`${cueKind[0]!.toUpperCase()}${cueKind.slice(1)} cue saved for ${section.name}, measure ${cueMeasure}.`);
  };

  const updatePart = (partId: string, change: (current: DrumPart) => DrumPart) => {
    if (!section) return;
    try {
      const mode = playbackModeRef.current;
      const keepPlayback = ["playing", "paused", "count-in"].includes(mode);
      const oldTrack = trackRef.current;
      const now = monotonicNow();
      const oldElapsed = mode === "paused" ? pausedAtRef.current - startAtRef.current : now - startAtRef.current;
      const oldBar = oldTrack?.bars.find(bar => oldElapsed >= bar.startsAt && oldElapsed < bar.startsAt + bar.duration);
      const oldFraction = oldBar ? Math.max(0, Math.min(1, (oldElapsed - oldBar.startsAt) / Math.max(1, oldBar.duration))) : 0;
      const currentSong = songRef.current ?? song;
      if (!currentSong) return;
      const currentSection = currentSong.sections.find(item=>item.id===section.id)??section;
      const nextSection = editLinkedPart(currentSection, partId, change);
      const editableSong = currentSong.bundled ? copyAsPersonalSong(currentSong) : currentSong;
      const nextSong = { ...editableSong, sections: editableSong.sections.map(item => item.id === section.id ? nextSection : item) };
      persistSong(nextSong, true, keepPlayback);
      if (keepPlayback && oldTrack) {
        audioRef.current?.silence?.();
        nextLoopScheduledRef.current = 0;
        const refreshed = buildPracticeTrackRef.current(practiceTempoOffsetRef.current);
        trackRef.current = refreshed;
        if (oldElapsed < 0) {
          cueIndexRef.current = 0;
        } else {
          const nextBar = refreshed.bars.find(bar => bar.index === oldBar?.index) ?? refreshed.bars.find(bar => oldBar && bar.index >= oldBar.index) ?? refreshed.bars.at(-1);
          if (nextBar) {
            const nextElapsed = nextBar.startsAt + oldFraction * nextBar.duration;
            startAtRef.current = now - nextElapsed;
            if (mode === "paused") pausedAtRef.current = now;
            cueIndexRef.current = refreshed.cues.findIndex(cue => cue.at >= nextElapsed + 24);
            if (cueIndexRef.current < 0) cueIndexRef.current = refreshed.cues.length;
            setPosition({ barIndex: nextBar.index, partId: nextBar.partId, clipId: nextBar.clipId, step: Math.floor((nextBar.partBeatOffset + oldFraction * nextBar.beats) * nextBar.subdivision / 4), fraction: oldFraction });
          }
        }
      }
    } catch(error) { setMessage(error instanceof Error?error.message:'This linked update could not be applied.'); }
  };

  const applyBackingHits = (hits: DrumPart['hits']) => {
    if (!part) { setMessage('Select a pattern before adding suggestions.'); return; }
    const merged = new Map<string, DrumPart['hits'][number]>(part.hits.map(hit => [`${hit.instrument}:${hit.step}`, hit]));
    let added = 0;
    for (const hit of hits) if (!merged.has(`${hit.instrument}:${hit.step}`)) { merged.set(`${hit.instrument}:${hit.step}`, hit); added += 1; }
    if (merged.size > 256) { setMessage('These suggestions exceed the 256-note pattern limit. Clear some notes or choose a shorter pattern.'); return; }
    updatePart(part.id, current => {
      const next = new Map<string, DrumPart['hits'][number]>(current.hits.map(hit => [`${hit.instrument}:${hit.step}`, hit]));
      for (const hit of hits) if (!next.has(`${hit.instrument}:${hit.step}`)) next.set(`${hit.instrument}:${hit.step}`, hit);
      return { ...current, hits: [...next.values()].sort((a, b) => a.step - b.step) };
    });
    setMessage(`${added} audio suggestions added to ${part.name}; existing notes at matching cells were preserved. Edit or undo them in the pattern grid.`);
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
      parts: copy.parts.map((item) => ({ ...item, id: idMap.get(item.id)!, linkedBaseId: item.linkedBaseId ? idMap.get(item.linkedBaseId) : undefined })),
      clips: sectionClips(sourceSection).map((clip) => ({ ...clip, id: uid(), partId: idMap.get(clip.partId) ?? clip.partId, repeatVariants: clip.repeatVariants?.map(variant=>({...variant,partId:idMap.get(variant.partId)??variant.partId})) }))
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
    setMeterFitPreview(null);
    const recent=[source.id,...recentSources.filter(id=>id!==source.id)].slice(0,20);setRecentSources(recent);try{localStorage.setItem('drum-hero:pattern-recent',JSON.stringify(recent));}catch{/* The insertion can still proceed. */}
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

  const previewMeterFit = (source: Groove) => {
    const adapted = fitGrooveToMeter(source, cleanMeterLabel(activeMeter));
    setMeterFitPreview({ source, adapted });
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

  const nextArrangementPattern = () => {
    if (!song || !section || !activeClip) return undefined;
    const clipIndex = clips.findIndex(clip => clip.id === activeClip.id);
    const followingClip = clips[clipIndex + 1];
    if (followingClip) return section.parts.find(candidate => candidate.id === followingClip.partId);
    const currentSectionIndex = song.sections.findIndex(candidate => candidate.id === section.id);
    for (const followingSection of song.sections.slice(currentSectionIndex + 1)) {
      const clip = sectionClips(followingSection)[0];
      const candidate = clip && followingSection.parts.find(item => item.id === clip.partId);
      if (candidate) return candidate;
    }
    return undefined;
  };

  const insertFillTransition = (source: Groove) => {
    if (!song || !section) return;
    clearPreview();
    const next = part ? contextualizeFill(prepareTransitionPart(source), part, nextArrangementPattern(), transitionFillDensity, transitionFillComplexity) : prepareTransitionPart(source);
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

  const generatePhraseEnding = () => {
    if(!part)return;
    setPhraseEndingPreview(phraseAwareEnding(part,phraseFillWindow,preservePhraseBackbeat));
  };

  const insertPhraseEnding = () => {
    if(!song||!section||!phraseEndingPreview)return;
    const sectionIndex=song.sections.findIndex(item=>item.id===section.id),nextSection=song.sections.slice(sectionIndex+1).find(item=>sectionClips(item).length>0);
    const nextSectionClip=nextSection?sectionClips(nextSection)[0]:undefined;
    const nextSectionPart=nextSection&&nextSectionClip?nextSection.parts.find(item=>item.id===nextSectionClip.partId):undefined;
    if(section.parts.length>=256||clips.length>=512){setMessage('This section is full. Add another section before inserting a phrase ending.');return;}
    if(addArrivalAccent&&nextSection&&nextSectionPart&&(nextSection.parts.length>=256)){setMessage('The next section is full, so there is no room for an independent arrival accent. Turn that option off or make room first.');return;}
    const fill=structuredClone(phraseEndingPreview),fillClip:SongClip={id:uid(),partId:fill.id,repeats:1};
    const arrivalId=addArrivalAccent&&nextSectionPart?uid():'';
    updateSong(current=>({ ...current, sections:current.sections.map(item=>{
      if(item.id===section.id)return {...item,parts:[...item.parts,fill],clips:[...sectionClips(item),fillClip]};
      if(!arrivalId||item.id!==nextSection?.id||!nextSectionClip||!nextSectionPart)return item;
      const arrival={...structuredClone(nextSectionPart),id:arrivalId,name:`${nextSectionPart.name} · downbeat accent`.slice(0,80),sourceId:undefined,linkedBaseId:undefined,linkOverrides:undefined,linkRemoved:undefined};
      const hits=[...arrival.hits];
      for(const instrument of ['kick','crash'] as const){const existing=hits.find(hit=>hit.step===0&&hit.instrument===instrument);if(existing){existing.accent=true;existing.velocity=Math.max(existing.velocity??86,112);}else hits.push({step:0,instrument,accent:true,velocity:112});}
      arrival.hits=hits;
      return {...item,parts:[...item.parts,arrival],clips:sectionClips(item).map(clip=>clip.id===nextSectionClip.id?{...clip,partId:arrival.id}:clip)};
    })}));
    setActiveClipId(fillClip.id);setActivePartId(fill.id);setPhraseEndingPreview(null);
    setMessage(addArrivalAccent&&arrivalId?`Phrase ending added to ${section.name}; the next section has an independent kick + crash on its downbeat.`:`Phrase ending added to the end of ${section.name}.`);
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
    const currentBeats = meterBeats(part.meter || section.meter || song.meter, part.beats);
    const contextBeats = currentBeats * transitionContextBars;
    const previousStart = Math.max(0, part.beats - contextBeats);
    const nextClip = clips[clips.findIndex((clip) => clip.id === activeClip.id) + 1];
    let nextSection=section;
    let nextPart = nextClip ? section.parts.find((item) => item.id === nextClip.partId) : undefined;
    if(!nextPart){const sectionIndex=song.sections.findIndex(item=>item.id===section.id);nextSection=song.sections.slice(sectionIndex+1).find(item=>sectionClips(item).length>0)??section;const firstNext=sectionClips(nextSection)[0];nextPart=firstNext?nextSection.parts.find(item=>item.id===firstNext.partId):undefined;}
    const fillPart = contextualizeFill(prepareTransitionPart(source), part, nextPart, transitionFillDensity, transitionFillComplexity);
    const bpm = section.bpm || song.bpm, nextBpm=nextSection.bpm||song.bpm;
    const quarterMs = 60_000 / bpm;
    const queue = (pattern: DrumPart | undefined, offset: number, fromBeat: number, toBeat: number, tempo=bpm) => {
      if (!pattern) return;
      for (const hit of pattern.hits) {
        const beat = hit.step * 4 / pattern.subdivision;
        if (beat < fromBeat || beat >= toBeat) continue;
        const timer = window.setTimeout(() => audio.hit(hit.instrument, hit.accent, hit.velocity ?? (hit.accent ? 118 : 86)), Math.max(0, offset + (beat - fromBeat) * 60_000 / tempo));
        previewTimersRef.current.push(timer);
      }
    };
    const beforeDuration=(part.beats-previousStart)*quarterMs,fillDuration=fillPart.beats*quarterMs,nextBeats=Math.min(contextBeats,nextPart?.beats??0),nextDuration=nextBeats*60_000/nextBpm;
    queue(part, 0, previousStart, part.beats);
    queue(fillPart, beforeDuration, 0, fillPart.beats);
    queue(nextPart, beforeDuration+fillDuration, 0, nextBeats,nextBpm);
    const previewDuration = beforeDuration + fillDuration + nextDuration;
    previewTimersRef.current.push(window.setTimeout(() => {
      if (request === previewRequestRef.current) setPreviewSourceId("");
      previewTimersRef.current = [];
    }, previewDuration + 100));
    setMessage(nextPart ? `Previewing up to ${transitionContextBars} measure${transitionContextBars===1?"":"s"} around ${part.name} → ${source.name} → ${nextPart.name}.` : `Previewing ${part.name} → ${source.name} at the end of this section.`);
  };

  const previewSource = async (source: Groove | DrumPart) => {
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
    const bpm = song ? section?.bpm ?? song.bpm : ("defaultBpm" in source ? source.defaultBpm : source.bpm);
    const quarterMs = 60_000 / bpm;
    const stepMs = quarterMs * 4 / source.subdivision;
    const loopMs = source.beats * quarterMs;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const hits = 'songPattern' in source && source.songPattern ? source.songPattern.hits : source.hits;
      hits.forEach((hit) => {
        const full = hit as DrumPart['hits'][number];
        for (const [delay,scale] of expressionStrikes(full.articulation,stepMs)) {
          const timer = window.setTimeout(() => audio.hit(full.articulation==='foot-splash'?'openhat':hit.instrument,hit.accent,Math.round((full.velocity ?? (full.ghost?38:hit.accent?118:86))*scale),full.articulation==='choke'),Math.max(0,repeat*loopMs+hit.step*stepMs+(full.timingOffsetMs??0)+delay));
          previewTimersRef.current.push(timer);
        }
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
      const copiedVariants = (clip.repeatVariants ?? []).flatMap(variant => {
        const variantPart = section.parts.find(candidate => candidate.id === variant.partId);
        if (!variantPart) return [];
        const variantCopy = { ...structuredClone(variantPart), id: uid(), name: `${variantPart.name} copy`, sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined };
        copiedParts.push(variantCopy);
        return [{ repeat: variant.repeat, partId: variantCopy.id }];
      });
      copiedClips.push({ id: uid(), partId: copy.id, repeats: clip.repeats, overrides: structuredClone(clip.overrides), repeatVariants: copiedVariants.length ? copiedVariants : undefined });
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
    const duplicate = { ...clip, id: uid(), repeats: 1, repeatVariants: undefined };
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
    const duplicate = { ...structuredClone(part), id: uid(), name: `${part.name} copy`, sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined };
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
    if (!section || !part || !window.confirm(`Remove ${part.name}? This deletes its ${part.hits.length} notes and all ${sectionClips(section).filter(clip=>clip.partId===part.id).length} linked clips. Undo can restore them.`)) return;
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
    if ((event.metaKey||event.ctrlKey) && ['c','v','a'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if(event.key.toLowerCase()==='c')copySelectedHits();
      if(event.key.toLowerCase()==='v')pasteHits();
      if(event.key.toLowerCase()==='a'&&part)setSelectedCells(part.hits.map(hit=>`${hit.instrument}:${hit.step}`));
      return;
    }
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelectedHits();return;}
    if(event.key==='Escape'){setSelectedCells([]);return;}
    const direction = directions[event.key];
    if (!direction || !part) return;
    event.preventDefault();
    const nextVoice = Math.max(0, Math.min(gridVoices.length - 1, voiceIndex + direction[0]));
    const nextStep = Math.max(0, Math.min(partStepCount(part) - 1, step + direction[1]));
    setGridFocus({voice:nextVoice,step:nextStep});
    if(event.shiftKey){const anchor=selectedCell??{instrument:gridVoices[voiceIndex],step};const anchorVoice=gridVoices.indexOf(anchor.instrument);const selected:string[]=[];for(let row=Math.min(anchorVoice,nextVoice);row<=Math.max(anchorVoice,nextVoice);row++)for(let col=Math.min(anchor.step,nextStep);col<=Math.max(anchor.step,nextStep);col++)selected.push(`${gridVoices[row]}:${col}`);setSelectedCells(selected);if(!selectedCell)setSelectedCell(anchor);}
    else setSelectedCell({instrument:gridVoices[nextVoice],step:nextStep});
    event.currentTarget.closest(".song-builder-grid")?.querySelector<HTMLButtonElement>(`[data-song-voice="${nextVoice}"][data-song-step="${nextStep}"]`)?.focus();
  };

  const changeSubdivision = (value:number)=>{if(part&&[4,8,12,16].includes(value))setPendingGrid(value as DrumPart['subdivision']);};
  const gridPreview=part&&pendingGrid?previewGridChange(part,pendingGrid):null;
  const measureStepLength=part?meterBeats(part.meter||section?.meter||song?.meter||'4/4',part.beats)*part.subdivision/4:1;
  const phraseMeasures=part?Math.max(1,Math.ceil(partStepCount(part)/measureStepLength)):1;
  const rangeFirstExact=(Math.min(phraseStart,phraseMeasures)-1)*measureStepLength;
  const rangeEndExact=part?Math.min(partStepCount(part),Math.min(Math.max(phraseStart,phraseEnd),phraseMeasures)*measureStepLength):0;
  const phraseRangeAligned=Number.isInteger(rangeFirstExact)&&Number.isInteger(rangeEndExact)&&rangeEndExact>rangeFirstExact;
  const rangeFirst=Math.round(rangeFirstExact),rangeLast=Math.round(rangeEndExact)-1;
  const selectedTake=takes.find(t=>t.id===selectedTakeId);
  const comparedTake=takes.find(t=>t.id===comparedTakeId);
  const takeCompRows=(()=>{
    if(!song||!selectedTake||!comparedTake)return [];
    const rows=new Map<string,{key:string;sectionId:string;partId:string;measure:number;firstHits:number;secondHits:number}>();
    for(const [takeIndex,take] of [[0,selectedTake],[1,comparedTake]] as const)for(const hit of take.hits){const key=builderTakeMeasureKey(song,hit),row=rows.get(key)??{key,sectionId:hit.sectionId,partId:hit.partId,measure:builderTakeMeasureIndex(song,hit),firstHits:0,secondHits:0};if(takeIndex===0)row.firstHits++;else row.secondHits++;rows.set(key,row);}
    return [...rows.values()].sort((a,b)=>song.sections.findIndex(section=>section.id===a.sectionId)-song.sections.findIndex(section=>section.id===b.sectionId)||a.partId.localeCompare(b.partId)||a.measure-b.measure);
  })();
  const makeIndependent=()=>{if(!song||!section||!activeClip||activeClip.partId!==part?.id)return;const editable=song.bundled?copyAsPersonalSong(song):song;const result=makeClipIndependent(editable,section.id,activeClip.id);if(!result.partId){setMessage('This clip could not be detached.');return;}persistSong(result.song);setActivePartId(result.partId);setMessage('This clip now has its own independent pattern.');};
  const savePatternToLibrary=()=>{if(!part)return;const next=partToSavedGroove({...part,bpm:section?.bpm??song?.bpm??part.bpm},patternSaveName,patternSaveTags,saveAsFill,rangeFirst,rangeLast);const existing=readCustomGrooves();if(existing.length>=100){setMessage('Your pattern library is full. Remove a custom pattern first.');return;}if(!writeCustomGrooves([...existing,next])){setMessage('Could not save the pattern to your library.');return;}setCustomGrooves([...existing,next]);setPatternSaveName('');setMessage(`Saved “${next.name}” to the custom ${saveAsFill?'fill':'groove'} library with its dynamics and voices.`);};
  const auditionTake=async(take=selectedTake)=>{
    if(!take||!song)return;if(previewSourceId===take.id){clearPreview();return;}stopPlayback();clearPreview();const request=previewRequestRef.current;const audio=await ensureDrumAudio();if(!audio||!await audio.ready||request!==previewRequestRef.current)return;
    setPreviewSourceId(take.id);let end=0;
    for(const raw of take.hits){const source=song.sections.find(section=>section.id===raw.sectionId)?.parts.find(part=>part.id===raw.partId);if(!source)continue;const quantized=quantizeRecordedHit(raw,quantizeStrength,source.subdivision,partStepCount(source));const velocity=Math.max(1,Math.min(127,Math.round(raw.velocity*takeVelocityScale/100)));const at=Math.max(0,raw.atMs+(quantized.gridStep*4/source.subdivision-raw.step*4/(raw.subdivision??source.subdivision))*60000/raw.bpm+quantized.timingOffsetMs);end=Math.max(end,at);previewTimersRef.current.push(window.setTimeout(()=>audio.hit(raw.instrument,velocity>=112,velocity),at+120));}
    previewTimersRef.current.push(window.setTimeout(()=>clearPreview(),end+700));
  };

  const auditionFeel = async () => {
    if (!song) return;
    stopPlayback(); clearPreview();
    const request=previewRequestRef.current, audio=await ensureDrumAudio();
    if(!audio || !await audio.ready || request!==previewRequestRef.current) return;
    const track=playbackTrack(song,section?.id,feelDraft.swing,1,[1,2],feelDraft.amount,feelDraft.seed,0,feelDraft.velocity);
    setPreviewSourceId('feel-preview');
    for(const cue of track.cues) if(cue.kind==='hit' && cue.instrument) previewTimersRef.current.push(window.setTimeout(()=>audio.hit(cue.instrument!,cue.accent,cue.velocity,cue.choke),cue.at));
    previewTimersRef.current.push(window.setTimeout(()=>clearPreview(),track.duration+250));
    setMessage('Previewing the first two measures of this section with the proposed feel.');
  };

  const previewArrangementForm = async (sections:SongSection[]) => {
    const token='arrangement-form-preview';
    if(previewSourceId===token){clearPreview();return;}
    if(!song||!sections.length)return;
    stopPlayback();clearPreview();
    const request=previewRequestRef.current,audio=await ensureDrumAudio();
    if(!audio||!await audio.ready||request!==previewRequestRef.current)return;
    const previewSong={...song,sections,referenceTempoMap:undefined};
    const track=playbackTrack(previewSong,undefined,swing,metronomeSubdivision);
    setPreviewSourceId(token);
    for(const cue of track.cues)if(cue.kind==='hit'&&cue.instrument)previewTimersRef.current.push(window.setTimeout(()=>audio.hit(cue.instrument!,cue.accent,cue.velocity,cue.choke),cue.at));
    previewTimersRef.current.push(window.setTimeout(()=>clearPreview(),track.duration+250));
    setMessage('Previewing the generated song form. The existing arrangement has not changed.');
  };

  const exportSheet = async (format: "png" | "pdf" | "midi" | "musicxml" | "wav" | "stems", config?: { view?: NotationView; scope?: string; notation?: SongBuilderSettings["notation"] }) => {
    if (!song) return;
    const scope = config?.scope ?? previewScope, view = config?.view ?? notationView, notation = config?.notation ?? builderSettings.notation;
    const bars = buildArrangementBars(song, scope === "song" ? undefined : scope).map(bar => exportVoice === "all" ? bar : { ...bar, hits: bar.hits.filter(hit => hit.instrument === exportVoice) });
    if (!bars.length) { setMessage("Add at least one pattern before exporting notation."); return; }
    try {
      const name = `${safeName(song.title)}-${safeName(scope === "song" ? "full-song" : song.sections.find((item) => item.id === scope)?.name ?? "section")}`;
      if (format === "midi") {
        downloadBlob(arrangementMidi(humanizeArrangementBars(bars, builderSettings.humanizeAmount, builderSettings.humanizeSeed, builderSettings.humanizeVelocityAmount), song.title, builderSettings.midiNotes, swing, builderSettings.midiSeparateTracks), `${name}.mid`);
      } else if (format === "musicxml") {
        downloadBlob(arrangementMusicXml(bars, song.title, song.artist, builderSettings.midiNotes, notation), `${name}.musicxml`);
      } else if (format === "wav") {
        setMessage("Rendering WAV audio from the drum samples…");
        const customSamples = await readCustomSamples().catch(() => ({}));
        const backing = includeExportBacking ? await readBuilderBacking(song.id) : undefined;
        if (includeExportBacking && !backing) throw new Error('Attach a backing track in Rehearse before including it in the WAV.');
        downloadBlob(await arrangementWav(humanizeArrangementBars(bars, builderSettings.humanizeAmount, builderSettings.humanizeSeed, builderSettings.humanizeVelocityAmount), swing, builderSettings.mix, customSamples, { metronome: includeExportClick, backing, backingOffsetSeconds: previewScope === 'song' ? (songBarTimes[0]??0)/1000 : (songBarTimes[fullSongBars.findIndex(bar=>bar.sectionId===previewScope)]??0)/1000 }), `${name}.wav`);
      } else if (format === "stems") {
        setMessage("Rendering aligned voice, click, and backing stems. Long exports can take a moment…");
        const customSamples = await readCustomSamples().catch(() => ({}));
        const backing = includeExportBacking ? await readBuilderBacking(song.id) : undefined;
        if (includeExportBacking && !backing) throw new Error('Attach a backing track in Rehearse before including it as a stem.');
        const archive = await arrangementStemsZip(humanizeArrangementBars(bars, builderSettings.humanizeAmount, builderSettings.humanizeSeed, builderSettings.humanizeVelocityAmount), swing, builderSettings.mix, customSamples, { metronome: includeExportClick, backing, backingOffsetSeconds: previewScope === 'song' ? (songBarTimes[0]??0)/1000 : (songBarTimes[fullSongBars.findIndex(bar=>bar.sectionId===previewScope)]??0)/1000 });
        downloadBlob(archive, `${name}-stems.zip`);
      } else {
        const pages = paginateNotation(bars,notation).length;
        if (format === "png" && pages > 30) { setMessage("This arrangement is too long for one PNG. Export the PDF or choose a section."); return; }
        const canvases = Array.from({ length: pages }, (_, page) => drawNotationPage(song, bars, view, page, null, notation));
        if (format === "pdf") {
          downloadBlob(canvasesPdf(canvases,notation), `${name}.pdf`);
        } else {
        const image = document.createElement("canvas");
        image.width = canvases[0].width;
        image.height = canvases[0].height * canvases.length;
        const context = image.getContext("2d");
        if (!context) throw new Error("This browser could not prepare the PNG download.");
        canvases.forEach((page, index) => context.drawImage(page, 0, index * canvases[0].height));
        downloadBlob(await canvasPng(image), `${name}.png`);
        }
      }
      setMessage(`${format === "musicxml" ? "MusicXML" : format === "stems" ? "Aligned WAV stems ZIP" : format.toUpperCase()} export downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The notation export failed.");
    }
  };

  const saveExportPreset = () => {
    const name = exportPresetNameDraft.trim().slice(0, 40);
    if (!name) return;
    const preset: SongBuilderExportPreset = { id: uid(), name, view: notationView, format: exportPresetFormat, scope: previewScope === "song" ? "song" : "section", paperSize: builderSettings.notation.paperSize ?? "letter", orientation: builderSettings.notation.orientation ?? "landscape", barsPerPage: builderSettings.notation.barsPerPage, barsPerLine: builderSettings.notation.barsPerLine ?? 2, sectionLineBreaks: builderSettings.notation.sectionLineBreaks ?? false };
    changeBuilderSettings(current => ({ ...current, exportPresets: [...current.exportPresets.filter(item => item.name.toLowerCase() !== name.toLowerCase()), preset].slice(-20) }));
    setExportPresetChoice(preset.id); setExportPresetNameDraft(""); setMessage(`Saved “${name}” as an export preset on this device.`);
  };

  const applyExportPreset = (download = false) => {
    const preset = builderSettings.exportPresets.find(item => item.id === exportPresetChoice);
    if (!preset) return;
    const sectionId = song?.sections.some(item => item.id === activeSectionId) ? activeSectionId : song?.sections[0]?.id;
    const scope = preset.scope === "song" ? "song" : sectionId ?? "song";
    const notation = { ...builderSettings.notation, paperSize: preset.paperSize, orientation: preset.orientation, barsPerPage: preset.barsPerPage, barsPerLine: preset.barsPerLine, sectionLineBreaks: preset.sectionLineBreaks };
    setNotationView(preset.view); setPreviewScope(scope); setPreviewPage(0);
    changeBuilderSettings(current => ({ ...current, notation: { ...current.notation, paperSize: preset.paperSize, orientation: preset.orientation, barsPerPage: preset.barsPerPage, barsPerLine: preset.barsPerLine, sectionLineBreaks: preset.sectionLineBreaks } }));
    if (download) void exportSheet(preset.format, { view: preset.view, scope, notation });
    else setMessage(`Applied “${preset.name}”. Choose PNG or PDF to download the chart.`);
  };

  const copyPlaybackLink = async () => {
    if (!song) return;
    try {
      const url = await createSongShareUrl(song);
      setShareLinkDraft(url);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const input = document.createElement("textarea"); input.value = url; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select();
        const copied = document.execCommand("copy"); input.remove(); if (!copied) throw new Error("Clipboard access is unavailable. Select and copy the playback link shown below.");
      }
      setMessage("Read-only playback link copied. Anyone with the link can open this arrangement.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create a playback link."); }
  };

  const scheduleAudioCue = (cue: PlaybackTrack['cues'][number], at: number) => {
    if(cue.kind==='click' && optionsRef.current.metronome) audioRef.current?.scheduleClick(at,cue.accent);
    if(cue.kind==='hit' && optionsRef.current.playDrums && cue.instrument) audioRef.current?.scheduleHit(cue.instrument,at,cue.accent,Math.max(1,Math.round((cue.velocity??86)*(cue.volumeScale??1))),cue.choke,cue.pan);
  };
  const queueTrackAudio = (track:PlaybackTrack,startAt:number,now:number) => {
    while(cueIndexRef.current<track.cues.length && startAt+track.cues[cueIndexRef.current].at<=now+120){
      const cue=track.cues[cueIndexRef.current++];
      if(startAt+cue.at>=now-40)scheduleAudioCue(cue,startAt+cue.at);
    }
  };
  const nextPracticeOffset = () => {
    const settings=builderSettingsRef.current,base=buildPracticeTrackRef.current(0).bars[0]?.bpm??80;
    return settings.practiceTempoStep>0&&(practiceLoopCountRef.current+1)%settings.practiceLoopsPerStep===0?Math.min(Math.max(0,settings.practiceTargetBpm-base),practiceTempoOffsetRef.current+settings.practiceTempoStep):practiceTempoOffsetRef.current;
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
      const clickDuration=beatMs/Math.max(1,optionsRef.current.metronomeSubdivision);
      while(countInStartRef.current+(lastCountRef.current+1)*clickDuration<startAt && countInStartRef.current+(lastCountRef.current+1)*clickDuration<=now+120){
        lastCountRef.current++;const at=countInStartRef.current+lastCountRef.current*clickDuration;
        if(optionsRef.current.metronome && at>=now-40)audioRef.current?.scheduleClick(at,lastCountRef.current===0);
      }
      queueTrackAudio(track,startAt,now);
      return;
    }
    if (playbackModeRef.current !== "playing") setPlaybackMode("playing");
    let elapsed = now - startAt;
    if (track.duration > 0 && elapsed >= track.duration) {
      if (optionsRef.current.loop) {
        let advanced=0;
        while(elapsed>=track.duration && advanced<100){
          startAtRef.current+=track.duration;
          const offset=nextPracticeOffset();practiceLoopCountRef.current++;
          practiceTempoOffsetRef.current=offset;track=buildPracticeTrackRef.current(offset);trackRef.current=track;
          cueIndexRef.current=advanced===0?nextLoopScheduledRef.current:0;nextLoopScheduledRef.current=0;
          elapsed=now-startAtRef.current;advanced++;
          if(track.duration<=0)break;
        }
      } else {
        const last = track.bars.at(-1);
        setPosition(last ? { barIndex: last.index, step: 0, fraction: 1, partId: last.partId, clipId: last.clipId } : null);
        clearClock();
        setPlaybackMode("finished");
        finishTake();
        backingRef.current?.pause();
        setMidiRecording(false);
        return;
      }
    }
    queueTrackAudio(track,startAtRef.current,now);
    if(optionsRef.current.loop && now+120>=startAtRef.current+track.duration){
      const nextTrack=buildPracticeTrackRef.current(nextPracticeOffset()),nextStart=startAtRef.current+track.duration;
      while(nextLoopScheduledRef.current<nextTrack.cues.length && nextStart+nextTrack.cues[nextLoopScheduledRef.current].at<=now+120){
        const cue=nextTrack.cues[nextLoopScheduledRef.current++];if(nextStart+cue.at>=now-40)scheduleAudioCue(cue,nextStart+cue.at);
      }
    }
    const current = track.bars.find((bar) => elapsed >= bar.startsAt && elapsed < bar.startsAt + bar.duration);
    if (current) {
      const progress={bpm:current.bpm,loop:practiceLoopCountRef.current+1};
      setPracticeProgress(previous=>previous.bpm===progress.bpm&&previous.loop===progress.loop?previous:progress);
      const original=fullSongBars[current.index];
      const originalStartsAt=songBarTimes[current.index]??0;
      if(original)backingRef.current?.sync(originalStartsAt+(current.startBeat??0)*60000/original.bpm+(elapsed-current.startsAt)*current.bpm/original.bpm,current.bpm/original.bpm);
      const beat = (current.startBeat??0)+(elapsed - current.startsAt) * current.bpm / 60_000;
      const step = Math.max(0, Math.min(partStepCount({ beats: current.partBeats, subdivision: current.subdivision }) - 1, Math.floor((current.partBeatOffset + beat) * current.subdivision / 4)));
      const next = { barIndex: current.index, step, fraction: Math.max(0, Math.min(1, beat / current.measureBeats)), partId: current.partId, clipId: current.clipId };
      const signature = `${next.barIndex}:${next.step}:${next.partId}:${next.clipId}`;
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
    const range: [number, number] = [seekBar !== null && playScope === "song" ? seekBar+1 : safePracticeStart, seekBar !== null && playScope === "song" ? Math.max(seekBar+1,safePracticeEnd) : safePracticeEnd];
    const buildTrack = (tempoOffset: number) => {
      const source=playbackTrack(songRef.current??song,fractionalLoop?undefined:scope,swing,metronomeSubdivision,fractionalLoop?undefined:range,builderSettings.humanizeAmount,builderSettings.humanizeSeed,tempoOffset,builderSettings.humanizeVelocityAmount);
      return fractionalLoop?trimPlaybackTrack(source,loopBounds[0],loopBounds[1]):source;
    };
    buildPracticeTrackRef.current = buildTrack;
    practiceTempoOffsetRef.current = 0;
    practiceLoopCountRef.current = 0;
    const track = buildTrack(0);
    if (!track.duration || !track.bars.length) { setMessage("Add a pattern before starting playback."); return; }
    stopPlayback();
    const request = requestRef.current;
    trackRef.current = track;
    cueIndexRef.current = 0;
    nextLoopScheduledRef.current=0;
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
    tickPlayback();
    timerRef.current = window.setInterval(tickPlayback, 20);
  };

  const pausePlayback = () => {
    if (playbackModeRef.current !== "playing" && playbackModeRef.current !== "count-in") return;
    pausedAtRef.current = monotonicNow();
    const elapsed=pausedAtRef.current-startAtRef.current,track=trackRef.current;
    if(track){const index=track.cues.findIndex(cue=>cue.at>=Math.max(0,elapsed));cueIndexRef.current=index<0?track.cues.length:index;}
    nextLoopScheduledRef.current=0;lastCountRef.current=Math.floor((pausedAtRef.current-countInStartRef.current)/(60000/(track?.bars[0]?.bpm??80)/Math.max(1,optionsRef.current.metronomeSubdivision)));

    backingRef.current?.pause();
    audioRef.current?.silence?.();
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
    tickPlayback();
    timerRef.current = window.setInterval(tickPlayback, 20);
  };

  useEffect(() => {
    transportActionsRef.current = {
      toggle: () => {
        if (playbackModeRef.current === "playing" || playbackModeRef.current === "count-in") pausePlayback();
        else if (playbackModeRef.current === "paused") resumePlayback();
        else if (playbackModeRef.current === "idle" || playbackModeRef.current === "finished") void startPlayback();
      },
      stop: () => { setMidiRecording(false); stopPlayback(); clearPreview(); }
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (target instanceof HTMLElement && target.closest("input, textarea, select, button, [contenteditable='true'], [role='gridcell'], [role='slider']"))) return;
      if (event.code === "Space") {
        event.preventDefault();
        transportActionsRef.current.toggle();
      } else if (event.key === ".") {
        event.preventDefault();
        transportActionsRef.current.stop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleLiveRecording = async () => {
    if(takeRef.current){finishTake();return;}
    if(song?.bundled)persistSong(copyAsPersonalSong(song),false);
    if(playbackModeRef.current==='idle'||playbackModeRef.current==='finished')await startPlayback();
    const current=songRef.current,track=trackRef.current;if(!current||!track)return;
    takeRef.current={songId:current.id,mode:recordMode,hits:[],targets:[...new Map(track.bars.map(bar=>[`${bar.sectionId}:${bar.partId}`,{sectionId:bar.sectionId,partId:bar.partId}])).values()]};
    setLiveHitCount(0);setMidiRecording(true);setMidiStatus(`Recording a ${recordMode} take. Notes are captured for review before changing the arrangement.`);
  };

  const seekToBar=(index:number)=>{
    if(!song||!fullSongBars.length)return;finishTake();clearPreview();audioRef.current?.silence?.();nextLoopScheduledRef.current=0;const targetIndex=Math.max(0,Math.min(fullSongBars.length-1,index));setSeekBar(targetIndex);
    const previous=trackRef.current;
    const playing=['playing','paused','count-in'].includes(playbackModeRef.current);
    const keepRange=playing&&previous?.bars.some(bar=>bar.index===targetIndex);
    const full=playbackTrack(song,undefined,swing,metronomeSubdivision,undefined,builderSettings.humanizeAmount,builderSettings.humanizeSeed,0,builderSettings.humanizeVelocityAmount);
    const track=keepRange&&previous?previous:full,target=track.bars.find(bar=>bar.index===targetIndex);if(!target)return;
    if(!keepRange){setPlayScope('song');setPracticeRangeStart(1);setPracticeRangeEnd(0);practiceTempoOffsetRef.current=0;buildPracticeTrackRef.current=offset=>playbackTrack(songRef.current??song,undefined,swing,metronomeSubdivision,undefined,builderSettingsRef.current.humanizeAmount,builderSettingsRef.current.humanizeSeed,offset,builderSettingsRef.current.humanizeVelocityAmount);}
    if(playing){
      const now=monotonicNow();trackRef.current=track;startAtRef.current=now-target.startsAt;countInStartRef.current=now;cueIndexRef.current=track.cues.findIndex(cue=>cue.at>=target.startsAt);if(cueIndexRef.current<0)cueIndexRef.current=track.cues.length;
      if(playbackModeRef.current==='paused')pausedAtRef.current=now;else setPlaybackMode('playing');
    }
    setPosition({barIndex:targetIndex,partId:target.partId,clipId:target.clipId,step:Math.round(target.partBeatOffset*target.subdivision/4),fraction:0});
    backingRef.current?.pause();if(playbackModeRef.current==='playing')backingRef.current?.sync(songBarTimes[targetIndex]??0,target.bpm/(fullSongBars[targetIndex]?.bpm??target.bpm));
  };

  const saveKitPreset = () => {
    const name = kitPresetName.trim().slice(0, 40);
    if (!name) return;
    const preset: SongBuilderKitPreset = { id: uid(), name, mix: structuredClone(builderSettings.mix) };
    changeBuilderSettings((current) => ({ ...current, kitPresets: [...current.kitPresets.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), preset].slice(-20) }));
    setKitPresetName("");
    setMessage(`Kit preset “${name}” saved on this device.`);
  };

  const auditionKitPreset = async (presetId: string, side: "a" | "b") => {
    const preset=builderSettings.kitPresets.find(item=>item.id===presetId);
    if(!preset||!part){setMessage("Choose a saved kit preset and pattern before comparing sounds.");return;}
    const token=`kit-${side}:${preset.id}`;
    if(previewSourceId===token){clearPreview();return;}
    stopPlayback();clearPreview();const request=previewRequestRef.current;const audio=await ensureDrumAudio();
    if(!audio||!await audio.ready||request!==previewRequestRef.current)return;
    previewMixRestoreRef.current=builderSettingsRef.current.mix;audio.setMix(preset.mix);setPreviewSourceId(token);
    const bpm=section?.bpm??song?.bpm??part.bpm,quarterMs=60000/bpm,stepMs=quarterMs*4/part.subdivision,loopMs=part.beats*quarterMs;
    for(let repeat=0;repeat<2;repeat++)for(const hit of part.hits){
      const velocity=hit.velocity??(hit.ghost?38:hit.accent?118:86),strikes=expressionStrikes(hit.articulation,stepMs);
      for(const [delay,scale] of strikes)previewTimersRef.current.push(window.setTimeout(()=>audio.hit(hit.articulation==='foot-splash'?'openhat':hit.instrument,hit.accent,Math.round(velocity*scale),hit.articulation==='choke'),repeat*loopMs+hit.step*stepMs+(hit.timingOffsetMs??0)+delay));
    }
    previewTimersRef.current.push(window.setTimeout(()=>{if(request!==previewRequestRef.current)return;audio.setMix(builderSettingsRef.current.mix);previewMixRestoreRef.current=null;setPreviewSourceId("");previewTimersRef.current=[];},loopMs*2+150));
    setMessage(`Auditioning kit ${side.toUpperCase()} · ${preset.name} on ${part.name}.`);
  };

  const savePerformancePreset = async () => {
    if (!song) return;
    const name = performancePresetName.trim().slice(0, 40);
    if (!name) return;
    const backing = await readBuilderBacking(song.id).catch(() => undefined);
    const preset: SongBuilderPerformancePreset = { id: uid(), name, bpm: song.bpm, mix: structuredClone(builderSettings.mix), playDrums, metronome, loop, countInBeats, metronomeSubdivision, rangeStart: practiceRangeStart, rangeEnd: practiceRangeEnd, fractionalLoop, loopStart: loopBounds[0], loopEnd: loopBounds[1], backingVolume: backing?.volume };
    changeBuilderSettings(current => ({ ...current, performancePresets: [...current.performancePresets.filter(item => item.name.toLowerCase() !== name.toLowerCase()), preset].slice(-20) }));
    setPerformancePresetName("");
    setMessage(`Performance preset “${name}” saved for reuse on this device.`);
  };

  const applyPerformancePreset = async (preset: SongBuilderPerformancePreset) => {
    if (!song) return;
    updateSong(current => ({ ...current, bpm: preset.bpm }));
    changeBuilderSettings(current => ({ ...current, mix: structuredClone(preset.mix) }));
    setPlayDrums(preset.playDrums);
    setMetronome(preset.metronome);
    setLoop(preset.loop);
    setCountInBeats(preset.countInBeats);
    setMetronomeSubdivision(preset.metronomeSubdivision);
    setPracticeRangeStart(Math.max(1, Math.min(fullSongBars.length || 1, preset.rangeStart)));
    setPracticeRangeEnd(Math.min(fullSongBars.length, preset.rangeEnd));
    setFractionalLoop(preset.fractionalLoop===true);
    if(preset.fractionalLoop)setLoopBounds([Math.max(0,Math.min(fullSongBars.length,preset.loopStart??0)),Math.max(0,Math.min(fullSongBars.length,preset.loopEnd||fullSongBars.length))]);
    setPlayScope("song");
    if (preset.backingVolume !== undefined) {
      const backing = await readBuilderBacking(song.id).catch(() => undefined);
      if (backing) await saveBuilderBacking({ ...backing, volume: preset.backingVolume }).catch(() => setMessage("Preset loaded, but the backing track volume could not be updated."));
    }
    setMessage(`Performance preset “${preset.name}” applied.`);
  };

  const addArrangementTemplate = () => {
    if (!song) return;
    const nextSections = createArrangementTemplate(song, templateChoice, sources);
    const first = nextSections[0];
    const firstClip = first ? sectionClips(first)[0] : undefined;
    updateSong((current) => ({ ...current, meter: current.sections.length ? current.meter : "4/4", sections: current.sections.some(section=>sectionClips(section).length>0) ? [...current.sections, ...nextSections] : nextSections }));
    if (first && firstClip) {
      setActiveSectionId(first.id);
      setActiveClipId(firstClip.id);
      setActivePartId(firstClip.partId);
      setSelectedCell(null);
      setSelectedCells([]);
      setSelectedClipIds([]);
    }
    setMessage(`${ARRANGEMENT_TEMPLATES.find((item) => item.id === templateChoice)?.label ?? "Arrangement"} starter added with editable groove suggestions and section roles.`);
  };

  const saveCurrentArrangementTemplate = () => {
    const name = templateNameDraft.trim().slice(0, 40);
    if (!song || !name || !song.sections.length) return;
    const template: SavedArrangementTemplate = { id: uid(), name, meter: song.meter, bpm: song.bpm, sections: structuredClone(song.sections), createdAt: new Date().toISOString() };
    const next = [...savedArrangementTemplates.filter(item => item.name.toLowerCase() !== name.toLowerCase()), template].slice(-40);
    if (!writeSavedArrangementTemplates(next)) { setMessage("Could not save this template in browser storage."); return; }
    setSavedArrangementTemplates(next); setSavedTemplateChoice(template.id); setTemplateNameDraft("");
    setMessage(`Saved “${name}” as a reusable arrangement template on this device.`);
  };

  const addSavedArrangementTemplate = () => {
    if (!song) return;
    const template = savedArrangementTemplates.find(item => item.id === savedTemplateChoice);
    if (!template) return;
    const nextSections = instantiateSavedArrangementTemplate(template);
    const hasArrangement = song.sections.some(item => sectionClips(item).length > 0);
    if ((hasArrangement ? song.sections.length : 0) + nextSections.length > 32) { setMessage("This template needs more room than the arrangement has. Remove sections or choose a shorter template."); return; }
    const first = nextSections[0], firstClip = first ? sectionClips(first)[0] : undefined;
    updateSong(current => ({ ...current, bpm: hasArrangement ? current.bpm : template.bpm, meter: hasArrangement ? current.meter : template.meter, sections: hasArrangement ? [...current.sections, ...nextSections] : nextSections }));
    if (first && firstClip) { setActiveSectionId(first.id); setActiveClipId(firstClip.id); setActivePartId(firstClip.partId); }
    setMessage(`Added “${template.name}” as independent sections and patterns.`);
  };

  const deleteSavedArrangementTemplate = () => {
    const next = savedArrangementTemplates.filter(item => item.id !== savedTemplateChoice);
    if (!writeSavedArrangementTemplates(next)) { setMessage("Could not update personal templates in browser storage."); return; }
    setSavedArrangementTemplates(next); setSavedTemplateChoice(""); setMessage("Personal arrangement template removed.");
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
      const preview = previewMidiImport(await file.arrayBuffer(), file.name.replace(/\.midi?$/i, ""));
      setMidiPreview(preview);
      setMidiVoiceMapping(Object.fromEntries(preview.pitches.filter(pitch => pitch.defaultVoice).map(pitch => [pitch.note, pitch.defaultVoice!])) as MidiVoiceMapping);
      setMidiTrackVoiceMapping({});
      setMidiExcludedTracks([]);
      setMidiTitle(preview.title);
      setMidiArtist("MIDI import");
      setMessage(`Previewing ${preview.notes.length} MIDI drum notes from ${preview.tracks.length} track${preview.tracks.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that MIDI file.");
    } finally {
      if (midiFileInputRef.current) midiFileInputRef.current.value = "";
    }
  };

  const finishMidiImport = () => {
    if (!midiPreview) return;
    try {
      const result = createSongFromMidiPreview({ ...midiPreview, title: midiTitle }, { artist: midiArtist, mapping: midiVoiceMapping, trackMapping: midiTrackVoiceMapping, excludedTracks: midiExcludedTracks });
      selectImportedSong(result.song);
      setMidiPreview(null);
      setMessage(`Imported ${result.noteCount} drum notes${result.ignoredNoteCount ? `; skipped ${result.ignoredNoteCount} unmapped or excluded notes` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that MIDI file.");
    }
  };

  const exportProjectFile = async () => {
    if (!song) return;
    try {
      const records = await readCustomSampleRecords();
      const selectedCustom = records.filter((record) => builderSettings.mix.sampleIndex[record.instrument] < 0);
      const sampleBytes = selectedCustom.reduce((sum, record) => sum + record.blob.size + (record.accentBlob?.size ?? 0), 0);
      if (sampleBytes > MAX_PROJECT_SAMPLE_BYTES) throw new Error("The selected custom samples exceed the 24 MB project-file limit. Choose a smaller set of custom samples, then export again.");
      const customSamples = Object.fromEntries(await Promise.all(selectedCustom.map(async (record) => [record.instrument, {
        name: record.name,
        type: record.blob.type || "audio/wav",
        base64: await encodeSample(record.blob),
        ...(record.accentBlob ? { accent: { name: record.accentName ?? "Accent layer", type: record.accentBlob.type || "audio/wav", base64: await encodeSample(record.accentBlob) } } : {})
      }] as const))) as NonNullable<SongBuilderProjectFile["customSamples"]>;
      const settings = structuredClone(builderSettings);
      for (const voice of SONG_INSTRUMENTS) {
        if (settings.mix.sampleIndex[voice] < 0 && !customSamples[voice]) settings.mix.sampleIndex[voice] = 0;
      }
      const project = makeSongProjectFile(song, settings, customSamples);
      project.workspace = await packBuilderWorkspace(song.id,settings,swing);
      const blob = new Blob([JSON.stringify(project)], { type: "application/vnd.drum-hero.song+json" });
      if (blob.size > 128 * 1024 * 1024) throw new Error('This complete backup exceeds 128 MB. Remove unneeded recovery versions or use smaller backing audio before exporting.');
      downloadBlob(blob, `${safeName(song.title)}.drumsong.json`);
      try{localStorage.setItem(`drum-hero:builder-backup:${song.id}`,new Date().toISOString());}catch{/* Backup was downloaded. */}setAssetRevision(n=>n+1);
      setMessage(`Song project exported with backing audio, takes, versions, arrangement, mix, MIDI map${selectedCustom.length ? `, and ${selectedCustom.length} selected custom sample${selectedCustom.length === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export the song project.");
    }
  };

  const importProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 128 * 1024 * 1024) throw new Error("Song project files must be 128 MB or smaller.");
      const input: unknown = JSON.parse(await file.text());
      const project = readSongProjectFile(input);
      if (!project) throw new Error("That is not a supported Drum Hero song project file.");
      const warnings:string[]=[];
      const selectedMissingSamples=SONG_INSTRUMENTS.filter(voice=>project.mix.sampleIndex[voice]<0&&!project.customSamples?.[voice]);
      if(selectedMissingSamples.length)warnings.push(`The project selects custom samples for ${selectedMissingSamples.map(voice=>VOICE_LABEL[voice]).join(', ')}, but does not include them. Those voices may use the built-in samples on this device.`);
      if(!project.workspace)warnings.push('This file contains the arrangement and kit settings, but no optional backing audio, recorded takes, or recovery versions.');
      if(!buildArrangementBars(project.song).length)warnings.push('This project has no playable measures yet.');
      setProjectImportReview({project,fileName:file.name.slice(0,160),warnings});
      setMessage(`Review “${project.song.title}” before importing it.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read that song project.");
    } finally {
      if (projectFileInputRef.current) projectFileInputRef.current.value = "";
    }
  };

  const applyProjectImport = async () => {
    const project=projectImportReview?.project;
    if(!project)return;
    try {
      const existingRecords = await readCustomSampleRecords().catch(() => []);
      const availableCustomSamples = new Set(existingRecords.map((record) => record.instrument));
      const nextSampleNames = Object.fromEntries(existingRecords.map((record) => [record.instrument, record.name])) as Partial<Record<SongInstrument, string>>;
      const nextAccentSampleNames = Object.fromEntries(existingRecords.flatMap((record) => record.accentName ? [[record.instrument, record.accentName] as const] : [])) as Partial<Record<SongInstrument, string>>;
      const unavailableSamples: SongInstrument[] = [];
      for (const [voice, sample] of Object.entries(project.customSamples ?? {}) as Array<[SongInstrument, NonNullable<typeof project.customSamples>[SongInstrument]]>) {
        if (!sample) continue;
        const previousRecord = existingRecords.find((record) => record.instrument === voice);
        const blob = decodeSample(sample.base64, sample.type);
        let record = await saveCustomSampleBlob(voice, sample.name, blob);
        const accentBlob = sample.accent ? decodeSample(sample.accent.base64, sample.accent.type) : undefined;
        if (accentBlob && sample.accent) record = await saveCustomAccentSampleBlob(voice, sample.accent.name, accentBlob);
        else if (record.accentBlob) { await deleteCustomSample(voice, "accent"); record = { ...record, accentName: undefined, accentBlob: undefined }; }
        availableCustomSamples.add(voice);
        nextSampleNames[voice] = record.name;
        if (record.accentName) nextAccentSampleNames[voice] = record.accentName;
        const primaryLoaded = audioRef.current ? await audioRef.current.setCustomSample(voice, record.blob) : true;
        const accentLoaded = audioRef.current && record.accentBlob ? await audioRef.current.setCustomSample(voice, record.accentBlob, "accent") : true;
        if (!primaryLoaded || !accentLoaded) {
          if (previousRecord) {
            await saveCustomSampleBlob(voice, previousRecord.name, previousRecord.blob);
            if (previousRecord.accentBlob && previousRecord.accentName) await saveCustomAccentSampleBlob(voice, previousRecord.accentName, previousRecord.accentBlob);
            else await deleteCustomSample(voice, "accent");
            await audioRef.current?.setCustomSample(voice, previousRecord.blob);
            await audioRef.current?.setCustomSample(voice, previousRecord.accentBlob ?? null, "accent");
          } else {
            await deleteCustomSample(voice);
            await audioRef.current?.setCustomSample(voice, null);
          }
          availableCustomSamples.delete(voice);
          delete nextSampleNames[voice];
          delete nextAccentSampleNames[voice];
          unavailableSamples.push(voice);
        }
      }
      const importedMix = structuredClone(project.mix);
      for (const voice of SONG_INSTRUMENTS) {
        if (importedMix.sampleIndex[voice] < 0 && !availableCustomSamples.has(voice)) importedMix.sampleIndex[voice] = 0;
      }
      stopPlayback();
      clearPreview();
      if (project.workspace) await unpackBuilderWorkspace(project.song.id,project.workspace);
      const recoveredSettings = project.workspace?.settings;
      try { localStorage.setItem(`drum-hero:builder-settings:${project.song.id}`,JSON.stringify({ ...(recoveredSettings ?? builderSettings), swing: project.workspace?.swing ?? builderSettings.swing, mix: importedMix, midiNotes: project.midiNotes, notation: project.notation ?? builderSettings.notation })); } catch { /* The song still imports. */ }

      selectImportedSong(project.song);
      changeBuilderSettings((current) => ({ ...(recoveredSettings??current), swing: project.workspace?.swing??current.swing, mix: importedMix, midiNotes: project.midiNotes, notation: project.notation??current.notation }));
      setCustomSampleNames(nextSampleNames);
      setCustomAccentSampleNames(nextAccentSampleNames);
      setMessage(`Imported “${project.song.title}”${project.workspace?" with backing audio, takes, versions, and workspace settings":""} with its saved mix and MIDI map${Object.keys(project.customSamples ?? {}).length ? ` and ${Object.keys(project.customSamples ?? {}).length} custom sample${Object.keys(project.customSamples ?? {}).length === 1 ? "" : "s"}` : ""}${unavailableSamples.length ? `; ${unavailableSamples.length} sample${unavailableSamples.length === 1 ? " was" : "s were"} unavailable and reverted to the built-in kit` : ""}.`);
      setProjectImportReview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that song project.");
    }
  };

  const importCustomSample = async (file?: File, layer: "primary" | "accent" = "primary") => {
    if (!file) return;
    try {
      const previousRecord = (await readCustomSampleRecords().catch(() => [])).find((record) => record.instrument === kitSampleVoice);
      const record = layer === "accent" ? await saveCustomAccentSample(kitSampleVoice, file) : await saveCustomSample(kitSampleVoice, file);
      const importedBlob = layer === "accent" ? record.accentBlob : record.blob;
      if (audioRef.current && importedBlob && !await audioRef.current.setCustomSample(kitSampleVoice, importedBlob, layer)) {
        if (previousRecord) {
          await saveCustomSampleBlob(kitSampleVoice, previousRecord.name, previousRecord.blob);
          if (previousRecord.accentBlob && previousRecord.accentName) await saveCustomAccentSampleBlob(kitSampleVoice, previousRecord.accentName, previousRecord.accentBlob);
          else await deleteCustomSample(kitSampleVoice, "accent");
          await audioRef.current.setCustomSample(kitSampleVoice, previousRecord.blob);
          await audioRef.current.setCustomSample(kitSampleVoice, previousRecord.accentBlob ?? null, "accent");
        } else await deleteCustomSample(kitSampleVoice);
        throw new Error("The browser could not decode that audio file.");
      }
      if (layer === "accent") setCustomAccentSampleNames((current) => ({ ...current, [kitSampleVoice]: record.accentName ?? file.name }));
      else setCustomSampleNames((current) => ({ ...current, [kitSampleVoice]: record.name }));
      changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, sampleIndex: { ...current.mix.sampleIndex, [kitSampleVoice]: -1 } } }));
      setMessage(layer === "accent" ? `${VOICE_LABEL[kitSampleVoice]} accent layer “${record.accentName ?? file.name}” will play at velocity 96 and above.` : `${VOICE_LABEL[kitSampleVoice]} sample “${record.name}” saved on this device.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that custom sample.");
    }
  };

  const removeCustomSample = async () => {
    try {
      await deleteCustomSample(kitSampleVoice);
      await audioRef.current?.setCustomSample(kitSampleVoice, null);
      setCustomSampleNames((current) => { const next = { ...current }; delete next[kitSampleVoice]; return next; });
      setCustomAccentSampleNames((current) => { const next = { ...current }; delete next[kitSampleVoice]; return next; });
      changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, sampleIndex: { ...current.mix.sampleIndex, [kitSampleVoice]: 0 } } }));
      setMessage(`${VOICE_LABEL[kitSampleVoice]} custom sample removed.`);
    } catch { setMessage("Could not remove that custom sample from this browser."); }
  };

  if (!ready) return <p>Loading Song Builder…</p>;

  return <div className={`song-builder ${compact?'song-builder-compact':''} ${beginner?'song-builder-beginner':''}`} data-workspace={workspace}>
    <nav className="song-builder-workspace-nav" aria-label="Song Builder workspace">
      <div className="song-builder-mode-tabs" role="group" aria-label="Workspace mode">{(['compose','arrange','rehearse','export'] as const).map(view=><button type="button" key={view} aria-pressed={workspace===view} onClick={()=>setWorkspace(view)}>{view[0].toUpperCase()+view.slice(1)}</button>)}</div>
      <details className="song-builder-view-tools"><summary>Workspace tools</summary><div className="song-builder-view-tools-panel">
        <button type="button" aria-pressed={compact} onClick={()=>{setCompact(!compact);setGridCellSize(compact?34:44);}}>Tablet layout</button>
        <button type="button" aria-expanded={showShortcuts} onClick={()=>setShowShortcuts(!showShortcuts)}>Shortcuts</button>
        <button type="button" aria-pressed={beginner} onClick={()=>{const next=!beginner;setBeginner(next);setGridFocus({voice:0,step:0});try{localStorage.setItem('drum-hero:builder-beginner',String(next));}catch{/* Optional preference. */}}}>{beginner?'Show advanced tools':'Beginner mode'}</button>
        <button type="button" onClick={()=>{setTourStep(0);setWorkspace("compose");}}>First song guide</button>
        <button type="button" aria-expanded={showHistory} onClick={()=>setShowHistory(!showHistory)}>Undo history</button>
      </div></details>
    </nav>
    <SongBuilderTaskGuide onNavigate={(targetWorkspace, selector) => { setWorkspace(targetWorkspace); window.setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }} />
    {tourStep !== null && <aside className="card song-builder-guide" aria-label="First song walkthrough"><strong>Step {tourStep+1} of 5 · {['Create your song','Build a groove','Arrange the sections','Rehearse the song','Keep and share your work'][tourStep]}</strong><p>{['Enter a title and artist in the new song form, or choose a personal song above.','Choose a starter template or add a blank pattern. Tap cells for a hit, again for an accent, and once more for a rest.','Add sections and insert grooves or fills. Repeat clips, drag them into order, and label rehearsal markers.','Choose a range, enable Loop, and set the tempo step and target in practice settings. Press Play to follow the cursor.','Choose Full song or a section, then download PDF, PNG, or WAV. Export song project includes your audio, takes, and recovery versions.'][tourStep]}</p><div className="song-builder-actions"><button type="button" disabled={tourStep===0} onClick={()=>{const step=Math.max(0,tourStep-1);setTourStep(step);setWorkspace((['compose','compose','arrange','rehearse','export'] as const)[step]);}}>Back</button><button type="button" onClick={()=>{if(tourStep===4){setTourStep(null);return;}const step=tourStep+1;setTourStep(step);setWorkspace((['compose','compose','arrange','rehearse','export'] as const)[step]);}}>{tourStep===4?'Finish':'Next'}</button><button type="button" onClick={()=>setTourStep(null)}>Close guide</button></div></aside>}
    {showHistory && song && <aside className="card" aria-label="Undo history"><h2>Undo history</h2><p>{history.songId===song.id?history.past.length:0} previous edits. Restoring an edit adds the current arrangement to history.</p><ol>{history.songId===song.id&&history.past.map((snapshot,index)=><li key={index}><button type="button" disabled={!['idle','finished'].includes(playbackMode)} onClick={()=>updateSong(current=>({...structuredClone(snapshot),id:current.id}))}>Edit {index+1} · {snapshot.title} · {snapshot.sections.length} sections · {snapshot.sections.reduce((n,section)=>n+section.parts.reduce((m,part)=>m+part.hits.length,0),0)} notes · {snapshot.bpm} BPM</button></li>)}</ol></aside>}
    {showShortcuts&&<aside className="card song-builder-shortcuts"><strong>Keyboard and touch</strong><p>Space starts, pauses, or resumes playback; period stops. Arrows move between grid cells. Shift+arrows selects a rectangle. Enter or Space cycles a cell when a grid cell is focused. Ctrl/Cmd+A selects hits; C copies; V pastes; Z undoes; Shift+Z redoes. Delete clears selected hits. Escape clears the selection. On touch devices, use Draw/Erase to paint or Select to build a selection.</p></aside>}
    <p className="song-builder-global-status" role="status">{message||savedMessage}</p>
      <div className="song-builder-song-picker">
        <label>Song<select value={selectedSongId} onChange={(event) => { stopPlayback(); clearPreview(); saveHistory({ songId: "", past: [], future: [] }); setSelectedClipIds([]); setSelectedCell(null); setSelectedCells([]); setSelectedSongId(event.target.value); setActiveSectionId(""); setActiveClipId(""); setActivePartId(""); setPreviewScope("song"); setPlayScope("song"); }}>
          <option value="">Choose a song…</option>
          {songs.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.artist}{item.bundled ? " · example" : ""}</option>)}
        </select></label>
        <Link className="button-secondary" href="/song-library">Song Library</Link>
      </div>
    <section className="song-builder-toolbar card" aria-label="Song and playback controls">

      {song && <div className="song-builder-transport">
        <label>Play<select aria-label="Playback range" value={playScope} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setPlayScope(event.target.value)}>
          <option value="song">Full song</option>
          {song.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {playbackMode === "idle" || playbackMode === "finished" ? <button className="button" type="button" onClick={() => void startPlayback()}>{playbackMode === "finished" ? "Play again" : "Play"}</button> : <button className="button" type="button" onClick={pausePlayback} disabled={playbackMode === "loading" || playbackMode === "paused"}>Pause</button>}
        {playbackMode === "paused" && <button className="button-secondary" type="button" onClick={resumePlayback}>Resume</button>}
        <button className="button-secondary" type="button" onClick={() => { setMidiRecording(false); stopPlayback(); clearPreview(); }} disabled={playbackMode === "idle" && !previewSourceId}>Stop</button>
        <button className="button-secondary" type="button" onClick={undo} disabled={!history.past.length || history.songId !== song.id || !["idle", "finished"].includes(playbackMode)} title="Undo (Ctrl/Cmd+Z)">Undo</button>
        <button className="button-secondary" type="button" onClick={redo} disabled={!history.future.length || history.songId !== song.id || !["idle", "finished"].includes(playbackMode)} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>
        <label className="song-builder-check"><input type="checkbox" checked={playDrums} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setPlayDrums(event.target.checked)} /> Play drums</label>
        <label className="song-builder-check"><input type="checkbox" checked={metronome} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setMetronome(event.target.checked)} /> Metronome</label>
        <label className="song-builder-check"><input type="checkbox" checked={loop} disabled={!["idle","finished"].includes(playbackMode)} onChange={(event) => setLoop(event.target.checked)} /> Loop range</label>
        <label>Seek measure<input aria-label="Seek measure" type="range" min={0} max={Math.max(0,fullSongBars.length-1)} value={Math.min(fullSongBars.length-1,position?.barIndex??seekBar??0)} disabled={!fullSongBars.length} onChange={event=>seekToBar(Number(event.target.value))}/></label>
        <button type="button" disabled={!fullSongBars.length} onClick={()=>{const current=position?.barIndex??seekBar??0;const sectionId=fullSongBars[current]?.sectionId;let previous=current-1;while(previous>0&&fullSongBars[previous]?.sectionId===sectionId)previous--;const previousId=fullSongBars[Math.max(0,previous)]?.sectionId;while(previous>0&&fullSongBars[previous-1]?.sectionId===previousId)previous--;seekToBar(Math.max(0,previous));}}>Previous section</button>
        <button type="button" disabled={!fullSongBars.length} onClick={()=>{const current=position?.barIndex??seekBar??0;const next=fullSongBars.findIndex((bar,index)=>index>current&&bar.sectionId!==fullSongBars[current]?.sectionId);if(next>=0)seekToBar(next);}}>Next section</button>
        <span className={`song-builder-play-state state-${playbackMode}`} role="status">{playbackMode === "count-in" ? `Count-in · ${countIn}` : playbackMode === "idle" || playbackMode === "finished" ? playingStatus : playbackMode === "playing" ? `Playing · ${practiceProgress.bpm} BPM · loop ${practiceProgress.loop}` : playbackMode}</span>{activePlaybackCue&&<span className="song-builder-current-cue" role="status" aria-live="polite">Rehearsal cue: {activePlaybackCue}</span>}
        <span className="visually-hidden" aria-live="polite" aria-atomic="true">{(playbackMode === "playing" || playbackMode === "count-in") && position ? (() => { const bar = fullSongBars[position.barIndex]; const source = song?.sections.find(item => item.id === bar?.sectionId)?.parts.find(item => item.id === position.partId); return bar ? `${bar.sectionName}, measure ${bar.number} of ${fullSongBars.filter(item => item.sectionId === bar.sectionId).length}, step ${position.step + 1}${source ? ` of ${partStepCount(source)}` : ""}.` : ""; })() : ""}</span>
      </div>}

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
          <label>Save this arrangement as a template<input maxLength={40} value={templateNameDraft} onChange={event=>setTemplateNameDraft(event.target.value)} placeholder="e.g. My 6/8 ballad form" /></label><button type="button" disabled={!templateNameDraft.trim()||!song.sections.length} onClick={saveCurrentArrangementTemplate}>Save personal template</button>
          {savedArrangementTemplates.length>0&&<><label>Personal template<select value={savedTemplateChoice} onChange={event=>setSavedTemplateChoice(event.target.value)}><option value="">Choose a saved template…</option>{savedArrangementTemplates.map(template=><option key={template.id} value={template.id}>{template.name} · {template.meter} · {template.sections.length} sections</option>)}</select></label><button type="button" disabled={!savedTemplateChoice} onClick={addSavedArrangementTemplate}>Add personal template</button><button type="button" disabled={!savedTemplateChoice} onClick={deleteSavedArrangementTemplate}>Delete personal template</button></>}
        </section>}
        <section className="song-builder-file-tools" aria-label="Import and share song files">
          <strong>Bring in or share a song</strong>
          <button type="button" onClick={() => midiFileInputRef.current?.click()}>Import MIDI</button>
          <input ref={midiFileInputRef} className="visually-hidden" type="file" accept=".mid,.midi,audio/midi,audio/x-midi" aria-label="Choose a MIDI file" onChange={(event) => void importMidiFile(event.target.files?.[0])} />
          <button type="button" onClick={exportProjectFile} disabled={!song}>Export song project</button>
          <button type="button" onClick={() => projectFileInputRef.current?.click()}>Import song project</button>
          <input ref={projectFileInputRef} className="visually-hidden" type="file" accept=".json,application/json,application/vnd.drum-hero.song+json" aria-label="Choose a Drum Hero song project file" onChange={(event) => void importProjectFile(event.target.files?.[0])} />
        </section>
        {projectImportReview&&<section className="card song-builder-project-review" aria-labelledby="song-builder-project-review-title"><div className="song-builder-section-heading"><div><span className="eyebrow">Project import review</span><h3 id="song-builder-project-review-title">{projectImportReview.project.song.title}</h3></div><button type="button" className="button-secondary" onClick={()=>setProjectImportReview(null)}>Cancel</button></div><p>{projectImportReview.fileName} · {projectImportReview.project.song.artist} · {projectImportReview.project.song.bpm} BPM · {projectImportReview.project.song.meter}</p><p>{projectImportReview.project.song.sections.length} sections · {buildArrangementBars(projectImportReview.project.song).length} measures · {projectImportReview.project.song.sections.reduce((sum,item)=>sum+item.parts.reduce((count,part)=>count+part.hits.length,0),0)} pattern notes · {Object.keys(projectImportReview.project.customSamples??{}).length} embedded samples · {projectImportReview.project.workspace?'workspace assets included':'no optional workspace assets'}</p>{projectImportReview.warnings.length>0&&<div className="song-builder-project-warnings"><strong>Import checks</strong><ul>{projectImportReview.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>}<p>Importing creates a new personal song. Existing songs remain in your library.</p><button type="button" onClick={()=>void applyProjectImport()}>Import this project</button></section>}
        {midiPreview && <section className="song-builder-midi-preview card" aria-labelledby="song-builder-midi-preview-title">
          <div className="song-builder-midi-preview-heading">
            <div><span className="eyebrow">MIDI import preview</span><h3 id="song-builder-midi-preview-title">{midiTitle.trim() || "Imported MIDI"}</h3></div>
            <button className="button-secondary" type="button" onClick={() => { setMidiPreview(null); setMessage("MIDI import canceled."); }}>Cancel</button>
          </div>
          <p>{midiPreview.notes.length} note events · {midiPreview.tracks.length} drum tracks · {midiPreview.ppq} ticks per quarter note</p>
          <div className="song-builder-midi-preview-fields">
            <label>Song title<input maxLength={120} value={midiTitle} onChange={event => setMidiTitle(event.target.value)} /></label>
            <label>Song artist<input maxLength={120} value={midiArtist} onChange={event => setMidiArtist(event.target.value)} /></label>
          </div>
          <fieldset>
            <legend>Tracks to include</legend>
            <div className="song-builder-midi-track-list">{midiPreview.tracks.map(track => <label key={track.id}><input type="checkbox" checked={!midiExcludedTracks.includes(track.id)} onChange={event => setMidiExcludedTracks(current => event.target.checked ? current.filter(id => id !== track.id) : [...current, track.id])} /><span><strong>{track.name}</strong><small>Track {track.id + 1} · {track.noteCount} notes</small></span></label>)}</div>
          </fieldset>
          <fieldset>
            <legend>Default mapping by MIDI pitch</legend>
            <div className="song-builder-midi-pitch-map">{midiPreview.pitches.map(pitch => <label key={pitch.note}><span>MIDI {pitch.note} · {pitch.count} notes</span><select aria-label={`Map MIDI pitch ${pitch.note} to a drum voice`} value={midiVoiceMapping[pitch.note] ?? "ignore"} onChange={event => setMidiVoiceMapping(current => ({ ...current, [pitch.note]: event.target.value as SongInstrument | "ignore" }))}><option value="ignore">Ignore pitch</option>{SONG_INSTRUMENTS.map(voice => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>)}</div>
          </fieldset>
          <details className="song-builder-midi-track-maps"><summary>Override mappings for individual tracks</summary><p>Track mappings take priority over the default pitch mapping above.</p>{midiPreview.tracks.map(track=><fieldset key={track.id}><legend>{track.name} · {track.noteCount} notes</legend><div className="song-builder-midi-pitch-map">{track.pitches.map(pitch=>{const key=`${track.id}:${pitch.note}`;return <label key={pitch.note}><span>MIDI {pitch.note} · {pitch.count} notes</span><select aria-label={`Map MIDI pitch ${pitch.note} on ${track.name}`} value={midiTrackVoiceMapping[key]??midiVoiceMapping[pitch.note]??midiPreview.pitches.find(item=>item.note===pitch.note)?.defaultVoice??"ignore"} onChange={event=>setMidiTrackVoiceMapping(current=>({...current,[key]:event.target.value as SongInstrument|"ignore"}))}><option value="ignore">Ignore pitch</option>{SONG_INSTRUMENTS.map(voice=><option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>;})}</div></fieldset>)}</details>
          <div className="song-builder-midi-event-summary">
            <div><strong>Tempo events</strong><span>{midiPreview.tempos.length ? midiPreview.tempos.map(event => `${event.bpm} BPM · tick ${event.tick}`).join("; ") : "No tempo map · uses 80 BPM"}</span></div>
            <div><strong>Meter events</strong><span>{midiPreview.meters.length ? midiPreview.meters.map(event => `${event.meter} · tick ${event.tick}`).join("; ") : "No meter map · uses 4/4"}</span></div>
          </div>
          <details className="song-builder-midi-event-preview"><summary>Preview first {Math.min(16, midiPreview.notes.length)} note events</summary><ol>{midiPreview.notes.slice(0, 16).map((note, index) => {
            const mapped = midiTrackVoiceMapping[`${note.track}:${note.note}`] ?? midiVoiceMapping[note.note] ?? midiPreview.pitches.find(pitch => pitch.note === note.note)?.defaultVoice;
            const voice = mapped === "ignore" ? "ignored" : mapped ? VOICE_LABEL[mapped] : "unmapped";
            return <li key={`${note.track}:${note.tick}:${note.note}:${index}`}>Tick {note.tick} · {midiPreview.tracks.find(track=>track.id===note.track)?.name??`Track ${note.track+1}`} · MIDI {note.note} → {voice} · velocity {note.velocity}</li>;
          })}</ol></details>
          <small>Tempo and meter changes are placed at the next measure boundary. Unmapped pitches and excluded tracks are skipped. Imported patterns are independent copies, so editing them will not alter the source file.</small>
          <button className="button" type="button" onClick={finishMidiImport}>Import mapped arrangement</button>
        </section>}
        {songs.length > 0 && <p className="song-builder-library-note">{songs.filter((item) => !item.bundled).length} personal songs · all edits are shared with your local Song Library.</p>}
        {!songs.length && <p className="song-builder-library-note">Songs are saved in this browser and are available from Song Library.</p>}
        <Link href="/song-library">Browse library and backups</Link>
      </aside>

      {song ? <div className="song-builder-main" role="region" aria-label="Song editor">
        <SongBuilderTimeline song={song} bars={fullSongBars} loopBounds={fractionalLoop?loopBounds:[0,fullSongBars.length]} loopDisabled={!['idle','finished'].includes(playbackMode)} onLoopChange={bounds=>{setLoopBounds(bounds);setFractionalLoop(true);setLoop(true);setPlayScope('song');}} activeBar={position?.barIndex??seekBar??0} onSeek={seekToBar} onSelect={(id,clipId)=>{setActiveSectionId(id);setActiveClipId(clipId??'');const selected=song.sections.find(s=>s.id===id);setActivePartId(clipId?sectionClips(selected!).find(c=>c.id===clipId)?.partId??'':'');setSelectedCells([]);}} onMove={(sourceId,clipId,targetId)=>{updateSong(current=>moveClipToSection(current,sourceId,clipId,targetId));setMessage('Clip moved to the selected section as an independent pattern.');}} follow={followPlayhead} onFollow={setFollowPlayhead}/><SongBuilderArrangementAutomation points={song.arrangementAutomation} bars={fullSongBars} voices={BUILDER_VOICES} labels={VOICE_LABEL} onChange={points=>updateSong(current=>({...current,arrangementAutomation:points.length?points:undefined}))}/><SongBuilderPatternCompare song={song} mix={builderSettings.mix} swing={swing}/><SongBuilderArrangementFeedback song={song} bars={fullSongBars}/><SongBuilderArrangementSuggestions song={song} previewing={previewSourceId==='arrangement-form-preview'} onPreview={sections=>void previewArrangementForm(sections)} onApply={next=>{persistSong(next);setMessage('Arrangement form added as independent, editable sections.');}}/>
        <SongBuilderCueList bars={fullSongBars} onSeek={seekToBar}/><details className="card song-builder-cloud-tools"><summary>Cloud sync and live collaboration</summary><SongCloudPanel state={library} apply={applyCloudLibrary}/><SongBuilderCollaboration song={song} sectionId={section?.id??""} partId={part?.id??""} cursor={selectedCell} onRemoteSong={incoming=>{const current=songRef.current;if(!current||current.id!==incoming.id)return;persistSong(incoming,false,true,true);setSavedMessage("Live collaborator edits received. Review and save them through cloud sync when ready.");}}/></details>
        {song.bundled?<section className="card song-builder-backing"><h2>Backing track</h2><p>Create a personal copy to attach local audio to this example.</p><button type="button" onClick={()=>persistSong(copyAsPersonalSong(song),false)}>Create personal copy</button></section>:<SongBuilderBackingTrack ref={backingRef} key={`backing-${song.id}-${assetRevision}`} songId={song.id} targetPart={part??null} bars={fullSongBars} anchors={song.referenceTempoMap??[]} songBpm={song.bpm} onAnchorsChange={anchors=>{const normalized=normalizeTempoAnchors(anchors);if(normalized.length!==anchors.length){setMessage("Tempo anchors must increase in time and stay between 40 and 200 BPM.");return;}updateSong(current=>({...current,referenceTempoMap:normalized}));}} onApplyTempo={bpm=>{updateSong(current=>({...current,bpm}));setMessage(`Song default tempo set to ${bpm} BPM. Explicit section tempos remain unchanged.`);}} onApplyHits={applyBackingHits}/>}
      {song && <><SongBuilderClipboard song={song} section={section} onChange={next=>updateSong(current=>({...current,sections:next.sections,referenceTempoMap:next.referenceTempoMap}))} onMessage={setMessage}/><SongBuilderTempoMap song={song} bars={fullSongBars} onChange={next=>updateSong(current=>({...current,sections:next.sections,referenceTempoMap:next.referenceTempoMap}))}/><SongBuilderStorage key={`storage-${song.id}-${assetRevision}`} songId={song.id} onBackup={()=>void exportProjectFile()} onCleanup={()=>{setAssetRevision(n=>n+1);void readBuilderTakes(song.id).then(setTakes).catch(()=>setMessage('Could not refresh takes.'));}}/></>}
      {song && <details className="song-builder-more-tools card" open={workspace==="rehearse"}>
        <summary>Recording, practice, mixer, and export settings</summary>
        <div className="song-builder-tools-grid">
          <section><h3>Playback settings</h3><details className="song-builder-performance-presets"><summary>Performance presets · {builderSettings.performancePresets.length} saved</summary><p>Save and restore the rehearsal mix, tempo, count-in, click, loop range, and backing level on this device.</p><div className="song-builder-tool-fields"><label>Preset name<input maxLength={40} value={performancePresetName} onChange={event=>setPerformancePresetName(event.target.value)} placeholder="Quiet backing run"/></label><button type="button" disabled={!performancePresetName.trim()} onClick={()=>void savePerformancePreset()}>Save current setup</button><label>Load preset<select value="" onChange={event=>{const preset=builderSettings.performancePresets.find(item=>item.id===event.target.value);if(preset)void applyPerformancePreset(preset);}}><option value="">Choose a performance preset…</option>{builderSettings.performancePresets.map(preset=><option key={preset.id} value={preset.id}>{preset.name} · {preset.bpm} BPM</option>)}</select></label></div></details><label><input type="checkbox" checked={fractionalLoop} disabled={!['idle','finished'].includes(playbackMode)} onChange={e=>{setFractionalLoop(e.target.checked);setLoopBounds([0,Math.max(1,fullSongBars.length)]);setLoop(e.target.checked);setPlayScope('song');}}/>Use timeline loop boundaries (fractions of measures)</label>{fractionalLoop&&<div className="song-builder-tool-fields"><label>Loop start boundary<input type="number" min={0} max={loopBounds[1]-.0625} step={.0625} value={loopBounds[0]} disabled={!['idle','finished'].includes(playbackMode)} onChange={e=>setLoopBounds(current=>[Math.max(0,Math.min(current[1]-.0625,Number(e.target.value))),current[1]])}/></label><label>Loop end boundary<input type="number" min={loopBounds[0]+.0625} max={fullSongBars.length} step={.0625} value={loopBounds[1]} disabled={!['idle','finished'].includes(playbackMode)} onChange={e=>setLoopBounds(current=>[current[0],Math.min(fullSongBars.length,Math.max(current[0]+.0625,Number(e.target.value)))])}/></label><small>0 is the first measure start; 1.5 is halfway through measure 2. End is exclusive.</small></div>}<div className="song-builder-tool-fields"><div className="song-builder-mobile-playback"><label><input type="checkbox" checked={playDrums} onChange={event=>setPlayDrums(event.target.checked)}/>Play drum audio</label><label><input type="checkbox" checked={metronome} onChange={event=>setMetronome(event.target.checked)}/>Click track</label><label><input type="checkbox" checked={loop} disabled={!["idle","finished"].includes(playbackMode)} onChange={event=>setLoop(event.target.checked)}/>Repeat playback range</label></div>        <label className="song-builder-transport-setting">Count-in beats<select value={countInBeats} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setCountInBeats(Number(event.target.value))}>{Array.from({ length: 9 }, (_, beats) => <option key={beats} value={beats}>{beats}</option>)}</select></label>
        <label className="song-builder-transport-setting">Click subdivision<select value={metronomeSubdivision} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setMetronomeSubdivision(Number(event.target.value))}><option value={1}>Quarter</option><option value={2}>Eighth</option><option value={3}>Triplet</option><option value={4}>Sixteenth</option></select></label>
        <label className="song-builder-transport-setting song-builder-swing">Swing · {swing}%<input type="range" min={50} max={75} step={1} value={swing} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => setSwing(Number(event.target.value))} /></label>
</div></section>
          <section className="song-builder-recording"><h3>Live recording and takes</h3><div className="song-builder-tool-actions"><button type="button" disabled={midiCalibrating} onClick={()=>void connectMidi()}>Connect MIDI kit</button><label>MIDI input<select disabled={midiRecording||midiCalibrating} value={builderSettings.midiInputId} onChange={event=>changeBuilderSettings(current=>({...current,midiInputId:event.target.value}))}><option value="">Choose input…</option>{midiInputs.map(input=><option key={input.id} value={input.id}>{input.name}</option>)}</select></label><label>Recording mode<select disabled={midiRecording} value={recordMode} onChange={e=>setRecordMode(e.target.value as typeof recordMode)}><option value="overdub">Overdub existing notes</option><option value="replace">Replace patterns in playback range</option></select></label><label>Input latency · ms<input type="number" min={-250} max={500} step={5} disabled={midiRecording||midiCalibrating} value={recordLatency} onChange={e=>{const latency=Math.max(-250,Math.min(500,Number(e.target.value)||0));setRecordLatency(latency);changeBuilderSettings(current=>({...current,midiLatencyMs:latency}));}}/></label><button type="button" disabled={midiRecording||midiCalibrating||!builderSettings.midiInputId} onClick={()=>void calibrateMidi()}>{midiCalibrating?"Calibrating MIDI…":"Calibrate MIDI timing"}</button><button className={midiRecording?'recording':''} type="button" disabled={midiCalibrating} onClick={()=>void toggleLiveRecording()}>{midiRecording?`Stop take · ${liveHitCount} hits`:'Record a take'}</button></div><p role="status">{midiStatus}</p><small>A kick · S snare · D hi-hat · F tom · G crash · H open hat · J ride · K rimshot · L cowbell · Y shaker · U tambourine. Capturing a take does not change notes until Apply.</small><div className="song-builder-takes">
            <label>Recorded take<select value={selectedTakeId} onChange={event=>setSelectedTakeId(event.target.value)}><option value="">Choose take A…</option>{takes.map(take=><option key={take.id} value={take.id}>{take.name} · {take.hits.length} hits · {take.mode}</option>)}</select></label>
            <label>Compare with take B<select value={comparedTakeId} onChange={event=>{setComparedTakeId(event.target.value);setTakeCompChoices({});}}><option value="">Choose a second pass…</option>{takes.filter(take=>take.id!==selectedTakeId).map(take=><option key={take.id} value={take.id}>{take.name} · {take.hits.length} hits</option>)}</select></label>
            <label>Quantization strength · {quantizeStrength}%<input type="range" min={0} max={100} step={5} value={quantizeStrength} onChange={event=>setQuantizeStrength(Number(event.target.value))}/></label>
            <label>Take velocity scale · {takeVelocityScale}%<input type="range" min={50} max={150} step={5} value={takeVelocityScale} onChange={event=>setTakeVelocityScale(Number(event.target.value))}/></label>
            {selectedTake&&<><p>{selectedTake.mode==='replace'?'Apply replaces all notes in the recorded playback patterns.':'Apply merges captured notes with existing patterns.'} 0% preserves captured timing; 100% snaps to the grid. Velocity scaling preserves each hit’s recorded dynamics.</p><div className="song-builder-take-preview">{selectedTake.hits.slice(0,12).map((hit,index)=>{const source=song.sections.find(section=>section.id===hit.sectionId)?.parts.find(part=>part.id===hit.partId);const quantized=quantizeRecordedHit(hit,quantizeStrength,source?.subdivision??hit.subdivision??8,source?partStepCount(source):Infinity);return <span key={index}>{VOICE_LABEL[hit.instrument]} · captured step {hit.step.toFixed(2)} → grid {quantized.gridStep+1}, offset {quantized.timingOffsetMs} ms</span>;})}</div>
              <div className="song-builder-actions"><button type="button" aria-pressed={previewSourceId===selectedTake.id} onClick={()=>void auditionTake(selectedTake)}>{previewSourceId===selectedTake.id?"Stop take A":"Preview take A"}</button>{comparedTake&&<button type="button" aria-pressed={previewSourceId===comparedTake.id} onClick={()=>void auditionTake(comparedTake)}>{previewSourceId===comparedTake.id?"Stop take B":"Preview take B"}</button>}</div>
              {comparedTake&&<section className="song-builder-take-comp" aria-label="Measure by measure take comp"><h4>Choose a take for each measure</h4><p>Compose a new nondestructive overdub take. Applying it adds the chosen pass’s captured hits to the arrangement; the original takes remain available.</p><div className="song-table-scroll"><table><caption>Take A and B captured hit counts</caption><thead><tr><th scope="col">Section · pattern · measure</th><th scope="col">Take A hits</th><th scope="col">Take B hits</th><th scope="col">Use</th></tr></thead><tbody>{takeCompRows.map(row=><tr key={row.key}><th scope="row">{song.sections.find(section=>section.id===row.sectionId)?.name??"Removed section"} · {song.sections.find(section=>section.id===row.sectionId)?.parts.find(pattern=>pattern.id===row.partId)?.name??"Removed pattern"} · measure {row.measure}</th><td>{row.firstHits}</td><td>{row.secondHits}</td><td><select aria-label={`Take for measure ${row.measure}`} value={takeCompChoices[row.key]??"a"} onChange={event=>setTakeCompChoices(current=>({...current,[row.key]:event.target.value as "a"|"b"}))}><option value="a">Take A</option><option value="b">Take B</option></select></td></tr>)}</tbody></table></div><button type="button" disabled={!takeCompRows.length||midiRecording} onClick={()=>{try{const comp=mergeBuilderTakes(song,selectedTake,comparedTake,takeCompChoices);void saveBuilderTake(comp).then(()=>{setTakes(current=>[comp,...current.filter(take=>take.id!==comp.id)].slice(0,10));setSelectedTakeId(comp.id);setMessage(`Saved ${comp.name}. The source takes were kept.`);}).catch(()=>setMessage("Could not save this comped take."));}catch(error){setMessage(error instanceof Error?error.message:"Could not compose these takes.");}}}>Create comped take</button></section>}
              <div className="song-builder-actions"><button type="button" disabled={midiRecording} onClick={()=>{try{updateSong(current=>applyBuilderTake(current,selectedTake,quantizeStrength,takeVelocityScale));setMessage('Take applied. Notes on the same voice/grid cell use the last captured strike. Undo or restore a version to recover previous notes.');}catch(error){setMessage(error instanceof Error?error.message:'This take could not be applied.');}}}>Apply selected take</button><button type="button" onClick={()=>void deleteBuilderTake(selectedTake.id).then(()=>{setTakes(current=>current.filter(take=>take.id!==selectedTake.id));setSelectedTakeId('');})}>Delete selected take</button></div>
            </>}
          </div></section>
          <section><h3>Practice range and feel</h3><details><summary>Preview feel before applying</summary><label>Proposed swing · {feelDraft.swing}%<input type="range" min={50} max={75} value={feelDraft.swing} onChange={e=>setFeelDraft(current=>({...current,swing:Number(e.target.value)}))}/></label><label>Proposed timing variation · {feelDraft.amount}%<input type="range" min={0} max={100} value={feelDraft.amount} onChange={e=>setFeelDraft(current=>({...current,amount:Number(e.target.value)}))}/></label><label>Proposed velocity variation · {feelDraft.velocity}%<input type="range" min={0} max={100} value={feelDraft.velocity} onChange={e=>setFeelDraft(current=>({...current,velocity:Number(e.target.value)}))}/></label><div className="song-builder-actions"><button type="button" onClick={()=>void auditionFeel()}>Hear proposed feel</button><button type="button" onClick={()=>{clearPreview();changeBuilderSettings(current=>({...current,swing:feelDraft.swing,humanizeAmount:feelDraft.amount,humanizeVelocityAmount:feelDraft.velocity,humanizeSeed:feelDraft.seed}));setMessage('Feel applied to playback and audio exports. Grid positions remain editable.');}}>Apply feel</button><button type="button" onClick={()=>{clearPreview();setFeelDraft({swing,amount:builderSettings.humanizeAmount,velocity:builderSettings.humanizeVelocityAmount,seed:builderSettings.humanizeSeed});}}>Reset preview</button></div></details><div className="song-builder-tool-fields"><label>Loops before tempo increase<input type="number" min={1} max={32} value={builderSettings.practiceLoopsPerStep} onChange={e=>changeBuilderSettings(current=>({...current,practiceLoopsPerStep:Math.max(1,Math.min(32,Number(e.target.value)||1))}))}/></label><label>Target tempo · BPM<input type="number" min={40} max={200} value={builderSettings.practiceTargetBpm} onChange={e=>changeBuilderSettings(current=>({...current,practiceTargetBpm:clampBpm(Number(e.target.value))}))}/></label></div><div className="song-builder-tool-fields"><label>Start measure<select disabled={!['idle', 'finished'].includes(playbackMode)} value={safePracticeStart} onChange={(event) => { const value = Number(event.target.value); setPracticeRangeStart(value); if (value > safePracticeEnd) setPracticeRangeEnd(value); }}>{Array.from({ length: practiceBarCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><label>End measure<select disabled={!['idle', 'finished'].includes(playbackMode)} value={safePracticeEnd} onChange={(event) => setPracticeRangeEnd(Math.max(safePracticeStart, Number(event.target.value)))}>{Array.from({ length: practiceBarCount - safePracticeStart + 1 }, (_, index) => <option key={safePracticeStart + index} value={safePracticeStart + index}>{safePracticeStart + index}</option>)}</select></label><label>Tempo increase<select disabled={!['idle', 'finished'].includes(playbackMode)} value={builderSettings.practiceTempoStep} onChange={(event) => changeBuilderSettings((current) => ({ ...current, practiceTempoStep: Number(event.target.value) }))}><option value={0}>Off</option><option value={1}>+1 BPM</option><option value={2}>+2 BPM</option><option value={3}>+3 BPM</option><option value={5}>+5 BPM</option></select></label></div><p>Turn on “Loop range” to repeat these measures. Tempo increases after the selected number of loops and stops increasing at the target tempo.</p><label className="song-builder-setting-slider">Humanize timing · {builderSettings.humanizeAmount}%<input type="range" min={0} max={100} step={5} value={builderSettings.humanizeAmount} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, humanizeAmount: Number(event.target.value) }))} /></label><label>Velocity variation · {builderSettings.humanizeVelocityAmount}%<input type="range" min={0} max={100} step={5} value={builderSettings.humanizeVelocityAmount} disabled={!["idle","finished"].includes(playbackMode)} onChange={e=>changeBuilderSettings(current=>({...current,humanizeVelocityAmount:Number(e.target.value)}))}/></label><label>Repeatable humanize seed<input type="number" min={0} max={2147483647} value={builderSettings.humanizeSeed} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, humanizeSeed: Math.max(0, Number(event.target.value) || 0) }))} /></label></section>
          <section className="song-builder-mixer">
            <h3>Drum kit mixer</h3>
            <label>Load saved kit<select value="" onChange={(event) => { const preset = builderSettings.kitPresets.find((item) => item.id === event.target.value); if (preset) changeBuilderSettings((current) => ({ ...current, mix: structuredClone(preset.mix) })); }}><option value="">Choose a kit preset…</option>{builderSettings.kitPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label><details className="song-builder-kit-ab"><summary>A/B compare kit presets</summary><p>The selected pattern plays twice with each preset. Custom accent samples still switch at velocity 96.</p><div className="song-builder-tool-fields"><label>Kit A<select value={kitCompareA} onChange={event=>setKitCompareA(event.target.value)}><option value="">Choose preset A</option>{builderSettings.kitPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label><label>Kit B<select value={kitCompareB} onChange={event=>setKitCompareB(event.target.value)}><option value="">Choose preset B</option>{builderSettings.kitPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label></div><div className="song-builder-actions"><button type="button" disabled={!part||!kitCompareA||!['idle','finished'].includes(playbackMode)} aria-pressed={previewSourceId===`kit-a:${kitCompareA}`} onClick={()=>void auditionKitPreset(kitCompareA,"a")}>{previewSourceId===`kit-a:${kitCompareA}`?"Stop kit A":"Audition kit A"}</button><button type="button" disabled={!part||!kitCompareB||!['idle','finished'].includes(playbackMode)} aria-pressed={previewSourceId===`kit-b:${kitCompareB}`} onClick={()=>void auditionKitPreset(kitCompareB,"b")}>{previewSourceId===`kit-b:${kitCompareB}`?"Stop kit B":"Audition kit B"}</button></div></details>
            <div className="song-builder-mix-head"><span>Voice</span><span>Level</span><span>Pan</span><span>Sample</span><span>Mute</span><span>Solo</span></div>
            {SONG_INSTRUMENTS.map((voice) => <div className="song-builder-mix-row" key={voice}>
              <strong>{VOICE_LABEL[voice]}</strong>
              <label><span className="visually-hidden">{VOICE_LABEL[voice]} volume</span><input aria-label={`${VOICE_LABEL[voice]} volume`} type="range" min={0} max={100} step={1} value={Math.round(builderSettings.mix.levels[voice] * 100)} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, levels: { ...current.mix.levels, [voice]: Number(event.target.value) / 100 } } }))} /></label>
              <label><span className="visually-hidden">{VOICE_LABEL[voice]} pan</span><input aria-label={`${VOICE_LABEL[voice]} pan`} type="range" min={-100} max={100} step={1} value={Math.round(builderSettings.mix.pan[voice] * 100)} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, pan: { ...current.mix.pan, [voice]: Number(event.target.value) / 100 } } }))} /></label>
              <label><span className="visually-hidden">{VOICE_LABEL[voice]} sample</span><select aria-label={`${VOICE_LABEL[voice]} sample`} value={builderSettings.mix.sampleIndex[voice]} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, sampleIndex: { ...current.mix.sampleIndex, [voice]: Number(event.target.value) } } }))}><option value={-1} disabled={!customSampleNames[voice]}>Custom · {customSampleNames[voice] ?? "none"}</option>{Array.from({ length: voice === "snare" || voice === "tom" || voice === "rimshot" ? 3 : 4 }, (_, index) => <option key={index} value={index}>Sample {index + 1}</option>)}</select></label>
              <label className="song-builder-mix-toggle"><input type="checkbox" aria-label={`Mute ${VOICE_LABEL[voice]}`} checked={builderSettings.mix.muted[voice]} onChange={(event) => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, muted: { ...current.mix.muted, [voice]: event.target.checked } } }))} />Mute</label>
              <button className="song-builder-solo-button" type="button" aria-pressed={builderSettings.mix.solo === voice} onClick={() => changeBuilderSettings((current) => ({ ...current, mix: { ...current.mix, solo: current.mix.solo === voice ? "" : voice } }))}>Solo</button>
            </div>)}
            <div className="song-builder-tool-actions"><label>Sample voice<select value={kitSampleVoice} onChange={(event) => setKitSampleVoice(event.target.value as SongInstrument)}>{SONG_INSTRUMENTS.map((voice) => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label><label>Import primary sample<input type="file" accept="audio/*" onChange={(event) => void importCustomSample(event.target.files?.[0], "primary")} /></label><label>Import accent layer · velocity 96+<input type="file" accept="audio/*" disabled={!customSampleNames[kitSampleVoice]} onChange={(event) => void importCustomSample(event.target.files?.[0], "accent")} /></label><button type="button" disabled={!customAccentSampleNames[kitSampleVoice]} onClick={() => { void deleteCustomSample(kitSampleVoice, "accent").then(() => audioRef.current?.setCustomSample(kitSampleVoice, null, "accent")).then(() => { setCustomAccentSampleNames(current => { const next = { ...current }; delete next[kitSampleVoice]; return next; }); setMessage(`${VOICE_LABEL[kitSampleVoice]} accent layer removed.`); }).catch(() => setMessage("Could not remove that accent layer.")); }}>Remove accent layer{customAccentSampleNames[kitSampleVoice] ? ` · ${customAccentSampleNames[kitSampleVoice]}` : ""}</button><button type="button" onClick={() => void removeCustomSample()} disabled={!customSampleNames[kitSampleVoice]}>Remove custom sample and layers</button></div>
            <p>Import a WAV, MP3, or OGG sample up to 12 MB per voice. Open hi-hats are choked when another hi-hat voice plays.</p>
            <details className="song-builder-custom-voices"><summary>Custom and extra percussion lanes</summary><p>Add up to eight independent custom lanes. Each lane appears in the grid, staff, mixer, MIDI map, playback and exports. Choose its sample, MIDI note and staff position below.</p><div className="song-builder-tool-actions"><button type="button" disabled={activeCustomVoiceIds.length>=customVoiceIds.length} onClick={addCustomVoice}>Add custom lane</button><span>{activeCustomVoiceIds.length} of {customVoiceIds.length} custom lanes in use</span></div>{(["cowbell", "shaker", "tambourine", ...activeCustomVoiceIds] as SongInstrument[]).map(voice=><div className="song-builder-custom-lane" key={voice}><label>{BASE_VOICE_LABEL[voice]} lane name<input maxLength={40} value={song.voiceLabels?.[voice]??""} placeholder={BASE_VOICE_LABEL[voice]} onChange={event=>{const value=event.target.value.trim().slice(0,40);updateSong(current=>{const voiceLabels={...current.voiceLabels};if(value)voiceLabels[voice]=value;else delete voiceLabels[voice];return {...current,voiceLabels:Object.keys(voiceLabels).length?voiceLabels:undefined};});}}/></label>{customVoiceIds.indexOf(voice)>=4&&<button type="button" onClick={()=>removeCustomVoice(voice)}>Remove lane</button>}</div>)}</details>
            <div className="song-builder-tool-actions"><label>Save kit preset<input maxLength={40} value={kitPresetName} onChange={(event) => setKitPresetName(event.target.value)} placeholder="Warm club kit" /></label><button type="button" onClick={saveKitPreset} disabled={!kitPresetName.trim()}>Save preset</button></div>
          </section>
          <section><h3>MIDI drum map</h3><p>Choose the note numbers your DAW expects. The MIDI and MusicXML exports use this map.</p><label><input type="checkbox" checked={builderSettings.midiSeparateTracks} onChange={event=>changeBuilderSettings(current=>({...current,midiSeparateTracks:event.target.checked}))}/> Export one MIDI track per drum voice</label><div className="song-builder-midi-map">{SONG_INSTRUMENTS.map((voice) => <label key={voice}>{VOICE_LABEL[voice]}<input aria-label={`${VOICE_LABEL[voice]} MIDI note`} type="number" min={0} max={127} value={builderSettings.midiNotes[voice]} disabled={!['idle', 'finished'].includes(playbackMode)} onChange={(event) => changeBuilderSettings((current) => ({ ...current, midiNotes: { ...current.midiNotes, [voice]: Math.max(0, Math.min(127, Number(event.target.value) || 0)) } }))} /></label>)}</div><button className="button-secondary" type="button" onClick={() => changeBuilderSettings((current) => ({ ...current, midiNotes: { ...DEFAULT_SONG_BUILDER_SETTINGS.midiNotes } }))}>Reset General MIDI map</button></section>
        </div>
      </details>}
        <SongBuilderVersions key={`versions-${song.id}-${assetRevision}`} song={song} mix={builderSettings.mix} swing={swing} onRestore={restored=>{updateSong(current=>({...restored,id:current.id}));setActiveSectionId('');setActivePartId('');setActiveClipId('');setPendingGrid(null);}}/>
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
          <div className="song-builder-section-heading"><div><span className="eyebrow">Arrangement</span><h2>Build the song.</h2><button type="button" aria-expanded={!arrangementCollapsed} onClick={()=>setArrangementCollapsed(!arrangementCollapsed)}>{arrangementCollapsed?"Expand section editor":"Collapse section editor"}</button></div><button className="button-secondary" type="button" onClick={addSection}>Add section</button></div>
          {song.sections.length ? <div className="song-builder-section-list">{song.sections.map((item, index) => <div className={item.id === section?.id ? "song-builder-section active" : "song-builder-section"} key={item.id}>
            <button type="button" className="song-builder-section-select" aria-pressed={item.id === section?.id} onClick={() => { setSelectedClipIds([]); setSelectedCell(null); setActiveSectionId(item.id); setActiveClipId(sectionClips(item)[0]?.id ?? ""); setActivePartId(sectionClips(item)[0]?.partId ?? ""); }}><strong>{item.name}</strong><small>{item.marker ? `Marker: ${item.marker} · ` : ""}{item.endingPass ? `Ending ${item.endingPass} · ` : ""}{item.kind} · {sectionClips(item).length} clips · repeats {item.endingGroup ? item.endingRepeats ?? 2 : item.repeats ?? 1}</small></button>
            <div className="song-builder-icon-actions"><button type="button" aria-label={`Move ${item.name} up`} disabled={index === 0} onClick={() => moveSection(item.id, -1)}>↑</button><button type="button" aria-label={`Move ${item.name} down`} disabled={index === song.sections.length - 1} onClick={() => moveSection(item.id, 1)}>↓</button><button type="button" aria-label={`Duplicate ${item.name}`} onClick={() => duplicateSection(item.id)}>＋</button><button type="button" aria-label={`Delete ${item.name}`} onClick={() => deleteSection(item.id)}>×</button></div>
          </div>)}</div> : <p>Add an intro, verse, or other section to start the arrangement.</p>}
          {section && !arrangementCollapsed && <>
            <div className="song-builder-fields song-builder-section-fields">
              <label>Section name<input maxLength={80} value={section.name} onChange={(event) => updateSection(section.id, (current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Section type<select value={section.kind} onChange={(event) => updateSection(section.id, (current) => ({ ...current, kind: event.target.value as SongSection["kind"] }))}><option value="intro">Intro</option><option value="verse">Verse</option><option value="chorus">Chorus</option><option value="bridge">Bridge</option><option value="fill">Fill</option><option value="outro">Outro</option><option value="other">Other</option></select></label>
              <label>Section repeats<input type="number" min={1} max={32} value={section.repeats ?? 1} onChange={(event) => updateSection(section.id, (current) => ({ ...current, repeats: Math.max(1, Math.min(32, Number(event.target.value) || 1)) }))} /></label>
              <label>Section tempo · blank uses {song.bpm} BPM<input type="number" min={40} max={200} placeholder={String(song.bpm)} value={section.bpm ?? ""} onChange={(event) => updateSection(section.id, (current) => ({ ...current, bpm: event.target.value ? clampBpm(Number(event.target.value)) : undefined }))} /></label>
              <label>Tempo-ramp target BPM<input type="number" min={40} max={200} placeholder="Off" value={section.tempoRamp?.targetBpm ?? ""} onChange={(event) => updateSection(section.id, (current) => ({ ...current, tempoRamp: event.target.value ? { targetBpm: clampBpm(Number(event.target.value)), bars: current.tempoRamp?.bars ?? 4 } : undefined }))} /></label>
              <label>Ramp length · bars<input type="number" min={1} max={128} disabled={!section.tempoRamp} value={section.tempoRamp?.bars ?? ""} placeholder="4" onChange={(event) => updateSection(section.id, (current) => ({ ...current, tempoRamp: current.tempoRamp ? { ...current.tempoRamp, bars: Math.max(1, Math.min(128, Number(event.target.value) || 1)) } : undefined }))} /></label>
              <label>Default meter<input maxLength={40} value={section.meter ?? song.meter} onChange={(event) => updateSection(section.id, (current) => ({ ...current, meter: event.target.value.slice(0, 40) }))} /></label>
              <label>Section notes<input maxLength={2000} value={section.notes} onChange={(event) => updateSection(section.id, (current) => ({ ...current, notes: event.target.value }))} /></label><details className="song-builder-section-playback-feel"><summary>Section playback feel · {section.playbackFeel?"custom":"song defaults"}</summary><p>Override the song’s swing and humanization for this section. Values also apply to its repeated clips.</p><label>Section swing · {section.playbackFeel?.swing??(section.feel?.kind==="straight"?50:section.feel?.amount??swing)}%<input type="range" min={50} max={75} step={1} value={section.playbackFeel?.swing??(section.feel?.kind==="straight"?50:section.feel?.amount??swing)} onChange={event=>updateSection(section.id,current=>({...current,playbackFeel:{...current.playbackFeel,swing:Number(event.target.value)}}))}/></label><label>Timing humanization · {section.playbackFeel?.humanizeAmount??builderSettings.humanizeAmount}%<input type="range" min={0} max={100} step={5} value={section.playbackFeel?.humanizeAmount??builderSettings.humanizeAmount} onChange={event=>updateSection(section.id,current=>({...current,playbackFeel:{...current.playbackFeel,humanizeAmount:Number(event.target.value)}}))}/></label><label>Velocity variation · {section.playbackFeel?.humanizeVelocityAmount??builderSettings.humanizeVelocityAmount}%<input type="range" min={0} max={100} step={5} value={section.playbackFeel?.humanizeVelocityAmount??builderSettings.humanizeVelocityAmount} onChange={event=>updateSection(section.id,current=>({...current,playbackFeel:{...current.playbackFeel,humanizeVelocityAmount:Number(event.target.value)}}))}/></label>{section.playbackFeel&&<button type="button" onClick={()=>updateSection(section.id,current=>({...current,playbackFeel:undefined}))}>Use song feel defaults</button>}</details>
              <details className="song-builder-automation"><summary>Section automation · {section.automation?"active":"off"}</summary><p>Shape the drum mix across this section. Changes follow its repeated passes and are included in playback and WAV exports.</p><div className="song-builder-automation-lanes">{([['volumeFrom','volumeTo','Overall volume'],['cymbalFrom','cymbalTo','Cymbal intensity']] as const).map(([fromKey,toKey,label])=><fieldset key={label}><legend>{label}</legend><label>Start · {Math.round((section.automation?.[fromKey]??1)*100)}%<input type="range" min={0} max={1} step={0.01} value={section.automation?.[fromKey]??1} onChange={event=>updateSection(section.id,current=>({...current,automation:{...current.automation,[fromKey]:Number(event.target.value)}}))}/></label><label>End · {Math.round((section.automation?.[toKey]??section.automation?.[fromKey]??1)*100)}%<input type="range" min={0} max={1} step={0.01} value={section.automation?.[toKey]??section.automation?.[fromKey]??1} onChange={event=>updateSection(section.id,current=>({...current,automation:{...current.automation,[toKey]:Number(event.target.value)}}))}/></label></fieldset>)}</div><fieldset><legend>Mute voices for this section</legend><div className="song-builder-automation-mutes">{BUILDER_VOICES.map(voice=><label key={voice}><input type="checkbox" checked={section.automation?.mutedVoices?.includes(voice)??false} onChange={event=>updateSection(section.id,current=>{const muted=new Set(current.automation?.mutedVoices??[]);if(event.target.checked)muted.add(voice);else muted.delete(voice);return {...current,automation:{...current.automation,mutedVoices:[...muted]}};})}/>{VOICE_LABEL[voice]}</label>)}</div></fieldset><SongBuilderVoiceAutomation automation={section.automation} voices={BUILDER_VOICES} labels={VOICE_LABEL} onChange={automation=>updateSection(section.id,current=>({...current,automation}))}/>{section.automation&&<button type="button" onClick={()=>updateSection(section.id,current=>({...current,automation:undefined}))}>Clear section automation</button>}</details>
              <label>Rehearsal marker<input maxLength={80} value={section.marker ?? ""} placeholder="e.g. A · Chorus" onChange={(event) => updateSection(section.id, (current) => ({ ...current, marker: event.target.value || undefined }))} /></label>
              <details className="song-builder-rehearsal-cues"><summary>Reference cue lanes · {section.rehearsalCues?.length??0}</summary><p>Add chord changes, lyric prompts, or band directions at measure boundaries. They appear during playback and in the score and MIDI marker track.</p><div className="song-builder-tool-fields"><label>Measure<input type="number" min={1} max={cueMeasureMax} value={cueMeasure} onChange={event=>{const measure=Math.max(1,Math.min(cueMeasureMax,Number(event.target.value)||1));setCueMeasure(measure);setCueDraft(section.rehearsalCues?.find(cue=>cue.measure===measure&&(cue.kind??'band')===cueKind)?.text??'');}}/></label><label>Cue lane<select value={cueKind} onChange={event=>{const kind=event.target.value as typeof cueKind;setCueKind(kind);setCueDraft(section.rehearsalCues?.find(cue=>cue.measure===cueMeasure&&(cue.kind??'band')===kind)?.text??'');}}><option value="band">Band cue</option><option value="chord">Chord</option><option value="lyric">Lyric prompt</option></select></label><label>{cueKind==='chord'?'Chord / harmony':cueKind==='lyric'?'Lyric prompt':'Band direction'}<input maxLength={240} value={cueDraft} placeholder={cueKind==='chord'?'e.g. Am7':cueKind==='lyric'?'e.g. Verse starts':'e.g. Drop to hi-hat; watch the stop'} onChange={event=>setCueDraft(event.target.value)}/></label><button type="button" disabled={!sectionMeasureCount} onClick={saveRehearsalCue}>{selectedRehearsalCue?'Update cue':'Add cue'}</button>{selectedRehearsalCue&&<button type="button" onClick={()=>{updateSection(section.id,current=>({...current,rehearsalCues:(current.rehearsalCues??[]).filter(cue=>cue.measure!==cueMeasure||(cue.kind??'band')!==cueKind)}));setCueDraft('');setMessage(`Cue removed from measure ${cueMeasure}.`);}}>Remove cue</button>}</div>{!!section.rehearsalCues?.length&&<ul>{section.rehearsalCues.map(cue=><li key={cue.id}><button type="button" onClick={()=>{const kind=cue.kind??'band';setCueMeasure(Math.min(cueMeasureMax,cue.measure));setCueKind(kind);setCueDraft(cue.text);}}>{cue.kind==='chord'?'Chord':cue.kind==='lyric'?'Lyric':'Band cue'} · Measure {cue.measure}: {cue.text}</button><button type="button" aria-label={`Delete ${cue.kind??'band'} cue at measure ${cue.measure}`} onClick={()=>updateSection(section.id,current=>({...current,rehearsalCues:(current.rehearsalCues??[]).filter(item=>item.id!==cue.id)}))}>Remove</button></li>)}</ul>}</details>
              <label>Pickup length<select value={section.pickupBeats ?? 0} onChange={(event) => updateSection(section.id, (current) => ({ ...current, pickupBeats: Number(event.target.value) || undefined }))}><option value={0}>No pickup</option>{[0.5, 1, 1.5, 2, 3, 4].map((beats) => <option key={beats} value={beats}>{beats} beats</option>)}</select></label>
              <label>Repeat group<input maxLength={80} value={section.endingGroup ?? ""} placeholder="e.g. Verse loop" onChange={(event) => updateSection(section.id, (current) => ({ ...current, endingGroup: event.target.value.trim() || undefined }))} /></label>
              <label>Ending<select value={section.endingPass ?? 0} onChange={(event) => updateSection(section.id, (current) => ({ ...current, endingGroup: current.endingGroup || `repeat-${current.id.slice(0, 8)}`, endingPass: Number(event.target.value) === 1 || Number(event.target.value) === 2 ? Number(event.target.value) as 1 | 2 : undefined }))}><option value={0}>Shared section</option><option value={1}>First ending</option><option value={2}>Second ending</option></select></label>
              <label>Repeat group passes<input type="number" min={2} max={8} disabled={!section.endingGroup} value={section.endingRepeats ?? 2} onChange={(event) => updateSection(section.id, (current) => ({ ...current, endingRepeats: Math.max(2, Math.min(8, Number(event.target.value) || 2)) }))} /></label>
            </div>
            <div className="song-builder-clips-heading"><h3>Measure sequence</h3><div className="song-builder-actions"><button type="button" onClick={addBlankPattern}>Add blank pattern</button><button type="button" onClick={() => duplicateSection()}>Duplicate section</button></div></div>
            {activeClip&&<div className="song-builder-clip-transfer"><label>Move active clip to section<select value={clipMoveTarget} onChange={event=>setClipMoveTarget(event.target.value)}><option value="">Choose destination…</option>{song.sections.filter(item=>item.id!==section.id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" disabled={!clipMoveTarget||!song.sections.some(item=>item.id===clipMoveTarget&&item.id!==section.id)} onClick={()=>{const editable=song.bundled?copyAsPersonalSong(song):song;const moved=moveClipToSection(editable,section.id,activeClip.id,clipMoveTarget);if(moved===editable){setMessage('The destination is full or unavailable.');return;}persistSong(moved);setActiveSectionId(clipMoveTarget);setActiveClipId(activeClip.id);setActivePartId(moved.sections.find(item=>item.id===clipMoveTarget)?.clips?.find(clip=>clip.id===activeClip.id)?.partId??'');setClipMoveTarget('');setMessage('Active clip moved to its destination.');}}>Move active clip</button></div>}
            {activeClip&&<details className="song-builder-clip-overrides"><summary>Active clip performance · {activeClip.overrides?'overrides on':'song defaults'}</summary><p>These settings apply to this clip only. The shared pattern stays unchanged.</p><label>Clip dynamics · {Math.round((activeClip.overrides?.volume??1)*100)}%<input type="range" min={0} max={1} step={0.01} value={activeClip.overrides?.volume??1} onChange={event=>updateClip(section.id,activeClip.id,current=>({...current,overrides:{...current.overrides,volume:Number(event.target.value)}}))}/></label><label>Clip swing · {activeClip.overrides?.swing??section.playbackFeel?.swing??(section.feel?.kind==="straight"?50:section.feel?.amount??swing)}%<input type="range" min={50} max={75} step={1} value={activeClip.overrides?.swing??section.playbackFeel?.swing??(section.feel?.kind==="straight"?50:section.feel?.amount??swing)} onChange={event=>updateClip(section.id,activeClip.id,current=>({...current,overrides:{...current.overrides,swing:Number(event.target.value)}}))}/></label><label>Clip timing humanization · {activeClip.overrides?.humanizeAmount??section.playbackFeel?.humanizeAmount??builderSettings.humanizeAmount}%<input type="range" min={0} max={100} step={5} value={activeClip.overrides?.humanizeAmount??section.playbackFeel?.humanizeAmount??builderSettings.humanizeAmount} onChange={event=>updateClip(section.id,activeClip.id,current=>({...current,overrides:{...current.overrides,humanizeAmount:Number(event.target.value)}}))}/></label><label>Clip velocity variation · {activeClip.overrides?.humanizeVelocityAmount??section.playbackFeel?.humanizeVelocityAmount??builderSettings.humanizeVelocityAmount}%<input type="range" min={0} max={100} step={5} value={activeClip.overrides?.humanizeVelocityAmount??section.playbackFeel?.humanizeVelocityAmount??builderSettings.humanizeVelocityAmount} onChange={event=>updateClip(section.id,activeClip.id,current=>({...current,overrides:{...current.overrides,humanizeVelocityAmount:Number(event.target.value)}}))}/></label><fieldset><legend>Mute voices for this clip</legend><div className="song-builder-automation-mutes">{BUILDER_VOICES.map(voice=><label key={voice}><input type="checkbox" checked={activeClip.overrides?.mutedVoices?.includes(voice)??false} onChange={event=>updateClip(section.id,activeClip.id,current=>{const muted=new Set(current.overrides?.mutedVoices??[]);if(event.target.checked)muted.add(voice);else muted.delete(voice);return {...current,overrides:{...current.overrides,mutedVoices:[...muted]}};})}/>{VOICE_LABEL[voice]}</label>)}</div></fieldset>{activeClip.overrides&&<button type="button" onClick={()=>updateClip(section.id,activeClip.id,current=>({...current,overrides:undefined}))}>Reset clip overrides</button>}</details>}
            {activeClip&&<div className="song-builder-clip-variation"><label>Edit clip repeat<select aria-label="Edit pattern for clip repeat" value={editClipRepeat} onChange={event=>setClipEditRepeat(activeClip,Number(event.target.value))}>{Array.from({length:activeClip.repeats},(_,index)=>{const repeat=index+1,variant=activeClip.repeatVariants?.find(item=>item.repeat===repeat),variantPart=section.parts.find(item=>item.id===variant?.partId);return <option key={repeat} value={repeat}>Repeat {repeat}{variantPart?` · ${variantPart.name}`:''}</option>;})}</select></label>{activeClip.repeats>1&&<button type="button" disabled={section.parts.length>=256} onClick={()=>createRepeatVariation(activeClip,editClipRepeat>1?editClipRepeat:Math.max(2,activeClip.repeats))}>Make this repeat an independent variation</button>}<small>Changes to a variation stay isolated to that repeat of this clip.</small></div>}
            {clips.length ? <><div className="song-builder-clip-tools"><button type="button" onClick={() => setSelectedClipIds(clips.map((clip) => clip.id))}>Select all</button><button type="button" onClick={() => setSelectedClipIds([])} disabled={!selectedClipIds.length}>Clear selection</button><button type="button" disabled={!selectedClipIds.length} onClick={()=>{const selected=sectionClips(section).filter(clip=>selectedClipIds.includes(clip.id));try{localStorage.setItem(ARRANGEMENT_CLIPBOARD_KEY,JSON.stringify({version:1,sections:[{...section,id:uid(),name:`${section.name} clips`,repeats:1,endingGroup:undefined,endingPass:undefined,parts:section.parts.filter(part=>selected.some(clip=>clip.partId===part.id||clip.repeatVariants?.some(variant=>variant.partId===part.id))),clips:selected}]}));window.dispatchEvent(new Event('drum-hero:arrangement-copied'));setMessage('Selected clips copied. Switch songs, then Paste arrangement to insert them as a section.');}catch{setMessage('Could not save the clip clipboard.');}}}>Copy selected clips</button><button type="button" onClick={duplicateSelectedClips} disabled={!selectedClipIds.length}>Duplicate selected</button><button type="button" disabled={!selectedClipIds.length} onClick={()=>{if(window.confirm(`Remove ${selectedClipIds.length} selected clips? Pattern notes remain available. Undo can restore the clips.`)){updateSection(section.id,current=>({...current,clips:sectionClips(current).filter(clip=>!selectedClipIds.includes(clip.id))}));setSelectedClipIds([]);}}}>Delete selected clips</button><button type="button" disabled={!selectedClipIds.length||!clipMoveTarget} onClick={()=>{const target=song.sections.find(item=>item.id===clipMoveTarget);if(!target||target.parts.length+selectedClipIds.length>256||sectionClips(target).length+selectedClipIds.length>512){setMessage('The destination has insufficient room for this selection.');return;}updateSong(current=>selectedClipIds.reduce((next,id)=>moveClipToSection(next,section.id,id,clipMoveTarget),current));setSelectedClipIds([]);setMessage('Selected clips moved.');}}>Move selected to destination</button><button type="button" onClick={() => moveSelectedClips(-1)} disabled={!selectedClipIds.length}>Move selection up</button><button type="button" onClick={() => moveSelectedClips(1)} disabled={!selectedClipIds.length}>Move selection down</button></div><ol className="song-builder-clips">{clips.map((clip, index) => {
              const clipPart = section.parts.find((candidate) => candidate.id === clip.partId);
              if (!clipPart) return null;
              const barsInClip = measureCountForClip(clip);
              const active = activeClip?.id === clip.id;
              const playing = position?.clipId === clip.id && (playScope === "song" || playScope === section.id);
              return <li className={`${active ? "active" : ""} ${playing ? "playing" : ""}`} key={clip.id} draggable onDragStart={(event) => { draggedClipIdRef.current = clip.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", clip.id); event.dataTransfer.setData("application/drumhero-clip",JSON.stringify({sectionId:section.id,clipId:clip.id})); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderClip(draggedClipIdRef.current || event.dataTransfer.getData("text/plain"), clip.id); draggedClipIdRef.current = ""; }} onDragEnd={() => { draggedClipIdRef.current = ""; }}>
                <label className="song-builder-clip-check"><input type="checkbox" aria-label={`Select clip ${index + 1}, ${clipPart.name}`} checked={selectedClipIds.includes(clip.id)} onChange={(event) => setSelectedClipIds((current) => event.target.checked ? [...current, clip.id] : current.filter((id) => id !== clip.id))} /></label>
                <button className="song-builder-clip-select" type="button" aria-pressed={active} onClick={() => { setSelectedCell(null); setSelectedCells([]); setActiveClipId(clip.id); setSelectedClipRepeat({clipId:clip.id,repeat:1}); setActivePartId(clip.partId); }}><span className="song-builder-clip-number">{index + 1}</span><span><strong>{clipPart.name}</strong><small>{clipPart.meter || section.meter || song.meter} · {barsInClip} {barsInClip === 1 ? "bar" : "bars"}</small></span></button>
                <label>Repeat<input aria-label={`Repeat ${clipPart.name}`} type="number" min={1} max={64} value={clip.repeats} onChange={(event) => updateSection(section.id, (current) => ({ ...current, clips: sectionClips(current).map((item) => item.id === clip.id ? { ...item, repeats: Math.max(1, Math.min(64, Number(event.target.value) || 1)) } : item) }))} /></label>
                <div className="song-builder-icon-actions"><button type="button" aria-label={`Move ${clipPart.name} up`} disabled={index === 0} onClick={() => moveClip(clip.id, -1)}>↑</button><button type="button" aria-label={`Move ${clipPart.name} down`} disabled={index === clips.length - 1} onClick={() => moveClip(clip.id, 1)}>↓</button><button type="button" aria-label={`Duplicate ${clipPart.name} clip`} onClick={() => duplicateClip(clip.id)}>＋</button><button type="button" aria-label={`Remove ${clipPart.name} clip`} onClick={() => removeClip(clip.id)}>×</button></div>
              </li>;
            })}</ol></> : <p className="song-builder-empty">Add a blank pattern or choose a groove or fill below.</p>}
          </>}
        </section>

        {section && <div className="song-builder-edit-columns">
          <section className="card song-builder-pattern-editor" aria-label="Drum tab editor">
            <div className="song-builder-section-heading"><div><span className="eyebrow">Editable drum tab</span><h2>{part?.name ?? "Choose a pattern"}</h2></div>{part && <button className="button-secondary" type="button" onClick={duplicatePattern}>Duplicate pattern</button>}</div>
            {part&&<SongBuilderPatternMorph source={part} targets={morphTargets} onPreview={preview=>void previewSource(preview)} onInsert={next=>{if(section.parts.length>=256||clips.length>=512){setMessage('This section is full. Add another section first.');return false;}clearPreview();const clip:SongClip={id:uid(),partId:next.id,repeats:1};updateSection(section.id,current=>({...current,parts:[...current.parts,next],clips:[...sectionClips(current),clip]}));setActiveClipId(clip.id);setActivePartId(next.id);setMessage(`Inserted “${next.name}” as an independent pattern.`);return true;}}/>}
            {part ? <>
              <div className="song-builder-fields song-builder-part-fields">
                <label>Pattern dynamics<input maxLength={200} placeholder="p, mf, crescendo…" value={part.dynamics??""} onChange={e=>updatePart(part.id,current=>({...current,dynamics:e.target.value}))}/></label><label>Score annotation<input maxLength={2000} value={part.notes??""} onChange={e=>updatePart(part.id,current=>({...current,notes:e.target.value}))}/></label><label>Editing pattern<select value={part.id} onChange={(event) => { setSelectedCell(null); setSelectedCells([]); setActivePartId(event.target.value); setActiveClipId(clips.find(clip=>clip.partId===event.target.value)?.id??''); }}>{section.parts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>Pattern name<input maxLength={80} value={part.name} onChange={(event) => updatePart(part.id, (current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Pattern meter<input maxLength={40} value={part.meter ?? section.meter ?? song.meter} onChange={(event) => updatePart(part.id, (current) => ({ ...current, meter: event.target.value.slice(0, 40) }))} /></label>
                <label>Length · quarter-note beats<input type="number" min={0.5} max={32} step={0.5} value={part.beats} onChange={(event) => { const beats = Math.max(0.5, Math.min(32, Number(event.target.value) || 4)); updatePart(part.id, (current) => ({ ...current, beats, hits: current.hits.filter((hit) => hit.step < beats * current.subdivision / 4) })); }} /></label>
                <label>Grid<select value={part.subdivision} onChange={(event) => changeSubdivision(Number(event.target.value))}><option value={4}>Quarter notes</option><option value={8}>Eighth notes</option><option value={12}>Triplets</option><option value={16}>Sixteenth notes</option></select></label>
              </div>
              <div className="song-builder-linked"><strong>{clips.filter(clip=>clip.partId===part.id).length} clip instance(s) use this pattern.</strong><button type="button" onClick={()=>setMessage(`Edits to “${part.name}” apply to all ${clips.filter(clip=>clip.partId===part.id).length} linked clips.`)}>Edit all instances</button><button type="button" disabled={activeClip?.partId!==part.id||clips.filter(clip=>clip.partId===part.id).length<2} onClick={makeIndependent}>Make this clip independent</button></div>
              {gridPreview&&<section className="song-builder-grid-preview" aria-label="Grid conversion preview"><strong>Change to {pendingGrid}-note grid</strong><p>{gridPreview.error||`${gridPreview.moved} note(s) will move to the nearest grid position; ${gridPreview.collisions} note collision(s) will merge, keeping the stronger strike.`}</p>{part.hits.slice(0,12).map((hit,index)=><small key={index}>{VOICE_LABEL[hit.instrument]}: beat {(hit.step*4/part.subdivision+1).toFixed(2)} → {(Math.min(part.beats*pendingGrid!/4-1,Math.round(hit.step*pendingGrid!/part.subdivision))*4/pendingGrid!+1).toFixed(2)} · </small>)}<div><button type="button" disabled={!!gridPreview.error} onClick={()=>{updatePart(part.id,()=>gridPreview.part);setPendingGrid(null);setSelectedCell(null);setSelectedCells([]);setGridFocus({voice:0,step:0});}}>Apply grid change</button><button type="button" onClick={()=>setPendingGrid(null)}>Cancel</button></div></section>}
              <details className="song-builder-phrase-tools"><summary>Phrase editing and save to pattern library</summary><div className="song-builder-tool-fields"><label>First measure<input type="number" min={1} max={phraseMeasures} value={Math.min(phraseStart,phraseMeasures)} onChange={e=>setPhraseStart(Math.max(1,Math.min(phraseMeasures,Number(e.target.value)||1)))}/></label><label>Last measure<input type="number" min={Math.min(phraseStart,phraseMeasures)} max={phraseMeasures} value={Math.min(Math.max(phraseStart,phraseEnd),phraseMeasures)} onChange={e=>setPhraseEnd(Math.max(phraseStart,Math.min(phraseMeasures,Number(e.target.value)||1)))}/></label><label>Transform<select value={phraseOperation} onChange={e=>setPhraseOperation(e.target.value as PhraseOperation)}><option value="crescendo">Crescendo</option><option value="decrescendo">Decrescendo</option><option value="alternate-accents">Alternating accents</option><option value="rotate">Rotate one step</option><option value="swap">Swap drum voices</option><option value="thin">Thin alternate hit positions</option></select></label>{phraseOperation==='swap'&&<>{[['From',swapFrom,setSwapFrom],['To',swapTo,setSwapTo]].map(([label,value,change])=><label key={String(label)}>{String(label)}<select value={String(value)} onChange={e=>(change as typeof setSwapFrom)(e.target.value as SongInstrument)}>{BUILDER_VOICES.map(voice=><option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>)}</>}<button type="button" disabled={!phraseRangeAligned} onClick={()=>setPhrasePreview(transformPhrase(part,rangeFirst,rangeLast,phraseOperation,swapFrom,swapTo))}>Preview measure transformation</button>{phrasePreview&&<><SongBuilderNoteChanges before={part} after={phrasePreview}/><button type="button" onClick={()=>{if(phrasePreview.id!==part.id){setMessage('Preview belongs to another pattern. Generate a new preview.');return;}updatePart(part.id,()=>phrasePreview);setPhrasePreview(null);}}>Apply previewed transformation</button><button type="button" onClick={()=>setPhrasePreview(null)}>Cancel transformation</button></>}</div><div className="song-builder-tool-fields"><label>Saved pattern name<input maxLength={60} value={patternSaveName} placeholder={part.name} onChange={e=>setPatternSaveName(e.target.value)}/></label><label>Tags · comma separated<input maxLength={120} value={patternSaveTags} onChange={e=>setPatternSaveTags(e.target.value)}/></label><label><input type="checkbox" checked={saveAsFill} onChange={e=>setSaveAsFill(e.target.checked)}/>Save as fill</label><button type="button" disabled={!phraseRangeAligned} onClick={savePatternToLibrary}>Save measure range to library</button></div>{!phraseRangeAligned&&<p role="status">This measure boundary falls between grid steps. Select a wider measure range that aligns with this pattern’s grid.</p>}</details>
              <p className="song-builder-hint">Click a cell to cycle rest → hit → accent → rest. Use arrow keys to move around the grid. This pattern has {partStepCount(part)} steps and plays at {section.bpm ?? song.bpm} BPM.</p>
              <div className="song-builder-grid-tools">
                <label>Pointer tool<select value={gridPaintMode} onChange={(event) => setGridPaintMode(event.target.value as typeof gridPaintMode)}><option value="select">Select cells</option><option value="cycle">Cycle hit state</option><option value="hit">Draw hits</option><option value="erase">Erase hits</option></select></label>
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
              <div className="song-builder-touch-tools"><button type="button" aria-pressed={touchGrid} onClick={()=>{setTouchGrid(value=>{const next=!value;setGridCellSize(next?54:34);setGridPaintMode(next?"hit":"cycle");setGridFocus({voice:0,step:gridFocus.step});return next;})}}>{touchGrid?"Exit touch focus":"Touch focus · large cells"}</button>{touchGrid&&<><label>Voice to edit<select value={touchVoice} onChange={event=>{setTouchVoice(event.target.value as SongInstrument);setGridFocus({voice:0,step:gridFocus.step});}}>{availableGridVoices.map(voice=><option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label><span>Drag across the grid to paint notes. The selected voice stays isolated for precise touch editing.</span></>}</div>
              <label className="song-builder-zoom">Grid zoom · {gridCellSize}px<input aria-label="Grid cell size" type="range" min={24} max={72} step={2} value={gridCellSize} onChange={(event) => setGridCellSize(Number(event.target.value))} /></label>
              <div className="song-builder-grid-scroll"><div className={`song-builder-grid${touchGrid?" touch-focused":""}`} style={{ "--steps": partStepCount(part), "--cell-width": `${gridCellSize}px` } as React.CSSProperties} role="grid" data-pointer-tool={gridPaintMode} onPointerMove={event=>{if(paintRef.current?.pointerId!==event.pointerId)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLButtonElement>("button[data-song-step]");if(!target)return;const voice=gridVoices[Number(target.dataset.songVoice)];if(voice)paintGridCell(voice,Number(target.dataset.songStep),paintRef.current.mode);}} aria-rowcount={gridVoices.length+1} aria-label={touchGrid?`Touch focused drum grid, ${VOICE_LABEL[touchVoice]} lane`:"Editable drum tab grid"} aria-colcount={partStepCount(part) + 1}>
                <div className="song-builder-grid-row song-builder-grid-head" role="row"><strong role="rowheader">Voice</strong>{Array.from({ length: partStepCount(part) }, (_, step) => <span role="columnheader" aria-label={`Step ${step + 1}${beatLabels[step] ? `, beat group ${beatLabels[step]}` : ""}`} key={step}>{beatLabels[step] || "·"}</span>)}</div>
                {gridVoices.map((voice, voiceIndex) => <div className="song-builder-grid-row" role="row" key={voice}><strong role="rowheader">{VOICE_LABEL[voice]}</strong>{Array.from({ length: partStepCount(part) }, (_, step) => {
                  const hit = part.hits.find((item) => item.step === step && item.instrument === voice);
                  const isPlayhead = position?.partId === part.id && position.step === step;
                  const articulationName = hit?.articulation && hit.articulation !== "normal" ? hit.articulation.replace("foot-splash", "foot splash") : "";
                  const glyph = hit?.articulation && hit.articulation !== "normal" ? ({ flam: "fl", drag: "dr", buzz: "z", "foot-splash": "FS", roll: "rr", choke: "+" } as const)[hit.articulation] : hit?.ghost ? "g" : hit?.accent ? "◆" : hit ? "●" : "·";
                  return <button className={`${hit ? "hit" : ""} ${hit?.accent ? "accented" : ""} ${hit?.ghost ? "ghost" : ""} ${beatLabels[step] ? "beat-start" : ""} ${step > 0 && step % stepsPerMeasure === 0 ? "measure-start" : ""} ${isPlayhead ? "playhead" : ""} ${selectedCells.includes(`${voice}:${step}`) ? "selected-cell" : ""}`} key={step} type="button" role="gridcell" data-song-voice={voiceIndex} data-song-step={step} tabIndex={voiceIndex===Math.min(gridVoices.length-1,gridFocus.voice)&&step===Math.min(partStepCount(part)-1,gridFocus.step)?0:-1} onFocus={()=>setGridFocus({voice:voiceIndex,step})} aria-label={`${VOICE_LABEL[voice]} step ${step + 1}${beatLabels[step] ? `, beat group ${beatLabels[step]}` : ""}: ${hit ? `${hit.ghost ? "ghost note" : hit.accent ? "accent" : "hit"}${articulationName ? `, ${articulationName}` : ""}` : "rest"}`} aria-selected={selectedCells.includes(`${voice}:${step}`)} onKeyDown={(event) => navigateGrid(event, voiceIndex, step)} onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.focus(); const modified = event.shiftKey || event.metaKey || event.ctrlKey; if(gridPaintMode==="select"&&!modified){event.preventDefault();setSelectedCell({instrument:voice,step});setSelectedCells(current=>current.includes(`${voice}:${step}`)?current.filter(key=>key!==`${voice}:${step}`):[...current,`${voice}:${step}`]);return;} if (modified) { event.preventDefault(); selectGridCell(event, voice, step); return; } if (gridPaintMode === "cycle") { event.preventDefault(); cycleCell(voice, step); return; } event.preventDefault(); selectGridCell(event, voice, step); const mode = gridPaintMode as "hit"|"erase"; paintRef.current = { pointerId: event.pointerId, mode }; paintGridCell(voice, step, mode); }} onPointerEnter={(event) => { const activePaint = paintRef.current; if (activePaint?.pointerId === event.pointerId) paintGridCell(voice, step, activePaint.mode); }} onClick={(event) => handleGridCellClick(event, voice, step)}>{glyph}</button>;
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
              <div className="song-builder-linked-variation"><strong>{part.linkedBaseId?`Variation of ${section.parts.find(p=>p.id===part.linkedBaseId)?.name??'base groove'} · ${part.linkOverrides?.length??0} local overrides`:'Base pattern'}</strong><button type="button" onClick={()=>{if(section.parts.length>=256||clips.length>=512){setMessage('This section is full.');return;}const next={...structuredClone(part),id:uid(),name:`${part.name} linked variation`,linkedBaseId:part.linkedBaseId??part.id,linkOverrides:part.linkOverrides??[],linkRemoved:part.linkRemoved??[]};const clip={id:uid(),partId:next.id,repeats:1};updateSection(section.id,current=>({...current,parts:[...current.parts,next],clips:[...sectionClips(current),clip]}));setActivePartId(next.id);setActiveClipId(clip.id);}}>Create linked variation</button>{part.linkedBaseId&&<><button type="button" onClick={()=>updatePart(part.id,current=>({...current,linkedBaseId:undefined,linkOverrides:undefined,linkRemoved:undefined}))}>Detach variation</button><button type="button" onClick={()=>{if(!confirm('Replace the base groove with this variation? Other linked variants inherit the changed base while keeping local overrides.'))return;try{const next=editLinkedPart({...section,parts:section.parts.map(p=>p.id===part.id?{...p,linkOverrides:[],linkRemoved:[]}:p)},part.linkedBaseId!,base=>({...base,hits:structuredClone(part.hits)}));updateSection(section.id,()=>next);}catch(error){setMessage(error instanceof Error?error.message:'The base could not be updated.');}}}>Update base from variation</button><button type="button" onClick={()=>{const base=section.parts.find(p=>p.id===part.linkedBaseId);if(base)updatePart(part.id,current=>({...current,hits:structuredClone(base.hits)}));}}>Reset local changes</button></>}</div><SongBuilderPlayability key={part.id} part={part} onChange={next=>updatePart(part.id,()=>next)}/><div className="song-builder-hit-tools"><span>{selectedHit && selectedCell ? `${VOICE_LABEL[selectedCell.instrument]} · step ${selectedCell.step + 1}` : "Select a hit to edit its dynamics and articulation."}</span><label>Velocity<input type="range" min={1} max={127} value={selectedHit?.velocity ?? (selectedHit?.ghost ? 38 : selectedHit?.accent ? 118 : 86)} disabled={!selectedHit} onChange={(event) => changeSelectedHit((hit) => ({ ...hit, velocity: Number(event.target.value) }))} /></label><label className="song-builder-check"><input type="checkbox" checked={selectedHit?.ghost ?? false} disabled={!selectedHit} onChange={(event) => changeSelectedHit((hit) => ({ ...hit, ghost: event.target.checked }))} /> Ghost note</label><label>Articulation<select value={selectedHit?.articulation ?? "normal"} disabled={!selectedHit} onChange={(event) => setSelectedArticulation(event.target.value as SongHitArticulation)}><option value="normal">Normal</option><option value="flam">Flam</option><option value="drag">Drag</option><option value="buzz">Buzz roll</option><option value="roll">Measured roll</option><option value="choke">Cymbal choke</option><option value="foot-splash">Hi-hat foot splash</option></select></label><label>Sticking<select value={selectedHit?.sticking ?? ""} disabled={!selectedHit} onChange={(event) => changeSelectedHit((hit) => ({ ...hit, sticking: event.target.value ? event.target.value as "R" | "L" : undefined }))}><option value="">None</option><option value="R">Right hand</option><option value="L">Left hand</option></select></label></div>
              <details className="song-builder-creative"><summary>Design a variation</summary><div className="song-builder-tool-fields">{([['Density',variationDensity,setVariationDensity],['Complexity',variationComplexity,setVariationComplexity],['Fill intensity',variationFill,setVariationFill]] as const).map(([label,value,setter])=><label key={label}>{label} · {value}%<input type="range" min={0} max={100} value={value} onChange={e=>setter(Number(e.target.value))}/></label>)}</div><button type="button" onClick={()=>{setVariationPreview(creativeVariation(part,variationDensity,variationComplexity,variationFill,variationSeed));setVariationSeed(n=>n+1);}}>Generate preview</button>{variationPreview&&<><SongBuilderNoteChanges before={part} after={variationPreview}/><p>{part.hits.length} original notes → {variationPreview.hits.length} variation notes. Original pattern stays unchanged.</p><p>{variationPreview.hits.slice(0,16).map(hit=>`${VOICE_LABEL[hit.instrument]} ${hit.step+1}`).join(' · ')}</p><button type="button" disabled={!["idle","finished"].includes(playbackMode)} onClick={()=>void previewSource(variationPreview)}>Audition variation</button><button type="button" onClick={()=>{if(section.parts.length>=256||clips.length>=512){setMessage('This section is full. Add another section first.');return;}clearPreview();const next=variationPreview;const clip={id:uid(),partId:next.id,repeats:1};updateSection(section.id,current=>({...current,parts:[...current.parts,next],clips:[...sectionClips(current),clip]}));setActiveClipId(clip.id);setActivePartId(next.id);setVariationPreview(null);}}>Insert editable variation</button><button type="button" onClick={()=>{clearPreview();setVariationPreview(null);}}>Discard preview</button></>}</details><div className="song-builder-actions"><label>Variation<select value={grooveVariation} onChange={(event) => setGrooveVariation(event.target.value as GrooveVariation)}><option value="snare-shift">Shift snare backbeat</option><option value="hat-lift">Add hi-hat offbeats</option><option value="half-time">Half-time feel</option><option value="double-time">Double-time hats</option></select></label><button className="button-secondary" type="button" onClick={createPatternVariation}>Create editable variation</button><button className="button-secondary" type="button" onClick={() => updatePart(part.id, (current) => ({ ...current, hits: [] }))}>Clear pattern</button><button className="button-secondary" type="button" onClick={removePattern}>Remove pattern</button></div>
            </> : <p>Select a clip or add a pattern to edit its notes.</p>}
          </section>

          <section className="card song-builder-source-panel" aria-label="Grooves and fills">
            <div><span className="eyebrow">Start from a groove</span><h2>Borrow a pocket.</h2><p>Choose a built-in or saved custom groove or fill. Inserted patterns become independent and editable.</p></div>
            <section className="song-builder-fill-assistant" aria-label="Meter matched fill suggestions">
              {part&&<div><strong>Section boundary ideas</strong><p>Append an independent one-measure transition at the end of this section.</p><div className="song-builder-actions">{(['fill','break','pickup','crash'] as const).map(kind=><button type="button" key={kind} onClick={()=>{if(section.parts.length>=256||clips.length>=512){setMessage('This section is full. Add another section first.');return;}const next=boundaryTransition(part,kind);const clip={id:uid(),partId:next.id,repeats:1};updateSection(section.id,current=>({...current,parts:[...current.parts,next],clips:[...sectionClips(current),clip]}));setActiveClipId(clip.id);setActivePartId(next.id);setMessage(`${next.name} appended to ${section.name}. Edit it in the grid or Undo to remove it.`);}}>Append {kind}</button>)}</div></div>}
              {part&&<details className="song-builder-phrase-ending"><summary>Phrase-aware section ending</summary><p>Build the last measure from the selected pattern, then optionally add an independent accent to the next section’s first downbeat.</p><div className="song-builder-tool-fields"><label>Fill window<select value={phraseFillWindow} onChange={event=>setPhraseFillWindow(event.target.value as typeof phraseFillWindow)}><option value="one-beat">Last beat</option><option value="two-beats">Last two beats</option><option value="measure">Whole measure</option></select></label><label className="song-builder-check"><input type="checkbox" checked={preservePhraseBackbeat} onChange={event=>setPreservePhraseBackbeat(event.target.checked)}/>Preserve source snare backbeats</label><label className="song-builder-check"><input type="checkbox" checked={addArrivalAccent} disabled={!nextSectionHasPattern} onChange={event=>setAddArrivalAccent(event.target.checked)}/>Add kick + crash to next section downbeat</label></div><button type="button" onClick={generatePhraseEnding}>Generate ending preview</button>{phraseEndingPreview&&<><SongBuilderNoteChanges before={part} after={phraseEndingPreview}/><p>The last measure of “{part.name}” becomes a crescendo fill with {phraseFillWindow==='measure'?'a full measure':phraseFillWindow==='two-beats'?'two beats':'one beat'} of fill.</p><button type="button" onClick={()=>void previewSource(phraseEndingPreview)} disabled={!['idle','finished'].includes(playbackMode)}>Audition phrase ending</button><button type="button" onClick={insertPhraseEnding}>Append ending to section</button><button type="button" onClick={()=>setPhraseEndingPreview(null)}>Discard preview</button></>}</details>}
              <div><strong>Fill assistant · {activeMeter}</strong><span>{part ? `Suggestions placed after “${part.name}” in ${section?.name ?? "this section"}.` : "Choose a pattern to get fills that match its meter."}</span></div>
              <div className="song-builder-fill-tools"><label>Fill length<select value={transitionLength} onChange={(event) => setTransitionLength(event.target.value as typeof transitionLength)}><option value="keep">Keep pattern length</option><option value="one-bar">Trim to one bar</option></select></label><label>Context before and after<select value={transitionContextBars} onChange={event=>setTransitionContextBars(Number(event.target.value) as 1|2)}><option value={1}>1 measure each</option><option value={2}>Up to 2 measures each</option></select></label><label>Fill density · {transitionFillDensity}%<input type="range" min={0} max={100} step={5} value={transitionFillDensity} onChange={event=>setTransitionFillDensity(Number(event.target.value))}/></label><label>Fill complexity · {transitionFillComplexity}%<input type="range" min={0} max={100} step={5} value={transitionFillComplexity} onChange={event=>setTransitionFillComplexity(Number(event.target.value))}/></label><label className="song-builder-check"><input type="checkbox" checked={transitionCrash} onChange={(event) => setTransitionCrash(event.target.checked)} /> Add accented crash ending</label></div><p>Contextual fills adapt the copied ending to the selected groove and next downbeat. The source fill stays unchanged.</p>
              {fillSuggestions.length ? <div className="song-builder-fill-suggestions">{fillSuggestions.map((suggestion) => <article key={suggestion.source.id}><div><strong>{suggestion.source.name} · {suggestion.score}% fit</strong><small>{suggestion.source.beats} quarter-note beats · {suggestion.source.subdivision === 12 ? "triplet" : `${suggestion.source.subdivision}-step`} grid</small><small>{suggestion.detail}</small></div><button type="button" disabled={!part || !['idle', 'finished'].includes(playbackMode)} onClick={() => void previewFillInContext(suggestion.source)}>Play in context</button><button type="button" onClick={() => insertFillTransition(suggestion.source)}>Insert fill</button></article>)}</div> : <p className="song-builder-hint">{part ? `No saved or built-in fills match ${activeMeter} yet. You can still search and insert any pattern below.` : "Select or add a pattern to see matching fills here."}</p>}
            </section>
            <div className="song-builder-source-filters"><label>Search grooves<input type="search" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Rock, shuffle, tom fill…" /></label><label>Show<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | "fills")}><option value="all">All grooves and fills</option><option value="fills">Fills and transitions</option></select></label></div>
            <details className="song-builder-extra"><summary>Pattern filters</summary><div className="song-builder-tool-fields">{([['meter','Meter',[...new Set(sources.map(item=>meterSignature(item.meter??'4/4')))]],['duration','Duration (beats)',[...new Set(sources.map(item=>String(item.beats)))]],['grid','Subdivision',['4','8','12','16']],['level','Difficulty',['Beginner','Intermediate','Advanced']],['voice','Drum voice',BUILDER_VOICES],['collection','Collection',['all','favorites','recent']]] as const).map(([key,label,values])=><label key={key}>{label}<select value={browserFilters[key]} onChange={e=>setBrowserFilters(current=>({...current,[key]:e.target.value}))}>{key!=='collection'&&<option value="">Any</option>}{values.map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}</div><button type="button" onClick={()=>setBrowserFilters({meter:'',duration:'',grid:'',level:'',voice:'',collection:'all'})}>Reset filters</button></details>{meterFitPreview&&<section className="song-builder-meter-fit-preview" aria-label="Meter adaptation preview"><strong>{meterFitPreview.source.name} · meter fit preview</strong><p>{meterFitPreview.source.meter??`${meterFitPreview.source.beats}/4`} · {meterFitPreview.source.beats} beats · {meterFitPreview.source.hits.length} hits → {meterFitPreview.adapted.meter} · {meterFitPreview.adapted.beats} beats · {meterFitPreview.adapted.hits.length} hits. Notes are resampled onto the source subdivision; multi-bar patterns stay close to their original bar count. The source groove is unchanged.</p><div className="song-builder-actions"><button type="button" disabled={!['idle','finished'].includes(playbackMode)} onClick={()=>void previewSource(meterFitPreview.adapted)}>Audition fitted version</button><button type="button" onClick={()=>insertSource(meterFitPreview.adapted)}>Insert fitted copy</button><button type="button" onClick={()=>setMeterFitPreview(null)}>Discard preview</button></div></section>}
          <div className="song-builder-source-list">{visibleSources.map((source) => <article key={source.id}><div><strong>{source.name}</strong><small>{source.style} · {source.meter} · {source.defaultBpm} BPM</small><p>{source.description}</p></div><div className="song-builder-source-buttons"><button type="button" aria-pressed={favorites.includes(source.id)} aria-label={`Favorite ${source.name}`} onClick={()=>{const next=favorites.includes(source.id)?favorites.filter(id=>id!==source.id):[...favorites,source.id];setFavorites(next);try{localStorage.setItem('drum-hero:pattern-favorites',JSON.stringify(next));}catch{/* Optional preference. */}}}>{favorites.includes(source.id)?'★':'☆'}</button><button className={previewSourceId === source.id ? "previewing" : ""} type="button" aria-pressed={previewSourceId === source.id} disabled={!['idle', 'finished'].includes(playbackMode)} onClick={() => void previewSource(source)}>{previewSourceId === source.id ? "Stop preview" : "Preview"}</button><button type="button" onClick={() => insertSource(source)}>Insert source meter</button><button type="button" onClick={() => previewMeterFit(source)}>Preview fit to section</button></div></article>)}{!visibleSources.length && <p>No patterns match that search.</p>}</div>
            <p className="song-builder-hint">Your custom grooves are loaded from Grooves and update here when saved.</p>
          </section>
        </div>}

        <section className="card song-builder-notation" aria-label="Notation preview and download">
          <div className="song-builder-section-heading"><div><span className="eyebrow">Print and share</span><h2>Read the arrangement.</h2></div>
            <div className="song-builder-tool-fields"><label>Extract drum part<select value={exportVoice} onChange={e=>setExportVoice(e.target.value as typeof exportVoice)}><option value="all">All drum voices</option>{SONG_INSTRUMENTS.map(voice=><option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label><label><input type="checkbox" checked={includeExportClick} onChange={e=>setIncludeExportClick(e.target.checked)}/>Include metronome in WAV / stems</label><label><input type="checkbox" checked={includeExportBacking} onChange={e=>setIncludeExportBacking(e.target.checked)}/>Include backing track in WAV / stems</label></div><div className="song-builder-export-actions"><label>Show<select value={previewScope} onChange={(event) => { setPreviewScope(event.target.value); setPreviewPage(0); }}><option value="song">Full song</option>{song.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" onClick={()=>void exportProjectFile()}>Complete project backup</button><button type="button" onClick={()=>void copyPlaybackLink()}>Copy playback link</button>{shareLinkDraft&&<label className="song-builder-share-link">Playback link<input readOnly value={shareLinkDraft} onFocus={event=>event.currentTarget.select()}/></label>}<button type="button" onClick={()=>projectFileInputRef.current?.click()}>Import project backup</button><button type="button" onClick={() => void exportSheet("png")} disabled={!notationBars.length}>PNG</button><button type="button" onClick={() => void exportSheet("pdf")} disabled={!notationBars.length}>PDF</button><button type="button" onClick={() => void exportSheet("midi")} disabled={!notationBars.length}>MIDI</button><button type="button" onClick={() => void exportSheet("musicxml")} disabled={!notationBars.length}>MusicXML</button><button type="button" onClick={() => void exportSheet("wav")} disabled={!notationBars.length}>WAV audio</button><button type="button" onClick={() => void exportSheet("stems")} disabled={!notationBars.length}>Aligned stems ZIP</button></div><small>Stem archives support arrangements up to three minutes per export. Choose a section to split a longer song.</small>
          </div>
          <details className="card song-builder-extra song-builder-export-presets"><summary>Reusable chart presets · {builderSettings.exportPresets.length}</summary><p>Save the notation view, page layout, song or section scope, and preferred download format. Section presets use the currently selected section when applied.</p><div className="song-builder-tool-fields"><label>Preset name<input maxLength={40} value={exportPresetNameDraft} onChange={event=>setExportPresetNameDraft(event.target.value)} placeholder="e.g. Rehearsal staff PDF"/></label><label>Preferred download<select value={exportPresetFormat} onChange={event=>setExportPresetFormat(event.target.value as "png"|"pdf")}><option value="pdf">Paginated PDF</option><option value="png">PNG image</option></select></label><button type="button" disabled={!exportPresetNameDraft.trim()} onClick={saveExportPreset}>Save current chart preset</button></div>{builderSettings.exportPresets.length>0&&<div className="song-builder-tool-fields"><label>Saved preset<select value={exportPresetChoice} onChange={event=>setExportPresetChoice(event.target.value)}><option value="">Choose a preset…</option>{builderSettings.exportPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.name} · {preset.view} · {preset.scope} · {preset.format.toUpperCase()}</option>)}</select></label><button type="button" disabled={!exportPresetChoice} onClick={()=>applyExportPreset(false)}>Apply preset</button><button type="button" disabled={!exportPresetChoice||!notationBars.length} onClick={()=>applyExportPreset(true)}>Apply and download</button></div>}</details>
          <SongBuilderExportPreparation song={song} bars={notationBars} view={notationView} options={builderSettings.notation} onChange={notation=>changeBuilderSettings(current=>({...current,notation}))}/><div className="song-builder-view-switch" role="group" aria-label="Notation view"><button type="button" aria-pressed={notationView === "tab"} onClick={() => setNotationView("tab")}>Drum tab</button><button type="button" aria-pressed={notationView === "staff"} onClick={() => setNotationView("staff")}>Percussion staff</button><span>{notationView === "tab" ? "K kick · S snare · H hi-hat · T tom · C crash · ◆ accent" : "Kick low · snare center · tom middle · cymbals cross-headed"}</span></div>
          {notationView==='staff'&&<div className="song-builder-staff-edit"><label><input type="checkbox" checked={staffEditMode} onChange={event=>setStaffEditMode(event.target.checked)}/> Edit notes on the staff</label>{staffEditMode&&<><p>Choose a voice, then click the note’s time position in a measure. The grid step controls provide the same edit for keyboard and screen reader users.</p><div className="song-builder-tool-fields"><label>Drum voice<select value={staffEditVoice} onChange={event=>setStaffEditVoice(event.target.value as SongInstrument)}>{BUILDER_VOICES.map(voice=><option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label><label>Measure<select value={Math.min(Math.max(0,staffEditBarIndex),Math.max(0,notationBars.length-1))} onChange={event=>{const index=Number(event.target.value);setStaffEditBarIndex(index);setStaffEditStep(0);}}>{notationBars.map((bar,index)=><option key={`${bar.index}:${index}`} value={index}>{bar.number} · {bar.sectionName} · {bar.partName}</option>)}</select></label><label>Grid step<input type="number" min={1} max={Math.max(1,Math.round((notationBars[Math.min(staffEditBarIndex,notationBars.length-1)]?.beats??4)*(notationBars[Math.min(staffEditBarIndex,notationBars.length-1)]?.subdivision??8)/4))} value={staffEditStep+1} onChange={event=>setStaffEditStep(Math.max(0,Number(event.target.value)-1))}/></label><button type="button" disabled={!notationBars.length} onClick={()=>toggleStaffNote(staffEditBarIndex,staffEditStep)}>Toggle selected note</button></div></>}</div>}
          <div className="song-builder-notation-controls" aria-label="Notation layout controls">
            <label>Measures per page<select value={builderSettings.notation.barsPerPage} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, barsPerPage: Number(event.target.value) as 4 | 6 | 8 } }))}><option value={4}>4 · spacious</option><option value={6}>6 · standard</option><option value={8}>8 · compact</option></select></label>
            <label>Measures per line<select value={builderSettings.notation.barsPerLine??2} onChange={event=>changeBuilderSettings(current=>({...current,notation:{...current.notation,barsPerLine:Number(event.target.value) as 1|2|3|4}}))}>{[1,2,3,4].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <label className="song-builder-check"><input type="checkbox" checked={builderSettings.notation.sectionLineBreaks??false} onChange={event=>changeBuilderSettings(current=>({...current,notation:{...current.notation,sectionLineBreaks:event.target.checked}}))}/>Start sections on a new line</label>
            <label>Page breaks<select value="" onChange={event=>{const id=event.target.value;if(id)changeBuilderSettings(current=>({...current,notation:{...current.notation,pageBreakBeforeSections:[...new Set([...(current.notation.pageBreakBeforeSections??[]),id])]}}));}}><option value="">Start new page before…</option>{song.sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
            {!!builderSettings.notation.pageBreakBeforeSections?.length&&<button type="button" onClick={()=>changeBuilderSettings(current=>({...current,notation:{...current.notation,pageBreakBeforeSections:[]}}))}>Clear page breaks</button>}
            <label>Cymbal noteheads<select value={builderSettings.notation.cymbalNoteheads} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, cymbalNoteheads: event.target.value as "cross" | "diamond" } }))}><option value="cross">Cross</option><option value="diamond">Diamond</option></select></label>
            <label>Beam grouping<select value={builderSettings.notation.beamGrouping} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, beamGrouping: event.target.value as typeof current.notation.beamGrouping } }))}><option value="auto">Automatic by grid</option><option value="2">Pairs</option><option value="3">Triplets</option><option value="4">Groups of four</option><option value="off">No beams</option></select></label>
            <label className="song-builder-check"><input type="checkbox" checked={builderSettings.notation.showSticking} onChange={(event) => changeBuilderSettings((current) => ({ ...current, notation: { ...current.notation, showSticking: event.target.checked } }))} /> Show hand sticking</label>
            <label className="song-builder-check"><input type="checkbox" checked={builderSettings.notation.showArticulationMarks!==false} onChange={event=>changeBuilderSettings(current=>({...current,notation:{...current.notation,showArticulationMarks:event.target.checked}}))}/> Show accents and articulation marks</label>
            <details className="song-builder-staff-setup"><summary>Adjust percussion staff positions</summary><p>Move each voice in half-space steps. The preview, PNG, PDF and MusicXML use the same placements.</p><div className="song-builder-tool-fields">{BUILDER_VOICES.map(voice=>{const position=builderSettings.notation.staffPositions?.[voice]??0;return <label key={voice}>{VOICE_LABEL[voice]} · {position===0?"center":position>0?"down":"up"}<select aria-label={`${VOICE_LABEL[voice]} staff position`} value={position} onChange={event=>changeBuilderSettings(current=>({...current,notation:{...current.notation,staffPositions:{...current.notation.staffPositions,[voice]:Number(event.target.value)}}}))}>{Array.from({length:17},(_,index)=>index-8).map(value=><option key={value} value={value}>{value===0?"Center":`${Math.abs(value)} half-space${Math.abs(value)===1?"":"s"} ${value<0?"above":"below"}`}</option>)}</select></label>;})}</div><button type="button" onClick={()=>changeBuilderSettings(current=>({...current,notation:{...current.notation,staffPositions:{kick:3,snare:-1,rimshot:-1,tom:-2,hihat:-5,openhat:-5,ride:-4,crash:-6,cowbell:-3,shaker:-7,tambourine:-6}}}))}>Reset standard drum layout</button></details>
          </div>
          <div className="song-builder-sheet-wrap"><div className="song-builder-sheet-frame"><canvas ref={previewCanvasRef} width={SHEET_WIDTH} height={SHEET_HEIGHT} tabIndex={0} role="img" aria-label={`${song.title}, ${notationView === "tab" ? "drum tab" : "percussion staff"} notation, page ${currentPage + 1} of ${pageCount}. ${notationView==='staff'&&staffEditMode?`Click to edit ${VOICE_LABEL[staffEditVoice]} notes; use the controls above for keyboard access.`:'Click a measure to seek; use the text score or Seek measure slider for keyboard access.'}`} onClick={event=>{const bounds=event.currentTarget.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width*event.currentTarget.width,y=(event.clientY-bounds.top)/bounds.height*event.currentTarget.height;if(notationView==='staff'&&staffEditMode){const cell=notationStaffStepAtPoint(notationBars,currentPage,builderSettings.notation,x,y);if(cell){toggleStaffNote(cell.barIndex,cell.step);return;}}const index=notationBarAtPoint(notationBars,currentPage,builderSettings.notation,x,y);if(index!==undefined){const target=previewScope==='song'?index:fullSongBars.indexOf(fullSongBars.filter(bar=>bar.sectionId===previewScope)[index]);if(target>=0)seekToBar(target);}}} /></div></div>
          <SongBuilderAccessibleScore bars={notationBars} onSeek={bar=>{const selectedIndex=notationBars.indexOf(bar);const signature=(item:typeof bar)=>item.sectionId===bar.sectionId&&item.sectionBar===bar.sectionBar&&item.clipId===bar.clipId&&item.partId===bar.partId;const occurrence=notationBars.slice(0,selectedIndex+1).filter(signature).length-1;const matches=fullSongBars.filter(signature);const target=matches[Math.max(0,occurrence)];if(target)seekToBar(target.index);}}/>
          {pageCount > 1 && <div className="song-builder-pages"><button type="button" onClick={() => setPreviewPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0}>Previous page</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" onClick={() => setPreviewPage((current) => Math.min(pageCount - 1, current + 1))} disabled={currentPage === pageCount - 1}>Next page</button></div>}
          <p className="song-builder-status" role="status">{message || `${notationBars.length} measures · ${savedMessage}`}</p>
        </section>
      </div> : <section className="card song-builder-welcome"><span className="eyebrow">Drum Hero Song Builder</span><h2>Write the part you hear.</h2><p>Create a song from a blank page, or open a song from the shared library. Add sections, build drum patterns, arrange repeats, then listen back or follow the moving playhead.</p><div className="song-builder-welcome-actions"><Link className="button" href="/song-library">Open Song Library</Link><a href="#song-builder-new-title" className="button-secondary">Create a new song</a></div><p>New song title and artist fields are in the left panel.</p></section>}
    </div>
  </div>;
}
