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
    @Published var countInBar = 1
    @Published var countInBeat = 1
    @Published var countInSyllable = "1"
    @Published var reviewCursorBeat: Double?
    @Published var originalExerciseForDrill: SightExercise?
    @Published var result: PracticeResult?
    @Published var rated: [RatedHit] = []
    @Published var performedHits: [SightPerformedHit] = []
    @Published var history = SightHistory.read()
    @Published var sessionTotal = 0
    @Published var sessionIndex = 0
    @Published var sessionResults: [SightAttempt] = []
    @Published var sessionLabel = "Practice set"
    @Published var confidenceRecorded = true
    @Published var transferCheckSettings: SightSettings?
    @Published var transferCheck = false
    @Published var inputCalibrationSpreadMs: Int?
    @Published var inputCalibrated: Bool?
    @Published var inputTimingCorrectionMs: Int?
    @Published var assignment: SightAssignment?
    @Published var assignmentFeedback = ""
    @Published var message = "Ready"
    @Published var classification = "reading"
    @Published var referencing = false
    @Published var midiCalibrating = false
    @Published var assisted = false
    private var attempted = false
    private var task: Task<Void, Never>?
    private let audio: any DrumAudioPlaying
    private let speech = AVSpeechSynthesizer()
    private var expected: [ExpectedHit] = []
    private var startAt = 0.0
    private var endAt = 0.0
    private var selectedSource = "touch"
    private var generation = 0
    private var currentPreviewSeconds = 10
    private var currentCountInBars = 1
    private var currentTargetPlayback = false
    private var currentInputProfile = ""
    private var currentInputCalibrationSpreadMs: Int?
    private var currentInputCalibrationAgeDays: Int?
    private var currentInputCalibrated: Bool?
    private var currentInputTimingCorrectionMs: Int?
    private var confidenceAttemptID: String?
    private var sessionQueue: [SightExercise] = []
    private var midiCalibrationSource = ""
    private var midiCalibrationTargets: [TimeInterval] = []
    private var midiCalibrationOffsets: [Double] = []
    private var midiCalibrationNext = 0
    var active: Bool { midiCalibrating || phase == .preview || phase == .countIn || phase == .playing }
    var sessionQueueIsEmpty: Bool { sessionQueue.isEmpty }
    init(audio: any DrumAudioPlaying = DrumAudioService()) { self.audio = audio }
    private var recentFingerprints: [String] { Array((history.suffix(24).map { $0.fingerprint ?? SightExercise.generate($0.settings, seed: $0.seed).fingerprint } + SightHistory.readSeen()).suffix(32)) }
    func fresh(_ settings: SightSettings) {
        stop(); exercise = SightExercise.generateFresh(settings, seed: .random(in: .min ... .max), recentFingerprints: recentFingerprints)
        sessionQueue = []; sessionTotal = 0; sessionIndex = 0; sessionResults = []
        reviewCursorBeat = nil
        originalExerciseForDrill = nil; transferCheckSettings = nil; transferCheck = false; assignment = nil; assignmentFeedback = ""; attempted = false; assisted = false; result = nil; confidenceRecorded = true; rated = []; performedHits = []; phase = .setup; message = "New exercise ready. Start to reveal notation."
    }
    func startSession(_ settings: SightSettings, count: Int) {
        stop()
        let size = min(10, max(3, count))
        var fingerprints = recentFingerprints
        var seed = UInt32.random(in: .min ... .max)
        sessionQueue = (0..<size).map { _ in
            let phrase = SightExercise.generateFresh(settings, seed: seed, recentFingerprints: fingerprints)
            fingerprints.append(phrase.fingerprint); seed = seed &+ 1
            return phrase
        }
        sessionTotal = size; sessionIndex = 1; sessionResults = []; sessionLabel = "Practice set"
        reviewCursorBeat = nil
        exercise = sessionQueue.removeFirst(); originalExerciseForDrill = nil; transferCheckSettings = nil; transferCheck = false; assignment = nil
        attempted = false; assisted = false; result = nil; confidenceRecorded = true; rated = []; performedHits = []; phase = .setup
        message = "Session started: exercise 1 of \(size)."
    }
    func startGoalPath(_ goal: SightGoal) {
        stop()
        let settings = SightAnalytics.goalPath(goal: goal, history: history)
        var fingerprints = recentFingerprints, seed = UInt32.random(in: .min ... .max)
        sessionQueue = settings.map { setting in
            let phrase = SightExercise.generateFresh(setting, seed: seed, recentFingerprints: fingerprints)
            fingerprints.append(phrase.fingerprint); seed = seed &+ 1
            return phrase
        }
        sessionTotal = sessionQueue.count; sessionIndex = 1; sessionResults = []; sessionLabel = "Goal study path"
        exercise = sessionQueue.removeFirst(); originalExerciseForDrill = nil; transferCheckSettings = nil; transferCheck = false; assignment = nil
        attempted = false; assisted = false; result = nil; confidenceRecorded = true; rated = []; performedHits = []; phase = .setup
        message = "Five-step study path ready: warm-up, build, review, goal, and stretch."
    }
    func nextSessionExercise() {
        guard !sessionQueue.isEmpty else { return }
        stop(); exercise = sessionQueue.removeFirst(); sessionIndex += 1
        reviewCursorBeat = nil
        originalExerciseForDrill = nil; assignment = nil; attempted = false; assisted = false
        result = nil; confidenceRecorded = true; rated = []; performedHits = []; phase = .setup
        message = "Session exercise \(sessionIndex) of \(sessionTotal). Start when ready."
    }
    func createAssignmentCode(settings: SightSettings, title: String, dueDate: String, minimumAccuracy: Int) -> String? {
        if exercise == nil || exercise?.settings != settings.normalized { fresh(settings) }
        guard let exercise, (50...100).contains(minimumAccuracy) else { return nil }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = SightAssignment(seed: exercise.seed, settings: exercise.settings, title: String((trimmedTitle.isEmpty ? "Reading assignment" : trimmedTitle).prefix(80)), dueDate: dueDate.isEmpty ? nil : dueDate, minimumAccuracy: minimumAccuracy)
        guard value.valid, let data = try? JSONEncoder().encode(value) else { message = "Check the assignment title, due date, and target accuracy."; return nil }
        assignment = value
        return data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    func loadAssignment(_ code: String) -> SightSettings? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("DH-SUB1:") {
            guard let data = Self.decodeBase64URL(String(trimmed.dropFirst(8))), let submission = try? JSONDecoder().decode(SightSubmission.self, from: data), submission.valid else { assignmentFeedback = "Student result code is invalid."; return nil }
            let target = submission.minimumAccuracy.map { submission.accuracy >= $0 ? "target met" : "target not met" } ?? "result received"
            assignmentFeedback = "\(submission.title ?? "Student assignment") · \(submission.accuracy)% accuracy · \(submission.score) score · \(target) · \(submission.classification) · \(submission.level) \(submission.meter) at \(submission.bpm) BPM."
            message = assignmentFeedback; return nil
        }
        if trimmed.hasPrefix("DH-SA1:") {
            guard let data = Self.decodeBase64URL(String(trimmed.dropFirst(7))), let value = try? JSONDecoder().decode(SightAssignment.self, from: data), value.valid else { return nil }
            let normalized = value.settings.normalized
            stop(); assignment = value; assignmentFeedback = ""; exercise = SightExercise.generate(normalized, seed: value.seed); attempted = false; assisted = false
            originalExerciseForDrill = nil; result = nil; rated = []; phase = .setup; message = "\(value.title) loaded. Preview it before you start."; return normalized
        }
        let parts = trimmed.replacingOccurrences(of: "DH-SR1:", with: "").split(separator: ".", maxSplits: 1)
        guard parts.count == 2, let seed = UInt32(parts[0]) else { return nil }
        guard let data = Self.decodeBase64URL(String(parts[1])), let settings = try? JSONDecoder().decode(SightSettings.self, from: data) else { return nil }
        let normalized = settings.normalized
        stop(); assignment = nil; assignmentFeedback = ""; exercise = SightExercise.generate(normalized, seed: seed); attempted = false; assisted = false
        originalExerciseForDrill = nil; result = nil; rated = []; phase = .setup; message = "Shared assignment loaded. Preview it before you start."
        return normalized
    }
    private static func decodeBase64URL(_ payload: String) -> Data? {
        var value = payload.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while value.count % 4 != 0 { value.append("=") }
        return Data(base64Encoded: value)
    }
    func submissionCode() -> String? {
        guard let exercise, let result else { return nil }
        let value = SightSubmission(title: assignment?.title, dueDate: assignment?.dueDate, minimumAccuracy: assignment?.minimumAccuracy, meter: exercise.settings.meter, level: exercise.settings.level.rawValue, bpm: exercise.settings.bpm, accuracy: result.accuracy, score: result.score, classification: classification)
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    func stop() { generation += 1; task?.cancel(); task = nil; audio.stop(); speech.stopSpeaking(at: .immediate); referencing = false; midiCalibrating = false; midiCalibrationTargets = []; midiCalibrationOffsets = []; midiCalibrationNext = 0 }
    func cancel() { stop(); sessionQueue = []; sessionTotal = 0; sessionIndex = 0; sessionResults = []; phase = .setup; message = "Attempt ended. Restarting this exercise counts as practice." }
    func start(_ settings: SightSettings, source: String, sourceProfile: String? = nil, inputCalibrated: Bool? = nil, inputCalibrationSpreadMs: Int? = nil, inputCalibrationAgeDays: Int? = nil, inputTimingCorrectionMs: Int? = nil, previewSeconds: Int = 10, countInBars: Int = 1, countInSubdivision: String = "quarter", spokenCountIn: Bool = false, targetPlayback: Bool = false) {
        stop()
        if exercise == nil || exercise?.settings != settings.normalized { fresh(settings) }
        guard let exercise else { return }
        let previewLength = [0, 5, 10].contains(previewSeconds) ? previewSeconds : 10
        let countBars = min(2, max(0, countInBars))
        SightHistory.remember(exercise.fingerprint)
        currentPreviewSeconds = previewLength; currentCountInBars = countBars; currentTargetPlayback = targetPlayback
        currentInputProfile = sourceProfile ?? source; currentInputCalibrated = inputCalibrated
        currentInputCalibrationSpreadMs = inputCalibrationSpreadMs; currentInputCalibrationAgeDays = inputCalibrationAgeDays; currentInputTimingCorrectionMs = inputTimingCorrectionMs
        reviewCursorBeat = nil
        classification = targetPlayback || assisted ? "assisted" : attempted ? "practice" : "reading"
        attempted = true; result = nil; confidenceRecorded = true; rated = []; performedHits = []; selectedSource = source
        phase = previewLength > 0 ? .preview : countBars > 0 ? .countIn : .playing; seconds = previewLength
        do { try audio.prepare() } catch { cancel(); message = "Drum audio unavailable. Check audio output and restart as practice."; return }
        let token = generation
        let previewEnd = ProcessInfo.processInfo.systemUptime + Double(previewLength)
        let beatDuration = 60 / Double(exercise.settings.bpm)
        let divisions = countInSubdivision == "sixteenth" ? 4 : countInSubdivision == "eighth" ? 2 : 1
        let countInDuration = Double(countBars) * exercise.beatsPerBar * beatDuration
        startAt = previewEnd + countInDuration
        endAt = startAt + exercise.duration
        expected = PracticeRules.expectedHits(pattern: exercise.pattern, bpm: exercise.settings.bpm, repetitions: 1, startAt: startAt)
        task = Task { [weak self] in
            var lastClick = -1
            var nextTargetHit = 0
            while !Task.isCancelled {
                guard let self, self.generation == token else { return }
                let now = ProcessInfo.processInfo.systemUptime
                if now < previewEnd { self.seconds = max(0, Int(ceil(previewEnd - now))); self.phase = .preview }
                else if now < self.startAt { self.phase = .countIn }
                else if now < self.endAt + 0.11 { self.phase = .playing; self.beat = max(0, (now - self.startAt) / beatDuration) }
                else { self.finish(exercise, source: source); return }
                if targetPlayback && now >= self.startAt && now < self.endAt + 0.11 {
                    while nextTargetHit < exercise.hits.count && self.startAt + Double(exercise.hits[nextTargetHit].step) * exercise.stepDuration <= now {
                        self.audio.play(exercise.hits[nextTargetHit].instrument)
                        nextTargetHit += 1
                    }
                }
                if now >= previewEnd && now < self.endAt {
                    let countIn = now < self.startAt
                    let elapsed = countIn ? now - previewEnd : now - self.startAt
                    let barDuration = exercise.beatsPerBar * beatDuration
                    let bar = Int(elapsed / barDuration)
                    let inBar = elapsed.truncatingRemainder(dividingBy: barDuration)
                    let activeDivisions = countIn ? divisions : 1
                    let tickIndex = Int(inBar / beatDuration * Double(activeDivisions))
                    let click = (countIn ? bar : countBars + bar) * 100 + tickIndex
                    if click != lastClick {
                        let beatPosition = Double(tickIndex) / Double(activeDivisions)
                        let accent = exercise.settings.countAccentBeats.contains { abs($0 - beatPosition) < 0.001 }
                        self.audio.play(accent ? .snare : .hihat); lastClick = click
                        let syllables = activeDivisions == 4 ? ["", "e", "&", "a"] : activeDivisions == 2 ? ["", "&"] : [""]
                        if countIn { self.countInSyllable = "\(tickIndex / activeDivisions + 1)\(syllables[tickIndex % activeDivisions])" }
                        if countIn && spokenCountIn && tickIndex == 0 {
                            let words = exercise.settings.meter == "7/8" ? "One, two, three, four" : Array(["One", "two", "three", "four", "five", "six", "seven"].prefix(Int(ceil(exercise.beatsPerBar)))).joined(separator: ", ")
                            let utterance = AVSpeechUtterance(string: words); utterance.rate = min(0.55, max(0.3, Float(exercise.settings.bpm) / 160)); self.speech.speak(utterance)
                        }
                        if countIn { self.countInBar = bar + 1; self.countInBeat = tickIndex / activeDivisions + 1 }
                    }
                }
                try? await Task.sleep(for: .milliseconds(8))
            }
        }
    }
    func hit(_ voice: DrumVoice, source: String, at: Double = ProcessInfo.processInfo.systemUptime, correctionMs: Double = 0) {
        guard selectedSource == source, phase == .playing || phase == .countIn, at >= startAt - 0.1, at <= endAt + 0.1, rated.count < 10000 else { return }
        audio.play(voice)
        let corrected = at - correctionMs / 1000
        performedHits.append(SightPerformedHit(instrument: voice, at: corrected - startAt))
        if let index = PracticeRules.closestUnmatchedIndex(at: corrected, in: expected, instrument: voice), abs(expected[index].at - corrected) <= 0.1 {
            let offset = (corrected - expected[index].at) * 1000
            expected[index].matched = true
            rated.append(RatedHit(instrument: voice, rating: PracticeRules.classify(offsetMs: offset), offsetMs: Int(offset.rounded()), step: expected[index].step))
        } else {
            let step = max(0, min((exercise?.stepsPerBar ?? 1) * (exercise?.settings.bars ?? 1) - 1, Int((at - startAt) / (exercise?.stepDuration ?? 1))))
            rated.append(RatedHit(instrument: voice, rating: .extra, step: step))
        }
    }
    func startMIDITimingCalibration(sourceID: String, bpm: Int) {
        guard !sourceID.isEmpty, !active else { message = "Connect the MIDI device and finish the current attempt first."; return }
        stop()
        do { try audio.prepare() } catch { message = "Could not prepare MIDI timing clicks."; return }
        let beatDuration = 60 / Double(max(40, min(200, bpm)))
        let first = ProcessInfo.processInfo.systemUptime + 2
        midiCalibrationTargets = (0..<8).map { first + Double($0) * beatDuration }
        midiCalibrationOffsets = []; midiCalibrationNext = 0; midiCalibrationSource = sourceID; midiCalibrating = true
        message = "Listen to four count-in clicks, then tap the mapped snare on the next eight clicks."
        let token = generation
        task = Task { [weak self] in
            for click in 0..<12 {
                let deadline = first - 4 * beatDuration + Double(click) * beatDuration
                let delay = deadline - ProcessInfo.processInfo.systemUptime
                if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                guard !Task.isCancelled, let self, self.generation == token else { return }
                self.audio.play(.hihat)
            }
            let remaining = first + 8 * beatDuration + 0.7 - ProcessInfo.processInfo.systemUptime
            if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
            guard !Task.isCancelled, let self, self.generation == token else { return }
            self.finishMIDITimingCalibration(sourceID: sourceID)
        }
    }
    func recordMIDITimingHit(_ voice: DrumVoice, at: TimeInterval, sourceID: String) {
        guard midiCalibrating, sourceID == midiCalibrationSource else { return }
        guard voice == .snare else { message = "Use the mapped snare pad for each timing click."; return }
        while midiCalibrationNext < midiCalibrationTargets.count && at > midiCalibrationTargets[midiCalibrationNext] + 0.24 { midiCalibrationNext += 1 }
        guard midiCalibrationNext < midiCalibrationTargets.count else { return }
        let target = midiCalibrationTargets[midiCalibrationNext]
        guard abs(at - target) <= 0.24 else { return }
        midiCalibrationOffsets.append((at - target) * 1000); midiCalibrationNext += 1
        message = "Timing taps: \(midiCalibrationOffsets.count) of \(midiCalibrationTargets.count)."
        if midiCalibrationOffsets.count == midiCalibrationTargets.count { finishMIDITimingCalibration(sourceID: sourceID) }
    }
    private func finishMIDITimingCalibration(sourceID: String) {
        guard midiCalibrating else { return }
        let offsets = midiCalibrationOffsets
        stop()
        guard offsets.count >= 4 else { message = "Only \(offsets.count) usable taps. Try again with steady snare strokes."; return }
        let ordered = offsets.sorted()
        let median = ordered[ordered.count / 2]
        let spread = ordered.map { abs($0 - median) }.sorted()[ordered.count / 2]
        NativeMIDICalibration.save(median, spread: spread, calibrated: true, for: sourceID)
        message = "MIDI timing calibrated: \(Int(median.rounded())) ms correction with ±\(Int(spread.rounded())) ms tap variation."
    }
    private func finish(_ exercise: SightExercise, source: String) {
        for hit in expected where !hit.matched { rated.append(RatedHit(instrument: hit.instrument, rating: .miss, step: hit.step)) }
        let result = PracticeRules.result(pattern: exercise.pattern, bpm: exercise.settings.bpm, playedAt: .now, ratedHits: rated)
        let offsets = rated.compactMap(\.offsetMs)
        if assisted { classification = "assisted" }
        let mean = offsets.isEmpty ? nil : Int((Double(offsets.reduce(0, +)) / Double(offsets.count)).rounded())
        let spread: Int?
        if let mean, !offsets.isEmpty { spread = Int((Double(offsets.reduce(0) { $0 + abs($1 - mean) }) / Double(offsets.count)).rounded()) }
        else { spread = nil }
        let row = SightAttempt(seed: exercise.seed, settings: exercise.settings, source: source, inputProfile: currentInputProfile, classification: classification, targetPlayback: currentTargetPlayback, score: result.score, accuracy: result.accuracy, meanOffsetMs: mean, misses: result.miss, extras: result.extra, fluency: SightFluency.calculate(exercise: exercise, rated: rated), previewSeconds: currentPreviewSeconds, countInBars: currentCountInBars, assignmentTitle: assignment?.title, assignmentDueDate: assignment?.dueDate, assignmentMinimumAccuracy: assignment?.minimumAccuracy, fingerprint: exercise.fingerprint, timingSpreadMs: spread, earlyHits: offsets.filter { $0 < 0 }.count, lateHits: offsets.filter { $0 > 0 }.count, pulseRecovery: SightAnalytics.pulseRecovery(exercise: exercise, rated: rated), inputCalibrated: currentInputCalibrated, inputCalibrationSpreadMs: currentInputCalibrationSpreadMs, inputCalibrationAgeDays: currentInputCalibrationAgeDays, inputTimingCorrectionMs: currentInputTimingCorrectionMs)
        history = Array((history + [row]).suffix(100))
        confidenceAttemptID = row.id; confidenceRecorded = false
        if sessionTotal > 0 && row.classification == "reading" { sessionResults.append(row) }
        do { try SightHistory.write(history) } catch { message = "Result could not be saved." }
        stop(); self.result = result; phase = .results
    }
    func submitConfidence(_ value: Int?) {
        guard confidenceAttemptID != nil, let index = history.lastIndex(where: { $0.id == confidenceAttemptID }) else { confidenceRecorded = true; return }
        history[index].confidence = value
        do { try SightHistory.write(history) } catch { message = "Confidence note could not be saved; the score remains available." }
        confidenceRecorded = true
    }
    func startWeakestBarDrill() {
        guard let exercise else { return }
        var weakest = 0, mostErrors = -1
        for bar in 0..<exercise.settings.bars {
            let errors = rated.filter { hit in
                guard let step = hit.step else { return false }
                return step / exercise.stepsPerBar == bar && (hit.rating == .miss || hit.rating == .extra)
            }.count
            if errors > mostErrors { weakest = bar; mostErrors = errors }
        }
        originalExerciseForDrill = exercise; self.exercise = exercise.repeatingBar(weakest)
        attempted = true; assisted = false; result = nil; rated = []; phase = .setup
        message = "Bar \(weakest + 1) repeats twice as practice. Return to the full phrase when you are ready."
    }
    func startErrorFocusDrill() {
        guard let exercise, let result, result.miss + result.extra > 0 else { return }
        let drill = SightAnalytics.errorDrill(exercise: exercise, rated: rated, seed: .random(in: .min ... .max), recent: recentFingerprints, history: history)
        transferCheckSettings = exercise.settings; transferCheck = false; originalExerciseForDrill = nil
        self.exercise = drill.exercise; attempted = true; assisted = false; self.result = nil; confidenceRecorded = true; rated = []; performedHits = []; phase = .setup
        message = "Focused \(drill.focus) practice for \(drill.voice) at a gentler tempo. This is practice; an unseen transfer phrase follows it."
    }
    func startTransferCheck() {
        guard let settings = transferCheckSettings else { return }
        exercise = SightExercise.generateFresh(settings, seed: .random(in: .min ... .max), recentFingerprints: recentFingerprints)
        transferCheckSettings = nil; transferCheck = true; originalExerciseForDrill = nil
        attempted = true; assisted = false; result = nil; confidenceRecorded = true; rated = []; performedHits = []; phase = .setup
        message = "Unseen transfer phrase ready. This check remains practice and does not change first-read trends."
    }
    func returnToFullPhrase() {
        guard let originalExerciseForDrill else { return }
        exercise = originalExerciseForDrill; self.originalExerciseForDrill = nil
        attempted = true; result = nil; rated = []; phase = .setup; message = "Full phrase restored. The next pass counts as practice."
    }
    func speakNotes(_ exercise: SightExercise) {
        assisted = true; classification = "assisted"
        let description = exercise.hits.map { hit in
            let beat = Double(hit.step % exercise.stepsPerBar) * 4 / Double(exercise.subdivision) + 1
            return "Bar \(hit.step / exercise.stepsPerBar + 1), beat \(beat.formatted(.number.precision(.fractionLength(0...2)))), \(hit.instrument.title)\(hit.accent ? ", accent" : "")"
        }.joined(separator: ". ")
        speech.stopSpeaking(at: .immediate)
        speech.speak(AVSpeechUtterance(string: description))
    }
    func reference() {
        playReview(mode: "reference")
    }
    func playReview(mode: String, speed: Double = 1, barIndex: Int? = nil, highlightStep: Int? = nil) {
        guard let exercise, phase == .results else { return }
        stop(); referencing = true
        let barDuration = exercise.beatsPerBar * 60 / Double(exercise.settings.bpm)
        let segmentStart = Double(barIndex ?? 0) * barDuration
        let segmentDuration = barIndex == nil ? exercise.duration : barDuration
        if let highlightStep { reviewCursorBeat = Double(highlightStep) * 4 / Double(exercise.subdivision) }
        else if let barIndex { reviewCursorBeat = Double(barIndex) * exercise.beatsPerBar }
        do { try audio.prepare() } catch { referencing = false; message = "Reference audio unavailable."; return }
        let token = generation
        task = Task { [weak self] in
            let sources: [String] = mode == "compare" ? ["reference", "learner"] : [mode]
            for source in sources {
                let base = ProcessInfo.processInfo.systemUptime + 0.1
                let events: [(TimeInterval, DrumVoice)]
                if source == "reference" {
                    events = exercise.hits.compactMap { hit in
                        if let barIndex, hit.step / exercise.stepsPerBar != barIndex { return nil }
                        return (Double(hit.step) * exercise.stepDuration - segmentStart, hit.instrument)
                    }
                } else {
                    events = (self?.performedHits ?? []).compactMap { hit in
                        if barIndex != nil && (hit.at < segmentStart || hit.at >= segmentStart + segmentDuration) { return nil }
                        return (hit.at - segmentStart, hit.instrument)
                    }
                }
                for event in events.sorted(by: { $0.0 < $1.0 }) {
                    let deadline = base + event.0 / max(0.5, min(1.5, speed))
                    let delay = deadline - ProcessInfo.processInfo.systemUptime
                    if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                    guard !Task.isCancelled, let self, self.generation == token else { return }
                    self.audio.play(event.1)
                }
                let duration = segmentDuration / max(0.5, min(1.5, speed))
                let remaining = base + duration + 0.25 - ProcessInfo.processInfo.systemUptime
                if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
                if source == "reference" && mode == "compare" { try? await Task.sleep(for: .milliseconds(500)) }
            }
            guard !Task.isCancelled else { return }; self?.stop()
        }
    }
    func recommendation(for settings: SightSettings, source: String) -> (settings: SightSettings, reason: String)? {
        let pastReads = history.filter { $0.classification == "reading" && $0.source == source }
        let grouped = Dictionary(grouping: pastReads) { "\($0.settings.level.rawValue)|\($0.settings.meter)|\($0.settings.focusRhythm)" }
        let due = grouped.values.compactMap { rows -> (SightSettings, Int, Date)? in
            guard let last = rows.last, Date().timeIntervalSince(last.playedAt) >= 7 * 24 * 60 * 60 else { return nil }
            let recent = rows.suffix(3), average = recent.reduce(0) { $0 + $1.accuracy } / max(1, recent.count)
            return (last.settings, average, last.playedAt)
        }.sorted { $0.1 != $1.1 ? $0.1 < $1.1 : $0.2 < $1.2 }.first
        if let due {
            var review = due.0; review.bars = 2; review.style = "varied"; review.density = "light"
            return (review.normalized, "Spaced review: \(due.0.meter) \(due.0.focusRhythm) has not been read for a week; recent accuracy was \(due.1)%.")
        }
        let rows = history.filter { $0.classification == "reading" && $0.source == source && $0.settings.level == settings.level && $0.settings.bpm == settings.bpm && $0.settings.bars == settings.bars && $0.settings.meter == settings.meter && $0.settings.triplets == settings.triplets && $0.settings.snareOnly == settings.snareOnly && $0.settings.focusVoice == settings.focusVoice && $0.settings.focusRhythm == settings.focusRhythm && $0.settings.style == settings.style }
        guard rows.count >= 3 else { return nil }
        let average = rows.suffix(3).reduce(0) { $0 + $1.accuracy } / 3
        var next = settings
        if average >= 88 && settings.bpm < 200 { next.bpm = min(200, settings.bpm + 5) }
        else if average >= 88 && settings.level == .beginner && settings.focusRhythm != "eighths" { next.focusRhythm = "eighths" }
        else if average >= 88 && settings.level == .beginner { next.level = .intermediate }
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
        return (next.normalized, "Based on your last three first readings, which averaged \(average)% at this setting.")
    }
}

