# Drum Hero

Drum Hero is a focused drum-learning studio for the browser. It combines a curated beginner-to-advanced curriculum with a playable timing trainer, rudiments, grooves, kit guidance, and private local progress.

## Highlights

- Twelve guided lessons across beginner, intermediate, and advanced levels
- Five-voice keyboard and touch kit: Kick (`Space`), Snare (`F`), Hi-hat (`J`), Tom (`K`), Crash (`L`)
- Four-count, 40–200 BPM playback, pause/resume/reset, and visible subdivision playhead
- Deterministic Great/Good/Miss/Extra scoring with early/late offsets and combo tracking
- Local recorded drum samples and metronome cues
- Versioned browser-local progress with no login, upload, backend, or analytics; microphone permission is optional for Trainer audio input
- Responsive, reduced-motion-aware interface with keyboard and screen-reader support
- Reusable lazy-loaded Three.js drum-kit engine with procedural five-voice kit, articulated hands/sticks, pointer picking, and deterministic hit animation state
- Adjustable 4/8/10/16-repetition Trainer rounds with configurable count-in, self ratings, progressive tempo, and scored keyboard, touch, USB MIDI, or local audio input
- A 75-pattern groove library from first backbeats to shuffle, funk, Latin, compound and odd meters, plus groove-to-fill studies
- A local custom groove editor with eighth- and sixteenth-note grids, accents, and direct Trainer and Practice Pad handoff
- Vitest unit coverage plus Playwright functional, accessibility, responsive, and visual QA

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 3D kit engine

`lib/drum-engine.ts` owns the renderer, scene, camera, metre-scale `professional-v2` procedural drumset, kick pedal/beater, hands, sticks, hit mapping, picking, resize handling, and disposal. `lib/drum-dimensions.ts` keeps the conventional 22-inch kick, 14-inch snare, 10/12-inch rack toms, 16-inch floor tom, 14/16/18/20-inch cymbals, 5A stick, and adult hand reference dimensions in one immutable module. `lib/drum-animation.ts` keeps the bounded contact-and-rebound math framework-independent for deterministic unit tests and future trainers. `components/DrumKitCanvas.tsx` imports Three.js only on the client, exposes an imperative `hit(instrument, hand?, velocity?)` handle, supports `view="player"` and `view="showcase"` presets, adds focused-canvas keyboard controls on the Kit Guide, and provides a semantic fallback when WebGL is unavailable. Practice Pad sends accepted hits to the engine alongside its existing scoring/audio path; Kit Guide mounts the larger interactive viewer.

The renderer caps device pixel ratio at 1.5, avoids shadows/post-processing, renders only while hit animation is active, pauses naturally when idle, and disposes listeners, observers, materials, geometry, and renderer on unmount. Reduced-motion preferences shorten the visual response while preserving timing and accessibility.

## Trainer inputs

Open `/trainer`, choose from 75 groove patterns, a rudiment, a saved custom groove, or a song part. Choose 4, 8, 10, or 16 repetitions and a one-, two-, or four-beat count-in. Self-rated rounds pause after each pass for Clean, Needs work, or Missed; optional tempo build adjusts speed after each pass or scored round. Scored recaps break timing down by drum voice and compare MIDI accent and tap velocities. Focus plans queue two to six patterns using recent results and practice frequency, while setlists rehearse one part at a time.

Keyboard and touch work without device permission. USB MIDI uses browser Web MIDI, per-device note maps, and velocity feedback. A short click-and-tap wizard measures input timing for each device. Audio input uses microphone or line-in permission and stays on the device. Timing-only scoring works immediately; five-voice scoring uses five sample hits per drum voice and keeps uncertain classifications unscored. Calibration feature vectors and device settings are saved locally, while raw input audio is never recorded or uploaded.

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
