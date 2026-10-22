import type { Locale } from "./locale-core";
import { catalogs } from "./locales";
import { lessons } from "./curriculum";
import { lessonGuides } from "./lesson-guides";
import { builtInTeachingPatterns as builtInOrder, localizedPattern, teachingCopy as copy } from "./teaching-pattern-display";

export function localizedLessonGuide(id: string, locale: Locale) {
  const row = copy[locale];
  const lesson = lessons.find((item) => item.id === id);
  if (!lesson) return undefined;
  if (locale === "en") return lessonGuides[id];
  const source = catalogs[locale];
  return { idea: source[`lesson.${id}.summary`] ?? lesson.summary, steps: row.steps };
}

export function localizedLessonGoal(id: string, index: number, locale: Locale): string {
  const lesson = lessons.find((item) => item.id === id);
  if (locale === "en") return lesson?.goals[index] ?? "";
  const goalKey = `lesson.${id}.goal.${index + 1}`;
  return catalogs[locale][goalKey] ?? "";
}

export function teachingContentTranslations(): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const locale of Object.keys(catalogs) as Locale[]) {
    const target: Record<string, string> = {};
    for (const lesson of lessons) {
      const guide = localizedLessonGuide(lesson.id, locale)!;
      target[`lesson.${lesson.id}.idea`] = guide.idea;
      guide.steps.forEach((step, index) => { target[`lesson.${lesson.id}.step.${index + 1}`] = step; });
      lesson.goals.forEach((_, index) => {
        target[`lesson.${lesson.id}.goal.${index + 1}`] = localizedLessonGoal(lesson.id, index, locale) || guide.steps[index % guide.steps.length];
      });
    }
    for (const pattern of builtInOrder) {
      const localized = localizedPattern(pattern, locale);
      target[`pattern.${pattern.id}.name`] = localized.name;
      target[`pattern.${pattern.id}.description`] = localized.description;
      target[`pattern.${pattern.id}.focus`] = "focus" in localized ? String(localized.focus ?? localized.description) : localized.description;
      target[`pattern.${pattern.id}.style`] = "style" in localized ? String(localized.style ?? "") : copy[locale].rudiment;
      if ("coaching" in localized && localized.coaching) target[`pattern.${pattern.id}.coaching`] = String(localized.coaching);
    }
    result[locale] = target;
  }
  return result;
}

export function teachingContentKeys(): string[] {
  return [...lessons.flatMap((lesson) => [
    `lesson.${lesson.id}.idea`,
    ...lesson.goals.map((_, index) => `lesson.${lesson.id}.goal.${index + 1}`),
    ...[1, 2, 3].map((index) => `lesson.${lesson.id}.step.${index}`),
  ]), ...builtInOrder.flatMap((pattern) => [
    `pattern.${pattern.id}.name`, `pattern.${pattern.id}.description`, `pattern.${pattern.id}.focus`, `pattern.${pattern.id}.style`,
    ...( "coaching" in pattern && pattern.coaching ? [`pattern.${pattern.id}.coaching`] : []),
  ])];
}

export const teachingTranslations = teachingContentTranslations();
