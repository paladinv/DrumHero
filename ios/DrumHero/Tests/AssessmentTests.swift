import XCTest
import SwiftData
@testable import DrumHero

final class AssessmentTests: XCTestCase {
    struct Fixtures: Decodable {
        struct Case: Decodable { var name: String; var probeId: String; var variant: Int?; var offsetMs: Double; var missing: Int; var extras: Int; var velocity: String; var score: Int; var accuracy: Int; var meanAbsoluteMs: Double?; var meanOffsetMs: Double?; var timingSpreadMs: Double?; var passed: Bool; var dynamicsContrast: Double? }
        struct QuizForm: Decodable { var resultId: String; var selectedIds: [String] }
        var version: Int
        var cases: [Case]
        var quizForms: [QuizForm]?
    }
    func testSharedWebIOSFixtures() throws {
        let bundle = Bundle(for: Self.self)
        let content = try AssessmentContent.load(bundle: bundle)
        let url = try XCTUnwrap(bundle.url(forResource: "assessment-fixtures-v1", withExtension: "json"))
        let fixtures = try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: url))
        for fixture in fixtures.cases {
            let probe = try XCTUnwrap(content.probes.first { $0.id == fixture.probeId }).variant(fixture.variant ?? 0)
            var hits = probe.pattern("standard").hits.dropFirst(fixture.missing).map { note in
                AssessmentInputHit(instrument: note.instrument, atMs: Double(note.step) * 60000 / Double(probe.bpm) * 4 / Double(probe.subdivision) + fixture.offsetMs, velocity: fixture.velocity == "constant" ? 80 : note.accent ? (fixture.velocity == "threshold" ? 75 : 110) : 55)
            }
            for i in 0..<fixture.extras { hits.append(AssessmentInputHit(instrument: .tom, atMs: 500 + Double(i * 20), velocity: 80)) }
            let result = AssessmentRules.score(probe, adaptation: "standard", hits: hits, content: content)
            XCTAssertEqual(result.score, fixture.score, fixture.name); XCTAssertEqual(result.accuracy, fixture.accuracy, fixture.name)
            XCTAssertEqual(result.passed, fixture.passed, fixture.name); XCTAssertEqual(result.meanAbsoluteMs, fixture.meanAbsoluteMs, fixture.name)
            XCTAssertEqual(result.meanOffsetMs, fixture.meanOffsetMs, fixture.name); XCTAssertEqual(result.timingSpreadMs, fixture.timingSpreadMs, fixture.name)
            XCTAssertEqual(result.dynamicsContrast, fixture.dynamicsContrast, fixture.name)
        }
        for fixture in fixtures.quizForms ?? [] {
            var result = AssessmentResult(input: "keyboard", inputProfile: "keyboard", adaptation: "standard")
            result.id = fixture.resultId
            XCTAssertEqual(result.questions(content).map(\.id), fixture.selectedIds, fixture.resultId)
        }
    }
    func testAdaptiveProgressionSkipsAndValidation() throws {
        let content = try AssessmentContent.load(bundle: Bundle(for: Self.self))
        var result = AssessmentResult(input: "keyboard", inputProfile: "keyboard", adaptation: "standard")
        XCTAssertNil(result.recommendation(content))
        let first = try XCTUnwrap(result.nextProbe(content))
        let failed = AssessmentRules.score(first, adaptation: "standard", hits: [], content: content)
        result.attempts.append(failed); XCTAssertEqual(result.nextProbe(content)?.id, "pulse-1")
        result.attempts.append(failed); XCTAssertEqual(result.nextProbe(content)?.id, "subdivisions-1")
        XCTAssertEqual(result.recommendation(content), "count-the-grid"); XCTAssertTrue(result.valid(content))
        result.skipped = ["subdivisions-1", "coordination-1"]
        XCTAssertNil(result.nextProbe(content))
        var empty = AssessmentResult(input: "touch", inputProfile: "touch", adaptation: "single-voice")
        empty.skipped = ["pulse-1", "subdivisions-1"]
        XCTAssertNil(empty.nextProbe(content)); XCTAssertNil(empty.recommendation(content))
        var invalidVariant = result; invalidVariant.attempts[0].variant = 1; XCTAssertFalse(invalidVariant.valid(content))
        result.attempts[0].score = 200; XCTAssertFalse(result.valid(content))
    }
    func testQuizFormsDiagnosticsAndRetryVariants() throws {
        let content = try AssessmentContent.load(bundle: Bundle(for: Self.self))
        var result = AssessmentResult(input: "keyboard", inputProfile: "keyboard", adaptation: "standard")
        result.id = "learner-one"
        let form = result.questions(content)
        XCTAssertEqual(form.count, 4); XCTAssertEqual(form.filter { $0.kind == "listening" }.count, 2); XCTAssertEqual(form.filter { $0.kind == "reading" }.count, 2)
        XCTAssertEqual(result.questions(content).map(\.id), form.map(\.id))
        let probe = try XCTUnwrap(content.probes.first { $0.id == "pulse-3" })
        XCTAssertNotEqual(probe.variant(1).hits.map(\.step), probe.hits.map(\.step))
        let hits = probe.variant(1).pattern("standard").hits.map { note in AssessmentInputHit(instrument: note.instrument, atMs: Double(note.step) * 60000 / Double(probe.bpm) * 4 / Double(probe.subdivision) + 20, velocity: 70) }
        let attempt = AssessmentRules.score(probe.variant(1), adaptation: "standard", hits: hits, content: content, variant: 1)
        XCTAssertEqual(attempt.variant, 1); XCTAssertEqual(attempt.meanOffsetMs, 20); XCTAssertEqual(attempt.timingSpreadMs, 0)
        result.attempts.append(attempt)
        let details = try XCTUnwrap(result.recommendationDetails(content))
        XCTAssertTrue(details.evidence.contains("matched")); XCTAssertTrue(details.goal.contains("85"))
        result.inputProfile = "midi:serial-123"; result.playedAt = "2026-10-22T12:00:00Z"
        let export = try XCTUnwrap(result.educatorReviewJSON(content))
        XCTAssertTrue(export.contains("drum-hero-assessment-review")); XCTAssertFalse(export.contains("learner-one")); XCTAssertFalse(export.contains("serial-123")); XCTAssertFalse(export.contains(result.playedAt))
    }
    func testProgressComparisonAndLegacyAttemptDecoding() throws {
        let content = try AssessmentContent.load(bundle: Bundle(for: Self.self))
        var older = AssessmentResult(input: "midi", inputProfile: "midi:device-a", adaptation: "standard")
        older.id = "older"; older.playedAt = "2026-10-21T12:00:00Z"
        older.attempts = [AssessmentRules.score(try XCTUnwrap(content.probes.first { $0.id == "pulse-1" }), adaptation: "standard", hits: [], content: content)]
        var newer = AssessmentResult(input: "midi", inputProfile: "midi:device-a", adaptation: "standard")
        newer.id = "newer"; newer.playedAt = "2026-10-22T12:00:00Z"
        newer.attempts = [AssessmentRules.score(try XCTUnwrap(content.probes.first { $0.id == "pulse-1" }), adaptation: "standard", hits: [], content: content)]
        XCTAssertTrue(try XCTUnwrap(newer.comparisonSummary(from: older)).contains("pulse: 0/3 → 0/3"))
        var otherDevice = older; otherDevice.inputProfile = "midi:device-b"
        XCTAssertNil(newer.comparisonSummary(from: otherDevice))
        let oldAttempt = Data(#"{"probeId":"pulse-1","score":0,"accuracy":0,"meanAbsoluteMs":null,"misses":16,"extras":0,"dynamicsContrast":null,"passed":false}"#.utf8)
        let decoded = try JSONDecoder().decode(AssessmentAttempt.self, from: oldAttempt)
        XCTAssertNil(decoded.variant); XCTAssertNil(decoded.meanOffsetMs); XCTAssertNil(decoded.timingSpreadMs)
    }
    func testMIDITimingCorrectionsAreStoredPerSourceWithLegacyFallback() {
        let defaults = UserDefaults.standard, source = "midi:assessment-test-source", key = NativeMIDICalibration.key(for: source)
        let oldSource = defaults.object(forKey: key), oldLegacy = defaults.object(forKey: NativeMIDICalibration.legacyKey)
        defer {
            if let oldSource { defaults.set(oldSource, forKey: key) } else { defaults.removeObject(forKey: key) }
            if let oldLegacy { defaults.set(oldLegacy, forKey: NativeMIDICalibration.legacyKey) } else { defaults.removeObject(forKey: NativeMIDICalibration.legacyKey) }
        }
        defaults.removeObject(forKey: key); defaults.set(35.0, forKey: NativeMIDICalibration.legacyKey)
        XCTAssertEqual(NativeMIDICalibration.correction(for: source), 35)
        NativeMIDICalibration.save(-20, for: source)
        XCTAssertEqual(NativeMIDICalibration.correction(for: source), -20)
        XCTAssertNotEqual(NativeMIDICalibration.key(for: source), NativeMIDICalibration.key(for: "midi:other-source"))
    }
    func testAdaptationsAndHistoryRetention() throws {
        let content = try AssessmentContent.load(bundle: Bundle(for: Self.self))
        let probe = try XCTUnwrap(content.probes.first { $0.id == "coordination-1" })
        let hits = probe.pattern("hands-only").hits
        XCTAssertFalse(hits.contains { $0.instrument == .kick }); XCTAssertEqual(Set(hits.map(\.id)).count, hits.count)
        var result = AssessmentResult(input: "touch", inputProfile: "touch", adaptation: "standard")
        result.answers = [AssessmentAnswer(questionId: "read-1", choice: 0)]
        var store = AssessmentStore(results: [result], appliedId: result.id)
        for i in 0..<25 { var copy = result; copy.id = "retake-\(i)"; store.append(copy) }
        XCTAssertEqual(store.results.count, 20); XCTAssertEqual(store.applied?.id, result.id); XCTAssertTrue(store.valid(content))
        let decoded = try JSONDecoder().decode(AssessmentStore.self, from: JSONEncoder().encode(store)); XCTAssertTrue(decoded.valid(content))
    }
    @MainActor
    func testLegacyBackupDoesNotClearAssessment() throws {
        let content = try MobileContentDocument.load()
        let backup = MobileProgressBackup.empty
        let encoded = try JSONEncoder().encode(backup)
        let decoded = try JSONDecoder().decode(MobileProgressBackup.self, from: encoded)
        XCTAssertNil(decoded.assessment)
        try decoded.validate(content: content)
        let previous = UserDefaults.standard.data(forKey: AssessmentHistory.key)
        defer { if let previous { UserDefaults.standard.set(previous, forKey: AssessmentHistory.key) } else { UserDefaults.standard.removeObject(forKey: AssessmentHistory.key) } }
        var result = AssessmentResult(input: "touch", inputProfile: "touch", adaptation: "standard")
        result.answers = [AssessmentAnswer(questionId: "read-1", choice: 0)]
        try AssessmentHistory.write(AssessmentStore(results: [result], appliedId: result.id))
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self, PatternBestRecord.self, TrainerRoundRecord.self, PersonalSongRecord.self, configurations: configuration)
        try decoded.restore(content: content, in: ModelContext(container))
        XCTAssertEqual(AssessmentHistory.read().appliedId, result.id)
        let newBackup = MobileProgressBackup(lessonProgress: [], practiceSessions: [], patternBests: [], trainerRounds: [])
        XCTAssertEqual(newBackup.assessment?.appliedId, result.id)
    }
}
