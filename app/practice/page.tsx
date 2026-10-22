import type { Metadata } from "next";
import { PracticePad } from "@/components/PracticePad";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Practice Pad") }; }
export default async function PracticePage({searchParams}:{searchParams:Promise<{pattern?:string}>}){const params=await searchParams;return <main id="main-content" className="page practice-page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Interactive timing lab"/></span><h1><LocalizedText text="Put every hit in its place."/></h1><p><LocalizedText text="Choose a pattern, take the four-count, and play one loop. Keyboard and touch controls produce the same five kit voices."/></p></header><PracticePad initialPatternId={params.pattern}/></main>}
