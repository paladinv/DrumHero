import fs from "node:fs/promises";

const filenames = process.argv.slice(2);
if (!filenames.length) {
  console.error("Usage: npm run trainer-pilot:summary -- ./pilot-export-1.json [./pilot-export-2.json ...]");
  process.exitCode = 2;
} else {
  const notesById = new Map();
  let inputNoteCount = 0;
  for (const filename of filenames) {
    const document = JSON.parse(await fs.readFile(filename, "utf8"));
    if (!document || document.format !== "drum-hero-trainer-player-pilot" || ![1, 2].includes(document.version) || !Array.isArray(document.notes) || document.notes.length > 50) {
      throw new Error(`Unsupported or invalid Trainer pilot export: ${filename}`);
    }
    for (const note of document.notes) {
      inputNoteCount += 1;
      if (!note || typeof note.id !== "string" || !note.id || note.id.length > 100 ||
          typeof note.createdAt !== "string" || !Number.isFinite(Date.parse(note.createdAt)) ||
          !["beginner", "experienced", "teacher"].includes(note.experience) ||
          typeof note.pattern !== "string" || !note.pattern.trim() || note.pattern.length > 160 ||
          !Number.isFinite(note.bpm) || note.bpm < 20 || note.bpm > 300 ||
          !["self", "keyboard", "touch", "midi", "audio-timing", "audio-voices"].includes(note.input) ||
          (note.scoreSource !== undefined && !["built-in", "musicxml", "custom"].includes(note.scoreSource)) ||
          !(note.accuracy === null || (Number.isFinite(note.accuracy) && note.accuracy >= 0 && note.accuracy <= 100)) ||
          !Number.isInteger(note.uncertainDetections) || note.uncertainDetections < 0 || note.uncertainDetections > 10000 ||
          typeof note.clipped !== "boolean" || !["yes", "no", "not-applicable"].includes(note.setupSuccess) ||
          !["yes", "no", "unsure"].includes(note.notationClear) || !["yes", "no", "unsure"].includes(note.feedbackMatches)) {
        throw new Error(`Invalid Trainer pilot note in ${filename}`);
      }
      const previous = notesById.get(note.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(note)) throw new Error("Conflicting records use the same pilot note ID.");
      notesById.set(note.id, note);
    }
  }

  const notes = [...notesById.values()];
  const groups = new Map();
  for (const note of notes) {
    const key = JSON.stringify([note.pattern.trim(), note.input, note.scoreSource ?? "unknown"]);
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }

  const count = (items, key, value) => items.filter(item => item[key] === value).length;
  const percentage = (matched, denominator) => denominator ? Math.round(matched / denominator * 100) : null;
  const reliableScore = note => note.accuracy !== null && !note.clipped && note.uncertainDetections === 0;
  const metrics = (items) => {
    const scoreNotes = items.filter(reliableScore);
    const setupChecked = items.filter(item => item.setupSuccess !== "not-applicable");
    const notationChecked = items.filter(item => item.notationClear !== "unsure");
    const feedbackChecked = items.filter(item => item.feedbackMatches !== "unsure");
    return {
      noteCount: items.length,
      experienceBands: { beginner: count(items, "experience", "beginner"), experienced: count(items, "experience", "experienced"), teacher: count(items, "experience", "teacher") },
      scoreSources: { builtIn: count(items, "scoreSource", "built-in"), musicXml: count(items, "scoreSource", "musicxml"), custom: count(items, "scoreSource", "custom"), unknown: count(items, "scoreSource", undefined) },
      setup: { successful: count(items, "setupSuccess", "yes"), neededHelp: count(items, "setupSuccess", "no"), checked: setupChecked.length, successPercent: percentage(count(items, "setupSuccess", "yes"), setupChecked.length) },
      notation: { clear: count(items, "notationClear", "yes"), unclear: count(items, "notationClear", "no"), checked: notationChecked.length, clearPercent: percentage(count(items, "notationClear", "yes"), notationChecked.length) },
      timingFeedback: { matchedPlayerFeel: count(items, "feedbackMatches", "yes"), didNotMatch: count(items, "feedbackMatches", "no"), checked: feedbackChecked.length, matchedPercent: percentage(count(items, "feedbackMatches", "yes"), feedbackChecked.length) },
      inputQuality: { clippedRounds: count(items, "clipped", true), uncertainRounds: items.filter(item => item.uncertainDetections > 0).length, uncertainHits: items.reduce((sum, item) => sum + item.uncertainDetections, 0) },
      reliableComparableScores: scoreNotes.length,
      meanAccuracyPercent: scoreNotes.length ? Math.round(scoreNotes.reduce((sum, item) => sum + item.accuracy, 0) / scoreNotes.length) : null,
    };
  };

  const summary = {
    format: "drum-hero-trainer-player-pilot-summary-v1",
    importedExportCount: filenames.length,
    uniqueNoteCount: notes.length,
    duplicateNoteCount: inputNoteCount - notes.length,
    overall: metrics(notes),
    patternAndInputGroups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => {
      const [pattern, input, scoreSource] = JSON.parse(key);
      return { pattern, input, scoreSource, ...metrics(items) };
    }),
    notes: [
      "Free-text notes, participant IDs, local note IDs, and exact dates are omitted.",
      "Comparable mean scores exclude clipped rounds, uncertain detections, and self-rated rounds.",
      "This summary is descriptive. It does not set a pass/fail threshold or certify scoring accuracy; review it with participating drummers and educators.",
    ],
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
