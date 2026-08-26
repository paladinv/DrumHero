export type Level = "Beginner" | "Intermediate" | "Advanced";
export type Instrument = "kick" | "snare" | "hihat" | "tom" | "crash";

export type PatternHit = {
  step: number;
  instrument: Instrument;
  accent?: boolean;
};

export type PracticePattern = {
  id: string;
  name: string;
  level: Level;
  description: string;
  subdivision: 4 | 8 | 16;
  beats: number;
  defaultBpm: number;
  tempoRange: [number, number];
  hits: PatternHit[];
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
export type Groove = PracticePattern & { style: string; focus: string };

export type HitRating = "great" | "good" | "miss" | "extra";
export type RatedHit = {
  instrument: Instrument;
  rating: HitRating;
  offsetMs: number | null;
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
  sessions: SessionResult[];
  bestScores: Record<string, number>;
  practiceDates: string[];
  settings: { sound: boolean; preferredBpm: number };
};

