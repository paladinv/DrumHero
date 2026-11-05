import Foundation
import SwiftData
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum DrumHeroStyle {
    static let accent = Color(uiColor: UIColor { traits in
        if traits.userInterfaceStyle == .dark {
            return UIColor(red: 0.35, green: 0.83, blue: 0.70, alpha: 1)
        }
        return UIColor(red: 0.07, green: 0.37, blue: 0.32, alpha: 1)
    })
    static let prominentAction = Color(red: 0.15, green: 0.48, blue: 0.40)
}

private let drumMint = DrumHeroStyle.accent

struct HomeView: View {
    let content: MobileContentDocument
    @Binding var tab: DrumHeroTab
    @State private var assessmentStore = AssessmentHistory.read()
    private var assessedLesson: DrumLesson? {
        guard let baseline = assessmentStore.applied, let assessment = try? AssessmentContent.load(), let id = baseline.recommendation(assessment) else { return nil }
        return content.lessons.first { $0.id == id }
    }
    @Environment(\.locale) private var locale
    @Query private var progress: [LessonProgressRecord]
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var sessions: [PracticeSessionRecord]

    private var curriculumProgress: CurriculumProgressSummary {
        CurriculumProgressSummary(lessons: content.lessons, progressRecords: progress)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your next beat starts here.").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                    Text("A focused place to learn, practise, and track your drumming.").foregroundStyle(.secondary)
                    if curriculumProgress.isComplete && assessedLesson == nil {
                        Button { tab = .learn } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Curriculum complete", systemImage: "checkmark.seal.fill").font(.headline)
                                Text("You completed all \(curriculumProgress.totalCount) lessons.").font(.title2.bold())
                                Text("Review the lessons or keep practising from the other tabs.").foregroundStyle(.secondary)
                                Text("Review curriculum").font(.subheadline.weight(.semibold)).foregroundStyle(drumMint)
                            }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens the lesson catalogue")
                        .accessibilityIdentifier("home.review-curriculum")
                    } else if let nextLesson = assessedLesson ?? curriculumProgress.nextLesson {
                        Button { tab = .learn } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Continue learning", systemImage: "play.circle.fill").font(.headline)
                                Text(content.localized("lesson.\(nextLesson.id).title", fallback: nextLesson.title, locale: locale)).font(.title2.bold())
                                Text(content.localized("lesson.\(nextLesson.id).summary", fallback: nextLesson.summary, locale: locale)).foregroundStyle(.secondary)
                                Text("\(nextLesson.level.rawValue) · \(nextLesson.duration) min").font(.subheadline.weight(.semibold)).foregroundStyle(drumMint)
                            }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                        }.buttonStyle(.plain).accessibilityHint("Opens the lesson catalogue")
                    }
                    NavigationLink("Initial skill assessment") { InitialAssessmentView(content: content) }
                    AssessmentDailyPlan(content: content)
                    HStack(spacing: 12) {
                        StatCard(title: content.localized("Lessons", fallback: "Lessons", locale: locale), value: "\(curriculumProgress.completedCount)/\(curriculumProgress.totalCount)", symbol: "book")
                        StatCard(title: content.localized("Sessions", fallback: "Sessions", locale: locale), value: "\(sessions.count)", symbol: "waveform")
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(content.localized("Choose a session", fallback: "Choose a session", locale: locale)).font(.title2.bold())
                        HomeDestination(title: content.localized("dashboard.tool.practice.title", fallback: "Practice Pad", locale: locale), subtitle: content.localized("dashboard.tool.practice.description", fallback: "Train timing with five playable kit voices and honest feedback.", locale: locale), symbol: "circle.grid.3x3.fill") { tab = .practice }
                        HomeDestination(title: content.localized("dashboard.tool.trainer.title", fallback: "Trainer", locale: locale), subtitle: content.localized("dashboard.tool.trainer.description", fallback: "Practise with adjustable rounds, adaptive tempo, calibrated inputs, and setlist follow-along.", locale: locale), symbol: "metronome.fill") { tab = .trainer }
                    }
                }.padding().frame(maxWidth: 760).frame(maxWidth: .infinity)
            }.navigationTitle("Drum Hero").navigationBarTitleDisplayMode(.inline)
                .onReceive(NotificationCenter.default.publisher(for: AssessmentHistory.changed)) { _ in assessmentStore = AssessmentHistory.read() }
                .toolbar { ToolbarItem(placement: .topBarTrailing) { LanguageSettingsButton() } }
        }
    }
}

private struct StatCard: View {
    let title: String
    let value: String
    let symbol: String
    var body: some View {
        Label { VStack(alignment: .leading) { Text(value).font(.title2.bold()); Text(title).font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: symbol).font(.title2).foregroundStyle(drumMint) }
            .frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct HomeDestination: View {
    let title: String
    let subtitle: String
    let symbol: String
    let action: () -> Void
    var body: some View {
        Button(action: action) { Label { VStack(alignment: .leading) { Text(title).font(.headline); Text(subtitle).font(.subheadline).foregroundStyle(.secondary) } } icon: { Image(systemName: symbol).font(.title2).foregroundStyle(drumMint).frame(width: 40) }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 15)) }
            .buttonStyle(.plain)
    }
}

struct LearnView: View {
    let content: MobileContentDocument
    let openPractice: (PracticePattern) -> Void
    @Environment(\.locale) private var locale
    @Query private var progress: [LessonProgressRecord]
    @State private var level: LearnerLevel?

    private var lessons: [DrumLesson] {
        content.lessons.sorted { $0.order < $1.order }.filter { level == nil || $0.level == level }
    }

    var body: some View {
        NavigationStack {
            List {
                NavigationLink("Sight reading") { SightReadingView() }
                Section {
                    Picker("Lesson level", selection: $level) {
                        Text("All levels").tag(LearnerLevel?.none)
                        ForEach(LearnerLevel.allCases) { item in Text(item.rawValue).tag(Optional(item)) }
                    }.pickerStyle(.segmented)
                }
                ForEach(LearnerLevel.allCases) { lessonLevel in
                    let groupedLessons = lessons.filter { $0.level == lessonLevel }
                    if !groupedLessons.isEmpty {
                        Section(content.localized(lessonLevel.rawValue, fallback: lessonLevel.rawValue, locale: locale)) {
                            ForEach(groupedLessons) { lesson in
                                NavigationLink {
                                    LessonDetailView(content: content, lesson: lesson, guide: content.lessonGuides[lesson.id]!, pattern: content.patterns.first { $0.id == lesson.practicePatternId }, openPractice: openPractice)
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 5) {
                                            Text(content.localized("lesson.\(lesson.id).title", fallback: lesson.title, locale: locale)).font(.headline)
                                            Text("\(lesson.level.rawValue) · \(lesson.duration) min").font(.caption).foregroundStyle(.secondary)
                                            Text(content.localized("lesson.\(lesson.id).summary", fallback: lesson.summary, locale: locale)).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                                        }
                                        Spacer()
                                        if progress.contains(where: { $0.lessonID == lesson.id && $0.completedAt != nil }) {
                                            Label("Complete", systemImage: "checkmark.circle.fill").labelStyle(.iconOnly).foregroundStyle(drumMint).accessibilityLabel("Completed")
                                        }
                                    }.padding(.vertical, 4)
                                }
                            }
                        }
                    }
                }
                Section("Explore") {
                    NavigationLink("Song Library") {
                        SongLibraryView(content: content, openPractice: openPractice)
                    }
                    NavigationLink("Grooves · \(content.grooves.count)") { PatternCatalogueView(content: content, title: "Grooves", patterns: content.grooves, openPractice: openPractice) }
                    NavigationLink("Rudiments · \(content.rudiments.count)") { PatternCatalogueView(content: content, title: "Rudiments", patterns: content.rudiments, openPractice: openPractice) }
                    NavigationLink("Kit guide and hearing safety") { KitGuideView() }
                }
            }.navigationTitle("Learn")
                .toolbar { ToolbarItem(placement: .topBarTrailing) { LanguageSettingsButton() } }
        }
    }
}

struct SongLibraryView: View {
    let content: MobileContentDocument
    let openPractice: (PracticePattern) -> Void
    var body: some View {
        MobileSongLibraryScreen(content: content, openPractice: openPractice)
    }
}

private struct LessonDetailView: View {
    let content: MobileContentDocument
    let lesson: DrumLesson
    let guide: LessonGuide
    let pattern: PracticePattern?
    let openPractice: (PracticePattern) -> Void
    @Environment(\.modelContext) private var modelContext
    @Environment(\.locale) private var locale
    @Query private var allProgress: [LessonProgressRecord]
    @State private var checkpoint = ""
    @State private var didLoadCheckpoint = false
    @State private var checkpointMessage = ""

    private var record: LessonProgressRecord? { allProgress.first { $0.lessonID == lesson.id } }

