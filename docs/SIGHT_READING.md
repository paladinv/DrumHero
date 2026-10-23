# Sight reading

Web entry: `/sight-reading`, the Practice navigation menu, or the search launcher. Native entry: Learn or Trainer → Sight reading.

## Exercise rules

`lib/sight-reading.ts` and `ios/DrumHero/Sources/Domain/SightReading.swift` implement generator version 1. Both use the same unsigned 32-bit LCG, high-bit bounded choices, voice ordering, and rhythmic templates. `shared/sight-reading-v1.json` pins matching musical fingerprints across TypeScript and Swift, including seed zero and UInt32.max. Retain version 1 if introducing a later generator; saved attempts identify their generator version and seed.

Tempo is always quarter-note BPM. A 7/8 bar lasts 3.5 quarter notes and groups eighths as 2+2+3. Triplets are available in quarter-note meters; 7/8 uses straight sixteenths. Beginner seeds alternate quarter- and eighth-note exercises. Every bar has at least one target; templates allow at most one hand voice plus kick at a grid position. Accents are visual cues, with no velocity requirement.

## Attempt lifecycle

Sounds prepare before the web's ten-second preview. Preview and count-in never play the target. One complete uninterrupted pass is a first reading. Retrying or restarting after cancellation is practice; optional spoken descriptions on web mark the attempt assisted. Reference playback is available only after completion. Browser visibility changes, native backgrounding/audio interruptions, navigation, and selected MIDI disconnection stop active work without a completed reading result.

Scoring uses the existing 50 ms Great / 100 ms Good windows, one matched target per input hit, misses for unmatched targets, and penalties for extras. It scores drum voice and timing, with independent hands/feet notation. Reading attempts never enter Trainer mastery or ordinary pattern bests.

## Local data

Web keeps the latest 100 attempts under `drum-hero:sight-reading:v1`, using the existing learner-profile suffix convention. This key is included automatically in full local backups. Native stores its latest 100 attempts under `drumHero.sightReading.v1.default`; the native app currently has one learner. Native version 2 progress backups add an optional `sightReadingAttempts` field. Old backups without that field preserve existing reading history during restore.

History includes generator version, seed, level, tempo, meter, bar count, subdivision settings, input/profile, first-reading/practice/assisted classification, score, accuracy, average offset, misses, and extras. Trends compare first readings at the selected level, exact tempo, meter, and input profile. No reading history is uploaded.

## Guided practice and sharing

Voice focus generates notes for one selected drum voice. Rhythm focus limits the exercise to quarter notes, eighth notes, sixteenths, or triplets where that level supports them. Groove presets add a rock backbeat, shuffle feel, or a fill at the end of the phrase; they retain the same grid, meter, and scoring rules. Web and Swift generators share fixtures for these settings. Existing histories that predate these fields load with mixed voice, mixed rhythm, and varied phrase defaults.

After three first readings at the same setup and input, the app can suggest a five BPM increase when average accuracy is at least 88%, or a five BPM decrease below 65%. Learners apply suggestions manually. The optional tempo ladder advances by five BPM only after an 85% pass; retrying the phrase remains a practice attempt.

Results include a note-by-note review with bar, voice, beat, rating, and timing offset. Progress insights filter first readings by level, meter, input, and tempo range, with practice and assisted attempts shown separately. Learners can save one local goal for a target meter, rhythm focus, tempo, minimum accuracy, and number of successful first readings. The browser stores goals beside each learner's history; native stores its goal locally and includes it in native progress backups.

Share assignment creates a link or short seed/settings code that regenerates the same phrase. Web accepts pasted codes and prints a score page; iOS shares the same code and can prepare a printable PDF through the system share sheet. The code contains exercise settings and seed only, with no learner or attempt data.

## Verification

- `npm test -- tests/unit/sight-reading.test.ts tests/unit/ear-training.test.ts`
- `npm run typecheck` and `npm run build`
- `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright test tests/e2e/sight-reading.spec.ts --project=chromium --project=webkit --project=mobile-chromium`
- Native `ContentAndRulesTests` verify shared fixtures, cancellation/classification, a full scored pass, backup compatibility, and a notation image matrix.
- Native `testSightReadingPreviewCancelAndBackground` covers Learn navigation, preview, cancellation, and background interruption on iPhone/iPad. Its screenshots are retained in the test result bundle.

Physical MIDI kit validation remains manual: confirm per-pad mapping, saved timing correction, multi-voice strikes, input loss mid-pass, and reconnect/retry classification on each intended hardware setup. Simulator and mocked browser MIDI tests do not certify physical latency or device compatibility.
