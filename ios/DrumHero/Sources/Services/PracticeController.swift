import Combine
import Foundation
import AVFoundation

private final class AudioNotificationToken: @unchecked Sendable {
    let value: NSObjectProtocol
    init(_ value: NSObjectProtocol) { self.value = value }
}

@MainActor
final class PracticeController: ObservableObject {
    enum Status: String { case idle, countIn, playing, paused, complete }

    @Published private(set) var status: Status = .idle
    @Published private(set) var playhead = 0
    @Published private(set) var ratings: [RatedHit] = []
    @Published private(set) var result: PracticeResult?
    @Published private(set) var lastFeedback = "Ready when you are"
    @Published private(set) var audioUnavailable = false
    @Published private(set) var repetitions = 1
    private let audio: DrumAudioService
    private var task: Task<Void, Never>?
    private var expected: [ExpectedHit] = []
    private var pattern: PracticePattern?
    private var bpm = 80
    private var countInBeats = 4
    private var gridIndex = 0
    private var activeUptimeStart: TimeInterval = 0
    private var activeClockStart = ContinuousClock().now
    private var pausedAt: TimeInterval?
    private var pausedDuringCountIn = false
    private var interruptionObserver: AudioNotificationToken?
    private var routeChangeObserver: AudioNotificationToken?

    init(audio: DrumAudioService = DrumAudioService()) {
        self.audio = audio
        interruptionObserver = AudioNotificationToken(NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: rawType) == .began else { return }
            Task { @MainActor in self?.stopForInterruption() }
        })
        routeChangeObserver = AudioNotificationToken(NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.stopForInterruption() }
        })
    }

    deinit {
        if let interruptionObserver { NotificationCenter.default.removeObserver(interruptionObserver.value) }
        if let routeChangeObserver { NotificationCenter.default.removeObserver(routeChangeObserver.value) }
    }

    var currentPatternID: String? { pattern?.id }
    var currentTempo: Int { bpm }

    func start(pattern: PracticePattern, bpm: Int, repetitions: Int = 1, countInBeats: Int = 4) {
        reset()
        self.pattern = pattern
        self.bpm = min(200, max(40, bpm))
        self.countInBeats = min(4, max(1, countInBeats))
        self.repetitions = max(1, repetitions)
        expected = PracticeRules.expectedHits(pattern: pattern, bpm: self.bpm, repetitions: self.repetitions, startAt: 0)
        do { try audio.prepare(); audioUnavailable = false }
        catch { audioUnavailable = true }
        status = .countIn
        task = Task { [weak self] in await self?.runCountInAndPattern() }
    }

    func hit(_ voice: DrumVoice) {
        guard status == .playing else { return }
        let at = ProcessInfo.processInfo.systemUptime - activeUptimeStart
        markMissed(until: at - 0.1)
        guard let index = PracticeRules.closestUnmatchedIndex(at: at, in: expected, instrument: voice),
              abs(expected[index].at - at) <= 0.1 else {
            ratings.append(RatedHit(instrument: voice, rating: .extra, offsetMs: nil, step: nil, repetition: nil))
            lastFeedback = "Extra · \(voice.title)"
            audio.play(voice)
            return
        }
        let offset = (at - expected[index].at) * 1_000
        let rating = PracticeRules.classify(offsetMs: offset)
        expected[index].matched = true
        ratings.append(RatedHit(instrument: voice, rating: rating, offsetMs: Int(offset.rounded()),
                                step: expected[index].step, repetition: expected[index].repetition))
        lastFeedback = "\(rating.rawValue.capitalized) · \(voice.title) · \(offset >= 0 ? "+" : "")\(Int(offset.rounded())) ms"
        audio.play(voice)
    }

    func pause() {
        guard status == .playing || status == .countIn else { return }
        pausedDuringCountIn = status == .countIn
        pausedAt = ProcessInfo.processInfo.systemUptime
        task?.cancel(); task = nil
        audio.stop()
        status = .paused
    }

    func resume() {
        guard status == .paused else { return }
        if pausedDuringCountIn {
            pausedDuringCountIn = false
            status = .countIn
            task = Task { [weak self] in await self?.runCountInAndPattern() }
            return
        }
        let pauseDuration = pausedAt.map { ProcessInfo.processInfo.systemUptime - $0 } ?? 0
        if pausedAt != nil {
            let duration = pauseDuration
            activeUptimeStart += duration
        }
        self.pausedAt = nil
        let shift = Duration.nanoseconds(Int64(max(0, pauseDuration) * 1_000_000_000))
        activeClockStart += shift
        status = .playing
        task = Task { [weak self] in
            guard let self else { return }
            await self.runPattern(from: self.gridIndex + 1)
        }
    }

    func reset() {
        task?.cancel(); task = nil
        audio.stop()
        status = .idle; playhead = 0; ratings = []; result = nil; expected = []
        lastFeedback = "Ready when you are"; pausedAt = nil; pausedDuringCountIn = false; gridIndex = 0
    }

    func stopForInterruption() { pause() }

    private func runCountInAndPattern() async {
        let clock = ContinuousClock()
        let beat = Duration.milliseconds(Int(60_000 / bpm))
        let countInStart = clock.now
        for index in 0..<countInBeats {
            guard !Task.isCancelled else { return }
            do { try await clock.sleep(until: countInStart + beat * index) } catch { return }
            audio.play(.hihat)
            playhead = index
        }
        guard !Task.isCancelled else { return }
        activeClockStart = countInStart + beat * countInBeats
        activeUptimeStart = ProcessInfo.processInfo.systemUptime + 60 / Double(bpm)
        status = .playing
        await runPattern(from: 0)
    }

    private func runPattern(from startIndex: Int) async {
        guard let pattern else { return }
        let interval = PracticeRules.stepDuration(secondsPerBeat: bpm, subdivision: pattern.subdivision)
        let start = activeClockStart
        let clock = ContinuousClock()
        let totalGrids = pattern.totalSteps * repetitions
        for index in startIndex..<totalGrids {
            guard !Task.isCancelled else { return }
            let offset = Duration.nanoseconds(Int64(Double(index) * interval * 1_000_000_000))
            do { try await clock.sleep(until: start + offset) } catch { return }
            guard !Task.isCancelled else { return }
            gridIndex = index
            playhead = index % pattern.totalSteps
            for hit in pattern.hits where hit.step == playhead { audio.play(hit.instrument) }
            let now = ProcessInfo.processInfo.systemUptime - activeUptimeStart
            markMissed(until: now - 0.1)
        }
        let endOffset = Duration.nanoseconds(Int64((Double(totalGrids) * interval + 0.11) * 1_000_000_000))
        do { try await clock.sleep(until: start + endOffset) } catch { return }
        guard !Task.isCancelled else { return }
        markMissed(until: .infinity)
        result = PracticeRules.result(pattern: pattern, bpm: bpm, playedAt: .now, ratedHits: ratings)
        status = .complete
        audio.stop()
    }

    private func markMissed(until time: TimeInterval) {
        for index in expected.indices where !expected[index].matched && expected[index].at < time {
            expected[index].matched = true
            ratings.append(RatedHit(instrument: expected[index].instrument, rating: .miss, offsetMs: nil,
                                    step: expected[index].step, repetition: expected[index].repetition))
            lastFeedback = "Miss · \(expected[index].instrument.title)"
        }
    }
}
