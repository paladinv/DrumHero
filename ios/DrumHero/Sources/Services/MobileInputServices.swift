import AVFoundation
import Combine
import CoreMIDI
import Foundation

struct MIDIInputEvent: Sendable {
    let note: Int
    let velocity: Int
    let at: TimeInterval
}

struct MobileMIDISource: Identifiable, Hashable {
    let id: String
    let name: String
}

enum NativeMIDICalibration {
    static let legacyKey = "drumHero.nativeInputOffset.midi"
    static func key(for sourceID: String) -> String { "drumHero.nativeInputOffset.\(sourceID)" }
    static func spreadKey(for sourceID: String) -> String { "\(key(for: sourceID)).spread" }
    static func calibratedKey(for sourceID: String) -> String { "\(key(for: sourceID)).calibrated" }
    static func dateKey(for sourceID: String) -> String { "\(key(for: sourceID)).date" }
    static func wasCalibrated(for sourceID: String) -> Bool {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: calibratedKey(for: sourceID)) != nil { return defaults.bool(forKey: calibratedKey(for: sourceID)) }
        return defaults.object(forKey: key(for: sourceID)) != nil || defaults.object(forKey: legacyKey) != nil
    }
    static func spread(for sourceID: String) -> Double? { UserDefaults.standard.object(forKey: spreadKey(for: sourceID)) == nil ? nil : UserDefaults.standard.double(forKey: spreadKey(for: sourceID)) }
    static func calibrationDate(for sourceID: String) -> Date? { UserDefaults.standard.object(forKey: dateKey(for: sourceID)) as? Date }
    static var touchWasCalibrated: Bool { UserDefaults.standard.object(forKey: "drumHero.nativeInputOffset.touch") != nil }
    static var microphoneWasCalibrated: Bool { UserDefaults.standard.object(forKey: "drumHero.nativeInputOffset.microphone") != nil }
    static func correction(for sourceID: String) -> Double {
        let defaults = UserDefaults.standard, key = key(for: sourceID)
        return defaults.object(forKey: key) == nil ? defaults.double(forKey: legacyKey) : defaults.double(forKey: key)
    }
    static func save(_ correction: Double, spread: Double? = nil, calibrated: Bool = false, for sourceID: String) {
        let defaults = UserDefaults.standard
        defaults.set(min(250, max(-250, correction)), forKey: key(for: sourceID))
        defaults.set(calibrated, forKey: calibratedKey(for: sourceID))
        if calibrated {
            if let spread { defaults.set(min(240, max(0, spread)), forKey: spreadKey(for: sourceID)) }
            defaults.set(Date(), forKey: dateKey(for: sourceID))
        } else { defaults.removeObject(forKey: spreadKey(for: sourceID)); defaults.removeObject(forKey: dateKey(for: sourceID)) }
    }
}

private func decodeMIDIInputEvents(_ eventList: UnsafePointer<MIDIEventList>) -> [MIDIInputEvent] {
    guard eventList.pointee.numPackets > 0,
          let packetOffset = MemoryLayout<MIDIEventList>.offset(of: \.packet) else { return [] }

    var events: [MIDIInputEvent] = []
    var packet = UnsafeMutableRawPointer(mutating: UnsafeRawPointer(eventList))
        .advanced(by: packetOffset).assumingMemoryBound(to: MIDIEventPacket.self)
    for _ in 0..<Int(eventList.pointee.numPackets) {
        let packetTime = packet.pointee.timeStamp == 0
            ? ProcessInfo.processInfo.systemUptime
            : AVAudioTime.seconds(forHostTime: packet.pointee.timeStamp)
        let wordCount = min(Int(packet.pointee.wordCount), 64)
        withUnsafeBytes(of: packet.pointee.words) { bytes in
            for index in 0..<wordCount {
                let word = bytes.load(fromByteOffset: index * MemoryLayout<UInt32>.size, as: UInt32.self)
                // MIDI 1.0 Channel Voice messages arrive as one-word UMPs.
                guard (word >> 28) & 0x0F == 0x02 else { continue }
                let status = UInt8((word >> 16) & 0xFF)
                guard status & 0xF0 == 0x90 else { continue }
                let note = Int((word >> 8) & 0x7F)
                let velocity = Int(word & 0x7F)
                guard velocity > 0 else { continue }
                events.append(MIDIInputEvent(note: note, velocity: velocity, at: packetTime))
            }
        }
        packet = MIDIEventPacketNext(packet)
    }
    return events
}

