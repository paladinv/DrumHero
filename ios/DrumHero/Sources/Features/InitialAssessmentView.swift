import AVFoundation
import SwiftData
import SwiftUI
import UIKit

struct InitialAssessmentView: View {
    let content: MobileContentDocument
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var trainerRounds: [TrainerRoundRecord]
    @StateObject private var controller = AssessmentController()
    @StateObject private var midi = MobileMIDIInput()
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var keyboardFocused: Bool
    @State private var deleteID: String?
    @State private var selectedMidiSourceID = ""
    @State private var largerNotation = false
    @State private var educatorMode = false
    @State private var teacherPulse: Int?
    @State private var teacherSubdivisions: Int?
    @State private var teacherCoordination: Int?
    @State private var teacherReading: Int?
    @State private var pilotCode = ""
    @State private var spokenCountIn = false
    @State private var hapticCountIn = false
    @State private var cueSpeaker = AVSpeechSynthesizer()
    @AppStorage("drumHero.nativeInputOffset.touch") private var touchCorrection = 0.0
    private var midiCorrection: Double { NativeMIDICalibration.correction(for: selectedMidiSourceID) }
    private var correction: Double { controller.input == "midi" ? midiCorrection : touchCorrection }
    private var timingCalibrated: Bool { controller.input == "midi" ? NativeMIDICalibration.wasCalibrated(for: selectedMidiSourceID) : NativeMIDICalibration.touchWasCalibrated }
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
                if controller.stage != .results || controller.active { pads }
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
        .onChange(of: controller.input) { _, _ in controller.stop(); midi.stop(); controller.checked = false; controller.mappingReviewed = false; controller.checkedVoices = []; controller.checkHits = 0; controller.checkVelocityMinimum = nil; controller.checkVelocityMaximum = nil; controller.soundEnabled = false }
        .onChange(of: controller.adaptation) { _, _ in controller.checked = false; controller.mappingReviewed = false; controller.checkedVoices = []; controller.checkHits = 0; controller.checkVelocityMinimum = nil; controller.checkVelocityMaximum = nil }
        .onChange(of: controller.draft?.inputProfile) { _, profile in if controller.draft?.input == "midi", let profile { selectedMidiSourceID = profile } }
        .onChange(of: selectedMidiSourceID) { _, _ in midi.stop(); controller.checked = false; controller.mappingReviewed = false; controller.checkedVoices = []; controller.checkHits = 0; controller.checkVelocityMinimum = nil; controller.checkVelocityMaximum = nil }
        .onChange(of: controller.beat) { _, value in
            guard controller.phase == .countIn, value > 0 else { return }
            if spokenCountIn && value == 1 { cueSpeaker.stopSpeaking(at: .immediate); let utterance = AVSpeechUtterance(string: "One, two, three, four"); utterance.rate = 0.48; cueSpeaker.speak(utterance) }
            if hapticCountIn { UIImpactFeedbackGenerator(style: value == 1 ? .medium : .light).impactOccurred(intensity: value == 1 ? 0.7 : 0.35) }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notice in
            if let type = notice.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, type == AVAudioSession.InterruptionType.began.rawValue { controller.interrupt() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { notice in
            if let reason = notice.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt, reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { controller.interrupt() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AssessmentHistory.changed)) { _ in controller.store = AssessmentHistory.read() }
        .task {
            while !Task.isCancelled {
                if controller.input == "midi" && !midi.hasLiveSources {
                    if controller.active { controller.interrupt(); controller.message = "MIDI disconnected. Reconnect to restart this probe." }
                    else if controller.stage == .setup && (controller.checked || controller.mappingReviewed || !controller.checkedVoices.isEmpty) { controller.checked = false; controller.mappingReviewed = false; controller.checkedVoices = []; controller.checkHits = 0; controller.checkVelocityMinimum = nil; controller.checkVelocityMaximum = nil; controller.soundEnabled = false; controller.message = "MIDI disconnected. Reconnect and repeat the voice and sound check." }
                }
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
    private func levelName(_ level: Int?) -> String {
        switch level { case 1: return "Needs foundation"; case 2: return "Developing"; case 3: return "Independent"; default: return "Not assessed" }
    }
    private func progressLabel(_ result: AssessmentResult, domain: String) -> String {
        guard let latest = result.attempts.last(where: { $0.probeId.hasPrefix(domain + "-") }) else { return "untested" }
        return "\(result.tier(domain))/3 · \(latest.accuracy)% · \(latest.meanAbsoluteMs.map { "\(Int($0.rounded())) ms" } ?? "—")"
    }
    private func connect() {
        guard !selectedMidiSourceID.isEmpty else { controller.message = "Refresh MIDI devices and select a source first."; return }
        midi.connectSelectedSource(selectedMidiSourceID) { voice, at, velocity, sourceID in
            controller.hit(voice, source: "midi", at: at, correctionMs: NativeMIDICalibration.correction(for: sourceID), velocity: velocity)
        }
    }
    private func practiceRecheckStreak(for row: AssessmentResult, patternID: String) -> Int {
        guard let since = AssessmentResult.date(row.playedAt) else { return 0 }
        let inputProfile = row.inputProfile
        let matches = trainerRounds.filter {
            $0.patternID == patternID && $0.mode.hasPrefix("scored") && $0.playedAt > since &&
            $0.inputProfile == inputProfile && $0.assessmentAdaptation == row.adaptation &&
            $0.timingCalibrated == row.timingCalibrated && abs(($0.timingCorrectionMs ?? 0) - (row.timingCorrectionMs ?? 0)) < 10
        }.sorted { $0.playedAt > $1.playedAt }
        var streak = 0
        for round in matches {
            guard (round.score ?? 0) >= 85, (round.accuracy ?? 0) >= 85 else { break }
            streak += 1
        }
        return streak
    }
    private var setup: some View {
        GroupBox("Assessment setup") {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Input", selection: $controller.input) { Text("Touch pads").tag("touch"); Text("Keyboard").tag("keyboard"); Text("MIDI").tag("midi") }
                Picker("Access needs", selection: $controller.adaptation) { Text("Full kit").tag("standard"); Text("Hands only · kick mapped to tom").tag("hands-only"); Text("Single voice · one-hand friendly").tag("single-voice") }
                Picker("Learning goal", selection: $controller.goal) { Text("Build a balanced foundation").tag("balanced"); Text("Play with others").tag("play-with-others"); Text("Read drum notation").tag("read-notation"); Text("Play expressively").tag("play-expressively") }
                Picker("Question format", selection: $controller.quizFormat) { Text("Notation and listening").tag("visual"); Text("Audio questions only").tag("audio") }
                if controller.quizFormat == "audio" { Text("Audio-only questions replace notation questions. Notation skill will be reported as untested.").font(.caption) }
                Text("Hands-only maps kick to tom. Single voice keeps pulse and subdivisions on snare and skips coordination; it does not assess physical independence. Dynamics is measured only with varied MIDI velocities.").font(.caption)
                Text("Play each requested voice in order and listen to its preview. If a MIDI drum sounds wrong, review its mapping before continuing.").font(.caption).foregroundStyle(.secondary)
                Toggle("Use larger notation", isOn: $largerNotation)
                Toggle("Speak the four-beat count-in", isOn: $spokenCountIn)
                Toggle("Use haptic count-in", isOn: $hapticCountIn)
                DisclosureGroup("Educator review · estimate before starting") {
                    Text("Record your independent estimate before the learner sees the assessment recommendation.").font(.caption)
                    teacherLevelPicker("Pulse", selection: $teacherPulse)
                    teacherLevelPicker("Subdivisions", selection: $teacherSubdivisions)
                    teacherLevelPicker("Coordination", selection: $teacherCoordination)
                    teacherLevelPicker("Reading", selection: $teacherReading)
                    TextField("Optional non-identifying pilot code", text: Binding(get: { pilotCode }, set: { pilotCode = String($0.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }.prefix(40)) }))
                    Text("Use a teacher-assigned code without names or contact details to compare repeat assessments.").font(.caption)
                    Toggle("Attach these estimates to the assessment", isOn: $educatorMode)
                }
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
                LabeledContent("Timing setup", value: timingCalibrated ? "Calibrated" : "Not calibrated · results are a rougher estimate")
                Button("Enable sound and check input") { controller.check(); keyboardFocused = true }
                Text("Unscored input check: \(controller.checkHits) hits · required voices: \(controller.requiredCheckVoices.map { "\($0.title) \(controller.checkedVoices.contains($0) ? "✓" : "○")" }.joined(separator: ", "))\(controller.checked ? " ✓" : "")")
                if controller.checked { Toggle("I heard each expected drum sound for its label", isOn: $controller.mappingReviewed) }
                if controller.input == "midi", let minimum = controller.checkVelocityMinimum, let maximum = controller.checkVelocityMaximum { Text("MIDI velocity range seen: \(minimum)–\(maximum). \(maximum - minimum < 8 ? "Dynamics may be unmeasured if strokes stay this similar." : "Velocity variation is available for the dynamics check.")").font(.caption) }
                Button("Begin assessment") { let comparison = educatorMode ? AssessmentEducatorComparison(teacherEstimatedLevel: AssessmentTeacherLevels(pulse: teacherPulse, subdivisions: teacherSubdivisions, coordination: teacherCoordination, reading: teacherReading), recommendedLessonFits: nil, disagreementNotes: "", pilotCode: pilotCode.isEmpty ? nil : pilotCode) : nil; controller.begin(inputProfile: controller.input == "midi" ? selectedMidiSourceID : nil, timingCorrectionMs: correction, timingCalibrated: timingCalibrated, educatorComparison: comparison); keyboardFocused = true }.disabled(!controller.checked || !controller.mappingReviewed || controller.content == nil || (controller.input == "midi" && (!midi.hasLiveSources || selectedMidiSourceID.isEmpty)))
                if let saved = controller.resumeDraft {
                    Text("Saved progress: \(saved.attempts.count) playing tasks · \(saved.answers.count) questions answered. The interrupted task starts again with a fresh count-in.").font(.caption)
                    Button("Resume saved assessment", action: controller.resume)
                }
            }
        }
    }
    private func teacherLevelPicker(_ title: String, selection: Binding<Int?>) -> some View {
        Picker(title, selection: selection) {
            Text("Not assessed").tag(nil as Int?)
            Text("Needs foundation").tag(1 as Int?)
            Text("Developing").tag(2 as Int?)
            Text("Independent").tag(3 as Int?)
        }
    }
    private var pads: some View {
        let voices = DrumVoice.allCases.filter { controller.adaptation != "single-voice" || $0 == .snare }.filter { controller.adaptation != "hands-only" || $0 != .kick }
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))]) {
            ForEach(voices) { voice in Button(voice.title) { controller.hit(voice, source: controller.input, correctionMs: correction) }.frame(minHeight: 60).disabled(controller.input == "midi" || ((controller.stage == .tasks || controller.stage == .results && controller.active) && controller.phase != .playing)) }
        }
    }
    private func notation(_ probe: AssessmentProbe, adaptation: String) -> some View {
        VStack(alignment: .leading) {
            ScrollView(.horizontal) { SightStaff(exercise: probe.notation(adaptation), beat: nil).frame(minWidth: largerNotation ? 440 : 320, minHeight: largerNotation ? 240 : 170).scaleEffect(largerNotation ? 1.15 : 1, anchor: .leading) }
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
        let seed: UInt32 = { guard let result = controller.draft, let assessment = controller.content else { return 0 }; return result.questionChoiceSeed(question, content: assessment) }()
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
            Text("Your learning goal: \(row.goalLabel())")
            ForEach(["pulse", "subdivisions", "coordination"], id: \.self) { domain in
                let latest = row.attempts.last { $0.probeId.hasPrefix(domain + "-") }
                let direction = latest?.meanOffsetMs.map { $0 > 0 ? "late" : $0 < 0 ? "early" : "on time" } ?? ""
                let confidence = controller.content.map { row.confidence(domain, content: $0) } ?? "not-tested"
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(domain): \(latest == nil ? "Untested" : "\(row.tier(domain))/3")").font(.headline)
                    Text("Confidence: \(confidence)")
                    if let latest {
                        Text("Matched \(latest.accuracy)% · score \(latest.score) · \(latest.misses) missed · \(latest.extras) extra")
                        if let error = latest.meanAbsoluteMs { Text("Mean absolute timing error: \(Int(error.rounded())) ms · average \(direction) by \(Int(abs(latest.meanOffsetMs ?? 0).rounded())) ms · spread \(Int((latest.timingSpreadMs ?? 0).rounded())) ms") }
                    }
                }
            }
            let measuredDomains = ["pulse", "subdivisions", "coordination"].filter { domain in row.attempts.contains { $0.probeId.hasPrefix(domain + "-") } }
            if !measuredDomains.isEmpty {
                GroupBox("How did the assessed skills feel?") {
                    Text("Optional learner feedback. It is saved as context and does not change your score or tier.").font(.caption)
                    ForEach(measuredDomains, id: \.self) { domain in
                        Picker("\(domain.capitalized) · optional", selection: Binding(get: { row.reflections?.first(where: { $0.domain == domain })?.rating ?? "" }, set: { controller.updateReflection(row, domain: domain, rating: $0) })) {
                            Text("No response").tag("")
                            Text("Easy").tag("easy")
                            Text("About right").tag("about-right")
                            Text("Hard").tag("hard")
                            Text("Input felt unreliable").tag("input-issue")
                        }.pickerStyle(.menu)
                    }
                }
            }
            Text("Confidence reflects the number of probes, retries, and distance from the scoring cutoff. It is a guide, not a statistical guarantee.").font(.caption).foregroundStyle(.secondary)
            if let assessment = controller.content { Text("Practice tip: \(row.practiceTip(assessment))") }
            Text("Timing spread shows how much hit offsets vary; lower is steadier.").font(.caption).foregroundStyle(.secondary)
            let previousRows = controller.store.results.filter { $0.id != row.id && $0.inputProfile == row.inputProfile && $0.adaptation == row.adaptation && $0.contentVersion == row.contentVersion && $0.timingCalibrated == row.timingCalibrated && abs(($0.timingCorrectionMs ?? 0) - (row.timingCorrectionMs ?? 0)) < 10 && (AssessmentResult.date($0.playedAt) ?? .distantPast) < (AssessmentResult.date(row.playedAt) ?? .distantFuture) }
            if let previous = previousRows.max(by: { (AssessmentResult.date($0.playedAt) ?? .distantPast) < (AssessmentResult.date($1.playedAt) ?? .distantPast) }), let summary = row.comparisonSummary(from: previous) {
                Text("Progress since your last comparable assessment · \(AssessmentResult.date(previous.playedAt)?.formatted(date: .abbreviated, time: .shortened) ?? previous.playedAt): \(summary)").font(.subheadline)
            }
            let dynamics = row.attempts.first { $0.probeId == "dynamics-1" }
            Text("Dynamics: \(dynamics?.dynamicsContrast == nil ? "Unmeasured" : dynamics?.passed == true ? "Demonstrated" : "Needs practice")")
            if row.reflections?.contains(where: { $0.rating == "input-issue" }) == true {
                Text("You reported input trouble. Review mapping and timing correction before interpreting the affected result. This feedback does not change your score.")
                NavigationLink("Review input mapping and calibration") { TrainerView(content: content) }
            }
            if let assessment = controller.content {
                let comparableRows = (controller.store.results.filter { $0.id != row.id && $0.inputProfile == row.inputProfile && $0.adaptation == row.adaptation && $0.contentVersion == row.contentVersion && $0.timingCalibrated == row.timingCalibrated && abs(($0.timingCorrectionMs ?? 0) - (row.timingCorrectionMs ?? 0)) < 10 } + [row]).sorted { (AssessmentResult.date($0.playedAt) ?? .distantPast) < (AssessmentResult.date($1.playedAt) ?? .distantPast) }
                if comparableRows.count > 1 {
                    GroupBox("Recent comparable progress · same input, adaptation, content and timing setup") {
                        ForEach(Array(comparableRows.suffix(6)), id: \.id) { item in
                            Text("\(AssessmentResult.date(item.playedAt)?.formatted(date: .abbreviated, time: .shortened) ?? item.playedAt) · pulse \(progressLabel(item, domain: "pulse")) · subdivisions \(progressLabel(item, domain: "subdivisions")) · coordination \(progressLabel(item, domain: "coordination"))")
                        }
                    }
                }
                let quality = row.qualityNotes(assessment)
                GroupBox("Measurement quality · \(quality.level)") {
                    Text("\(quality.evidence) of \(quality.expected) core tasks produced evidence.")
                    ForEach(quality.flags, id: \.self) { Text($0) }
                }
                let closeResults = row.borderlineAttempts(assessment)
                if !closeResults.isEmpty {
                    GroupBox("Quick confirmation for a close result") {
                        Text("Try a short alternate pattern to see whether a result near the cutoff repeats. This check never changes your starting tier.").font(.caption)
                        ForEach(closeResults) { close in
                            Button("Confirm \(close.probe.name) · \(close.attempt.score) score · \(close.attempt.meanAbsoluteMs.map { "\(Int($0.rounded())) ms" } ?? "—")") {
                                if controller.input == "midi" && !midi.hasLiveSources { controller.message = "Reconnect MIDI first."; return }
                                controller.play(correctionMs: row.timingCorrectionMs ?? correction, reference: close.probe, confirmation: true, variantOverride: row.confirmationVariant(close.probe.id, content: assessment)); keyboardFocused = true
                            }.disabled(controller.active)
                        }
                    }
                }
                ForEach(row.confirmations ?? [], id: \.probeId) { confirmation in
                    Text("Confirmation · \(confirmation.probeId): \(row.confirmationLabel(confirmation.probeId)) · \(confirmation.attempt.accuracy)% matched · \(confirmation.attempt.meanAbsoluteMs.map { "\(Int($0.rounded())) ms" } ?? "—")")
                }
                let reading = row.readingSummary(assessment)
                if row.quizFormat == "audio" {
                    Text("Reading: Not assessed in audio-only question mode.")
                } else if let tier = reading.tier {
                    Text("Reading: Tier \(tier)/3 · \(reading.correct)/\(reading.total) correct")
                } else if reading.total > 0 {
                    Text("Reading: Incomplete · \(reading.correct)/\(reading.total) correct · \(reading.answered)/\(reading.total) answered")
                } else {
                    Text("Reading: Not tested")
                }
                ForEach(row.questions(assessment)) { q in
                    let answer = row.answers.first { $0.questionId == q.id }
                    Text("\(q.kind): \(answer.map { $0.choice == q.answer ? "Correct" : "Needs practice" } ?? "Untested") · Answer: \(q.choices[q.answer])")
                }
                Text("Untested tasks: " + (assessment.probes.filter { p in p.domain != "transfer" && p.domain != "internal-pulse" && !row.attempts.contains { $0.probeId == p.id } }.map(\.name) + row.questions(assessment).filter { q in !row.answers.contains { $0.questionId == q.id } && !row.skipped.contains(q.id) }.map(\.prompt)).joined(separator: ", "))
                if let transfer = row.transferAttempt {
                    Text("Fresh-pattern check: \(transfer.accuracy)% matched · score \(transfer.score) · \(transfer.misses) misses · \(transfer.extras) extras. This checks transfer to a new groove and does not change your demonstrated tiers.")
                } else if let fresh = assessment.probes.first(where: { $0.id == "transfer-1" }) {
                    Button(controller.phase == .paused ? "Restart interrupted probe" : "Try a fresh-pattern check") {
                        if controller.input == "midi" && !midi.hasLiveSources { controller.message = "Reconnect MIDI first."; return }
                        controller.play(correctionMs: row.timingCorrectionMs ?? correction, reference: fresh, transfer: true); keyboardFocused = true
                    }.disabled(controller.active)
                    Text("Optional · checks how a rhythm skill transfers to a new groove.").font(.caption).foregroundStyle(.secondary)
                }
                if let pulse = row.internalPulseAttempt {
                    Text("Internal pulse: \(pulse.passed ? "Demonstrated" : "Needs practice") · click-off timing \(pulse.clickOffMeanAbsoluteMs.map { "\(Int($0.rounded())) ms" } ?? "—") · drift \(pulse.dropoutDriftMs.map { "\(Int($0.rounded())) ms" } ?? "—"). This separate check does not change your demonstrated tiers.")
                } else if let pulseProbe = assessment.probes.first(where: { $0.id == "internal-pulse-1" }) {
                    Button(controller.phase == .paused ? "Restart interrupted probe" : "Try the internal-pulse check") {
                        if controller.input == "midi" && !midi.hasLiveSources { controller.message = "Reconnect MIDI first."; return }
                        controller.play(correctionMs: row.timingCorrectionMs ?? correction, reference: pulseProbe, internalPulse: true); keyboardFocused = true
                    }.disabled(controller.active)
                    Text("Optional · the click stops after two bars; keep playing for two more bars.").font(.caption).foregroundStyle(.secondary)
                }
                GroupBox("Optional tempo range") {
                    Text("Keep the same quarter-note pulse pattern while tempo rises. This separate check does not change skill tiers.").font(.caption)
                    if let highest = row.highestDemonstratedTempo(assessment) { Text("Highest demonstrated tempo: \(highest) BPM") }
                    ForEach(assessment.tempoCheck.bpms, id: \.self) { bpm in
                        let tries = (row.tempoAttempts ?? []).filter { $0.bpm == bpm }
                        if let latest = tries.last { Text("\(bpm) BPM · \(latest.passed ? "Demonstrated" : "Needs practice") · \(latest.accuracy)% matched · \(tries.count) attempt(s)") }
                    }
                    if let bpm = row.nextTempoBpm(assessment), var pulse = assessment.probes.first(where: { $0.id == assessment.tempoCheck.probeId }) {
                        pulse.bpm = bpm
                        Button("Play pulse at \(bpm) BPM\((row.tempoAttempts ?? []).contains(where: { $0.bpm == bpm }) ? " · retry" : "")") {
                            if controller.input == "midi" && !midi.hasLiveSources { controller.message = "Reconnect MIDI first."; return }
                            controller.play(correctionMs: row.timingCorrectionMs ?? 0, reference: pulse, tempo: true); keyboardFocused = true
                        }.disabled(controller.active)
                    } else if !(row.tempoAttempts ?? []).isEmpty {
                        Text("Tempo range check complete. Higher untested speeds remain unknown.")
                    } else {
                        Button("Try tempo range check · \(assessment.tempoCheck.bpms.first ?? 60)–\(assessment.tempoCheck.bpms.last ?? 90) BPM") {
                            if controller.input == "midi" && !midi.hasLiveSources { controller.message = "Reconnect MIDI first."; return }
                            guard var pulse = assessment.probes.first(where: { $0.id == assessment.tempoCheck.probeId }), let bpm = assessment.tempoCheck.bpms.first else { return }
                            pulse.bpm = bpm; controller.play(correctionMs: row.timingCorrectionMs ?? 0, reference: pulse, tempo: true); keyboardFocused = true
                        }.disabled(controller.active)
                    }
                }
                if let educator = row.educatorComparison {
                    GroupBox("Educator review") {
                        Text("Independent estimate recorded before the assessment:").font(.caption)
                        Text("Pulse: \(levelName(educator.teacherEstimatedLevel.pulse)) · Subdivisions: \(levelName(educator.teacherEstimatedLevel.subdivisions)) · Coordination: \(levelName(educator.teacherEstimatedLevel.coordination)) · Reading: \(levelName(educator.teacherEstimatedLevel.reading))")
                        Picker("Did the suggested lesson fit?", selection: Binding(get: { educator.recommendedLessonFits.map { $0 ? "yes" : "no" } ?? "" }, set: { controller.updateEducatorComparison(row, fit: $0) })) { Text("Not reviewed yet").tag(""); Text("Yes").tag("yes"); Text("No").tag("no") }
                        TextField("What explains any disagreement?", text: Binding(get: { educator.disagreementNotes }, set: { controller.updateEducatorComparison(row, notes: $0) }), axis: .vertical).lineLimit(3...5)
                    }
                }
                if let correction = row.timingCorrectionMs { Text("Saved timing correction used: \(Int(correction.rounded())) ms.").font(.caption).foregroundStyle(.secondary) }
                if row.reflections?.contains(where: { $0.rating == "input-issue" }) != true && row.attempts.contains(where: { $0.accuracy < 60 || $0.score < 50 }) {
                    Text("A low match can reflect input mapping or timing correction as well as skill. Check your setup before retrying.")
                    NavigationLink("Review input mapping and calibration") { TrainerView(content: content) }
                }
                if let id = row.recommendation(assessment), let lesson = content.lessons.first(where: { $0.id == id }) {
                    let targetPatternID = assessment.focusPatterns[id] ?? lesson.practicePatternId ?? "first-beat"
                    let recheckStreak = practiceRecheckStreak(for: row, patternID: targetPatternID)
                    Text("Suggested lesson: \(lesson.title)").font(.headline)
                    if let details = row.recommendationDetails(assessment) {
                        Text("Why this lesson: \(details.evidence)")
                        Text("Next goal: \(details.goal)")
                    }
                    if let practice = row.microPractice(assessment) {
                        GroupBox("60-second practice plan · \(practice.bpm) BPM\(practice.voice.map { " · \($0)" } ?? "")") { ForEach(practice.steps, id: \.self) { Text($0) } }
                    }
                    Button("Use this starting plan") { controller.apply() }
                    NavigationLink("Practice this skill") { TrainerView(content: content, initialPatternId: targetPatternID, initialBpm: row.microPractice(assessment)?.bpm, initialAdaptation: row.adaptation, assessmentSince: AssessmentResult.date(row.playedAt), assessmentInputProfile: row.inputProfile, assessmentAdaptation: row.adaptation, assessmentCorrectionMs: row.timingCorrectionMs, assessmentTimingCalibrated: row.timingCalibrated) }
                    Text(recheckStreak >= 3 ? "Ready for an assessment recheck · 3/3 scored rounds met the practice targets." : "\(min(recheckStreak, 3))/3 consecutive scored rounds met the 85% score and matched-hit targets.").font(.caption).foregroundStyle(.secondary)
                    Text("Practice for a few minutes, then return here to try the fresh-pattern check. It shows transfer without changing your starting tier.").font(.caption).foregroundStyle(.secondary)
                }
                if let review = row.educatorReviewJSON(assessment) {
                    ShareLink(item: review) { Label("Share anonymous educator review", systemImage: "square.and.arrow.up") }
                    Text("The review copy omits learner name, result date, and MIDI device ID. A non-identifying pilot code is included if you supplied one.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !controller.store.results.contains(where: { $0.id == row.id }) { Button("Save result") { var store = controller.store; store.append(row); controller.persist(store) } }
            Button("Retake assessment") { educatorMode = false; teacherPulse = nil; teacherSubdivisions = nil; teacherCoordination = nil; teacherReading = nil; controller.retake() }
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