struct SightReadingView: View {
    @StateObject private var controller = SightReadingController()
    @StateObject private var midi = MobileMIDIInput()
    @State private var settings = SightSettings()
    @State private var source = "touch"
    @State private var zoom = 1.0
    @State private var tempoLadder = false
    @State private var previewSeconds = 10
    @State private var countInBars = 1
    @State private var countInSubdivision = "quarter"
    @State private var spokenCountIn = false
    @State private var playTargetDrums = true
    @State private var adaptiveMode = false
    @State private var cueLevel = "full"
    @State private var focusMode = false
    @State private var goal = SightHistory.readGoal()
    @State private var goalDraft = SightGoal()
    @State private var goalStatus = ""
    @State private var historyLevel = "Any"
    @State private var historyMeter = "Any"
    @State private var historyInput = "Any"
    @State private var historyTempo = "Any"
    @State private var assignmentCode = ""
    @State private var assignmentTitle = "Reading assignment"
    @State private var assignmentDueDate = ""
    @State private var assignmentMinimumAccuracy = 80
    @State private var shareAssignmentCode = ""
    @State private var printableURL: URL?
    @State private var selectedMidiSourceID = ""
    @State private var sessionLength = 5
    @State private var reviewSpeed = 1.0
    @State private var midiReadinessRemaining: [DrumVoice] = []
    @State private var midiReadinessVerified: [DrumVoice] = []
    @FocusState private var keyboardFocused: Bool
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("drumHero.nativeInputOffset.touch") private var touchCorrection = 0.0
    private var midiCorrection: Double { NativeMIDICalibration.correction(for: selectedMidiSourceID) }
    private var midiCalibrationAgeDays: Int? {
        guard let date = NativeMIDICalibration.calibrationDate(for: selectedMidiSourceID) else { return nil }
        return max(0, Int(Date().timeIntervalSince(date) / 86400))
    }
    private var midiCalibrationSummary: String {
        guard NativeMIDICalibration.wasCalibrated(for: selectedMidiSourceID) else { return "not calibrated" }
        let age = midiCalibrationAgeDays.map { "\($0) days ago" } ?? "previously"
        let spread = NativeMIDICalibration.spread(for: selectedMidiSourceID).map { " · ±\(Int($0.rounded())) ms tap variation" } ?? ""
        return "calibrated \(age) · \(Int(midiCorrection)) ms correction\(spread)\(midiCalibrationAgeDays.map { $0 > 30 ? " · recalibration recommended" : "" } ?? "")"
    }
    var body: some View {
        GeometryReader { geometry in
        ScrollViewReader { scoreScroll in
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Toggle("Focus mode", isOn: $focusMode)
                if !focusMode { Text("Read a fresh phrase, prepare silently for \(previewSeconds) seconds, use a \(countInBars)-bar count-in, then play once.") }
                if controller.active {
                    Text("\(settings.level.rawValue) · \(settings.bpm) BPM · \(settings.meter) · \(settings.bars) bars · \(settings.style) · \(settings.focusRhythm) · \(settings.focusVoice)").font(.caption)
                } else if !focusMode {
                    setup.disabled(controller.referencing)
                }
                HStack {
                    if controller.active { Button(controller.midiCalibrating ? "Cancel MIDI timing check" : "Cancel attempt") { controller.cancel() } }
                    else {
                        Button(controller.phase == .results ? "Retry as practice" : "Start sight reading") {
                            if source == "midi" && midi.connectedSources.isEmpty { controller.message = "Connect MIDI first."; return }
                            let calibration = source == "midi" ? NativeMIDICalibration.wasCalibrated(for: selectedMidiSourceID) : nil
                            let spread = source == "midi" ? NativeMIDICalibration.spread(for: selectedMidiSourceID).map { Int($0.rounded()) } : nil
                            let calibrationAge = source == "midi" ? midiCalibrationAgeDays : nil
                            let correction = source == "midi" ? Int(midiCorrection.rounded()) : source == "touch" ? Int(touchCorrection.rounded()) : 0
                            controller.start(settings, source: source, sourceProfile: source == "midi" ? "midi:\(selectedMidiSourceID)" : source, inputCalibrated: calibration, inputCalibrationSpreadMs: spread, inputCalibrationAgeDays: calibrationAge, inputTimingCorrectionMs: correction, previewSeconds: previewSeconds, countInBars: countInBars, countInSubdivision: countInSubdivision, spokenCountIn: spokenCountIn, targetPlayback: playTargetDrums); keyboardFocused = true
                        }.disabled(controller.referencing)
                        Button("New exercise") { controller.fresh(settings) }.disabled(controller.referencing)
                        if !focusMode { Button("Start \(sessionLength)-exercise set") { controller.startSession(settings, count: sessionLength) }.disabled(controller.referencing) }
                    }
                }
                Text(status).accessibilityIdentifier("sight-status")
                if !focusMode { learningPathPanel }
                if !focusMode, !controller.active, let parent = controller.originalExerciseForDrill {
                    Button("Return to full phrase") { controller.returnToFullPhrase(); settings = parent.settings }
                }
                if !focusMode, !controller.active {
                    GroupBox("Teacher assignment") {
                        VStack(alignment: .leading) {
                            TextField("Assignment title", text: $assignmentTitle).textFieldStyle(.roundedBorder)
                            TextField("Due date (YYYY-MM-DD, optional)", text: $assignmentDueDate).textFieldStyle(.roundedBorder)
                            Stepper("Minimum accuracy: \(assignmentMinimumAccuracy)%", value: $assignmentMinimumAccuracy, in: 50...100)
                            Button("Create seeded assignment") {
                                if let code = controller.createAssignmentCode(settings: settings, title: assignmentTitle, dueDate: assignmentDueDate, minimumAccuracy: assignmentMinimumAccuracy) { shareAssignmentCode = code }
                                else { shareAssignmentCode = "" }
                            }
                            if !shareAssignmentCode.isEmpty { ShareLink(item: "DH-SA1:\(shareAssignmentCode)") { Label("Share assignment code", systemImage: "square.and.arrow.up") } }
                            if let exercise = controller.exercise {
                                Button("Prepare printable score") { printableURL = makePrintablePDF(exercise) }
                                if let printableURL { ShareLink(item: printableURL) { Label("Print or share PDF", systemImage: "printer") } }
                            }
                            Text("Assignments carry a fixed seed, due date, and accuracy target. Students can send a result code back for review.").font(.caption)
                        }
                    }
                }
                if !focusMode { DisclosureGroup("Import a student assignment") {
                    TextField("Assignment code", text: $assignmentCode).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Load shared assignment") {
                        if let loaded = controller.loadAssignment(assignmentCode) { settings = loaded; printableURL = nil; shareAssignmentCode = "" }
                        else if controller.assignmentFeedback.isEmpty { controller.message = "Assignment code is invalid." }
                    }
                    if !controller.assignmentFeedback.isEmpty { Text(controller.assignmentFeedback).accessibilityIdentifier("sight-assignment-feedback") }
                } }
                if !focusMode, !controller.active, let recommendation = controller.recommendation(for: settings, source: source) {
                    GroupBox("Suggested next step") {
                        Text(recommendation.reason)
                        Button(suggestionLabel(recommendation.settings)) { settings = recommendation.settings; controller.fresh(recommendation.settings) }
                    }
                }
                if let exercise = controller.exercise, controller.phase != .setup {
                    HStack { Text("Notation zoom"); Slider(value: $zoom, in: 0.75...2) }
                    let measuresPerLine = geometry.size.width >= 700 ? 4 : 2
                    let measureWidth = max(CGFloat(190), (geometry.size.width - 32) / CGFloat(measuresPerLine)) * CGFloat(zoom)
                    let measureHeight = CGFloat(170) * CGFloat(zoom)
                    let activeBeat: Double? = controller.phase == .playing ? controller.beat : controller.reviewCursorBeat
                    ScrollViewReader { horizontalScroll in
                        ScrollView(.horizontal) {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(0..<Int(ceil(Double(exercise.settings.bars) / Double(measuresPerLine))), id: \.self) { system in
                                    HStack(spacing: 0) {
                                        ForEach((system * measuresPerLine)..<min(exercise.settings.bars, (system + 1) * measuresPerLine), id: \.self) { bar in
                                            SightStaff(exercise: exercise, beat: activeBeat, displayBar: bar).accessibilityHidden(true)
                                                .frame(width: measureWidth, height: measureHeight)
                                                .id("sight-bar-\(bar)")
                                        }
                                    }
                                    .id("sight-system-\(system)")
                                }
                            }
                        }
                        .onChange(of: Int(controller.beat / exercise.beatsPerBar)) { _, bar in
                            if controller.phase == .playing { horizontalScroll.scrollTo("sight-bar-\(bar)", anchor: .center) }
                        }
                    }
                    if cueLevel == "full" { Text("Legend: Kick · Space, Snare · F, Hi-hat · J, Tom · K, Crash · L. Cross heads: cymbals. > accent; rests: silence. Accents are cues, not scored dynamics.").font(.caption) }
                    else if cueLevel == "compact" { Text("Voice is encoded by staff position. > marks an accent; rests are silence.").font(.caption) }
                    if settings.meter == "7/8" { Text("2+2+3 eighths · quarter-note BPM") }
                    if settings.meter == "5/4" { Text("3+2 quarters") }
                    DisclosureGroup("Accessible counted notation") {
                        Text(exercise.accessibleDescription)
                        Button("Speak notes (assisted attempt)") { controller.speakNotes(exercise) }
                    }
                }
                HStack { ForEach(Array(DrumVoice.allCases.enumerated()), id: \.element.id) { index, voice in Button(cueLevel == "standard" ? "Pad \(index + 1)" : voice.title) { controller.hit(voice, source: source, correctionMs: touchCorrection) }.accessibilityLabel("\(voice.title) drum pad").frame(minWidth: 44, minHeight: 60).disabled(controller.phase != .playing || source == "midi") } }
                if controller.result != nil && !controller.confidenceRecorded {
                    GroupBox("Before seeing your score") {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("How confident did you feel while reading this phrase?")
                            HStack { ForEach(1...5, id: \.self) { value in Button("\(value)") { controller.submitConfidence(value) }.accessibilityLabel("Confidence \(value) out of 5") } }
                            Text("1 = not sure · 5 = certain").font(.caption)
                            Button("Skip reflection") { controller.submitConfidence(nil) }
                            Text("This is saved with the attempt but does not affect the score or reading trends.").font(.caption)
                        }
                    }
                }
                if controller.confidenceRecorded, let result = controller.result {
                    Text("Sight-reading results").font(.title2).accessibilityAddTraits(.isHeader)
                    Text("\(controller.classification) · \(result.accuracy)% accuracy · \(result.score) score")
                    Text("\(result.miss) misses · \(result.extra) extras")
                    if let assignment = controller.assignment {
                        Text("\(result.accuracy >= (assignment.minimumAccuracy ?? 0) ? "Assignment target met" : "Assignment target not met") · \(assignment.title)\(assignment.minimumAccuracy.map { " · \($0)% required" } ?? "")\(assignment.dueDate.map { " · due \($0)" } ?? "")").accessibilityIdentifier("sight-assignment-result")
                    }
                    if let fluency = controller.history.last?.fluency, !fluency.isEmpty {
                        Text("Reading fluency · " + fluency.keys.sorted().map { "\($0): \(fluency[$0] ?? 0)%" }.joined(separator: " · ")).font(.caption)
                    }
                    let offsets = controller.rated.compactMap(\.offsetMs)
                    if !offsets.isEmpty { Text("Average timing: \(offsets.reduce(0, +) / offsets.count) ms (negative = early, positive = late)") }
                    if let row = controller.history.last {
                        if let spread = row.timingSpreadMs { Text("Timing consistency: \(spread) ms average spread · \(row.earlyHits ?? 0) early · \(row.lateHits ?? 0) late") }
                        if let recovery = row.pulseRecovery { Text("Pulse recovery after errors: \(recovery)% of the next two beats stayed in time.") }
                        if let confidence = row.confidence { Text("Confidence: \(confidence)/5 (\(confidence * 20)%) · \(confidence * 20 - result.accuracy >= 0 ? "\(confidence * 20 - result.accuracy) points more confident than the score" : "\(result.accuracy - confidence * 20) points less confident than the score").") }
                        if row.source == "midi" { Text("Input check: \(row.inputCalibrated == true ? "calibrated \(row.inputCalibrationAgeDays.map { "\($0) days ago" } ?? "previously")" : "not calibrated")\(row.inputTimingCorrectionMs.map { " · \($0) ms correction" } ?? "")\(row.inputCalibrationSpreadMs.map { " · ±\($0) ms tap variation" } ?? "")\(row.inputCalibrationAgeDays.map { $0 > 30 ? " · recalibration recommended" : "" } ?? "").") }
                    }
                    if adaptiveMode, controller.classification == "reading", let exercise = controller.exercise {
                        let next = SightSettings.adaptiveNext(from: exercise.settings, accuracy: result.accuracy, timingSpreadMs: controller.history.last?.timingSpreadMs)
                        let nextPreview = SightSettings.adaptivePreviewSeconds(current: previewSeconds, accuracy: result.accuracy, timingSpreadMs: controller.history.last?.timingSpreadMs)
                        GroupBox("Adaptive next step") {
                            if next != nil || nextPreview != nil {
                                Text("\(next.map { "Try \($0.focusRhythm) rhythms at \($0.density) density and \($0.bpm) BPM" } ?? "Keep the current rhythm and tempo")\(nextPreview.map { " with a \($0)-second preview" } ?? "") .")
                                Button("Continue with adaptive exercise") {
                                    let updatedSettings = next ?? exercise.settings
                                    settings = updatedSettings; previewSeconds = nextPreview ?? previewSeconds; controller.fresh(updatedSettings)
                                }
                            } else { Text("Hold this setting steady; your accuracy and timing are in the practice range.") }
                        }
                    }
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
                                    if note.rating == .miss || note.rating == .extra {
                                        Button("Replay bar \(bar + 1) with this note highlighted") {
                                            controller.playReview(mode: "compare", speed: reviewSpeed, barIndex: bar, highlightStep: note.step ?? 0)
                                        }.disabled(controller.referencing)
                                    }
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
                    if controller.originalExerciseForDrill == nil { Button("Practice weakest bar twice") { controller.startWeakestBarDrill(); settings = controller.exercise?.settings ?? settings } }
                    if result.miss + result.extra > 0 && !controller.transferCheck { Button("Practice the main error pattern") { controller.startErrorFocusDrill(); settings = controller.exercise?.settings ?? settings } }
                    if controller.transferCheckSettings != nil && !controller.transferCheck { Button("Check transfer on a new phrase") { controller.startTransferCheck(); settings = controller.exercise?.settings ?? settings } }
                    if controller.sessionTotal > 0 {
                        let stages = ["Warm-up", "Build", "Review", "Goal", "Stretch"]
                        let stage = controller.sessionLabel == "Goal study path" ? stages.indices.contains(controller.sessionIndex - 1) ? stages[controller.sessionIndex - 1] : nil : nil
                        GroupBox("\(controller.sessionLabel) · exercise \(controller.sessionIndex) of \(controller.sessionTotal)") {
                            let average = controller.sessionResults.isEmpty ? nil : controller.sessionResults.reduce(0) { $0 + $1.accuracy } / controller.sessionResults.count
                            if let stage { Text("Study stage: \(stage).") }
                            if controller.sessionQueueIsEmpty {
                                Text("Set complete · \(controller.sessionResults.count) first reads · \(average.map { "\($0)% average accuracy" } ?? "no first-read results")")
                            } else {
                                Text("\(controller.sessionResults.count) of \(controller.sessionTotal) first reads complete · \(average.map { "\($0)% average accuracy so far" } ?? "this pass did not count as a first read")")
                                Button("Next exercise in set") { controller.nextSessionExercise(); settings = controller.exercise?.settings ?? settings }
                            }
                        }
                    }
                    if let code = controller.submissionCode() { ShareLink(item: "DH-SUB1:\(code)") { Label("Send result to teacher", systemImage: "square.and.arrow.up") } }
                    Picker("Review speed", selection: $reviewSpeed) { Text("0.75×").tag(0.75); Text("1×").tag(1.0); Text("1.25×").tag(1.25) }
                    Button(controller.referencing ? "Stop playback" : "Play reference") { if controller.referencing { controller.stop() } else { controller.playReview(mode: "reference", speed: reviewSpeed) } }
                    Button("Play my pass") { controller.playReview(mode: "learner", speed: reviewSpeed) }.disabled(controller.referencing)
                    Button("Compare reference and my pass") { controller.playReview(mode: "compare", speed: reviewSpeed) }.disabled(controller.referencing)
                }
                if !focusMode { goalPanel; history }
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
        .onChange(of: selectedMidiSourceID) { _, _ in midi.stop(); if controller.midiCalibrating { controller.cancel() } }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notice in
            if let type = notice.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
               type == AVAudioSession.InterruptionType.began.rawValue, controller.active || controller.referencing { controller.cancel() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { notice in
            if let reason = notice.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
               reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue, controller.active || controller.referencing { controller.cancel() }
        }
        .onDisappear { controller.stop(); midi.stop() }
        .onChange(of: settings) { _, value in if !controller.active { settings = value.normalized; if controller.exercise?.settings != value.normalized { controller.fresh(settings) } } }
        .onChange(of: controller.phase) { _, phase in
            if phase == .preview { scoreScroll.scrollTo("sight-system-0", anchor: .center) }
        }
        .onChange(of: Int(controller.beat / (controller.exercise?.beatsPerBar ?? 4))) { _, bar in
            if controller.phase == .playing { scoreScroll.scrollTo("sight-system-\(bar / (geometry.size.width >= 700 ? 4 : 2))", anchor: .center) }
        }
        }
        }
    }
    private var status: String {
        switch controller.phase {
        case .setup: controller.message
        case .preview: "Silent preview · \(controller.seconds) seconds"
        case .countIn: "Count-in · bar \(controller.countInBar) · \(controller.countInSyllable)"
        case .playing: "Play the notation"
        case .results: controller.message == "Ready" ? "Complete" : controller.message
        }
    }
    private var estimatedPerformanceLength: String {
        let beatsPerBar = settings.meter == "7/8" ? 3.5 : Double(settings.meter.first?.wholeNumberValue ?? 4)
        let seconds = beatsPerBar * Double(settings.bars) * 60 / Double(settings.bpm)
        return "about \(Int(seconds.rounded())) seconds"
    }
    private var setup: some View {
        GroupBox("Exercise setup") {
            VStack(alignment: .leading) {
                Picker("Level", selection: $settings.level) { ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0) } }
                Stepper("Tempo: \(settings.bpm) quarter-note BPM", value: $settings.bpm, in: 40...200)
                Picker("Bars", selection: $settings.bars) { ForEach([1, 2, 4, 8], id: \.self) { Text("\($0)").tag($0) } }
                Text("Performance length: \(estimatedPerformanceLength) at this tempo.").font(.caption)
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
                    if settings.level != .beginner { Text("Half-time").tag("half-time"); Text("Funk syncopation").tag("funk") }
                    if settings.level == .advanced { Text("Latin groove").tag("latin") }
                }
                if settings.style == "varied" {
                    Picker("Phrase density", selection: $settings.density) { Text("Light · fewer subdivisions").tag("light"); Text("Balanced").tag("balanced"); Text("Dense · more subdivisions").tag("dense") }
                }
                Picker("Reading cues", selection: $cueLevel) { Text("Full legend and pad labels").tag("full"); Text("Compact legend").tag("compact"); Text("Standard notation · no legend").tag("standard") }
                Picker("Practice set size", selection: $sessionLength) { ForEach([3, 5, 10], id: \.self) { Text("\($0) exercises").tag($0) } }
                Picker("Silent preview", selection: $previewSeconds) { Text("Cold read (0 seconds)").tag(0); Text("5 seconds").tag(5); Text("10 seconds").tag(10) }
                Picker("Count-in bars", selection: $countInBars) { Text("None").tag(0); Text("1 bar").tag(1); Text("2 bars").tag(2) }
                Picker("Count-in subdivision", selection: $countInSubdivision) { Text("Quarter notes").tag("quarter"); Text("Eighth notes").tag("eighth"); Text("Sixteenth notes").tag("sixteenth") }
                Text("Count accents follow \(settings.meter == "5/4" ? "3+2" : settings.meter == "7/8" ? "2+2+3" : settings.meter == "4/4" ? "2+2" : "the bar downbeat") grouping.").font(.caption)
                Toggle("Speak the count-in", isOn: $spokenCountIn)
                Toggle("Play target drums during the attempt (assisted)", isOn: $playTargetDrums)
                Toggle("Tempo ladder (+5 BPM after 85%)", isOn: $tempoLadder)
                Toggle("Adaptive progression after first reads", isOn: $adaptiveMode)
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
                        Text("Input health: \(midi.connectedSources.contains(selectedMidiSourceID) ? "connected" : "disconnected") · \(DrumVoice.allCases.filter { midi.noteNumbers[$0] != nil }.count)/5 voices mapped · \(midiCalibrationSummary).")
                            .font(.caption).accessibilityIdentifier("sight-input-health")
                        Button("Connect selected MIDI device") {
                            guard !selectedMidiSourceID.isEmpty else { return }
                            midi.connectSelectedSource(selectedMidiSourceID) { voice, at, _, sourceID in
                                if let expected = midiReadinessRemaining.first {
                                    if voice == expected {
                                        midiReadinessVerified.append(voice); midiReadinessRemaining.removeFirst()
                                        controller.message = midiReadinessRemaining.first.map { "\(voice.title) confirmed. Now strike \($0.title)." } ?? "All mapped drum voices responded. MIDI is ready for this device."
                                    } else { controller.message = "Detected \(voice.title); strike the requested \(expected.title) pad next." }
                                } else if controller.midiCalibrating { controller.recordMIDITimingHit(voice, at: at, sourceID: sourceID) }
                                else { controller.hit(voice, source: "midi", at: at, correctionMs: NativeMIDICalibration.correction(for: sourceID)) }
                            }
                        }
                        ForEach(DrumVoice.allCases) { voice in
                            HStack {
                                Stepper("\(voice.title) MIDI note: \(midi.noteNumbers[voice] ?? 0)", value: Binding(get: { midi.noteNumbers[voice] ?? 0 }, set: { _ = midi.setNote($0, for: voice) }), in: 0...127)
                                Button("Learn") { midi.learnNextNote(for: voice) }.disabled(midi.connectedSources.isEmpty)
                            }
                        }
                        Button("Restore default pad mapping") { midi.restoreDefaultNotes() }
                        Slider(value: Binding(get: { midiCorrection }, set: { NativeMIDICalibration.save($0, for: selectedMidiSourceID) }), in: -250...250, step: 5)
                            .accessibilityLabel("Selected MIDI device timing correction")
                        Text("Device timing correction: \(Int(midiCorrection)) ms")
                        Button("Estimate input timing correction") {
                            midiReadinessRemaining = []; midiReadinessVerified = []
                            controller.startMIDITimingCalibration(sourceID: selectedMidiSourceID, bpm: settings.bpm)
                        }.disabled(midi.connectedSources.isEmpty || selectedMidiSourceID.isEmpty)
                        Text("Tap the mapped snare on eight clicks after the count-in. The median offset includes device delay and tap consistency.").font(.caption)
                        Button("Run MIDI readiness check") { startMIDIReadinessCheck() }.disabled(midi.connectedSources.isEmpty)
                        if !midiReadinessRemaining.isEmpty { Text("Confirmed: \(midiReadinessVerified.map(\.title).joined(separator: ", ")). Strike \(midiReadinessRemaining[0].title) next.") }
                        else if !midiReadinessVerified.isEmpty { Text("All \(midiReadinessVerified.count) drum voices responded. Saved correction: \(Int(midiCorrection)) ms.") }
                    }
                    Text(midi.status).font(.caption)
                }
                Text("Pad note mapping and latency correction are saved on this device for the selected MIDI source.").font(.caption)
            }
        }
    }
    private var learningPathPanel: some View {
        let index = SightLearningPath.nextIndex(in: controller.history)
        return GroupBox("Learning path") {
            VStack(alignment: .leading) {
                if index < SightLearningPath.steps.count {
                    let step = SightLearningPath.steps[index]
                    Text("Step \(index + 1) of \(SightLearningPath.steps.count) · \(step.title). First readings of 80% complete a step.")
                    ProgressView(value: Double(index), total: Double(SightLearningPath.steps.count))
                    Button("Start this learning-path step") { settings = step.settings.normalized }
                } else {
                    Text("All reading foundations complete. Keep practicing at your preferred tempo or level.")
                    ProgressView(value: 1)
                }
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
        let fluencyNames = ["quarters", "eighths", "sixteenths", "triplets", "syncopation", "rests"]
        let fluencySummary = fluencyNames.compactMap { name -> String? in
            let values = rows.compactMap { $0.fluency?[name] }
            guard !values.isEmpty else { return nil }
            return "\(name): \(values.reduce(0, +) / values.count)%"
        }
        let spreads = rows.compactMap(\.timingSpreadMs)
        let averageSpread = spreads.isEmpty ? nil : spreads.reduce(0, +) / spreads.count
        let pulseSamples = rows.compactMap(\.pulseRecovery)
        let averagePulse = pulseSamples.isEmpty ? nil : pulseSamples.reduce(0, +) / pulseSamples.count
        let confidenceSamples = rows.filter { $0.confidence != nil }
        let confidenceBias = confidenceSamples.isEmpty ? nil : confidenceSamples.reduce(0) { $0 + (($1.confidence ?? 3) * 20 - $1.accuracy) } / confidenceSamples.count
        let variety = SightAnalytics.varietySummary(controller.history)
        let coverageGap = SightAnalytics.leastPracticedSettings(current: settings, history: controller.history)
        let early = rows.reduce(0) { $0 + ($1.earlyHits ?? 0) }
        let late = rows.reduce(0) { $0 + ($1.lateHits ?? 0) }
        let progressKeys = Array(Set(rows.map { "\($0.settings.meter)|\($0.settings.focusRhythm)" })).sorted()
        return VStack(alignment: .leading) {
            Text("Progress insights").font(.title2)
            Picker("Level filter", selection: $historyLevel) { Text("Any level").tag("Any"); ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0.rawValue) } }
            Picker("Meter filter", selection: $historyMeter) { Text("Any meter").tag("Any"); ForEach(["4/4", "3/4", "5/4", "7/8"], id: \.self) { Text($0).tag($0) } }
            Picker("Input filter", selection: $historyInput) { Text("Any input").tag("Any"); Text("Touch").tag("touch"); Text("Keyboard").tag("keyboard"); Text("MIDI").tag("midi") }
            Picker("Tempo filter", selection: $historyTempo) { Text("Any tempo").tag("Any"); Text("Under 80").tag("under80"); Text("80–119").tag("80to119"); Text("120+").tag("120plus") }
            Text("\(rows.count) first readings · " + (rows.isEmpty ? "Complete a reading to start a trend." : "\(rows.reduce(0) { $0 + $1.accuracy } / rows.count)% average accuracy") + " · \(practice.count) practice/assisted shown separately.")
            Text("Timing consistency · \(averageSpread.map { "\($0) ms average spread" } ?? "matched hits will build this trend") · \(early) early · \(late) late.").font(.caption)
            Text("Pulse recovery after errors · \(averagePulse.map { "\($0)% average across \(pulseSamples.count) reads" } ?? "no first-read samples yet") · confidence calibration · \(confidenceBias.map { "\(abs($0)) points \($0 > 0 ? "overconfident" : $0 < 0 ? "underconfident" : "well matched") on average" } ?? "record a confidence check to begin").").font(.caption)
            Text("Phrase variety · \(variety.uniquePhrases) unique phrases across \(variety.attempts) first reads · \(variety.meters) meters · \(variety.rhythmSettings) meter/rhythm pairs · \(variety.styles) styles.").font(.caption)
            Button("Try a coverage gap: \(coverageGap.meter) \(coverageGap.focusRhythm)") { settings = coverageGap; controller.fresh(coverageGap) }
            if !fluencySummary.isEmpty { Text("Rhythm fluency · " + fluencySummary.joined(separator: " · ")).font(.caption) }
            if !progressKeys.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Progress map · first-read accuracy by meter, rhythm, and tempo").font(.headline)
                    HStack { Text("Meter · rhythm").frame(maxWidth: .infinity, alignment: .leading); ForEach(["Under 80", "80–119", "120+"], id: \.self) { Text($0).font(.caption).frame(maxWidth: .infinity) } }
                    ForEach(progressKeys, id: \.self) { key in
                        let parts = key.split(separator: "|").map(String.init)
                        let meter = parts.first ?? "4/4", rhythm = parts.last ?? "mixed"
                        HStack(spacing: 4) {
                            Text("\(meter) · \(rhythm)").font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                            ForEach(["under80", "80to119", "120plus"], id: \.self) { band in
                                let matches = rows.filter { row in
                                    row.settings.meter == meter && row.settings.focusRhythm == rhythm && (band == "under80" ? row.settings.bpm < 80 : band == "80to119" ? row.settings.bpm >= 80 && row.settings.bpm < 120 : row.settings.bpm >= 120)
                                }
                                let average = matches.isEmpty ? nil : matches.reduce(0) { $0 + $1.accuracy } / matches.count
                                let label = average.map { "\($0)% · \(matches.count)" } ?? "—"
                                let accessibilityText = average.map { "\($0) percent from \(matches.count) first readings" } ?? "No first readings"
                                let color: Color = if let average { average >= 85 ? .green.opacity(0.18) : average >= 70 ? .orange.opacity(0.18) : .red.opacity(0.14) } else { .secondary.opacity(0.08) }
                                Text(label).font(.caption).frame(maxWidth: .infinity).padding(.vertical, 7)
                                    .background(color, in: RoundedRectangle(cornerRadius: 6))
                                    .accessibilityLabel(accessibilityText)
                            }
                        }
                    }
                }
                .accessibilityElement(children: .contain)
            }
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
                ForEach(controller.history.reversed()) { row in Text("\(row.settings.level.rawValue) · \(row.settings.meter) · \(row.settings.bpm) BPM · \(row.source) · \(row.classification) · \(row.accuracy)%\(row.confidence.map { " · confidence \($0)/5" } ?? "")\(row.pulseRecovery.map { " · \($0)% pulse recovery" } ?? "")") }
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
                    Button("Run five-step goal study path") { controller.startGoalPath(goal); settings = controller.exercise?.settings ?? settings }
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
    private func startMIDIReadinessCheck() {
        guard !midi.connectedSources.isEmpty else { controller.message = "Connect the selected MIDI device before checking pads."; return }
        midiReadinessVerified = []
        midiReadinessRemaining = DrumVoice.allCases
        controller.message = "Readiness check: strike the \(midiReadinessRemaining[0].title) pad."
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