@MainActor
final class MobileMIDIInput: ObservableObject {
    @Published private(set) var connectedSources: [String] = []
    @Published private(set) var availableSources: [MobileMIDISource] = []
    @Published private(set) var status = "MIDI is disconnected."
    @Published private(set) var noteNumbers: [DrumVoice: Int]
    @Published private(set) var articulationNotes: [String: Int]

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var endpoints: [MIDIEndpointRef] = []
    private var onVelocityHit: (@MainActor (DrumVoice, TimeInterval, Int) -> Void)?
    private var onHit: (@MainActor (DrumVoice, TimeInterval) -> Void)?
    private var onSourceVelocityHit: (@MainActor (DrumVoice, TimeInterval, Int, String, String?) -> Void)?
    private var onLearnNote: (@MainActor (Int) -> Void)?
    private var activeSourceID: String?
    private var sourceEndpoints: [String: MIDIEndpointRef] = [:]

    init() {
        let defaults = UserDefaults.standard
        noteNumbers = Dictionary(uniqueKeysWithValues: DrumVoice.allCases.map { voice in
            (voice, defaults.object(forKey: "drumHero.midiNote.\(voice.rawValue)") as? Int ?? Self.defaultNotes[voice]!)
        })
        let savedArticulations = defaults.dictionary(forKey: "drumHero.midiArticulationNotes") as? [String: Int] ?? [:]
        articulationNotes = Self.defaultArticulationNotes.merging(savedArticulations.filter { Self.articulationVoices[$0.key] != nil && (-1...127).contains($0.value) }) { _, saved in saved }
    }

    private static let defaultNotes: [DrumVoice: Int] = [
        .kick: 36, .snare: 38, .hihat: 42, .tom: 45, .crash: 49
    ]
    private static let defaultArticulationNotes = ["closed-hat": 42, "open-hat": 46, "pedal-hat": 44, "foot-splash": -1, "ride": 51, "crash": 49, "rimshot": 40, "side-stick": 37]
    private static let articulationVoices: [String: DrumVoice] = ["closed-hat": .hihat, "open-hat": .hihat, "pedal-hat": .hihat, "foot-splash": .hihat, "ride": .hihat, "crash": .crash, "rimshot": .snare, "side-stick": .snare]

    func setNote(_ note: Int, for voice: DrumVoice) -> Bool {
        guard (0...127).contains(note), !noteNumbers.contains(where: { $0.key != voice && $0.value == note }) else {
            status = "Each drum voice needs a different MIDI note."
            return false
        }
        if let articulation = articulationNotes.first(where: { $0.value == note })?.key,
           Self.articulationVoices[articulation] != voice {
            status = "That MIDI note is reserved for a different articulation voice."
            return false
        }
        noteNumbers[voice] = note
        UserDefaults.standard.set(note, forKey: "drumHero.midiNote.\(voice.rawValue)")
        status = "MIDI note mapping saved on this device."
        return true
    }

    func setArticulationNote(_ note: Int, for articulation: String) -> Bool {
        guard (-1...127).contains(note), let voice = Self.articulationVoices[articulation] else { status = "Choose a supported articulation and MIDI note."; return false }
        if note >= 0, let mappedVoice = noteNumbers.first(where: { $0.value == note })?.key, mappedVoice != voice {
            status = "That MIDI note is mapped to another drum voice."; return false
        }
        if note >= 0, articulationNotes.contains(where: { $0.key != articulation && $0.value == note }) {
            status = "Each articulation needs a distinct MIDI note."; return false
        }
        articulationNotes[articulation] = note
        UserDefaults.standard.set(articulationNotes, forKey: "drumHero.midiArticulationNotes")
        status = note < 0 ? "Articulation note unmapped." : "Articulation MIDI note saved on this device."
        return true
    }

    func restoreDefaultNotes() {
        noteNumbers = Self.defaultNotes
        for voice in DrumVoice.allCases {
            UserDefaults.standard.set(Self.defaultNotes[voice], forKey: "drumHero.midiNote.\(voice.rawValue)")
        }
    }

