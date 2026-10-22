# Drum Hero

Drum Hero is a focused drum-learning studio for the browser. It combines a curated beginner-to-advanced curriculum with a playable timing trainer, rudiments, grooves, kit guidance, and private local progress.

## Highlights

- Twelve guided lessons across beginner, intermediate, and advanced levels
- Guided lesson notes with saved practice checkpoints and direct exercise handoffs
- Search launcher for pages, lessons, grooves, rudiments, and saved songs (`Ctrl/⌘ K`), plus a clickable curriculum skill map and silent technique demonstrations
- Five-voice keyboard and touch kit: Kick (`Space`), Snare (`F`), Hi-hat (`J`), Tom (`K`), Crash (`L`)
- Four-count, 40–200 BPM playback, pause/resume/reset, and visible subdivision playhead
- Deterministic Great/Good/Miss/Extra scoring with early/late offsets and combo tracking
- Local recorded drum samples and metronome cues
- Versioned browser-local progress; optional private progress sync and Song Library sharing; microphone permission is optional for Trainer audio input
- Responsive, reduced-motion-aware interface with keyboard and screen-reader support
- Reusable lazy-loaded Three.js drum-kit engine with procedural five-voice kit, articulated hands/sticks, pointer picking, and deterministic hit animation state
- Adjustable 4/8/10/16-repetition Trainer rounds with configurable count-in, self ratings, progressive tempo, and scored keyboard, touch, USB MIDI, or local audio input
- Custom practice routines with per-pattern tempo, repetitions, optional groove-to-fill transitions, and gated accuracy/timing checkpoints; routines travel in setup exports
- A 75-pattern groove library from first backbeats to shuffle, funk, Latin, compound and odd meters, plus groove-to-fill studies
- A local custom groove editor with eighth- and sixteenth-note grids, accents, and direct Trainer and Practice Pad handoff
- A generated C–G bass pulse for 4/4 Practice Pad patterns; Trainer also offers swing, laid-back timing, and sparse click modes
- Full local backup and restore for progress, Trainer settings, songs, custom grooves, imported samples, and recorded song takes
- Home first-session paths for a guided kit tour, touch/keyboard practice, or electronic kit
- Shared-device learner profiles with separate lesson progress and Trainer history, exact lesson/pattern assignments with score evidence, local feedback and roster export, plus optional private account roster sync
- Classroom overview of assignment completion, overdue work, recent accuracy, and last practice, with permission-based learner progress report export/import across devices
- Optional private cloud sync for progress and Trainer history, with conflict review, revision recovery, export, and deletion controls
- Downloadable offline shells for the learning and practice pages, built-in drum sounds, update notices, and storage/integrity controls
- Original synthesized rock, funk, and shuffle loops plus local user-provided backing audio in Play-alongs and Song Builder, with BPM/downbeat alignment and sync; editable forms, tempo maps, section fills, and mix controls
- Seated/no-kick and one-voice Trainer adaptations on web and iOS, excluded from full-pattern mastery comparisons, with a locally reviewable, exportable, and deletable player/educator feedback log
- Device timing repeatability log with review-before-export and deletion controls for comparing three calibrations on the same setup
- Consent-gated timing diagnostics export with browser capabilities and aggregate scores only; it excludes audio, device IDs, hit-by-hit data, and personal notes
- Vitest unit coverage plus Playwright functional, accessibility, responsive, and visual QA

Newer page introductions, curriculum map labels, launcher controls, technique-demo controls, and selected audio, feedback, and diagnostic copy have reviewed translations for English, Spanish, French, German, and Brazilian Portuguese. Other supported locales currently fall back to the English source for newer copy; deeper interactive Trainer and library copy still needs a full locale review.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Native iOS app

