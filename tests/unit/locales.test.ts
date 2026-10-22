import { describe, expect, it } from "vitest";
import { catalogs, compatibleSpeechVoice, directionFor, isLocale, localeOptions, localizedSpokenCount, messageKeys, numberingSystemFor, phraseKeys, resolveAcceptLanguage, resolveLocale, translate, translatePlural } from "@/lib/locales";
import { lessonContentKeys } from "@/lib/teaching-locales";
import { appMetadataKeys, dashboardToolKeys } from "@/lib/dashboard-locales";
import { patterns, rudiments, lessons } from "@/lib/curriculum";
import { teachingTranslations } from "@/lib/teaching-content-locales";
import { localizedPattern } from "@/lib/teaching-pattern-display";

describe("localization catalogs and language matching", () => {
  it("has a complete source-key catalog for every supported language", () => {
    expect(localeOptions).toHaveLength(24);
    for (const [locale] of localeOptions) {
      for (const key of [...messageKeys, ...phraseKeys, ...lessonContentKeys, ...dashboardToolKeys, ...appMetadataKeys]) expect(catalogs[locale][key].trim(), `${locale}: ${key}`).not.toBe("");
      if (locale !== "en") {
        for (const [index, key] of dashboardToolKeys.entries()) {
          if (index % 2 === 1) expect(catalogs[locale][key], `${locale}: ${key}`).not.toBe(catalogs.en[key]);
        }
        const translated = [...messageKeys, ...phraseKeys].filter((key) => catalogs[locale][key] !== key);
        expect(translated.length, `${locale} translated source strings`).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it("matches ordered browser and regional language tags", () => {
    expect(resolveLocale(["xx-ZZ", "fr-CA", "en-US"])).toBe("fr");
    expect(resolveLocale("pt-PT")).toBe("pt-BR");
    expect(resolveLocale("zh-Hant-HK")).toBe("zh-Hant");
    expect(resolveLocale("zh-TW")).toBe("zh-Hant");
    expect(resolveLocale("zh-CN")).toBe("zh-Hans");
    expect(resolveLocale("zh-SG")).toBe("zh-Hans");
    expect(resolveLocale("not a language")).toBe("en");
  });

  it("honors Accept-Language quality and falls back safely", () => {
    expect(resolveAcceptLanguage("de;q=0.3, ja-JP;q=0.9, es-MX;q=0.8")).toBe("ja");
    expect(resolveAcceptLanguage("fr;q=0, *;q=0.5")).toBe("en");
    expect(resolveAcceptLanguage(null)).toBe("en");
  });

  it("marks right-to-left locales and leaves unsupported tags out", () => {
    for (const locale of ["ar", "he", "fa", "ur"] as const) expect(directionFor(locale)).toBe("rtl");
    expect(isLocale("zh-Hans")).toBe(true);
    expect(isLocale("zh-CN")).toBe(false);
  });

  it("interpolates values and chooses locale plural forms", () => {
    expect(translate("en", "Round {count} of {total}", { count: 2, total: 4 })).toBe("Round 2 of 4");
    expect(translatePlural("en", 1, { one: "{count} day", other: "{count} days" })).toBe("1 day");
    expect(translatePlural("en", 3, { one: "{count} day", other: "{count} days" })).toBe("3 days");
  });

  it("speaks counts with localized numbers and only compatible voices", () => {
    expect(localizedSpokenCount("es", 2, "&", false)).toBe("y");
    expect(localizedSpokenCount("ja", 4, "", true)).toBe("4");
    expect(localizedSpokenCount("ar", 3, "", true)).toBe("٣");
    expect(numberingSystemFor("bn")).toBe("beng");
    const voices = [{ lang: "en-US" }, { lang: "es-MX" }, { lang: "fr-CA" }];
    expect(compatibleSpeechVoice("es", voices)).toEqual(voices[1]);
    expect(compatibleSpeechVoice("de", voices)).toBeUndefined();
  });

  it("ships translated lesson guidance and built-in pattern display strings for every locale", () => {
    const builtIn = [...rudiments, ...patterns.filter((pattern) => !rudiments.some((rudiment) => rudiment.id === pattern.id))];
    const required = [
      ...lessons.flatMap((lesson) => [`lesson.${lesson.id}.idea`, ...lesson.goals.map((_, index) => `lesson.${lesson.id}.goal.${index + 1}`), ...[1, 2, 3].map((index) => `lesson.${lesson.id}.step.${index}`)]),
      ...builtIn.flatMap((pattern) => [`pattern.${pattern.id}.name`, `pattern.${pattern.id}.description`, `pattern.${pattern.id}.focus`, `pattern.${pattern.id}.style`]),
    ];
    for (const [locale] of localeOptions) {
      for (const key of required) expect(teachingTranslations[locale][key]?.trim(), `${locale}: ${key}`).toBeTruthy();
      if (locale !== "en") {
        for (const pattern of builtIn) {
          expect(teachingTranslations[locale][`pattern.${pattern.id}.name`]).not.toBe(pattern.name);
          expect(teachingTranslations[locale][`pattern.${pattern.id}.description`]).not.toBe(pattern.description);
        }
      }
    }
  });

  it("localizes built-in pattern display text without changing identifiers or musical data", () => {
    const original = patterns[0];
    const displayed = localizedPattern(original, "de");
    expect(displayed.id).toBe(original.id);
    expect(displayed.hits).toEqual(original.hits);
    expect(displayed.defaultBpm).toBe(original.defaultBpm);
    expect(displayed.name).not.toBe(original.name);
    const userPattern = { ...original, id: "custom-user", name: "My pocket", description: "User notes", hits: [...original.hits] };
    expect(localizedPattern(userPattern, "ja")).toBe(userPattern);
  });
});
