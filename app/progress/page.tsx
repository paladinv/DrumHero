import type { Metadata } from "next";
import { DataBackupPanel } from "@/components/DataBackupPanel";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
import { TeacherModePanel } from "@/components/TeacherModePanel";
import { SongOfflinePanel } from "@/components/SongOfflinePanel";
import { PracticeCloudPanel } from "@/components/PracticeCloudPanel";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Progress") }; }
export default function ProgressPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Your work, visible"/></span><h1><LocalizedText text="Progress without pressure."/></h1><p><LocalizedText text="Review what you completed and where your timing is improving. Everything below stays only in this browser unless you opt in to account sync."/></p></header><ProgressDashboard/><TeacherModePanel/><PracticeCloudPanel/><SongOfflinePanel/><DataBackupPanel/></main>}
