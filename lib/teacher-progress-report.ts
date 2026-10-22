import { lessons } from "./curriculum";

export const TEACHER_PROGRESS_REPORT_KEY = "drum-hero:teacher-progress-reports:v1";
export const TEACHER_PROGRESS_REPORT_FORMAT = "drum-hero-learner-progress-report-v1";
const MAX_REPORTS = 100;
const MAX_EVENTS_PER_REPORT = 100;
const learnerIdPattern = /^[a-z0-9-]{1,80}$/i;
const lessonIds = new Set(lessons.map((lesson) => lesson.id));

export type SharedPracticeEvidence = {
  id: string;
  patternId: string;
  bpm: number;
  accuracy: number;
  playedAt: string;
  source: "practice" | "trainer";
};

export type LearnerProgressReport = {
  format: typeof TEACHER_PROGRESS_REPORT_FORMAT;
  version: 1;
  reportId: string;
  learner: { id: string; name: string };
  exportedAt: string;
  completedLessonIds: string[];
  practiceEvents: SharedPracticeEvidence[];
};

function parseReport(value: unknown): LearnerProgressReport | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const learner = record.learner as Record<string, unknown> | null;
  if (record.format !== TEACHER_PROGRESS_REPORT_FORMAT || record.version !== 1 || typeof record.reportId !== "string" || !/^[a-z0-9-]{1,100}$/i.test(record.reportId) ||
    !learner || typeof learner !== "object" || typeof learner.id !== "string" || !learnerIdPattern.test(learner.id) || learner.id === "default" ||
    typeof learner.name !== "string" || !learner.name.trim() || learner.name.length > 60 || typeof record.exportedAt !== "string" || !Number.isFinite(Date.parse(record.exportedAt)) ||
    !Array.isArray(record.completedLessonIds) || !Array.isArray(record.practiceEvents)) return null;

  const completedLessonIds = [...new Set(record.completedLessonIds.filter((id): id is string => typeof id === "string" && lessonIds.has(id)))].slice(0, lessons.length);
  const seen = new Set<string>();
  const practiceEvents = record.practiceEvents.flatMap((entry): SharedPracticeEvidence[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id || item.id.length > 120 || seen.has(item.id) || typeof item.patternId !== "string" || !item.patternId || item.patternId.length > 120 ||
      !Number.isFinite(item.bpm) || Number(item.bpm) < 40 || Number(item.bpm) > 200 || !Number.isFinite(item.accuracy) || Number(item.accuracy) < 0 || Number(item.accuracy) > 100 ||
      typeof item.playedAt !== "string" || !Number.isFinite(Date.parse(item.playedAt)) || (item.source !== "practice" && item.source !== "trainer")) return [];
    seen.add(item.id);
    return [{ id: item.id, patternId: item.patternId, bpm: Number(item.bpm), accuracy: Number(item.accuracy), playedAt: item.playedAt, source: item.source }];
  }).slice(0, MAX_EVENTS_PER_REPORT);

  return {
    format: TEACHER_PROGRESS_REPORT_FORMAT,
    version: 1,
    reportId: record.reportId,
    learner: { id: learner.id, name: learner.name.trim().slice(0, 60) },
    exportedAt: record.exportedAt,
    completedLessonIds,
    practiceEvents,
  };
}

export function readLearnerProgressReport(raw: string): LearnerProgressReport | null {
  if (raw.length > 500_000) return null;
  try { return parseReport(JSON.parse(raw)); } catch { return null; }
}

export function readImportedProgressReports(raw: string | null): LearnerProgressReport[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    const reports = value.flatMap((item): LearnerProgressReport[] => {
      const report = parseReport(item);
      return report ? [report] : [];
    });
    const unique = new Map<string, LearnerProgressReport>();
    for (const report of reports) if (!unique.has(report.reportId)) unique.set(report.reportId, report);
    return [...unique.values()].sort((left, right) => right.exportedAt.localeCompare(left.exportedAt)).slice(0, MAX_REPORTS);
  } catch { return []; }
}

export function mergeImportedProgressReport(reports: LearnerProgressReport[], report: LearnerProgressReport): LearnerProgressReport[] {
  if (reports.some((item) => item.reportId === report.reportId)) return reports;
  return [report, ...reports].sort((left, right) => right.exportedAt.localeCompare(left.exportedAt)).slice(0, MAX_REPORTS);
}

export function sharedEvidenceForLearner(reports: LearnerProgressReport[], learnerId: string) {
  const learnerReports = reports.filter((report) => report.learner.id === learnerId);
  const latestById = new Map<string, SharedPracticeEvidence>();
  for (const report of learnerReports) {
    for (const event of report.practiceEvents) {
      const previous = latestById.get(event.id);
      if (!previous || event.playedAt > previous.playedAt) latestById.set(event.id, event);
    }
  }
  return {
    completedLessonIds: [...new Set(learnerReports.flatMap((report) => report.completedLessonIds))],
    practiceEvents: [...latestById.values()],
    reportCount: learnerReports.length,
    latestExportedAt: learnerReports.reduce<string | null>((latest, report) => !latest || report.exportedAt > latest ? report.exportedAt : latest, null),
  };
}
