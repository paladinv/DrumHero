import Foundation

enum HitRating: String, Codable {
    case great, good, miss, extra
}

struct ExpectedHit: Hashable {
    let at: TimeInterval
    let instrument: DrumVoice
    let step: Int
    let repetition: Int
    var matched = false
}

struct RatedHit: Codable, Hashable, Identifiable {
    var id = UUID().uuidString
    var instrument: DrumVoice
    var rating: HitRating
    var offsetMs: Int?
    var step: Int?
    var repetition: Int?
}

struct PracticeResult: Codable, Identifiable, Hashable {
    var id = UUID().uuidString
    var patternID: String
    var patternName: String
    var bpm: Int
    var playedAt: Date
    var score: Int
    var accuracy: Int
    var great: Int
    var good: Int
    var miss: Int
    var extra: Int
    var maxCombo: Int
}

enum PracticeRules {
    static func classify(offsetMs: Double) -> HitRating {
        let magnitude = abs(offsetMs)
        if magnitude <= 50 { return .great }
        if magnitude <= 100 { return .good }
        return .miss
    }

    static func stepDuration(secondsPerBeat bpm: Int, subdivision: Int) -> TimeInterval {
        60 / Double(bpm) * 4 / Double(subdivision)
    }

    static func expectedHits(pattern: PracticePattern, bpm: Int, repetitions: Int, startAt: TimeInterval) -> [ExpectedHit] {
        let duration = Double(pattern.beats) * 60.0 / Double(bpm)
        let stepDuration = stepDuration(secondsPerBeat: bpm, subdivision: pattern.subdivision)
        var events: [ExpectedHit] = []
        for repetition in 0..<repetitions {
            for hit in pattern.hits {
                let repetitionOffset = Double(repetition) * duration
                let hitOffset = Double(hit.step) * stepDuration
                events.append(ExpectedHit(at: startAt + repetitionOffset + hitOffset,
                                          instrument: hit.instrument, step: hit.step, repetition: repetition))
            }
        }
        return events.sorted { left, right in
            if left.at != right.at { return left.at < right.at }
            return left.instrument.rawValue < right.instrument.rawValue
        }
    }

    static func closestUnmatchedIndex(at time: TimeInterval, in expected: [ExpectedHit], instrument: DrumVoice) -> Int? {
        expected.indices
            .filter { !expected[$0].matched && expected[$0].instrument == instrument }
            .min { abs(expected[$0].at - time) < abs(expected[$1].at - time) }
    }

    static func result(pattern: PracticePattern, bpm: Int, playedAt: Date, ratedHits: [RatedHit]) -> PracticeResult {
        let counts = Dictionary(grouping: ratedHits, by: \.rating)
        let great = counts[.great, default: []].count
        let good = counts[.good, default: []].count
        let miss = counts[.miss, default: []].count
        let extra = counts[.extra, default: []].count
        let expected = great + good + miss
        var combo = 0
        var maximumCombo = 0
        for hit in ratedHits {
            if hit.rating == .great || hit.rating == .good {
                combo += 1
                maximumCombo = max(maximumCombo, combo)
            } else { combo = 0 }
        }
        let points = great * 100 + good * 70
        let score = expected == 0 ? 0 : max(0, Int((Double(points) / Double(expected) - Double(extra * 2)).rounded()))
        let accuracy = expected == 0 ? 0 : Int((Double(great + good) / Double(expected) * 100).rounded())
        return PracticeResult(patternID: pattern.id, patternName: pattern.name, bpm: bpm, playedAt: playedAt,
                              score: score, accuracy: accuracy, great: great, good: good, miss: miss,
                              extra: extra, maxCombo: maximumCombo)
    }
}

enum TrainerRating: String, CaseIterable, Identifiable, Codable {
    case clean, needsWork, missed
    var id: String { rawValue }
    var title: String {
        switch self {
        case .clean: "Clean"
        case .needsWork: "Needs work"
        case .missed: "Missed"
        }
    }
}
