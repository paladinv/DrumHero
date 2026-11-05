import type { Metadata } from "next";
import { DailyPracticeSession } from "@/components/DailyPracticeSession";
import { translateRequest } from "@/lib/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await translateRequest("Guided practice") };
}

export default function DailyPracticeSessionPage() {
  return <DailyPracticeSession />;
}
