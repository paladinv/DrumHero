# Drum Hero

Drum Hero is a focused drum-learning studio for the browser. It combines a curated beginner-to-advanced curriculum with a playable timing trainer, rudiments, grooves, kit guidance, and private local progress.

## Highlights

- Twelve guided lessons across beginner, intermediate, and advanced levels
- Guided lesson notes with saved practice checkpoints and direct exercise handoffs
- Five-voice keyboard and touch kit: Kick (`Space`), Snare (`F`), Hi-hat (`J`), Tom (`K`), Crash (`L`)
- Four-count, 40–200 BPM playback, pause/resume/reset, and visible subdivision playhead
- Deterministic Great/Good/Miss/Extra scoring with early/late offsets and combo tracking
- Local recorded drum samples and metronome cues
- Versioned browser-local progress with no login, upload, backend, or analytics; microphone permission is optional for Trainer audio input
- Responsive, reduced-motion-aware interface with keyboard and screen-reader support
- Reusable lazy-loaded Three.js drum-kit engine with procedural five-voice kit, articulated hands/sticks, pointer picking, and deterministic hit animation state
- Adjustable 4/8/10/16-repetition Trainer rounds with configurable count-in, self ratings, progressive tempo, and scored keyboard, touch, USB MIDI, or local audio input
- Custom practice routines with per-pattern tempo, repetitions, optional groove-to-fill transitions, and gated accuracy/timing checkpoints; routines travel in setup exports
- A 75-pattern groove library from first backbeats to shuffle, funk, Latin, compound and odd meters, plus groove-to-fill studies
- A local custom groove editor with eighth- and sixteenth-note grids, accents, and direct Trainer and Practice Pad handoff
- A generated C–G bass pulse for 4/4 Practice Pad patterns; Trainer also offers swing, laid-back timing, and sparse click modes
- Full local backup and restore for progress, Trainer settings, songs, custom grooves, imported samples, and recorded song takes
- Vitest unit coverage plus Playwright functional, accessibility, responsive, and visual QA

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Native iOS app

The SwiftUI app supports iOS/iPadOS 17+, iPhone, and iPad. Open `ios/DrumHero/DrumHero.xcodeproj` in Xcode and select the DrumHero scheme. Signing is not configured; choose a development team only when installing on a device. The app loads its versioned curriculum from `shared/mobile/v1/drum-content.json` and saves lesson progress and practice locally with SwiftData.

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

Keyboard and touch work without device permission. USB MIDI uses browser Web MIDI, per-device note maps, and velocity feedback. A short click-and-tap wizard measures input timing for each device. Audio input uses microphone or line-in permission and stays on the device. Timing-only scoring works immediately; five-voice scoring uses five sample hits per drum voice and keeps uncertain classifications unscored. Calibration feature vectors and device settings are saved locally. Optional round recordings stay in page memory and are not uploaded; audio used for scoring is not saved.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:visual
npm run qa
```

Playwright expects its Chromium and WebKit browsers to be installed. Run `npx playwright install chromium webkit` if needed. All generated browser artifacts are kept under `output/playwright/`.

## Product contract

- [Use cases](docs/USE_CASES.md)
- [QA plan and traceability](docs/QA_PLAN.md)
- [Product recommendations](docs/PRODUCT_RECOMMENDATIONS.md)

## Scoring

- **Great:** within 50 ms of the expected hit
- **Good:** within 100 ms
- **Miss:** more than 100 ms late or never played
- **Extra:** no matching target within 100 ms

The score averages 100 points for Great and 70 for Good across expected hits, then deducts two points per extra hit. Hardware, browser, display, and audio latency can influence perceived timing.

## Privacy and safety

Drum Hero stores settings, lesson completion, custom grooves, and up to 50 recent Practice Pad and Trainer sessions in `localStorage`. It requests microphone or line-in access only when you connect Trainer audio input and does not store Trainer input or send data anywhere. Audio input includes room-noise measurement to help set a detection threshold. Song Library recordings are saved locally only after you choose Record, and can be exported or deleted. Acoustic drums can damage hearing; use suitable hearing protection and stop if playing causes pain or numbness.

## Song Library

Open `/song-library` to organize original example songs and your own drum repertoire. Songs can have sections and five-voice grid parts that open in Practice Pad or Trainer. The library is stored in browser localStorage and supports reviewed Drum Hero JSON song import, individual song export, and a library backup export/merge. Search and filter by difficulty, meter, tag, collection, favorites, and due review; sort by title, artist, recent practice, or review date. The grid supports accents, part copy/paste, sticking and dynamics notes, and arrangement reordering. Queues and setlists can be reordered, assigned to sections, and launched into practice. Section progress shows recent scores and explicit readiness criteria. Local audio recordings can be stored and exported from the library. Library backups contain recording metadata but not the audio blobs; export each take separately. Section reviews, tempo ramps, arrangement snapshots, checklists, and local rehearsal roles are available. Cloud sync and account sharing are not yet available.

The Progress page also offers a full local backup and restore for Drum Hero settings and progress, saved songs and rehearsal notes, Trainer history, custom grooves, imported kit samples, and saved song takes. These JSON backups are not password-protected. Restoring replaces the Drum Hero data in the current browser.
