export const defaultLocale = "en" as const;
export const localeOptions = [
  ["en", "English", "ltr"], ["es", "Español", "ltr"], ["fr", "Français", "ltr"], ["de", "Deutsch", "ltr"],
  ["pt-BR", "Português (Brasil)", "ltr"], ["it", "Italiano", "ltr"], ["nl", "Nederlands", "ltr"], ["pl", "Polski", "ltr"],
  ["uk", "Українська", "ltr"], ["ru", "Русский", "ltr"], ["tr", "Türkçe", "ltr"], ["ar", "العربية", "rtl"],
  ["he", "עברית", "rtl"], ["fa", "فارسی", "rtl"], ["hi", "हिन्दी", "ltr"], ["bn", "বাংলা", "ltr"],
  ["ur", "اردو", "rtl"], ["id", "Bahasa Indonesia", "ltr"], ["vi", "Tiếng Việt", "ltr"], ["th", "ไทย", "ltr"],
  ["ja", "日本語", "ltr"], ["ko", "한국어", "ltr"], ["zh-Hans", "简体中文", "ltr"], ["zh-Hant", "繁體中文", "ltr"]
] as const;
export type Locale = typeof localeOptions[number][0];
export type Direction = "ltr" | "rtl";
export type LanguagePreference = "auto" | Locale;
export type Catalog = Record<string, string>;

const supported = new Set<string>(localeOptions.map(([locale]) => locale));
export function isLocale(value: string): value is Locale { return supported.has(value); }
export function directionFor(locale: Locale): Direction { return localeOptions.find(([id]) => id === locale)?.[2] ?? "ltr"; }

export function resolveLocale(input: string | readonly string[] | null | undefined): Locale {
  const values = typeof input === "string" ? [input] : input ?? [];
  for (const raw of values) {
    if (!raw || typeof raw !== "string") continue;
    try {
      const tag = Intl.getCanonicalLocales(raw.replaceAll("_", "-"))[0];
      if (!tag) continue;
      const parts = new Intl.Locale(tag);
      const lang = parts.language.toLowerCase();
      if (lang === "zh") {
        if (parts.script === "Hant" || ["TW", "HK", "MO"].includes(parts.region ?? "")) return "zh-Hant";
        return "zh-Hans";
      }
      if (lang === "pt") return "pt-BR";
      if (isLocale(lang)) return lang;
    } catch { /* Ignore malformed device and request language tags. */ }
  }
  return defaultLocale;
}

export function resolveAcceptLanguage(header: string | null): Locale {
  if (!header) return defaultLocale;
  const ordered = header.split(",").map((part, order) => {
    const [tag, ...params] = part.trim().split(";");
    const qParam = params.find((param) => param.trim().startsWith("q="));
    const quality = qParam ? Number(qParam.trim().slice(2)) : 1;
    return { tag, quality: Number.isFinite(quality) ? quality : 0, order };
  }).filter((item) => item.quality > 0).sort((a, b) => b.quality - a.quality || a.order - b.order);
  return resolveLocale(ordered.map(({ tag }) => tag));
}

export function translateFromCatalog(locale: Locale, catalog: Catalog, key: string, values?: Record<string, string | number>): string {
  const result = catalog[key] ?? key;
  return result.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

export function translatePlural(locale: Locale, count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, values: Record<string, string | number> = {}): string {
  const category = new Intl.PluralRules(locale).select(count);
  const template = forms[category] ?? forms.other;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? (name === "count" ? count : `{${name}}`)));
}

export function numberingSystemFor(locale: Locale): string | undefined {
  if (locale === "ar") return "arab";
  if (locale === "fa" || locale === "ur") return "arabext";
  if (locale === "bn") return "beng";
  if (locale === "hi") return "deva";
  if (locale === "th") return "thai";
  return undefined;
}

const spokenSubdivisionWords: Record<Locale, { and: string; trip: string; let: string; e: string; a: string }> = {
  en: { and: "and", trip: "trip", let: "let", e: "e", a: "a" }, es: { and: "y", trip: "tri", let: "plet", e: "e", a: "a" },
  fr: { and: "et", trip: "tri", let: "let", e: "e", a: "a" }, de: { and: "und", trip: "tri", let: "ole", e: "e", a: "a" },
  "pt-BR": { and: "e", trip: "tri", let: "ple", e: "e", a: "a" }, it: { and: "e", trip: "tri", let: "plet", e: "e", a: "a" },
  nl: { and: "en", trip: "tri", let: "plet", e: "e", a: "a" }, pl: { and: "i", trip: "tri", let: "let", e: "e", a: "a" },
  uk: { and: "і", trip: "трі", let: "оль", e: "е", a: "а" }, ru: { and: "и", trip: "три", let: "оль", e: "э", a: "а" },
  tr: { and: "ve", trip: "tri", let: "let", e: "e", a: "a" }, ar: { and: "و", trip: "تري", let: "لت", e: "إي", a: "إيه" },
  he: { and: "ו", trip: "טרי", let: "לט", e: "אִי", a: "אֵיי" }, fa: { and: "و", trip: "تری", let: "لت", e: "ای", a: "اَ" },
  hi: { and: "और", trip: "ट्रिप", let: "लेट", e: "ई", a: "ए" }, bn: { and: "ও", trip: "ট্রিপ", let: "লেট", e: "ই", a: "এ" },
  ur: { and: "اور", trip: "ٹرپ", let: "لیٹ", e: "ای", a: "اے" }, id: { and: "dan", trip: "trip", let: "let", e: "e", a: "a" },
  vi: { and: "và", trip: "tri", let: "lét", e: "e", a: "a" }, th: { and: "และ", trip: "ทริป", let: "เล็ต", e: "อี", a: "เอ" },
  ja: { and: "と", trip: "トリ", let: "プレット", e: "イー", a: "エー" }, ko: { and: "앤드", trip: "트립", let: "렛", e: "이", a: "에이" },
  "zh-Hans": { and: "和", trip: "三连", let: "音", e: "一", a: "啊" }, "zh-Hant": { and: "和", trip: "三連", let: "音", e: "一", a: "啊" },
};

export function localizedSpokenCount(locale: Locale, beat: number, suffix = "", beatsOnly = false): string {
  const number = new Intl.NumberFormat(locale, { useGrouping: false, numberingSystem: numberingSystemFor(locale) }).format(beat);
  if (beatsOnly || !suffix) return number;
  const words = spokenSubdivisionWords[locale];
  return suffix === "&" ? words.and : suffix === "trip" ? words.trip : suffix === "let" ? words.let : suffix === "e" ? words.e : suffix === "a" ? words.a : number;
}

export function compatibleSpeechVoice<T extends { lang: string }>(locale: Locale, voices: readonly T[]): T | undefined {
  const normalized = (value: string) => value.toLowerCase().replaceAll("_", "-");
  const requested = normalized(locale);
  const language = requested.split("-")[0];
  return voices.find((voice) => normalized(voice.lang) === requested)
    ?? voices.find((voice) => normalized(voice.lang).split("-")[0] === language);
}

export function languageName(locale: Locale): string { return localeOptions.find(([id]) => id === locale)?.[1] ?? "English"; }
