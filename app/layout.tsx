import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import "./globals.css";
import { ProgressProvider } from "@/components/ProgressProvider";
import { SiteHeader } from "@/components/SiteHeader";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "Drum Hero", template: "%s | Drum Hero" },
  description: "A focused practice studio for drum technique, timing, grooves, and musical confidence.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/drum-hero-logo.svg", apple: "/drum-hero-logo.svg" }
};

export const viewport: Viewport = { themeColor: "#e85348" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={`${display.variable} ${body.variable}`}>
    <ProgressProvider><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader />{children}</ProgressProvider>
    <footer className="site-footer"><div><strong>Drum Hero</strong><span>Practice deliberately. Play musically.</span></div><p>Your progress stays in this browser. Audio input is optional and processed locally. No account, uploads, or analytics.</p></footer>
  </body></html>;
}