The SwiftUI app supports iOS/iPadOS 17+, iPhone, and iPad. Open `ios/DrumHero/DrumHero.xcodeproj` in Xcode and select the DrumHero scheme. Signing is not configured; choose a development team only when installing on a device. The app loads its versioned curriculum from `shared/mobile/v1/drum-content.json` and saves lesson progress and practice locally with SwiftData. Progress can be exported to or restored from a reviewed, versioned JSON backup; it includes lesson checkpoints, practice sessions, best scores, and Trainer rounds, but no recordings. Native Trainer includes seated/no-kick and one-voice options; adapted scores are saved as Trainer rounds and stay out of standard personal bests. MIDI/audio calibration, Song Library, and shared web/iOS backup conversion remain future work.

Regenerate or validate the native content snapshot from the repository root:

```bash
npm run mobile:content:export
npm run mobile:content:validate
```

The Xcode project and its project.yml definition are checked in. See the [mobile use cases](docs/mobile/USE_CASES.md), [test plan](docs/mobile/TEST_PLAN.md), and [implementation plan](docs/mobile/IMPLEMENTATION_PLAN.md). Android parity is planned for API 35+.

## 3D kit engine

`lib/drum-engine.ts` owns the renderer, scene, camera, metre-scale `professional-v2` procedural drumset, kick pedal/beater, hands, sticks, hit mapping, picking, resize handling, and disposal. `lib/drum-dimensions.ts` keeps the conventional 22-inch kick, 14-inch snare, 10/12-inch rack toms, 16-inch floor tom, 14/16/18/20-inch cymbals, 5A stick, and adult hand reference dimensions in one immutable module. `lib/drum-animation.ts` keeps the bounded contact-and-rebound math framework-independent for deterministic unit tests and future trainers. `components/DrumKitCanvas.tsx` imports Three.js only on the client, exposes an imperative `hit(instrument, hand?, velocity?)` handle, supports `view="player"` and `view="showcase"` presets, adds focused-canvas keyboard controls on the Kit Guide, and provides a semantic fallback when WebGL is unavailable. Practice Pad sends accepted hits to the engine alongside its existing scoring/audio path; Kit Guide mounts the larger interactive viewer.

The renderer caps device pixel ratio at 1.5, avoids shadows/post-processing, renders only while hit animation is active, pauses naturally when idle, and disposes listeners, observers, materials, geometry, and renderer on unmount. Reduced-motion preferences shorten the visual response while preserving timing and accessibility.

## Trainer inputs

Open `/trainer`, choose from 100 groove and fill patterns, a rudiment, a saved custom groove, or a song part. Fill practice can play a groove for one, two, or four bars before a compatible fill; choose alternating, paradiddle, or double-stroke sticking and either lead hand. Loop a beat or bar range for focused repetition. The groove library can save reusable groove-to-fill transitions. Trainer step labels show beat and subdivision counts, with optional browser speech for beat or grid counts. Choose 4, 8, 10, or 16 repetitions and a one-, two-, or four-beat count-in. Self-rated rounds pause after each pass for Clean, Needs work, or Missed; scored recaps report accuracy, timing steadiness, hit timing across the phrase, and misses by drum voice. Choose straight, swung, or laid-back timing targets, sparse metronome clicks, and hands-only or feet-only practice. Flam, drag, and buzz rudiments show articulation cues and score their grace strokes. Personal routines save on this device, set tempo and repetitions per pattern, add groove-to-fill transitions, and optionally gate each step on accuracy and timing goals; setup exports carry the routine and any custom or song-part patterns it uses. The tempo ladder lets you set its pass target, step size, and response to a missed target. Guided paths gate each pattern on configurable accuracy and timing goals, while adaptive plans prioritize due review patterns and weak spots. Microphone dynamics can be calibrated per drum voice for ghost taps and accents; input diagnostics show recent peak level and warn when the signal clips. Recording review overlays expected and recorded hit markers on the latest waveform, and saved reference takes support A/B comparison. Export and import Trainer setups as JSON. The progress view plots recent scored accuracy and summarizes timing by drum voice.

