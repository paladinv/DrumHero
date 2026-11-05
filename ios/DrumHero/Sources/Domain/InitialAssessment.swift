import Foundation

struct AssessmentContent: Decodable {
    struct Rules: Decodable { var score: Int; var meanAbsoluteMs: Double; var dynamicsAccuracy: Int; var dynamicsContrast: Double; var pulseDropoutAccuracy: Int; var pulseDropoutDriftMs: Double; var fastTrackScore: Int; var fastTrackMeanAbsoluteMs: Double }
    struct TempoCheck: Decodable { var probeId: String; var bpms: [Int]; var minimumScore: Int; var minimumAccuracy: Int; var maximumMeanAbsoluteMs: Double; var retriesPerTempo: Int }
    let version: Int
    let rules: Rules
    let tempoCheck: TempoCheck
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
    var clickOnMeanAbsoluteMs: Double?
    var clickOffMeanAbsoluteMs: Double?
    var dropoutDriftMs: Double?
    var misses: Int
    var extras: Int
    var dynamicsContrast: Double?
    var passed: Bool
    init(probeId: String, variant: Int? = nil, score: Int, accuracy: Int, meanAbsoluteMs: Double?, meanOffsetMs: Double? = nil, timingSpreadMs: Double? = nil, clickOnMeanAbsoluteMs: Double? = nil, clickOffMeanAbsoluteMs: Double? = nil, dropoutDriftMs: Double? = nil, misses: Int, extras: Int, dynamicsContrast: Double?, passed: Bool) {
        self.probeId = probeId; self.variant = variant; self.score = score; self.accuracy = accuracy
        self.meanAbsoluteMs = meanAbsoluteMs; self.meanOffsetMs = meanOffsetMs; self.timingSpreadMs = timingSpreadMs
        self.clickOnMeanAbsoluteMs = clickOnMeanAbsoluteMs; self.clickOffMeanAbsoluteMs = clickOffMeanAbsoluteMs; self.dropoutDriftMs = dropoutDriftMs
        self.misses = misses; self.extras = extras; self.dynamicsContrast = dynamicsContrast; self.passed = passed
    }
    func passes(_ content: AssessmentContent) -> Bool {
        if probeId == "internal-pulse-1" {
            return accuracy >= content.rules.pulseDropoutAccuracy && clickOffMeanAbsoluteMs.map { $0 <= content.rules.meanAbsoluteMs } == true && dropoutDriftMs.map { abs($0) <= content.rules.pulseDropoutDriftMs } == true
        }
        if probeId == "dynamics-1" {
            return accuracy >= content.rules.dynamicsAccuracy && dynamicsContrast.map { $0 >= content.rules.dynamicsContrast } == true
        }
        return score >= content.rules.score && meanAbsoluteMs.map { $0 <= content.rules.meanAbsoluteMs } == true
    }
}
struct AssessmentAnswer: Codable { var questionId: String; var choice: Int }
struct AssessmentReflection: Codable, Identifiable { var domain: String; var rating: String; var id: String { domain } }
struct AssessmentTempoAttempt: Codable {
    var bpm: Int
    var score: Int
    var accuracy: Int
    var meanAbsoluteMs: Double?
    var meanOffsetMs: Double?
    var passed: Bool
    init(bpm: Int, attempt: AssessmentAttempt, content: AssessmentContent) {
        self.bpm = bpm; score = attempt.score; accuracy = attempt.accuracy
        meanAbsoluteMs = attempt.meanAbsoluteMs; meanOffsetMs = attempt.meanOffsetMs
        passed = content.tempoCheck.bpms.contains(bpm) && attempt.score >= content.tempoCheck.minimumScore && attempt.accuracy >= content.tempoCheck.minimumAccuracy && attempt.meanAbsoluteMs.map { $0 <= content.tempoCheck.maximumMeanAbsoluteMs } == true
    }
}
struct AssessmentTeacherLevels: Codable {
    var pulse: Int?
    var subdivisions: Int?
    var coordination: Int?
    var reading: Int?
}
struct AssessmentEducatorComparison: Codable {
    var teacherEstimatedLevel: AssessmentTeacherLevels
    var recommendedLessonFits: Bool?
    var disagreementNotes: String
    var pilotCode: String? = nil
}
struct AssessmentConfirmation: Codable { var probeId: String; var attempt: AssessmentAttempt }
struct AssessmentBorderline: Identifiable { var probe: AssessmentProbe; var attempt: AssessmentAttempt; var id: String { probe.id } }
struct AssessmentResult: Codable, Identifiable {
    var version = 1
    var contentVersion: Int?
    var id = UUID().uuidString
    var playedAt = ISO8601DateFormatter().string(from: .now)
    var input: String
    var inputProfile: String
    var adaptation: String
    var goal: String?
    var quizFormat: String?
    var timingCorrectionMs: Double?
    var timingCalibrated: Bool?
    var questionIds: [String]?
    var attempts: [AssessmentAttempt] = []
    var confirmations: [AssessmentConfirmation]?
    var reflections: [AssessmentReflection]?
    var transferAttempt: AssessmentAttempt?
    var internalPulseAttempt: AssessmentAttempt?
    var tempoAttempts: [AssessmentTempoAttempt]?
    var educatorComparison: AssessmentEducatorComparison?
    var answers: [AssessmentAnswer] = []
    var skipped: [String] = []
    var endedEarly = false
    private var stableSeed: UInt32 { id.unicodeScalars.reduce(UInt32(0x811c9dc5)) { ($0 ^ UInt32(truncatingIfNeeded: $1.value)) &* 0x01000193 } }
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
        if let questionIds, !questionIds.isEmpty {
            let fixed = questionIds.compactMap { id in content.questions.first { $0.id == id } }
            if fixed.count == questionIds.count { return fixed }
        }
        func preservePrevious(_ selected: [AssessmentQuestion]) -> [AssessmentQuestion] {
            let previousIDs = Set(answers.map(\.questionId) + skipped.filter { id in content.questions.contains { $0.id == id } })
            let previous = content.questions.filter { previousIDs.contains($0.id) }
            return Array((previous + selected.filter { !previousIDs.contains($0.id) }).prefix(4))
        }
        let allListening = shuffled(content.questions.filter { $0.kind == "listening" }, seed: stableSeed &+ 17)
        if quizFormat == "audio" {
            return preservePrevious(Array(allListening.prefix(4)))
        }
        let listening = allListening.prefix(2)
        let reading = shuffled(content.questions.filter { $0.kind == "reading" }, seed: stableSeed &+ 31).prefix(2)
        var selected: [AssessmentQuestion] = []
        for pair in zip(listening, reading) { selected.append(pair.0); selected.append(pair.1) }
        return preservePrevious(selected)
    }
    func readingSummary(_ content: AssessmentContent) -> (tier: Int?, correct: Int, answered: Int, total: Int) {
        let readingQuestions = questions(content).filter { $0.kind == "reading" }
        let readingAnswers = answers.filter { answer in readingQuestions.contains { $0.id == answer.questionId } }
        let correct = readingAnswers.filter { answer in readingQuestions.contains { $0.id == answer.questionId && $0.answer == answer.choice } }.count
        let tier = !readingQuestions.isEmpty && readingAnswers.count == readingQuestions.count
            ? min(3, Int((2.0 * Double(correct) / Double(readingQuestions.count)).rounded()) + 1)
            : nil
        return (tier, correct, readingAnswers.count, readingQuestions.count)
    }
    mutating func selectQuestionIDs(_ content: AssessmentContent, history: [AssessmentResult]) {
        func shuffled(_ values: [AssessmentQuestion], seed: UInt32) -> [AssessmentQuestion] {
            var state=seed;var rows=values
            if rows.count>1 { for i in stride(from:rows.count-1,through:1,by:-1) { state=state &* 1664525 &+ 1013904223;rows.swapAt(i,Int(Double(state)/4294967296*Double(i+1))) } }
            return rows
        }
        let seen=Set(history.flatMap { row in row.questionIds ?? row.questions(content).map(\.id) })
        let listening=shuffled(content.questions.filter{$0.kind=="listening"},seed:stableSeed &+ 17)
        let reading=shuffled(content.questions.filter{$0.kind=="reading"},seed:stableSeed &+ 31)
        func choose(_ rows:[AssessmentQuestion],_ count:Int)->[AssessmentQuestion] { Array((rows.filter{!seen.contains($0.id)}+rows.filter{seen.contains($0.id)}).prefix(count)) }
        if quizFormat=="audio" { questionIds=choose(listening,4).map(\.id) }
        else { let audio=choose(listening,2),notation=choose(reading,3);questionIds=[audio.first?.id,notation.first?.id,audio.dropFirst().first?.id,notation.dropFirst().first?.id,notation.dropFirst(2).first?.id].compactMap{$0} }
    }
    func probeVariantIndex(_ content: AssessmentContent) -> Int {
        guard let probe = nextProbe(content), let count = probe.alternates?.count, count > 0 else { return 0 }
        let retries = attempts.filter { $0.probeId == probe.id }.count
        return Int(stableSeed &+ UInt32(truncatingIfNeeded: retries)) % (count + 1)
    }
    func questionChoiceSeed(_ question: AssessmentQuestion, content: AssessmentContent) -> UInt32 {
        stableSeed &+ UInt32(truncatingIfNeeded: content.questions.firstIndex(where: { $0.id == question.id }) ?? 0)
    }
    func borderlineAttempts(_ content:AssessmentContent)->[AssessmentBorderline] {
        let confirmed=Set((confirmations ?? []).map(\.probeId))
        var latest:[String:AssessmentAttempt]=[:];for row in attempts{latest[row.probeId]=row}
        return latest.compactMap { id,attempt in
            guard !confirmed.contains(id),let probe=content.probes.first(where:{$0.id==id}),["pulse","subdivisions","coordination"].contains(probe.domain) else{return nil}
            let close=abs(attempt.score-content.rules.score)<=5 || attempt.meanAbsoluteMs.map{abs($0-content.rules.meanAbsoluteMs)<=5}==true
            return close ? AssessmentBorderline(probe:probe,attempt:attempt) : nil
        }
    }
    func confirmationVariant(_ probeId:String,content:AssessmentContent)->Int {
        guard let original=attempts.last(where:{$0.probeId==probeId}),let probe=content.probes.first(where:{$0.id==probeId}) else{return 0}
        let forms=(probe.alternates?.count ?? 0)+1;return forms>1 ? ((original.variant ?? 0)+1)%forms : 0
    }
    func confirmationLabel(_ probeId:String)->String {
        guard let original=attempts.last(where:{$0.probeId==probeId}),let followUp=confirmations?.first(where:{$0.probeId==probeId})?.attempt else{return "Follow-up check complete."}
        return original.passed==followUp.passed ? "Consistent on the follow-up check" : "Results differed on the follow-up check"
    }
    func microPractice(_ content:AssessmentContent)->(bpm:Int,voice:String?,focus:String,steps:[String])? {
        guard let lesson=recommendation(content) else{return nil}
        let domain=lesson==content.lessons["basicCoordination"] || lesson==content.lessons["coordination"] || lesson==content.lessons["syncopation"] && tier("pulse")>=3 ? "coordination" : lesson==content.lessons["subdivisions"] ? "subdivisions" : lesson==content.lessons["dynamics"] ? "dynamics" : "pulse"
        guard let latest=attempts.last(where:{$0.probeId.hasPrefix(domain+"-")}),let probe=content.probes.first(where:{$0.id==latest.probeId}) else{return nil}
        let reportedHard=(reflections ?? []).contains { $0.domain == domain && $0.rating == "hard" }
        let bpm=max(50,Int((Double(probe.bpm)*(reportedHard ? 0.75 : 0.85)/5).rounded())*5)
        let measuredVoice=probe.hits.first?.instrument.rawValue
        let voice=adaptation == "single-voice" ? "snare" : adaptation == "hands-only" && measuredVoice == "kick" ? "tom" : measuredVoice
        let focus:String
        if latest.extras>0 && latest.extras>=latest.misses { focus="Count through the rests; keep unmarked spaces quiet." }
        else if latest.misses>0 { focus="Count aloud, then add the missed strokes only after the pulse feels steady." }
        else if (latest.timingSpreadMs ?? 0)>55 { focus="Aim for even spacing and relaxed strokes." }
        else if (latest.meanOffsetMs ?? 0)>18 { focus="Wait for the beat; your notes tended late." }
        else if (latest.meanOffsetMs ?? 0)<(-18) { focus="Let the beat land before the stroke; your notes tended early." }
        else { focus="Play the groove evenly and build speed only when it feels comfortable." }
        let groove=adaptation == "single-voice" ? "same voice" : adaptation == "hands-only" ? "adapted groove" : "full groove"
        return (bpm,voice,focus,["0–20 seconds: count the pulse aloud at \(bpm) BPM.","20–40 seconds: practice \(voice ?? domain) alone; \(focus)","40–60 seconds: add the \(groove) while keeping the same pulse."])
    }
    func nextTempoBpm(_ content: AssessmentContent) -> Int? {
        for bpm in content.tempoCheck.bpms {
            let rows = (tempoAttempts ?? []).filter { $0.bpm == bpm }
            if rows.contains(where: \.passed) { continue }
            return rows.count <= content.tempoCheck.retriesPerTempo ? bpm : nil
        }
        return nil
    }
    func highestDemonstratedTempo(_ content: AssessmentContent) -> Int? {
        content.tempoCheck.bpms.filter { bpm in (tempoAttempts ?? []).contains { $0.bpm == bpm && $0.passed } }.max()
    }
    func educatorReviewJSON(_ content: AssessmentContent) -> String? {
        let attemptsForReview: [[String: Any]] = attempts.map { attempt in
            let probe = content.probes.first { $0.id == attempt.probeId }
            return ["probeId": attempt.probeId, "task": probe?.name ?? attempt.probeId, "domain": probe?.domain ?? "unknown", "tier": probe?.tier ?? 0,
                    "variant": attempt.variant ?? 0, "score": attempt.score, "matchedPercent": attempt.accuracy,
                    "misses": attempt.misses, "extras": attempt.extras, "meanAbsoluteMs": attempt.meanAbsoluteMs as Any? ?? NSNull(),
                    "meanOffsetMs": attempt.meanOffsetMs as Any? ?? NSNull(), "timingSpreadMs": attempt.timingSpreadMs as Any? ?? NSNull(),
                    "clickOnMeanAbsoluteMs": attempt.clickOnMeanAbsoluteMs as Any? ?? NSNull(), "clickOffMeanAbsoluteMs": attempt.clickOffMeanAbsoluteMs as Any? ?? NSNull(), "dropoutDriftMs": attempt.dropoutDriftMs as Any? ?? NSNull(),
                    "dynamicsContrast": attempt.dynamicsContrast as Any? ?? NSNull(), "passed": attempt.passed]
        }
        let questionsForReview: [[String: Any]] = questions(content).map { question in
            let selected = answers.first { $0.questionId == question.id }?.choice
            return ["itemId": question.id, "kind": question.kind, "prompt": question.prompt, "choices": question.choices,
                    "selectedChoice": selected as Any? ?? NSNull(), "answer": question.answer,
                    "correct": selected.map { $0 == question.answer } as Any? ?? NSNull()]
        }
        let reading = readingSummary(content)
        let readingTier: Any = reading.tier.map { $0 as Any } ?? NSNull()
        let transfer: Any = transferAttempt.map { attempt in
            ["task": "Fresh groove transfer check", "probeId": attempt.probeId, "variant": attempt.variant ?? 0,
             "score": attempt.score, "matchedPercent": attempt.accuracy, "misses": attempt.misses, "extras": attempt.extras,
             "meanAbsoluteMs": attempt.meanAbsoluteMs as Any? ?? NSNull(), "meanOffsetMs": attempt.meanOffsetMs as Any? ?? NSNull(),
             "timingSpreadMs": attempt.timingSpreadMs as Any? ?? NSNull(), "passed": attempt.passed] as [String: Any]
        } ?? NSNull()
        let internalPulse: Any = internalPulseAttempt.map { attempt in
            ["task": "Metronome dropout pulse check", "probeId": attempt.probeId, "score": attempt.score, "matchedPercent": attempt.accuracy,
             "clickOnMeanAbsoluteMs": attempt.clickOnMeanAbsoluteMs as Any? ?? NSNull(), "clickOffMeanAbsoluteMs": attempt.clickOffMeanAbsoluteMs as Any? ?? NSNull(),
             "dropoutDriftMs": attempt.dropoutDriftMs as Any? ?? NSNull(), "passed": attempt.passed] as [String: Any]
        } ?? NSNull()
        let tempoCheck: Any = (tempoAttempts ?? []).isEmpty ? NSNull() : [
            "highestDemonstratedBpm": highestDemonstratedTempo(content) as Any? ?? NSNull(),
            "attempts": (tempoAttempts ?? []).map { ["bpm": $0.bpm, "score": $0.score, "matchedPercent": $0.accuracy, "meanAbsoluteMs": $0.meanAbsoluteMs as Any? ?? NSNull(), "passed": $0.passed] as [String: Any] }
        ] as [String: Any]
        let teacher = educatorComparison?.teacherEstimatedLevel
        let educatorTemplate: [String: Any] = ["scale": ["not assessed", "needs foundation", "developing", "independent"],
            "teacherEstimatedLevel": ["pulse": teacher?.pulse as Any? ?? NSNull(), "subdivisions": teacher?.subdivisions as Any? ?? NSNull(), "coordination": teacher?.coordination as Any? ?? NSNull(), "reading": teacher?.reading as Any? ?? NSNull()],
            "recommendedLessonFits": educatorComparison?.recommendedLessonFits as Any? ?? NSNull(), "disagreementNotes": educatorComparison?.disagreementNotes ?? "", "pilotCode": educatorComparison?.pilotCode as Any? ?? NSNull()]
        var appTiers: [String: Any] = ["reading": readingTier]
        for domain in ["pulse", "subdivisions", "coordination"] {
            appTiers[domain] = attempts.contains { $0.probeId.hasPrefix(domain + "-") } ? tier(domain) as Any : NSNull()
        }
        let confirmationsJSON:[[String:Any]]=(confirmations ?? []).map { ["probeId":$0.probeId,"passed":$0.attempt.passed,"score":$0.attempt.score,"matchedPercent":$0.attempt.accuracy,"meanAbsoluteMs":$0.attempt.meanAbsoluteMs as Any? ?? NSNull()] }
        let payload: [String: Any] = ["format": "drum-hero-assessment-review", "version": 1, "contentVersion": contentVersion as Any? ?? NSNull(),
                                      "input": input, "adaptation": adaptation, "goal": goal ?? "balanced", "quizFormat": quizFormat ?? "visual", "endedEarly": endedEarly,
                                      "timingCorrectionMs": timingCorrectionMs as Any? ?? NSNull(), "timingCalibrated": timingCalibrated as Any? ?? NSNull(),
                                      "recommendedLesson": recommendation(content) as Any? ?? NSNull(), "appTiers": appTiers, "pilotCode": educatorComparison?.pilotCode as Any? ?? NSNull(), "learnerFeedback": (reflections ?? []).map { ["domain": $0.domain, "rating": $0.rating] },
                                      "transfer": transfer, "internalPulse": internalPulse, "tempoCheck": tempoCheck, "confirmations": confirmationsJSON,
                                      "educatorComparisonTemplate": educatorTemplate,
                                      "attempts": attemptsForReview, "questions": questionsForReview]
        guard JSONSerialization.isValidJSONObject(payload), let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func comparisonSummary(from previous: AssessmentResult) -> String? {
        guard previous.inputProfile == inputProfile, previous.adaptation == adaptation, previous.contentVersion == contentVersion,
              previous.timingCalibrated == timingCalibrated,
              abs((previous.timingCorrectionMs ?? 0) - (timingCorrectionMs ?? 0)) < 10,
              let currentDate = Self.date(playedAt), let previousDate = Self.date(previous.playedAt), previousDate < currentDate else { return nil }
        var domains = ["pulse", "subdivisions", "coordination"].compactMap { domain -> String? in
            let currentAttempt = attempts.contains { $0.probeId.hasPrefix(domain + "-") }
            let previousAttempt = previous.attempts.contains { $0.probeId.hasPrefix(domain + "-") }
            guard currentAttempt || previousAttempt else { return nil }
            let before = previousAttempt ? "\(previous.tier(domain))/3" : "untested"
            let after = currentAttempt ? "\(tier(domain))/3" : "untested"
            return "\(domain): \(before) → \(after)"
        }
        if let before = previous.transferAttempt, let after = transferAttempt { domains.append("fresh-pattern transfer: \(before.accuracy)% → \(after.accuracy)% matched") }
        if let before = previous.internalPulseAttempt, let after = internalPulseAttempt {
            domains.append("internal-pulse drift: \(Int(abs(before.dropoutDriftMs ?? 0).rounded())) ms → \(Int(abs(after.dropoutDriftMs ?? 0).rounded())) ms")
        }
        if !(previous.tempoAttempts ?? []).isEmpty, !(tempoAttempts ?? []).isEmpty {
            let before = (previous.tempoAttempts ?? []).filter(\.passed).map(\.bpm).max()
            let after = (tempoAttempts ?? []).filter(\.passed).map(\.bpm).max()
            domains.append("tempo ceiling: \(before.map { "\($0) BPM" } ?? "not demonstrated") → \(after.map { "\($0) BPM" } ?? "not demonstrated")")
        }
        return domains.isEmpty ? nil : domains.joined(separator: " · ")
    }
    func tier(_ domain: String) -> Int { attempts.filter { $0.passed && $0.probeId.hasPrefix(domain + "-") }.compactMap { Int($0.probeId.split(separator: "-").last ?? "0") }.max() ?? 0 }
    func confidence(_ domain: String, content: AssessmentContent) -> String {
        let rows = attempts.filter { $0.probeId.hasPrefix(domain + "-") }
        guard !rows.isEmpty else { return "not-tested" }
        if fastTrackedProbeIDs(content).contains(where: { $0.hasPrefix(domain + "-") }) { return "tentative" }
        let passed = rows.filter(\.passed)
        guard !passed.isEmpty else { return "limited-evidence" }
        let highest = tier(domain)
        guard let strongest = passed.last(where: { Int($0.probeId.split(separator: "-").last ?? "0") == highest }) else { return "tentative" }
        let distinct = Set(passed.map(\.probeId)).count
        let comfortablyClear = strongest.score >= 90 && (strongest.meanAbsoluteMs ?? 100) <= 45
        return distinct >= 2 && rows.allSatisfy(\.passed) && comfortablyClear ? "supported" : "tentative"
    }
    private func fastTrackTriggered(_ domain: String, _ content: AssessmentContent) -> Bool {
        guard let first = content.probes.first(where: { $0.domain == domain && $0.tier == 1 }),
              let attempt = attempts.first(where: { $0.probeId == first.id }) else { return false }
        return attempt.passed && attempt.score >= content.rules.fastTrackScore && (attempt.meanAbsoluteMs ?? .infinity) <= content.rules.fastTrackMeanAbsoluteMs
    }
    func fastTrackedProbeIDs(_ content: AssessmentContent) -> [String] {
        ["pulse", "subdivisions", "coordination"].compactMap { domain in
            guard fastTrackTriggered(domain, content),
                  let middle = content.probes.first(where: { $0.domain == domain && $0.tier == 2 }),
                  let challenge = content.probes.first(where: { $0.domain == domain && $0.tier == 3 }),
                  attempts.contains(where: { $0.probeId == challenge.id }),
                  !attempts.contains(where: { $0.probeId == middle.id }) else { return nil }
            return middle.id
        }
    }
    func nextProbe(_ content: AssessmentContent) -> AssessmentProbe? {
        for domain in ["pulse", "subdivisions", "coordination"] + (input == "midi" ? ["dynamics"] : []) {
            if domain == "coordination" && adaptation == "single-voice" { continue }
            for probe in content.probes.filter({ $0.domain == domain }) {
                if skipped.contains(probe.id) { break }
                let rows = attempts.filter { $0.probeId == probe.id }
                if fastTrackTriggered(domain, content), probe.tier == 2 {
                    let challenge = content.probes.first { $0.domain == domain && $0.tier == 3 }
                    let challengeRows = challenge.map { target in attempts.filter { $0.probeId == target.id } } ?? []
                    if challengeRows.count < 2 || challengeRows.contains(where: \.passed) { continue }
                }
                if rows.contains(where: \.passed) { continue }
                if rows.count >= 2 || (domain == "dynamics" && !rows.isEmpty) { break }
                return probe
            }
        }
        return nil
    }
    func recommendation(_ content: AssessmentContent) -> String? {
        guard !attempts.isEmpty || !answers.isEmpty || internalPulseAttempt != nil else { return nil }
        func has(_ domain: String) -> Bool { attempts.contains { $0.probeId.hasPrefix(domain + "-") } }
        let wrongReading = answers.contains { answer in content.questions.contains { $0.id == answer.questionId && $0.kind == "reading" && $0.answer != answer.choice } }
        let dynamicsNeedsPractice = attempts.contains { $0.probeId == "dynamics-1" && $0.dynamicsContrast != nil && !$0.passed }
        if let pulse = internalPulseAttempt, !pulse.passed { return content.lessons["pulse"] }
        if goal == "read-notation", quizFormat != "audio", answers.contains(where: { answer in content.questions.contains { $0.id == answer.questionId && $0.kind == "reading" } }) { return content.lessons["reading"] }
        if has("pulse") && tier("pulse") < 1 { return content.lessons["pulse"] }
        if goal == "play-with-others", adaptation != "single-voice", has("coordination"), tier("coordination") < 1 { return content.lessons["basicCoordination"] }
        if goal == "play-expressively", dynamicsNeedsPractice, tier("pulse") >= 1 { return content.lessons["dynamics"] }
        if wrongReading { return content.lessons["pulse"] }
        if (has("pulse") && tier("pulse") < 2) || wrongReading { return content.lessons["pulse"] }
        if has("coordination") && tier("coordination") < 1 { return content.lessons["basicCoordination"] }
        if has("subdivisions") && tier("subdivisions") < 3 { return content.lessons["subdivisions"] }
        if (has("pulse") && tier("pulse") < 3) || (has("coordination") && tier("coordination") < 2) { return content.lessons["syncopation"] }
        if has("coordination") && tier("coordination") < 3 { return content.lessons["coordination"] }
        if dynamicsNeedsPractice { return content.lessons["dynamics"] }
        return content.lessons[has("coordination") ? "coordination" : "pulse"]
    }
    func goalLabel() -> String {
        switch goal ?? "balanced" {
        case "play-with-others": return "Play with others"
        case "read-notation": return "Read drum notation"
        case "play-expressively": return "Play expressively"
        default: return "Build a balanced foundation"
        }
    }
    func practiceTip(_ content: AssessmentContent) -> String {
        guard let lesson = recommendation(content) else { return "Complete one short task to get a focused practice tip." }
        let domain = lesson == content.lessons["basicCoordination"] || lesson == content.lessons["coordination"] || (lesson == content.lessons["syncopation"] && tier("pulse") >= 3) ? "coordination" : lesson == content.lessons["subdivisions"] ? "subdivisions" : lesson == content.lessons["dynamics"] ? "dynamics" : "pulse"
        guard let latest = attempts.last(where: { $0.probeId.hasPrefix(domain + "-") }) else { return "Start slowly and count each beat aloud while you practice \(domain)." }
        if latest.extras > 0 && latest.extras >= latest.misses { return "Leave every unmarked space quiet. Count through the rests before adding more notes." }
        if latest.misses > 0 { return "Keep the tempo comfortable and count aloud. Add the missed notes only after the pulse feels steady." }
        if (latest.timingSpreadMs ?? 0) > 55 { return "Relax your hands and aim for even spacing. A smaller timing spread means steadier notes." }
        if (latest.meanOffsetMs ?? 0) > 18 { return "Your notes tended to arrive late. Stay close to the count-in and let the beat carry you." }
        if (latest.meanOffsetMs ?? 0) < -18 { return "Your notes tended to arrive early. Let the beat land before each stroke." }
        return "Your timing was steady on this task. Practice \(lesson.replacingOccurrences(of: "-", with: " ")) at an easy tempo, then build speed gradually."
    }
    func qualityNotes(_ content: AssessmentContent) -> (evidence: Int, expected: Int, level: String, flags: [String]) {
        let expectedProbes = content.probes.filter { probe in
            (["pulse", "subdivisions", "coordination"].contains(probe.domain) && !(adaptation == "single-voice" && probe.domain == "coordination")) || (probe.domain == "dynamics" && input == "midi")
        }
        let questionsForResult = questions(content)
        let attemptedIDs = Set(attempts.filter { attempt in expectedProbes.contains { $0.id == attempt.probeId } }.map(\.probeId))
        let answered = answers.filter { answer in questionsForResult.contains { $0.id == answer.questionId } }.count
        let evidence = attemptedIDs.count + answered
        let accelerated = fastTrackedProbeIDs(content)
        let expected = expectedProbes.count + questionsForResult.count - accelerated.filter { id in expectedProbes.contains { $0.id == id } }.count
        let rows = attempts.filter { attempt in expectedProbes.contains { $0.id == attempt.probeId } }
        var flags: [String] = []
        if evidence < expected || !skipped.isEmpty || endedEarly { flags.append("Limited coverage: \(evidence) of \(expected) core tasks produced evidence. Skipped and untested tasks remain unknown.") }
        if rows.contains(where: { $0.accuracy < 60 || $0.score < 50 }) { flags.append("Some tasks had very few matched hits. Check input mapping and timing correction before interpreting those results.") }
        if rows.contains(where: { ($0.score >= content.rules.score - 5 && $0.score <= content.rules.score + 5) || (($0.meanAbsoluteMs ?? -100) >= content.rules.meanAbsoluteMs - 5 && ($0.meanAbsoluteMs ?? -100) <= content.rules.meanAbsoluteMs + 5) }) { flags.append("Some scores were close to a cutoff. A retake after checking calibration may give a clearer estimate.") }
        if rows.contains(where: { row in rows.filter { $0.probeId == row.probeId }.count > 1 }) { flags.append("At least one skill needed a retry; treat that tier as tentative.") }
        if let correction = timingCorrectionMs, abs(correction) >= 80 { flags.append("A large timing correction (\(Int(correction.rounded())) ms) was active. Compare retakes with the same setup.") }
        if timingCalibrated == false { flags.append("Timing was not calibrated for this input profile. Device latency may affect comparisons; calibrate before interpreting close results.") }
        if !accelerated.isEmpty { flags.append("A strong early result skipped an intermediate probe. That tier remains untested; the harder probe gives a faster placement estimate.") }
        if flags.isEmpty { flags.append("Broad coverage with no obvious input or cutoff warning. This remains a starting-point estimate.") }
        return (evidence, expected, evidence < expected || rows.contains(where: { $0.accuracy < 60 || $0.score < 50 }) ? "limited" : timingCalibrated == false || !accelerated.isEmpty || flags.count > 1 ? "review" : "broad", flags)
    }
    func transferVariant(_ content: AssessmentContent) -> Int {
        guard let probe = content.probes.first(where: { $0.id == "transfer-1" }), let alternates = probe.alternates, !alternates.isEmpty else { return 0 }
        return Int(stableSeed % UInt32(alternates.count + 1))
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
        if lesson == content.lessons["pulse"], let dropout = internalPulseAttempt, !dropout.passed {
            let drift = Int(abs(dropout.dropoutDriftMs ?? 0).rounded())
            return ("Metronome dropout check: \(dropout.accuracy)% matched; timing drifted \(drift) ms after the click stopped.", "Keep matched timing error at or below \(Int(content.rules.meanAbsoluteMs)) ms and drift at or below \(Int(content.rules.pulseDropoutDriftMs)) ms through two quiet bars.")
        }
        if let answer = wrongReading, let question = content.questions.first(where: { $0.id == answer.questionId }) {
            return ("\(question.prompt) Correct answer: \(question.choices[question.answer]).", "Identify the rhythms in the notation questions, then demonstrate pulse tier 2.")
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
        guard version == 1, contentVersion.map({ (1...1000).contains($0) }) ?? true, !id.isEmpty, id.count <= 100, Self.date(playedAt) != nil,
              ["keyboard", "touch", "midi"].contains(input), inputProfile.count <= 200,
              ["standard", "hands-only", "single-voice"].contains(adaptation), goal.map({ ["balanced", "play-with-others", "read-notation", "play-expressively"].contains($0) }) ?? true,
              quizFormat.map({ ["visual", "audio"].contains($0) }) ?? true, timingCorrectionMs.map({ $0.isFinite && abs($0) <= 250 }) ?? true, attempts.count <= 20, answers.count <= 5, skipped.count <= 20,
              Set(skipped).count == skipped.count, Set(answers.map(\.questionId)).count == answers.count else { return false }
        let ids = content.probes.map(\.id) + content.questions.map(\.id)
        guard skipped.allSatisfy(ids.contains), answers.allSatisfy({ answer in content.questions.contains { $0.id == answer.questionId } && (0..<4).contains(answer.choice) }) else { return false }
        if let questionIds { guard [4, 5].contains(questionIds.count), Set(questionIds).count == questionIds.count, questionIds.allSatisfy({ id in content.questions.contains { $0.id == id } }) else { return false } }
        if let reflections { guard reflections.count <= 3, Set(reflections.map(\.domain)).count == reflections.count, reflections.allSatisfy({ ["pulse", "subdivisions", "coordination"].contains($0.domain) && ["easy", "about-right", "hard", "input-issue"].contains($0.rating) }) else { return false } }
        var replay = self; replay.attempts = []; replay.skipped = []
        for row in attempts {
            guard let probe = content.probes.first(where: { $0.id == row.probeId }), row.variant.map({ (0...(probe.alternates?.count ?? 0)).contains($0) }) ?? true, (0...100).contains(row.score), (0...100).contains(row.accuracy),
                  (0...10000).contains(row.misses), (0...10000).contains(row.extras),
                  row.meanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.meanOffsetMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true,
                  row.timingSpreadMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.clickOnMeanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.clickOffMeanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.dropoutDriftMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true,
                  row.dynamicsContrast.map({ $0.isFinite && abs($0) <= 126 }) ?? true, row.passed == row.passes(content) else { return false }
            while replay.nextProbe(content)?.id != row.probeId {
                guard let next = replay.nextProbe(content), skipped.contains(next.id) else { break }
                replay.skipped.append(next.id)
            }
            guard replay.nextProbe(content)?.id == row.probeId else { return false }
            replay.attempts.append(row)
        }
        if let row = transferAttempt {
            guard row.probeId == "transfer-1", let probe = content.probes.first(where: { $0.id == row.probeId }), row.variant.map({ (0...(probe.alternates?.count ?? 0)).contains($0) }) ?? true,
                  (0...100).contains(row.score), (0...100).contains(row.accuracy), (0...10000).contains(row.misses), (0...10000).contains(row.extras),
                  row.meanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.meanOffsetMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true,
                  row.timingSpreadMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.dynamicsContrast == nil, row.passed == row.passes(content) else { return false }
        }
        if let row = internalPulseAttempt {
            guard row.probeId == "internal-pulse-1", row.variant == nil || row.variant == 0,
                  (0...100).contains(row.score), (0...100).contains(row.accuracy), (0...10000).contains(row.misses), (0...10000).contains(row.extras),
                  row.meanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.meanOffsetMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true,
                  row.timingSpreadMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  row.clickOnMeanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) != nil,
                  row.clickOffMeanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) != nil,
                  row.dropoutDriftMs.map({ $0.isFinite && abs($0) <= 100 }) != nil,
                  row.dynamicsContrast == nil, row.passed == row.passes(content) else { return false }
        }
        if let rows = tempoAttempts {
            guard rows.count <= content.tempoCheck.bpms.count * (content.tempoCheck.retriesPerTempo + 1) else { return false }
            var replay = self; replay.tempoAttempts = []
            for row in rows {
                let expectedPass = content.tempoCheck.bpms.contains(row.bpm) && row.score >= content.tempoCheck.minimumScore && row.accuracy >= content.tempoCheck.minimumAccuracy && row.meanAbsoluteMs.map { $0 <= content.tempoCheck.maximumMeanAbsoluteMs } == true
                guard replay.nextTempoBpm(content) == row.bpm, (0...100).contains(row.score), (0...100).contains(row.accuracy),
                      row.meanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                      row.meanOffsetMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true, row.passed == expectedPass else { return false }
                replay.tempoAttempts?.append(row)
            }
        }
        if let confirmations {
            guard confirmations.count <= 3, Set(confirmations.map(\.probeId)).count == confirmations.count else { return false }
            for row in confirmations {
                guard let probe = content.probes.first(where: { $0.id == row.probeId }), ["pulse", "subdivisions", "coordination"].contains(probe.domain), attempts.contains(where: { $0.probeId == row.probeId }), row.attempt.probeId == row.probeId,
                      row.attempt.variant.map({ (0...(probe.alternates?.count ?? 0)).contains($0) }) ?? true,
                      (0...100).contains(row.attempt.score), (0...100).contains(row.attempt.accuracy), (0...10000).contains(row.attempt.misses), (0...10000).contains(row.attempt.extras),
                      row.attempt.meanAbsoluteMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true, row.attempt.meanOffsetMs.map({ $0.isFinite && abs($0) <= 100 }) ?? true,
                      row.attempt.timingSpreadMs.map({ $0.isFinite && (0...100).contains($0) }) ?? true, row.attempt.dynamicsContrast == nil, row.attempt.passed == row.attempt.passes(content) else { return false }
            }
        }
        if let educatorComparison {
            let levels = [educatorComparison.teacherEstimatedLevel.pulse, educatorComparison.teacherEstimatedLevel.subdivisions, educatorComparison.teacherEstimatedLevel.coordination, educatorComparison.teacherEstimatedLevel.reading]
            guard levels.allSatisfy({ $0 == nil || (1...3).contains($0!) }), educatorComparison.disagreementNotes.count <= 1000, educatorComparison.pilotCode.map({ $0.count <= 40 && $0.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") } }) ?? true else { return false }
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
        var clickOnMeanAbsoluteMs: Double?
        var clickOffMeanAbsoluteMs: Double?
        var dropoutDriftMs: Double?
        if probe.domain == "internal-pulse" {
            let boundary = probe.subdivision * 2
            let on = rated.compactMap { hit -> Double? in guard let step = hit.step, step < boundary, let offset = hit.offsetMs else { return nil }; return Double(offset) }
            let off = rated.compactMap { hit -> Double? in guard let step = hit.step, step >= boundary, let offset = hit.offsetMs else { return nil }; return Double(offset) }
            let onMean = on.isEmpty ? nil : on.reduce(0, +) / Double(on.count)
            let offMean = off.isEmpty ? nil : off.reduce(0, +) / Double(off.count)
            clickOnMeanAbsoluteMs = on.isEmpty ? nil : on.map(abs).reduce(0, +) / Double(on.count)
            clickOffMeanAbsoluteMs = off.isEmpty ? nil : off.map(abs).reduce(0, +) / Double(off.count)
            if let onMean, let offMean { dropoutDriftMs = offMean - onMean }
        }
        var row = AssessmentAttempt(probeId: probe.id, variant: variant, score: result.score, accuracy: result.accuracy, meanAbsoluteMs: offsets.isEmpty ? nil : offsets.reduce(0, +) / Double(offsets.count), meanOffsetMs: meanOffset, timingSpreadMs: spread, clickOnMeanAbsoluteMs: clickOnMeanAbsoluteMs, clickOffMeanAbsoluteMs: clickOffMeanAbsoluteMs, dropoutDriftMs: dropoutDriftMs, misses: result.miss, extras: result.extra, dynamicsContrast: contrast, passed: false)
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
    static let draftKey = "drumHero.assessment.draft.v1"
    static let changed = Notification.Name("drumHero.assessment.changed")
    private struct Checkpoint: Codable { var version: Int; var savedAt: Date; var result: AssessmentResult }
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
    static func readDraft(content: AssessmentContent, now: Date = .now) -> AssessmentResult? {
        guard let data = UserDefaults.standard.data(forKey: draftKey), let checkpoint = try? JSONDecoder().decode(Checkpoint.self, from: data), checkpoint.version == 1,
              now.timeIntervalSince(checkpoint.savedAt) <= 14 * 24 * 60 * 60, now.timeIntervalSince(checkpoint.savedAt) >= -60,
              !checkpoint.result.endedEarly, checkpoint.result.valid(content) else { return nil }
        return checkpoint.result
    }
    static func writeDraft(_ result: AssessmentResult, content: AssessmentContent) throws {
        guard !result.endedEarly, result.valid(content) else { throw CocoaError(.coderInvalidValue) }
        UserDefaults.standard.set(try JSONEncoder().encode(Checkpoint(version: 1, savedAt: .now, result: result)), forKey: draftKey)
    }
    static func clearDraft() { UserDefaults.standard.removeObject(forKey: draftKey) }
}
