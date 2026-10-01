import AVFoundation
import Foundation

@MainActor
final class DrumAudioService {
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
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        for voice in DrumVoice.allCases {
            let player = AVAudioPlayerNode()
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: nil)
            players[voice] = player
            samples[voice] = loadSamples(for: voice)
        }
        guard DrumVoice.allCases.contains(where: { !(samples[$0] ?? []).isEmpty }) else {
            throw AudioServiceError.noSamples
        }
        try engine.start()
        configured = true
    }

    func play(_ voice: DrumVoice) {
        do {
            try prepare()
            guard let player = players[voice], let choices = samples[voice], !choices.isEmpty else { return }
            let index = sampleIndices[voice, default: 0] % choices.count
            sampleIndices[voice] = index + 1
            player.scheduleBuffer(choices[index], at: nil, options: [])
            if !player.isPlaying { player.play() }
        } catch {
            // Visual practice and scoring continue when the audio engine is unavailable.
        }
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