Keyboard and touch work without device permission. USB MIDI uses browser Web MIDI, per-device note maps, and velocity feedback. A short click-and-tap wizard measures input timing for each device. The Trainer summarizes browser capabilities, saved correction, and recent timing for the selected input profile; results are not a universal hardware benchmark. Audio input uses microphone or line-in permission and stays on the device. Trainer voice scoring calibrates five core kit voices; Song practice calibrates all eight Song Library voices from five strikes per voice and keeps separate profiles for each saved kit type and tuning, cymbal, and pedal setup. Both leave uncertain hits unscored and keep calibration data locally. Optional round recordings stay in page memory and are not uploaded; audio used for scoring is not saved. See the [device validation plan](docs/DEVICE_VALIDATION.md).

## Quality commands

```bash
npm run test:unit:changed
npm test -- tests/unit/progress.test.ts
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:practice
npm run test:e2e:failed
npm run test:e2e:smoke
npm run test:e2e
npm run test:visual
npm run qa:fast
npm run qa:full
npm run qa
```

Use `npm run test:e2e:<feature>` to run one of `navigation`, `learning`, `practice`, `trainer`, `song-library`, `localization`, or `accessibility` in Chromium. Unit tests can be filtered by file as shown above. `test:unit:changed` asks Vitest to run unit tests affected by Git changes.

The E2E server uses the latest production build. Run `npm run build` once before a focused E2E run, or run `qa:fast`/`qa:full`, which build before testing. `test:e2e` discovers all functional specs across Chromium, WebKit, and mobile Chromium; visual snapshots stay in `test:visual` and run in Chromium. `test:e2e:failed` reruns the previous functional run's failures.

For concurrent E2E runs, build once, then give every runner a unique run ID and port. Reuse that run ID when rerunning failures so Playwright can find that runner's last-run file. `PLAYWRIGHT_WORKERS` limits browser workers per runner:

```bash
PLAYWRIGHT_RUN_ID=practice PLAYWRIGHT_PORT=41790 PLAYWRIGHT_WORKERS=1 npm run test:e2e:practice
PLAYWRIGHT_RUN_ID=trainer PLAYWRIGHT_PORT=41791 PLAYWRIGHT_WORKERS=1 npm run test:e2e:trainer
```

Traces, screenshots, last-run state, and HTML reports are isolated under `output/playwright/<run-id>/`. Playwright expects its Chromium and WebKit browsers to be installed. Run `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium webkit` if needed.

## Product contract

- [Use cases](docs/USE_CASES.md)
- [QA plan and traceability](docs/QA_PLAN.md)
- [Product recommendations](docs/PRODUCT_RECOMMENDATIONS.md)
- [Device timing validation](docs/DEVICE_VALIDATION.md)
- [Offline release validation](docs/OFFLINE_VALIDATION.md)
- [Classroom report data policy](docs/CLASSROOM_DATA_POLICY.md)

## Scoring

- **Great:** within 50 ms of the expected hit
- **Good:** within 100 ms
- **Miss:** more than 100 ms late or never played
- **Extra:** no matching target within 100 ms

The score averages 100 points for Great and 70 for Good across expected hits, then deducts two points per extra hit. Hardware, browser, display, and audio latency can influence perceived timing.

## Privacy and safety

Drum Hero stores settings, lesson completion, custom grooves, and up to 50 recent Practice Pad and Trainer sessions in `localStorage`. It requests microphone or line-in access only when you connect Trainer audio input and does not upload Trainer input. Optional account sync uploads Song Library data, the active learner's progress, or a teacher assignment roster only after you connect and enable it. Progress snapshots contain lesson completion, scores, Trainer rounds, and MIDI/latency calibration settings; Song practice microphone voice templates, song recordings, and reference audio remain local. Shared-device profiles and assignments remain local by default. A learner or guardian can explicitly export a compact progress report for a teacher to import on another device; it includes lesson completions and scored practice summaries, but no audio or recordings. Imported reports stay on the receiving device and can be removed from the classroom overview. Adaptive feedback and device-validation logs also stay local unless explicitly exported. Audio input includes room-noise measurement to help set a detection threshold. Song Library recordings are saved locally only after you choose Record, and can be exported or deleted. Acoustic drums can damage hearing; use suitable hearing protection and stop if playing causes pain or numbness.

