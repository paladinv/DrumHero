+# Drum Hero mobile implementation plan

## Repository and parity contract

Keep web, iOS, and Android in this repository. Follow Chord Hero's native layout, versioned shared content, stable use-case IDs, and platform-specific storage. Generate shared/mobile/v1/drum-content.json from the existing TypeScript curriculum and lesson guides. Do not make an initial commit or change Git identity; preserve unrelated uncommitted web changes.

Check in ios/DrumHero/DrumHero.xcodeproj so it opens directly, plus project.yml as its reproducible definition. Use SwiftUI and SwiftData on iOS; the Android starter currently uses Compose and SharedPreferences while Room, DataStore, and broader parity remain planned. Keep domain rules native and define equivalent behavior with shared JSON and fixtures.

## Milestone 1: foundation and iOS project

- Add iOS 17+, Swift 6 application, shared scheme, unit/UI targets, iPhone/iPad family, and unsigned development settings.
- Export twelve lessons, guides, seven rudiments, and 100 grooves/fills. Validate source freshness, IDs, references, grid bounds, voices, and tempos.
- Add Codable content types, SwiftData lesson/checkpoint/session/Trainer records, pure scoring/timing rules, and shared fixtures.
- Bundle existing CC0 WAVs and retain their attribution/license provenance.

Exit when content validation, project generation, clean-checkout build, and domain tests pass.

## Milestone 2: iOS core release

- Build adaptive Home, Learn, Practice, Trainer, and Progress with accessibility labels, text status, reduced-motion handling, and iPhone/iPad sizing.
- Implement lesson browse/filter, guides/checkpoints/completion, pattern catalogues, kit setup, and hearing-safety guidance.
- Implement foreground practice: explicit four-beat count-in, subdivision timeline, sample cues, mute, touch scoring, feedback, pause/resume/reset, interruptions, and one persisted result.
- Implement self-rated and scored Trainer; save the self-rating sequence without fabricating numeric accuracy.
- Store records locally in SwiftData. Fall back in memory if persistent store initialization fails; preserve schemas for future migration.

Exit when applicable DHM-001–073 cases pass and physical audio/accessibility acceptance is complete.

## Milestone 3: advanced iOS practice

Add custom grooves, focused loops, groove-to-fill, feel/click/limb modes, personal routines, tempo ladders, adaptive plans, external keyboard/Core MIDI, input calibration, microphone classification, and recording review. The native Trainer now includes seated/no-kick and one-voice practice; adapted results remain separate from standard personal bests. Add permission, disconnect, and classifier-confidence behavior as those inputs ship. Physical MIDI/audio validation remains a manual release gate.

Exit when shared fixtures pass, real MIDI/audio devices pass calibration/interruption cases, and uncertain audio remains unscored.

## Milestone 4: full feature parity

The native Song Library now includes the eight bundled original song examples, with section parts that open in Practice. Add personal songs, rehearsal/arrangement editing, Song Builder, custom samples/mixes, recordings, validated import/export, and a shared web/iOS backup format. Account sync and a RealityKit kit view with an accessible fallback remain future work. iOS has a versioned local JSON backup for lesson checkpoints, practice sessions, Trainer rounds, and best scores, with an import review and explicit replace action. Retain eight-voice song data while the scorer supports five voices; explain when a song voice cannot be scored.

Exit when shipped future cases pass, file conversions do not silently lose fields, and recording/export lifecycle is inspected.

## Milestone 5: Android starter and parity

The `android/` Compose app reuses shared content and WAV assets for offline lesson browsing and four-bar score-led Practice. It stores progress in SQLite, with migration from the original SharedPreferences keys, and supports reviewed archive import/export while retaining Android-unsupported fields. USB/Bluetooth MIDI input maps General MIDI percussion notes to the five core voices and offers an eight-click, per-port timing correction. Single-voice microphone onset detection, notation-first personal-song bar practice, and optional local daily reminders are now available; the microphone path is experimental and never saves audio. Continue with Room/DataStore migration, account sync, full Song Library editing, and accessibility/device validation. MIDI timing and microphone scoring remain experimental until physical validation. Reuse DHM identifiers, shared content, scoring/timing/file fixtures, and exception records. Follow Android layout, TalkBack, touch-target, and file/share conventions.

Exit when applicable core and advanced cases pass at the API floor and current target, with differences documented under a DHM identifier.

## Test and release gates

Run content validation and platform unit/UI suites on suitable hosts. Use simulators/emulators for state and UI; physical devices for audio latency, routes, permissions, and extended sessions. Block release on data loss, duplicate results, wrong-voice scoring, timing drift, crashes, or critical accessibility failures. Configure signing and store metadata only for distribution.
