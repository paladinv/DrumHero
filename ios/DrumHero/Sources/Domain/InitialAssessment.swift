import Foundation

struct AssessmentContent: Decodable {
    struct Rules: Decodable { var score: Int; var meanAbsoluteMs: Double; var dynamicsAccuracy: Int; var dynamicsContrast: Double }
    let version: Int
    let rules: Rules
    let probes: [AssessmentProbe]
    let questions: [AssessmentQuestion]
    let lessons: [String: String]
    let focusPatterns: [String: String]
    static func load(bundle: Bundle = .main) throws -> Self {
        guard let url = bundle.url(forResource: "assessment-v1", withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
        return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }
}
struct AssessmentProbe: Decodable, Identifiable {
    var id: String
    var domain: String
    var tier: Int
    var name: String
    var bpm: Int
    var subdivision: Int
    var hits: [PatternHit]
    var alternates: [[PatternHit]]?
    func variant(_ index: Int) -> Self {
        guard index > 0, let rows = alternates, rows.indices.contains(index - 1) else { return self }
        var copy = self; copy.hits = rows[index - 1]; copy.alternates = nil; return copy
    }
    func pattern(_ adaptation: String, bars: Int = 4) -> PracticePattern {
        let notes = (0..<bars).flatMap { bar in hits.map { hit in
            var note = hit; note.step += bar * subdivision
            if adaptation == "hands-only" && note.instrument == .kick { note.instrument = .tom }
            return note
        } }
        return PracticePattern(id: "assessment-\(id)-\(adaptation)", name: name, level: .beginner, description: "Assessment probe", subdivision: subdivision, beats: Double(bars * 4), defaultBpm: bpm, tempoRange: [60, 90], hits: notes)
    }
    func notation(_ adaptation: String) -> SightExercise {
        SightExercise(seed: 0, settings: SightSettings(bpm: bpm, bars: 1, triplets: subdivision == 12), subdivision: subdivision, beatsPerBar: 4, stepsPerBar: subdivision, hits: pattern(adaptation, bars: 1).hits)
    }
}
struct AssessmentQuestion: Decodable, Identifiable {
    var id: String
    var kind: String
    var prompt: String
    var probeId: String
    var choices: [String]
    var answer: Int
    func shuffled(seed: UInt32) -> [Int] {
        var state = seed; var indices = Array(choices.indices)
        for i in stride(from: indices.count - 1, through: 1, by: -1) {
            state = state &* 1664525 &+ 1013904223
            indices.swapAt(i, Int(Double(state) / 4294967296 * Double(i + 1)))
        }
        return indices
    }
}
struct AssessmentInputHit { var instrument: DrumVoice; var atMs: Double; var velocity: Int? }
struct AssessmentAttempt: Codable {
    var probeId: String
    var variant: Int?
    var score: Int
    var accuracy: Int
    var meanAbsoluteMs: Double?
    var meanOffsetMs: Double?
    var timingSpreadMs: Double?
    var misses: Int
    var extras: Int
    var dynamicsContrast: Double?
    var passed: Bool
    init(probeId: String, variant: Int? = nil, score: Int, accuracy: Int, meanAbsoluteMs: Double?, meanOffsetMs: Double? = nil, timingSpreadMs: Double? = nil, misses: Int, extras: Int, dynamicsContrast: Double?, passed: Bool) {
        self.probeId = probeId; self.variant = variant; self.score = score; self.accuracy = accuracy
        self.meanAbsoluteMs = meanAbsoluteMs; self.meanOffsetMs = meanOffsetMs; self.timingSpreadMs = timingSpreadMs
        self.misses = misses; self.extras = extras; self.dynamicsContrast = dynamicsContrast; self.passed = passed
    }
    func passes(_ content: AssessmentContent) -> Bool {
        if probeId == "dynamics-1" {
            return accuracy >= content.rules.dynamicsAccuracy && dynamicsContrast.map { $0 >= content.rules.dynamicsContrast } == true
        }
        return score >= content.rules.score && meanAbsoluteMs.map { $0 <= content.rules.meanAbsoluteMs } == true
    }
}
struct AssessmentAnswer: Codable { var questionId: String; var choice: Int }
struct AssessmentResult: Codable, Identifiable {
    var version = 1
    var id = UUID().uuidString
    var playedAt = ISO8601DateFormatter().string(from: .now)
    var input: String
    var inputProfile: String
    var adaptation: String
    var attempts: [AssessmentAttempt] = []
    var answers: [AssessmentAnswer] = []
    var skipped: [String] = []
    var endedEarly = false
    private var stableSeed: Int { id.unicodeScalars.reduce(0) { $0 + Int($1.value) } }
    func questions(_ content: AssessmentContent) -> [AssessmentQuestion] {
        func shuffled(_ values: [AssessmentQuestion], seed: UInt32) -> [AssessmentQuestion] {
            var state = seed; var rows = values
            if rows.count > 1 {
                for i in stride(from: rows.count - 1, through: 1, by: -1) {
                    state = state &* 1664525 &+ 1013904223
                    rows.swapAt(i, Int(Double(state) / 4294967296 * Double(i + 1)))
                }
            }
            return rows
        }
        let listening = shuffled(content.questions.filter { $0.kind == "listening" }, seed: UInt32(truncatingIfNeeded: stableSeed + 17)).prefix(2)
        let reading = shuffled(content.questions.filter { $0.kind == "reading" }, seed: UInt32(truncatingIfNeeded: stableSeed + 31)).prefix(2)
        var selected: [AssessmentQuestion] = []
        for pair in zip(listening, reading) { selected.append(pair.0); selected.append(pair.1) }
        for answer in answers {
            if let legacy = content.questions.first(where: { $0.id == answer.questionId }), !selected.contains(where: { $0.id == legacy.id }) { selected.insert(legacy, at: 0) }
        }
        return Array(selected.prefix(4))
    }
    func probeVariantIndex(_ content: AssessmentContent) -> Int {
        guard let probe = nextProbe(content), let count = probe.alternates?.count, count > 0 else { return 0 }
        let retries = attempts.filter { $0.probeId == probe.id }.count
        return (stableSeed + retries) % (count + 1)
    }
    func educatorReviewJSON(_ content: AssessmentContent) -> String? {
        let attemptsForReview: [[String: Any]] = attempts.map { attempt in
            let probe = content.probes.first { $0.id == attempt.probeId }
            return ["task": probe?.name ?? attempt.probeId, "domain": probe?.domain ?? "unknown", "tier": probe?.tier ?? 0,
                    "variant": attempt.variant ?? 0, "score": attempt.score, "matchedPercent": attempt.accuracy,
                    "misses": attempt.misses, "extras": attempt.extras, "meanAbsoluteMs": attempt.meanAbsoluteMs as Any? ?? NSNull(),
                    "meanOffsetMs": attempt.meanOffsetMs as Any? ?? NSNull(), "timingSpreadMs": attempt.timingSpreadMs as Any? ?? NSNull(),
                    "dynamicsContrast": attempt.dynamicsContrast as Any? ?? NSNull(), "passed": attempt.passed]
        }
        let questionsForReview: [[String: Any]] = questions(content).map { question in
            let selected = answers.first { $0.questionId == question.id }?.choice
            return ["kind": question.kind, "prompt": question.prompt, "choices": question.choices,
                    "selectedChoice": selected as Any? ?? NSNull(), "answer": question.answer,
                    "correct": selected.map { $0 == question.answer } as Any? ?? NSNull()]
        }
        let payload: [String: Any] = ["format": "drum-hero-assessment-review", "version": 1, "contentVersion": content.version,
                                      "input": input, "adaptation": adaptation, "endedEarly": endedEarly,
                                      "attempts": attemptsForReview, "questions": questionsForReview]
        guard JSONSerialization.isValidJSONObject(payload), let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func comparisonSummary(from previous: AssessmentResult) -> String? {
        guard previous.inputProfile == inputProfile, previous.adaptation == adaptation,
              let currentDate = Self.date(playedAt), let previousDate = Self.date(previous.playedAt), previousDate < currentDate else { return nil }
        let domains = ["pulse", "subdivisions", "coordination"].compactMap { domain -> String? in
            let currentAttempt = attempts.contains { $0.probeId.hasPrefix(domain + "-") }
            let previousAttempt = previous.attempts.contains { $0.probeId.hasPrefix(domain + "-") }
            guard currentAttempt || previousAttempt else { return nil }
            let before = previousAttempt ? "\(previous.tier(domain))/3" : "untested"
            let after = currentAttempt ? "\(tier(domain))/3" : "untested"
            return "\(domain): \(before) → \(after)"
        }
        return domains.isEmpty ? nil : domains.joined(separator: " · ")
    }
    func tier(_ domain: String) -> Int { attempts.filter { $0.passed && $0.probeId.hasPrefix(domain + "-") }.compactMap { Int($0.probeId.split(separator: "-").last ?? "0") }.max() ?? 0 }
    func nextProbe(_ content: AssessmentContent) -> AssessmentProbe? {
        for domain in ["pulse", "subdivisions", "coordination"] + (input == "midi" ? ["dynamics"] : []) {
            if domain == "coordination" && adaptation == "single-voice" { continue }
            for probe in content.probes.filter({ $0.domain == domain }) {
                if skipped.contains(probe.id) { break }
                let rows = attempts.filter { $0.probeId == probe.id }
                if rows.contains(where: \.passed) { continue }
                if rows.count >= 2 || (domain == "dynamics" && !rows.isEmpty) { break }
                return probe
            }
        }
        return nil
    }
    func recommendation(_ content: AssessmentContent) -> String? {
        guard !attempts.isEmpty || !answers.isEmpty else { return nil }
        func has(_ domain: String) -> Bool { attempts.contains { $0.probeId.hasPrefix(domain + "-") } }
        let wrongReading = answers.contains { answer in content.questions.contains { $0.id == answer.questionId && $0.kind == "reading" && $0.answer != answer.choice } }
        if (has("pulse") && tier("pulse") < 2) || wrongReading { return content.lessons["pulse"] }
        if has("coordination") && tier("coordination") < 1 { return content.lessons["basicCoordination"] }
        if has("subdivisions") && tier("subdivisions") < 3 { return content.lessons["subdivisions"] }
        if (has("pulse") && tier("pulse") < 3) || (has("coordination") && tier("coordination") < 2) { return content.lessons["syncopation"] }
        if has("coordination") && tier("coordination") < 3 { return content.lessons["coordination"] }
        if attempts.contains(where: { $0.probeId == "dynamics-1" && $0.dynamicsContrast != nil && !$0.passed }) { return content.lessons["dynamics"] }
        return content.lessons[has("coordination") ? "coordination" : "pulse"]
    }
    func recommendationDetails(_ content: AssessmentContent) -> (evidence: String, goal: String)? {
        guard let lesson = recommendation(content) else { return nil }
        let domain: String
        if lesson == content.lessons["basicCoordination"] { domain = "coordination" }
        else if lesson == content.lessons["subdivisions"] { domain = "subdivisions" }
        else if lesson == content.lessons["syncopation"] { domain = tier("pulse") >= 3 ? "coordination" : "pulse" }
        else if lesson == content.lessons["coordination"] { domain = "coordination" }
        else if lesson == content.lessons["dynamics"] { domain = "dynamics" }
        else { domain = "pulse" }
        let wrongReading = answers.first { answer in content.questions.contains { $0.id == answer.questionId && $0.kind == "reading" && $0.answer != answer.choice } }
        if let answer = wrongReading, let question = content.questions.first(where: { $0.id == answer.questionId }) {
            return ("\(question.prompt) Correct answer: \(question.choices[question.answer]).", "Identify the rhythm on both notation questions, then demonstrate pulse tier 2.")
        }
        if let latest = attempts.last(where: { $0.probeId.hasPrefix(domain + "-") }), let probe = content.probes.first(where: { $0.id == latest.probeId }) {
            let direction = latest.meanOffsetMs.map { $0 > 0 ? "late" : $0 < 0 ? "early" : "on time" }
            let timing = direction.map { " · average \($0) by \(Int(abs(latest.meanOffsetMs ?? 0).rounded())) ms" } ?? ""
            let spread = latest.timingSpreadMs.map { " · timing spread \(Int($0.rounded())) ms" } ?? ""
            let evidence = "\(probe.name): \(latest.accuracy)% matched, \(latest.misses) missed, \(latest.extras) extra\(timing)\(spread)."
            let goal = lesson == content.lessons["dynamics"]
                ? "Match at least \(content.rules.dynamicsAccuracy)% of strokes with velocity contrast of \(Int(content.rules.dynamicsContrast)) or more."
                : "Reach a score of \(content.rules.score) or higher with mean absolute timing error at or below \(Int(content.rules.meanAbsoluteMs)) ms on the next \(domain) probe."
            return (evidence, goal)
        }
        return ("This is the earliest skill in the starting path without enough evidence yet.", "Complete the next \(domain) probe to check this skill.")
    }
    func valid(_ content: AssessmentContent) -> Bool {
        guard version == 1, !id.isEmpty, id.count <= 100, Self.date(playedAt) != nil,
              ["keyboard", "touch", "midi"].contains(input), inputProfile.count <= 200,
              ["standard", "hands-only", "single-voice"].contains(adaptation), attempts.count <= 20, answers.count <= 4, skipped.count <= 14,
              Set(skipped).count == skipped.count, Set(answers.map(\.questionId)).count == answers.count else { return false }
        let ids = content.probes.map(\.id) + content.questions.map(\.id)
        guard skipped.allSatisfy(ids.contains), answers.allSatisfy({ answer in content.questions.contains { $0.id == answer.questionId } && (0..<4).contains(answer.choice) }) else { return false }
        var replay = self; replay.attempts = []; replay.skipped = []
        for row in attempts {
            guard let probe = content.probes.first(where: { $0.id == row.probeId }), row.variant.map({ (0...(probe.alternates?.count ?? 0)).contains($0) }) ?? true, (0...100).contains(row.score), (0...100).contains(row.accuracy),
                  (0...10000).contains(row.misses), (0...10000).contains(row.extras),
                  row.meanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.meanOffsetMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true,
                  row.timingSpreadMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.dynamicsContrast.map({ $0.isFinite && abs($0) <= 126 }) ?? true, row.passed == row.passes(content) else { return false }
            while replay.nextProbe(content)?.id != row.probeId {
                guard let next = replay.nextProbe(content), skipped.contains(next.id) else { break }
                replay.skipped.append(next.id)
            }
            guard replay.nextProbe(content)?.id == row.probeId else { return false }
            replay.attempts.append(row)
        }
        return true
    }
    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions.insert(.withFractionalSeconds); return formatter.date(from: value)
    }
}
enum AssessmentRules {
    static func score(_ probe: AssessmentProbe, adaptation: String, hits: [AssessmentInputHit], content: AssessmentContent, variant: Int? = nil) -> AssessmentAttempt {
        let pattern = probe.pattern(adaptation)
        var expected = PracticeRules.expectedHits(pattern: pattern, bpm: probe.bpm, repetitions: 1, startAt: 0)
        var rated: [RatedHit] = []; var soft: [Double] = []; var accents: [Double] = []
        for hit in hits.filter({ $0.atMs.isFinite }).prefix(10000).sorted(by: { $0.atMs < $1.atMs }) {
            if let index = PracticeRules.closestUnmatchedIndex(at: hit.atMs / 1000, in: expected, instrument: hit.instrument), abs(expected[index].at * 1000 - hit.atMs) <= 100.000001 {
                let offset = hit.atMs - expected[index].at * 1000
                expected[index].matched = true
                rated.append(RatedHit(instrument: hit.instrument, rating: PracticeRules.classify(offsetMs: offset), offsetMs: Int(floor(offset + 0.5)), step: expected[index].step, repetition: 0))
                if let velocity = hit.velocity, (1...127).contains(velocity) {
                    if pattern.hits.contains(where: { $0.step == expected[index].step && $0.instrument == hit.instrument && $0.accent }) { accents.append(Double(velocity)) } else { soft.append(Double(velocity)) }
                }
            } else { rated.append(RatedHit(instrument: hit.instrument, rating: .extra)) }
        }
        rated += expected.filter { !$0.matched }.map { RatedHit(instrument: $0.instrument, rating: .miss) }
        let result = PracticeRules.result(pattern: pattern, bpm: probe.bpm, playedAt: .now, ratedHits: rated)
        let signedOffsets = rated.compactMap(\.offsetMs).map(Double.init)
        let offsets = signedOffsets.map(abs)
        func median(_ values: [Double]) -> Double { let sorted = values.sorted(); let i = sorted.count / 2; return sorted.count % 2 == 1 ? sorted[i] : (sorted[i-1] + sorted[i]) / 2 }
        let contrast = probe.domain == "dynamics" && soft.count >= 2 && accents.count >= 2 && Set(soft + accents).count > 1 ? median(accents) - median(soft) : nil
        let meanOffset = signedOffsets.isEmpty ? nil : signedOffsets.reduce(0, +) / Double(signedOffsets.count)
        let spread = meanOffset.map { mean in sqrt(signedOffsets.reduce(0) { $0 + pow($1 - mean, 2) } / Double(signedOffsets.count)) }
        var row = AssessmentAttempt(probeId: probe.id, variant: variant, score: result.score, accuracy: result.accuracy, meanAbsoluteMs: offsets.isEmpty ? nil : offsets.reduce(0, +) / Double(offsets.count), meanOffsetMs: meanOffset, timingSpreadMs: spread, misses: result.miss, extras: result.extra, dynamicsContrast: contrast, passed: false)
        row.passed = row.passes(content); return row
    }
}
struct AssessmentStore: Codable {
    var version = 1
    var results: [AssessmentResult] = []
    var appliedId: String?
    var applied: AssessmentResult? { results.first { $0.id == appliedId } }
    func valid(_ content: AssessmentContent) -> Bool {
        version == 1 && results.count <= 20 && results.allSatisfy { $0.valid(content) } && Set(results.map(\.id)).count == results.count && (appliedId == nil || results.contains { $0.id == appliedId && $0.recommendation(content) != nil })
    }
    mutating func append(_ result: AssessmentResult) {
        results.removeAll { $0.id == result.id }; results.append(result)
        if results.count > 20, let index = results.firstIndex(where: { $0.id != appliedId }) { results.remove(at: index) }
    }
}
enum AssessmentHistory {
    static let key = "drumHero.assessment.v1"
    static let changed = Notification.Name("drumHero.assessment.changed")
    static func read() -> AssessmentStore {
        guard let data = UserDefaults.standard.data(forKey: key), let content = try? AssessmentContent.load(), let store = try? JSONDecoder().decode(AssessmentStore.self, from: data), store.valid(content) else { return AssessmentStore() }
        return store
    }
    static func write(_ store: AssessmentStore) throws {
        let content = try AssessmentContent.load()
        guard store.valid(content) else { throw CocoaError(.coderInvalidValue) }
        UserDefaults.standard.set(try JSONEncoder().encode(store), forKey: key)
        NotificationCenter.default.post(name: changed, object: nil)
    }
}