    var body: some View {
        List {
            Section { Text(content.localized("lesson.\(lesson.id).summary", fallback: lesson.summary, locale: locale)); Label("\(content.localized(lesson.level.rawValue, fallback: lesson.level.rawValue, locale: locale)) · \(lesson.duration) min", systemImage: "clock") }
            Section("Goals") { ForEach(Array(lesson.goals.enumerated()), id: \.offset) { index, goal in Label(content.localized("lesson.\(lesson.id).goal.\(index + 1)", fallback: goal, locale: locale), systemImage: "checkmark.circle") } }
            Section("Lesson guide") {
                Text(content.localized("lesson.\(lesson.id).idea", fallback: guide.idea, locale: locale)).font(.body)
                ForEach(Array(guide.steps.enumerated()), id: \.offset) { index, step in
                    Label(content.localized("lesson.\(lesson.id).step.\(index + 1)", fallback: step, locale: locale), systemImage: "\(index + 1).circle")
                }
            }
            Section("Practice checkpoint") {
                TextField("What would you like to remember?", text: $checkpoint, axis: .vertical)
                    .lineLimit(2...5)
                    .accessibilityIdentifier("lesson.checkpoint")
                Button("Save checkpoint") {
                    let current = record ?? LessonProgressRecord(lessonID: lesson.id)
                    if record == nil { modelContext.insert(current) }
                    current.checkpoint = checkpoint
                    current.updatedAt = .now
                    do {
                        try modelContext.save()
                        checkpointMessage = "Checkpoint saved."
                    } catch {
                        modelContext.rollback()
                        checkpointMessage = "Could not save this checkpoint. Try again."
                    }
                }
                .accessibilityIdentifier("lesson.checkpoint.save")
                if !checkpointMessage.isEmpty {
                    Text(checkpointMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("lesson.checkpoint.status")
                        .accessibilityAddTraits(.updatesFrequently)
                }
                Button(record?.completedAt == nil ? "Mark lesson complete" : "Lesson complete", systemImage: record?.completedAt == nil ? "checkmark.circle" : "checkmark.circle.fill") {
                    let current = record ?? LessonProgressRecord(lessonID: lesson.id)
                    if record == nil { modelContext.insert(current) }
                    current.completedAt = current.completedAt ?? .now
                    current.updatedAt = .now
                    do { try modelContext.save() }
                    catch { modelContext.rollback() }
                }.disabled(record?.completedAt != nil).accessibilityIdentifier("lesson.complete")
            }
            if let pattern {
                Section("Put it into practice") {
                    Button("Open \(content.localized("pattern.\(pattern.id).name", fallback: pattern.name, locale: locale))", systemImage: "play.fill") { openPractice(pattern) }
                }
            }
        }
        .navigationTitle(content.localized("lesson.\(lesson.id).title", fallback: lesson.title, locale: locale)).navigationBarTitleDisplayMode(.inline)
        .onAppear { if !didLoadCheckpoint { checkpoint = record?.checkpoint ?? ""; didLoadCheckpoint = true } }
        .onChange(of: checkpoint) { _, newValue in
            if newValue.count > 2_000 { checkpoint = String(newValue.prefix(2_000)) }
            checkpointMessage = ""
        }
    }
}

struct PatternCatalogueView: View {
    let content: MobileContentDocument
    let title: String
    let patterns: [PracticePattern]
    let openPractice: (PracticePattern) -> Void
    @Environment(\.locale) private var locale
    @State private var query = ""
    @State private var level = "All"
    private var filtered: [PracticePattern] {
        patterns.filter { (level == "All" || $0.level.rawValue == level) && (query.isEmpty || "\(content.localized("pattern.\($0.id).name", fallback: $0.name, locale: locale)) \(content.localized("pattern.\($0.id).description", fallback: $0.description, locale: locale)) \($0.focus ?? "") \($0.style ?? "")".localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        List {
            Section {
                Picker("Level", selection: $level) { Text("All").tag("All"); ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0.rawValue) } }
                    .pickerStyle(.segmented)
            }
            ForEach(filtered) { pattern in
                VStack(alignment: .leading, spacing: 7) {
                    HStack { Text(content.localized("pattern.\(pattern.id).name", fallback: pattern.name, locale: locale)).font(.headline); Spacer(); Text(content.localized(pattern.level.rawValue, fallback: pattern.level.rawValue, locale: locale)).font(.caption).foregroundStyle(drumMint) }
                    Text(content.localized("pattern.\(pattern.id).description", fallback: pattern.description, locale: locale)).font(.subheadline).foregroundStyle(.secondary)
                    HStack { Text(pattern.meter ?? "\(pattern.beats)/4"); Text("·"); Text("\(pattern.subdivision == 4 ? "Quarter" : pattern.subdivision == 8 ? "Eighth" : pattern.subdivision == 12 ? "Triplet" : "Sixteenth") notes"); if let sticking = pattern.sticking { Text("·"); Text(sticking) } }
                        .font(.caption).foregroundStyle(.secondary)
                    let articulationCues = Set(pattern.hits.compactMap(\.articulation)).sorted()
                    if !articulationCues.isEmpty {
                        Label("Articulation cues · \(articulationCues.map(\.capitalized).joined(separator: " · "))", systemImage: "hand.tap")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let coaching = pattern.coaching {
                        Text(content.localized("pattern.\(pattern.id).coaching", fallback: coaching, locale: locale))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Button("Practice at \(pattern.defaultBpm) BPM", systemImage: "play.circle.fill") { openPractice(pattern) }.buttonStyle(.bordered)
                }.padding(.vertical, 5)
            }
        }.searchable(text: $query, prompt: "Find a \(title.lowercased().dropLast())")
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}

private struct KitGuideView: View {
    var body: some View {
        List {
            Section("Five playable voices") {
                ForEach(DrumVoice.allCases) { voice in Label("\(voice.title) · \(voice.keyHint)", systemImage: "circle.fill") }
            }
            Section("A comfortable setup") {
                Text("Set your seat so your legs can reach the pedals without twisting. Keep the snare and cymbals within relaxed arm reach, let the sticks rebound, and keep your shoulders loose.")
            }
            Section("Protect your hearing") {
                Label("Wear suitable hearing protection around acoustic drums. Keep headphones and monitors at a comfortable level; stop if playing causes pain or numbness.", systemImage: "ear.badge.waveform")
            }
        }.navigationTitle("Kit guide")
    }
}

struct PracticeView: View {
    let content: MobileContentDocument
    @ObservedObject var controller: PracticeController
    @Binding var selectedPatternID: String
    @Binding var bpm: Int
    @Environment(\.locale) private var locale
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var records: [PracticeSessionRecord]
    @State private var saveWarning = ""
    private var selectedPattern: PracticePattern? { content.practicePatterns.first { $0.id == selectedPatternID } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Picker("Pattern", selection: $selectedPatternID) {
                        ForEach(content.practicePatterns) { pattern in Text("\(content.localized("pattern.\(pattern.id).name", fallback: pattern.name, locale: locale)) · \(content.localized(pattern.level.rawValue, fallback: pattern.level.rawValue, locale: locale))").tag(pattern.id) }
                    }.pickerStyle(.menu).accessibilityIdentifier("practice.pattern")
                    if let selectedPattern {
                        VStack(alignment: .leading, spacing: 9) {
                            Text(content.localized("pattern.\(selectedPattern.id).name", fallback: selectedPattern.name, locale: locale)).font(.title2.bold())
                            Text(content.localized("pattern.\(selectedPattern.id).description", fallback: selectedPattern.description, locale: locale)).foregroundStyle(.secondary)
                            Text("\(selectedPattern.meter ?? "\(selectedPattern.beats)/4") · \(selectedPattern.totalSteps) steps · \(selectedPattern.subdivision)-note grid")
                                .font(.caption).foregroundStyle(.secondary)
                            if let sticking = selectedPattern.sticking { Label(sticking, systemImage: "hand.raised") }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    TempoControl(bpm: $bpm)
                    Button {
                        controller.toggleMute()
                    } label: {
                        Label(controller.isMuted ? "Unmute samples" : "Mute samples",
                              systemImage: controller.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("practice.mute")
                    .accessibilityValue(controller.isMuted ? "Muted" : "Samples enabled")
                    if let selectedPattern, controller.status == .countIn || controller.status == .playing || controller.status == .paused {
                        PracticeActivePanel(pattern: selectedPattern, controller: controller)
                    }
                    HStack {
                        if controller.status == .idle || controller.status == .complete {
                            Button(controller.status == .complete ? "Try again" : "Start", systemImage: "play.fill") { if let selectedPattern { controller.start(pattern: selectedPattern, bpm: bpm) } }.buttonStyle(.borderedProminent).tint(DrumHeroStyle.prominentAction)
                        } else if controller.status == .paused {
                            Button("Resume", systemImage: "play.fill") { controller.resume() }.buttonStyle(.borderedProminent).tint(DrumHeroStyle.prominentAction)
                        } else {
                            Button("Pause", systemImage: "pause.fill") { controller.pause() }.buttonStyle(.borderedProminent)
                        }
                        if controller.status != .idle { Button("Reset", systemImage: "arrow.counterclockwise", role: .destructive) { controller.reset() }.buttonStyle(.bordered) }
                    }
                    if let result = controller.result { ResultCard(result: result) }
                    if !saveWarning.isEmpty {
                        Label(saveWarning, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    if !records.isEmpty {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Recent practice").font(.headline)
                            ForEach(records.prefix(3)) { record in Text("\(record.patternName) · \(record.accuracy)% · \(record.bpm) BPM").font(.subheadline).foregroundStyle(.secondary) }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                }.padding().frame(maxWidth: 780).frame(maxWidth: .infinity)
            }
            .navigationTitle("Practice")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { LanguageSettingsButton() } }
            .onChange(of: selectedPatternID) { _, newValue in
                if controller.currentPatternID != newValue { controller.reset() }
                if let pattern = content.practicePatterns.first(where: { $0.id == newValue }) { bpm = pattern.defaultBpm }
            }
            .onChange(of: bpm) { _, newValue in if controller.currentTempo != newValue { controller.reset() } }
            .onChange(of: controller.result?.id) { _, newValue in if newValue != nil, let result = controller.result { save(result) } }
        }
    }

    private func save(_ result: PracticeResult) {
        modelContext.insert(PracticeSessionRecord(result))
        let bestDescriptor = FetchDescriptor<PatternBestRecord>(predicate: #Predicate { $0.patternID == result.patternID })
        if let best = try? modelContext.fetch(bestDescriptor).first {
            if result.score > best.score { best.score = result.score; best.achievedAt = result.playedAt }
        } else {
            modelContext.insert(PatternBestRecord(patternID: result.patternID, patternName: result.patternName, score: result.score, achievedAt: result.playedAt))
        }
        let descriptor = FetchDescriptor<PracticeSessionRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)])
        if let all = try? modelContext.fetch(descriptor) {
            for stale in all.dropFirst(50) { modelContext.delete(stale) }
        }
        do {
            try modelContext.save()
            saveWarning = ""
        } catch {
            modelContext.rollback()
            saveWarning = "This result could not be saved to local progress."
        }
    }
}

private struct PracticeActivePanel: View {
    let pattern: PracticePattern
    @ObservedObject var controller: PracticeController
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var statusText: String {
        if controller.status == .countIn { return "Count in · \(controller.playhead + 1)" }
        if controller.status == .paused { return "Paused" }
        return "Step \(controller.playhead + 1) of \(pattern.totalSteps)"
    }

    var body: some View {
        VStack(spacing: 16) {
            PracticePatternGrid(pattern: pattern, playhead: controller.playhead,
                                isPlaying: controller.status == .playing)
            Text(statusText)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .contentTransition(reduceMotion ? .identity : .numericText())
                .accessibilityAddTraits(.updatesFrequently)
            if controller.status == .playing {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(DrumVoice.allCases) { voice in DrumTouchPad(voice: voice) { controller.hit(voice) } }
                }
            }
            Text(controller.lastFeedback)
                .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                .accessibilityLabel("Last hit feedback")
                .accessibilityValue(controller.lastFeedback)
            if controller.audioUnavailable {
                Label("Audio is unavailable. Visual practice and scoring remain active.", systemImage: "speaker.slash")
                    .font(.caption).foregroundStyle(.orange)
            }
        }
    }
}

private struct PracticePatternGrid: View {
    let pattern: PracticePattern
    let playhead: Int
    let isPlaying: Bool

    var body: some View {
        Grid(horizontalSpacing: 5, verticalSpacing: 5) {
            GridRow {
                Text("Step").font(.caption2).foregroundStyle(.secondary).frame(width: 38)
                ForEach(DrumVoice.allCases) { voice in
                    Text(voice.title)
                        .font(.caption2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                }
            }
            ForEach(0..<max(1, pattern.totalSteps), id: \.self) { row in
                GridRow {
                    Text("\(row + 1)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 38)
                    ForEach(DrumVoice.allCases) { voice in
                        PatternGridCell(row: row, voice: voice,
                                        beat: row * 4 / max(1, pattern.subdivision) + 1,
                                        hasTarget: pattern.hits.contains { $0.step == row && $0.instrument == voice },
                                        isCurrent: row == playhead && isPlaying)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Pattern grid")
        .environment(\.layoutDirection, .leftToRight)
    }
}

private struct PatternGridCell: View {
    let row: Int
    let voice: DrumVoice
    let beat: Int
    let hasTarget: Bool
    let isCurrent: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Circle()
            .fill(hasTarget ? drumMint : Color.secondary.opacity(0.12))
            .frame(height: 24)
            .overlay {
                if hasTarget {
                    Text(String(voice.title.prefix(1)))
                        .font(.caption2.bold())
                        .foregroundStyle(colorScheme == .dark ? Color.black : Color.white)
                        .accessibilityHidden(true)
                }
            }
            .overlay { Circle().stroke(isCurrent ? Color.orange : Color.clear, lineWidth: 3) }
            .accessibilityElement()
            .accessibilityLabel("Step \(row + 1), beat \(beat), \(voice.title), \(hasTarget ? "target" : "rest")")
    }
}

private struct DrumTouchPad: View {
    let voice: DrumVoice
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: "circle.fill").font(.title2)
                Text(voice.title).font(.headline)
                Text(voice.keyHint).font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 74)
            .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 15))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(voice.title) drum pad")
        .accessibilityHint("Tap to play and score the \(voice.title)")
        .accessibilityIdentifier("pad.\(voice.rawValue)")
    }
}

private struct TempoControl: View {
    @Binding var bpm: Int
    @State private var sliderBpm: Double

    init(bpm: Binding<Int>) {
        _bpm = bpm
        _sliderBpm = State(initialValue: Double(bpm.wrappedValue))
    }

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text("Tempo")
                Spacer()
                Text("\(bpm) BPM").monospacedDigit().bold()
            }
            Slider(value: $sliderBpm, in: 40...200, step: 1)
                .onChange(of: sliderBpm) { _, value in bpm = Int(value.rounded()) }
                .onChange(of: bpm) { _, value in sliderBpm = Double(value) }
                .accessibilityLabel("Tempo")
                .accessibilityValue("\(bpm) beats per minute")
        }
    }
}

private struct ResultCard: View {
    let result: PracticeResult
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Round complete").font(.title2.bold())
            HStack {
                Label("\(result.score) score", systemImage: "star.fill")
                Spacer()
                Label("\(result.accuracy)%", systemImage: "target")
            }.font(.headline)
            Text("Great \(result.great) · Good \(result.good) · Miss \(result.miss) · Extra \(result.extra) · Best combo \(result.maxCombo)")
                .font(.caption).foregroundStyle(.secondary)
        }.padding().frame(maxWidth: .infinity, alignment: .leading).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16)).accessibilityElement(children: .combine).accessibilityIdentifier("practice.results")
    }
}

