import type { Catalog, Locale } from "./locale-core";

export async function loadCatalog(locale: Locale): Promise<Catalog> {
  switch (locale) {
    case "en": return (await import("./catalogs/en")).default;
    case "es": return (await import("./catalogs/es")).default;
    case "fr": return (await import("./catalogs/fr")).default;
    case "de": return (await import("./catalogs/de")).default;
    case "pt-BR": return (await import("./catalogs/pt-BR")).default;
    case "it": return (await import("./catalogs/it")).default;
    case "nl": return (await import("./catalogs/nl")).default;
    case "pl": return (await import("./catalogs/pl")).default;
    case "uk": return (await import("./catalogs/uk")).default;
    case "ru": return (await import("./catalogs/ru")).default;
    case "tr": return (await import("./catalogs/tr")).default;
    case "ar": return (await import("./catalogs/ar")).default;
    case "he": return (await import("./catalogs/he")).default;
    case "fa": return (await import("./catalogs/fa")).default;
    case "hi": return (await import("./catalogs/hi")).default;
    case "bn": return (await import("./catalogs/bn")).default;
    case "ur": return (await import("./catalogs/ur")).default;
    case "id": return (await import("./catalogs/id")).default;
    case "vi": return (await import("./catalogs/vi")).default;
    case "th": return (await import("./catalogs/th")).default;
    case "ja": return (await import("./catalogs/ja")).default;
    case "ko": return (await import("./catalogs/ko")).default;
    case "zh-Hans": return (await import("./catalogs/zh-Hans")).default;
    case "zh-Hant": return (await import("./catalogs/zh-Hant")).default;
  }
}
