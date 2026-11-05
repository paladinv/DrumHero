+# Drum Hero mobile test plan

Every automated test and reported issue uses its stable DHM identifier. iOS and later Android run the same content and behavior fixtures. Platform-only mechanics can differ; record behavior exceptions against the shared identifier.

## Automated coverage

| Suite | Coverage | Use cases |
|---|---|---|
| scripts/validate-mobile-content.mjs | JSON schema, source freshness, unique IDs, references, grid/voice/tempo bounds and inventory | DHM-001, 010–027, 153 |
| ios/DrumHero/Tests/ContentAndRulesTests.swift | Catalogue decode/inventory; curriculum completion summary; shared timing/scoring fixtures; local backup v2 round trip, v1 compatibility, validation, and SwiftData restore; mute/interruption state | DHM-003, 010–044, 060, 064, 070–072 |
| ios/DrumHero/UITests/DrumHeroUITests.swift | Offline launch/navigation and persisted selection; lesson completion/checkpoint; all-complete Home; muted Practice; Trainer reset | DHM-001–003, 007, 010, 013–014, 030, 034, 036, 050, 053, 060 |
| Later Android JVM tests | Same score/timeline/content fixtures and Room migration/persistence | DHM-001–073, 153 |
| Later Android instrumented tests | Navigation, completion, pad touch, round controls, interruption, TalkBack semantics | DHM-001–073, 152–153 |

## Case-to-test traceability

Each DHM case maps to a stable scenario below. `Implemented` names a checked-in XCTest or validator; `Acceptance` names a required device or manual test for the iOS core gate; `Later parity` names a test to add with the deferred iOS/Android feature. Android must retain these DHM IDs and the shared fixtures.