private enum TrainerSkillFocus: String, CaseIterable, Identifiable {
    case all = "All patterns"
    case backbeat = "Backbeat foundations"
    case fills = "Fills"
    case syncopation = "Syncopation"
    case ghostNotes = "Ghost notes"
    case dynamics = "Dynamics"
    case coordination = "Hands and feet"
    case oddMeter = "Odd meter"

    var id: String { rawValue }

    func includes(_ pattern: PracticePattern) -> Bool {
        if self == .all { return true }
        let text = "\(pattern.name) \(pattern.description) \(pattern.focus ?? "") \(pattern.style ?? "")".lowercased()
        return switch self {
        case .all: true
        case .backbeat: pattern.meter == "4/4" && pattern.level == .beginner && !text.contains("fill")
        case .fills: text.contains("fill")
        case .syncopation: ["syncopat", "offbeat", "displac", "pickup", "linear", "broken beat"].contains(where: text.contains)
        case .ghostNotes: ["ghost", "quiet"].contains(where: text.contains)
        case .dynamics: ["dynamic", "accent", "crescendo", "ghost", "soft"].contains(where: text.contains)
        case .coordination: pattern.hits.contains(where: { $0.instrument == .kick }) && pattern.hits.contains(where: { $0.instrument != .kick })
        case .oddMeter: pattern.meter != nil && pattern.meter != "4/4"
        }
    }
}

struct TrainerView: View {
    let content: MobileContentDocument
    var initialPatternId: String? = nil
    var initialBpm: Int? = nil
    var initialAdaptation: String = "standard"
    var assessmentSince: Date? = nil
    var assessmentInputProfile: String? = nil
    var assessmentAdaptation: String? = nil
    var assessmentCorrectionMs: Double? = nil
    var assessmentTimingCalibrated: Bool? = nil
    @Environment(\.locale) private var locale
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var trainerRounds: [TrainerRoundRecord]
    @StateObject private var controller = PracticeController()
    @StateObject private var microphoneInput = MobileMicrophoneInput()
    @StateObject private var midiInput = MobileMIDIInput()
    @AppStorage("drumHero.nativeInputOffset.touch") private var touchInputOffsetMs = 0.0
    @AppStorage("drumHero.nativeInputOffset.microphone") private var microphoneInputOffsetMs = 0.0
    @State private var patternID = "single-stroke"
    @State private var skillFocus = TrainerSkillFocus.all
    @State private var bpm = 70
    @State private var repetitions = 4
    @State private var countInBeats = 4
    @State private var mode = "Self-rated"
    @State private var inputMode = "Touch pads"
    @State private var microphoneVoice: DrumVoice = .snare
    @State private var selectedMidiSourceID = ""
    @State private var microphoneSensitivity = 0.035
    @State private var adaptation = "Standard pattern"
    @State private var adaptiveVoice: DrumVoice = .snare
    @State private var ratings: [TrainerRating] = []
    @State private var pendingRating = false
    @State private var savedRound = false
    private var patterns: [PracticePattern] { content.rudiments + content.grooves }
    private var visiblePatterns: [PracticePattern] { patterns.filter(skillFocus.includes) }
    private var pattern: PracticePattern { patterns.first { $0.id == patternID } ?? patterns[0] }
    private var roundPattern: PracticePattern {
        var selected = pattern
        switch adaptation {
        case "Seated / no kick target":
            selected.name += " · Seated / no kick"
            selected.hits = selected.hits.filter { $0.instrument != .kick }
        case "One voice / reduced reach":
            selected.name += " · One voice: \(adaptiveVoice.title)"
            selected.hits = selected.hits.map { hit in
                var mapped = hit
                mapped.instrument = adaptiveVoice
                return mapped
            }
        default: break
        }
        return selected
    }
    private var visibleVoices: [DrumVoice] { adaptation == "One voice / reduced reach" ? [adaptiveVoice] : Array(DrumVoice.allCases) }
    private var midiInputOffsetMs: Double { NativeMIDICalibration.correction(for: selectedMidiSourceID) }
    private var activeInputProfile: String { inputMode == "MIDI" ? selectedMidiSourceID : inputMode == "Microphone" ? "microphone" : "touch" }
    private var activeInputCorrectionMs: Double { inputMode == "MIDI" ? midiInputOffsetMs : inputMode == "Microphone" ? microphoneInputOffsetMs : touchInputOffsetMs }
    private var activeInputCalibrated: Bool { inputMode == "MIDI" ? NativeMIDICalibration.wasCalibrated(for: selectedMidiSourceID) : inputMode == "Microphone" ? NativeMIDICalibration.microphoneWasCalibrated : NativeMIDICalibration.touchWasCalibrated }
    private var recentMatchingRounds: [TrainerRoundRecord] {
        trainerRounds.filter { $0.patternID == patternID && $0.mode == "scored" && $0.assessmentAdaptation == "standard" && $0.inputProfile == activeInputProfile }.prefix(6).map { $0 }
    }
    private var assessmentRecheckStreak: Int? {
        guard let assessmentSince, let assessmentInputProfile, let assessmentAdaptation,
              assessmentSince <= .now else { return nil }
        let matches = trainerRounds.filter {
            $0.patternID == patternID && $0.mode.hasPrefix("scored") && $0.playedAt > assessmentSince &&
            $0.inputProfile == assessmentInputProfile && $0.assessmentAdaptation == assessmentAdaptation &&
            $0.timingCalibrated == assessmentTimingCalibrated &&
            abs(($0.timingCorrectionMs ?? 0) - (assessmentCorrectionMs ?? 0)) < 10
        }.sorted { $0.playedAt > $1.playedAt }
        var streak = 0
        for row in matches {
            guard (row.score ?? 0) >= 85, (row.accuracy ?? 0) >= 85 else { break }
            streak += 1
        }
        return streak
    }
    private var recentProgressSummary: String {
        let values = recentMatchingRounds.compactMap(\.accuracy)
        guard let latest = values.first else { return "Score a round to build a timing trend for this pattern and input." }
        guard values.count > 1 else { return "Latest result: \(latest)% accuracy. Another scored round will show your trend." }
        let previous = Array(values.dropFirst())
        let priorAverage = Int((Double(previous.reduce(0, +)) / Double(previous.count)).rounded())
        let change = latest - priorAverage
        return "Recent average: \(Int((Double(values.reduce(0, +)) / Double(values.count)).rounded()))% across \(values.count) rounds · latest \(change >= 0 ? "+" : "")\(change) points vs earlier rounds."
    }
    private var roundPracticeAdvice: String? {
        guard let result = controller.result else { return nil }
        let missed = controller.ratings.filter { $0.rating == .miss }
        if let common = Dictionary(grouping: missed, by: \.instrument).max(by: { $0.value.count < $1.value.count })?.key {
            let beat = missed.filter { $0.instrument == common }.compactMap(\.step).map { $0 / max(1, pattern.subdivision / 4) + 1 }.first
            let slower = max(pattern.tempoRange[0], bpm - 5)
            return "Most missed: \(common.title)\(beat.map { " on beat \($0)" } ?? ""). Repeat at \(slower) BPM, then try the full pattern again."
        }
        if result.extra > 0 { return "You played \(result.extra) extra \(result.extra == 1 ? "stroke" : "strokes"). Follow the target grid for one bar, then repeat the round." }
        let offsets = controller.ratings.compactMap(\.offsetMs).map(Double.init)
        if offsets.count >= 3 {
            let mean = offsets.reduce(0, +) / Double(offsets.count)
            let distance = offsets.map(abs).reduce(0, +) / Double(offsets.count)
            if distance > 50 { return "Your hits tended \(mean > 0 ? "late" : "early") by \(Int(abs(mean).rounded())) ms. Repeat at \(max(pattern.tempoRange[0], bpm - 5)) BPM and stay with the click." }
        }
        return result.accuracy >= 90 ? "Good control. Raise the tempo by 2 BPM or continue to the next pattern." : "Repeat this pattern once more and aim for the same steady pulse."
    }

