import Foundation
import SwiftData

struct CurriculumProgressSummary {
    let completedCount: Int
    let totalCount: Int
    let nextLesson: DrumLesson?

    var isComplete: Bool { totalCount > 0 && completedCount == totalCount }

    init(lessons: [DrumLesson], progressRecords: [LessonProgressRecord]) {
        let orderedLessons = lessons.sorted { $0.order < $1.order }
        let completedLessonIDs = Set(progressRecords.compactMap { record in
            record.completedAt == nil ? nil : record.lessonID
        })
        completedCount = orderedLessons.filter { completedLessonIDs.contains($0.id) }.count
        totalCount = orderedLessons.count
        nextLesson = orderedLessons.first { !completedLessonIDs.contains($0.id) } ?? orderedLessons.first
    }
}

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
    var inputProfile: String?
    var assessmentAdaptation: String?
    var timingCorrectionMs: Double?
    var timingCalibrated: Bool?

    init(id: String = UUID().uuidString, patternID: String, patternName: String, bpm: Int,
         playedAt: Date = .now, mode: String, repetitions: Int, ratings: [TrainerRating],
         score: Int? = nil, accuracy: Int? = nil, inputProfile: String? = nil, assessmentAdaptation: String? = nil,
         timingCorrectionMs: Double? = nil, timingCalibrated: Bool? = nil) {
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
        self.inputProfile = inputProfile
        self.assessmentAdaptation = assessmentAdaptation
        self.timingCorrectionMs = timingCorrectionMs
        self.timingCalibrated = timingCalibrated
    }

    var ratings: [TrainerRating] { (try? JSONDecoder().decode([TrainerRating].self, from: ratingsData)) ?? [] }
}

@Model
final class PersonalSongRecord {
    @Attribute(.unique) var id: String
    var title: String
    var artist: String
    var difficulty: String
    var bpm: Int
    var meter: String
    var songData: Data
    var createdAt: Date
    var updatedAt: Date

    init(song: MobileSong, data: Data, createdAt: Date = .now, updatedAt: Date = .now) {
        id = song.id
        title = song.title
        artist = song.artist
        difficulty = song.difficulty
        bpm = song.bpm
        meter = song.meter
        songData = data
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var song: MobileSong? { try? JSONDecoder().decode(MobileSong.self, from: songData) }
}
