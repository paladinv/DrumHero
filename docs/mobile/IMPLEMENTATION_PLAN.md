+# Drum Hero mobile implementation plan

## Repository and parity contract

Keep web, iOS, and later Android in this repository. Follow Chord Hero's native layout, versioned shared content, stable use-case IDs, and platform-specific storage. Generate shared/mobile/v1/drum-content.json from the existing TypeScript curriculum and lesson guides. Do not make an initial commit or change Git identity; preserve unrelated uncommitted web changes.

Check in ios/DrumHero/DrumHero.xcodeproj so it opens directly, plus project.yml as its reproducible definition. Use SwiftUI and SwiftData on iOS; later use Compose, Room, and DataStore on Android. Keep domain rules native and define equivalent behavior with shared JSON and fixtures.

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

Add custom grooves, focused loops, groove-to-fill, feel/click/limb modes, personal routines, tempo ladders, adaptive plans, external keyboard/Core MIDI, calibration, microphone classification, and recording review. Add permission, disconnect, and classifier-confidence behavior as those inputs ship.

Exit when shared fixtures pass, real MIDI/audio devices pass calibration/interruption cases, and uncertain audio remains unscored.

## Milestone 4: full feature parity

Add Song Library/rehearsal, arrangements, Song Builder, custom samples/mixes, recordings, validated import/export, backup conversion, and RealityKit kit view with an accessible fallback. Retain eight-voice song data while the scorer supports five voices; explain when a song voice cannot be scored.

Exit when shipped future cases pass, file conversions do not silently lose fields, and recording/export lifecycle is inspected.

## Milestone 5: Android parity

Create android/ as Kotlin/Compose, targeting API 35+ to align with Chord Hero. Use Room for structured records, DataStore for preferences, native lifecycle/MIDI, and scheduled AudioTrack playback. Reuse all DHM identifiers, content, scoring/timing/file fixtures, and exception records. Follow Android layout, TalkBack, touch-target, and file/share conventions.

Exit when applicable core and advanced cases pass at the API floor and current target, with differences documented under a DHM identifier.

## Test and release gates

Run content validation and platform unit/UI suites on suitable hosts. Use simulators/emulators for state and UI; physical devices for audio latency, routes, permissions, and extended sessions. Block release on data loss, duplicate results, wrong-voice scoring, timing drift, crashes, or critical accessibility failures. Configure signing and store metadata only for distribution.
