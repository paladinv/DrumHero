import AVFoundation
import Combine
import Foundation

@MainActor
final class AssessmentController: ObservableObject {
    enum Phase { case idle, demonstration, countIn, playing, paused }
    enum Stage { case setup, tasks, results }
    @Published var input = "touch"
    @Published var adaptation = "standard"
    @Published var goal = "balanced"
    @Published var quizFormat = "visual"
    @Published var phase = Phase.idle
    @Published var stage = Stage.setup
    @Published var beat = 0
    @Published var draft: AssessmentResult?
    @Published var resumeDraft: AssessmentResult?
    @Published var store = AssessmentHistory.read()
    @Published var checked = false
    @Published var mappingReviewed = false
    @Published var soundEnabled = false
    @Published var checkHits = 0
    @Published var checkedVoices: Set<DrumVoice> = []
    @Published var checkVelocityMinimum: Int?
    @Published var checkVelocityMaximum: Int?
    @Published var message = ""
    let content: AssessmentContent?
    private let audio: any DrumAudioPlaying
    private var task: Task<Void, Never>?
    private var capture: [AssessmentInputHit] = []
    private var startAt = 0.0
    private var endAt = 0.0
    private var generation = 0
    var active: Bool { phase == .demonstration || phase == .countIn || phase == .playing }
    var requiredCheckVoices: [DrumVoice] { adaptation == "single-voice" ? [.snare] : adaptation == "hands-only" ? [.tom, .snare, .hihat] : [.kick, .snare, .hihat] }
    var probe: AssessmentProbe? { draft?.nextProbe(content ?? fallbackContent) }
    var probeVariantIndex: Int { guard let draft, let content else { return 0 }; return draft.probeVariantIndex(content) }
    // Only used for empty/error presentation; assessment cannot begin without bundled content.
    private var fallbackContent: AssessmentContent { AssessmentContent(version: 1, rules: .init(score: 85, meanAbsoluteMs: 60, dynamicsAccuracy: 80, dynamicsContrast: 20, pulseDropoutAccuracy: 80, pulseDropoutDriftMs: 60, fastTrackScore: 95, fastTrackMeanAbsoluteMs: 40), tempoCheck: .init(probeId: "pulse-1", bpms: [60, 72, 84, 90], minimumScore: 85, minimumAccuracy: 85, maximumMeanAbsoluteMs: 60, retriesPerTempo: 1), probes: [], questions: [], lessons: [:], focusPatterns: [:]) }
    var question: AssessmentQuestion? {
        guard probe == nil, let draft, let content else { return nil }
        return draft.questions(content).first { q in !draft.answers.contains { $0.questionId == q.id } && !draft.skipped.contains(q.id) }
    }
    init(audio: any DrumAudioPlaying = DrumAudioService()) {
        self.audio = audio; content = try? AssessmentContent.load()
        resumeDraft = content.flatMap { AssessmentHistory.readDraft(content: $0) }
        if content == nil { message = "Assessment content could not load. Reinstall or update the app." }
    }
    func stop(paused: Bool = false) {
        generation += 1; task?.cancel(); task = nil; audio.stop(); capture = []; startAt = 0; endAt = 0
        phase = paused ? .paused : .idle
    }
    func interrupt() { if active { stop(paused: true); message = "Interrupted probe discarded. Restart with a fresh count-in." } }
    func check() {
        checked = false; mappingReviewed = false; checkedVoices = []; checkHits = 0; checkVelocityMinimum = nil; checkVelocityMaximum = nil; soundEnabled = false
        do { try audio.prepare(); soundEnabled = true; message = "Play each requested voice in order and listen to its preview." }
        catch { message = "Drum sounds are unavailable. Check audio output." }
    }
    func hit(_ voice: DrumVoice, source: String, at: TimeInterval? = nil, correctionMs: Double = 0, velocity: Int? = nil) {
        guard source == input else { return }
        if stage == .setup { if soundEnabled { checkHits += 1; checkedVoices.insert(voice); if let velocity, (1...127).contains(velocity) { checkVelocityMinimum = min(checkVelocityMinimum ?? velocity, velocity); checkVelocityMaximum = max(checkVelocityMaximum ?? velocity, velocity) }; checked = requiredCheckVoices.allSatisfy(checkedVoices.contains); message = checked ? "Input check complete. Listen to the previews and confirm the drum sounds match their labels." : "Input check: now strike \(requiredCheckVoices.first(where: { !checkedVoices.contains($0) })?.title ?? "next voice"). Listen for the matching sound."; audio.play(voice, velocity: velocity ?? 80) }; return }
        let time = at ?? ProcessInfo.processInfo.systemUptime
        guard startAt > 0, time >= startAt - 0.1, time <= endAt + 0.1, capture.count < 10000 else { return }
        capture.append(AssessmentInputHit(instrument: voice, atMs: (time - startAt) * 1000 - correctionMs, velocity: velocity))
    }
    func begin(inputProfile: String? = nil, timingCorrectionMs: Double? = nil, timingCalibrated: Bool = false, educatorComparison: AssessmentEducatorComparison? = nil) {
        guard checked, mappingReviewed, content != nil else { return }
        stop(); var result = AssessmentResult(input: input, inputProfile: inputProfile ?? input, adaptation: adaptation, goal: goal, quizFormat: quizFormat); result.contentVersion = content?.version; result.timingCorrectionMs = timingCorrectionMs; result.timingCalibrated = timingCalibrated; result.educatorComparison = educatorComparison; if let content { result.selectQuestionIDs(content, history: store.results) }; draft = result; saveDraft(result); stage = .tasks; message = ""
    }
    func resume() {
        guard let result = resumeDraft, let content, result.valid(content), !result.endedEarly else { return }
        stop(); draft = result; input = result.input; adaptation = result.adaptation; goal = result.goal ?? "balanced"; quizFormat = result.quizFormat ?? "visual"; stage = .tasks; checked = true; soundEnabled = false; message = "Resumed saved assessment. Restart the current task with a fresh count-in."
    }
    func retake() { stop(); clearDraft(); stage = .setup; draft = nil; checked = false; mappingReviewed = false; checkedVoices = []; checkHits = 0; checkVelocityMinimum = nil; checkVelocityMaximum = nil; soundEnabled = false; message = "" }
    func skip() {
        guard var result = draft else { return }; stop()
        if let probe { result.skipped.append(probe.id) } else if let question { result.skipped.append(question.id) }
        draft = result; saveDraft(result); advance()
    }
    func answer(_ choice: Int) {
        guard var result = draft, let question else { return }; stop()
        result.answers.append(AssessmentAnswer(questionId: question.id, choice: choice)); draft = result; saveDraft(result); advance()
    }
    private func advance() { if probe == nil && question == nil { finish() } }
    func finish(early: Bool = false) {
        guard var result = draft else { return }; stop()
        result.playedAt = ISO8601DateFormatter().string(from: .now); result.endedEarly = early; draft = result; clearDraft()
        message = "Assessment complete. Review your results below."
        var next = store; next.append(result); persist(next); stage = .results
    }
    func persist(_ next: AssessmentStore) {
        do { try AssessmentHistory.write(next); store = next }
        catch { message = "Assessment could not be saved. Free device storage and try again." }
    }
    private func saveDraft(_ result: AssessmentResult) {
        guard let content else { return }
        do { try AssessmentHistory.writeDraft(result, content: content); resumeDraft = result }
        catch { message = "Assessment checkpoint could not be saved." }
    }
    private func clearDraft() { AssessmentHistory.clearDraft(); resumeDraft = nil }
    private func persistUpdated(_ result: AssessmentResult) {
        var next = store
        guard let index = next.results.firstIndex(where: { $0.id == result.id }) else { return }
        next.results[index] = result; persist(next)
    }
    func apply() {
        guard let draft, let content, draft.recommendation(content) != nil else { return }
        var next = store; next.append(draft); next.appliedId = draft.id; persist(next)
        if store.appliedId == draft.id { message = "Starting plan applied to Home and daily practice." }
    }
    func update(_ result: AssessmentResult) { draft = result; persistUpdated(result) }
    func updateReflection(_ row: AssessmentResult, domain: String, rating: String) {
        guard ["pulse", "subdivisions", "coordination"].contains(domain), ["", "easy", "about-right", "hard", "input-issue"].contains(rating) else { return }
        var updated = row
        var reflections = (row.reflections ?? []).filter { $0.domain != domain }
        if !rating.isEmpty { reflections.append(AssessmentReflection(domain: domain, rating: rating)) }
        updated.reflections = reflections; update(updated)
    }
    func updateEducatorComparison(_ row: AssessmentResult, fit: String? = nil, notes: String? = nil) {
        var updated = row
        var comparison = row.educatorComparison ?? AssessmentEducatorComparison(teacherEstimatedLevel: AssessmentTeacherLevels(pulse: nil, subdivisions: nil, coordination: nil, reading: nil), recommendedLessonFits: nil, disagreementNotes: "")
        if let fit { comparison.recommendedLessonFits = fit == "" ? nil : fit == "yes" }
        if let notes { comparison.disagreementNotes = String(notes.prefix(1000)) }
        updated.educatorComparison = comparison; update(updated)
    }
    func delete(_ id: String) {
        var next = store; next.results.removeAll { $0.id == id }; if next.appliedId == id { next.appliedId = nil }; persist(next)
        if draft?.id == id { retake() }
    }
    func show(_ row: AssessmentResult) { stop(); input = row.input; adaptation = row.adaptation; goal = row.goal ?? "balanced"; quizFormat = row.quizFormat ?? "visual"; draft = row; stage = .results }
    private func wait(until deadline: Double) async -> Bool {
        do { try await Task.sleep(for: .seconds(max(0, deadline - ProcessInfo.processInfo.systemUptime))) }
        catch { return false }
        return !Task.isCancelled
    }
    func play(correctionMs: Double, reference: AssessmentProbe? = nil, transfer: Bool = false, internalPulse: Bool = false, tempo: Bool = false, confirmation: Bool = false, variantOverride: Int? = nil) {
        guard let selected = reference ?? probe, let content else { return }
        let variantIndex = variantOverride ?? (transfer ? (draft?.transferVariant(content) ?? 0) : reference == nil ? probeVariantIndex : 0)
        let selectedVariant = selected.variant(variantIndex)
        stop(); do { try audio.prepare() } catch { message = "Drum sounds are unavailable. Check audio output."; return }
        let token = generation, base = ProcessInfo.processInfo.systemUptime + 0.2, beatDuration = 60 / Double(selected.bpm)
        let demo = selectedVariant.pattern(reference == nil ? adaptation : "standard", bars: 1)
        phase = .demonstration
        if reference == nil || transfer || internalPulse || tempo || confirmation { startAt = base + 8 * beatDuration; endAt = startAt + 16 * beatDuration }
        task = Task { [weak self] in
            guard let self else { return }
            for note in demo.hits {
                guard await wait(until: base + Double(note.step) * beatDuration * 4 / Double(selected.subdivision)), generation == token else { return }
                audio.play(note.instrument, velocity: note.accent ? 110 : 55)
            }
            guard await wait(until: base + 4 * beatDuration), generation == token else { return }
            if reference != nil && !transfer && !internalPulse && !tempo && !confirmation { stop(); return }
            for index in 0..<20 {
                guard await wait(until: base + Double(4 + index) * beatDuration), generation == token else { return }
                phase = index < 4 ? .countIn : .playing; beat = index < 4 ? index + 1 : index - 3
                if !internalPulse || index < 12 { audio.play(.hihat, velocity: index % 4 == 0 ? 110 : 65) }
            }
            guard await wait(until: endAt + 0.11), generation == token, var result = draft else { return }
            let row = AssessmentRules.score(selectedVariant, adaptation: adaptation, hits: capture, content: content, variant: variantIndex)
            stop()
            if confirmation, let probeId = reference?.id {
                result.confirmations = (result.confirmations ?? []) + [AssessmentConfirmation(probeId: probeId, attempt: row)]; draft = result; persistUpdated(result)
                message = result.confirmationLabel(probeId)
            } else if tempo {
                result.tempoAttempts = (result.tempoAttempts ?? []) + [AssessmentTempoAttempt(bpm: selected.bpm, attempt: row, content: content)]; draft = result; persistUpdated(result)
                let stored = result.tempoAttempts?.last
                message = stored?.passed == true ? "Pulse held at \(selected.bpm) BPM." : "Tempo check at \(selected.bpm) BPM needs another try or can stop here."
            } else if transfer {
                result.transferAttempt = row; draft = result; persistUpdated(result)
                message = "Fresh-pattern check complete. This does not change your starting tier."
            } else if internalPulse {
                result.internalPulseAttempt = row; draft = result; persistUpdated(result)
                message = row.passed ? "You held the pulse through the quiet bars." : "The quiet bars changed your timing. Try the pulse lesson, then repeat this check on a later assessment."
            } else {
                result.attempts.append(row); draft = result; saveDraft(result)
                message = selected.domain == "dynamics" && row.dynamicsContrast == nil ? "Dynamics unmeasured: no varied velocities received." : row.passed ? "Tier demonstrated." : row.accuracy < 60 || row.score < 50 ? "Few hits matched. Check input mapping or timing correction before retrying." : "Try once more, or skip this domain."
                advance()
            }
        }
    }
}
