"use client";

import { useRef, useState, type ReactNode } from "react";
import type { PracticePattern } from "@/lib/types";
import { trainerPatternMusicXml } from "@/lib/trainer-midi";

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

export function TrainerScoreCard({ pattern, bpm, feel, focus, children }: {
  pattern: PracticePattern;
  bpm: number;
  feel: string;
  focus: string;
  children: ReactNode;
}) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");

  const print = () => {
    const svg = scoreRef.current?.querySelector("svg.trainer-notation")?.outerHTML;
    if (!svg) { setMessage("The score is not ready to print."); return; }
    const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : `${pattern.beats}/4`;
    const description = [meter, `${bpm} BPM`, feel, focus].filter(Boolean).join(" · ");
    const documentText = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(pattern.name)} · Drum Hero practice card</title><style>
      @page{size:landscape;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#171714;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      header{display:flex;align-items:baseline;justify-content:space-between;gap:20px;border-bottom:2px solid #2a6658;padding-bottom:8px;margin-bottom:18px}
      h1{font-size:22px;margin:0}header p{margin:0;color:#4b514d;font-weight:650}.description{margin:12px 0 18px;color:#444}
      svg{display:block;width:100%;height:auto;max-height:180mm;overflow:visible}.trainer-notation-staff,.trainer-notation-bar{stroke:#a99e92;stroke-width:1}.trainer-notation-bar{stroke-width:1.5}
      .trainer-notation-cymbal{fill:none;stroke:#2a6658;stroke-width:2.4;stroke-linecap:round}.trainer-notation-drum{fill:#252724;stroke:#252724;stroke-width:1.2}
      .trainer-notation-stem,.trainer-notation-flag{fill:none;stroke:#252724;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}.trainer-notation-beam{stroke:#252724;stroke-width:2.6;stroke-linecap:round}
      .trainer-notation-label,.trainer-notation-count,.trainer-notation-sticking,.trainer-notation-articulation,.trainer-notation-accent{fill:#5f625d;font-family:system-ui,sans-serif;font-size:9px;text-anchor:middle}
      .trainer-notation-label{text-anchor:start;font-size:8px}.trainer-notation-count{font-size:9px}.trainer-notation-sticking,.trainer-notation-articulation,.trainer-notation-accent{fill:#2a6658;font-size:11px;font-weight:800}
      .trainer-notation-rest-symbol{fill:#252724;font-family:serif;font-size:27px;text-anchor:middle}.trainer-notation-subdivision{stroke:#c7c0b6;stroke-width:.65}
      .trainer-notation-muted-voice{opacity:.35}.trainer-notation-rest-region{fill:#f8e9e2;stroke:#bb533b;stroke-width:1;stroke-dasharray:3 3}
      .trainer-notation-region-label{fill:#8c3325;font:800 8px system-ui,sans-serif;text-anchor:middle}.trainer-notation-ghost{opacity:.58}
      footer{margin-top:20px;border-top:1px solid #aaa;padding-top:8px;color:#555;font-size:11px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><header><h1>${escapeHtml(pattern.name)}</h1><p>${escapeHtml(description)}</p></header><p class="description">${escapeHtml(pattern.description)}${"sticking" in pattern && pattern.sticking ? ` Sticking: ${escapeHtml(String(pattern.sticking))}.` : ""}</p>${svg}<footer>Drum Hero · Follow the staff notation. Generated practice card; confirm feel and sticking with your teacher.</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150))</script></body></html>`;
    const popup = window.open("", "drum-hero-score-card", "popup,width=1100,height=800");
    if (!popup) { setMessage("Allow pop-ups to print or save this card as PDF."); return; }
    popup.opener = null;
    popup.document.open();
    popup.document.write(documentText);
    popup.document.close();
    setMessage("Print dialog opened. Choose Save as PDF to keep a copy.");
  };

  const exportMusicXml = () => {
    try {
      const blob = trainerPatternMusicXml(pattern, bpm);
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      const filename = pattern.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trainer-pattern";
      anchor.href = url; anchor.download = `${filename}.musicxml`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${pattern.name} exported as MusicXML.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Trainer score could not be exported as MusicXML.");
    }
  };

  return <section className="trainer-score-card">
    <div ref={scoreRef}>{children}</div>
    <div className="trainer-score-card-actions"><button type="button" className="button-secondary" onClick={print}>Print practice card / save PDF</button><button type="button" className="button-secondary" onClick={exportMusicXml}>Export this score as MusicXML</button><span>{pattern.name} · {bpm} BPM · {feel} · {focus}</span></div>
    {message && <small role="status">{message}</small>}
  </section>;
}
