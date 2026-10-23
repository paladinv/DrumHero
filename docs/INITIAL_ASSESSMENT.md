# Initial skill assessment

Open **Initial skill assessment** from Home or Progress, or search for it in the web launcher. The optional assessment runs on web and iOS without an account, recording audio, or requesting microphone access. A typical first pass takes about five minutes; setup, replays and retries add time.

## Flow and scoring

Choose keyboard, touch or MIDI, and a full-kit, hands-only or single-voice path. Enable audio and make an unscored hit before beginning. Trainer provides mapping and timing calibration; the assessment reuses those saved corrections. Native keyboard uses the existing touch/keyboard timing correction. The native MIDI correction is currently shared across connected sources.

Content revision 2 in `shared/assessment-v1.json` defines three tiers each for pulse, subdivisions and coordination, plus an optional MIDI dynamics probe. Every playing probe demonstrates one bar, counts four beats, and measures four bars at a fixed 60–90 BPM. Only metronome clicks play during the measured phrase. Assessment input does not add ordinary practice sessions, personal bests or lesson completions. Saved result records stay at format version 1; new diagnostic fields are optional so older results and backups remain readable.

Advance a tier with a score of at least 85 and mean absolute matched-hit error no greater than 60 ms. Existing Great/Good matching windows and extra-hit penalties apply. A failed tier permits one retry; a second failure ends that domain. Skipping ends the current domain without treating higher tiers as failures. Stopping early retains only completed tasks.

Hands-only moves kick targets to tom to keep simultaneous voices distinct. Single-voice omits coordination. Keyboard/touch voice coordination is not evidence of physical limb independence. Adapted results carry their path label and are not compared with full-kit results.

MIDI dynamics measures alternating soft/accented snare strokes, requiring at least 80% matched targets and median accented velocity at least 20 above median soft velocity. At least two velocities in each target class are required; missing or constant velocity reports **Unmeasured**. Native MIDI preserves decoded velocity through an additive callback; existing MIDI clients retain their original callback.

Each assessment selects two listening and two notation questions from a versioned item bank, with a stable balanced form and shuffled choices. Retry probes use a second versioned pattern where the skill allows a meaningful equivalent variation. Listening audio can be replayed. Correct answers appear in results. The bank and thresholds remain product defaults pending educator validation; they are not standardized placement norms. See [the educator pilot guide](ASSESSMENT_PILOT.md).

Backgrounding, input disconnection and audio interruptions discard the active probe without saving partial evidence. Restart demonstrates and counts in again. Changing the web learner resets the flow. Input selection stays fixed within an assessment.

## Results and practice

Results show demonstrated tiers, matched percentage, score, misses, extras, mean absolute timing error, early/late bias, timing spread, dynamics availability, quiz feedback and untested tasks. Recommendations follow the earliest observed unmet prerequisite and explain the evidence with a measurable next goal; omitted domains are not assigned invented scores. With no completed tasks, **Use this starting plan** is unavailable. Learners can export an anonymous educator review copy; it omits the learner name, result date, and MIDI device ID.

Applying a result changes Home's suggested lesson and daily focus without completing lessons. Curriculum-matched practice targets are included in the shared content. Newer, reliable Trainer evidence on the same input profile and adaptation takes precedence for daily focus. Older native rounds lack comparison metadata and are deliberately excluded. Retaking leaves the applied plan intact until a result is explicitly applied.

Web results are stored under the learner-scoped `drum-hero:assessment:v1` key. Native results use `drumHero.assessment.v1`. Retain at most 20 records; when necessary, preserve the explicitly applied baseline and the newest 19 retakes. History supports review, deletion and stopping use of the plan. Deleting the applied result removes its plan reference. Native MIDI corrections are saved per Core MIDI source ID, with the previous shared MIDI correction used as the initial fallback for uncalibrated sources.

Web full backups already carry learner-scoped app settings, including assessments. Native v2 backups add an optional assessment field; older backups without it preserve the current assessment history. Native Trainer records add optional input/adaptation comparison metadata. Cloud sync and web/native backup conversion are not provided for assessment results.

The web `/assessment` route is included in the offline resource manifest; refresh an existing offline download after deployment. Native content and sounds are bundled. New web copy uses the existing translation fallback and native copy follows SwiftUI localization conventions; translations of all new assessment copy still require language review.

## Verification and remaining device work

`shared/assessment-fixtures-v1.json` pins identical TypeScript/Swift scoring cases for timing boundaries, missing/extra hits, negative offsets and velocity contrast. Unit tests cover advancement, skips, validation, recommendations, history retention and backup compatibility. Browser tests cover desktop/mobile layouts, accessibility, keyboard scoring, MIDI loss, profile isolation, applying a plan and interruptions. Native tests cover scoring parity, backup compatibility and simulator assessment flows.

Before a hardware release, manually check USB/Bluetooth MIDI on physical web/iOS devices, saved timing corrections, varied versus constant MIDI velocity, audio route interruptions, external keyboards, VoiceOver and screen-reader timing cues. Check iPhone/iPad layouts with larger text. Simulator and synthetic MIDI checks do not establish physical device latency or educator validity.

### Implementation verification (2026-10-23)

- Production web/offline build, TypeScript checks, assessment ESLint and `git diff --check` passed.
- All 31 assessment unit tests passed, including question-form parity, timing diagnostics, retry variants, invalid variant rejection, legacy result reads, and recommendation comparisons.
- All five Chromium assessment browser tests passed, covering profile isolation, quiz application, interrupted attempts, MIDI disconnects, history deletion, and accessibility checks.
- All seven native assessment unit tests passed. The iPhone quiz/apply/retake UI test passed; the Trainer start/reset regression UI test also passed after scrolling to its lower action row.
- Physical-device MIDI timing, educator review, VoiceOver with external MIDI, large-text layout, and language review remain release checks.
