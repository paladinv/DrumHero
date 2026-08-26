import type { Metadata } from "next";
import { PracticePad } from "@/components/PracticePad";
export const metadata:Metadata={title:"Practice Pad"};
export default async function PracticePage({searchParams}:{searchParams:Promise<{pattern?:string}>}){const params=await searchParams;return <main id="main-content" className="page practice-page"><header className="page-heading"><span className="eyebrow">Interactive timing lab</span><h1>Put every hit <span>in its place.</span></h1><p>Choose a pattern, take the four-count, and play one loop. Keyboard and touch controls produce the same five kit voices.</p></header><PracticePad initialPatternId={params.pattern}/></main>}