    func learnNextNote(for voice: DrumVoice) {
        guard !endpoints.isEmpty else { status = "Connect the selected MIDI source before learning a pad."; return }
        onLearnNote = { [weak self] note in
            guard let self else { return }
            _ = self.setNote(note, for: voice)
        }
        status = "Strike the (voice.title) pad to learn its MIDI note."
    }

    func connectWithVelocity(onHit: @escaping @MainActor (DrumVoice, TimeInterval, Int) -> Void) {
        connectAvailableSources { _, _ in }
        self.onVelocityHit = onHit
    }

    @discardableResult
    func refreshAvailableSources() -> [MobileMIDISource] {
        var endpointsByID: [String: MIDIEndpointRef] = [:]
        var sources: [MobileMIDISource] = []
        for index in 0..<MIDIGetNumberOfSources() {
            let endpoint = MIDIGetSource(index)
            guard endpoint != 0 else { continue }
            var uniqueID: Int32 = 0
            _ = MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &uniqueID)
            var unmanagedName: Unmanaged<CFString>?
            let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &unmanagedName)
            let name = status == noErr ? (unmanagedName?.takeRetainedValue() as String? ?? "MIDI source") : "MIDI source"
            let id = "midi:\(uniqueID == 0 ? "endpoint-\(endpoint)" : String(uniqueID))"
            sources.append(MobileMIDISource(id: id, name: name))
            endpointsByID[id] = endpoint
        }
        sourceEndpoints = endpointsByID
        availableSources = sources
        return sources
    }

    func connectSelectedSource(_ sourceID: String, onHit: @escaping @MainActor (DrumVoice, TimeInterval, Int, String, String?) -> Void) {
        self.onHit = nil; self.onVelocityHit = nil; self.onSourceVelocityHit = onHit; activeSourceID = sourceID
        guard ensureInputPort() else { return }
        disconnectSources()
        let sources = refreshAvailableSources()
        guard let source = sources.first(where: { $0.id == sourceID }), let endpoint = sourceEndpoints[sourceID], MIDIPortConnectSource(inputPort, endpoint, nil) == noErr else {
            status = "Select a connected MIDI source, then reconnect."
            activeSourceID = nil
            return
        }
        endpoints.append(endpoint); connectedSources = [source.name]
        status = "Connected to \(source.name)."
    }

    func connectAvailableSources(onHit: @escaping @MainActor (DrumVoice, TimeInterval) -> Void) {
        self.onHit = onHit
        self.onVelocityHit = nil
        self.onSourceVelocityHit = nil; activeSourceID = nil
        guard ensureInputPort() else { return }

        disconnectSources()
        let sources = refreshAvailableSources()
        for source in sources {
            guard let endpoint = sourceEndpoints[source.id], MIDIPortConnectSource(inputPort, endpoint, nil) == noErr else { continue }
            endpoints.append(endpoint)
            connectedSources.append(source.name)
        }
        status = connectedSources.isEmpty
            ? "No MIDI sources found. Connect a kit, then refresh the list."
            : "Connected to \(connectedSources.joined(separator: ", "))."
    }

    private func ensureInputPort() -> Bool {
        if client == 0 {
            let result = MIDIClientCreate("Drum Hero" as CFString, nil, nil, &client)
            guard result == noErr else {
                status = "Could not start Core MIDI (\(result))."
                return false
            }
        }
        if inputPort == 0 {
            let result = MIDIInputPortCreateWithProtocol(client, "Drum Hero Input" as CFString,
                                                         MIDIProtocolID._1_0, &inputPort) { [weak self] eventList, _ in
                let events = decodeMIDIInputEvents(eventList)
                guard !events.isEmpty else { return }
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    for event in events {
                        if let learn = self.onLearnNote { self.onLearnNote = nil; learn(event.note); continue }
                        let articulation = self.articulationNotes.first(where: { $0.value == event.note })?.key
                        let voice = articulation.flatMap { Self.articulationVoices[$0] } ?? self.noteNumbers.first(where: { $0.value == event.note })?.key
                        guard let voice else { continue }
                        self.onHit?(voice, event.at)
                        self.onVelocityHit?(voice, event.at, event.velocity)
                        if let sourceID = self.activeSourceID { self.onSourceVelocityHit?(voice, event.at, event.velocity, sourceID, articulation) }
                    }
                }
            }
            guard result == noErr else {
                status = "Could not open a MIDI input port (\(result))."
                return false
            }
        }
        return true
    }

    func stop() {
        disconnectSources()
        if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
        if client != 0 { MIDIClientDispose(client); client = 0 }
        onHit = nil
        onVelocityHit = nil
        onSourceVelocityHit = nil
        onLearnNote = nil
        activeSourceID = nil
        status = "MIDI is disconnected."
    }

    var hasLiveSources: Bool {
        let current = (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) }
        return endpoints.contains { current.contains($0) }
    }

    private func disconnectSources() {
        for endpoint in endpoints { MIDIPortDisconnectSource(inputPort, endpoint) }
        endpoints.removeAll()
        connectedSources.removeAll()
    }
}