## Song Library

Open `/song-library` to organize eight original example songs and your own drum repertoire. Songs can have sections and eight-voice grid parts. Score all eight voices in Song Library practice; parts limited to the five core voices also open in Practice Pad or Trainer. The library is stored in browser localStorage and supports reviewed Drum Hero JSON song import, individual song export, and a library backup export/merge. Search includes arrangement section and part names, notes, sticking, dynamics, and hit articulations. Backup review previews validation and lets you add, replace, or skip same-ID song records. Search and filter by difficulty, meter, BPM range, drum voice, subdivision, groove feel, fills, tag, collection, favorites, and due review; save those filters as named searches and sort by title, artist, recent practice, or review date. The grid supports accents, part copy/paste, sticking and dynamics notes, and arrangement reordering. Queues and setlists can be reordered, assigned to sections, and launched into practice. Section progress shows recent scores and explicit readiness criteria, side-by-side bar comparisons, weak-bar one-click drills, and score/timing summaries in comparable 5 BPM groups. Earlier attempts that no longer match the current arrangement are identified and excluded from current-arrangement trends. Local practice recordings and reference audio can be stored, synchronized to the player count-in and transport, exported, and deleted. Reference audio can be aligned from a locally generated waveform with section-downbeat and loop-end markers; optional local analysis suggests tempo and downbeat with separate confidence scores for manual review. Plain library JSON backups contain audio metadata only; the encrypted library backup can include recording and reference audio blobs. Audio attachments never enter account sync or sharing. Section reviews, tempo ramps, arrangement snapshots, checklists, and local rehearsal roles are available. Setlist rehearsal packs export arrangements, kit setup, transitions, stage cues, assigned roles, and saved checklists as a standalone read-only HTML file with phone-friendly jump navigation. Practice can isolate hands or configured foot-operated voices and mirror annotated sticking for left-lead drills; these partial rounds stay out of full-part readiness. MIDI setup can test each pad mapping and report received notes and velocity range. Notation includes counted text descriptions, spoken page counts, and a high-contrast view. Optional Supabase account sync and owner/editor/viewer sharing are implemented. Selected-song snapshots can share chosen arrangements and an optional collection without private notes, progress, or recordings; recipients can copy them into a local library, review later snapshot changes, and explicitly update selected local copies while keeping their local notes and practice history. See [Song Library sync setup](docs/SONG_LIBRARY_SYNC.md) to connect a project. Recorded audio, reference audio, and their metadata stay local unless included in a backup you export.

The library has Overview, Arrangement, Practice, Rehearsal, and Performance workspaces. Listen previews and complete-song practice share the Song Builder arrangement engine, including repeats and tempo changes. Guided queues offer per-item tempo/repetition targets, next/skip controls, and local resume points. Practice today fits overdue schedules, reviews, weak recent attempts, and less-practiced parts into an estimated time budget, with part and tempo targets retained when you save a queue. Readiness uses three recent scored attempts per arranged part near target tempo and requires fresh evidence after part edits; self ratings and slow practice are retained separately. File import accepts both Song Builder projects and library song exports, with duplicate/change review. Edits support undo/redo and in-memory recovery when browser storage is unavailable. Recordings can be played with waveform, detected-onset and expected-hit markers, and jump controls.

