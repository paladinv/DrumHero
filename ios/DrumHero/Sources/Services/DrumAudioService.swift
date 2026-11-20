import AVFoundation
import Foundation

@MainActor
protocol DrumAudioPlaying {
    func prepare() throws
    @discardableResult func play(_ voice: DrumVoice) -> Bool
    @discardableResult func play(_ voice: DrumVoice, velocity: Int) -> Bool
    @discardableResult func playTarget(_ voice: DrumVoice, velocity: Int) -> Bool
    @discardableResult func playSightClick(_ voice: DrumVoice, accent: Bool) -> Bool
    func setSightMix(learner: Float, target: Float, click: Float)
    func stop()
}

extension DrumAudioPlaying {
    @discardableResult func play(_ voice: DrumVoice, velocity: Int) -> Bool { play(voice) }
    @discardableResult func playTarget(_ voice: DrumVoice, velocity: Int) -> Bool { play(voice, velocity: velocity) }
    @discardableResult func playSightClick(_ voice: DrumVoice, accent: Bool) -> Bool { play(voice, velocity: accent ? 110 : 65) }
    func setSightMix(learner: Float, target: Float, click: Float) {}
}

@MainActor
final class DrumAudioService: DrumAudioPlaying {
    private let engine = AVAudioEngine()
    private var players: [DrumVoice: AVAudioPlayerNode] = [:]
    private var targetPlayers: [DrumVoice: AVAudioPlayerNode] = [:]
    private var clickPlayers: [DrumVoice: AVAudioPlayerNode] = [:]
    private let learnerMixer = AVAudioMixerNode()
    private let targetMixer = AVAudioMixerNode()
    private let clickMixer = AVAudioMixerNode()
    private var sightLevels: (learner: Float, target: Float, click: Float) = (0.9, 0.55, 0.65)
    private var samples: [DrumVoice: [AVAudioPCMBuffer]] = [:]
    private var sampleIndices: [DrumVoice: Int] = [:]
    private var configured = false

    func prepare() throws {
        guard !configured else {
            if !engine.isRunning { try engine.start() }
            return
        }
        // Keep the shared session input-capable so an active Trainer microphone
        // tap continues to work while the metronome and drum samples play.
        let session = AVAudioSession.sharedInstance()
        // MicrophoneInput may already have selected measurement mode. Keep that
        // mode when the Trainer starts its sample engine so the input tap stays
        // attached to the same audio route.
        if session.category != .playAndRecord {
            try session.setCategory(.playAndRecord, mode: .default,
                                    options: [.defaultToSpeaker, .mixWithOthers])
        }
        engine.attach(learnerMixer); engine.attach(targetMixer); engine.attach(clickMixer)
        engine.connect(learnerMixer, to: engine.mainMixerNode, format: nil)
        engine.connect(targetMixer, to: engine.mainMixerNode, format: nil)
        engine.connect(clickMixer, to: engine.mainMixerNode, format: nil)
        for voice in DrumVoice.allCases {
            samples[voice] = loadSamples(for: voice)
            if let format = samples[voice]?.first?.format {
                // AVAudioPlayerNode requires scheduled buffers to match its output
                // format. A nil connection format can inherit the simulator or
                // device output format (often stereo/48 kHz), while our bundled
                // one-shot samples are mono/44.1 kHz.
                let learner = AVAudioPlayerNode(), target = AVAudioPlayerNode(), click = AVAudioPlayerNode()
                engine.attach(learner); engine.attach(target); engine.attach(click)
                engine.connect(learner, to: learnerMixer, format: format)
                engine.connect(target, to: targetMixer, format: format)
                engine.connect(click, to: clickMixer, format: format)
                players[voice] = learner; targetPlayers[voice] = target; clickPlayers[voice] = click
            }
        }
        applySightLevels()
        configured = true
        guard DrumVoice.allCases.contains(where: { !(samples[$0] ?? []).isEmpty }) else {
            throw AudioServiceError.noSamples
        }
        try engine.start()
    }

    @discardableResult
    func play(_ voice: DrumVoice) -> Bool {
        play(voice, velocity: 86, channel: .learner)
    }

    @discardableResult
    func playTarget(_ voice: DrumVoice, velocity: Int) -> Bool {
        play(voice, velocity: velocity, channel: .target)
    }

    @discardableResult
    func playSightClick(_ voice: DrumVoice, accent: Bool) -> Bool {
        play(voice, velocity: accent ? 110 : 65, channel: .click)
    }

    private enum Channel { case learner, target, click }
    private func play(_ voice: DrumVoice, velocity: Int, channel: Channel) -> Bool {
        do {
            try prepare()
            let player = channel == .target ? targetPlayers[voice] : channel == .click ? clickPlayers[voice] : players[voice]
            guard let player, let choices = samples[voice], !choices.isEmpty else { return false }
            let index = sampleIndices[voice, default: 0] % choices.count
            sampleIndices[voice] = index + 1
            player.volume = Float(max(1, min(127, velocity))) / 127
            player.scheduleBuffer(choices[index], at: nil, options: [])
            if !player.isPlaying { player.play() }
            return true
        } catch {
            return false
        }
    }

    @discardableResult
    func play(_ voice: DrumVoice, velocity: Int) -> Bool {
        play(voice, velocity: velocity, channel: .learner)
    }

    func setSightMix(learner: Float, target: Float, click: Float) {
        sightLevels = (max(0, min(1, learner)), max(0, min(1, target)), max(0, min(1, click)))
        applySightLevels()
    }

    private func applySightLevels() {
        learnerMixer.outputVolume = sightLevels.learner
        targetMixer.outputVolume = sightLevels.target
        clickMixer.outputVolume = sightLevels.click
    }

    func stop() {
        players.values.forEach { $0.stop() }; targetPlayers.values.forEach { $0.stop() }; clickPlayers.values.forEach { $0.stop() }
    }

    private func loadSamples(for voice: DrumVoice) -> [AVAudioPCMBuffer] {
        (1...4).compactMap { index -> AVAudioPCMBuffer? in
            guard let url = Bundle.main.url(forResource: "\(voice.rawValue)-\(index)", withExtension: "wav"),
                  let file = try? AVAudioFile(forReading: url),
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                                frameCapacity: AVAudioFrameCount(file.length)) else { return nil }
            do { try file.read(into: buffer); return buffer }
            catch { return nil }
        }
    }
}

enum AudioServiceError: LocalizedError {
    case noSamples
    var errorDescription: String? { "Drum samples are unavailable. Visual practice remains available." }
}