| Use case | Test scenario | Coverage now |
|---|---|---|
| DHM-001 | Offline content load and missing-content recovery | `testSharedContentInventoryAndReferences`; `testOfflineLaunchShowsHomeWithoutPermissionPrompt` |
| DHM-002 | Relaunch restores selected tab/pattern/tempo and does not resume playback | `testSelectedPracticeTabPersistsWithoutResumingPlayback` |
| DHM-003 | Home recommends earliest incomplete lesson and shows all-complete review | CurriculumProgressSummary unit coverage; `testHomeOffersCurriculumReviewWhenAllLessonsAreComplete` |
| DHM-004 | Compact/regular size classes, orientation, and iPad window resizing | `LAYOUT-01` Acceptance |
| DHM-005 | VoiceOver, keyboard, large text, contrast, visible focus, and color-independent labels | `ACCESS-01` Acceptance |
| DHM-006 | Reduce Motion preserves status and playhead meaning | `ACCESS-02` Acceptance |
| DHM-007 | Core flows produce no microphone/camera/MIDI/network permission prompts | `testOfflineLaunchShowsHomeWithoutPermissionPrompt`; `testPracticeCanStartAndReset` |
| DHM-008 | Backgrounding and call/interruption require explicit resume | `LIFECYCLE-01` Acceptance |
| DHM-010 | Lesson count/order/IDs/guides and references | `testSharedContentInventoryAndReferences`; `mobile:content:validate` |
| DHM-011 | Lesson level filtering retains state | `LESSON-01` Acceptance |
| DHM-012 | Lesson outcome, goals, notes, and steps | `LESSON-02` Acceptance |
| DHM-013 | Checkpoint save, navigation, and relaunch recovery | `testLessonCheckpointCanBeSavedAndRestored`; physical relaunch in `LESSON-03` Acceptance |
| DHM-014 | Complete lesson and update progress | `testLearnerCanCompleteLesson` |
| DHM-015 | Repeated completion stays idempotent | `LESSON-04` Acceptance |
| DHM-016 | Per-level and total completion | CurriculumProgressSummary unit coverage; total/per-level values in `PROGRESS-01` Acceptance |
| DHM-017 | Lesson exercise handoff selects pattern without auto-play | `NAV-01` Acceptance |
| DHM-020 | Groove inventory, labels, meter, tempo, and bounds | `mobile:content:validate`; `testSharedContentInventoryAndReferences` |
| DHM-021 | Pattern search and level filter | `CATALOG-01` Acceptance |
| DHM-022 | Rudiment count, sticking, cues, and coaching | `mobile:content:validate`; `CATALOG-02` Acceptance |
| DHM-023 | Groove/fill/rudiment selection opens the correct pattern | `NAV-01` Acceptance |
| DHM-024 | Five kit voices and keyboard mappings | `KIT-01` Acceptance |
| DHM-025 | Setup, hearing protection, and stop-if-pain guidance | `SAFETY-01` Acceptance |
| DHM-026 | Semantic pattern grid exposes rests, targets, voices, and beat positions | VoiceOver labels include step, beat, voice, target/rest; `GRID-01` Acceptance |
| DHM-027 | Five large labeled pads accept touch | `PAD-01` Acceptance |
| DHM-030 | Supported tempo bounds and default selection | `testSubdivisionTimingAcrossTempoBounds`; `testPracticeCanStartAndReset` |
| DHM-031 | Selection/configuration cancels stale schedule | `testExpectedTimelinePreservesSubdivisionsAndSimultaneousHits`; `SCHEDULE-01` Acceptance |
| DHM-032 | Explicit Start, four-beat count-in, then phrase | `testPracticeCanStartAndReset`; `SCHEDULE-02` Acceptance |
| DHM-033 | Cue/playhead spacing across subdivisions | `testSubdivisionTimingAcrossTempoBounds`; `SCHEDULE-02` Acceptance |
| DHM-034 | Muted audio retains timing and scoring | `testMutedPracticeKeepsTheVisualRoundActive`; `AUDIO-01` physical playback acceptance |
| DHM-035 | Pause/resume preserves target spacing | `SCHEDULE-03` Acceptance |
| DHM-036 | Reset stops cues, clears score, and allows retry | `testPracticeCanStartAndReset` |
| DHM-037 | Concurrent touch on independent voices | `PAD-02` Acceptance |
| DHM-038 | Idle/count-in/paused/completed touches do not score | `INPUT-01` Acceptance |
| DHM-039 | End resolves misses and emits one bounded result | `testEmptyPatternResultHasZeroScoreAndAccuracy`; `RESULT-01` Acceptance |
| DHM-040 | Closest unmatched target must use the same voice and match once | `testTargetMatchingUsesClosestUnmatchedVoice` |
| DHM-041 | ±50/±100 ms boundaries and outside-window classification | `testScoringFixtureBoundaries`; shared `scoring-fixtures.json` |
| DHM-042 | Signed offset and readable miss/extra feedback | `FEEDBACK-01` Acceptance |
| DHM-043 | Combo grows on hits and breaks on miss/extra | `testResultSummaryMatchesWebScoringContract` |
| DHM-044 | Score rounding, expected-hit denominator, and zero floor | `testResultSummaryMatchesWebScoringContract`; `testEmptyPatternResultHasZeroScoreAndAccuracy` |
| DHM-050 | Trainer mode, pattern, repetitions, and count-in settings | `testTrainerCanStartAndResetAnUnfinishedRound`; `TRAINER-01` Acceptance |
| DHM-051 | Every self-rating is captured with no fabricated accuracy | `TRAINER-02` Acceptance |
| DHM-052 | Scored Trainer completes one recap | `TRAINER-03` Acceptance |
| DHM-053 | Trainer pause/resume/reset lifecycle | `SCHEDULE-03` Acceptance |
| DHM-054 | Exact repetition cap and one completion save | `TRAINER-04` Acceptance |
| DHM-060 | Home earliest-incomplete recommendation | `HOME-01` Acceptance |
| DHM-061 | Progress counts, best score, and latest session | `PROGRESS-02` Acceptance |
| DHM-062 | Session history fields and ordering | `PROGRESS-03` Acceptance |
| DHM-063 | Lower score does not replace best | `DATA-01` Acceptance |
| DHM-064 | SwiftData recovery, migrations, unique completion, backup validation/replace, and 50-record cap | `testLocalProgressBackupV2RoundTripsAndRejectsUnknownPatterns`; `testProgressBackupRestoreReplacesLocalRecordsAndUpdatesExisting`; `DATA-01` Acceptance |
| DHM-070 | Inactive scene stops output and restores saved state | `PracticeController.stopForInterruption`; `LIFECYCLE-01` Acceptance for both Practice and Trainer |
| DHM-071 | Interruption/route change pauses without auto-resume or cue burst | `testMuteAndInterruptionKeepPracticeVisualStateAvailable`; `LIFECYCLE-02` physical route acceptance |
| DHM-072 | Missing engine/sample reports fallback while visual practice continues | `testMuteAndInterruptionKeepPracticeVisualStateAvailable`; `AUDIO-02` device acceptance |
| DHM-073 | Thirty-minute clock, audio, memory, and history soak | `SOAK-01` Acceptance |
| DHM-100 | Custom groove create/edit/save/delete round trip | `PARITY-GROOVE-01` Later parity |
| DHM-101 | Selected-beat/bar loop bounds and reset | `PARITY-LOOP-01` Later parity |
| DHM-102 | Groove-to-fill transition and sticking/lead hand | `PARITY-TRANSITION-01` Later parity |
| DHM-103 | Feel, sparse click, and limb focus selection | `PARITY-FEEL-01` Later parity |
| DHM-104 | Routine order/configuration, gates, and setup exchange | `PARITY-ROUTINE-01` Later parity |
| DHM-105 | Tempo ladder and adaptive review from local results | `PARITY-ADAPT-01` Later parity |
| DHM-106 | Voice accuracy/timing analysis and drill handoff | `PARITY-ANALYSIS-01` Later parity |
| DHM-110 | Keyboard/controller mapping, disconnect, reconnect | `PARITY-DEVICE-01` Later parity |
| DHM-111 | Core MIDI source discovery and editable note-map persistence | `MIDI-01` Acceptance |
| DHM-112 | MIDI velocity and accent target comparison | `PARITY-MIDI-02` Later parity |
| DHM-113 | Per-input timing correction and persistence | `INPUT-01` Acceptance |
| DHM-114 | Microphone permission, room-noise sensitivity calibration, one-voice scoring, and playback-bleed check | `MIC-01` Acceptance |
| DHM-120 | Song, section, part, notes, and rehearsal metadata lifecycle | `PARITY-SONG-01` Later parity |
| DHM-121 | Song search, filters, favorites, archives, queues, and setlists | `PARITY-SONG-02` Later parity |
| DHM-122 | Section handoff, score, and readiness | `PARITY-SONG-03` Later parity |
| DHM-123 | Arrangement edits, copies, accents, and snapshots | `PARITY-ARRANGEMENT-01` Later parity |
| DHM-124 | Song Builder project/template/sample/mix round trip | `PARITY-BUILDER-01` Later parity |
| DHM-125 | Valid import plus malformed atomic rejection | `PARITY-IMPORT-01` Later parity |
| DHM-126 | Export formats reopen with no silent data loss | `PARITY-EXPORT-01` Later parity |
| DHM-130 | Recording start/review/play/export/delete lifecycle | `PARITY-RECORDING-01` Later parity |
| DHM-131 | Recording denial/interruption/storage failure recovery | `PARITY-RECORDING-02` Later parity |
| DHM-140 | Portable web/iOS progress transfer with merge preview | `XFER-01` Acceptance |
| DHM-141 | Encrypted backup, wrong password, and rollback | `PARITY-BACKUP-02` Later parity |
| DHM-142 | Versioned web/iOS/Android file round trips | `PARITY-FORMAT-01` Later parity |
| DHM-150 | 3D hit mapping and accessible fallback | `PARITY-KIT3D-01` Later parity |
| DHM-151 | Reduced-motion animation and device performance | `PARITY-KIT3D-02` Later parity |
| DHM-152 | Android API 35+/current Compose, Room, DataStore, and TalkBack core suite | `PARITY-ANDROID-01` Later parity |
| DHM-153 | Shared IDs, content validation, and golden-fixture equivalence | `mobile:content:validate`; shared fixture suite on each platform |