private final class MicrophoneLevelAnalyzer: @unchecked Sendable {
    private let lock = NSLock()
    private var threshold: Float = 0.035
    private var measuredNoiseFloor: Float = 0
    private var previousRMS: Float = 0
    private var lastHitAt: TimeInterval = -.infinity
    private var isMeasuringNoise = false
    private var noiseReadings: [Float] = []
    private var hitCallback: (@Sendable (TimeInterval, [Float]) -> Void)?

    func setHitCallback(_ callback: (@Sendable (TimeInterval, [Float]) -> Void)?) {
        lock.lock(); hitCallback = callback; lock.unlock()
    }

    func setThreshold(_ value: Float) {
        lock.lock(); threshold = min(0.2, max(0.005, value)); lock.unlock()
    }

    func measureNoiseFloor() {
        lock.lock()
        noiseReadings.removeAll(keepingCapacity: true)
        isMeasuringNoise = true
        previousRMS = 0
        lastHitAt = -.infinity
        lock.unlock()
    }

    func finishNoiseFloorMeasurement() -> Float {
        lock.lock(); defer { lock.unlock() }
        isMeasuringNoise = false
        let sorted = noiseReadings.sorted()
        measuredNoiseFloor = sorted.isEmpty ? 0 : sorted[sorted.count / 2]
        threshold = min(0.12, max(0.008, measuredNoiseFloor * 4.5))
        previousRMS = measuredNoiseFloor
        return threshold
    }

    func analyze(_ buffer: AVAudioPCMBuffer, at time: TimeInterval) {
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0, let channel = buffer.floatChannelData?.pointee else { return }
        var total: Float = 0
        for index in 0..<frameCount { total += channel[index] * channel[index] }
        let rms = sqrt(total / Float(frameCount))

        lock.lock()
        if isMeasuringNoise {
            noiseReadings.append(rms)
            previousRMS = rms
            lock.unlock()
            return
        }
        let rise = rms - previousRMS
        previousRMS = rms
        // Require a fresh transient above the calibrated room floor. This avoids
        // scoring a sustained ringing tail repeatedly as it stays over threshold.
        let minimumRise = max(0.002, max(threshold * 0.25, measuredNoiseFloor * 1.5))
        let shouldEmit = rms >= threshold && rise >= minimumRise && time - lastHitAt >= 0.08
        if shouldEmit { lastHitAt = time }
        let callback = shouldEmit ? hitCallback : nil
        lock.unlock()
        if let callback { callback(time, Self.spectralSignature(buffer)) }
    }

    private static func spectralSignature(_ buffer: AVAudioPCMBuffer) -> [Float] {
        guard let channel = buffer.floatChannelData?.pointee else { return [] }
        let count = min(Int(buffer.frameLength), 1024)
        guard count > 32, buffer.format.sampleRate > 0 else { return [] }
        let sampleRate = buffer.format.sampleRate
        let frequencies: [Double] = [65, 95, 140, 210, 310, 460, 680, 1000, 1450, 2100, 3000, 4300, 6200, 8800]
        let logs = frequencies.map { frequency -> Float in
            let coefficient = 2 * cos(2 * Double.pi * frequency / sampleRate)
            var previous: Double = 0
            var beforePrevious: Double = 0
            for index in 0..<count {
                let window = 0.5 - 0.5 * cos(2 * Double.pi * Double(index) / Double(count - 1))
                let sample = Double(channel[index]) * window + coefficient * previous - beforePrevious
                beforePrevious = previous
                previous = sample
            }
            let power = max(1e-12, previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious)
            return Float(log10(power / Double(count) + 1e-12))
        }
        let mean = logs.reduce(0, +) / Float(logs.count)
        let centered = logs.map { $0 - mean }
        let magnitude = sqrt(centered.reduce(0) { $0 + $1 * $1 })
        guard magnitude > 1e-6 else { return [] }
        return centered.map { $0 / magnitude }
    }
}

