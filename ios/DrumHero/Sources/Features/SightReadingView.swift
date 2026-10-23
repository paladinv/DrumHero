import SwiftUI
import Combine
import AVFoundation
import UIKit

@MainActor
final class SightReadingController: ObservableObject {
    enum Phase { case setup, preview, countIn, playing, results }
    @Published var phase = Phase.setup
    @Published var exercise: SightExercise?
    @Published var seconds = 10
    @Published var beat = 0.0
    @Published var result: PracticeResult?
    @Published var rated: [RatedHit] = []
    @Published var history = SightHistory.read()
    @Published var message = "Ready"
    @Published var classification = "reading"
    @Published var referencing = false
    @Published var assisted = false
    private var attempted = false
    private var task: Task<Void, Never>?
    private let audio: any DrumAudioPlaying
    private var expected: [ExpectedHit] = []
    private var startAt = 0.0
    private var endAt = 0.0
    private var selectedSource = "touch"
    private var generation = 0
    var active: Bool { phase == .preview || phase == .countIn || phase == .playing }
    init(audio: any DrumAudioPlaying = DrumAudioService()) { self.audio = audio }
    func fresh(_ settings: SightSettings) {
        stop(); exercise = SightExercise.generate(settings, seed: .random(in: .min ... .max), previous: exercise?.fingerprint)
        attempted = false; assisted = false; result = nil; rated = []; phase = .setup; message = "New exercise ready. Start to reveal notation."
    }
    func assignmentCode() -> String? {
        guard let exercise, let data = try? JSONEncoder().encode(exercise.settings) else { return nil }
        let payload = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return "\(exercise.seed).\(payload)"
    }
    func loadAssignment(_ code: String) -> SightSettings? {
        let parts = code.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "DH-SR1:", with: "").split(separator: ".", maxSplits: 1)
        guard parts.count == 2, let seed = UInt32(parts[0]) else { return nil }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 { payload.append("=") }
        guard let data = Data(base64Encoded: payload), let settings = try? JSONDecoder().decode(SightSettings.self, from: data) else { return nil }
        let normalized = settings.normalized
        stop(); exercise = SightExercise.generate(normalized, seed: seed); attempted = false; assisted = false
        result = nil; rated = []; phase = .setup; message = "Shared assignment loaded. Preview it before you start."
        return normalized
    }
    func stop() { generation += 1; task?.cancel(); task = nil; audio.stop(); referencing = false }
    func cancel() { stop(); phase = .setup; message = "Attempt ended. Restarting this exercise counts as practice." }
    func start(_ settings: SightSettings, source: String) {
        stop()
        if exercise == nil || exercise?.settings != settings.normalized { fresh(settings) }
        guard let exercise else { return }
        classification = assisted ? "assisted" : attempted ? "practice" : "reading"
        attempted = true; result = nil; rated = []; selectedSource = source; phase = .preview; seconds = 10
        do { try audio.prepare() } catch { cancel(); message = "Drum audio unavailable. Check audio output and restart as practice."; return }
        let token = generation
        let previewEnd = ProcessInfo.processInfo.systemUptime + 10
        let beatDuration = 60 / Double(exercise.settings.bpm)
        startAt = previewEnd + exercise.beatsPerBar * beatDuration
        endAt = startAt + exercise.duration
        expected = PracticeRules.expectedHits(pattern: exercise.pattern, bpm: exercise.settings.bpm, repetitions: 1, startAt: startAt)
        task = Task { [weak self] in
            var lastClick = -1
            while !Task.isCancelled {
                guard let self, self.generation == token else { return }
                let now = ProcessInfo.processInfo.systemUptime
                if now < previewEnd { self.seconds = max(0, Int(ceil(previewEnd - now))) }
                else if now < self.startAt { self.phase = .countIn }
                else if now < self.endAt + 0.11 { self.phase = .playing; self.beat = max(0, (now - self.startAt) / beatDuration) }
                else { self.finish(exercise, source: source); return }
                if now >= previewEnd && now < self.endAt {
                    let elapsed = now < self.startAt ? now - previewEnd : now - self.startAt
                    let bar = now < self.startAt ? -1 : Int(elapsed / (exercise.beatsPerBar * beatDuration))
                    let inBar = now < self.startAt ? elapsed : elapsed.truncatingRemainder(dividingBy: exercise.beatsPerBar * beatDuration)
                    let click = (bar + 1) * 100 + Int(inBar / beatDuration)
                    if click != lastClick { self.audio.play(.hihat); lastClick = click }
                }
                try? await Task.sleep(for: .milliseconds(8))
            }
        }
    }
    func hit(_ voice: DrumVoice, source: String, at: Double = ProcessInfo.processInfo.systemUptime, correctionMs: Double = 0) {
        guard selectedSource == source, phase == .playing || phase == .countIn, at >= startAt - 0.1, at <= endAt + 0.1, rated.count < 10000 else { return }
        audio.play(voice)
        let corrected = at - correctionMs / 1000
        if let index = PracticeRules.closestUnmatchedIndex(at: corrected, in: expected, instrument: voice), abs(expected[index].at - corrected) <= 0.1 {
            let offset = (corrected - expected[index].at) * 1000
            expected[index].matched = true
            rated.append(RatedHit(instrument: voice, rating: PracticeRules.classify(offsetMs: offset), offsetMs: Int(offset.rounded()), step: expected[index].step))
        } else {
            let step = max(0, min((exercise?.stepsPerBar ?? 1) * (exercise?.settings.bars ?? 1) - 1, Int((at - startAt) / (exercise?.stepDuration ?? 1))))
            rated.append(RatedHit(instrument: voice, rating: .extra, step: step))
        }
    }
    private func finish(_ exercise: SightExercise, source: String) {
        for hit in expected where !hit.matched { rated.append(RatedHit(instrument: hit.instrument, rating: .miss, step: hit.step)) }
        let result = PracticeRules.result(pattern: exercise.pattern, bpm: exercise.settings.bpm, playedAt: .now, ratedHits: rated)
        let offsets = rated.compactMap(\.offsetMs)
        if assisted { classification = "assisted" }
        let row = SightAttempt(seed: exercise.seed, settings: exercise.settings, source: source, inputProfile: source, classification: classification, score: result.score, accuracy: result.accuracy, meanOffsetMs: offsets.isEmpty ? nil : Int((Double(offsets.reduce(0, +)) / Double(offsets.count)).rounded()), misses: result.miss, extras: result.extra)
        history = Array((history + [row]).suffix(100))
        do { try SightHistory.write(history) } catch { message = "Result could not be saved." }
        stop(); self.result = result; phase = .results
    }
    func reference() {
        guard let exercise, phase == .results else { return }
        stop(); referencing = true
        do { try audio.prepare() } catch { referencing = false; message = "Reference audio unavailable."; return }
        let token = generation
        task = Task { [weak self] in
            let base = ProcessInfo.processInfo.systemUptime + 0.1
            for hit in exercise.hits {
                let delay = base + Double(hit.step) * exercise.stepDuration - ProcessInfo.processInfo.systemUptime
                if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                guard !Task.isCancelled, let self, self.generation == token else { return }
                self.audio.play(hit.instrument)
            }
            try? await Task.sleep(for: .seconds(max(0.2, base + exercise.duration - ProcessInfo.processInfo.systemUptime)))
            guard !Task.isCancelled else { return }; self?.stop()
        }
    }
    func recommendation(for settings: SightSettings, source: String) -> SightSettings? {
        let rows = history.filter { $0.classification == "reading" && $0.source == source && $0.settings.level == settings.level && $0.settings.bpm == settings.bpm && $0.settings.bars == settings.bars && $0.settings.meter == settings.meter && $0.settings.triplets == settings.triplets && $0.settings.snareOnly == settings.snareOnly && $0.settings.focusVoice == settings.focusVoice && $0.settings.focusRhythm == settings.focusRhythm && $0.settings.style == settings.style }
        guard rows.count >= 3 else { return nil }
        let average = rows.suffix(3).reduce(0) { $0 + $1.accuracy } / 3
        var next = settings
        if average >= 88 && settings.bpm < 200 { next.bpm = min(200, settings.bpm + 5) }
        else if average >= 88 && settings.level == .beginner && settings.focusRhythm != "eighths" { next.focusRhythm = "eighths" }
        else if average >= 88 && settings.level == .intermediate { next.level = .advanced }
        else if average >= 88 && settings.level == .advanced && settings.meter != "7/8" && settings.focusRhythm != "triplets" { next.focusRhythm = "triplets" }
        else if average < 65 {
            if settings.focusRhythm == "mixed" { next.focusRhythm = settings.level == .beginner ? "quarters" : "eighths" }
            else if ["sixteenths", "triplets"].contains(settings.focusRhythm) { next.focusRhythm = "eighths" }
            else if settings.focusRhythm == "eighths" { next.focusRhythm = "quarters" }
            else if settings.bpm > 40 { next.bpm = max(40, settings.bpm - 5) }
            else { return nil }
        }
        else { return nil }
        return next.normalized
    }
}