## Deterministic domain scenarios

- Shared JSON fixtures cover +50/−50 ms Great, +100/−100 ms Good, and just outside both limits. Display rounding must not change classification.
- Verify interval math at 40, 80, 120, and 200 BPM with quarter, eighth, triplet, and sixteenth grids, including 5/4 and 7/8.
- Verify simultaneous different voices remain separate; a wrong voice cannot consume a target; a target matches once; a duplicate tap is Extra.
- Verify misses resolve after the 100 ms window, pause/resume shifts remaining targets together, reset drops pending work, and finalization emits one result.
- Verify expected-hit score denominator excludes Extras; Great=100, Good=70, Miss=0, Extra=−2, floor=0; accuracy excludes Extras; Miss/Extra reset combo.
- Verify Trainer accepts 4/8/10/16 repetitions; self ratings never become numeric accuracy; scored rounds save one recap; reset/interruption cannot finish a round.
- Verify inventory: 12 lessons, 7 rudiments, 100 grooves/fills; unique IDs and valid lesson/pattern references.

## UI and device acceptance

- Automate launch → Learn → lesson → checkpoint/completion → Progress; all-complete Home review; direct Practice; Start → count-in → mute → Reset; Trainer start/reset and self-rated/scored completion.
- Import a v2 progress backup with personal songs, review its record counts, cancel and confirm replacement in separate runs, then verify lesson notes, practice history, best scores, Trainer recaps, and songs. Import a v1 backup and confirm existing personal songs are preserved. Confirm unsupported versions, unknown IDs, duplicate records, and oversized files leave local progress unchanged.
- Export the portable progress transfer from web and iOS in both directions. Review lesson/session/best-score counts, merge without removing current records, verify preferred tempo, repeat the same file to confirm idempotent IDs, and confirm unsupported iOS lesson/pattern IDs are reported. Transfer a single-song JSON file and a multi-song library pack both directions; review duplicate actions, imported arrangements, and iOS unsupported-voice warnings.
- Run iOS unit/UI tests on iOS 17 and current iOS, compact/large iPhones, and iPad portrait/landscape/resizing. Later Android runs on API 35 and current target.
- Manually inspect VoiceOver/TalkBack traversal of the semantic pattern grid and feedback, largest system text, reduced motion, light/dark contrast, hardware-keyboard focus, and pad touch targets. Confirm the core flow never requests mic/camera/MIDI/sign-in/network access.
- On iPhone and iPad verify compact/regular layouts, rotation and iPad window resizing; on physical devices verify sample playback, touch latency, count spacing, headphones/speaker routes, calls, lock/background handling from both Practice and Trainer, engine failure feedback, and 30-minute stability. Verify MIDI source refresh and note remapping, microphone permission and noise sensitivity, and saved input corrections. Simulator tests do not establish audio latency.
- Before distribution, inspect signing, privacy declarations, attribution/license packaging, sample completeness, and production archive. Signing/store configuration is intentionally absent from the foundation.

## Commands

    npm run mobile:content:validate
    cd ios/DrumHero
    xcodebuild -project DrumHero.xcodeproj -scheme DrumHero -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
    xcodebuild -project DrumHero.xcodeproj -scheme DrumHero -destination 'platform=iOS Simulator,name=iPhone 17' test CODE_SIGNING_ALLOWED=NO
