# Sight reading

Web entry: `/sight-reading`, the Practice navigation menu, or the search launcher. Native entry: Learn or Trainer → Sight reading.

## Exercise rules

`lib/sight-reading.ts` and `ios/DrumHero/Sources/Domain/SightReading.swift` implement generator version 1. Both use the same unsigned 32-bit LCG, high-bit bounded choices, voice ordering, and rhythmic templates. `shared/sight-reading-v1.json` pins matching musical fingerprints across TypeScript and Swift, including seed zero and UInt32.max. Retain version 1 if introducing a later generator; saved attempts identify their generator version and seed.

Tempo is always quarter-note BPM. Exercises can run for 1, 2, 4, or 8 bars; setup estimates performance time, and the default is now four bars. A 7/8 bar lasts 3.5 quarter notes and groups eighths as 2+2+3. Triplets are available in quarter-note meters; 7/8 uses straight sixteenths. Beginner seeds alternate quarter- and eighth-note exercises. Every bar has at least one target; templates allow at most one hand voice plus kick at a grid position. Groove presets include rock, shuffle, a closing fill, half-time, funk syncopation, and Latin patterns. Varied phrases also offer light, balanced, and dense note-density settings; balanced retains the original v1 templates. Accents are visual cues, with no velocity requirement.

The web and iOS scores show multiple numbered measures per staff line with a clock-driven playhead and automatic score following. Web notation is drawn once per exercise so cursor updates do not redraw the staff. Setup enables target drum playback by default; the target and metronome play during the pass, while learner hits alone are captured for scoring. Target-audio attempts are scored as assisted and stay out of first-reading trends. Turning target playback off restores the silent first-read flow. Each new attempt stores its target-playback choice; older records remain readable.

## Attempt lifecycle

Learners can choose a cold read or a five- or ten-second silent preview, no count-in or one or two count-in bars, and optional spoken counting. Count-in pulses can use quarter, eighth, or sixteenth-note subdivisions; the live count displays matching syllables and accents reflect the meter grouping (including 3+2 in 5/4 and 2+2+3 in 7/8). Subdivision syllables stop at the scored pass; the metronome continues at quarter-note beats. Preview and count-in never play the target. One complete uninterrupted pass is a first reading. Retrying or restarting after cancellation is practice; spoken note descriptions mark the attempt assisted. Reference playback is available only after completion. Browser visibility changes, native backgrounding/audio interruptions, navigation, and selected MIDI disconnection stop active work without a completed reading result.

Scoring uses the existing 50 ms Great / 100 ms Good windows, one matched target per input hit, misses for unmatched targets, and penalties for extras. It scores drum voice and timing, with independent hands/feet notation. Reading attempts never enter Trainer mastery or ordinary pattern bests.

## Local data

Web keeps the latest 100 attempts under `drum-hero:sight-reading:v1`, using the existing learner-profile suffix convention. This key is included automatically in full local backups. Native stores its latest 100 attempts under `drumHero.sightReading.v1.default`; the native app currently has one learner. Native version 2 progress backups add an optional `sightReadingAttempts` field. Old backups without that field preserve existing reading history during restore.

History includes generator version, seed, level, tempo, meter, bar count, subdivision settings, input/profile, preview and count-in settings, first-reading/practice/assisted classification, score, accuracy, average offset, timing spread, early/late hit counts, phrase fingerprint, misses, extras, and fluency by rhythmic family. Assignment title, due date, and target are recorded when applicable. Trends compare first readings at the selected level, tempo range, meter, and input; practice and assisted attempts stay separate. New phrases avoid recently displayed phrases and recent attempts when possible. Phrase memory is stored locally per learner on web and on-device for iOS. No reading history is uploaded.

## Guided practice and sharing

Voice focus generates notes for one selected drum voice. Rhythm focus limits the exercise to quarter notes, eighth notes, sixteenths, or triplets where that level supports them. Web and Swift generators share fixtures for each groove family and retain the same grid, meter, and scoring rules. Existing histories that predate these fields load with mixed voice, mixed rhythm, and varied phrase defaults.

