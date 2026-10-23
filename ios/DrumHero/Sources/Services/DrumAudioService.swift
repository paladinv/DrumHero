import AVFoundation
import Foundation

@MainActor
protocol DrumAudioPlaying {
    func prepare() throws
    @discardableResult func play(_ voice: DrumVoice) -> Bool
    @discardableResult func play(_ voice: DrumVoice, velocity: Int) -> Bool
    func stop()
}

extension DrumAudioPlaying {
    @discardableResult func play(_ voice: DrumVoice, velocity: Int) -> Bool { play(voice) }
}

@MainActor
final class DrumAudioService: DrumAudioPlaying {
    private let engine = AVAudioEngine()
    private var players: [DrumVoice: AVAudioPlayerNode] = [:]
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
        for voice in DrumVoice.allCases {
            let player = AVAudioPlayerNode()
            engine.attach(player)
            players[voice] = player
            samples[voice] = loadSamples(for: voice)
            if let format = samples[voice]?.first?.format {
                // AVAudioPlayerNode requires scheduled buffers to match its output
                // format. A nil connection format can inherit the simulator or
                // device output format (often stereo/48 kHz), while our bundled
                // one-shot samples are mono/44.1 kHz.
                engine.connect(player, to: engine.mainMixerNode, format: format)
            }
        }
        configured = true
        guard DrumVoice.allCases.contains(where: { !(samples[$0] ?? []).isEmpty }) else {
            throw AudioServiceError.noSamples
        }
        try engine.start()
    }

    @discardableResult
    func play(_ voice: DrumVoice) -> Bool {
        do {
            try prepare()
            guard let player = players[voice], let choices = samples[voice], !choices.isEmpty else { return false }
            let index = sampleIndices[voice, default: 0] % choices.count
            sampleIndices[voice] = index + 1
            player.scheduleBuffer(choices[index], at: nil, options: [])
            if !player.isPlaying { player.play() }
            return true
        } catch {
            return false
        }
    }

    @discardableResult
    func play(_ voice: DrumVoice, velocity: Int) -> Bool {
        do { try prepare() } catch { return false }
        players[voice]?.volume = Float(max(1, min(127, velocity))) / 127
        return play(voice)
    }

    func stop() {
        players.values.forEach { $0.stop() }
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