enum MicrophoneInputError: LocalizedError {
    case permissionDenied
    case noInput
    case calibrationRequired
    case engine(String)

    var errorDescription: String? {
        switch self {
        case .permissionDenied: "Microphone access is off. Allow it in Settings to score audio input."
        case .noInput: "No microphone input is available on this audio route."
        case .calibrationRequired: "Calibrate all five drum voices before using experimental kit classification."
        case .engine(let message): "Could not start microphone input: \(message)"
        }
    }
}

@MainActor
final class MobileMicrophoneInput: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var threshold: Float = 0.035
    @Published private(set) var status = "Microphone is off."
    @Published private(set) var calibratedVoices: Set<DrumVoice> = []
    @Published private(set) var calibratingVoice: DrumVoice?
    @Published private(set) var calibrationHitCount = 0
    @Published private(set) var uncertainStrikes = 0
    @Published private(set) var lastVoiceMatch = ""

    private let engine = AVAudioEngine()
    private let analyzer = MicrophoneLevelAnalyzer()
    private let calibrationKey = "drumHero.nativeMicrophoneVoiceTemplates.v1"
    private var selectedVoice: DrumVoice = .snare
    private var classifyVoices = false
    private var voiceProfiles: [DrumVoice: [Float]] = [:]
    private var calibrationSamples: [[Float]] = []
    private var onHit: (@MainActor (DrumVoice, TimeInterval) -> Void)?
    private let calibrationStrikeCount = 6

    var canClassifyKit: Bool { DrumVoice.allCases.allSatisfy { voiceProfiles[$0] != nil } }

    init() {
        let stored = UserDefaults.standard.dictionary(forKey: calibrationKey) as? [String: [Double]] ?? [:]
        for voice in DrumVoice.allCases {
            if let values = stored[voice.rawValue], values.count == 14 { voiceProfiles[voice] = Self.normalized(values.map(Float.init)) }
        }
        calibratedVoices = Set(voiceProfiles.keys)
        analyzer.setHitCallback { [weak self] time, features in
            Task { @MainActor [weak self] in
                guard let self, self.isListening else { return }
                self.processStrike(time: time, features: features)
            }
        }
    }

    func start(voice: DrumVoice, classifyVoices: Bool = false, onHit: @escaping @MainActor (DrumVoice, TimeInterval) -> Void) async throws {
        guard !isListening else { return }
        guard !classifyVoices || canClassifyKit else {
            status = "Calibrate all five drums before enabling experimental kit classification."
            throw MicrophoneInputError.calibrationRequired
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            status = "Microphone access is off. Allow it in Settings to score audio input."
            throw MicrophoneInputError.permissionDenied
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .mixWithOthers])
            try session.setActive(true)
            let input = engine.inputNode
            let format = input.inputFormat(forBus: 0)
            guard format.channelCount > 0, format.sampleRate > 0 else { throw MicrophoneInputError.noInput }
            selectedVoice = voice
            self.classifyVoices = classifyVoices
            self.onHit = onHit
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 512, format: format) { [analyzer] buffer, audioTime in
                let at = audioTime.isHostTimeValid
                    ? AVAudioTime.seconds(forHostTime: audioTime.hostTime)
                    : ProcessInfo.processInfo.systemUptime
                analyzer.analyze(buffer, at: at)
            }
            engine.prepare()
            try engine.start()
            isListening = true
            uncertainStrikes = 0
            lastVoiceMatch = ""
            status = classifyVoices
                ? "Experimental kit classification is active. Uncertain strikes are ignored; audio is analyzed on this device and is not recorded."
                : "Listening for \(voice.title). Audio is analyzed on this device and is not recorded."
        } catch {
            stop()
            if let inputError = error as? MicrophoneInputError { throw inputError }
            status = "Could not start microphone input: \(error.localizedDescription)"
            throw MicrophoneInputError.engine(error.localizedDescription)
        }
    }

    func setVoice(_ voice: DrumVoice) {
        selectedVoice = voice
        if isListening && !classifyVoices { status = "Listening for \(voice.title). Audio is analyzed on this device and is not recorded." }
    }

    func calibrateVoice(_ voice: DrumVoice) {
        guard isListening else { status = "Enable microphone input before calibrating drum voices."; return }
        calibratingVoice = voice
        calibrationSamples.removeAll(keepingCapacity: true)
        calibrationHitCount = 0
        status = "Strike only the \(voice.title) six times, with a clear pause between hits."
    }

    private func processStrike(time: TimeInterval, features: [Float]) {
        guard !features.isEmpty else { return }
        if let voice = calibratingVoice {
            calibrationSamples.append(features)
            calibrationHitCount = calibrationSamples.count
            guard calibrationSamples.count >= calibrationStrikeCount else {
                status = "Calibrating \(voice.title) · \(calibrationHitCount)/\(calibrationStrikeCount) clean strikes."
                return
            }
            let average = (0..<features.count).map { index in calibrationSamples.reduce(Float(0)) { $0 + $1[index] } / Float(calibrationSamples.count) }
            let template = Self.normalized(average)
            guard template.count == 14 else { status = "This calibration had an unusable signal. Repeat the six strikes."; calibrationSamples.removeAll(); calibrationHitCount = 0; return }
            voiceProfiles[voice] = template
            calibratedVoices = Set(voiceProfiles.keys)
            let stored = Dictionary(uniqueKeysWithValues: voiceProfiles.map { ($0.key.rawValue, $0.value.map(Double.init)) })
            UserDefaults.standard.set(stored, forKey: calibrationKey)
            calibratingVoice = nil
            calibrationSamples.removeAll()
            status = "\(voice.title) profile saved on this device. Calibrate the next drum or review the voice before using kit classification."
            return
        }
        guard classifyVoices else { onHit?(selectedVoice, time); return }
        let ranked = voiceProfiles.compactMap { voice, template -> (DrumVoice, Float)? in
            guard template.count == features.count else { return nil }
            return (voice, zip(template, features).reduce(Float(0)) { $0 + $1.0 * $1.1 })
        }.sorted { $0.1 > $1.1 }
        guard let best = ranked.first, best.1 >= 0.82, ranked.count > 1, best.1 - ranked[1].1 >= 0.08 else {
            uncertainStrikes += 1
            let rankedText = ranked.prefix(2).map { "\($0.0.title) \(Int($0.1 * 100))%" }.joined(separator: " · ")
            lastVoiceMatch = rankedText.isEmpty ? "Uncertain strike" : "Uncertain · \(rankedText)"
            status = "\(lastVoiceMatch). This strike was left unscored; similarity is not a probability."
            return
        }
        lastVoiceMatch = "\(best.0.title) · \(Int(best.1 * 100))% signal similarity"
        status = "\(lastVoiceMatch). Experimental classification; review results before relying on them."
        onHit?(best.0, time)
    }

    private static func normalized(_ values: [Float]) -> [Float] {
        guard !values.isEmpty else { return [] }
        let mean = values.reduce(0, +) / Float(values.count)
        let centered = values.map { $0 - mean }
        let magnitude = sqrt(centered.reduce(0) { $0 + $1 * $1 })
        return magnitude > 1e-6 ? centered.map { $0 / magnitude } : []
    }

    func calibrateRoomNoise() async {
        guard isListening else {
            status = "Start microphone input before measuring room noise."
            return
        }
        status = "Measuring room noise. Keep the drums quiet for one second."
        analyzer.measureNoiseFloor()
        try? await Task.sleep(for: .seconds(1.2))
        threshold = analyzer.finishNoiseFloorMeasurement()
        status = "Room noise measured. Tap the selected drum to check sensitivity."
    }

    func setSensitivity(_ value: Double) {
        threshold = Float(min(0.2, max(0.005, value)))
        analyzer.setThreshold(threshold)
    }

    func stop() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        isListening = false
        classifyVoices = false
        calibratingVoice = nil
        calibrationSamples.removeAll()
        calibrationHitCount = 0
        onHit = nil
        status = "Microphone is off."
    }
}
