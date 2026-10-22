import { cookies, headers } from "next/headers";
import { isLocale, resolveAcceptLanguage, translateFromCatalog, type Locale } from "./locale-core";
import { loadCatalog } from "./catalog-loader";

export async function getRequestLocale(): Promise<Locale> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const saved = cookieStore.get("drumHeroLanguage")?.value;
  if (saved && isLocale(saved)) return saved;
  return resolveAcceptLanguage(requestHeaders.get("accept-language"));
}

export async function translateRequest(key: string): Promise<string> {
  const locale = await getRequestLocale();
  return translateFromCatalog(locale, await loadCatalog(locale), key);
}
