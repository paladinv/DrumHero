export type Level = "Beginner" | "Intermediate" | "Advanced";
export type Instrument = "kick" | "snare" | "hihat" | "tom" | "crash";
export type SongInstrument = Instrument | "openhat" | "ride" | "rimshot" | "cowbell" | "shaker" | "tambourine" | "custom1" | "custom2" | "custom3" | "custom4" | "custom5" | "custom6" | "custom7" | "custom8";
export const SONG_INSTRUMENTS: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine", "custom1", "custom2", "custom3", "custom4", "custom5", "custom6", "custom7", "custom8"];
export type SongHitArticulation = "normal" | "flam" | "drag" | "buzz" | "roll" | "choke" | "foot-splash";
export type MidiArticulation = "closed-hat" | "open-hat" | "pedal-hat" | "foot-splash" | "ride" | "crash" | "rimshot" | "side-stick";
export type SongPartHit = Omit<PatternHit, "instrument" | "articulation"> & { instrument: SongInstrument; velocity?: number; ghost?: boolean; articulation?: SongHitArticulation; sticking?: "R" | "L"; timingOffsetMs?: number };

export type PatternHit = {
  step: number;
  instrument: Instrument;
  /** Optional right/left hand target, used by rudiment practice and notation. */
  sticking?: "R" | "L";
  accent?: boolean;
  /** Target MIDI-like strike strength for a Trainer dynamics exercise. */
  velocityTarget?: number;
  /** Optional engraving override used by notation-first rhythm dictation. */
  flagCount?: number;
  articulation?: "flam" | "drag" | "buzz";
  /** MIDI kit articulation required for this hit when articulation scoring is enabled. */
  midiArticulationTarget?: MidiArticulation;
};

export type PracticePattern = {
  id: string;
  name: string;
  level: Level;
  description: string;
  subdivision: 4 | 8 | 12 | 16 | 20;
  beats: number;
  defaultBpm: number;
  tempoRange: [number, number];
  hits: PatternHit[];
  /** Section ranges that should be scored and summarized as fills. */
  trainerFillStepRanges?: Array<[number, number]>;
};

export type Lesson = {
  id: string;
  order: number;
  level: Level;
  title: string;
  duration: number;
  summary: string;
  goals: string[];
  practicePatternId?: string;
};

export type Rudiment = PracticePattern & { sticking: string; coaching: string };
export type Groove = PracticePattern & { style: string; focus: string; meter?: string; feel?: "straight" | "triplet"; tags?: string[]; songPattern?: { hits: SongPartHit[] } };

export type HitRating = "great" | "good" | "miss" | "extra";
export type RatedHit = {
  instrument: Instrument;
  rating: HitRating;
  offsetMs: number | null;
  velocity?: number;
  /** Target strike strength when the round uses a dynamics exercise. */
  velocityTarget?: number;
  accentTarget?: boolean;
  articulation?: "flam" | "drag" | "buzz";
  /** Tempo-aware grace-note spacing target for flam and drag strokes. */
  articulationSpacingMs?: number;
  /** Marks a deliberate return to the groove after the final fill. */
  transition?: "landing";
  /** Musical role of the target, used to report timing by feel zone. */
  feelZone?: "straight" | "offbeat" | "backbeat" | "fill";
  /** MIDI pad articulation when the connected kit reports separate notes. */
  midiArticulation?: MidiArticulation;
  /** Required MIDI articulation when this hit was a scored target. */
  midiArticulationTarget?: MidiArticulation;
  /** Offset from the start of a round, including early grace-note taps. */
  atMs?: number;
  sustainMs?: number;
  /** Grid step and repetition identify a weak spot for targeted drills. */
  step?: number;
  repetition?: number;
  /** Hand target and hand key used during optional keyboard rudiment checking. */
  handTarget?: "R" | "L";
  handPlayed?: "R" | "L";
};

export type SessionResult = {
  id: string;
  patternId: string;
  patternName: string;
  bpm: number;
  playedAt: string;
  score: number;
  accuracy: number;
  great: number;
  good: number;
  miss: number;
  extra: number;
  maxCombo: number;
};

export type ProgressState = {
  version: 1;
  completedLessons: string[];
  lessonCompletedAt?: Record<string, string>;
  sessions: SessionResult[];
  bestScores: Record<string, number>;
  practiceDates: string[];
  settings: { sound: boolean; preferredBpm: number };
};
