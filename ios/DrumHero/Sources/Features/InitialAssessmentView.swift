import AVFoundation
import SwiftData
import SwiftUI

struct InitialAssessmentView: View {
    let content: MobileContentDocument
    @StateObject private var controller = AssessmentController()
    @StateObject private var midi = MobileMIDIInput()
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var keyboardFocused: Bool
    @State private var deleteID: String?
    @State private var selectedMidiSourceID = ""
    @AppStorage("drumHero.nativeInputOffset.touch") private var touchCorrection = 0.0
    private var midiCorrection: Double { NativeMIDICalibration.correction(for: selectedMidiSourceID) }
    private var correction: Double { controller.input == "midi" ? midiCorrection : touchCorrection }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Find a starting point with a short playing, listening, and reading assessment. Allow about five minutes, plus setup and retries.")
                Text("This is a starting-point estimate, not a certification. Lessons stay available and assessment results stay separate from practice scores.").font(.caption)
                if controller.stage == .setup { setup }
                if controller.stage == .tasks {
                    if let probe = controller.probe { probeCard(probe.variant(controller.probeVariantIndex)) }
                    else if let question = controller.question { questionCard(question) }
                }
                Text(status).accessibilityIdentifier("assessment-status").accessibilityAddTraits(.updatesFrequently)
                if controller.stage != .results { pads }
                if controller.stage == .tasks {
                    if controller.active { Button("Pause and discard this attempt") { controller.interrupt() } }
                    Button("End assessment and view results") { controller.finish(early: true) }
                }
                if controller.stage == .results, let draft = controller.draft { results(draft) }
                history
            }.padding().frame(maxWidth: 850).frame(maxWidth: .infinity)
        }
        .navigationTitle("Initial skill assessment")
        .focusable().focused($keyboardFocused)
        .onKeyPress(phases: .down) { press in
            guard controller.input == "keyboard", press.modifiers.isEmpty else { return .ignored }
            let voices: [String: DrumVoice] = [" ": .kick, "f": .snare, "j": .hihat, "k": .tom, "l": .crash]
            guard let voice = voices[press.characters.lowercased()] else { return .ignored }
            controller.hit(voice, source: "keyboard", correctionMs: touchCorrection); return .handled
        }
        .onChange(of: scenePhase) { _, value in if value != .active { controller.interrupt() } }
        .onChange(of: controller.input) { _, _ in controller.stop(); midi.stop(); controller.checked = false; controller.soundEnabled = false }
        .onChange(of: selectedMidiSourceID) { _, _ in midi.stop(); controller.checked = false }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notice in
            if let type = notice.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, type == AVAudioSession.InterruptionType.began.rawValue { controller.interrupt() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { notice in
            if let reason = notice.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt, reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { controller.interrupt() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AssessmentHistory.changed)) { _ in controller.store = AssessmentHistory.read() }
        .task {
            while !Task.isCancelled {
                if controller.input == "midi" && controller.active && !midi.hasLiveSources { controller.interrupt(); controller.message = "MIDI disconnected. Reconnect to restart this probe." }
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
        .onDisappear { controller.stop(); midi.stop() }
        .confirmationDialog("Delete this assessment? Its applied plan will also be removed.", isPresented: Binding(get: { deleteID != nil }, set: { if !$0 { deleteID = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) { if let id = deleteID { controller.delete(id) }; deleteID = nil }
        }
    }
    private var status: String {
        switch controller.phase {
        case .demonstration: "Listen to the demonstration"
        case .countIn: "Count-in · \(controller.beat)"
        case .playing: "Play · \(controller.beat)"
        case .paused: "Paused — restart this probe"
        case .idle: controller.message
        }
    }
    private func connect() {
        guard !selectedMidiSourceID.isEmpty else { controller.message = "Refresh MIDI devices and select a source first."; return }
        midi.connectSelectedSource(selectedMidiSourceID) { voice, at, velocity, sourceID in
            controller.hit(voice, source: "midi", at: at, correctionMs: NativeMIDICalibration.correction(for: sourceID), velocity: velocity)
        }
    }
    private var setup: some View {
        GroupBox("Assessment setup") {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Input", selection: $controller.input) { Text("Touch pads").tag("touch"); Text("Keyboard").tag("keyboard"); Text("MIDI").tag("midi") }
                Picker("Access needs", selection: $controller.adaptation) { Text("Full kit").tag("standard"); Text("Hands only").tag("hands-only"); Text("Single voice").tag("single-voice") }
                Text("Hands-only uses tom instead of kick. Single-voice omits coordination. Dynamics is measured only with varied MIDI velocities.").font(.caption)
                if controller.input == "midi" {
                    Button("Refresh MIDI devices") {
                        let sources = midi.refreshAvailableSources()
                        if !sources.contains(where: { $0.id == selectedMidiSourceID }) { selectedMidiSourceID = sources.first?.id ?? "" }
                    }
                    if !midi.availableSources.isEmpty {
                        Picker("MIDI device", selection: $selectedMidiSourceID) {
                            ForEach(midi.availableSources) { source in Text(source.name).tag(source.id) }
                        }
                        Button("Connect selected MIDI device", action: connect)
                        LabeledContent("Device timing correction", value: "\(Int(midiCorrection)) ms")
                        Slider(value: Binding(get: { midiCorrection }, set: { NativeMIDICalibration.save($0, for: selectedMidiSourceID) }), in: -250...250, step: 5).accessibilityLabel("MIDI device timing correction")
                    }
                    Text(midi.status)
                }
                NavigationLink("Input mapping and timing calibration") { TrainerView(content: content) }
                Button("Enable sound and check input") { controller.check(); keyboardFocused = true }
                Text("Unscored input check: \(controller.checkHits) hits received\(controller.checked ? " ✓" : "")")
                Button("Begin assessment") { controller.begin(inputProfile: controller.input == "midi" ? selectedMidiSourceID : nil); keyboardFocused = true }.disabled(!controller.checked || controller.content == nil || (controller.input == "midi" && (!midi.hasLiveSources || selectedMidiSourceID.isEmpty)))
            }
        }
    }
    private var pads: some View {
        let voices = DrumVoice.allCases.filter { controller.adaptation != "single-voice" || $0 == .snare }.filter { controller.adaptation != "hands-only" || $0 != .kick }
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))]) {
            ForEach(voices) { voice in Button(voice.title) { controller.hit(voice, source: controller.input, correctionMs: correction) }.frame(minHeight: 60).disabled(controller.input == "midi" || (controller.stage == .tasks && controller.phase != .playing)) }
        }
    }
    private func notation(_ probe: AssessmentProbe, adaptation: String) -> some View {
        VStack(alignment: .leading) {
            ScrollView(.horizontal) { SightStaff(exercise: probe.notation(adaptation), beat: nil).frame(minWidth: 320, minHeight: 170) }
            DisclosureGroup("Counted note descriptions") {
                Text(probe.pattern(adaptation, bars: 1).hits.map { "Beat \(String(format: "%.2f", Double($0.step) * 4 / Double(probe.subdivision) + 1)): \($0.instrument.title)\($0.accent ? ", accent" : "")" }.joined(separator: ". "))
            }
        }
    }
    private func probeCard(_ probe: AssessmentProbe) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text(probe.name).font(.title2).accessibilityAddTraits(.isHeader)
                Text("\(probe.domain) · Tier \(probe.tier) · \(probe.bpm) BPM")
                Text("Four bars. Listen to the demonstration, follow four count-in beats, then play with the metronome.")
                notation(probe, adaptation: controller.adaptation)
                if controller.input == "midi" { Button("Reconnect MIDI", action: connect).disabled(controller.active) }
                Button(controller.phase == .paused ? "Restart interrupted probe" : "Demonstrate and play") {
                    if controller.input == "midi" && !midi.hasLiveSources { controller.message = "Reconnect MIDI first."; return }
                    controller.play(correctionMs: correction); keyboardFocused = true
                }.disabled(controller.active)
                Button("Skip this domain") { controller.skip() }
            }
        }
    }
    private func questionCard(_ question: AssessmentQuestion) -> some View {
        let seed = UInt32((controller.draft?.id.unicodeScalars.reduce(0, { $0 + Int($1.value) }) ?? 0) + (controller.content?.questions.firstIndex(where: { $0.id == question.id }) ?? 0))
        return GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text(question.kind == "listening" ? "Listening question" : "Notation question").font(.title2)
                Text(question.prompt)
                if let probe = controller.content?.probes.first(where: { $0.id == question.probeId }) {
                    if question.kind == "reading" { notation(probe, adaptation: "single-voice") }
                    else { Button("Play rhythm") { controller.play(correctionMs: 0, reference: probe) }.disabled(controller.active) }
                }
                ForEach(question.shuffled(seed: seed), id: \.self) { index in Button(question.choices[index]) { controller.answer(index) }.disabled(controller.active) }
                Button("Skip question") { controller.skip() }
            }
        }
    }
    private func results(_ row: AssessmentResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Assessment results").font(.title2).accessibilityAddTraits(.isHeader)
            Text("\(row.input) · \(row.adaptation)")
            Text(row.endedEarly ? "Ended early: coverage is incomplete." : "Starting-point estimate. Skipped and untested skills are not scored.")
            Text("Keyboard and touch results describe input coordination, not physical limb independence.").font(.caption)
            ForEach(["pulse", "subdivisions", "coordination"], id: \.self) { domain in
                let latest = row.attempts.last { $0.probeId.hasPrefix(domain + "-") }
                let direction = latest?.meanOffsetMs.map { $0 > 0 ? "late" : $0 < 0 ? "early" : "on time" } ?? ""
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(domain): \(latest == nil ? "Untested" : "\(row.tier(domain))/3")").font(.headline)
                    if let latest {
                        Text("Matched \(latest.accuracy)% · score \(latest.score) · \(latest.misses) missed · \(latest.extras) extra")
                        if let error = latest.meanAbsoluteMs { Text("Mean absolute timing error: \(Int(error.rounded())) ms · average \(direction) by \(Int(abs(latest.meanOffsetMs ?? 0).rounded())) ms · spread \(Int((latest.timingSpreadMs ?? 0).rounded())) ms") }
                    }
                }
            }
            Text("Timing spread shows how much hit offsets vary; lower is steadier.").font(.caption).foregroundStyle(.secondary)
            let previousRows = controller.store.results.filter { $0.id != row.id && $0.inputProfile == row.inputProfile && $0.adaptation == row.adaptation && (AssessmentResult.date($0.playedAt) ?? .distantPast) < (AssessmentResult.date(row.playedAt) ?? .distantFuture) }
            if let previous = previousRows.max(by: { (AssessmentResult.date($0.playedAt) ?? .distantPast) < (AssessmentResult.date($1.playedAt) ?? .distantPast) }), let summary = row.comparisonSummary(from: previous) {
                Text("Progress since your last comparable assessment · \(AssessmentResult.date(previous.playedAt)?.formatted(date: .abbreviated, time: .shortened) ?? previous.playedAt): \(summary)").font(.subheadline)
            }
            let dynamics = row.attempts.first { $0.probeId == "dynamics-1" }
            Text("Dynamics: \(dynamics?.dynamicsContrast == nil ? "Unmeasured" : dynamics?.passed == true ? "Demonstrated" : "Needs practice")")
            if let assessment = controller.content {
                ForEach(row.questions(assessment)) { q in
                    let answer = row.answers.first { $0.questionId == q.id }
                    Text("\(q.kind): \(answer.map { $0.choice == q.answer ? "Correct" : "Needs practice" } ?? "Untested") · Answer: \(q.choices[q.answer])")
                }
                Text("Untested tasks: " + (assessment.probes.filter { p in !row.attempts.contains { $0.probeId == p.id } }.map(\.name) + row.questions(assessment).filter { q in !row.answers.contains { $0.questionId == q.id } && !row.skipped.contains(q.id) }.map(\.prompt)).joined(separator: ", "))
                if let id = row.recommendation(assessment), let lesson = content.lessons.first(where: { $0.id == id }) {
                    Text("Suggested lesson: \(lesson.title)").font(.headline)
                    if let details = row.recommendationDetails(assessment) {
                        Text("Why this lesson: \(details.evidence)")
                        Text("Next goal: \(details.goal)")
                    }
                    Button("Use this starting plan") { controller.apply() }
                    NavigationLink("Practice this skill") { TrainerView(content: content, initialPatternId: assessment.focusPatterns[id] ?? lesson.practicePatternId ?? "first-beat", initialAdaptation: row.adaptation) }
                }
                if let review = row.educatorReviewJSON(assessment) {
                    ShareLink(item: review) { Label("Share anonymous educator review", systemImage: "square.and.arrow.up") }
                    Text("The review copy omits learner name, result date, and MIDI device ID.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !controller.store.results.contains(where: { $0.id == row.id }) { Button("Save result") { var store = controller.store; store.append(row); controller.persist(store) } }
            Button("Retake assessment") { controller.retake() }
        }
    }
    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Assessment history").font(.title2)
            Text("\(controller.store.results.count)/20 · Results stay on this device and are included in local backups.")
            if controller.store.appliedId != nil { Button("Stop using assessment plan") { var store = controller.store; store.appliedId = nil; controller.persist(store) } }
            ForEach(controller.store.results.reversed()) { row in
                VStack(alignment: .leading) {
                    Text("\(AssessmentResult.date(row.playedAt)?.formatted(date: .abbreviated, time: .shortened) ?? row.playedAt) · \(row.input) · \(row.adaptation)\(controller.store.appliedId == row.id ? " · Applied" : "")")
                    HStack { Button("View result") { controller.show(row) }; Button("Delete", role: .destructive) { deleteID = row.id } }.disabled(controller.active || controller.stage == .tasks)
                }
            }
        }
    }
}
