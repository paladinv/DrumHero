import AVFoundation
import Combine
import Foundation

@MainActor
final class AssessmentController: ObservableObject {
    enum Phase { case idle, demonstration, countIn, playing, paused }
    enum Stage { case setup, tasks, results }
    @Published var input = "touch"
    @Published var adaptation = "standard"
    @Published var phase = Phase.idle
    @Published var stage = Stage.setup
    @Published var beat = 0
    @Published var draft: AssessmentResult?
    @Published var store = AssessmentHistory.read()
    @Published var checked = false
    @Published var soundEnabled = false
    @Published var checkHits = 0
    @Published var message = ""
    let content: AssessmentContent?
    private let audio: any DrumAudioPlaying
    private var task: Task<Void, Never>?
    private var capture: [AssessmentInputHit] = []
    private var startAt = 0.0
    private var endAt = 0.0
    private var generation = 0
    var active: Bool { phase == .demonstration || phase == .countIn || phase == .playing }
    var probe: AssessmentProbe? { draft?.nextProbe(content ?? fallbackContent) }
    var probeVariantIndex: Int { guard let draft, let content else { return 0 }; return draft.probeVariantIndex(content) }
    // Only used for empty/error presentation; assessment cannot begin without bundled content.
    private var fallbackContent: AssessmentContent { AssessmentContent(version: 1, rules: .init(score: 85, meanAbsoluteMs: 60, dynamicsAccuracy: 80, dynamicsContrast: 20), probes: [], questions: [], lessons: [:], focusPatterns: [:]) }
    var question: AssessmentQuestion? {
        guard probe == nil, let draft, let content else { return nil }
        return draft.questions(content).first { q in !draft.answers.contains { $0.questionId == q.id } && !draft.skipped.contains(q.id) }
    }
    init(audio: any DrumAudioPlaying = DrumAudioService()) {
        self.audio = audio; content = try? AssessmentContent.load()
        if content == nil { message = "Assessment content could not load. Reinstall or update the app." }
    }
    func stop(paused: Bool = false) {
        generation += 1; task?.cancel(); task = nil; audio.stop(); capture = []; startAt = 0; endAt = 0
        phase = paused ? .paused : .idle
    }
    func interrupt() { if active { stop(paused: true); message = "Interrupted probe discarded. Restart with a fresh count-in." } }
    func check() {
        do { try audio.prepare(); soundEnabled = true; message = "Strike a pad or key. Check that you can hear it." }
        catch { message = "Drum sounds are unavailable. Check audio output." }
    }
    func hit(_ voice: DrumVoice, source: String, at: TimeInterval? = nil, correctionMs: Double = 0, velocity: Int? = nil) {
        guard source == input else { return }
        if stage == .setup { checkHits += 1; if soundEnabled { checked = true; audio.play(voice) }; return }
        let time = at ?? ProcessInfo.processInfo.systemUptime
        guard startAt > 0, time >= startAt - 0.1, time <= endAt + 0.1, capture.count < 10000 else { return }
        capture.append(AssessmentInputHit(instrument: voice, atMs: (time - startAt) * 1000 - correctionMs, velocity: velocity))
    }
    func begin(inputProfile: String? = nil) {
        guard checked, content != nil else { return }
        stop(); draft = AssessmentResult(input: input, inputProfile: inputProfile ?? input, adaptation: adaptation); stage = .tasks; message = ""
    }
    func retake() { stop(); stage = .setup; draft = nil; checked = false; soundEnabled = false; message = "" }
    func skip() {
        guard var result = draft else { return }; stop()
        if let probe { result.skipped.append(probe.id) } else if let question { result.skipped.append(question.id) }
        draft = result; advance()
    }
    func answer(_ choice: Int) {
        guard var result = draft, let question else { return }; stop()
        result.answers.append(AssessmentAnswer(questionId: question.id, choice: choice)); draft = result; advance()
    }
    private func advance() { if probe == nil && question == nil { finish() } }
    func finish(early: Bool = false) {
        guard var result = draft else { return }; stop()
        result.playedAt = ISO8601DateFormatter().string(from: .now); result.endedEarly = early; draft = result
        message = "Assessment complete. Review your results below."
        var next = store; next.append(result); persist(next); stage = .results
    }
    func persist(_ next: AssessmentStore) {
        do { try AssessmentHistory.write(next); store = next }
        catch { message = "Assessment could not be saved. Free device storage and try again." }
    }
    func apply() {
        guard let draft, let content, draft.recommendation(content) != nil else { return }
        var next = store; next.append(draft); next.appliedId = draft.id; persist(next)
        if store.appliedId == draft.id { message = "Starting plan applied to Home and daily practice." }
    }
    func delete(_ id: String) {
        var next = store; next.results.removeAll { $0.id == id }; if next.appliedId == id { next.appliedId = nil }; persist(next)
        if draft?.id == id { retake() }
    }
    func show(_ row: AssessmentResult) { stop(); draft = row; stage = .results }
    private func wait(until deadline: Double) async -> Bool {
        do { try await Task.sleep(for: .seconds(max(0, deadline - ProcessInfo.processInfo.systemUptime))) }
        catch { return false }
        return !Task.isCancelled
    }
    func play(correctionMs: Double, reference: AssessmentProbe? = nil) {
        guard let selected = reference ?? probe, let content else { return }
        let variantIndex = reference == nil ? probeVariantIndex : 0
        let selectedVariant = selected.variant(variantIndex)
        stop(); do { try audio.prepare() } catch { message = "Drum sounds are unavailable. Check audio output."; return }
        let token = generation, base = ProcessInfo.processInfo.systemUptime + 0.2, beatDuration = 60 / Double(selected.bpm)
        let demo = selectedVariant.pattern(reference == nil ? adaptation : "standard", bars: 1)
        phase = .demonstration
        if reference == nil { startAt = base + 8 * beatDuration; endAt = startAt + 16 * beatDuration }
        task = Task { [weak self] in
            guard let self else { return }
            for note in demo.hits {
                guard await wait(until: base + Double(note.step) * beatDuration * 4 / Double(selected.subdivision)), generation == token else { return }
                audio.play(note.instrument, velocity: note.accent ? 110 : 55)
            }
            guard await wait(until: base + 4 * beatDuration), generation == token else { return }
            if reference != nil { stop(); return }
            for index in 0..<20 {
                guard await wait(until: base + Double(4 + index) * beatDuration), generation == token else { return }
                phase = index < 4 ? .countIn : .playing; beat = index < 4 ? index + 1 : index - 3
                audio.play(.hihat, velocity: index % 4 == 0 ? 110 : 65)
            }
            guard await wait(until: endAt + 0.11), generation == token, var result = draft else { return }
            let row = AssessmentRules.score(selectedVariant, adaptation: adaptation, hits: capture, content: content, variant: variantIndex)
            result.attempts.append(row); draft = result; stop()
            message = selected.domain == "dynamics" && row.dynamicsContrast == nil ? "Dynamics unmeasured: no varied velocities received." : row.passed ? "Tier demonstrated." : "Try once more, or skip this domain."
            advance()
        }
    }
}