    var body: some View {
        NavigationStack {
            Form {
                NavigationLink("Sight reading") { SightReadingView() }
                if let streak = assessmentRecheckStreak {
                    Section("Assessment practice") {
                        Text(streak >= 3 ? "Ready for a recheck · \(min(streak, 3))/3 consecutive scored rounds reached 85% score and matched hits." : "\(min(streak, 3))/3 consecutive scored rounds reached 85% score and matched hits. Keep practising, then return to your assessment.")
                        Text("This native Trainer history does not store hit timing offsets, so this readiness check uses score and matched-hit percentage only.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Round setup") {
                    Picker("Skill focus", selection: $skillFocus) { ForEach(TrainerSkillFocus.allCases) { Text($0.rawValue).tag($0) } }
                        .accessibilityIdentifier("trainer.skillFocus")
                    Picker("Pattern", selection: $patternID) { ForEach(visiblePatterns) { Text(content.localized("pattern.\($0.id).name", fallback: $0.name, locale: locale)).tag($0.id) } }
                    Picker("Mode", selection: $mode) { Text("Self-rated").tag("Self-rated"); Text("Scored").tag("Scored") }
                    Picker("Practice adaptation", selection: $adaptation) {
                        Text("Standard pattern").tag("Standard pattern")
                        Text("Seated / no kick target").tag("Seated / no kick target").disabled(!pattern.hits.contains { $0.instrument != .kick })
                        Text("One voice / reduced reach").tag("One voice / reduced reach")
                    }
                    if adaptation == "One voice / reduced reach" {
                        Picker("Use this voice", selection: $adaptiveVoice) { ForEach(DrumVoice.allCases) { Text($0.title).tag($0) } }
                    }
                    if adaptation != "Standard pattern" {
                        Text("Adapted rounds are saved separately and do not change standard pattern best scores.").font(.caption).foregroundStyle(.secondary)
                    }
                    Picker("Repetitions", selection: $repetitions) { ForEach([4, 8, 10, 16], id: \.self) { Text("\($0)").tag($0) } }
                    Picker("Count-in", selection: $countInBeats) { ForEach([1, 2, 4], id: \.self) { Text("\($0) beat\($0 == 1 ? "" : "s")").tag($0) } }
                    Stepper("Tempo · \(bpm) BPM", value: $bpm, in: 40...200)
                }
                Section("Input setup") {
                    Picker("Input", selection: $inputMode) {
                        Text("Touch pads").tag("Touch pads")
                        Text("Microphone · one voice").tag("Microphone")
                        Text("MIDI drum kit").tag("MIDI")
                    }
                    Text(inputMode == "Touch pads"
                         ? "Touch scoring works without permissions or extra equipment."
                         : inputMode == "Microphone"
                            ? "Choose one drum voice. Drum Hero detects level changes on this device and does not record or save audio. Use headphones to reduce playback bleed."
                            : "Connect a USB or Bluetooth MIDI drum kit. Standard General MIDI drum notes are set by default and can be changed below.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if inputMode == "Microphone" {
                    Section("Microphone setup") {
                        Picker("Score this voice", selection: $microphoneVoice) {
                            ForEach(DrumVoice.allCases) { Text($0.title).tag($0) }
                        }
                        Button(microphoneInput.isListening ? "Stop microphone input" : "Enable microphone input",
                               systemImage: microphoneInput.isListening ? "mic.slash" : "mic") {
                            if microphoneInput.isListening {
                                microphoneInput.stop()
                            } else {
                                Task {
                                    try? await microphoneInput.start(voice: microphoneVoice) { voice, at in
                                        controller.hit(voice, at: at,
                                                       correctionMs: UserDefaults.standard.double(forKey: "drumHero.nativeInputOffset.microphone"))
                                    }
                                }
                            }
                        }
                        Button("Measure room noise", systemImage: "waveform.path") {
                            Task { await microphoneInput.calibrateRoomNoise() }
                        }.disabled(!microphoneInput.isListening)
                        LabeledContent("Sensitivity threshold", value: String(format: "%.3f", microphoneInput.threshold))
                        Slider(value: $microphoneSensitivity, in: 0.005...0.2)
                            .onChange(of: microphoneSensitivity) { _, value in microphoneInput.setSensitivity(value) }
                            .accessibilityLabel("Microphone sensitivity")
                        Text(microphoneInput.status).font(.caption).foregroundStyle(.secondary)
                            .accessibilityIdentifier("trainer.microphone.status")
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }
                if inputMode == "MIDI" {
                    Section("MIDI setup") {
                        Button("Refresh MIDI devices", systemImage: "arrow.clockwise") {
                            let sources = midiInput.refreshAvailableSources()
                            if !sources.contains(where: { $0.id == selectedMidiSourceID }) { selectedMidiSourceID = sources.first?.id ?? "" }
                        }
                        if !midiInput.availableSources.isEmpty {
                            Picker("MIDI device", selection: $selectedMidiSourceID) {
                                ForEach(midiInput.availableSources) { source in Text(source.name).tag(source.id) }
                            }
                            Button("Connect selected device", systemImage: "cable.connector", action: connectSelectedMIDI)
                        }
                        Text(midiInput.status).font(.caption).foregroundStyle(.secondary)
                            .accessibilityIdentifier("trainer.midi.status")
                            .accessibilityAddTraits(.updatesFrequently)
                        DisclosureGroup("Drum note mapping") {
                            ForEach(DrumVoice.allCases) { voice in
                                Picker("\(voice.title) note", selection: Binding(
                                    get: { midiInput.noteNumbers[voice] ?? 0 },
                                    set: { _ = midiInput.setNote($0, for: voice) }
                                )) {
                                    ForEach(0...127, id: \.self) { note in Text("\(note)").tag(note) }
                                }.pickerStyle(.menu)
                            }
                            Button("Restore standard drum notes") { midiInput.restoreDefaultNotes() }
                        }
                    }
                }
                Section("Timing correction") {
                    LabeledContent("Current input correction", value: "\(Int(inputMode == "MIDI" ? midiInputOffsetMs : inputMode == "Microphone" ? microphoneInputOffsetMs : touchInputOffsetMs)) ms")
                    if inputMode == "MIDI" {
                        Slider(value: Binding(get: { midiInputOffsetMs }, set: { NativeMIDICalibration.save($0, for: selectedMidiSourceID) }), in: -250...250, step: 5).accessibilityLabel("Selected MIDI device timing correction")
                    } else if inputMode == "Microphone" {
                        Slider(value: $microphoneInputOffsetMs, in: -250...250, step: 5).accessibilityLabel("Input timing correction")
                    } else {
                        Slider(value: $touchInputOffsetMs, in: -250...250, step: 5).accessibilityLabel("Input timing correction")
                    }
                    Text("Positive values move detected hits earlier in scoring. Tune this on the current device with a short scored round; this is a personal correction, not a certified latency measurement.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    if controller.status == .idle || (controller.status == .complete && !pendingRating) {
                        Button("Start round", systemImage: "play.fill") { beginRound() }.disabled(savedRound)
                    } else if controller.status == .paused {
                        Button("Resume", systemImage: "play.fill") { controller.resume() }
                    } else {
                        Button("Pause", systemImage: "pause.fill") { controller.pause() }
                    }
                    if controller.status != .idle { Button("Reset round", systemImage: "arrow.counterclockwise", role: .destructive) { resetRound() } }
                }
                if controller.status == .countIn || controller.status == .playing || controller.status == .paused {
                    Section("Repetition") {
                        Text(mode == "Scored" ? "Repetition \(min(repetitions, controller.playhead / max(1, pattern.totalSteps) + 1)) of \(repetitions)" : "Repetition \(ratings.count + 1) of \(repetitions)")
                        Text(controller.status == .countIn ? "Count in · \(controller.playhead + 1)" : controller.status == .paused ? "Paused" : "Step \(controller.playhead + 1) of \(pattern.totalSteps)")
                        if controller.status == .playing && inputMode == "Touch pads" {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
                                ForEach(visibleVoices) { voice in
                                    Button(voice.title) { controller.hit(voice, correctionMs: touchInputOffsetMs) }
                                        .frame(maxWidth: .infinity, minHeight: 60)
                                        .buttonStyle(.bordered)
                                        .accessibilityLabel("\(voice.title) drum pad")
                                        .accessibilityHint("Tap to play and score the \(voice.title)")
                                        .accessibilityIdentifier("trainer.pad.\(voice.rawValue)")
                                }
                            }
                        } else if controller.status == .playing {
                            Text(inputMode == "Microphone" ? "Play the selected drum voice." : "Play the connected MIDI kit.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                if mode == "Self-rated" && !ratings.isEmpty {
                    Section("Ratings so far") { Text(ratings.map(\.title).joined(separator: " · ")) }
                }
                if let result = controller.result, mode == "Scored" {
                    Section("Round result") {
                        ResultCard(result: result)
                        Text(roundPracticeAdvice ?? "Repeat the pattern at a comfortable tempo.").font(.subheadline)
                            .accessibilityIdentifier("trainer.result.nextStep")
                    }
                }
                Section("Practice progress") {
                    Text(recentProgressSummary).font(.subheadline)
                    Text("Progress compares this pattern on the same input route and standard setup.").font(.caption).foregroundStyle(.secondary)
                }
                if controller.audioUnavailable { Section { Text("Audio unavailable; try visual counting and touch scoring.").foregroundStyle(.orange) } }
            }
            .navigationTitle("Trainer")
            .onAppear {
                if let id = initialPatternId, let selected = content.practicePatterns.first(where: { $0.id == id }) { patternID = id; bpm = min(220, max(40, initialBpm ?? selected.defaultBpm)) }
                if initialAdaptation == "hands-only" { adaptation = "Seated / no kick target" }
                if initialAdaptation == "single-voice" { adaptation = "One voice / reduced reach" }
            }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { LanguageSettingsButton() } }
            .confirmationDialog("How did that repetition feel?", isPresented: $pendingRating, titleVisibility: .visible) {
                ForEach(TrainerRating.allCases) { rating in Button(rating.title) { record(rating) } }
            }
            .onChange(of: controller.status) { oldValue, newValue in
                if mode == "Self-rated", oldValue == .playing, newValue == .complete { pendingRating = true }
                if mode == "Scored", oldValue == .playing, newValue == .complete { saveScoredRound() }
            }
            .onChange(of: patternID) { _, _ in
                if adaptation == "Seated / no kick target", !pattern.hits.contains(where: { $0.instrument != .kick }) { adaptation = "Standard pattern" }
                resetRound()
            }
            .onChange(of: skillFocus) { _, _ in
                if !visiblePatterns.contains(where: { $0.id == patternID }), let first = visiblePatterns.first {
                    patternID = first.id
                    bpm = first.defaultBpm
                }
                resetRound()
            }
            .onChange(of: mode) { _, _ in resetRound() }
            .onChange(of: adaptation) { _, _ in resetRound() }
            .onChange(of: adaptiveVoice) { _, _ in resetRound() }
            .onChange(of: repetitions) { _, _ in resetRound() }
            .onChange(of: countInBeats) { _, _ in resetRound() }
            .onChange(of: bpm) { _, _ in resetRound() }
            .onChange(of: inputMode) { _, newValue in
                if newValue != "Microphone" { microphoneInput.stop() }
                if newValue != "MIDI" { midiInput.stop() }
                resetRound()
            }
            .onChange(of: microphoneVoice) { _, voice in microphoneInput.setVoice(voice) }
            .onChange(of: selectedMidiSourceID) { _, _ in midiInput.stop(); resetRound() }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase != .active {
                    controller.stopForInterruption()
                    microphoneInput.stop()
                    midiInput.stop()
                }
            }
            .onDisappear { microphoneInput.stop(); midiInput.stop() }
        }
    }

    private func beginRound() {
        ratings = []; pendingRating = false; savedRound = false
        controller.start(pattern: roundPattern, bpm: bpm, repetitions: mode == "Scored" ? repetitions : 1,
                         countInBeats: countInBeats)
    }

    private func connectSelectedMIDI() {
        guard !selectedMidiSourceID.isEmpty else { return }
        midiInput.connectSelectedSource(selectedMidiSourceID) { voice, at, _, sourceID in
            controller.hit(voice, at: at, correctionMs: NativeMIDICalibration.correction(for: sourceID))
        }
    }

    private func record(_ rating: TrainerRating) {
        ratings.append(rating)
        if ratings.count >= repetitions {
            saveRound(TrainerRoundRecord(patternID: pattern.id, patternName: roundPattern.name, bpm: bpm,
                                         mode: adaptation == "Standard pattern" ? "self" : "self-adapted", repetitions: repetitions, ratings: ratings))
            savedRound = true
            return
        }
        controller.reset()
        controller.start(pattern: roundPattern, bpm: bpm, countInBeats: countInBeats)
    }

    private func saveScoredRound() {
        guard !savedRound, let result = controller.result else { return }
        if adaptation == "Standard pattern" {
            modelContext.insert(PracticeSessionRecord(result))
            let bestDescriptor = FetchDescriptor<PatternBestRecord>(predicate: #Predicate { $0.patternID == result.patternID })
            if let best = try? modelContext.fetch(bestDescriptor).first {
                if result.score > best.score { best.score = result.score; best.achievedAt = result.playedAt }
            } else {
                modelContext.insert(PatternBestRecord(patternID: pattern.id, patternName: pattern.name, score: result.score, achievedAt: result.playedAt))
            }
        }
        saveRound(TrainerRoundRecord(patternID: pattern.id, patternName: roundPattern.name, bpm: bpm,
                                     mode: adaptation == "Standard pattern" ? "scored" : "scored-adapted", repetitions: repetitions, ratings: [], score: result.score, accuracy: result.accuracy, inputProfile: inputMode == "MIDI" ? selectedMidiSourceID : inputMode == "Microphone" ? "microphone" : "touch", assessmentAdaptation: adaptation == "Standard pattern" ? "standard" : adaptation == "Seated / no kick target" ? "hands-only" : "single-voice", timingCorrectionMs: activeInputCorrectionMs, timingCalibrated: activeInputCalibrated))
        let descriptor = FetchDescriptor<PracticeSessionRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)])
        if let all = try? modelContext.fetch(descriptor) { for stale in all.dropFirst(50) { modelContext.delete(stale) } }
        let rounds = FetchDescriptor<TrainerRoundRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)])
        if let all = try? modelContext.fetch(rounds) { for stale in all.dropFirst(50) { modelContext.delete(stale) } }
        savedRound = true
    }

    private func saveRound(_ round: TrainerRoundRecord) {
        modelContext.insert(round)
        let rounds = FetchDescriptor<TrainerRoundRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)])
        if let all = try? modelContext.fetch(rounds) { for stale in all.dropFirst(50) { modelContext.delete(stale) } }
    }

    private func resetRound() {
        controller.reset(); ratings = []; pendingRating = false; savedRound = false
    }
}

