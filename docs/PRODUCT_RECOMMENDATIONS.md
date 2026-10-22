# Product recommendations

This roadmap reflects the current working implementation. It separates user-facing improvements from the real-device and educator reviews that still require people and equipment outside the codebase.

## Current working baseline

- A first-session choice on Home that routes beginners to a short kit tour, touch/keyboard pads, or an electronic-kit pattern.
- Guided lesson notes, saved practice checkpoints, and an editable daily plan informed by local Trainer and Song Library history.
- Full local backup and restore for settings, progress, songs, grooves, samples, and saved takes.
- A per-device timing calibration flow and input confidence feedback for MIDI and audio, plus an optional local repeatability log for comparing three calibration runs.
- An opt-in offline download for the main learning and practice pages, built-in sounds, and the production app shell.
- Shared-device learner profiles for lesson progress and Trainer history, plus exact lesson/pattern assignments, score-based completion evidence, assignment-pack import/export, roster CSV export, and private account roster sync with review and revision checks.
- A classroom overview with assignment status, overdue work, recent scored accuracy, and last-practice date. Learners or guardians can explicitly export a compact progress report for import on another device; imported reports remain local, can complete matching assignments, and exclude recordings.
- Original synthesized play-along loops with rock, funk, and shuffle feels; plus up to six imported local stems with shared tempo sync, per-stem downbeat and volume, and user-entered source/rights notes. Stem audio and separate rights-note JSON files can be exported; the app does not verify rights. [Play-Along audio](PLAY_ALONG_AUDIO.md) describes limits and release checks.
- The local audio manager includes Song Library recordings, Trainer takes, and Song Builder/Play-Along backing audio with size display, original-file export, and confirmed deletion. Audio remains independent of the offline page cache.
- Optional private progress sync with revision review and recovery, separate from local recordings and Song Library sharing.
- Trainer variations for seated/no-kick practice and one-voice/reduced-reach practice on web and iOS, with a reviewable, export-gated, deletable local player/educator feedback log. Adapted results are excluded from full-pattern mastery comparisons; educator validation is still needed.
- Device calibration trials have local export review and deletion controls. Real-device results are not signed off until a human completes the physical-device matrix.
- Classroom report export has learner/guardian permission, report removal, and profile deletion controls; [classroom report policy](CLASSROOM_DATA_POLICY.md) describes the included fields and limits.
- Offline download version notice, storage estimate, and cleanup of an incomplete update while preserving the last completed download.
- Song Library discovery by BPM range, voice, subdivision, feel, and fills; rule-based smart collections; eight original catalog songs; three guided learning paths; local reference-audio attachments with pitch-preserving speed control; MIDI exchange; practice-only groove variations; configurable limb isolation; setlist readiness summaries; shared arrangement comments; local drummer usability feedback; full eight-voice song-session scoring; per-voice progress evidence; and field/section-level cloud conflict resolution.
- Native iOS includes an offline Song Library for the eight original examples and opens each playable section in Practice. Personal Song Library projects, external MIDI/audio input and calibration still need native implementation.
- A global `Ctrl/⌘ K` launcher for routes, lessons, built-in grooves, rudiments, saved songs, and direct Song Library searches; a flexible curriculum map that links to lesson checkpoints; and silent, step-through visual technique demonstrations in each lesson.
- A permission-gated JSON timing diagnostics report with browser capabilities and aggregate timing metrics. It excludes audio, device identifiers, hit-level records, and personal notes.
- Reviewed translations for newer page introductions and selected navigation, curriculum, demo, backing-audio, feedback, and diagnostic controls in English, Spanish, French, German, and Brazilian Portuguese. Other supported locales use English fallback for this newer web copy. Native Song Library labels have string-catalog entries for all 24 locales. The [localization and accessibility audit](LOCALIZATION_ACCESSIBILITY_AUDIT.md) has not yet been signed off by human reviewers.

## Next priorities

1. **Validate timing on real devices.** Run the calibration and scoring matrix in [device validation](DEVICE_VALIDATION.md) across iOS Safari, Android Chrome, desktop browsers, MIDI, and audio inputs. The local trial log helps compare repeatability; it is not proof of device accuracy.
2. **Finish authored play-along audio exchange.** Imported stems can now be mixed locally with rights notes, while section boundaries and tempo changes follow the arrangement form. Add a portable package for the form, audio, and attribution together, plus reviewed, shareable authored stem sets.
3. **Review adaptive practice and Song Library workflows with drummers.** Use the local feedback forms to collect observations about clarity, movement, song discovery, notation, editing, setlist preparation, and access needs. Then review those observations with players and educators before treating the workflows as validated. See [adaptive practice](ADAPTIVE_PRACTICE.md).
4. **Validate offline upgrades in production browsers.** Use the [offline release checklist](OFFLINE_VALIDATION.md) to confirm route refresh, internal navigation, storage pressure, and update recovery while preserving progress on Safari, Chromium, and installed iOS PWAs. The in-app version notice does not replace a device matrix.
5. **Extend native iOS parity.** The app now browses and practises sections from its eight bundled song examples. Add personal Song Library projects, MIDI/audio input setup and calibration, then consider a shared web/iOS backup format with explicit import review. The iOS Trainer supports two adaptations; physical input-device validation remains open.
6. **Expand classroom reporting carefully.** Named learner reports now support explicit file-based sharing across devices with a learner/guardian permission step and local removal. If adding account-based class groups, define teacher ownership, learner consent, retention, and revocation before syncing any report data.
7. **Complete the localization and accessibility audit.** Review interactive Trainer, Kit Guide, dialogs, storage and error states, RTL layouts, screen readers, keyboard focus, text scaling, and the new Play-Along stem workflow. Use [the manual audit matrix](LOCALIZATION_ACCESSIBILITY_AUDIT.md); do not mark translated strings as accepted without a fluent reviewer.

## Product constraints

- Practice recordings, reference audio, and audio input stay on the device unless the learner exports a file. Progress sync is explicit and never includes audio recordings.
- Imported play-along backing audio stays in local browser storage. It is independent of the downloadable offline page cache and is not removed when that cache is cleared.
- Timing scores describe a measured input profile; results should not be compared across different browsers, input routes, or hardware without a fresh calibration.
- Play-along audio must have documented rights and clear attribution. Imported backing audio remains local; synthesized loops are original app output.
- Adaptations are optional practice variations, not medical or ergonomic advice.
