import XCTest
@testable import DrumHero

final class ContentAndRulesTests: XCTestCase {
    private struct FixtureDocument: Decodable {
        struct Case: Decodable { let id: String; let offsetMs: Double; let rating: HitRating }
        let schemaVersion: Int
        let cases: [Case]
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
