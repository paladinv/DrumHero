import fs from "node:fs/promises";

const filenames = process.argv.slice(2);
if (!filenames.length) {
  console.error("Usage: npm run device-validation:summary -- ./device-log-1.json [./device-log-2.json ...]");
  process.exitCode = 2;
} else {
  const trialsById = new Map();
  let inputTrialCount = 0;
  for (const filename of filenames) {
    const document = JSON.parse(await fs.readFile(filename, "utf8"));
    if (!document || document.format !== "drum-hero-device-validation-v1" || !Array.isArray(document.trials) || document.trials.length > 50) {
      throw new Error(`Unsupported or invalid device-validation log: ${filename}`);
    }
    for (const trial of document.trials) {
      inputTrialCount += 1;
      if (!trial || typeof trial.id !== "string" || !trial.id || trial.id.length > 100 ||
          typeof trial.recordedAt !== "string" || !Number.isFinite(Date.parse(trial.recordedAt)) ||
          typeof trial.browser !== "string" || !trial.browser || trial.browser.length > 100 ||
          typeof trial.platform !== "string" || !trial.platform || trial.platform.length > 100 ||
          typeof trial.inputProfile !== "string" || !trial.inputProfile || trial.inputProfile.length > 200 ||
          typeof trial.setup !== "string" || trial.setup.length > 120 ||
          !["wired", "bluetooth", "built-in", "other"].includes(trial.output) ||
          !Number.isFinite(trial.correctionMs) || trial.correctionMs < -200 || trial.correctionMs > 200) {
        throw new Error(`Invalid calibration trial in ${filename}`);
      }
      const previous = trialsById.get(trial.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(trial)) throw new Error("Conflicting records use the same trial ID.");
      trialsById.set(trial.id, trial);
    }
  }

  const groups = new Map();
  for (const trial of trialsById.values()) {
    const inputProfile = trial.inputProfile.split(":", 1)[0] || "unknown";
    const key = JSON.stringify([
      trial.browser.trim().toLowerCase(),
      trial.platform.trim().toLowerCase(),
      inputProfile.trim().toLowerCase(),
      trial.setup.trim().toLowerCase(),
      trial.output
    ]);
    const trials = groups.get(key) ?? [];
    trials.push({ ...trial, inputProfile });
    groups.set(key, trials);
  }

  const orderedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const summary = {
    format: "drum-hero-device-validation-summary-v1",
    importedLogCount: filenames.length,
    uniqueTrialCount: trialsById.size,
    duplicateTrialCount: inputTrialCount - trialsById.size,
    configurations: orderedGroups.map(([, trials], index) => {
      const ordered = trials.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      const batches = [];
      for (let offset = 0; offset + 2 < ordered.length; offset += 3) {
        const batch = ordered.slice(offset, offset + 3);
        const corrections = batch.map((trial) => Math.round(trial.correctionMs)).sort((a, b) => a - b);
        batches.push({
          correctionsMs: corrections,
          spreadMs: corrections[2] - corrections[0],
          firstDate: batch[0].recordedAt.slice(0, 10),
          lastDate: batch[2].recordedAt.slice(0, 10),
          spanHours: Math.round((Date.parse(batch[2].recordedAt) - Date.parse(batch[0].recordedAt)) / 3_600_000 * 10) / 10
        });
      }
      return {
        configuration: `configuration-${String(index + 1).padStart(2, "0")}`,
        browser: ordered[0].browser,
        platform: ordered[0].platform,
        inputProfile: ordered[0].inputProfile,
        output: ordered[0].output,
        trialCount: ordered.length,
        triplets: batches,
        unpairedTrials: ordered.length % 3
      };
    }),
    notes: [
      "User-entered setup labels and individual trial IDs are omitted from this summary.",
      "Compare triplets only when the physical setup was held constant; spread is descriptive and is not a hardware accuracy certification."
    ]
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