struct SightReadingView: View {
    @StateObject private var controller = SightReadingController()
    @StateObject private var midi = MobileMIDIInput()
    @State private var settings = SightSettings()
    @State private var source = "touch"
    @State private var zoom = 1.0
    @State private var tempoLadder = false
    @State private var goal = SightHistory.readGoal()
    @State private var goalDraft = SightGoal()
    @State private var goalStatus = ""
    @State private var historyLevel = "Any"
    @State private var historyMeter = "Any"
    @State private var historyInput = "Any"
    @State private var historyTempo = "Any"
    @State private var assignmentCode = ""
    @State private var printableURL: URL?
    @State private var selectedMidiSourceID = ""
    @FocusState private var keyboardFocused: Bool
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("drumHero.nativeInputOffset.touch") private var touchCorrection = 0.0
    private var midiCorrection: Double { NativeMIDICalibration.correction(for: selectedMidiSourceID) }
    var body: some View {
        GeometryReader { geometry in
        ScrollViewReader { scoreScroll in
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Read a fresh phrase, prepare silently for ten seconds, then play once.")
                if controller.active {
                    Text("\(settings.level.rawValue) · \(settings.bpm) BPM · \(settings.meter) · \(settings.bars) bars · \(settings.style) · \(settings.focusRhythm) · \(settings.focusVoice)").font(.caption)
                } else {
                    setup.disabled(controller.referencing)
                }
                HStack {
                    if controller.active { Button("Cancel attempt") { controller.cancel() } }
                    else {
                        Button(controller.phase == .results ? "Retry as practice" : "Start sight reading") {
                            if source == "midi" && midi.connectedSources.isEmpty { controller.message = "Connect MIDI first."; return }
                            controller.start(settings, source: source); keyboardFocused = true
                        }.disabled(controller.referencing)
                        Button("New exercise") { controller.fresh(settings) }.disabled(controller.referencing)
                    }
                }
                Text(status).accessibilityIdentifier("sight-status")
                if let code = controller.assignmentCode(), let exercise = controller.exercise {
                    HStack {
                        ShareLink(item: "DH-SR1:\(code)\n\(exercise.settings.level.rawValue) · \(exercise.settings.meter) · \(exercise.settings.bpm) BPM") { Label("Share assignment code", systemImage: "square.and.arrow.up") }
                        Button("Prepare printable score") { printableURL = makePrintablePDF(exercise) }
                        if let printableURL { ShareLink(item: printableURL) { Label("Print or share PDF", systemImage: "printer") } }
                    }
                }
                DisclosureGroup("Import a student assignment") {
                    TextField("Assignment code", text: $assignmentCode).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Load shared assignment") {
                        if let loaded = controller.loadAssignment(assignmentCode) { settings = loaded; printableURL = nil }
                        else { controller.message = "Assignment code is invalid." }
                    }
                }
                if !controller.active, let suggested = controller.recommendation(for: settings, source: source) {
                    GroupBox("Suggested next step") {
                        Text("Based on recent accuracy and timing in this setting.")
                        Button(suggestionLabel(suggested)) { settings = suggested; controller.fresh(suggested) }
                    }
                }
                if let exercise = controller.exercise, controller.phase != .setup {
                    HStack { Text("Notation zoom"); Slider(value: $zoom, in: 0.75...2) }
                    ScrollView(.horizontal) {
                        VStack(spacing: 0) {
                            ForEach(0..<exercise.settings.bars, id: \.self) { bar in
                                SightStaff(exercise: exercise, beat: controller.phase == .playing ? controller.beat : nil, displayBar: bar)
                                    .frame(width: max(280, geometry.size.width - 32) * zoom, height: 170 * zoom)
                                    .id("sight-bar-\(bar)")
                            }
                        }
                    }
                    Text("Legend: Kick · Space, Snare · F, Hi-hat · J, Tom · K, Crash · L. Cross heads: cymbals. > accent; rests: silence. Accents are cues, not scored dynamics.").font(.caption)
                    if settings.meter == "7/8" { Text("2+2+3 eighths · quarter-note BPM") }
                    if settings.meter == "5/4" { Text("3+2 quarters") }
                    DisclosureGroup("Counted note descriptions") {
                        Text(exercise.hits.map { "Bar \($0.step / exercise.stepsPerBar + 1), beat \(String(format: "%.2f", Double($0.step % exercise.stepsPerBar) * 4 / Double(exercise.subdivision) + 1)): \($0.instrument.title)\($0.accent ? ", accent" : "")" }.joined(separator: ". "))
                    }
                }
                HStack { ForEach(DrumVoice.allCases) { voice in Button(voice.title) { controller.hit(voice, source: source, correctionMs: touchCorrection) }.frame(minWidth: 44, minHeight: 60).disabled(controller.phase != .playing || source == "midi") } }
                if let result = controller.result {
                    Text("Sight-reading results").font(.title2).accessibilityAddTraits(.isHeader)
                    Text("\(controller.classification) · \(result.accuracy)% accuracy · \(result.score) score")
                    Text("\(result.miss) misses · \(result.extra) extras")
                    let offsets = controller.rated.compactMap(\.offsetMs)
                    if !offsets.isEmpty { Text("Average timing: \(offsets.reduce(0, +) / offsets.count) ms (negative = early, positive = late)") }
                    if let exercise = controller.exercise {
                        ForEach(0..<exercise.settings.bars, id: \.self) { bar in
                            DisclosureGroup("Bar \(bar + 1) — misses and extras") {
                                ForEach(DrumVoice.allCases) { voice in
                                    let rows = controller.rated.filter { $0.instrument == voice && ($0.step ?? 0) / exercise.stepsPerBar == bar }
                                    Text("\(voice.title): \(rows.filter { $0.rating == .miss }.count) misses, \(rows.filter { $0.rating == .extra }.count) extras")
                                }
                                let notes = controller.rated.filter { ($0.step ?? 0) / exercise.stepsPerBar == bar }.sorted { ($0.step ?? 0) < ($1.step ?? 0) }
                                ForEach(Array(notes.enumerated()), id: \.offset) { element in
                                    let note = element.element
                                    let beat = Double((note.step ?? 0) % exercise.stepsPerBar) * 4 / Double(exercise.subdivision) + 1
                                    let timing = note.offsetMs.map { " · \(abs($0)) ms \($0 < 0 ? "early" : $0 > 0 ? "late" : "on time")" } ?? ""
                                    Text("\(note.rating.rawValue.capitalized) · \(note.instrument.title) · beat \(beat.formatted(.number.precision(.fractionLength(0...2))))\(timing)")
                                }
                            }
                        }
                    }
                    if tempoLadder {
                        Text("Tempo ladder advances by five BPM after an 85% pass.").font(.caption)
                        if result.accuracy >= 85 && settings.bpm < 200 {
                            Button("Next tempo: \(settings.bpm + 5) BPM") { var next = settings; next.bpm = min(200, next.bpm + 5); settings = next.normalized; controller.fresh(settings) }
                        } else if result.accuracy >= 85 { Text("Tempo ladder complete at 200 BPM.") }
                        else { Text("Retry this phrase and reach 85% to advance.").font(.caption) }
                    }
                    Button(controller.referencing ? "Stop reference" : "Play reference") { if controller.referencing { controller.stop() } else { controller.reference() } }
                }
                goalPanel
                history
            }.padding()
        }
        .navigationTitle("Sight reading")
        .focusable().focused($keyboardFocused)
        .onKeyPress(phases: .down) { press in
            guard source == "keyboard", controller.phase == .playing, press.modifiers.isEmpty else { return .ignored }
            let voices: [String: DrumVoice] = [" ": .kick, "f": .snare, "j": .hihat, "k": .tom, "l": .crash]
            guard let voice = voices[press.characters.lowercased()] else { return .ignored }
            controller.hit(voice, source: "keyboard", correctionMs: touchCorrection); return .handled
        }
        .task {
            while !Task.isCancelled {
                if source == "midi" && controller.active && !midi.hasLiveSources { controller.cancel(); controller.message = "MIDI disconnected. Restart as practice after reconnecting." }
                try? await Task.sleep(for: .milliseconds(300))
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active && (controller.active || controller.referencing) { controller.cancel() } }
        .onChange(of: selectedMidiSourceID) { _, _ in midi.stop() }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notice in
            if let type = notice.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
               type == AVAudioSession.InterruptionType.began.rawValue, controller.active || controller.referencing { controller.cancel() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { notice in
            if let reason = notice.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
               reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue, controller.active || controller.referencing { controller.cancel() }
        }
        .onDisappear { controller.stop(); midi.stop() }
        .onChange(of: settings) { _, value in if !controller.active { settings = value.normalized; controller.fresh(settings) } }
        .onChange(of: controller.phase) { _, phase in
            if phase == .preview { scoreScroll.scrollTo("sight-bar-0", anchor: .center) }
        }
        .onChange(of: Int(controller.beat / (controller.exercise?.beatsPerBar ?? 4))) { _, bar in
            if controller.phase == .playing { scoreScroll.scrollTo("sight-bar-\(bar)", anchor: .center) }
        }
        }
        }
    }
    private var status: String {
        switch controller.phase {
        case .setup: controller.message
        case .preview: "Silent preview · \(controller.seconds) seconds"
        case .countIn: "Count-in"
        case .playing: "Play the notation"
        case .results: controller.message == "Ready" ? "Complete" : controller.message
        }
    }
    private var setup: some View {
        GroupBox("Exercise setup") {
            VStack(alignment: .leading) {
                Picker("Level", selection: $settings.level) { ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0) } }
                Stepper("Tempo: \(settings.bpm) quarter-note BPM", value: $settings.bpm, in: 40...200)
                Picker("Bars", selection: $settings.bars) { ForEach([1, 2, 4], id: \.self) { Text("\($0)").tag($0) } }
                Picker("Meter", selection: $settings.meter) { ForEach(settings.meters, id: \.self) { Text($0).tag($0) } }
                if settings.level == .beginner { Toggle("Snare only", isOn: $settings.snareOnly) }
                if settings.level == .advanced && settings.meter != "7/8" { Toggle("Triplets", isOn: $settings.triplets) }
                Picker("Rhythm focus", selection: $settings.focusRhythm) {
                    Text("Mixed").tag("mixed"); Text("Quarters").tag("quarters"); Text("Eighths").tag("eighths")
                    if settings.level != .beginner { Text("Sixteenths").tag("sixteenths") }
                    if settings.level == .advanced && settings.meter != "7/8" { Text("Triplets").tag("triplets") }
                }
                Picker("Voice focus", selection: $settings.focusVoice) {
                    Text("Mixed voices").tag("mixed")
                    ForEach(DrumVoice.allCases) { voice in Text(voice.title).tag(voice.rawValue) }
                }
                Picker("Groove and phrase", selection: $settings.style) {
                    Text("Varied reading").tag("varied"); Text("Rock backbeat").tag("rock")
                    if settings.level == .advanced && settings.meter != "7/8" { Text("Shuffle feel").tag("shuffle") }
                    if settings.level != .beginner { Text("Groove with a fill").tag("fill") }
                }
                Toggle("Tempo ladder (+5 BPM after 85%)", isOn: $tempoLadder)
                Picker("Input", selection: $source) { Text("Touch pads").tag("touch"); Text("Keyboard").tag("keyboard"); Text("MIDI").tag("midi") }
                if source == "midi" {
                    Button("Refresh MIDI devices") {
                        let sources = midi.refreshAvailableSources()
                        if !sources.contains(where: { $0.id == selectedMidiSourceID }) { selectedMidiSourceID = sources.first?.id ?? "" }
                    }
                    if !midi.availableSources.isEmpty {
                        Picker("MIDI device", selection: $selectedMidiSourceID) {
                            ForEach(midi.availableSources) { input in Text(input.name).tag(input.id) }
                        }
                        Button("Connect selected MIDI device") {
                            guard !selectedMidiSourceID.isEmpty else { return }
                            midi.connectSelectedSource(selectedMidiSourceID) { voice, at, _, sourceID in controller.hit(voice, source: "midi", at: at, correctionMs: NativeMIDICalibration.correction(for: sourceID)) }
                        }
                        Text("Device timing correction: \(Int(midiCorrection)) ms")
                    }
                    Text(midi.status).font(.caption)
                }
                Text("Input mapping and timing corrections use Trainer settings.").font(.caption)
            }
        }
    }
    private var history: some View {
        let rows = controller.history.filter { row in
            row.classification == "reading" && (historyLevel == "Any" || row.settings.level.rawValue == historyLevel)
                && (historyMeter == "Any" || row.settings.meter == historyMeter) && (historyInput == "Any" || row.source == historyInput)
                && (historyTempo == "Any" || historyTempo == "under80" && row.settings.bpm < 80 || historyTempo == "80to119" && row.settings.bpm >= 80 && row.settings.bpm < 120 || historyTempo == "120plus" && row.settings.bpm >= 120)
        }
        let practice = controller.history.filter { $0.classification != "reading" }
        let recent = Array(rows.suffix(10))
        return VStack(alignment: .leading) {
            Text("Progress insights").font(.title2)
            Picker("Level filter", selection: $historyLevel) { Text("Any level").tag("Any"); ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0.rawValue) } }
            Picker("Meter filter", selection: $historyMeter) { Text("Any meter").tag("Any"); ForEach(["4/4", "3/4", "5/4", "7/8"], id: \.self) { Text($0).tag($0) } }
            Picker("Input filter", selection: $historyInput) { Text("Any input").tag("Any"); Text("Touch").tag("touch"); Text("Keyboard").tag("keyboard"); Text("MIDI").tag("midi") }
            Picker("Tempo filter", selection: $historyTempo) { Text("Any tempo").tag("Any"); Text("Under 80").tag("under80"); Text("80–119").tag("80to119"); Text("120+").tag("120plus") }
            Text("\(rows.count) first readings · " + (rows.isEmpty ? "Complete a reading to start a trend." : "\(rows.reduce(0) { $0 + $1.accuracy } / rows.count)% average accuracy") + " · \(practice.count) practice/assisted shown separately.")
            if !recent.isEmpty {
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(Array(recent.enumerated()), id: \.offset) { element in
                        let row = element.element
                        RoundedRectangle(cornerRadius: 3).fill(Color.red).frame(maxWidth: .infinity).frame(height: max(6, CGFloat(row.accuracy)))
                            .accessibilityLabel("\(row.accuracy) percent at \(row.settings.bpm) BPM")
                    }
                }.frame(height: 100, alignment: .bottom).accessibilityElement(children: .contain)
                Text("Recent first-reading accuracy, oldest to newest.").font(.caption)
            }
            DisclosureGroup("Latest attempts (\(controller.history.count)/100)") {
                ForEach(controller.history.reversed()) { row in Text("\(row.settings.level.rawValue) · \(row.settings.meter) · \(row.settings.bpm) BPM · \(row.source) · \(row.classification) · \(row.accuracy)%") }
            }
        }
    }
    private var goalPanel: some View {
        let completed = goal.map { value in controller.history.filter(value.contains).count } ?? 0
        return GroupBox("Practice goal") {
            VStack(alignment: .leading) {
                if let goal {
                    Text("\(completed) of \(goal.targetReads) first readings at \(goal.accuracy)% or higher · \(goal.level.rawValue), \(goal.focusRhythm) in \(goal.meter) at \(goal.bpm) BPM")
                    ProgressView(value: Double(min(completed, goal.targetReads)), total: Double(goal.targetReads))
                    Button("Remove goal") { self.goal = nil; try? SightHistory.writeGoal(nil); goalStatus = "Goal removed." }
                } else { Text("Set a rhythm and tempo target for your next few reading sessions.") }
                Picker("Goal level", selection: $goalDraft.level) { ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0) } }
                Picker("Goal meter", selection: $goalDraft.meter) { ForEach(goalMeters, id: \.self) { Text($0).tag($0) } }
                Stepper("Goal tempo: \(goalDraft.bpm) BPM", value: $goalDraft.bpm, in: 40...200)
                Picker("Goal rhythm", selection: $goalDraft.focusRhythm) {
                    Text("Mixed").tag("mixed"); Text("Quarters").tag("quarters"); Text("Eighths").tag("eighths")
                    if goalDraft.level != .beginner { Text("Sixteenths").tag("sixteenths") }
                    if goalDraft.level == .advanced && goalDraft.meter != "7/8" { Text("Triplets").tag("triplets") }
                }
                Stepper("Accuracy target: \(goalDraft.accuracy)%", value: $goalDraft.accuracy, in: 50...100)
                Stepper("First readings to complete: \(goalDraft.targetReads)", value: $goalDraft.targetReads, in: 1...20)
                Button(goal == nil ? "Save goal" : "Update goal") { saveGoal() }
                Text(goalStatus).font(.caption).accessibilityIdentifier("sight-goal-status")
            }
        }
    }
    private var goalMeters: [String] {
        let level = goalDraft.level
        return SightSettings(level: level).meters
    }
    private func suggestionLabel(_ suggested: SightSettings) -> String {
        if suggested.bpm != settings.bpm { return "Use suggested tempo: \(suggested.bpm) BPM" }
        if suggested.level != settings.level { return "Use suggested level: \(suggested.level.rawValue)" }
        return "Use suggested rhythm: \(suggested.focusRhythm.capitalized)"
    }
    private func saveGoal() {
        if !goalMeters.contains(goalDraft.meter) { goalDraft.meter = goalMeters.first ?? "4/4" }
        if !goalDraft.valid { goalStatus = "Choose a supported level, meter, and rhythm."; return }
        do { try SightHistory.writeGoal(goalDraft); goal = goalDraft; goalStatus = "Goal saved on this device." }
        catch { goalStatus = "Goal could not be saved." }
    }
    @MainActor private func makePrintablePDF(_ exercise: SightExercise) -> URL? {
        let imageRenderer = ImageRenderer(content: SightStaff(exercise: exercise, beat: nil).frame(width: 980, height: CGFloat(170 * exercise.settings.bars)))
        guard let image = imageRenderer.uiImage else { return nil }
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let pdf = UIGraphicsPDFRenderer(bounds: page).pdfData { context in
            context.beginPage()
            let title = "Drum Hero sight-reading exercise"
            let details = "\(exercise.settings.level.rawValue) · \(exercise.settings.meter) · \(exercise.settings.bpm) quarter-note BPM · \(exercise.settings.bars) bars"
            title.draw(at: CGPoint(x: 36, y: 32), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 18)])
            details.draw(at: CGPoint(x: 36, y: 60), withAttributes: [.font: UIFont.systemFont(ofSize: 12)])
            let rect = CGRect(x: 24, y: 92, width: 564, height: 560)
            image.draw(in: rect)
            "Legend: Kick, Snare, Hi-hat, Tom, Crash · > marks an accent · quarter-note BPM".draw(at: CGPoint(x: 36, y: 680), withAttributes: [.font: UIFont.systemFont(ofSize: 10)])
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("DrumHero-Sight-\(exercise.seed).pdf")
        do { try pdf.write(to: url); return url } catch { controller.message = "Could not create the printable score."; return nil }
    }
}