enum MobileBackupError: LocalizedError {
    case unsupportedFormat
    case oversized
    case invalidRecords

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat: "This backup version is not supported by this app."
        case .oversized: "This backup file is larger than 64 MB."
        case .invalidRecords: "The backup contains records that do not match this app’s lessons or patterns."
        }
    }
}

struct MobileBackupLesson: Codable {
    let lessonID: String
    let completedAt: Date?
    let checkpoint: String
    let updatedAt: Date

    init(_ record: LessonProgressRecord) {
        lessonID = record.lessonID
        completedAt = record.completedAt
        checkpoint = record.checkpoint
        updatedAt = record.updatedAt
    }

    func makeRecord() -> LessonProgressRecord {
        LessonProgressRecord(lessonID: lessonID, checkpoint: checkpoint, completedAt: completedAt, updatedAt: updatedAt)
    }
}

struct MobileBackupPractice: Codable {
    let result: PracticeResult

    init(_ record: PracticeSessionRecord) {
        result = PracticeResult(id: record.id, patternID: record.patternID, patternName: record.patternName, bpm: record.bpm,
                                playedAt: record.playedAt, score: record.score, accuracy: record.accuracy, great: record.great,
                                good: record.good, miss: record.miss, extra: record.extra, maxCombo: record.maxCombo)
    }

    func makeRecord() -> PracticeSessionRecord { PracticeSessionRecord(result) }
}

struct MobileBackupBest: Codable {
    let patternID: String
    let patternName: String
    let score: Int
    let achievedAt: Date

    init(_ record: PatternBestRecord) {
        patternID = record.patternID
        patternName = record.patternName
        score = record.score
        achievedAt = record.achievedAt
    }

    func makeRecord() -> PatternBestRecord {
        PatternBestRecord(patternID: patternID, patternName: patternName, score: score, achievedAt: achievedAt)
    }
}

struct MobileBackupTrainerRound: Codable {
    let id: String
    let patternID: String
    let patternName: String
    let bpm: Int
    let playedAt: Date
    let mode: String
    let repetitions: Int
    let ratings: [TrainerRating]
    let score: Int?
    let accuracy: Int?
    let inputProfile: String?
    let assessmentAdaptation: String?
    let timingCorrectionMs: Double?
    let timingCalibrated: Bool?

    init(_ record: TrainerRoundRecord) {
        id = record.id
        patternID = record.patternID
        patternName = record.patternName
        bpm = record.bpm
        playedAt = record.playedAt
        mode = record.mode
        repetitions = record.repetitions
        ratings = record.ratings
        score = record.score
        accuracy = record.accuracy
        inputProfile = record.inputProfile
        assessmentAdaptation = record.assessmentAdaptation
        timingCorrectionMs = record.timingCorrectionMs
        timingCalibrated = record.timingCalibrated
    }

    func makeRecord() -> TrainerRoundRecord {
        TrainerRoundRecord(id: id, patternID: patternID, patternName: patternName, bpm: bpm, playedAt: playedAt,
                           mode: mode, repetitions: repetitions, ratings: ratings, score: score, accuracy: accuracy, inputProfile: inputProfile, assessmentAdaptation: assessmentAdaptation, timingCorrectionMs: timingCorrectionMs, timingCalibrated: timingCalibrated)
    }
}

struct MobileBackupSong: Codable {
    let song: MobileSong
    let createdAt: Date
    let updatedAt: Date

    init(_ record: PersonalSongRecord) throws {
        guard let song = record.song else { throw MobileBackupError.invalidRecords }
        _ = try MobileSongProjectCodec.encode(song)
        self.song = song
        createdAt = record.createdAt
        updatedAt = record.updatedAt
    }

    func makeRecord() throws -> PersonalSongRecord {
        PersonalSongRecord(song: song, data: try MobileSongProjectCodec.encode(song),
                           createdAt: createdAt, updatedAt: updatedAt)
    }
}

struct MobileProgressBackup: Codable {
    let app: String
    let schemaVersion: Int
    let exportedAt: Date
    let lessonProgress: [MobileBackupLesson]
    let practiceSessions: [MobileBackupPractice]
    let patternBests: [MobileBackupBest]
    let trainerRounds: [MobileBackupTrainerRound]
    let personalSongs: [MobileBackupSong]
    let sightReadingAttempts: [SightAttempt]?
    let sightReadingGoal: SightGoal?
    let assessment: AssessmentStore?

    init(lessonProgress: [LessonProgressRecord], practiceSessions: [PracticeSessionRecord], patternBests: [PatternBestRecord],
         trainerRounds: [TrainerRoundRecord], personalSongs: [PersonalSongRecord] = []) {
        app = "drum-hero-ios"
        schemaVersion = 2
        exportedAt = .now
        self.lessonProgress = lessonProgress.map(MobileBackupLesson.init)
        self.practiceSessions = practiceSessions.map(MobileBackupPractice.init)
        self.patternBests = patternBests.map(MobileBackupBest.init)
        self.trainerRounds = trainerRounds.map(MobileBackupTrainerRound.init)
        self.personalSongs = personalSongs.compactMap { try? MobileBackupSong($0) }
        self.sightReadingAttempts = SightHistory.read()
        self.sightReadingGoal = SightHistory.readGoal()
        self.assessment = AssessmentHistory.read()
    }

    private init(app: String, schemaVersion: Int, exportedAt: Date, lessonProgress: [MobileBackupLesson],
                 practiceSessions: [MobileBackupPractice], patternBests: [MobileBackupBest],
                 trainerRounds: [MobileBackupTrainerRound], personalSongs: [MobileBackupSong]) {
        self.app = app
        self.schemaVersion = schemaVersion
        self.exportedAt = exportedAt
        self.lessonProgress = lessonProgress
        self.practiceSessions = practiceSessions
        self.patternBests = patternBests
        self.trainerRounds = trainerRounds
        self.personalSongs = personalSongs
        self.sightReadingAttempts = []
        self.sightReadingGoal = nil
        self.assessment = nil
    }

    static var empty: MobileProgressBackup {
        MobileProgressBackup(app: "drum-hero-ios", schemaVersion: 2, exportedAt: .now, lessonProgress: [],
                             practiceSessions: [], patternBests: [], trainerRounds: [], personalSongs: [])
    }

    private enum CodingKeys: String, CodingKey {
        case app, schemaVersion, exportedAt, lessonProgress, practiceSessions, patternBests, trainerRounds, personalSongs, sightReadingAttempts, sightReadingGoal, assessment
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        app = try values.decode(String.self, forKey: .app)
        schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
        exportedAt = try values.decode(Date.self, forKey: .exportedAt)
        lessonProgress = try values.decode([MobileBackupLesson].self, forKey: .lessonProgress)
        practiceSessions = try values.decode([MobileBackupPractice].self, forKey: .practiceSessions)
        patternBests = try values.decode([MobileBackupBest].self, forKey: .patternBests)
        trainerRounds = try values.decode([MobileBackupTrainerRound].self, forKey: .trainerRounds)
        assessment = try values.decodeIfPresent(AssessmentStore.self, forKey: .assessment)
        sightReadingAttempts = try values.decodeIfPresent([SightAttempt].self, forKey: .sightReadingAttempts)
        sightReadingGoal = try values.decodeIfPresent(SightGoal.self, forKey: .sightReadingGoal)
        // Older backups do not include songs. Version 2 must include the field
        // so a truncated file cannot silently clear the local Song Library.
        personalSongs = schemaVersion >= 2
            ? try values.decode([MobileBackupSong].self, forKey: .personalSongs)
            : []
    }

