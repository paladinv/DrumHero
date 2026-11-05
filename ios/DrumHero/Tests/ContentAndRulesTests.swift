import XCTest
import SwiftData
import SwiftUI
import UIKit
@testable import DrumHero

final class ContentAndRulesTests: XCTestCase {
    private struct FixtureDocument: Decodable {
        struct Case: Decodable { let id: String; let offsetMs: Double; let rating: HitRating }
        let schemaVersion: Int
        let cases: [Case]
    }

    @MainActor
    private final class StubAudioService: DrumAudioPlaying {
        var failsPreparation = false
        var failsPlayback = false
        var playCount = 0
        var stopCount = 0

        func prepare() throws {
            if failsPreparation { throw AudioServiceError.noSamples }
        }

        func play(_ voice: DrumVoice) -> Bool {
            playCount += 1
            return !failsPlayback
        }

        func stop() { stopCount += 1 }
    }

    func testSightGeneratorMatchesSharedFixtures() throws {
        struct Fixture: Decodable { let settings: SightSettings; let seed: UInt32; let fingerprint: String }
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "sight-reading-v1", withExtension: "json"))
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
        for fixture in fixtures {
            let exercise = SightExercise.generate(fixture.settings, seed: fixture.seed)
            XCTAssertEqual(exercise.fingerprint, fixture.fingerprint)
            XCTAssertTrue(exercise.hits.allSatisfy { $0.step >= 0 && $0.step < exercise.stepsPerBar * exercise.settings.bars })
            XCTAssertEqual(Set(exercise.hits.map { "\($0.step)-\($0.instrument.rawValue)" }).count, exercise.hits.count)
        }
        var odd = SightSettings(); odd.level = .advanced; odd.meter = "7/8"; odd.bpm = 60
        XCTAssertEqual(SightExercise.generate(odd, seed: 1).duration, 14)
    }

    @MainActor
    func testSightAssignmentCodeRoundTripsAndLegacySettingsDecode() throws {
        let legacy = Data(#"{"level":"Beginner","bpm":80,"bars":2,"meter":"4/4","triplets":false,"snareOnly":false}"#.utf8)
        let oldSettings = try JSONDecoder().decode(SightSettings.self, from: legacy)
        XCTAssertEqual(oldSettings.focusVoice, "mixed")
        XCTAssertEqual(oldSettings.focusRhythm, "mixed")
        XCTAssertEqual(oldSettings.style, "varied")

        var settings = SightSettings(); settings.level = .advanced; settings.meter = "5/4"
        settings.focusVoice = "tom"; settings.focusRhythm = "sixteenths"; settings.style = "fill"
        let source = SightReadingController(audio: StubAudioService())
        source.fresh(settings)
        let expected = try XCTUnwrap(source.exercise)
        let code = try XCTUnwrap(source.createAssignmentCode(settings: settings, title: "Odd meter reading", dueDate: "2026-10-31", minimumAccuracy: 85))
        let student = SightReadingController(audio: StubAudioService())
        XCTAssertEqual(student.loadAssignment("DH-SA1:" + code), settings.normalized)
        XCTAssertEqual(student.exercise?.fingerprint, expected.fingerprint)
        XCTAssertEqual(student.assignment?.title, "Odd meter reading")
        XCTAssertEqual(student.assignment?.minimumAccuracy, 85)
        XCTAssertEqual(student.phase, .setup)
        let legacySettings = try JSONEncoder().encode(settings)
        let legacyPayload = legacySettings.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        XCTAssertEqual(student.loadAssignment("DH-SR1:123.\(legacyPayload)"), settings.normalized)
        XCTAssertNil(student.assignment)
        let submission = SightSubmission(title: "Odd meter reading", dueDate: "2026-10-31", minimumAccuracy: 85, meter: "5/4", level: "Advanced", bpm: 90, accuracy: 90, score: 92, classification: "reading")
        XCTAssertTrue(submission.valid)
        XCTAssertFalse(SightSubmission(title: nil, dueDate: nil, minimumAccuracy: nil, meter: "4/4", level: "Beginner", bpm: 80, accuracy: 101, score: 80, classification: "reading").valid)
        let submissionCode = try XCTUnwrap(String(data: JSONEncoder().encode(submission), encoding: .utf8))
        let submissionData = Data(submissionCode.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        XCTAssertNil(student.loadAssignment("DH-SUB1:" + submissionData))
        XCTAssertTrue(student.assignmentFeedback.contains("target met"))
    }

    func testSightGoalValidationAndBackupCompatibility() throws {
        let previousGoal = SightHistory.readGoal()
        defer { try? SightHistory.writeGoal(previousGoal) }
        let goal = SightGoal(level: .advanced, meter: "5/4", bpm: 108, focusRhythm: "sixteenths", accuracy: 90, targetReads: 4)
        XCTAssertTrue(goal.valid)
        try SightHistory.writeGoal(goal)
        XCTAssertEqual(SightHistory.readGoal(), goal)
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let backup = MobileProgressBackup(lessonProgress: [], practiceSessions: [], patternBests: [], trainerRounds: [])
        XCTAssertEqual(backup.sightReadingGoal, goal)
        try backup.validate(content: content)
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(backup)) as? [String: Any])
        legacy.removeValue(forKey: "sightReadingGoal")
        let decoded = try JSONDecoder().decode(MobileProgressBackup.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertNil(decoded.sightReadingGoal)
        XCTAssertNoThrow(try decoded.validate(content: content))
    }

    @MainActor
    func testSightCancellationAndSeparateHistory() {
        let audio = StubAudioService()
        let controller = SightReadingController(audio: audio)
        var settings = SightSettings(); settings.bars = 1
        controller.start(settings, source: "touch")
        XCTAssertEqual(controller.phase, .preview)
        XCTAssertEqual(controller.classification, "reading")
        let count = controller.history.count
        controller.cancel()
        XCTAssertEqual(controller.history.count, count)
        controller.start(settings, source: "touch")
        XCTAssertEqual(controller.classification, "practice")
        controller.cancel()
        controller.fresh(settings)
        controller.assisted = true
        controller.start(settings, source: "touch")
        XCTAssertEqual(controller.classification, "assisted")
        controller.cancel()
    }

    @MainActor
    func testSightHistoryBackupsAndLegacyCompatibility() throws {
        let previous = UserDefaults.standard.data(forKey: SightHistory.key)
        defer { UserDefaults.standard.set(previous, forKey: SightHistory.key) }
        let row = SightAttempt(seed: 123, settings: SightSettings(), source: "touch", inputProfile: "touch", classification: "reading", score: 80, accuracy: 90, meanOffsetMs: -10, misses: 1, extras: 0)
        try SightHistory.write([row])
        let backup = MobileProgressBackup(lessonProgress: [], practiceSessions: [], patternBests: [], trainerRounds: [])
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        try backup.validate(content: content)
        let data = try JSONEncoder().encode(backup)
        let restored = try JSONDecoder().decode(MobileProgressBackup.self, from: data)
        XCTAssertEqual(restored.sightReadingAttempts?.first?.seed, 123)
        var legacy = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        legacy.removeValue(forKey: "sightReadingAttempts")
        let old = try JSONDecoder().decode(MobileProgressBackup.self, from: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertNil(old.sightReadingAttempts)
        XCTAssertNoThrow(try old.validate(content: content))
        XCTAssertEqual(SightHistory.read().first?.id, row.id)
    }

    @MainActor
    func testSightFirstPassFinishesWithoutTrainerMastery() async throws {
        let previous = UserDefaults.standard.data(forKey: SightHistory.key)
        defer { UserDefaults.standard.set(previous, forKey: SightHistory.key) }
        let controller = SightReadingController(audio: StubAudioService())
        var settings = SightSettings(); settings.bpm = 200; settings.bars = 1
        controller.start(settings, source: "keyboard")
        let deadline = ProcessInfo.processInfo.systemUptime + 16
        while controller.phase != .playing && ProcessInfo.processInfo.systemUptime < deadline { try await Task.sleep(for: .milliseconds(50)) }
        controller.hit(.snare, source: "keyboard")
        XCTAssertFalse(controller.rated.isEmpty)
        while controller.phase != .results && ProcessInfo.processInfo.systemUptime < deadline { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(controller.phase, .results)
        XCTAssertNotNil(controller.result)
        XCTAssertEqual(controller.history.last?.classification, "reading")
        XCTAssertEqual(controller.history.last?.source, "keyboard")
        XCTAssertEqual(controller.history.last?.seed, controller.exercise?.seed)
        controller.start(settings, source: "keyboard")
        XCTAssertEqual(controller.classification, "practice")
        controller.cancel()
    }

    @MainActor
    func testSightNotationVisualMatrix() async throws {
        for meter in ["4/4", "3/4", "5/4", "7/8"] {
            for triplets in (meter == "7/8" ? [false] : [false, true]) {
                var settings = SightSettings(); settings.level = .advanced; settings.meter = meter; settings.triplets = triplets
                let exercise = SightExercise.generate(settings, seed: 12345)
                let view = SightStaff(exercise: exercise, beat: 1).frame(width: 680, height: 340).background(Color.white).foregroundStyle(.black)
                let host = UIHostingController(rootView: view)
                let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 680, height: 340))
                window.rootViewController = host; window.isHidden = false
                host.view.frame = window.bounds; host.view.layoutIfNeeded()
                try await Task.sleep(for: .milliseconds(100))
                let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in host.view.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
                let attachment = XCTAttachment(image: image); attachment.name = "sight-\(meter.replacingOccurrences(of: "/", with: "-"))-\(triplets)"; attachment.lifetime = .keepAlways; add(attachment)
                window.isHidden = true
                XCTAssertGreaterThan(image.pngData()?.count ?? 0, 2000)
            }
        }
    }

    // DHM-010–027: the native app reads the same content exported from the web curriculum.
    func testSharedContentInventoryAndReferences() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        XCTAssertEqual(content.lessons.count, 12)
        XCTAssertEqual(content.rudiments.count, 7)
        XCTAssertEqual(content.grooves.count, 100)
        XCTAssertEqual(content.patterns.count, 107)
        XCTAssertTrue(content.lessons.allSatisfy { content.lessonGuides[$0.id] != nil })
        let patternIDs = Set(content.patterns.map(\.id))
        XCTAssertTrue(content.lessons.compactMap(\.practicePatternId).allSatisfy(patternIDs.contains))
        XCTAssertTrue(content.patterns.allSatisfy { $0.defaultBpm >= 40 && $0.defaultBpm <= 200 })
        XCTAssertEqual(content.translations.count, 24)
        XCTAssertEqual(content.translations["es"]?["Home"], "Inicio")
        XCTAssertEqual(content.translations["es"]?["lesson.meet-the-kit.title"], "Conoce la batería")
        XCTAssertEqual(content.translations["es"]?["dashboard.tool.practice.title"], "Panel de práctica")
        XCTAssertTrue(content.translations["ja"]?["dashboard.tool.trainer.description"]?.contains("適応") == true)
        XCTAssertEqual(content.translations["ja"]?["lesson.count-the-grid.summary"], "4分音符と8分音符を時間上の位置として読みます。")
    }

    func testTeachingContentTranslationsAreIndexedWithoutChangingPatterns() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let spanish = Locale(identifier: "es")
        let source = try XCTUnwrap(content.patterns.first { $0.id == "single-stroke" })
        XCTAssertNotEqual(content.localized("pattern.\(source.id).name", fallback: source.name, locale: spanish), source.name)
        XCTAssertNotEqual(content.localized("pattern.\(source.id).description", fallback: source.description, locale: spanish), source.description)
        XCTAssertEqual(source.id, "single-stroke")
        XCTAssertEqual(source.hits.count, 8)
        XCTAssertTrue(content.localized("lesson.meet-the-kit.step.1", fallback: "", locale: spanish).contains("tempo"))
    }

    @MainActor func testCurriculumSummaryFindsNextLessonAndCompletionState() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let orderedLessons = content.lessons.sorted { $0.order < $1.order }
        let first = try XCTUnwrap(orderedLessons.first)
        let second = try XCTUnwrap(orderedLessons.dropFirst().first)

        let empty = CurriculumProgressSummary(lessons: content.lessons, progressRecords: [])
        XCTAssertEqual(empty.completedCount, 0)
        XCTAssertEqual(empty.totalCount, content.lessons.count)
        XCTAssertFalse(empty.isComplete)
        XCTAssertEqual(empty.nextLesson?.id, first.id)

        let completedFirst = LessonProgressRecord(lessonID: first.id, completedAt: .now)
        let partial = CurriculumProgressSummary(lessons: content.lessons, progressRecords: [completedFirst])
        XCTAssertEqual(partial.completedCount, 1)
        XCTAssertEqual(partial.nextLesson?.id, second.id)

        let allCompleted = orderedLessons.map { LessonProgressRecord(lessonID: $0.id, completedAt: .now) }
        let complete = CurriculumProgressSummary(lessons: content.lessons, progressRecords: allCompleted)
        XCTAssertTrue(complete.isComplete)
        XCTAssertEqual(complete.completedCount, content.lessons.count)
    }

    @MainActor func testLocalProgressBackupV2RoundTripsAndRejectsUnknownPatterns() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let lesson = try XCTUnwrap(content.lessons.first)
        let pattern = try XCTUnwrap(content.patterns.first)
        let playedAt = Date(timeIntervalSince1970: 1_000)
        let result = PracticeResult(patternID: pattern.id, patternName: pattern.name, bpm: pattern.defaultBpm,
                                    playedAt: playedAt, score: 82, accuracy: 90, great: 8, good: 1,
                                    miss: 1, extra: 0, maxCombo: 9)
        let backup = MobileProgressBackup(
            lessonProgress: [LessonProgressRecord(lessonID: lesson.id, checkpoint: "Keep the pulse relaxed.", completedAt: playedAt)],
            practiceSessions: [PracticeSessionRecord(result)],
            patternBests: [PatternBestRecord(patternID: pattern.id, patternName: pattern.name, score: result.score, achievedAt: playedAt)],
            trainerRounds: [TrainerRoundRecord(patternID: pattern.id, patternName: pattern.name, bpm: pattern.defaultBpm,
                                               playedAt: playedAt, mode: "self", repetitions: 4,
                                               ratings: [.clean, .needsWork, .clean, .clean])]
        )
        XCTAssertNoThrow(try backup.validate(content: content))

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(backup)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let restored = try decoder.decode(MobileProgressBackup.self, from: data)
        try restored.validate(content: content)
        XCTAssertEqual(restored.schemaVersion, 2)
        XCTAssertEqual(restored.lessonProgress.first?.checkpoint, "Keep the pulse relaxed.")
        XCTAssertEqual(restored.practiceSessions.first?.result.score, 82)
        XCTAssertEqual(restored.trainerRounds.first?.ratings.count, 4)

        let invalidResult = PracticeResult(patternID: "unknown-pattern", patternName: "Unknown", bpm: 80,
                                           playedAt: playedAt, score: 0, accuracy: 0, great: 0, good: 0,
                                           miss: 0, extra: 0, maxCombo: 0)
        let invalidBackup = MobileProgressBackup(lessonProgress: [], practiceSessions: [PracticeSessionRecord(invalidResult)],
                                                 patternBests: [], trainerRounds: [])
        XCTAssertThrowsError(try invalidBackup.validate(content: content))
    }

    @MainActor func testProgressBackupRestoreReplacesLocalRecordsAndUpdatesExisting() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let lessons = content.lessons.sorted { $0.order < $1.order }
        let patterns = content.practicePatterns
        let lessonToUpdate = try XCTUnwrap(lessons.first)
        let lessonToInsert = try XCTUnwrap(lessons.dropFirst().first)
        let lessonToRemove = try XCTUnwrap(lessons.dropFirst(2).first)
        let keptPattern = try XCTUnwrap(patterns.first)
        let removedPattern = try XCTUnwrap(patterns.dropFirst().first)
        let now = Date(timeIntervalSince1970: 2_000)

        let schema = Schema([LessonProgressRecord.self, PracticeSessionRecord.self,
                             PatternBestRecord.self, TrainerRoundRecord.self, PersonalSongRecord.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        let context = ModelContext(container)

        let existingLesson = LessonProgressRecord(lessonID: lessonToUpdate.id, checkpoint: "Old note")
        let staleLesson = LessonProgressRecord(lessonID: lessonToRemove.id, checkpoint: "Remove me")
        let oldPractice = PracticeResult(id: "keep-session", patternID: keptPattern.id, patternName: "Old name", bpm: 80,
                                         playedAt: now, score: 10, accuracy: 20, great: 0, good: 0,
                                         miss: 4, extra: 0, maxCombo: 0)
        let stalePractice = PracticeResult(id: "remove-session", patternID: keptPattern.id, patternName: keptPattern.name,
                                           bpm: 80, playedAt: now, score: 5, accuracy: 10, great: 0, good: 0,
                                           miss: 2, extra: 0, maxCombo: 0)
        let existingBest = PatternBestRecord(patternID: keptPattern.id, patternName: "Old name", score: 10, achievedAt: now)
        let staleBest = PatternBestRecord(patternID: removedPattern.id, patternName: removedPattern.name, score: 5, achievedAt: now)
        let existingRound = TrainerRoundRecord(id: "keep-round", patternID: keptPattern.id, patternName: "Old name",
                                                bpm: 80, playedAt: now, mode: "self", repetitions: 4, ratings: [], score: 10, accuracy: 20)
        let staleRound = TrainerRoundRecord(id: "remove-round", patternID: keptPattern.id, patternName: keptPattern.name,
                                            bpm: 80, playedAt: now, mode: "self", repetitions: 4, ratings: [])
        [existingLesson, staleLesson].forEach(context.insert)
        [PracticeSessionRecord(oldPractice), PracticeSessionRecord(stalePractice)].forEach(context.insert)
        [existingBest, staleBest].forEach(context.insert)
        [existingRound, staleRound].forEach(context.insert)
        try context.save()

        let incomingLesson = LessonProgressRecord(lessonID: lessonToUpdate.id, checkpoint: "Updated note", completedAt: now, updatedAt: now)
        let insertedLesson = LessonProgressRecord(lessonID: lessonToInsert.id, checkpoint: "New note", updatedAt: now)
        let updatedPractice = PracticeResult(id: "keep-session", patternID: keptPattern.id, patternName: keptPattern.name,
                                             bpm: 100, playedAt: now, score: 82, accuracy: 90, great: 8, good: 1,
                                             miss: 1, extra: 0, maxCombo: 9)
        let updatedBest = PatternBestRecord(patternID: keptPattern.id, patternName: keptPattern.name, score: 90, achievedAt: now)
        let updatedRound = TrainerRoundRecord(id: "keep-round", patternID: keptPattern.id, patternName: keptPattern.name,
                                              bpm: 100, playedAt: now, mode: "scored", repetitions: 4,
                                              ratings: [.clean, .needsWork], score: 88, accuracy: 90)
        let backup = MobileProgressBackup(lessonProgress: [incomingLesson, insertedLesson],
                                          practiceSessions: [PracticeSessionRecord(updatedPractice)],
                                          patternBests: [updatedBest], trainerRounds: [updatedRound])

        try backup.restore(content: content, in: context)

        let restoredLessons = try context.fetch(FetchDescriptor<LessonProgressRecord>())
        XCTAssertEqual(restoredLessons.count, 2)
        XCTAssertEqual(restoredLessons.first { $0.lessonID == lessonToUpdate.id }?.checkpoint, "Updated note")
        XCTAssertEqual(restoredLessons.first { $0.lessonID == lessonToInsert.id }?.checkpoint, "New note")

        let restoredPractices = try context.fetch(FetchDescriptor<PracticeSessionRecord>())
        XCTAssertEqual(restoredPractices.count, 1)
        XCTAssertEqual(restoredPractices.first?.score, 82)
        XCTAssertEqual(restoredPractices.first?.bpm, 100)

        let restoredBests = try context.fetch(FetchDescriptor<PatternBestRecord>())
        XCTAssertEqual(restoredBests.count, 1)
        XCTAssertEqual(restoredBests.first?.score, 90)

        let restoredRounds = try context.fetch(FetchDescriptor<TrainerRoundRecord>())
        XCTAssertEqual(restoredRounds.count, 1)
        XCTAssertEqual(restoredRounds.first?.mode, "scored")
        XCTAssertEqual(restoredRounds.first?.ratings, [.clean, .needsWork])
    }

    @MainActor func testMuteAndInterruptionKeepPracticeVisualStateAvailable() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let pattern = try XCTUnwrap(content.patterns.first)
        let audio = StubAudioService()
        let controller = PracticeController(audio: audio)

        controller.toggleMute()
        XCTAssertTrue(controller.isMuted)
        XCTAssertEqual(controller.status, .idle)
        XCTAssertEqual(audio.stopCount, 1)

        controller.toggleMute()
        XCTAssertFalse(controller.isMuted)
        audio.failsPreparation = true
        controller.start(pattern: pattern, bpm: 120, countInBeats: 1)
        XCTAssertTrue(controller.audioUnavailable)
        XCTAssertEqual(controller.status, .countIn)

        controller.stopForInterruption()
        XCTAssertEqual(controller.status, .paused)
        controller.resume()
        XCTAssertEqual(controller.status, .countIn)
        controller.stopForInterruption()
        controller.reset()
        XCTAssertEqual(controller.status, .idle)
    }

    @MainActor func testAutomaticLanguageMatchingHandlesRegionsAndChineseScripts() {
        XCTAssertEqual(LanguageSettings.matchLanguage(["xx-ZZ", "fr-CA", "en-US"]), "fr")
        XCTAssertEqual(LanguageSettings.matchLanguage(["zh-TW"]), "zh-Hant")
        XCTAssertEqual(LanguageSettings.matchLanguage(["zh-Hans-CN"]), "zh-Hans")
        XCTAssertEqual(LanguageSettings.matchLanguage(["pt-PT"]), "pt-BR")
        XCTAssertEqual(LanguageSettings.matchLanguage(["xx-ZZ"]), "en")
    }

    // DHM-041: both native implementations consume the same scoring boundary fixture.
    func testScoringFixtureBoundaries() throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "scoring-fixtures", withExtension: "json"))
        let fixture = try JSONDecoder().decode(FixtureDocument.self, from: Data(contentsOf: url))
        XCTAssertEqual(fixture.schemaVersion, 1)
        XCTAssertEqual(fixture.cases.count, 6)
        for item in fixture.cases { XCTAssertEqual(PracticeRules.classify(offsetMs: item.offsetMs), item.rating, item.id) }
        XCTAssertEqual(PracticeRules.classify(offsetMs: 50.01), .good)
        XCTAssertEqual(PracticeRules.classify(offsetMs: -100.01), .miss)
    }

    // DHM-030/031: tempo and subdivision timing stays exact across supported bounds.
    func testSubdivisionTimingAcrossTempoBounds() {
        XCTAssertEqual(PracticeRules.stepDuration(secondsPerBeat: 40, subdivision: 4), 1.5, accuracy: 0.000_001)
        XCTAssertEqual(PracticeRules.stepDuration(secondsPerBeat: 80, subdivision: 8), 0.375, accuracy: 0.000_001)
        XCTAssertEqual(PracticeRules.stepDuration(secondsPerBeat: 120, subdivision: 12), 1.0 / 6.0, accuracy: 0.000_001)
        XCTAssertEqual(PracticeRules.stepDuration(secondsPerBeat: 200, subdivision: 16), 0.075, accuracy: 0.000_001)
    }

    // DHM-031/039/042: subdivisions, phrase duration, and simultaneous voices retain independent targets.
    func testExpectedTimelinePreservesSubdivisionsAndSimultaneousHits() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let pattern = try XCTUnwrap(content.patterns.first { $0.id == "reggae-one-drop" })
        let events = PracticeRules.expectedHits(pattern: pattern, bpm: 120, repetitions: 2, startAt: 0)
        let atZero = events.filter { $0.at == 0 }
        XCTAssertEqual(Set(atZero.map(\.instrument)), Set([.hihat]))
        let repeated = events.filter { $0.repetition == 1 }
        XCTAssertEqual(repeated.first?.at, 2)
        XCTAssertEqual(events.count, pattern.hits.count * 2)

        var simultaneous = pattern
        simultaneous.beats = 5
        simultaneous.subdivision = 4
        simultaneous.hits = [PatternHit(step: 0, instrument: .kick), PatternHit(step: 0, instrument: .hihat)]
        let simultaneousEvents = PracticeRules.expectedHits(pattern: simultaneous, bpm: 100, repetitions: 1, startAt: 0)
        XCTAssertEqual(Set(simultaneousEvents.map(\.instrument)), Set([.kick, .hihat]))
        XCTAssertEqual(simultaneousEvents.map(\.at), [0, 0])
    }

    // DHM-040/041: matching is voice-aware, picks the nearest unmatched target, and consumes it once.
    func testTargetMatchingUsesClosestUnmatchedVoice() {
        var expected = [
            ExpectedHit(at: 0.00, instrument: .kick, step: 0, repetition: 0),
            ExpectedHit(at: 0.08, instrument: .kick, step: 1, repetition: 0),
            ExpectedHit(at: 0.02, instrument: .snare, step: 0, repetition: 0),
        ]
        XCTAssertNil(PracticeRules.closestUnmatchedIndex(at: 0.01, in: expected, instrument: .tom))
        XCTAssertEqual(PracticeRules.closestUnmatchedIndex(at: 0.07, in: expected, instrument: .kick), 1)
        expected[1].matched = true
        XCTAssertEqual(PracticeRules.closestUnmatchedIndex(at: 0.07, in: expected, instrument: .kick), 0)
    }

    // DHM-043/044: extras do not enter accuracy's denominator and break combo.
    func testResultSummaryMatchesWebScoringContract() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let pattern = try XCTUnwrap(content.patterns.first)
        let hits = [
            RatedHit(instrument: .kick, rating: .great, offsetMs: 0),
            RatedHit(instrument: .snare, rating: .good, offsetMs: 75),
            RatedHit(instrument: .hihat, rating: .miss, offsetMs: nil),
            RatedHit(instrument: .tom, rating: .extra, offsetMs: nil),
        ]
        let result = PracticeRules.result(pattern: pattern, bpm: 80, playedAt: Date(timeIntervalSince1970: 100), ratedHits: hits)
        XCTAssertEqual(result.score, 55)
        XCTAssertEqual(result.accuracy, 67)
        XCTAssertEqual(result.maxCombo, 2)
        XCTAssertEqual(result.extra, 1)
    }

    // DHM-039/044: an empty pattern resolves once to a zero-valued result without division errors.
    func testEmptyPatternResultHasZeroScoreAndAccuracy() throws {
        let content = try MobileContentDocument.load(from: Bundle(for: Self.self))
        let pattern = try XCTUnwrap(content.patterns.first)
        let result = PracticeRules.result(pattern: pattern, bpm: 80, playedAt: .now, ratedHits: [])
        XCTAssertEqual(result.score, 0)
        XCTAssertEqual(result.accuracy, 0)
        XCTAssertEqual(result.maxCombo, 0)
    }
}
