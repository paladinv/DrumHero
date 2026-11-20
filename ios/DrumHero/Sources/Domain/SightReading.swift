import Foundation

struct SightSettings: Codable, Equatable {
    var level = LearnerLevel.beginner
    var bpm = 80
    var bars = 10
    var meter = "4/4"
    var mixedMeters = false
    var articulationFocus: String? = nil
    var triplets = false
    var snareOnly = false
    var focusVoice = "mixed"
    var focusRhythm = "mixed"
    var style = "varied"
    var density = "balanced"
    var meters: [String] { level == .beginner ? ["4/4"] : level == .intermediate ? ["4/4", "3/4"] : ["4/4", "3/4", "5/4", "7/8"] }
    func bars(forDuration seconds: Int) -> Int {
        let beatsPerBar = mixedMeters ? meters.map(Self.beatsPerBar).reduce(0, +) / Double(meters.count) : Self.beatsPerBar(meter)
        return max(1, min(80, Int(ceil(Double(seconds) * Double(bpm) / (60 * beatsPerBar)))))
    }
    static func beatsPerBar(_ meter: String) -> Double { meter == "7/8" ? 3.5 : Double(meter.first?.wholeNumberValue ?? 4) }
    var countAccentBeats: [Double] { meter == "5/4" ? [0, 3] : meter == "7/8" ? [0, 1, 2] : meter == "4/4" ? [0, 2] : [0] }
    var normalized: Self {
        var result = self
        result.bpm = max(40, min(200, bpm))
        result.bars = max(1, min(80, bars))
        if !meters.contains(meter) { result.meter = "4/4" }
        result.mixedMeters = level != .beginner && mixedMeters && result.bars > 1
        let articulations = ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot", "side-stick"]
        result.articulationFocus = level != .beginner && articulationFocus.map { articulations.contains($0) } == true ? articulationFocus : nil
        result.triplets = level == .advanced && triplets && result.meter != "7/8" && !result.mixedMeters
        result.snareOnly = level == .beginner && snareOnly
        if result.snareOnly { result.focusVoice = "snare" }
        else if !["mixed", "kick", "snare", "hihat", "tom", "crash"].contains(focusVoice) { result.focusVoice = "mixed" }
        let rhythmAvailable = ["mixed", "quarters", "eighths"].contains(focusRhythm)
            || focusRhythm == "sixteenths" && level != .beginner
            || focusRhythm == "triplets" && level == .advanced && result.meter != "7/8" && !result.mixedMeters
        if !rhythmAvailable { result.focusRhythm = "mixed" }
        let styles = level == .beginner ? ["varied", "rock"] : level == .intermediate ? ["varied", "rock", "fill", "half-time", "funk"] : ["varied", "rock", "shuffle", "fill", "half-time", "funk", "latin"]
        if !styles.contains(style) || style == "shuffle" && (result.meter == "7/8" || result.mixedMeters) { result.style = "varied" }
        if result.mixedMeters && result.focusRhythm == "triplets" { result.focusRhythm = "mixed" }
        if (result.meter == "7/8" || result.mixedMeters && result.level == .advanced) && result.focusRhythm == "quarters" { result.focusRhythm = "eighths" }
        if result.style == "shuffle" && !["mixed", "triplets"].contains(result.focusRhythm) { result.focusRhythm = "mixed" }
        if !["light", "balanced", "dense"].contains(density) { result.density = "balanced" }
        return result
    }
    static func adaptiveNext(from settings: Self, accuracy: Int, timingSpreadMs: Int?) -> Self? {
        var next = settings
        if accuracy >= 88 && (timingSpreadMs.map { $0 <= 55 } ?? true) {
            if next.focusRhythm == "quarters" { next.focusRhythm = "eighths" }
            else if next.focusRhythm == "eighths" && next.level != .beginner { next.focusRhythm = "sixteenths" }
            else if next.focusRhythm == "sixteenths" && next.level == .advanced && next.meter != "7/8" { next.focusRhythm = "triplets" }
            else if next.style == "varied" && next.density == "light" { next.density = "balanced" }
            else if next.style == "varied" && next.density == "balanced" { next.density = "dense" }
            else if next.bpm < 200 { next.bpm = min(200, next.bpm + 5) }
            else { return nil }
        } else if accuracy < 75 || (timingSpreadMs.map { $0 > 95 } ?? false) {
            if next.style == "varied" && next.density == "dense" { next.density = "balanced" }
            else if next.style == "varied" && next.density == "balanced" { next.density = "light" }
            else if next.bpm > 40 { next.bpm = max(40, next.bpm - 5) }
            else { return nil }
        } else { return nil }
        return next.normalized
    }
    static func adaptivePreviewSeconds(current: Int, accuracy: Int, timingSpreadMs: Int?) -> Int? {
        if accuracy >= 88 && (timingSpreadMs.map { $0 <= 55 } ?? true) { return current > 0 ? (current == 10 ? 5 : 0) : nil }
        if accuracy < 75 || (timingSpreadMs.map { $0 > 95 } ?? false) { return current < 10 ? (current == 0 ? 5 : 10) : nil }
        return nil
    }
    private enum CodingKeys: String, CodingKey { case level, bpm, bars, meter, mixedMeters, articulationFocus, triplets, snareOnly, focusVoice, focusRhythm, style, density }
    init(level: LearnerLevel = .beginner, bpm: Int = 80, bars: Int = 10, meter: String = "4/4", mixedMeters: Bool = false, articulationFocus: String? = nil, triplets: Bool = false, snareOnly: Bool = false, focusVoice: String = "mixed", focusRhythm: String = "mixed", style: String = "varied", density: String = "balanced") {
        self.level = level; self.bpm = bpm; self.bars = bars; self.meter = meter
        self.mixedMeters = mixedMeters
        self.articulationFocus = articulationFocus
        self.triplets = triplets; self.snareOnly = snareOnly; self.focusVoice = focusVoice
        self.focusRhythm = focusRhythm; self.style = style; self.density = density
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        level = try values.decodeIfPresent(LearnerLevel.self, forKey: .level) ?? .beginner
        bpm = try values.decodeIfPresent(Int.self, forKey: .bpm) ?? 80
        bars = try values.decodeIfPresent(Int.self, forKey: .bars) ?? 2
        meter = try values.decodeIfPresent(String.self, forKey: .meter) ?? "4/4"
        mixedMeters = try values.decodeIfPresent(Bool.self, forKey: .mixedMeters) ?? false
        articulationFocus = try values.decodeIfPresent(String.self, forKey: .articulationFocus)
        triplets = try values.decodeIfPresent(Bool.self, forKey: .triplets) ?? false
        snareOnly = try values.decodeIfPresent(Bool.self, forKey: .snareOnly) ?? false
        focusVoice = try values.decodeIfPresent(String.self, forKey: .focusVoice) ?? "mixed"
        focusRhythm = try values.decodeIfPresent(String.self, forKey: .focusRhythm) ?? "mixed"
        style = try values.decodeIfPresent(String.self, forKey: .style) ?? "varied"
        density = try values.decodeIfPresent(String.self, forKey: .density) ?? "balanced"
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(level, forKey: .level); try values.encode(bpm, forKey: .bpm); try values.encode(bars, forKey: .bars)
        try values.encode(meter, forKey: .meter); try values.encode(mixedMeters, forKey: .mixedMeters); try values.encode(articulationFocus, forKey: .articulationFocus); try values.encode(triplets, forKey: .triplets); try values.encode(snareOnly, forKey: .snareOnly)
        try values.encode(focusVoice, forKey: .focusVoice); try values.encode(focusRhythm, forKey: .focusRhythm); try values.encode(style, forKey: .style); try values.encode(density, forKey: .density)
    }
}
struct SightExercise: Codable {
    var version = 1
    var seed: UInt32
    var settings: SightSettings
    var subdivision: Int
    var beatsPerBar: Double
    var stepsPerBar: Int
    var barMeters: [String]? = nil
    var hits: [PatternHit]
    var sourceLabel: String? = nil
    var meters: [String] { barMeters?.count == settings.bars ? barMeters! : Array(repeating: settings.meter, count: settings.bars) }
    var totalBeats: Double { meters.map(SightSettings.beatsPerBar).reduce(0, +) }
    var totalSteps: Int { meters.map { Int((SightSettings.beatsPerBar($0) * Double(subdivision) / 4).rounded()) }.reduce(0, +) }
    var barBeatStarts: [Double] { var result: [Double] = []; var start = 0.0; for meter in meters { result.append(start); start += SightSettings.beatsPerBar(meter) }; return result }
    var barStepStarts: [Int] { var result: [Int] = []; var start = 0; for meter in meters { result.append(start); start += Int((SightSettings.beatsPerBar(meter) * Double(subdivision) / 4).rounded()) }; return result }
    func meterForBar(_ bar: Int) -> String { meters[max(0, min(meters.count - 1, bar))] }
    func beatsForBar(_ bar: Int) -> Double { SightSettings.beatsPerBar(meterForBar(bar)) }
    func stepsForBar(_ bar: Int) -> Int { Int((beatsForBar(bar) * Double(subdivision) / 4).rounded()) }
    func startStepForBar(_ bar: Int) -> Int { barStepStarts[max(0, min(barStepStarts.count - 1, bar))] }
    func startBeatForBar(_ bar: Int) -> Double { barBeatStarts[max(0, min(barBeatStarts.count - 1, bar))] }
    func barIndex(forBeat beat: Double) -> Int {
        guard !barBeatStarts.isEmpty else { return 0 }
        return max(0, min(settings.bars - 1, barBeatStarts.lastIndex(where: { $0 <= beat }) ?? 0))
    }
    var duration: TimeInterval { totalBeats * 60 / Double(settings.bpm) }
    var stepDuration: TimeInterval { 60 / Double(settings.bpm) * 4 / Double(subdivision) }
    var fingerprint: String {
        let meterSignature = meters.allSatisfy { $0 == meters.first } ? (meters.first ?? settings.meter) : meters.joined(separator: "-")
        return "\(meterSignature):\(subdivision):" + hits.map { "\($0.step)/\($0.instrument.rawValue)/\($0.accent ? 1 : 0)\($0.midiArticulationTarget.map { "/\($0)" } ?? "")" }.joined(separator: ",")
    }
    var pattern: PracticePattern { PracticePattern(id: "sight-v\(version)-\(seed)", name: sourceLabel ?? "Sight reading", level: settings.level, description: "Read and play", subdivision: subdivision, beats: totalBeats, defaultBpm: settings.bpm, tempoRange: [40, 200], hits: hits) }
    func repeatingBar(_ sourceBar: Int) -> Self {
        let bar = min(settings.bars - 1, max(0, sourceBar))
        let start = startStepForBar(bar), length = stepsForBar(bar), meter = meterForBar(bar)
        let sourceHits = hits.filter { $0.step >= start && $0.step < start + length }.map { hit in
            var copy = hit; copy.step -= start; return copy
        }
        var repeated = sourceHits
        repeated += sourceHits.map { hit in var copy = hit; copy.step += length; return copy }
        repeated.sort { $0.step != $1.step ? $0.step < $1.step : DrumVoice.allCases.firstIndex(of: $0.instrument)! < DrumVoice.allCases.firstIndex(of: $1.instrument)! }
        var drillSettings = settings; drillSettings.bars = 2; drillSettings.meter = meter; drillSettings.mixedMeters = false
        return Self(version: drillSettings.articulationFocus == nil ? 1 : 3, seed: seed, settings: drillSettings, subdivision: subdivision, beatsPerBar: SightSettings.beatsPerBar(meter), stepsPerBar: length, barMeters: [meter, meter], hits: repeated, sourceLabel: sourceLabel)
    }
    func repeatingRange(_ startBar: Int, _ endBar: Int, repeats: Int = 2) -> Self {
        let start = min(settings.bars - 1, max(0, startBar)), count = min(4, max(2, repeats))
        let end = min(settings.bars - 1, max(start, min(endBar, start + 80 / count - 1)))
        let rangeBars = end - start + 1, sourceOffset = startStepForBar(start), rangeEnd = startStepForBar(end) + stepsForBar(end), rangeSteps = rangeEnd - sourceOffset
        let sourceMeters = Array(meters[start...end])
        let sourceHits = hits.filter { $0.step >= sourceOffset && $0.step < sourceOffset + rangeSteps }.map { hit in var copy = hit; copy.step -= sourceOffset; return copy }
        var repeated: [PatternHit] = []
        for repetition in 0..<count { repeated += sourceHits.map { hit in var copy = hit; copy.step += repetition * rangeSteps; return copy } }
        repeated.sort { $0.step != $1.step ? $0.step < $1.step : DrumVoice.allCases.firstIndex(of: $0.instrument)! < DrumVoice.allCases.firstIndex(of: $1.instrument)! }
        var drillSettings = settings; drillSettings.bars = rangeBars * count
        let repeatedMeters = Array(repeating: sourceMeters, count: count).flatMap { $0 }
        drillSettings.meter = repeatedMeters.first ?? settings.meter; drillSettings.mixedMeters = Set(repeatedMeters).count > 1
        let version = drillSettings.articulationFocus != nil ? 3 : drillSettings.mixedMeters ? 2 : 1
        return Self(version: version, seed: seed, settings: drillSettings.normalized, subdivision: subdivision, beatsPerBar: SightSettings.beatsPerBar(repeatedMeters.first ?? settings.meter), stepsPerBar: Int((SightSettings.beatsPerBar(repeatedMeters.first ?? settings.meter) * Double(subdivision) / 4).rounded()), barMeters: repeatedMeters, hits: repeated, sourceLabel: sourceLabel)
    }
    static func fromPattern(_ pattern: PracticePattern, settings: SightSettings, seed: UInt32) -> Self? {
        guard let meter = pattern.meter, ["4/4", "3/4", "5/4", "7/8"].contains(where: { meter.hasPrefix($0) }), [4, 8, 12, 16].contains(pattern.subdivision) else { return nil }
        let normalizedMeter = ["4/4", "3/4", "5/4", "7/8"].first { meter.hasPrefix($0) }!
        if normalizedMeter == "7/8" && pattern.subdivision % 8 != 0 { return nil }
        let beats = normalizedMeter == "7/8" ? 3.5 : Double(normalizedMeter.first?.wholeNumberValue ?? 4)
        let steps = Int((beats * Double(pattern.subdivision) / 4).rounded())
        let sourceBars = Int(((pattern.beats + 0.00001) / beats).rounded(.down))
        guard sourceBars > 0, steps > 0 else { return nil }
        let bars = min(settings.bars, sourceBars), choices = max(1, sourceBars - bars + 1), offset = Int(seed % UInt32(choices)) * steps
        let hits = pattern.hits.filter { DrumVoice.allCases.contains($0.instrument) && $0.step >= offset && $0.step < offset + bars * steps }.map { hit in var copy = hit; copy.step -= offset; return copy }.sorted { $0.step != $1.step ? $0.step < $1.step : DrumVoice.allCases.firstIndex(of: $0.instrument)! < DrumVoice.allCases.firstIndex(of: $1.instrument)! }
        guard !hits.isEmpty else { return nil }
        var config = settings; config.level = pattern.level; config.meter = normalizedMeter; config.bars = bars; config.bpm = max(40, min(200, settings.bpm)); config.mixedMeters = false; config.articulationFocus = nil
        return Self(seed: seed, settings: config.normalized, subdivision: pattern.subdivision, beatsPerBar: beats, stepsPerBar: steps, hits: hits, sourceLabel: String(pattern.name.prefix(160)))
    }
    static func generate(_ settings: SightSettings, seed: UInt32, previous: String? = nil) -> Self {
        let config = settings.normalized
        if config.mixedMeters { return generateMixed(config, seed: seed, previous: previous) }
        var actualSeed = seed
        for attempt in 0...100 {
            var state = actualSeed
            func next(_ maximum: Int) -> Int { state = state &* 1664525 &+ 1013904223; return Int(Double(state) / 4294967296 * Double(maximum)) }
            let beats = config.meter == "7/8" ? 3.5 : Double(String(config.meter.prefix(1)))!
            let subdivision = config.style == "shuffle" ? 12 : config.focusRhythm == "quarters" ? 4 : config.focusRhythm == "eighths" ? 8 : config.focusRhythm == "sixteenths" ? 16 : config.focusRhythm == "triplets" ? 12 : config.triplets ? 12 : config.level == .beginner ? (actualSeed % 2 == 0 ? 4 : 8) : 16
            let steps = Int((beats * Double(subdivision) / 4).rounded())
            let unit = subdivision / 4
            let baseTemplates = subdivision == 4 ? [[0], [0], [], [0]] : subdivision == 8 ? [[0], [0, 1], [1], []] : subdivision == 12 ? [[0, 1, 2], [0, 2], [1], []] : [[0, 2], [0, 3], [1, 2], [0, 1, 3], [2], []]
            let templates: [[Int]] = config.density == "balanced" ? baseTemplates : subdivision == 4 ? baseTemplates
                : subdivision == 8 ? (config.density == "light" ? [[0], [0], [], [0]] : [[0, 1], [0, 1], [1], [0]])
                : subdivision == 12 ? (config.density == "light" ? [[0], [0], [2], []] : [[0, 1, 2], [0, 2], [1, 2], [0, 1, 2]])
                : (config.density == "light" ? [[0], [0, 2], [2], []] : [[0, 1, 2, 3], [0, 2, 3], [0, 1, 3], [1, 2, 3]])
            var hits: [PatternHit] = []
            for bar in 0..<config.bars {
                if ["half-time", "funk", "latin"].contains(config.style) {
                    let beatsInBar = Int(ceil(beats)), offbeat = unit / 2
                    let handVoice = DrumVoice(rawValue: config.focusVoice).flatMap { $0 == .kick || $0 == .hihat ? nil : $0 } ?? .snare
                    for beat in 0..<beatsInBar {
                        let base = beat * unit
                        if base >= steps { continue }
                        let hats = subdivision == 4 ? [0] : config.style == "latin" ? [0, max(1, unit - 1)] : [0, offbeat]
                        if config.focusVoice == "mixed" || config.focusVoice == "hihat" {
                            for offset in hats where base + offset < steps { hits.append(PatternHit(step: bar * steps + base + offset, instrument: .hihat, accent: offset == 0 && beat % 2 == 0)) }
                        }
                        let kickBeats = config.style == "half-time" ? [0] : config.style == "funk" ? [0, 2] : [0, max(1, beatsInBar - 1)]
                        let snareBeats = config.style == "half-time" ? [2] : config.style == "funk" ? [1, 3] : [1, max(1, beatsInBar - 1)]
                        let includeKick = config.focusVoice == "mixed" || config.focusVoice == "kick"
                        let includeHand = config.focusVoice == "mixed" || config.focusVoice != "kick" && config.focusVoice != "hihat"
                        if includeKick && kickBeats.contains(beat) { hits.append(PatternHit(step: bar * steps + base, instrument: .kick, accent: beat == 0)) }
                        if includeKick && config.style == "funk" && beat == min(3, beatsInBar - 1) && offbeat > 0 && base + offbeat < steps { hits.append(PatternHit(step: bar * steps + base + offbeat, instrument: .kick)) }
                        if includeHand && snareBeats.contains(beat) { hits.append(PatternHit(step: bar * steps + base, instrument: handVoice, accent: beat == 1 || beat == 3)) }
                        if includeHand && config.style == "latin" && beat == min(2, beatsInBar - 1) && offbeat > 0 && base + offbeat < steps { hits.append(PatternHit(step: bar * steps + base + offbeat, instrument: handVoice)) }
                    }
                    continue
                }
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
            Self.applyArticulationTargets(&hits, settings: config, starts: (0..<config.bars).map { $0 * steps }, lengths: Array(repeating: steps, count: config.bars))
            hits.sort { $0.step != $1.step ? $0.step < $1.step : DrumVoice.allCases.firstIndex(of: $0.instrument)! < DrumVoice.allCases.firstIndex(of: $1.instrument)! }
            let exercise = Self(version: config.articulationFocus == nil ? 1 : 3, seed: actualSeed, settings: config, subdivision: subdivision, beatsPerBar: beats, stepsPerBar: steps, hits: hits)
            if previous == nil || previous != exercise.fingerprint || attempt == 100 { return exercise }
            actualSeed = actualSeed &+ 1
        }
        preconditionFailure("Bounded generation must return")
    }
    private static func generateMixed(_ config: SightSettings, seed: UInt32, previous: String?) -> Self {
        var actualSeed = seed
        for retry in 0..<100 {
            var state = actualSeed
            func next(_ maximum: Int) -> Int {
                state = state &* 1664525 &+ 1013904223
                return Int(Double(state) / 4_294_967_296 * Double(maximum))
            }
            let choices = config.meters
            var barMeters = [config.meter]
            for bar in 1..<config.bars {
                let alternatives = choices.filter { $0 != barMeters[bar - 1] }
                barMeters.append(alternatives[next(alternatives.count)])
            }
            var hits: [PatternHit] = [], startStep = 0
            for (bar, meter) in barMeters.enumerated() {
                var barSettings = config; barSettings.meter = meter; barSettings.mixedMeters = false; barSettings.bars = 1
                let barSeed = actualSeed &+ UInt32(truncatingIfNeeded: UInt64(bar + 1) &* 0x9e3779b9)
                let phrase = generate(barSettings, seed: barSeed)
                hits += phrase.hits.map { hit in var copy = hit; copy.step += startStep; return copy }
                startStep += phrase.stepsPerBar
            }
            var firstSettings = config; firstSettings.mixedMeters = false; firstSettings.bars = 1
            let first = generate(firstSettings, seed: actualSeed)
            hits.sort { $0.step != $1.step ? $0.step < $1.step : DrumVoice.allCases.firstIndex(of: $0.instrument)! < DrumVoice.allCases.firstIndex(of: $1.instrument)! }
            let exercise = Self(version: config.articulationFocus == nil ? 2 : 3, seed: actualSeed, settings: config, subdivision: first.subdivision, beatsPerBar: SightSettings.beatsPerBar(barMeters[0]), stepsPerBar: Int((SightSettings.beatsPerBar(barMeters[0]) * Double(first.subdivision) / 4).rounded()), barMeters: barMeters, hits: hits)
            if previous == nil || previous != exercise.fingerprint || retry == 99 { return exercise }
            actualSeed &+= 1
        }
        preconditionFailure("Bounded mixed-meter generation must return")
    }
    private static func articulationVoice(_ articulation: String) -> DrumVoice {
        if ["open-hat", "closed-hat", "pedal-hat", "foot-splash", "ride"].contains(articulation) { return .hihat }
        if ["rimshot", "side-stick"].contains(articulation) { return .snare }
        return .crash
    }
    private static func applyArticulationTargets(_ hits: inout [PatternHit], settings: SightSettings, starts: [Int], lengths: [Int]) {
        guard let articulation = settings.articulationFocus else { return }
        let voice = articulationVoice(articulation)
        for bar in starts.indices {
            let start = starts[bar], end = start + lengths[bar]
            if let index = hits.firstIndex(where: { $0.instrument == voice && $0.step >= start && $0.step < end }) {
                hits[index].midiArticulationTarget = articulation
                continue
            }
            for step in start..<end where hits.filter({ $0.step == step }).count < 3 {
                hits.append(PatternHit(step: step, instrument: voice, midiArticulationTarget: articulation))
                break
            }
        }
    }
    static func generateFresh(_ settings: SightSettings, seed: UInt32, recentFingerprints: [String]) -> Self {
        var candidate = seed
        let recent = Set(recentFingerprints.suffix(24))
        for _ in 0...32 {
            let exercise = generate(settings, seed: candidate)
            if !recent.contains(exercise.fingerprint) { return exercise }
            candidate = candidate &+ 1
        }
        return generate(settings, seed: candidate)
    }
    var accessibleDescription: String {
        let unitsPerBeat = subdivision / 4
        func label(_ localStep: Int) -> String {
            let beat = localStep / unitsPerBeat + 1
            let within = localStep % unitsPerBeat
            if within == 0 { return "beat \(beat)" }
            if subdivision == 8 { return "beat \(beat) and" }
            if subdivision == 12 { return "beat \(beat), triplet \(within + 1)" }
            return "beat \(beat), \(["", "e", "and", "a"][min(3, within)])"
        }
        return (0..<settings.bars).map { bar in
            let barStart = startStepForBar(bar), barSteps = stepsForBar(bar)
            let events = (0..<barSteps).map { localStep in
                let notes = hits.filter { $0.step == barStart + localStep }
                let content = notes.isEmpty ? "rest" : notes.map { "\($0.instrument.title)\($0.accent ? ", accent" : "")\($0.midiArticulationTarget.map { ", \($0.replacingOccurrences(of: "-", with: " "))" } ?? "")" }.joined(separator: " and ")
                return "\(label(localStep)): \(content)"
            }
            return "Bar \(bar + 1), \(meterForBar(bar)): \(events.joined(separator: "; "))."
        }.joined(separator: " ")
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
    var targetPlayback: Bool? = nil
    var score: Int
    var accuracy: Int
    var meanOffsetMs: Int?
    var misses: Int
    var extras: Int
    var fluency: [String: Int]? = nil
    var voiceScores: [String: Int]? = nil
    var sourceLabel: String? = nil
    var previewSeconds: Int? = nil
    var countInBars: Int? = nil
    var assignmentTitle: String? = nil
    var assignmentDueDate: String? = nil
    var assignmentMinimumAccuracy: Int? = nil
    var fingerprint: String? = nil
    var timingSpreadMs: Int? = nil
    var earlyHits: Int? = nil
    var lateHits: Int? = nil
    var pulseRecovery: Int? = nil
    var confidence: Int? = nil
    var inputCalibrated: Bool? = nil
    var inputCalibrationSpreadMs: Int? = nil
    var inputCalibrationAgeDays: Int? = nil
    var inputTimingCorrectionMs: Int? = nil
    var valid: Bool {
        (version == 1 || version == 2 || version == 3) && (!settings.mixedMeters || version >= 2) && (settings.articulationFocus == nil || version >= 3) && settings == settings.normalized && ["keyboard", "touch", "midi", "audio-voices"].contains(source) && ["reading", "practice", "assisted"].contains(classification)
            && (targetPlayback != true || classification == "assisted") && (0...100).contains(score) && (0...100).contains(accuracy)
            && (meanOffsetMs == nil || (-100...100).contains(meanOffsetMs!)) && (timingSpreadMs == nil || (0...100).contains(timingSpreadMs!))
            && (pulseRecovery == nil || (0...100).contains(pulseRecovery!)) && (confidence == nil || (1...5).contains(confidence!))
            && (inputCalibrationSpreadMs == nil || (0...240).contains(inputCalibrationSpreadMs!)) && (inputCalibrationAgeDays == nil || (0...100000).contains(inputCalibrationAgeDays!))
            && (inputTimingCorrectionMs == nil || (-250...250).contains(inputTimingCorrectionMs!)) && (earlyHits == nil || (0...100000).contains(earlyHits!))
            && (lateHits == nil || (0...100000).contains(lateHits!)) && (fingerprint == nil || fingerprint!.count <= 20000)
            && (sourceLabel == nil || sourceLabel!.count <= 160) && (voiceScores == nil || voiceScores!.allSatisfy { ["kick", "snare", "hihat", "tom", "crash"].contains($0.key) && (0...100).contains($0.value) })
            && (0...100000).contains(misses) && (0...100000).contains(extras) && inputProfile.count <= 200
            && (fluency == nil || fluency!.values.allSatisfy { (0...100).contains($0) }) && (previewSeconds == nil || [0, 5, 10].contains(previewSeconds!))
            && (countInBars == nil || (0...2).contains(countInBars!)) && (assignmentTitle == nil || assignmentTitle!.count <= 80)
            && (assignmentDueDate == nil || SightAssignment.validDate(assignmentDueDate!)) && (assignmentMinimumAccuracy == nil || (50...100).contains(assignmentMinimumAccuracy!))
    }
}
enum SightAnalytics {
    static func voiceScores(exercise: SightExercise, rated: [RatedHit]) -> [String: Int] {
        Dictionary(uniqueKeysWithValues: DrumVoice.allCases.compactMap { voice in
            let targets = exercise.hits.filter { $0.instrument == voice }
            guard !targets.isEmpty else { return nil }
            let matched = targets.filter { target in rated.contains { $0.step == target.step && $0.instrument == voice && ($0.rating == .great || $0.rating == .good) } }.count
            return (voice.rawValue, Int((Double(matched) * 100 / Double(targets.count)).rounded()))
        })
    }
    static func pulseRecovery(exercise: SightExercise, rated: [RatedHit]) -> Int? {
        let errors = rated.filter { $0.rating == .miss || $0.rating == .extra }.compactMap(\.step)
        guard !errors.isEmpty else { return nil }
        let stepsPerBeat = exercise.subdivision / 4
        var targets: [String: PatternHit] = [:]
        for error in errors {
            for target in exercise.hits where target.step > error && target.step <= error + stepsPerBeat * 2 {
                targets["\(target.step):\(target.instrument.rawValue)"] = target
            }
        }
        guard !targets.isEmpty else { return nil }
        var recovered = 0
        for target in targets.values {
            if rated.contains(where: { $0.step == target.step && $0.instrument == target.instrument && ($0.rating == .great || $0.rating == .good) }) { recovered += 1 }
        }
        return Int((Double(recovered) * 100 / Double(targets.count)).rounded())
    }

    static func supportedRhythms(level: LearnerLevel, meter: String) -> [String] {
        ["quarters", "eighths"] + (level == .beginner ? [] : ["sixteenths"]) + (level == .advanced && meter != "7/8" ? ["triplets"] : [])
    }

    static func leastPracticedSettings(current: SightSettings, history: [SightAttempt]) -> SightSettings {
        let candidates = current.meters.flatMap { meter in supportedRhythms(level: current.level, meter: meter).map { rhythm in
            var value = current; value.meter = meter; value.focusRhythm = rhythm; value.focusVoice = "mixed"; value.style = "varied"; value.density = "light"
            return value.normalized
        } }
        let ranked = candidates.map { setting -> (SightSettings, Int, String) in
            let matches = history.filter { $0.classification == "reading" && $0.settings.level == setting.level && $0.settings.meter == setting.meter && $0.settings.focusRhythm == setting.focusRhythm }
            return (setting, matches.count, matches.last?.playedAt.ISO8601Format() ?? "")
        }.sorted { $0.1 != $1.1 ? $0.1 < $1.1 : $0.2 < $1.2 }
        return ranked.first(where: { $0.0.meter != current.meter || $0.0.focusRhythm != current.focusRhythm })?.0 ?? ranked.first?.0 ?? current
    }

    static func varietySummary(_ history: [SightAttempt]) -> (attempts: Int, uniquePhrases: Int, meters: Int, rhythmSettings: Int, styles: Int) {
        let recent = history.filter { $0.classification == "reading" }.suffix(100)
        return (recent.count, Set(recent.map { $0.fingerprint ?? "\($0.settings.meter)|\($0.settings.focusRhythm)|\($0.settings.style)|\($0.seed)" }).count,
                Set(recent.map { $0.settings.meter }).count, Set(recent.map { "\($0.settings.meter)|\($0.settings.focusRhythm)" }).count, Set(recent.map { $0.settings.style }).count)
    }

    static func errorDrill(exercise: SightExercise, rated: [RatedHit], seed: UInt32, recent: [String], history: [SightAttempt] = []) -> (exercise: SightExercise, focus: String, voice: String) {
        let errors = rated.filter { ($0.rating == .miss || $0.rating == .extra) && $0.step != nil }
        let stepsPerBeat = exercise.subdivision / 4
        func rhythm(_ step: Int) -> String {
            let within = step % stepsPerBeat
            if within == 0 { return "quarters" }
            if exercise.subdivision == 12 { return "triplets" }
            if exercise.subdivision == 8 { return "eighths" }
            return within % 2 == 0 ? "eighths" : "sixteenths"
        }
        var focusCounts: [String: Int] = [:], voiceCounts: [DrumVoice: Int] = [:]
        for error in errors {
            let step = error.step ?? 0
            let targetExists = exercise.hits.contains { $0.step == step }
            let focus = error.rating == .extra && !targetExists ? "rests" : step % stepsPerBeat != 0 ? "syncopation" : rhythm(step)
            focusCounts[focus, default: 0] += 1; voiceCounts[error.instrument, default: 0] += 1
        }
        var focus = focusCounts.max { $0.value < $1.value }?.key ?? "mixed"
        let recentReads = history.filter { $0.classification == "reading" && $0.settings.level == exercise.settings.level && $0.settings.meter == exercise.settings.meter }.suffix(5)
        if recentReads.count >= 2 {
            let recurrent = ["quarters", "eighths", "sixteenths", "triplets", "syncopation", "rests"].compactMap { name -> (String, Int, Int)? in
                let values = recentReads.compactMap { $0.fluency?[name] }
                guard values.count >= 2 else { return nil }
                return (name, values.reduce(0, +) / values.count, values.count)
            }.filter { $0.1 <= 80 }.sorted { $0.1 < $1.1 }.first
            if let recurrent { focus = recurrent.0 }
        }
        let voice = voiceCounts.max { $0.value < $1.value }?.key.rawValue ?? "mixed"
        var settings = exercise.settings
        settings.bars = 2; settings.bpm = max(40, settings.bpm - 10); settings.focusVoice = voice; settings.density = "light"
        settings.focusRhythm = supportedRhythms(level: settings.level, meter: settings.meter).contains(focus) ? focus : "mixed"
        settings.style = focus == "syncopation" && settings.level != .beginner && settings.meter != "7/8" ? "funk" : "varied"
        let normalized = settings.normalized
        return (SightExercise.generateFresh(normalized, seed: seed, recentFingerprints: recent), focus, voice)
    }

    static func goalPath(goal: SightGoal, history: [SightAttempt]) -> [SightSettings] {
        let target = SightSettings(level: goal.level, bpm: goal.bpm, meter: goal.meter, focusRhythm: goal.focusRhythm, style: "varied", density: "balanced").normalized
        let rhythms = supportedRhythms(level: target.level, meter: target.meter)
        let easier = rhythms[max(0, (rhythms.firstIndex(of: target.focusRhythm) ?? 0) - 1)]
        var groups: [String: (settings: SightSettings, rows: [SightAttempt], last: Date)] = [:]
        for row in history where row.classification == "reading" && row.settings.level == target.level {
            let key = "\(row.settings.meter)|\(row.settings.focusRhythm)"
            var group = groups[key] ?? (row.settings, [], .distantPast)
            group.rows.append(row); group.last = row.playedAt; groups[key] = group
        }
        let review = groups.values.filter { $0.settings.meter != target.meter || $0.settings.focusRhythm != target.focusRhythm }
            .min { a, b in
                let aa = Double(a.rows.reduce(0) { $0 + $1.accuracy }) / Double(max(1, a.rows.count))
                let ba = Double(b.rows.reduce(0) { $0 + $1.accuracy }) / Double(max(1, b.rows.count))
                return aa != ba ? aa < ba : a.last < b.last
            }?.settings
        var warmup = target; warmup.bpm = max(40, target.bpm - 15); warmup.focusRhythm = easier; warmup.density = "light"
        var build = target; build.bpm = max(40, target.bpm - 10); build.density = "light"
        var reviewSettings = review ?? warmup; reviewSettings.bpm = min(reviewSettings.bpm, target.bpm); reviewSettings.bars = 2; reviewSettings.style = "varied"; reviewSettings.density = "light"
        var stretch = target; stretch.bpm = target.bpm < 200 ? target.bpm + 5 : target.bpm; stretch.density = "dense"
        return [warmup.normalized, build.normalized, reviewSettings.normalized, target, stretch.normalized]
    }
}
struct SightPerformedHit: Equatable {
    var instrument: DrumVoice
    var at: TimeInterval
}
struct SightAssignment: Codable {
    var version = 1
    var seed: UInt32
    var settings: SightSettings
    var title: String
    var dueDate: String?
    var minimumAccuracy: Int?
    var valid: Bool { version == 1 && settings == settings.normalized && title.count <= 80 && (dueDate == nil || Self.validDate(dueDate!)) && (minimumAccuracy == nil || (50...100).contains(minimumAccuracy!)) }
    static func validDate(_ value: String) -> Bool {
        guard value.count == 10, value[value.index(value.startIndex, offsetBy: 4)] == "-", value[value.index(value.startIndex, offsetBy: 7)] == "-" else { return false }
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        return formatter.date(from: value) != nil
    }
}
struct SightSubmission: Codable {
    var version = 1
    var title: String?
    var dueDate: String?
    var minimumAccuracy: Int?
    var meter: String
    var level: String
    var bpm: Int
    var accuracy: Int
    var score: Int
    var classification: String
    var valid: Bool { version == 1 && (0...100).contains(accuracy) && (0...100).contains(score) && (40...200).contains(bpm) && (title == nil || title!.count <= 80) && (dueDate == nil || SightAssignment.validDate(dueDate!)) && (minimumAccuracy == nil || (50...100).contains(minimumAccuracy!)) }
}
struct SightLearningPathStep {
    let title: String
    let level: LearnerLevel
    let meter: String
    let rhythm: String
    var settings: SightSettings { SightSettings(level: level, bpm: 80, bars: 2, meter: meter, focusRhythm: rhythm) }
}
enum SightLearningPath {
    static let steps = [
        SightLearningPathStep(title: "Steady quarter notes", level: .beginner, meter: "4/4", rhythm: "quarters"),
        SightLearningPathStep(title: "Eighth-note pulse", level: .beginner, meter: "4/4", rhythm: "eighths"),
        SightLearningPathStep(title: "Three-beat measures", level: .intermediate, meter: "3/4", rhythm: "eighths"),
        SightLearningPathStep(title: "Sixteenth-note reading", level: .intermediate, meter: "4/4", rhythm: "sixteenths"),
        SightLearningPathStep(title: "Five-quarter grouping", level: .advanced, meter: "5/4", rhythm: "sixteenths"),
        SightLearningPathStep(title: "Seven-eighth grouping", level: .advanced, meter: "7/8", rhythm: "sixteenths")
    ]
    static func nextIndex(in history: [SightAttempt]) -> Int {
        steps.firstIndex { step in !history.contains { $0.classification == "reading" && $0.accuracy >= 80 && $0.settings.level == step.level && $0.settings.meter == step.meter && $0.settings.focusRhythm == step.rhythm } } ?? steps.count
    }
}
enum SightFluency {
    static func calculate(exercise: SightExercise, rated: [RatedHit]) -> [String: Int] {
        var totals: [String: Int] = [:], correct: [String: Int] = [:]
        func record(_ name: String, _ passed: Bool) { totals[name, default: 0] += 1; if passed { correct[name, default: 0] += 1 } }
        let perBeat = exercise.subdivision / 4
        func rhythm(_ step: Int) -> String {
            let position = step % perBeat
            if position == 0 { return "quarters" }
            if exercise.subdivision == 12 { return "triplets" }
            if exercise.subdivision == 8 { return "eighths" }
            return position % 2 == 0 ? "eighths" : "sixteenths"
        }
        for target in exercise.hits {
            let row = rated.first { $0.step == target.step && $0.instrument == target.instrument && $0.rating != .miss && $0.rating != .extra }
            let passed = row?.rating == .great || row?.rating == .good
            record(rhythm(target.step), passed)
            if target.step % perBeat != 0 { record("syncopation", passed) }
        }
        let expected = Set(exercise.hits.map(\.step)), extras = Set(rated.filter { $0.rating == .extra }.compactMap(\.step))
        if exercise.totalSteps > 0 {
            for step in 0..<exercise.totalSteps where !expected.contains(step) { record("rests", !extras.contains(step)) }
        }
        return Dictionary(uniqueKeysWithValues: totals.map { ($0.key, Int((Double(correct[$0.key, default: 0]) * 100 / Double($0.value)).rounded())) })
    }
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
    static let seenKey = "drumHero.sightReadingSeen.v1.default"
    static func merge(_ device: [SightAttempt], _ cloud: [SightAttempt]) -> [SightAttempt] {
        var byID: [String: SightAttempt] = [:]
        for attempt in cloud + device { byID[attempt.id] = attempt }
        return Array(byID.values.sorted { $0.playedAt < $1.playedAt }.suffix(100))
    }
    static func decodeCloud(_ rows: [[String: Any]]) -> [SightAttempt] {
        guard let data = try? JSONSerialization.data(withJSONObject: rows) else { return [] }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return ((try? decoder.decode([SightAttempt].self, from: data)) ?? []).filter(\.valid)
    }
    static func encodeCloud(_ rows: [SightAttempt]) -> [[String: Any]] {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(Array(rows.suffix(100))),
              let value = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return value
    }
    static func read() -> [SightAttempt] { guard let data = UserDefaults.standard.data(forKey: key), let rows = try? JSONDecoder().decode([SightAttempt].self, from: data) else { return [] }; return Array(rows.filter(\.valid).suffix(100)) }
    static func write(_ rows: [SightAttempt]) throws { UserDefaults.standard.set(try JSONEncoder().encode(Array(rows.suffix(100))), forKey: key) }
    static func readSeen() -> [String] { (UserDefaults.standard.array(forKey: seenKey) as? [String] ?? []).filter { !$0.isEmpty && $0.count <= 20000 }.suffix(32).map { $0 } }
    static func remember(_ fingerprint: String) { var recent = readSeen().filter { $0 != fingerprint }; recent.append(String(fingerprint.prefix(20000))); UserDefaults.standard.set(Array(recent.suffix(32)), forKey: seenKey) }
    static func readGoal() -> SightGoal? { guard let data = UserDefaults.standard.data(forKey: goalKey), let value = try? JSONDecoder().decode(SightGoal.self, from: data), value.valid else { return nil }; return value }
    static func writeGoal(_ goal: SightGoal?) throws { if let goal { UserDefaults.standard.set(try JSONEncoder().encode(goal), forKey: goalKey) } else { UserDefaults.standard.removeObject(forKey: goalKey) } }
}
