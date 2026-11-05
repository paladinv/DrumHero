"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { emptySongLibrary, readActiveSongLibrary } from "@/lib/song-library";
import { trainerStorageKey, parseTrainerState } from "@/lib/trainer";
import { buildReviewQueue, type ReviewQueueItem } from "@/lib/review-queue";
import { readTrainerReviewReminders, snoozeTrainerReviewReminder, TRAINER_REVIEW_REMINDERS_EVENT } from "@/lib/trainer-review-reminders";
import type { ProgressState } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";

export type ReviewRecommendation = Pick<ReviewQueueItem, "id" | "kind" | "title" | "reason" | "reasonValues" | "href">;

export function HomeReviewQueue({ profileId, progress, onRecommendation }: {
  profileId: string;
  progress: ProgressState;
  onRecommendation: (item: ReviewRecommendation | null) => void;
}) {
  const { t } = useLocalization();
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const refresh = useCallback(() => {
    let rounds: ReturnType<typeof parseTrainerState>["rounds"] = [];
    try { rounds = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))).rounds; } catch { /* Song and lesson reviews remain available. */ }
    const reminders = readTrainerReviewReminders(profileId);
    try { setItems(buildReviewQueue(progress, rounds, readActiveSongLibrary(), Date.now(), reminders)); } catch { setItems(buildReviewQueue(progress, rounds, emptySongLibrary(), Date.now(), reminders)); }
  }, [profileId, progress]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    const update = () => refresh();
    window.addEventListener("storage", update);
    window.addEventListener("drum-hero:learner-profile-change", update);
    window.addEventListener("drum-hero:trainer-state-import", update);
    window.addEventListener("drum-hero:trainer-change", update);
    window.addEventListener("drum-hero:song-library-change", update);
    window.addEventListener(TRAINER_REVIEW_REMINDERS_EVENT, update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", update);
      window.removeEventListener("drum-hero:learner-profile-change", update);
      window.removeEventListener("drum-hero:trainer-state-import", update);
      window.removeEventListener("drum-hero:trainer-change", update);
      window.removeEventListener("drum-hero:song-library-change", update);
      window.removeEventListener(TRAINER_REVIEW_REMINDERS_EVENT, update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);

  useEffect(() => { onRecommendation(items[0] ?? null); }, [items, onRecommendation]);

  if (!items.length) return null;
  return <section className="home-review-queue card" aria-labelledby="home-review-heading">
    <div className="section-heading"><div><span className="eyebrow">{t("A short refresher")}</span><h2 id="home-review-heading">{t("Ready to review")}</h2></div><span>{items.length} {t(items.length === 1 ? "review" : "reviews")}</span></div>
    <p>{t("Pick up a skill or song section that would benefit from another pass.")}</p>
    <ul>
      {items.map((item) => <li key={item.id}>
        <div><strong>{t(item.title)}</strong><span>{t(item.reason, item.reasonValues)}</span><small>{t(item.kind === "song" ? "Song Library" : item.kind === "lesson" ? "Lesson skill" : item.id.startsWith("trainer-reminder:") ? "Trainer reminder" : "Trainer timing")}</small></div>
        <div className="home-review-actions"><Link className="button-secondary" href={item.href}>{t("Review")}</Link>{item.id.startsWith("trainer-reminder:") && <><button type="button" className="button-secondary" onClick={() => snoozeTrainerReviewReminder(profileId, item.id.slice("trainer-reminder:".length), 1)}>{t("Snooze 1 day")}</button><button type="button" className="button-secondary" onClick={() => snoozeTrainerReviewReminder(profileId, item.id.slice("trainer-reminder:".length), 7)}>{t("Snooze 1 week")}</button></>}</div>
      </li>)}
    </ul>
  </section>;
}