    func validate(content: MobileContentDocument) throws {
        guard app == "drum-hero-ios", [1, 2].contains(schemaVersion) else { throw MobileBackupError.unsupportedFormat }
        if let rows = sightReadingAttempts { guard rows.count <= 100, rows.allSatisfy(\.valid), Set(rows.map(\.id)).count == rows.count else { throw MobileBackupError.invalidRecords } }
        if let goal = sightReadingGoal { guard goal.valid else { throw MobileBackupError.invalidRecords } }
        if let assessment { guard assessment.valid(try AssessmentContent.load()) else { throw MobileBackupError.invalidRecords } }
        let lessonIDs = Set(content.lessons.map(\.id))
        let patternIDs = Set(content.practicePatterns.map(\.id))
        let validName: (String) -> Bool = { !$0.isEmpty && $0.count <= 200 }
        guard lessonProgress.count <= content.lessons.count,
              Set(lessonProgress.map(\.lessonID)).count == lessonProgress.count,
              lessonProgress.allSatisfy({ lessonIDs.contains($0.lessonID) && $0.checkpoint.count <= 2_000 }),
              practiceSessions.count <= 50,
              Set(practiceSessions.map(\.result.id)).count == practiceSessions.count,
              practiceSessions.allSatisfy({ item in
                  let result = item.result
                  return !result.id.isEmpty && result.id.count <= 120 && patternIDs.contains(result.patternID) && validName(result.patternName) &&
                      (40...200).contains(result.bpm) && (0...100).contains(result.score) && (0...100).contains(result.accuracy) &&
                      [result.great, result.good, result.miss, result.extra, result.maxCombo].allSatisfy { $0 >= 0 }
              }),
              patternBests.count <= content.practicePatterns.count,
              Set(patternBests.map(\.patternID)).count == patternBests.count,
              patternBests.allSatisfy({ patternIDs.contains($0.patternID) && validName($0.patternName) && (0...100).contains($0.score) }),
              trainerRounds.count <= 50,
              Set(trainerRounds.map(\.id)).count == trainerRounds.count,
              trainerRounds.allSatisfy({ item in
                  !item.id.isEmpty && item.id.count <= 120 && patternIDs.contains(item.patternID) && validName(item.patternName) &&
                      (40...200).contains(item.bpm) && ["self", "scored", "self-adapted", "scored-adapted"].contains(item.mode) &&
                      (1...32).contains(item.repetitions) && item.ratings.count <= item.repetitions &&
                      (item.score.map { (0...100).contains($0) } ?? true) && (item.accuracy.map { (0...100).contains($0) } ?? true) &&
                      (item.timingCorrectionMs.map { $0.isFinite && abs($0) <= 250 } ?? true)
              }) else { throw MobileBackupError.invalidRecords }

        guard (schemaVersion == 2 || personalSongs.isEmpty), personalSongs.count <= 20,
              Set(personalSongs.map(\.song.id)).count == personalSongs.count else {
            throw MobileBackupError.invalidRecords
        }
        var songBytes = 0
        for item in personalSongs {
            guard item.song.id.count <= 100 else { throw MobileBackupError.invalidRecords }
            songBytes += try MobileSongProjectCodec.encode(item.song).count
            guard songBytes <= 60 * 1_024 * 1_024 else { throw MobileBackupError.oversized }
        }
    }

    @MainActor
    func restore(content: MobileContentDocument, in modelContext: ModelContext) throws {
        try validate(content: content)

        let lessonRecords = try modelContext.fetch(FetchDescriptor<LessonProgressRecord>())
        let practiceRecords = try modelContext.fetch(FetchDescriptor<PracticeSessionRecord>())
        let bestRecords = try modelContext.fetch(FetchDescriptor<PatternBestRecord>())
        let trainerRecords = try modelContext.fetch(FetchDescriptor<TrainerRoundRecord>())
        let personalSongRecords = schemaVersion >= 2 ? try modelContext.fetch(FetchDescriptor<PersonalSongRecord>()) : []

        let lessonsByID = Dictionary(uniqueKeysWithValues: lessonRecords.map { ($0.lessonID, $0) })
        let incomingLessonIDs = Set(lessonProgress.map(\.lessonID))
        for item in lessonProgress {
            if let record = lessonsByID[item.lessonID] {
                record.completedAt = item.completedAt
                record.checkpoint = item.checkpoint
                record.updatedAt = item.updatedAt
            } else {
                modelContext.insert(item.makeRecord())
            }
        }
        for record in lessonRecords where !incomingLessonIDs.contains(record.lessonID) { modelContext.delete(record) }

        let practiceByID = Dictionary(uniqueKeysWithValues: practiceRecords.map { ($0.id, $0) })
        let incomingPracticeIDs = Set(practiceSessions.map(\.result.id))
        for item in practiceSessions {
            let result = item.result
            if let record = practiceByID[result.id] {
                record.patternID = result.patternID
                record.patternName = result.patternName
                record.bpm = result.bpm
                record.playedAt = result.playedAt
                record.score = result.score
                record.accuracy = result.accuracy
                record.great = result.great
                record.good = result.good
                record.miss = result.miss
                record.extra = result.extra
                record.maxCombo = result.maxCombo
            } else {
                modelContext.insert(item.makeRecord())
            }
        }
        for record in practiceRecords where !incomingPracticeIDs.contains(record.id) { modelContext.delete(record) }

        let bestsByID = Dictionary(uniqueKeysWithValues: bestRecords.map { ($0.patternID, $0) })
        let incomingBestIDs = Set(patternBests.map(\.patternID))
        for item in patternBests {
            if let record = bestsByID[item.patternID] {
                record.patternName = item.patternName
                record.score = item.score
                record.achievedAt = item.achievedAt
            } else {
                modelContext.insert(item.makeRecord())
            }
        }
        for record in bestRecords where !incomingBestIDs.contains(record.patternID) { modelContext.delete(record) }

        let trainerByID = Dictionary(uniqueKeysWithValues: trainerRecords.map { ($0.id, $0) })
        let incomingTrainerIDs = Set(trainerRounds.map(\.id))
        for item in trainerRounds {
            if let record = trainerByID[item.id] {
                record.patternID = item.patternID
                record.patternName = item.patternName
                record.bpm = item.bpm
                record.playedAt = item.playedAt
                record.mode = item.mode
                record.repetitions = item.repetitions
                record.ratingsData = (try? JSONEncoder().encode(item.ratings)) ?? Data()
                record.score = item.score
                record.accuracy = item.accuracy
                record.inputProfile = item.inputProfile
                record.assessmentAdaptation = item.assessmentAdaptation
            } else {
                modelContext.insert(item.makeRecord())
            }
        }
        for record in trainerRecords where !incomingTrainerIDs.contains(record.id) { modelContext.delete(record) }

        if schemaVersion >= 2 {
            let songsByID = Dictionary(uniqueKeysWithValues: personalSongRecords.map { ($0.id, $0) })
            let incomingSongIDs = Set(personalSongs.map(\.song.id))
            for item in personalSongs {
                let encoded = try MobileSongProjectCodec.encode(item.song)
                if let record = songsByID[item.song.id] {
                    record.title = item.song.title
                    record.artist = item.song.artist
                    record.difficulty = item.song.difficulty
                    record.bpm = item.song.bpm
                    record.meter = item.song.meter
                    record.songData = encoded
                    record.createdAt = item.createdAt
                    record.updatedAt = item.updatedAt
                } else {
                    modelContext.insert(try item.makeRecord())
                }
            }
            for record in personalSongRecords where !incomingSongIDs.contains(record.id) { modelContext.delete(record) }
        }

        do {
            try modelContext.save()
            if let rows = sightReadingAttempts { try SightHistory.write(rows) }
            if let goal = sightReadingGoal { try SightHistory.writeGoal(goal) }
            if let assessment { try AssessmentHistory.write(assessment) }
        } catch {
            modelContext.rollback()
            throw error
        }
    }
}

private struct MobileProgressBackupDocument: FileDocument {
    static let maximumBytes = 64 * 1_024 * 1_024
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }
    var backup: MobileProgressBackup

    init(backup: MobileProgressBackup) { self.backup = backup }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents, data.count <= Self.maximumBytes else { throw MobileBackupError.oversized }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        backup = try decoder.decode(MobileProgressBackup.self, from: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(backup)
        guard data.count <= Self.maximumBytes else { throw MobileBackupError.oversized }
        return FileWrapper(regularFileWithContents: data)
    }
}

private struct PortableLessonCompletion: Codable, Hashable {
    var id: String
    var completedAt: String?
}

private struct PortablePracticeSession: Codable, Hashable {
    var id: String
    var patternId: String
    var patternName: String
    var bpm: Int
    var playedAt: String
    var score: Int
    var accuracy: Int
    var great: Int
    var good: Int
    var miss: Int
    var extra: Int
    var maxCombo: Int
}

private struct PortableGuidedPracticeStep: Codable, Hashable {
    var id: String
    var title: String
    var reason: String
    var patternId: String
    var patternName: String
    var minutes: Int
    var href: String
}

private struct PortableGuidedPracticeSession: Codable, Hashable {
    var version: Int
    var id: String
    var createdAt: String
    var steps: [PortableGuidedPracticeStep]
    var completedStepIds: [String]
    var skippedStepIds: [String]
    var elapsedMs: Int
    var runStartedAt: Double?
    var completedAt: String?

    func paused(at now: Date = .now) -> Self {
        var copy = self
        if let runStartedAt {
            let elapsedSinceStart = min(86_400_000.0, max(0, now.timeIntervalSince1970 * 1_000 - runStartedAt))
            copy.elapsedMs = min(86_400_000, elapsedMs + Int(elapsedSinceStart))
        }
        copy.runStartedAt = nil
        return copy
    }

    func isValid() -> Bool {
        let ids = Set(steps.map(\.id))
        let completed = Set(completedStepIds)
        let skipped = Set(skippedStepIds)
        let validPath: (String) -> Bool = { $0.hasPrefix("/trainer?") || $0.hasPrefix("/practice?") }
        return version == 1 && !id.isEmpty && id.count <= 120 && parsePortableTransferDate(createdAt) != nil &&
            !steps.isEmpty && steps.count <= 8 && ids.count == steps.count && elapsedMs >= 0 && elapsedMs <= 86_400_000 &&
            (runStartedAt == nil || runStartedAt!.isFinite) && (completedAt == nil || parsePortableTransferDate(completedAt!) != nil) &&
            steps.allSatisfy { !$0.id.isEmpty && $0.id.count <= 100 && $0.title.count <= 100 && $0.reason.count <= 300 &&
                !$0.patternId.isEmpty && $0.patternId.count <= 200 && $0.patternName.count <= 200 && (1...60).contains($0.minutes) && validPath($0.href) } &&
            completed.union(skipped).isSubset(of: ids) && completed.isDisjoint(with: skipped) &&
            (completedAt == nil || completed.union(skipped).count == ids.count)
    }

    var remainingSteps: [PortableGuidedPracticeStep] {
        steps.filter { !completedStepIds.contains($0.id) && !skippedStepIds.contains($0.id) }
    }
}

