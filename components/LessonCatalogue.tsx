"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lessons } from "@/lib/curriculum";
import { lessonGuides, lessonPracticeTargets } from "@/lib/lesson-guides";
import type { Level } from "@/lib/types";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";
import { TechniqueDemonstration } from "./TechniqueDemonstration";

const filters: Array<"All" | Level> = ["All", "Beginner", "Intermediate", "Advanced"];
const CHECKPOINTS_KEY = "drum-hero:lesson-checkpoints:v1";
type Checkpoints = Record<string, boolean[]>;

function parseCheckpoints(raw: string | null): Checkpoints {
  try {
    const value = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(lessons.flatMap((lesson) => {
      const checks = value[lesson.id];
      return Array.isArray(checks) ? [[lesson.id, lesson.goals.map((_, index) => checks[index] === true)]] : [];
    }));
  } catch {
    return {};
  }
}

export function LessonCatalogue({ initialLessonId }: { initialLessonId?: string }) {
  const [filter, setFilter] = useState<"All" | Level>("All");
  const [activeLessonId, setActiveLessonId] = useState<string | null>(() => lessons.some((lesson) => lesson.id === initialLessonId) ? initialLessonId! : null);
  const [checkpoints, setCheckpoints] = useState<Checkpoints>({});
  const [storageReady, setStorageReady] = useState(false);
  const { progress, completeLesson } = useProgress();
  const { t } = useLocalization();

  useEffect(() => {
    const task = window.setTimeout(() => {
      setCheckpoints(parseCheckpoints(window.localStorage.getItem(CHECKPOINTS_KEY)));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    if (!lessons.some((lesson) => lesson.id === initialLessonId)) return;
    setActiveLessonId(initialLessonId!);
    const frame = window.requestAnimationFrame(() => document.getElementById(`lesson-${initialLessonId}`)?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [initialLessonId]);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(checkpoints));
  }, [checkpoints, storageReady]);

  const visible = filter === "All" ? lessons : lessons.filter((lesson) => lesson.level === filter);
  return <>
    <div className="filters" aria-label={t("Filter lessons")}>
      {filters.map((item) => <button key={item} className={filter === item ? "active" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{t(item)}</button>)}
    </div>
    <section className="lesson-list" aria-label="Lessons">
      {visible.map((lesson) => {
        const done = progress.completedLessons.includes(lesson.id);
        const expanded = activeLessonId === lesson.id;
        const checked = checkpoints[lesson.id] ?? lesson.goals.map(() => false);
        const allChecked = checked.length === lesson.goals.length && checked.every(Boolean);
        const guide = lessonGuides[lesson.id];
        const target = lessonPracticeTargets[lesson.id];
        return <article id={`lesson-${lesson.id}`} className={`lesson level-${lesson.level}${expanded ? " lesson-expanded" : ""}`} key={lesson.id}>
          <span className="lesson-order" aria-hidden="true">{String(lesson.order).padStart(2, "0")}</span>
          <div className="lesson-copy">
            <span className="level-mark">{lesson.level} · {lesson.duration} min</span>
            <h3>{t(`lesson.${lesson.id}.title`)}</h3>
            <p>{t(`lesson.${lesson.id}.summary`)}</p>
            <button className="lesson-open button-secondary" type="button" aria-expanded={expanded} onClick={() => setActiveLessonId(expanded ? null : lesson.id)}>
              {t(expanded ? "Close lesson" : done ? "Review lesson" : "Start lesson")}
            </button>
            {expanded && <div className="lesson-guide" id={`lesson-guide-${lesson.id}`}>
              <section aria-labelledby={`lesson-idea-${lesson.id}`}>
                <h4 id={`lesson-idea-${lesson.id}`}>{t("The idea")}</h4>
                <p>{t(`lesson.${lesson.id}.idea`)}</p>
                <ol>{guide.steps.map((_, index) => <li key={index}>{t(`lesson.${lesson.id}.step.${index + 1}`)}</li>)}</ol>
              </section>
              <TechniqueDemonstration lessonId={lesson.id} />
              <fieldset className="lesson-checkpoints">
                <legend>{t("Practice checkpoints")}</legend>
                {lesson.goals.map((goal, index) => <label key={goal}>
                  <input type="checkbox" checked={checked[index] ?? false} onChange={(event) => {
                    const isChecked = event.currentTarget.checked;
                    setCheckpoints((current) => {
                      const next = [...(current[lesson.id] ?? lesson.goals.map(() => false))];
                      next[index] = isChecked;
                      return { ...current, [lesson.id]: next };
                    });
                  }} />
                  <span>{t(`lesson.${lesson.id}.goal.${index + 1}`) || goal}</span>
                </label>)}
              </fieldset>
              <div className="lesson-guide-actions">
                <Link className="button-secondary" href={target.href}>{target.label}</Link>
                <button className="button" type="button" disabled={done || !allChecked} onClick={() => completeLesson(lesson.id)}>{t(done ? "Completed" : "Complete lesson")}</button>
                {!done && !allChecked && <small>{t("Check each item after you can do it comfortably.")}</small>}
              </div>
            </div>}
          </div>
          <div className="lesson-actions">{done ? <span className="done-mark">{t("Completed")}</span> : <span className="lesson-check-count">{checked.filter(Boolean).length}/{lesson.goals.length} {t("checkpoints")}</span>}</div>
        </article>;
      })}
    </section>
  </>;
}
