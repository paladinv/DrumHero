import Foundation
import SwiftData

@Model
final class LessonProgressRecord {
    @Attribute(.unique) var lessonID: String
    var completedAt: Date?
    var checkpoint: String
    var updatedAt: Date

    init(lessonID: String, checkpoint: String = "", completedAt: Date? = nil, updatedAt: Date = .now) {
        self.lessonID = lessonID
        self.checkpoint = checkpoint
        self.completedAt = completedAt
        self.updatedAt = updatedAt
    }
}

@Model
final class PracticeSessionRecord {
    @Attribute(.unique) var id: String
    var patternID: String
    var patternName: String
    var bpm: Int
    var playedAt: Date
    var score: Int
    var accuracy: Int
    var great: Int
    var good: Int
    var miss: Int
    var extra: Int
    var maxCombo: Int

    init(_ result: PracticeResult) {
        id = result.id
        patternID = result.patternID
        patternName = result.patternName
        bpm = result.bpm
        playedAt = result.playedAt
        score = result.score
        accuracy = result.accuracy
        great = result.great
        good = result.good
        miss = result.miss
        extra = result.extra
        maxCombo = result.maxCombo
    }
}

@Model
final class PatternBestRecord {
    @Attribute(.unique) var patternID: String
    var patternName: String
    var score: Int
    var achievedAt: Date

    init(patternID: String, patternName: String, score: Int, achievedAt: Date = .now) {
        self.patternID = patternID
        self.patternName = patternName
        self.score = score
        self.achievedAt = achievedAt
    }
}

@Model
final class TrainerRoundRecord {
    @Attribute(.unique) var id: String
    var patternID: String
    var patternName: String
    var bpm: Int
    var playedAt: Date
    var mode: String
    var repetitions: Int
    var ratingsData: Data
    var score: Int?
    var accuracy: Int?

    init(id: String = UUID().uuidString, patternID: String, patternName: String, bpm: Int,
         playedAt: Date = .now, mode: String, repetitions: Int, ratings: [TrainerRating],
         score: Int? = nil, accuracy: Int? = nil) {
        self.id = id
        self.patternID = patternID
        self.patternName = patternName
        self.bpm = bpm
        self.playedAt = playedAt
        self.mode = mode
        self.repetitions = repetitions
        self.ratingsData = (try? JSONEncoder().encode(ratings)) ?? Data()
        self.score = score
        self.accuracy = accuracy
    }

    var ratings: [TrainerRating] { (try? JSONDecoder().decode([TrainerRating].self, from: ratingsData)) ?? [] }
}