private struct PortableWeeklyGoal: Codable, Hashable {
    var version: Int
    var type: String
    var target: Int
    var focus: String

    func isValid() -> Bool {
        version == 1 && ["days", "lessons", "focus"].contains(type) && (1...7).contains(target) &&
            ["timing", "listening", "reading", "creative", "songs"].contains(focus)
    }
}

private func parsePortableTransferDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)
}

private struct MobileProgressTransfer: Codable {
    static let formatID = "drum-hero-progress-transfer-v1"
    static let maximumBytes = 4 * 1_024 * 1_024
    var application: String
    var format: String
    var version: Int
    var exportedAt: String
    var completedLessons: [PortableLessonCompletion]
    var practiceSessions: [PortablePracticeSession]
    var bestScores: [String: Int]
    var preferredBpm: Int
    var guidedPracticeSession: PortableGuidedPracticeSession?
    var weeklyGoal: PortableWeeklyGoal?

    init(lessonProgress: [LessonProgressRecord], practiceSessions: [PracticeSessionRecord], bests: [PatternBestRecord], preferredBpm: Int,
         guidedPracticeSession: PortableGuidedPracticeSession? = nil, weeklyGoal: PortableWeeklyGoal? = nil) {
        let formatter = ISO8601DateFormatter()
        application = "Drum Hero"
        format = Self.formatID
        version = 1
        exportedAt = formatter.string(from: .now)
        completedLessons = lessonProgress.compactMap { record in
            guard let completedAt = record.completedAt else { return nil }
            return PortableLessonCompletion(id: record.lessonID, completedAt: formatter.string(from: completedAt))
        }
        self.practiceSessions = practiceSessions.prefix(50).map { record in
            PortablePracticeSession(id: record.id, patternId: record.patternID, patternName: record.patternName,
                                    bpm: record.bpm, playedAt: formatter.string(from: record.playedAt), score: record.score,
                                    accuracy: record.accuracy, great: record.great, good: record.good, miss: record.miss,
                                    extra: record.extra, maxCombo: record.maxCombo)
        }
        bestScores = Dictionary(uniqueKeysWithValues: bests.map { ($0.patternID, $0.score) })
        self.preferredBpm = min(200, max(40, preferredBpm))
        self.guidedPracticeSession = guidedPracticeSession?.paused()
        self.weeklyGoal = weeklyGoal
    }

    func review(content: MobileContentDocument) throws -> MobileProgressTransferReview {
        let validDate: (String) -> Bool = { value in parsePortableTransferDate(value) != nil }
        guard application == "Drum Hero", format == Self.formatID, version == 1,
              validDate(exportedAt), (40...200).contains(preferredBpm),
              completedLessons.count <= 100, practiceSessions.count <= 100,
              guidedPracticeSession?.isValid() ?? true, weeklyGoal?.isValid() ?? true,
              bestScores.count <= 256, bestScores.allSatisfy({ !$0.key.isEmpty && $0.key.count <= 160 && (0...100).contains($0.value) }),
              Set(completedLessons.map(\.id)).count == completedLessons.count,
              Set(practiceSessions.map(\.id)).count == practiceSessions.count,
              completedLessons.allSatisfy({ !$0.id.isEmpty && $0.id.count <= 120 && ($0.completedAt.map(validDate) ?? true) }),
              practiceSessions.allSatisfy({ item in
                  !item.id.isEmpty && item.id.count <= 120 && !item.patternId.isEmpty && item.patternId.count <= 160 &&
                      !item.patternName.isEmpty && item.patternName.count <= 200 && (40...200).contains(item.bpm) &&
                      validDate(item.playedAt) && (0...100).contains(item.score) && (0...100).contains(item.accuracy) &&
                      [item.great, item.good, item.miss, item.extra, item.maxCombo].allSatisfy { (0...100_000).contains($0) }
              }) else { throw MobileBackupError.invalidRecords }

        let lessonIDs = Set(content.lessons.map(\.id))
        let patternIDs = Set(content.practicePatterns.map(\.id))
        return MobileProgressTransferReview(
            transfer: self,
            lessons: completedLessons.filter { lessonIDs.contains($0.id) },
            sessions: practiceSessions.filter { patternIDs.contains($0.patternId) },
            bestScores: bestScores.filter { patternIDs.contains($0.key) },
            ignoredLessons: completedLessons.filter { !lessonIDs.contains($0.id) }.count,
            ignoredSessions: practiceSessions.filter { !patternIDs.contains($0.patternId) }.count,
            ignoredBests: bestScores.keys.filter { !patternIDs.contains($0) }.count
        )
    }
}

private enum MobileProgressTransferError: LocalizedError {
    case tooLarge
    var errorDescription: String? { "This progress transfer is larger than 4 MB." }
}

private struct MobileProgressTransferReview {
    var transfer: MobileProgressTransfer
    var lessons: [PortableLessonCompletion]
    var sessions: [PortablePracticeSession]
    var bestScores: [String: Int]
    var ignoredLessons: Int
    var ignoredSessions: Int
    var ignoredBests: Int
}

private struct MobileProgressTransferDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }
    let data: Data

    init(transfer: MobileProgressTransfer) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        data = try encoder.encode(transfer)
        guard data.count <= MobileProgressTransfer.maximumBytes else { throw MobileProgressTransferError.tooLarge }
    }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents,
              contents.count <= MobileProgressTransfer.maximumBytes else { throw MobileProgressTransferError.tooLarge }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

struct ProgressViewScreen: View {
    let content: MobileContentDocument
    @Environment(\.modelContext) private var modelContext
    @AppStorage("drumHero.practiceBpm") private var preferredBpm = 80
    @AppStorage("drumHero.guidedPracticeSessionJSON") private var guidedPracticeSessionJSON = ""
    @AppStorage("drumHero.weeklyGoalJSON") private var weeklyGoalJSON = ""
    @Query private var lessonProgress: [LessonProgressRecord]
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var sessions: [PracticeSessionRecord]
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var rounds: [TrainerRoundRecord]
    @Query private var bests: [PatternBestRecord]
    @Query(sort: \PersonalSongRecord.updatedAt, order: .reverse) private var personalSongs: [PersonalSongRecord]
    @State private var exportDocument = MobileProgressBackupDocument(backup: .empty)
    @State private var isExporting = false
    @State private var isImporting = false
    @State private var confirmingImport = false
    @State private var pendingImport: MobileProgressBackup?
    @State private var transferDocument: MobileProgressTransferDocument?
    @State private var isTransferExporting = false
    @State private var isTransferImporting = false
    @State private var confirmingTransfer = false
    @State private var pendingTransfer: MobileProgressTransferReview?
    @State private var backupMessage = ""

    private var decodedGuidedPracticeSession: PortableGuidedPracticeSession? {
        guard let data = guidedPracticeSessionJSON.data(using: .utf8),
              let session = try? JSONDecoder().decode(PortableGuidedPracticeSession.self, from: data),
              session.isValid() else { return nil }
        return session
    }

