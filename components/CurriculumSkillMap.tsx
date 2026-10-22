"use client";

import Link from "next/link";
import { lessons } from "@/lib/curriculum";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";

const skillAreas: Record<string, string> = {
  "meet-the-kit": "Setup and safety",
  "count-the-grid": "Pulse and subdivision",
  "first-backbeat": "Hand-foot coordination",
  "first-fill": "Movement and return",
  "sixteenth-control": "Subdivision control",
  "paradiddle-voices": "Hand control",
  "syncopated-pocket": "Syncopation",
  "linear-fill": "Linear phrasing",
  "limb-independence": "Limb independence",
  "five-four": "Odd meter",
  "dynamic-arc": "Dynamics",
  "three-over-two": "Polyrhythm"
};

export function CurriculumSkillMap() {
  const { progress } = useProgress();
  const { t, formatNumber } = useLocalization();
  const completed = new Set(progress.completedLessons);
  const nextLesson = lessons.find((lesson) => !completed.has(lesson.id));
  const completeCount = lessons.filter((lesson) => completed.has(lesson.id)).length;

  return <section className="curriculum-map card" aria-labelledby="curriculum-map-heading">
    <div className="curriculum-map-heading">
      <div><span className="eyebrow">{t("Suggested sequence")}</span><h2 id="curriculum-map-heading">{t("Curriculum skill map")}</h2></div>
      <strong>{formatNumber(completeCount)} / {formatNumber(lessons.length)} <span>{t("lesson milestones")}</span></strong>
    </div>
    <progress max={lessons.length} value={completeCount} aria-label={`${completeCount} of ${lessons.length} lesson milestones completed`} />
    <p className="curriculum-map-note">{t("This suggested sequence is flexible. Completing a lesson records its checkpoints; it does not grade musical mastery.")}</p>
    <ol className="curriculum-map-list">
      {lessons.map((lesson) => {
        const isDone = completed.has(lesson.id);
        const isNext = !isDone && lesson.id === nextLesson?.id;
        const status = isDone ? "Completed" : isNext ? "Next up" : "Available";
        return <li key={lesson.id} className={`curriculum-map-node${isDone ? " is-complete" : ""}${isNext ? " is-next" : ""}`}>
          <Link href={`/learn?lesson=${encodeURIComponent(lesson.id)}`} aria-label={`${formatNumber(lesson.order)}. ${t(`lesson.${lesson.id}.title`)} — ${t(status)}`}>
            <span className="curriculum-map-node-top"><strong>{formatNumber(lesson.order).padStart(2, "0")}</strong><span className="curriculum-map-status">{t(status)}</span></span>
            <span className="curriculum-map-title">{t(`lesson.${lesson.id}.title`)}</span>
            <span className="curriculum-map-skill">{t(skillAreas[lesson.id] ?? "Practice skill")}</span>
          </Link>
        </li>;
      })}
    </ol>
  </section>;
}
