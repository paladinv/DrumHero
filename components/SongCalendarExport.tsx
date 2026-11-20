"use client";

import { useState } from "react";
import type { SongLibraryState } from "@/lib/song-library";

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function calendarDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function SongCalendarExport({ state }: { state: SongLibraryState }) {
  const [message, setMessage] = useState("");
  const exportCalendar = () => {
    const events = state.schedules.flatMap(schedule => {
      const song = state.songs.find(item => item.id === schedule.songId);
      const start = calendarDate(schedule.dueAt);
      if (!song || !start) return [];
      const end = calendarDate(new Date(new Date(schedule.dueAt).getTime() + 30 * 60_000).toISOString());
      const description = [schedule.note, `Practice ${song.title} by ${song.artist}`, "Drum Hero Song Library"].filter(Boolean).join("\n");
      return [
        "BEGIN:VEVENT",
        `UID:${escapeCalendarText(schedule.id)}@drumhero.local`,
        `DTSTAMP:${calendarDate(new Date().toISOString())}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeCalendarText(`Practice: ${song.title}`)}`,
        `DESCRIPTION:${escapeCalendarText(description)}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Song Library practice reminder",
        "TRIGGER:-PT15M",
        "END:VALARM",
        "END:VEVENT"
      ].join("\r\n");
    });
    if (!events.length) {
      setMessage("Add a valid practice schedule before exporting a calendar.");
      return;
    }
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Drum Hero//Song Library//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR", ""].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "drum-hero-practice-schedule.ics";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported ${events.length} practice reminder${events.length === 1 ? "" : "s"}.`);
  };

  return <section className="song-calendar-export" aria-label="Calendar export">
    <div><h3>Calendar reminders</h3><p>Export scheduled sessions as an iCalendar file with 15-minute reminders. Dates keep their saved timezone offset by converting to UTC.</p></div>
    <button type="button" className="button-secondary" onClick={exportCalendar}>Export .ics calendar</button>
    <p className="song-calendar-export-status" role="status">{message || `${state.schedules.length} scheduled session${state.schedules.length === 1 ? "" : "s"} available.`}</p>
  </section>;
}