Additional tools include guided original-song learning paths with editable, arrangement-matched steps, bar-range loops with a gated tempo ladder, staff/tab notation, evidence-based practice suggestions, section-by-section snapshot comparison, bulk tagging, favorites, collections, setlists, scheduling, archive and export actions, recording alignment, setlist transitions and timing, kit compatibility substitutions, and a first-session guide. Performance history compares attempts by bar and voice and now records per-hit timing, missed targets, sticking, and estimated microphone similarity; nearby local recordings can be replayed. Microphone templates are stored separately for acoustic, electronic, and hybrid kits, with a repeatability score for each voice. Use **Offline app download and storage** on Progress or Song Library to save the main learning and practice page shells and built-in sounds. Core pages can be reopened offline; account sync still needs a connection. Refresh the download after a deployment. Song Library, progress, and teacher roster sync setup plus the ordered database migrations are documented in the [sync guide](docs/SONG_LIBRARY_SYNC.md).

Setlist readiness summarizes recent complete scored passes for each selected part. Smart collections can follow saved arrangement filters. Practice-only groove variations preserve the source part; focused limb practice can map multiple foot-operated voices; and reference tracks support pitch-preserving playback speed changes. Shared selected-song snapshots support section and bar anchored comments after the comments migration is applied. The local drummer review form exports usability observations only when explicitly requested. Song setup can start from an original groove, and the library import panel accepts reviewed Standard MIDI drum files with General MIDI voice mapping; selected arrangements can be exported as MIDI. Reusable practice presets carry tempo, count-in, guide, repetition, tempo-ladder, limb isolation, foot-voice mapping, and lead-hand settings between songs. Overview recommendations choose the weakest recent complete scored part and pass the suggested tempo directly into practice. Recording review displays detected onsets against expected beats; voice labels are user annotations because audio onset detection does not identify drums reliably. On phones, arrangement grid cells use larger touch targets and the grid scrolls horizontally. Bulk tools can tag, archive, schedule, export selected songs, add them to a collection or setlist, and remove them from a chosen collection.

Performance can export a standalone read-only HTML setlist view with its drum parts, kit setup, transitions, and cues. It contains no recordings, account data, or live link; export a fresh copy after local changes. Account-backed viewer sharing remains available for people with a Drum Hero account.

The Progress page also offers local learner profiles and assignments, a full backup and restore for Drum Hero settings and progress, saved songs and rehearsal notes, Trainer history, custom grooves, imported kit samples, and saved song takes and local reference audio. These JSON backups are not password-protected. Song Library also offers a separate AES-GCM encrypted backup that can include attached song recordings and reference audio. Restoring replaces the Drum Hero data in the current browser.

Trainer practice now starts with a compact setup and expandable advanced controls. Learning sequences offer Listen → Copy → Play alone and Feet → Hands → Together; demonstration passes are unscored. Four-, eight-, and sixteen-bar arrangements add rests, fills where compatible, dynamics, and section changes. Recaps provide a one-click focused drill, separate groove/fill/return results, flam/drag spacing feedback, and buzz sustain checks. Swing strength and snare delay have an audible preview. Trends compare the same pattern, input profile, feel settings, and tempo within 5 BPM, reporting timing distance separately from variation. A local named routine library supports saving, renaming, duplication, archive/restore, and duration estimates. Recording review adds zoom, a playback cursor, seeking, and replay around problem targets. Audio diagnostics report uncertain detections and overlapping calibration templates. Microphone and MIDI articulation results depend on the input capturing closely spaced strokes clearly.


### Trainer practice tools

Below **Start practice**, open **Skill map & warmups** for pulse, hand, foot, and accent-contrast indicators from recent reliable scored rounds. Missing evidence stays unscored. Warmup suggestions configure a slower exercise; after two difficult rounds on a pattern, recovery offers a shorter round at a lower tempo with hands isolated. Start the configured round when ready.

**Saved recordings** stores up to 12 named microphone takes on this device, with up to four pinned references. Save the latest completed take, rename or download it, or select **Use as reference A** for playback comparison. Each take retains its pattern, tempo, date, and timing markers. Audio is not uploaded. Clearing browser storage removes saved recordings; download copies for longer retention.