    private var decodedWeeklyGoal: PortableWeeklyGoal? {
        guard let data = weeklyGoalJSON.data(using: .utf8),
              let goal = try? JSONDecoder().decode(PortableWeeklyGoal.self, from: data),
              goal.isValid() else { return nil }
        return goal
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Skill assessment") { NavigationLink("Initial skill assessment and results") { InitialAssessmentView(content: content) } }
                Section("Lessons") {
                    let total = content.lessons.count
                    let completed = content.lessons.filter { lesson in
                        lessonProgress.contains { $0.lessonID == lesson.id && $0.completedAt != nil }
                    }.count
                    LabeledContent("Total lessons", value: "\(completed) of \(total)")
                    ForEach(LearnerLevel.allCases) { level in
                        let total = content.lessons.filter { $0.level == level }.count
                        let done = content.lessons.filter { lesson in lesson.level == level && lessonProgress.contains { $0.lessonID == lesson.id && $0.completedAt != nil } }.count
                        LabeledContent(level.rawValue, value: "\(done) of \(total)")
                        ProgressView(value: Double(done), total: Double(max(1, total))).tint(drumMint)
                    }
                }
                Section("Practice") {
                    LabeledContent("Practice sessions", value: "\(sessions.count)")
                    LabeledContent("Best score", value: "\(sessions.map(\.score).max() ?? 0)")
                    LabeledContent("Trainer rounds", value: "\(rounds.count)")
                    if let latest = sessions.first { LabeledContent("Last practiced", value: latest.playedAt.formatted(date: .abbreviated, time: .shortened)) }
                }
                Section("Guided practice") {
                    if let session = decodedGuidedPracticeSession {
                        Text(session.completedAt == nil ? "Saved guided session · \(session.remainingSteps.count) steps left" : "Last guided session complete")
                            .font(.headline)
                        if let step = session.remainingSteps.first { Text("Next: \(step.patternName) · \(step.minutes) min") }
                        Text("This session is carried in progress transfers and can be resumed in the web app.").font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Text("No guided session has been transferred to this device.").foregroundStyle(.secondary)
                    }
                    if let goal = decodedWeeklyGoal {
                        LabeledContent("Weekly goal", value: "\(goal.target) \(goal.type == "days" ? "practice days" : goal.type == "lessons" ? "lesson completions" : "\(goal.focus) sessions")")
                    } else {
                        Text("No weekly goal has been transferred to this device.").foregroundStyle(.secondary)
                    }
                }
                Section("Move learning progress between web and iOS") {
                    Text("Transfer completed lessons, recent scored sessions, best scores, preferred tempo, a paused guided session, and a weekly goal. Import merges progress and carries the guided settings to the active profile. Song projects use the separate single-song JSON export. These transfer files contain no audio; full backups are platform-specific.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button("Export learning progress transfer", systemImage: "square.and.arrow.up") {
                        do {
                            let transfer = MobileProgressTransfer(lessonProgress: lessonProgress, practiceSessions: sessions, bests: bests, preferredBpm: preferredBpm,
                                guidedPracticeSession: decodedGuidedPracticeSession, weeklyGoal: decodedWeeklyGoal)
                            transferDocument = try MobileProgressTransferDocument(transfer: transfer)
                            isTransferExporting = true
                        } catch { backupMessage = "Could not prepare the progress transfer: \(error.localizedDescription)" }
                    }
                    Button("Import learning progress transfer", systemImage: "square.and.arrow.down") { isTransferImporting = true }
                }
                Section("Local backup") {
                    Text("Save lesson checkpoints, practice sessions, Trainer rounds, best scores, and personal song projects as a versioned JSON file. Recordings and cloud data are not included.").font(.footnote).foregroundStyle(.secondary)
                    Button("Export progress backup", systemImage: "square.and.arrow.up") {
                        do {
                            let backup = MobileProgressBackup(lessonProgress: lessonProgress, practiceSessions: sessions,
                                                              patternBests: bests, trainerRounds: rounds, personalSongs: personalSongs)
                            guard backup.personalSongs.count == personalSongs.count else { throw MobileBackupError.invalidRecords }
                            exportDocument = MobileProgressBackupDocument(backup: backup)
                            isExporting = true
                        } catch { backupMessage = "Could not prepare the backup: \(error.localizedDescription)" }
                    }
                    Button("Import progress backup", systemImage: "square.and.arrow.down") { isImporting = true }
                    if !backupMessage.isEmpty { Text(backupMessage).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
                }
                if !sessions.isEmpty {
                    Section("Recent sessions") {
                        ForEach(sessions.prefix(20)) { session in
                            VStack(alignment: .leading) {
                                Text(session.patternName).font(.headline)
                                Text("\(session.accuracy)% accuracy · \(session.bpm) BPM · score \(session.score) · best combo \(session.maxCombo)")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text("Great \(session.great) · Good \(session.good) · Miss \(session.miss) · Extra \(session.extra)")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(session.playedAt.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }.accessibilityElement(children: .combine)
                        }
                    }
                }
                if !rounds.isEmpty {
                    Section("Recent Trainer rounds") {
                        ForEach(rounds.prefix(20)) { round in
                            let modeLabel = round.mode.contains("adapted") ? "Adapted" : (round.mode == "scored" ? "Scored" : "Self-rated")
                            let outcome = round.ratings.isEmpty
                                ? "Score \(round.score ?? 0) · \(round.accuracy ?? 0)% accuracy"
                                : round.ratings.map(\.title).joined(separator: " · ")
                            VStack(alignment: .leading) {
                                Text(round.patternName).font(.headline)
                                Text("\(modeLabel) · \(round.repetitions) repetitions · \(round.bpm) BPM")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(outcome).font(.caption).foregroundStyle(.secondary)
                                Text(round.playedAt.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }.accessibilityElement(children: .combine)
                        }
                    }
                }
            }.navigationTitle("Progress")
                .toolbar { ToolbarItem(placement: .topBarTrailing) { LanguageSettingsButton() } }
                .fileExporter(isPresented: $isExporting, document: exportDocument, contentType: .json, defaultFilename: "drum-hero-ios-progress") { result in
                    switch result {
                    case .success: backupMessage = "Progress backup exported."
                    case .failure(let error): backupMessage = error.localizedDescription
                    }
                }
                .fileExporter(isPresented: $isTransferExporting, document: transferDocument, contentType: .json, defaultFilename: "drum-hero-progress-transfer") { result in
                    switch result {
                    case .success: backupMessage = "Learning progress transfer exported. Import it on web or iOS to merge the shared lesson and practice history."
                    case .failure(let error): backupMessage = error.localizedDescription
                    }
                }
                .fileImporter(isPresented: $isImporting, allowedContentTypes: [.json], allowsMultipleSelection: false, onCompletion: readBackup)
                .fileImporter(isPresented: $isTransferImporting, allowedContentTypes: [.json], allowsMultipleSelection: false, onCompletion: readProgressTransfer)
                .confirmationDialog("Merge progress from this file?", isPresented: $confirmingTransfer, titleVisibility: .visible) {
                    Button("Merge into this device") { applyProgressTransfer() }
                    Button("Cancel", role: .cancel) { pendingTransfer = nil }
                } message: {
                    if let transfer = pendingTransfer {
                        Text("Merges up to \(transfer.lessons.count) lesson completions, \(transfer.sessions.count) scored sessions, and \(transfer.bestScores.count) best scores. Existing data stays; matching session IDs are updated. \(transfer.ignoredLessons + transfer.ignoredSessions + transfer.ignoredBests) records use IDs this app version does not recognize and will be skipped. Preferred tempo will be set to \(transfer.transfer.preferredBpm) BPM. \(transfer.transfer.guidedPracticeSession == nil ? "" : "The saved guided session will be replaced.") \(transfer.transfer.weeklyGoal == nil ? "" : "The weekly goal will be replaced.")")
                    }
                }
                .alert("Replace local progress?", isPresented: $confirmingImport) {
                    Button("Replace this device’s data", role: .destructive) { applyPendingBackup() }
                    Button("Cancel", role: .cancel) { pendingImport = nil }
                } message: {
                    if let backup = pendingImport {
                        Text(backup.schemaVersion >= 2
                             ? "This replaces lesson progress, practice sessions, Trainer rounds, best scores, and personal song projects on this device. The file contains \(backup.lessonProgress.count) lesson records, \(backup.practiceSessions.count) practice sessions, \(backup.trainerRounds.count) Trainer rounds, and \(backup.personalSongs.count) personal songs. Checkpoints are included; recordings and audio are not."
                             : "This replaces lesson progress, practice sessions, Trainer rounds, and best scores on this device. The file contains \(backup.lessonProgress.count) lesson records, \(backup.practiceSessions.count) practice sessions, and \(backup.trainerRounds.count) Trainer rounds. Personal songs on this device will be kept because this older backup does not contain them.")
                    }
                }
        }
    }

    private func readBackup(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let hasAccess = url.startAccessingSecurityScopedResource()
            defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
            let fileSize = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? (MobileProgressBackupDocument.maximumBytes + 1)
            guard fileSize <= MobileProgressBackupDocument.maximumBytes else { throw MobileBackupError.oversized }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard data.count <= MobileProgressBackupDocument.maximumBytes else { throw MobileBackupError.oversized }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let backup = try decoder.decode(MobileProgressBackup.self, from: data)
            try backup.validate(content: content)
            pendingImport = backup
            confirmingImport = true
            backupMessage = "Backup loaded for review. Confirm replacement to apply it."
        } catch { backupMessage = error.localizedDescription }
    }

    private func readProgressTransfer(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let hasAccess = url.startAccessingSecurityScopedResource()
            defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
            let fileSize = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? (MobileProgressTransfer.maximumBytes + 1)
            guard fileSize <= MobileProgressTransfer.maximumBytes else { throw MobileProgressTransferError.tooLarge }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard data.count <= MobileProgressTransfer.maximumBytes else { throw MobileProgressTransferError.tooLarge }
            let transfer = try JSONDecoder().decode(MobileProgressTransfer.self, from: data)
            pendingTransfer = try transfer.review(content: content)
            confirmingTransfer = true
            let sessionNote = transfer.guidedPracticeSession == nil ? "" : " A paused guided session is included."
            let goalNote = transfer.weeklyGoal == nil ? "" : " A weekly goal is included."
            backupMessage = "Progress transfer loaded for review. Your current data has not changed.\(sessionNote)\(goalNote)"
        } catch { backupMessage = error.localizedDescription }
    }

    private func applyProgressTransfer() {
        guard let transfer = pendingTransfer else { return }
        do {
            let currentLessons = try modelContext.fetch(FetchDescriptor<LessonProgressRecord>())
            let currentSessions = try modelContext.fetch(FetchDescriptor<PracticeSessionRecord>())
            let currentBests = try modelContext.fetch(FetchDescriptor<PatternBestRecord>())
            let lessonsByID = Dictionary(uniqueKeysWithValues: currentLessons.map { ($0.lessonID, $0) })
            let sessionsByID = Dictionary(uniqueKeysWithValues: currentSessions.map { ($0.id, $0) })
            var bestsByID = Dictionary(uniqueKeysWithValues: currentBests.map { ($0.patternID, $0) })
            var addedLessons = 0
            var addedSessions = 0

            for item in transfer.lessons {
                let completedAt = item.completedAt.flatMap(parsePortableTransferDate) ?? parsePortableTransferDate(transfer.transfer.exportedAt) ?? .now
                if let record = lessonsByID[item.id] {
                    if record.completedAt == nil { record.completedAt = completedAt; record.updatedAt = .now; addedLessons += 1 }
                } else {
                    modelContext.insert(LessonProgressRecord(lessonID: item.id, completedAt: completedAt))
                    addedLessons += 1
                }
            }

            let exportedAt = parsePortableTransferDate(transfer.transfer.exportedAt) ?? .now
            for (patternID, score) in transfer.bestScores {
                if let best = bestsByID[patternID] {
                    if score > best.score { best.score = score; best.achievedAt = exportedAt }
                } else {
                    let best = PatternBestRecord(patternID: patternID, patternName: patternID, score: score, achievedAt: exportedAt)
                    modelContext.insert(best)
                    bestsByID[patternID] = best
                }
            }

            for item in transfer.sessions {
                guard let playedAt = parsePortableTransferDate(item.playedAt) else { continue }
                let result = PracticeResult(id: item.id, patternID: item.patternId, patternName: item.patternName, bpm: item.bpm,
                                            playedAt: playedAt, score: item.score, accuracy: item.accuracy, great: item.great,
                                            good: item.good, miss: item.miss, extra: item.extra, maxCombo: item.maxCombo)
                if let record = sessionsByID[item.id] {
                    record.patternID = result.patternID
                    record.patternName = result.patternName
                    record.bpm = result.bpm
                    record.playedAt = result.playedAt
                    record.score = result.score
                    record.accuracy = result.accuracy
                    record.great = result.great
                    record.good = result.good
                    record.miss = result.miss
                    record.extra = result.extra
                    record.maxCombo = result.maxCombo
                } else {
                    modelContext.insert(PracticeSessionRecord(result))
                    addedSessions += 1
                }
                if let best = bestsByID[item.patternId] {
                    best.patternName = item.patternName
                    if item.score > best.score { best.score = item.score; best.achievedAt = playedAt }
                } else {
                    let best = PatternBestRecord(patternID: item.patternId, patternName: item.patternName, score: item.score, achievedAt: playedAt)
                    bestsByID[item.patternId] = best
                    modelContext.insert(best)
                }
            }

            let allSessions = try modelContext.fetch(FetchDescriptor<PracticeSessionRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)]))
            for stale in allSessions.dropFirst(50) { modelContext.delete(stale) }
            try modelContext.save()
            preferredBpm = transfer.transfer.preferredBpm
            if let session = transfer.transfer.guidedPracticeSession {
                let encoder = JSONEncoder()
                guidedPracticeSessionJSON = String(data: try encoder.encode(session.paused()), encoding: .utf8) ?? ""
            }
            if let goal = transfer.transfer.weeklyGoal {
                let encoder = JSONEncoder()
                weeklyGoalJSON = String(data: try encoder.encode(goal), encoding: .utf8) ?? ""
            }
            let guidedMessage = transfer.transfer.guidedPracticeSession == nil ? "" : " Guided session saved for web resume."
            let goalMessage = transfer.transfer.weeklyGoal == nil ? "" : " Weekly goal saved."
            backupMessage = "Merged \(addedLessons) lesson completions and \(addedSessions) new scored sessions, updated best scores, and set preferred tempo to \(preferredBpm) BPM. Existing records were kept.\(guidedMessage)\(goalMessage)"
        } catch {
            modelContext.rollback()
            backupMessage = "Could not merge this progress transfer: \(error.localizedDescription)"
        }
        pendingTransfer = nil
    }

    private func applyPendingBackup() {
        guard let backup = pendingImport else { return }
        do {
            try backup.restore(content: content, in: modelContext)
            backupMessage = "Local progress replaced from backup."
        } catch {
            backupMessage = "Could not restore this backup: \(error.localizedDescription)"
        }
        pendingImport = nil
    }
}
