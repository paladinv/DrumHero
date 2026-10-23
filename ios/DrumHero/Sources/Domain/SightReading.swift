import Foundation

struct SightSettings: Codable, Equatable {
    var level = LearnerLevel.beginner
    var bpm = 80
    var bars = 2
    var meter = "4/4"
    var triplets = false
    var snareOnly = false
    var focusVoice = "mixed"
    var focusRhythm = "mixed"
    var style = "varied"
    var meters: [String] { level == .beginner ? ["4/4"] : level == .intermediate ? ["4/4", "3/4"] : ["4/4", "3/4", "5/4", "7/8"] }
    var normalized: Self {
        var result = self
        result.bpm = max(40, min(200, bpm))
        result.bars = [1, 2, 4].contains(bars) ? bars : 2
        if !meters.contains(meter) { result.meter = "4/4" }
        result.triplets = level == .advanced && triplets && result.meter != "7/8"
        result.snareOnly = level == .beginner && snareOnly
        if result.snareOnly { result.focusVoice = "snare" }
        else if !["mixed", "kick", "snare", "hihat", "tom", "crash"].contains(focusVoice) { result.focusVoice = "mixed" }
        let rhythmAvailable = ["mixed", "quarters", "eighths"].contains(focusRhythm)
            || focusRhythm == "sixteenths" && level != .beginner
            || focusRhythm == "triplets" && level == .advanced && result.meter != "7/8"
        if !rhythmAvailable { result.focusRhythm = "mixed" }
        let styles = level == .beginner ? ["varied", "rock"] : level == .intermediate ? ["varied", "rock", "fill"] : ["varied", "rock", "shuffle", "fill"]
        if !styles.contains(style) || style == "shuffle" && result.meter == "7/8" { result.style = "varied" }
        if result.style == "shuffle" && !["mixed", "triplets"].contains(result.focusRhythm) { result.focusRhythm = "mixed" }
        return result
    }
    private enum CodingKeys: String, CodingKey { case level, bpm, bars, meter, triplets, snareOnly, focusVoice, focusRhythm, style }
    init(level: LearnerLevel = .beginner, bpm: Int = 80, bars: Int = 2, meter: String = "4/4", triplets: Bool = false, snareOnly: Bool = false, focusVoice: String = "mixed", focusRhythm: String = "mixed", style: String = "varied") {
        self.level = level; self.bpm = bpm; self.bars = bars; self.meter = meter
        self.triplets = triplets; self.snareOnly = snareOnly; self.focusVoice = focusVoice
        self.focusRhythm = focusRhythm; self.style = style
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        level = try values.decodeIfPresent(LearnerLevel.self, forKey: .level) ?? .beginner
        bpm = try values.decodeIfPresent(Int.self, forKey: .bpm) ?? 80
        bars = try values.decodeIfPresent(Int.self, forKey: .bars) ?? 2
        meter = try values.decodeIfPresent(String.self, forKey: .meter) ?? "4/4"
        triplets = try values.decodeIfPresent(Bool.self, forKey: .triplets) ?? false
        snareOnly = try values.decodeIfPresent(Bool.self, forKey: .snareOnly) ?? false
        focusVoice = try values.decodeIfPresent(String.self, forKey: .focusVoice) ?? "mixed"
        focusRhythm = try values.decodeIfPresent(String.self, forKey: .focusRhythm) ?? "mixed"
        style = try values.decodeIfPresent(String.self, forKey: .style) ?? "varied"
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(level, forKey: .level); try values.encode(bpm, forKey: .bpm); try values.encode(bars, forKey: .bars)
        try values.encode(meter, forKey: .meter); try values.encode(triplets, forKey: .triplets); try values.encode(snareOnly, forKey: .snareOnly)
        try values.encode(focusVoice, forKey: .focusVoice); try values.encode(focusRhythm, forKey: .focusRhythm); try values.encode(style, forKey: .style)
    }
}
struct SightExercise: Codable {
    var version = 1
    var seed: UInt32
    var settings: SightSettings
    var subdivision: Int
    var beatsPerBar: Double
    var stepsPerBar: Int
    var hits: [PatternHit]
    var duration: TimeInterval { beatsPerBar * Double(settings.bars) * 60 / Double(settings.bpm) }
    var stepDuration: TimeInterval { 60 / Double(settings.bpm) * 4 / Double(subdivision) }
    var fingerprint: String { "\(settings.meter):\(subdivision):" + hits.map { "\($0.step)/\($0.instrument.rawValue)/\($0.accent ? 1 : 0)" }.joined(separator: ",") }
    var pattern: PracticePattern { PracticePattern(id: "sight-v1-\(seed)", name: "Sight reading", level: settings.level, description: "Read and play", subdivision: subdivision, beats: beatsPerBar * Double(settings.bars), defaultBpm: settings.bpm, tempoRange: [40, 200], hits: hits) }
    static func generate(_ settings: SightSettings, seed: UInt32, previous: String? = nil) -> Self {
        let config = settings.normalized
        var actualSeed = seed
        for attempt in 0...100 {
            var state = actualSeed
            func next(_ maximum: Int) -> Int { state = state &* 1664525 &+ 1013904223; return Int(Double(state) / 4294967296 * Double(maximum)) }
            let beats = config.meter == "7/8" ? 3.5 : Double(String(config.meter.prefix(1)))!
            let subdivision = config.style == "shuffle" ? 12 : config.focusRhythm == "quarters" ? 4 : config.focusRhythm == "eighths" ? 8 : config.focusRhythm == "sixteenths" ? 16 : config.focusRhythm == "triplets" ? 12 : config.triplets ? 12 : config.level == .beginner ? (actualSeed % 2 == 0 ? 4 : 8) : 16
            let steps = Int(beats * Double(subdivision) / 4)
            let unit = subdivision / 4
            let templates = subdivision == 4 ? [[0], [0], [], [0]] : subdivision == 8 ? [[0], [0, 1], [1], []] : subdivision == 12 ? [[0, 1, 2], [0, 2], [1], []] : [[0, 2], [0, 3], [1, 2], [0, 1, 3], [2], []]
            var hits: [PatternHit] = []
            for bar in 0..<config.bars {
                if ["rock", "shuffle", "fill"].contains(config.style) {
                    let beatsInBar = Int(ceil(beats))
                    let hats = subdivision == 4 ? [0] : [0, 2]
                    let kickBeats = config.meter == "7/8" ? [0, 2] : beatsInBar >= 5 ? [0, 3] : [0, 2]
                    let snareBeats = config.meter == "7/8" ? [1, 3] : beatsInBar >= 5 ? [2, 4] : [1, 3]
                    let handVoice = DrumVoice(rawValue: config.focusVoice).flatMap { $0 == .kick || $0 == .hihat ? nil : $0 } ?? .snare
                    for beat in 0..<beatsInBar {
                        let base = beat * unit
                        if base >= steps { continue }
                        let fillTail = config.style == "fill" && bar == config.bars - 1 && beat >= max(0, beatsInBar - 2)
                        if config.focusVoice == "mixed" || config.focusVoice == "hihat" {
                            for offset in hats where base + offset < steps { hits.append(PatternHit(step: bar * steps + base + offset, instrument: .hihat)) }
                        }
                        if fillTail {
                            let offsets = subdivision == 4 ? [0] : subdivision == 12 ? [0, 2] : [0, 1, 2, 3]
                            for offset in offsets {
                                let step = bar * steps + base + offset
                                let fillVoice = config.focusVoice == "mixed" ? (offset % 2 == 1 ? DrumVoice.tom : .snare) : DrumVoice(rawValue: config.focusVoice) ?? .snare
                                if step < (bar + 1) * steps && !hits.contains(where: { $0.step == step && $0.instrument == fillVoice }) { hits.append(PatternHit(step: step, instrument: fillVoice, accent: offset == 0)) }
                            }
                            continue
                        }
                        if kickBeats.contains(beat) && (config.focusVoice == "mixed" || config.focusVoice == "kick") { hits.append(PatternHit(step: bar * steps + base, instrument: .kick, accent: beat == 0)) }
                        if snareBeats.contains(beat) && (config.focusVoice == "mixed" || config.focusVoice != "kick" && config.focusVoice != "hihat") { hits.append(PatternHit(step: bar * steps + base, instrument: handVoice, accent: beat == 1 || beat == 3)) }
                    }
                    continue
                }
                var beat = 0
                while Double(beat) < beats {
                    let template = templates[next(templates.count)]
                    for offset in template {
                        let local = beat * unit + offset
                        if local >= steps { continue }
                        let step = bar * steps + local
                        var voice = DrumVoice(rawValue: config.focusVoice) ?? .snare
                        if config.focusVoice == "mixed" && !config.snareOnly { voice = config.level == .advanced ? DrumVoice.allCases[1 + next(4)] : next(3) == 0 ? .snare : .hihat }
                        let accent = config.level != .beginner && next(4) == 0
                        hits.append(PatternHit(step: step, instrument: voice, accent: accent))
                        if config.focusVoice == "mixed" && !config.snareOnly && offset == 0 && next(3) == 0 { hits.append(PatternHit(step: step, instrument: .kick)) }
                    }
                    beat += 1
                }
                if !hits.contains(where: { $0.step >= bar * steps }) { hits.append(PatternHit(step: bar * steps, instrument: DrumVoice(rawValue: config.focusVoice) ?? .snare)) }
            }
            hits.sort { $0.step != $1.step ? $0.step < $1.step : DrumVoice.allCases.firstIndex(of: $0.instrument)! < DrumVoice.allCases.firstIndex(of: $1.instrument)! }
            let exercise = Self(seed: actualSeed, settings: config, subdivision: subdivision, beatsPerBar: beats, stepsPerBar: steps, hits: hits)
            if previous == nil || previous != exercise.fingerprint || attempt == 100 { return exercise }
            actualSeed = actualSeed &+ 1
        }
        preconditionFailure("Bounded generation must return")
    }
}
struct SightAttempt: Codable, Identifiable {
    var id = UUID().uuidString
    var playedAt = Date()
    var version = 1
    var seed: UInt32
    var settings: SightSettings
    var source: String
    var inputProfile: String
    var classification: String
    var score: Int
    var accuracy: Int
    var meanOffsetMs: Int?
    var misses: Int
    var extras: Int
    var valid: Bool { version == 1 && settings == settings.normalized && ["keyboard", "touch", "midi"].contains(source) && ["reading", "practice", "assisted"].contains(classification) && (0...100).contains(score) && (0...100).contains(accuracy) && (meanOffsetMs == nil || (-100...100).contains(meanOffsetMs!)) && (0...100000).contains(misses) && (0...100000).contains(extras) && inputProfile.count <= 200 }
}
struct SightGoal: Codable, Equatable {
    var level = LearnerLevel.beginner
    var meter = "4/4"
    var bpm = 100
    var focusRhythm = "eighths"
    var accuracy = 85
    var targetReads = 5
    var valid: Bool {
        let rhythmAllowed = ["mixed", "quarters", "eighths"].contains(focusRhythm)
            || focusRhythm == "sixteenths" && level != .beginner
            || focusRhythm == "triplets" && level == .advanced && meter != "7/8"
        return bpm >= 40 && bpm <= 200 && (50...100).contains(accuracy) && (1...20).contains(targetReads)
            && SightSettings(level: level, meter: meter).meters.contains(meter) && rhythmAllowed
    }
    func contains(_ attempt: SightAttempt) -> Bool {
        attempt.classification == "reading" && attempt.accuracy >= accuracy && attempt.settings.level == level
            && attempt.settings.meter == meter && attempt.settings.bpm == bpm && attempt.settings.focusRhythm == focusRhythm
    }
}
enum SightHistory {
    // Native currently has one learner. Keep the learner key explicit for future profile support.
    static let key = "drumHero.sightReading.v1.default"
    static let goalKey = "drumHero.sightReadingGoal.v1.default"
    static func read() -> [SightAttempt] { guard let data = UserDefaults.standard.data(forKey: key), let rows = try? JSONDecoder().decode([SightAttempt].self, from: data) else { return [] }; return Array(rows.filter(\.valid).suffix(100)) }
    static func write(_ rows: [SightAttempt]) throws { UserDefaults.standard.set(try JSONEncoder().encode(Array(rows.suffix(100))), forKey: key) }
    static func readGoal() -> SightGoal? { guard let data = UserDefaults.standard.data(forKey: goalKey), let value = try? JSONDecoder().decode(SightGoal.self, from: data), value.valid else { return nil }; return value }
    static func writeGoal(_ goal: SightGoal?) throws { if let goal { UserDefaults.standard.set(try JSONEncoder().encode(goal), forKey: goalKey) } else { UserDefaults.standard.removeObject(forKey: goalKey) } }
}
