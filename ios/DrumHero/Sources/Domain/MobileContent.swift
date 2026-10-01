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

struct MobileContentDocument: Codable {
    var schemaVersion: Int
    var app: String
    var lessons: [DrumLesson]
    var lessonGuides: [String: LessonGuide]
    var rudiments: [PracticePattern]
    var grooves: [PracticePattern]

    var patterns: [PracticePattern] { rudiments + grooves }

    static func load(from bundle: Bundle = .main) throws -> MobileContentDocument {
        guard let url = bundle.url(forResource: "drum-content", withExtension: "json") else {
            throw ContentLoadError.missingFile
        }
        let document = try JSONDecoder().decode(MobileContentDocument.self, from: Data(contentsOf: url))
        guard document.schemaVersion == 1, document.app == "drum-hero" else {
            throw ContentLoadError.unsupportedSchema(document.schemaVersion)
        }
        let allIDs = document.lessons.map(\.id) + document.patterns.map(\.id)
        guard Set(allIDs).count == allIDs.count,
              document.lessons.allSatisfy({ document.lessonGuides[$0.id] != nil }),
              document.patterns.allSatisfy({ pattern in
                  pattern.defaultBpm >= 40 && pattern.defaultBpm <= 200 && pattern.hits.allSatisfy {
                      $0.step >= 0 && $0.step < pattern.totalSteps
                  }
              }) else { throw ContentLoadError.invalidContent }
        return document
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