**Hands-free controls** enables F8 (start/pause/resume), F9 (repeat), and F10 (needs-work rating at a self-rating checkpoint). USB or Bluetooth keyboard pedals can send these keys. Shortcuts ignore text fields and must be enabled each visit.

The header's **Accessibility** menu saves reduced motion (including the 3D kit), high contrast, wider text spacing, and text size on this device. **Reset display** restores defaults.

### Saved Song Library workflows

The compact library includes saved searches, collection ordering, per-song practice presets, interactive notation, filtered progress trends, tap tempo, import rehearsal with exact change review, and local rehearsal PDF export. Setlists support repeated songs as independent entries. Recording offers a clock-aligned count-in and non-destructive trimmed WAV copies. Offline readiness verifies downloaded resources by SHA-256 and reports size; interrupted rounds can restore their settings and resume at a saved bar as partial practice. Older libraries and setlists migrate automatically without a new backend migration.

### Rehearsal, sharing, and approved arrangements

In Trainer, **Timed rehearsal with rests** plays the patterns in your personal routine for 30, 60, or 120 seconds each, followed by a selectable rest and a next-pattern preview. This mode uses scored input and skips routine checkpoint gates; count-ins and pauses are excluded from playing time. Cancel stops the sequence and returns to ordinary practice.

**Private peer challenges** exports the selected pattern, tempo, goal, target accuracy, duration, and attribution as JSON. The file excludes profile data, scores, recordings, and audio IDs. Preview imported files before accepting a pattern; acceptance creates a new custom pattern. **Start accepted challenge** plays it for the file's duration and compares its score against the goal using your selected input. Sharing the file happens outside the app.

In Song Library's **Arrangement** workspace, **Approve and lock arrangement** protects tempo, meter, sections, and drum notes from edits, replacement imports, and deletion. Unlock with the dedicated **Unlock arrangement** button before revising the music. Song Builder uses the same save protection. A lock is an editing safeguard, not an account permission.

The **Performance** workspace offers a reading view with large notation, section notes, stage cues, optional scrolling, and an optional screen wake lock. Scroll scores horizontally on small screens. Escape or **Close reading view** closes the modal; wake lock is released on close or when the browser hides the page. Unsupported devices show a display-settings fallback.

**Manage local audio storage**, inside Trainer's saved recordings and the Progress backup panel, shows original song/Trainer audio sizes, exports individual originals, and deletes selected recordings after confirmation. Custom samples and Song Builder backing tracks are outside this storage list. Full backups now include saved Trainer recordings, names, pins, and timing markers as well as song takes, reference audio, and custom samples. Restoring an older backup without the Trainer-audio field preserves existing Trainer takes. The full backup retains its 96 MiB audio and 128 MiB file limits.

### Song Library workspace improvements

The library remembers your selected song, workspace, filters, arrangement section, scroll position, and current practice settings on this device. Use song-result actions to rename, duplicate, favorite, or add songs to collections. Overview combines duration, practice history, reviews, and per-part readiness shortcuts.

Create practice goals for complete scored passes at a chosen tempo and minimum score. Goals use the saved arrangement fingerprint; changed parts need a new goal. Goal credits survive practice history rotation and merge across devices. Round feedback compares complete attempts with matching part, arrangement, input, engine, and tempo. Focused practice hides library management and enlarges transport controls; exit with the visible button.

Notation supports zoom, fullscreen where available, and optional playback following. Setlist entries can preview the last two bars into the next entry’s first two bars, including its break and count-in. The all-song recording shelf supports names, search, playback, deletion, and a local audio storage check. Recordings and reference audio stay local. Standard Song Library JSON exports contain metadata only; encrypted Song Library backups can include attached audio files. Backup review shows record counts, additions, same-ID differences, and song conflict contents before merge or replacement.