/// One staff per measure, with separate hands/feet lanes and the web renderer's positions.
struct SightStaff: View {
    let exercise: SightExercise
    let beat: Double?
    var displayBar: Int? = nil
    private struct Event {
        var step: Int
        var duration: Int
        var hits: [PatternHit]
        var group: Int
        var measureRest = false
    }
    private func group(_ step: Int) -> Int {
        let units = exercise.subdivision / 4
        let position = Double(step) / Double(units)
        let groups: [Double] = exercise.settings.meter == "7/8" ? [1, 1, 1.5] : exercise.settings.meter == "5/4" ? [3, 2] : Array(repeating: 1, count: Int(exercise.beatsPerBar))
        var end = 0.0
        for (index, duration) in groups.enumerated() { end += duration; if position < end { return index } }
        return groups.count - 1
    }
    private func events(_ bar: Int, feet: Bool) -> [Event] {
        let notes = exercise.hits.filter { $0.step / exercise.stepsPerBar == bar && ($0.instrument == .kick) == feet }
        if notes.isEmpty { return [Event(step: 0, duration: exercise.stepsPerBar, hits: [], group: 0, measureRest: true)] }
        var result: [Event] = []
        var step = 0
        while step < exercise.stepsPerBar {
            let hits = notes.filter { $0.step % exercise.stepsPerBar == step }
            var duration = 1
            if hits.isEmpty {
                let lengths = exercise.subdivision == 12 ? [3, 1] : [16, 8, 4, 2, 1]
                for length in lengths where step % length == 0 && step + length <= exercise.stepsPerBar {
                    let silent = (step..<(step + length)).allSatisfy { candidate in group(candidate) == group(step) && !notes.contains { $0.step % exercise.stepsPerBar == candidate } }
                    if silent { duration = length; break }
                }
            }
            result.append(Event(step: step, duration: duration, hits: hits, group: group(step)))
            step += duration
        }
        return result
    }
    private func flags(_ event: Event) -> Int {
        max(0, Int(log2(Double(exercise.subdivision) / Double(event.duration) * (exercise.subdivision == 12 ? 2.0 / 3 : 1) / 4).rounded()))
    }
    var body: some View {
        Canvas { context, size in
            let count = displayBar == nil ? exercise.settings.bars : 1
            let rowHeight = size.height / Double(count)
            let positions: [DrumVoice: Double] = [.kick: 3, .snare: -1, .tom: -2, .hihat: -5, .crash: -6]
            for row in 0..<count {
                let bar = displayBar ?? row
                let top = Double(row) * rowHeight + rowHeight * 0.5
                let scale = rowHeight / 170
                let gap = 10 * scale
                let left = 50.0, right = size.width - 20
                for line in -2...2 {
                    var path = Path(); path.move(to: CGPoint(x: left, y: top + Double(line) * gap)); path.addLine(to: CGPoint(x: right, y: top + Double(line) * gap))
                    context.stroke(path, with: .color(.primary), lineWidth: 1)
                }
                for x in [left, right] {
                    var path = Path(); path.move(to: CGPoint(x: x, y: top - 2 * gap)); path.addLine(to: CGPoint(x: x, y: top + 2 * gap)); context.stroke(path, with: .color(.primary), lineWidth: 1)
                }
                context.draw(Text("Bar \(bar + 1) · \(exercise.settings.meter)").font(.system(size: 10 * scale)), at: CGPoint(x: 95, y: Double(row) * rowHeight + 8 * scale))
                let unitWidth = (right - left - 25) / Double(exercise.stepsPerBar)
                for feet in [false, true] {
                    let lane = events(bar, feet: feet)
                    let stemY = top + (feet ? 51 : -38) * scale
                    for (index, event) in lane.enumerated() {
                        let x = left + 20 + Double(event.step) * unitWidth
                        if event.hits.isEmpty {
                            let quarters = exercise.subdivision == 12 && event.duration == 1 ? 0.5 : Double(event.duration) * 4 / Double(exercise.subdivision)
                            var rest = context
                            rest.translateBy(x: event.measureRest ? (left + right) / 2 : x, y: top + (feet ? 34 : 0) * scale)
                            rest.scaleBy(x: scale, y: scale)
                            if event.measureRest || quarters >= 2 {
                                rest.fill(Path(CGRect(x: -5, y: event.measureRest || quarters >= 4 ? 0 : -4, width: 10, height: 4)), with: .color(.primary))
                            } else if quarters >= 0.99 {
                                var path = Path(); path.move(to: CGPoint(x: 1, y: -10)); path.addLine(to: CGPoint(x: -3, y: -4)); path.addLine(to: CGPoint(x: 3, y: 2)); path.addLine(to: CGPoint(x: -2, y: 6)); path.addLine(to: CGPoint(x: 1, y: 11))
                                rest.stroke(path, with: .color(.primary), lineWidth: 2)
                            } else {
                                var stem = Path(); stem.move(to: CGPoint(x: 2, y: -5)); stem.addLine(to: CGPoint(x: -3, y: 10)); rest.stroke(stem, with: .color(.primary), lineWidth: 1.5)
                                for flag in 0..<(quarters < 0.49 ? 2 : 1) {
                                    let y = Double(flag * 5)
                                    rest.fill(Path(ellipseIn: CGRect(x: -3.5, y: -7.5 + y, width: 5, height: 5)), with: .color(.primary))
                                    var path = Path(); path.move(to: CGPoint(x: 0, y: -4 + y)); path.addLine(to: CGPoint(x: 4, y: -8 + y)); rest.stroke(path, with: .color(.primary), lineWidth: 1)
                                }
                            }
                            continue
                        }
                        let stemX = x + (feet ? -4 : 4) * scale
                        let fromY = top + (event.hits.map { positions[$0.instrument] ?? 0 }.min() ?? 0) * gap / 2
                        var stem = Path(); stem.move(to: CGPoint(x: stemX, y: fromY)); stem.addLine(to: CGPoint(x: stemX, y: stemY)); context.stroke(stem, with: .color(.primary), lineWidth: 1)
                        for hit in event.hits {
                            let y = top + (positions[hit.instrument] ?? 0) * gap / 2
                            if hit.instrument == .hihat || hit.instrument == .crash {
                                var cross = Path(); cross.move(to: CGPoint(x: x - 4, y: y - 4)); cross.addLine(to: CGPoint(x: x + 4, y: y + 4)); cross.move(to: CGPoint(x: x - 4, y: y + 4)); cross.addLine(to: CGPoint(x: x + 4, y: y - 4)); context.stroke(cross, with: .color(.primary), lineWidth: 1.7)
                            } else { context.fill(Path(ellipseIn: CGRect(x: x - 5, y: y - 3, width: 10, height: 6)), with: .color(.primary)) }
                            if hit.accent { context.draw(Text(">").font(.caption), at: CGPoint(x: x, y: top - 48 * scale)) }
                        }
                        let next = index + 1 < lane.count ? lane[index + 1] : nil
                        let previous = index > 0 ? lane[index - 1] : nil
                        let beamsRight = next.map { !$0.hits.isEmpty && $0.group == event.group ? min(flags(event), flags($0)) : 0 } ?? 0
                        let beamsLeft = previous.map { !$0.hits.isEmpty && $0.group == event.group ? min(flags(event), flags($0)) : 0 } ?? 0
                        for flag in 0..<flags(event) {
                            let y = stemY + Double(flag) * (feet ? -5 : 5) * scale
                            if flag < beamsRight, let next {
                                var beam = Path(); beam.move(to: CGPoint(x: stemX, y: y)); beam.addLine(to: CGPoint(x: left + 20 + Double(next.step) * unitWidth + (feet ? -4 : 4) * scale, y: y)); context.stroke(beam, with: .color(.primary), lineWidth: 3)
                            } else if flag >= beamsLeft {
                                var flagPath = Path(); flagPath.move(to: CGPoint(x: stemX, y: y)); flagPath.addQuadCurve(to: CGPoint(x: stemX + 4, y: y + (feet ? -16 : 16)), control: CGPoint(x: stemX + 12, y: y + (feet ? -8 : 8))); context.stroke(flagPath, with: .color(.primary), lineWidth: 1.5)
                            }
                        }
                    }
                }
                if exercise.subdivision == 12 {
                    for start in stride(from: 0, to: exercise.stepsPerBar, by: 3) { context.draw(Text("3").font(.caption), at: CGPoint(x: left + 20 + Double(start + 1) * unitWidth, y: Double(row) * rowHeight + 25 * scale)) }
                }
                if let beat, Int(beat / exercise.beatsPerBar) == bar {
                    let fraction = beat.truncatingRemainder(dividingBy: exercise.beatsPerBar) / exercise.beatsPerBar
                    let x = left + 20 + fraction * (right - left - 25)
                    var cursor = Path(); cursor.move(to: CGPoint(x: x, y: top - 40 * scale)); cursor.addLine(to: CGPoint(x: x, y: top + 40 * scale)); context.stroke(cursor, with: .color(.red), lineWidth: 2)
                }
            }
        }.accessibilityLabel("Percussion staff notation. Counted note descriptions are available below.")
    }
}
