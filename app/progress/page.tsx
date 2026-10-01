import type { Metadata } from "next";
import { DataBackupPanel } from "@/components/DataBackupPanel";
import { ProgressDashboard } from "@/components/ProgressDashboard";
export const metadata:Metadata={title:"Progress"};
export default function ProgressPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Your work, visible</span><h1>Progress without <span>pressure.</span></h1><p>Review what you completed and where your timing is improving. Everything below stays only in this browser.</p></header><ProgressDashboard/><DataBackupPanel/></main>}
