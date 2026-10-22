import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import "./globals.css";
import { ProgressProvider } from "@/components/ProgressProvider";
import { SiteFooter, SkipLink } from "@/components/LocalizationProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { directionFor, isLocale, resolveAcceptLanguage, resolveLocale } from "@/lib/locale-core";
import type { LanguagePreference } from "@/lib/locale-core";
import { loadCatalog } from "@/lib/catalog-loader";
import { cookies, headers } from "next/headers";
import { translateRequest } from "@/lib/request-locale";
import { OfflineNavigationGuard } from "@/components/OfflineNavigationGuard";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "Drum Hero", template: "%s | Drum Hero" },
    description: await translateRequest("meta.app.description"),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/drum-hero-logo.svg", apple: "/drum-hero-logo.svg" }
  };
}

export const viewport: Viewport = { themeColor: "#e85348" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const saved = cookieStore.get("drumHeroLanguage")?.value;
  const initialPreference: LanguagePreference = saved === "auto" ? "auto" : saved && isLocale(saved) ? saved : "auto";
  const initialLocale = initialPreference === "auto" ? resolveAcceptLanguage(requestHeaders.get("accept-language")) : resolveLocale(initialPreference);
  const initialCatalog = await loadCatalog(initialLocale);
  return <html lang={initialLocale} dir={directionFor(initialLocale)}><body className={`${display.variable} ${body.variable}`}>
    <ProgressProvider initialLocale={initialLocale} initialPreference={initialPreference} initialCatalog={initialCatalog}><OfflineNavigationGuard /><SkipLink /><SiteHeader />{children}<SiteFooter />
    </ProgressProvider>
  </body></html>;
}
