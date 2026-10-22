import Foundation

enum LearnerLevel: String, Codable, CaseIterable, Identifiable {
    case beginner = "Beginner"
    case intermediate = "Intermediate"
    case advanced = "Advanced"
    var id: String { rawValue }
}

enum DrumVoice: String, Codable, CaseIterable, Identifiable {
    case kick, snare, hihat, tom, crash
    var id: String { rawValue }
    var title: String {
        switch self {
        case .kick: "Kick"
        case .snare: "Snare"
        case .hihat: "Hi-hat"
        case .tom: "Tom"
        case .crash: "Crash"
        }
    }
    var keyHint: String {
        switch self {
        case .kick: "Space"
        case .snare: "F"
        case .hihat: "J"
        case .tom: "K"
        case .crash: "L"
        }
    }
}

struct PatternHit: Codable, Hashable, Identifiable {
    var step: Int
    var instrument: DrumVoice
    var accent = false
    var articulation: String?
    var id: String { "\(step)-\(instrument.rawValue)-\(accent)" }
}

extension PatternHit {
    private enum CodingKeys: String, CodingKey { case step, instrument, accent, articulation }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        step = try values.decode(Int.self, forKey: .step)
        instrument = try values.decode(DrumVoice.self, forKey: .instrument)
        accent = try values.decodeIfPresent(Bool.self, forKey: .accent) ?? false
        articulation = try values.decodeIfPresent(String.self, forKey: .articulation)
    }
}

struct PracticePattern: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var level: LearnerLevel
    var description: String
    var subdivision: Int
    var beats: Double
    var defaultBpm: Int
    var tempoRange: [Int]
    var hits: [PatternHit]
    var sticking: String?
    var coaching: String?
    var style: String?
    var focus: String?
    var meter: String?
    var feel: String?

    var totalSteps: Int { Int((beats * Double(subdivision) / 4).rounded()) }
}

struct LessonGuide: Codable, Hashable {
    var idea: String
    var steps: [String]
}

struct DrumLesson: Codable, Identifiable, Hashable {
    var id: String
    var order: Int
    var level: LearnerLevel
    var title: String
    var duration: Int
    var summary: String
    var goals: [String]
    var practicePatternId: String?
}

struct MobileSong: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var artist: String
    var difficulty: String
    var bpm: Int
    var meter: String
    var tags: [String]
    var notes: String
    var sections: [MobileSongSection]
}

struct MobileSongSection: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var bpm: Int?
    var parts: [MobileSongPart]
}

struct MobileSongPart: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var bpm: Int
    var beats: Double
    var subdivision: Int
    var meter: String
    var hits: [PatternHit]

    func practicePattern(song: MobileSong, section: MobileSongSection) -> PracticePattern {
        let tempo = section.bpm ?? bpm
        return PracticePattern(
            id: "song.\(song.id).\(section.id).\(id)",
            name: "\(song.title) · \(section.name) · \(name)",
            level: LearnerLevel(rawValue: song.difficulty) ?? .beginner,
            description: song.notes,
            subdivision: subdivision,
            beats: beats,
            defaultBpm: tempo,
            tempoRange: [max(40, tempo - 20), min(200, tempo + 20)],
            hits: hits,
            sticking: nil,
            coaching: nil,
            style: song.tags.first,
            focus: nil,
            meter: meter,
            feel: nil
        )
    }
}

struct MobileContentDocument: Codable {
    var schemaVersion: Int
    var app: String
    var translations: [String: [String: String]]
    var lessons: [DrumLesson]
    var lessonGuides: [String: LessonGuide]
    var rudiments: [PracticePattern]
    var grooves: [PracticePattern]
    var songs: [MobileSong]

    var patterns: [PracticePattern] { rudiments + grooves }
    var songPatterns: [PracticePattern] {
        songs.flatMap { song in song.sections.flatMap { section in section.parts.map { $0.practicePattern(song: song, section: section) } } }
    }
    var practicePatterns: [PracticePattern] { patterns + songPatterns }

    static func load(from bundle: Bundle = .main) throws -> MobileContentDocument {
        guard let url = bundle.url(forResource: "drum-content", withExtension: "json") else {
            throw ContentLoadError.missingFile
        }
        let document = try JSONDecoder().decode(MobileContentDocument.self, from: Data(contentsOf: url))
        guard document.schemaVersion == 1, document.app == "drum-hero" else {
            throw ContentLoadError.unsupportedSchema(document.schemaVersion)
        }
        let allIDs = document.lessons.map(\.id) + document.patterns.map(\.id) + document.songPatterns.map(\.id)
        let songIDs = document.songs.map(\.id)
        guard Set(allIDs).count == allIDs.count,
              Set(songIDs).count == songIDs.count,
              document.lessons.allSatisfy({ document.lessonGuides[$0.id] != nil }),
              document.songs.allSatisfy({ song in
                  !song.title.isEmpty && !song.artist.isEmpty && ["Beginner", "Intermediate", "Advanced"].contains(song.difficulty) &&
                  song.bpm >= 40 && song.bpm <= 200 && !song.sections.isEmpty && song.sections.allSatisfy { section in
                      !section.parts.isEmpty && section.parts.allSatisfy { part in
                          part.bpm >= 40 && part.bpm <= 200 && [4, 8, 12, 16].contains(part.subdivision) && part.beats > 0 && !part.hits.isEmpty &&
                          part.hits.allSatisfy { $0.step >= 0 && $0.step < Int((part.beats * Double(part.subdivision) / 4).rounded()) }
                      }
                  }
              }),
              document.patterns.allSatisfy({ pattern in
                  pattern.defaultBpm >= 40 && pattern.defaultBpm <= 200 && pattern.hits.allSatisfy {
                      $0.step >= 0 && $0.step < pattern.totalSteps
                  }
              }) else { throw ContentLoadError.invalidContent }
        return document
    }

    func localized(_ key: String, fallback: String, locale: Locale) -> String {
        let identifier = locale.identifier
        if let value = translations[identifier]?[key] { return value }
        if let language = locale.language.languageCode?.identifier, let value = translations[language]?[key] { return value }
        return fallback
    }
}

enum ContentLoadError: LocalizedError {
    case missingFile
    case unsupportedSchema(Int)
    case invalidContent
    var errorDescription: String? {
        switch self {
        case .missingFile: "The bundled Drum Hero learning content is missing."
        case .unsupportedSchema(let version): "This version of Drum Hero cannot read content version \(version)."
        case .invalidContent: "The bundled learning content did not pass validation."
        }
    }
}