After three first readings at the same setup and input, the app uses the average accuracy to suggest a next step. At 88% or higher, it raises tempo by five BPM, then offers a denser rhythm or the next level at the tempo ceiling. Below 65%, it simplifies the rhythm first, then lowers tempo by five BPM when the current rhythm is already at its easiest. Learners apply suggestions manually. The optional tempo ladder advances by five BPM only after an 85% pass; retrying the phrase remains a practice attempt.

Results include a note-by-note review with bar, voice, beat, rating, and timing offset, plus fluency for quarter notes, eighth notes, sixteenths, triplets, syncopation, and rests. Learners can replay the reference, replay their own captured hits, compare the two passes sequentially, and slow either pass down. A 3-, 5-, or 10-exercise practice set reports its first-read average accuracy and timing spread; each exercise remains a separate local attempt. Learners can repeat their weakest bar twice as a practice drill. A six-step learning path introduces pulse, subdivisions, and odd meters; each step advances after an 80% first reading. Learners can save one local goal for a target meter, rhythm focus, tempo, minimum accuracy, and number of successful first readings. The browser stores goals beside each learner's history; native stores its goal locally and includes it in native progress backups.

Optional adaptive progression makes one small setting change after each first reading using accuracy and timing spread: it can adjust rhythm density, tempo, and preview length. Practice retries and assisted attempts do not drive it. The progress map aggregates first-read accuracy by meter, rhythm focus, and tempo band using the current level and input filters. Every missed or extra note can launch a comparison of its bar, with the selected beat marked on the staff. Reading cues can show the full legend and pad names, a compact legend, or standard notation with visually numbered pads; accessible pad labels remain available. Focus mode hides setup and progress panels while keeping the score, transport, pads, and results available.

Before scores are revealed, learners can rate their confidence from 1 to 5 or skip. Confidence is saved with the attempt and progress insights compare it with accuracy; it never changes a score or trend classification. Results and first-read trends also report pulse recovery: whether correct notes in the next two beats stayed inside the existing timing window after an error. An error-focused two-bar drill targets the most common error in the latest read, or a recurring weak rhythm family from recent first reads, and offers an unseen transfer phrase as practice. Transfer checks are classified as practice and excluded from first-read trends.

MIDI timing calibration stores the median correction, median absolute tap variation, and calibration date per device. Setup and results summarize connection state, mapped voices, correction, and calibration age; calibration older than 30 days is marked for review. A phrase-variety summary counts unique first-read phrases, meters, meter/rhythm pairs, and styles, and can launch a fresh phrase for the least-practiced supported pair. A saved practice goal can launch a five-phrase study path with an easier warm-up, a tempo build, a lower-performing earlier skill for review, the target setting, and a small stretch. The ordinary next-step coach also surfaces a weak skill after a week without practice.

Notation has an accessible counted description listing each beat, voice, accent cue, and rest. MIDI readiness checks ask the learner to strike each mapped voice. An eight-click snare calibration estimates the input timing correction and stores it for the selected device. The estimate combines device delay with the learner's tap consistency; physical kit checks remain useful for confirming the result.

Teacher assignments carry the exercise seed and settings, a title, optional due date, and minimum accuracy. Students can open a link or paste a `DH-SA1` code, then share a `DH-SUB1` result code back for teacher review. The older seed/settings code remains readable. Web can print the score; iOS can prepare a printable PDF. No learner identity or cloud service is required. MIDI mapping supports per-voice manual assignment and pad learning; timing correction is stored per connected device on web and iOS.

## Verification

- `npm test -- tests/unit/sight-reading.test.ts tests/unit/ear-training.test.ts`
- `npm run typecheck` and `npm run build`
- `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright test tests/e2e/sight-reading.spec.ts --project=chromium --project=webkit --project=mobile-chromium`
- Native `ContentAndRulesTests` verify shared fixtures, cancellation/classification, a full scored pass, backup compatibility, and a notation image matrix.
- Native `testSightReadingPreviewCancelAndBackground` covers Learn navigation, preview, cancellation, and background interruption on iPhone/iPad. Its screenshots are retained in the test result bundle.

Physical MIDI kit validation remains manual: confirm per-pad mapping, saved timing correction, multi-voice strikes, input loss mid-pass, and reconnect/retry classification on each intended hardware setup. Simulator and mocked browser MIDI tests do not certify physical latency or device compatibility.
