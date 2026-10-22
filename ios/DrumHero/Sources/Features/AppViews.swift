import Foundation
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

private let drumMint = Color(red: 0.20, green: 0.73, blue: 0.63)

struct HomeView: View {
    let content: MobileContentDocument
    @Binding var tab: DrumHeroTab
    @Environment(\.locale) private var locale
    @Query private var progress: [LessonProgressRecord]
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var sessions: [PracticeSessionRecord]

    private var nextLesson: DrumLesson {
        content.lessons.sorted { $0.order < $1.order }.first { lesson in
            !progress.contains { $0.lessonID == lesson.id && $0.completedAt != nil }
        } ?? content.lessons[0]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your next beat starts here.").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                    Text("A focused place to learn, practise, and track your drumming.").foregroundStyle(.secondary)
                    Button { tab = .learn } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Continue learning", systemImage: "play.circle.fill").font(.headline)
                            Text(content.localized("lesson.\(nextLesson.id).title", fallback: nextLesson.title, locale: locale)).font(.title2.bold())
                            Text(content.localized("lesson.\(nextLesson.id).summary", fallback: nextLesson.summary, locale: locale)).foregroundStyle(.secondary)
                            Text("\(nextLesson.level.rawValue) · \(nextLesson.duration) min").font(.subheadline.weight(.semibold)).foregroundStyle(drumMint)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                    }.buttonStyle(.plain).accessibilityHint("Opens the lesson catalogue")
                    HStack(spacing: 12) {
                        StatCard(title: content.localized("Lessons", fallback: "Lessons", locale: locale), value: "\(progress.filter { $0.completedAt != nil }.count)/\(content.lessons.count)", symbol: "book")
                        StatCard(title: content.localized("Sessions", fallback: "Sessions", locale: locale), value: "\(sessions.count)", symbol: "waveform")
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(content.localized("Choose a session", fallback: "Choose a session", locale: locale)).font(.title2.bold())
                        HomeDestination(title: content.localized("dashboard.tool.practice.title", fallback: "Practice Pad", locale: locale), subtitle: content.localized("dashboard.tool.practice.description", fallback: "Train timing with five playable kit voices and honest feedback.", locale: locale), symbol: "circle.grid.3x3.fill") { tab = .practice }
                        HomeDestination(title: content.localized("dashboard.tool.trainer.title", fallback: "Trainer", locale: locale), subtitle: content.localized("dashboard.tool.trainer.description", fallback: "Practise with adjustable rounds, adaptive tempo, calibrated inputs, and setlist follow-along.", locale: locale), symbol: "metronome.fill") { tab = .trainer }
                    }
                }.padding()
            }.navigationTitle("Drum Hero").navigationBarTitleDisplayMode(.inline)
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
                Section {
                    Picker("Lesson level", selection: $level) {
                        Text("All levels").tag(LearnerLevel?.none)
                        ForEach(LearnerLevel.allCases) { item in Text(item.rawValue).tag(Optional(item)) }
                    }.pickerStyle(.segmented)
                }
                Section("Lessons") {
                    ForEach(lessons) { lesson in
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
    @State private var query = ""

    private var songs: [MobileSong] {
        content.songs.filter { song in
            query.isEmpty || "\(song.title) \(song.artist) \(song.tags.joined(separator: " ")) \(song.notes)".localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        List {
            Section {
                Text("Eight original song examples are available offline.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section("Song examples") {
                ForEach(songs) { song in
                    NavigationLink {
                        MobileSongDetailView(song: song, openPractice: openPractice)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(song.title).font(.headline)
                            Text("\(song.artist) · \(song.difficulty) · \(song.meter) · \(song.bpm) BPM")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(song.notes).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        }.padding(.vertical, 4)
                    }
                }
            }
            if songs.isEmpty {
                ContentUnavailableView.search(text: query)
            }
        }
        .searchable(text: $query, prompt: "Find a song")
        .navigationTitle("Song Library")
    }
}

private struct MobileSongDetailView: View {
    let song: MobileSong
    let openPractice: (PracticePattern) -> Void

    var body: some View {
        List {
            Section("Song details") {
                LabeledContent("Artist", value: song.artist)
                LabeledContent("Difficulty", value: song.difficulty)
                LabeledContent("Meter", value: song.meter)
                LabeledContent("Starting tempo", value: "\(song.bpm) BPM")
                if !song.tags.isEmpty { Text(song.tags.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
            }
            Section("About this original") { Text(song.notes) }
            ForEach(song.sections) { section in
                Section(section.name) {
                    ForEach(section.parts) { part in
                        Button {
                            openPractice(part.practicePattern(song: song, section: section))
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(part.name).font(.headline)
                                    Text("\(section.bpm ?? part.bpm) BPM").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Label("Practice", systemImage: "play.circle.fill")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(song.title)
        .navigationBarTitleDisplayMode(.inline)
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
                TextField("What would you like to remember?", text: $checkpoint, axis: .vertical).lineLimit(2...5)
                Button("Save checkpoint") {
                    let current = record ?? LessonProgressRecord(lessonID: lesson.id)
                    if record == nil { modelContext.insert(current) }
                    current.checkpoint = checkpoint
                    current.updatedAt = .now
                }
                Button(record?.completedAt == nil ? "Mark lesson complete" : "Lesson complete", systemImage: record?.completedAt == nil ? "checkmark.circle" : "checkmark.circle.fill") {
                    let current = record ?? LessonProgressRecord(lessonID: lesson.id)
                    if record == nil { modelContext.insert(current) }
                    current.completedAt = current.completedAt ?? .now
                    current.updatedAt = .now
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
                    if let selectedPattern, controller.status == .countIn || controller.status == .playing || controller.status == .paused {
                        PracticeActivePanel(pattern: selectedPattern, controller: controller)
                    }
                    HStack {
                        if controller.status == .idle || controller.status == .complete {
                            Button(controller.status == .complete ? "Try again" : "Start", systemImage: "play.fill") { if let selectedPattern { controller.start(pattern: selectedPattern, bpm: bpm) } }.buttonStyle(.borderedProminent).tint(drumMint)
                        } else if controller.status == .paused {
                            Button("Resume", systemImage: "play.fill") { controller.resume() }.buttonStyle(.borderedProminent).tint(drumMint)
                        } else {
                            Button("Pause", systemImage: "pause.fill") { controller.pause() }.buttonStyle(.borderedProminent)
                        }
                        if controller.status != .idle { Button("Reset", systemImage: "arrow.counterclockwise", role: .destructive) { controller.reset() }.buttonStyle(.bordered) }
                    }
                    if let result = controller.result { ResultCard(result: result) }
                    if !records.isEmpty {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Recent practice").font(.headline)
                            ForEach(records.prefix(3)) { record in Text("\(record.patternName) · \(record.accuracy)% · \(record.bpm) BPM").font(.subheadline).foregroundStyle(.secondary) }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                }.padding()
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
    }
}

private struct PracticeActivePanel: View {
    let pattern: PracticePattern
    @ObservedObject var controller: PracticeController

    private var statusText: String {
        if controller.status == .countIn { return "Count in · \(controller.playhead + 1)" }
        if controller.status == .paused { return "Paused" }
        return "Step \(controller.playhead + 1) of \(pattern.totalSteps)"
    }

    var body: some View {
        VStack(spacing: 16) {
            PracticePatternGrid(pattern: pattern, playhead: controller.playhead,
                                isPlaying: controller.status == .playing)
            Text(statusText).font(.headline).frame(maxWidth: .infinity).contentTransition(.numericText())
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
            ForEach(0..<max(1, pattern.totalSteps), id: \.self) { row in
                GridRow {
                    Text("\(row + 1)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 28)
                    ForEach(DrumVoice.allCases) { voice in
                        PatternGridCell(row: row, voice: voice,
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
    let hasTarget: Bool
    let isCurrent: Bool

    var body: some View {
        Circle()
            .fill(hasTarget ? drumMint : Color.secondary.opacity(0.12))
            .frame(height: 24)
            .overlay {
                if hasTarget { Text(String(voice.title.prefix(1))).font(.caption2.bold()).foregroundStyle(.black) }
            }
            .overlay { Circle().stroke(isCurrent ? Color.orange : Color.clear, lineWidth: 3) }
            .accessibilityLabel("Step \(row + 1), \(voice.title) \(hasTarget ? "target" : "rest")")
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
        .accessibilityIdentifier("pad.\(voice.rawValue)")
    }
}

private struct TempoControl: View {
    @Binding var bpm: Int

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text("Tempo")
                Spacer()
                Text("\(bpm) BPM").monospacedDigit().bold()
            }
            Slider(value: Binding(get: { Double(bpm) }, set: { bpm = Int($0.rounded()) }),
                   in: 40...200, step: 1)
                .accessibilityLabel("Tempo")
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

struct TrainerView: View {
    let content: MobileContentDocument
    @Environment(\.locale) private var locale
    @Environment(\.modelContext) private var modelContext
    @StateObject private var controller = PracticeController()
    @State private var patternID = "single-stroke"
    @State private var bpm = 70
    @State private var repetitions = 4
    @State private var countInBeats = 4
    @State private var mode = "Self-rated"
    @State private var adaptation = "Standard pattern"
    @State private var adaptiveVoice: DrumVoice = .snare
    @State private var ratings: [TrainerRating] = []
    @State private var pendingRating = false
    @State private var savedRound = false
    private var patterns: [PracticePattern] { content.rudiments + content.grooves }
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

    var body: some View {
        NavigationStack {
            Form {
                Section("Round setup") {
                    Picker("Pattern", selection: $patternID) { ForEach(patterns) { Text(content.localized("pattern.\($0.id).name", fallback: $0.name, locale: locale)).tag($0.id) } }
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
                        if controller.status == .playing {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
                                ForEach(visibleVoices) { voice in Button(voice.title) { controller.hit(voice) }.frame(maxWidth: .infinity, minHeight: 60).buttonStyle(.bordered).accessibilityIdentifier("trainer.pad.\(voice.rawValue)") }
                            }
                        }
                    }
                }
                if mode == "Self-rated" && !ratings.isEmpty {
                    Section("Ratings so far") { Text(ratings.map(\.title).joined(separator: " · ")) }
                }
                if let result = controller.result, mode == "Scored" { Section("Round result") { ResultCard(result: result) } }
                if controller.audioUnavailable { Section { Text("Audio unavailable; try visual counting and touch scoring.").foregroundStyle(.orange) } }
            }
            .navigationTitle("Trainer")
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
            .onChange(of: mode) { _, _ in resetRound() }
            .onChange(of: adaptation) { _, _ in resetRound() }
            .onChange(of: adaptiveVoice) { _, _ in resetRound() }
            .onChange(of: repetitions) { _, _ in resetRound() }
            .onChange(of: countInBeats) { _, _ in resetRound() }
            .onChange(of: bpm) { _, _ in resetRound() }
        }
    }

    private func beginRound() {
        ratings = []; pendingRating = false; savedRound = false
        controller.start(pattern: roundPattern, bpm: bpm, repetitions: mode == "Scored" ? repetitions : 1,
                         countInBeats: countInBeats)
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
                                     mode: adaptation == "Standard pattern" ? "scored" : "scored-adapted", repetitions: repetitions, ratings: [], score: result.score, accuracy: result.accuracy))
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

private enum MobileBackupError: LocalizedError {
    case unsupportedFormat
    case oversized
    case invalidRecords

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat: "This backup version is not supported by this app."
        case .oversized: "This backup file is larger than 1 MB."
        case .invalidRecords: "The backup contains records that do not match this app’s lessons or patterns."
        }
    }
}

private struct MobileBackupLesson: Codable {
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

private struct MobileBackupPractice: Codable {
    let result: PracticeResult

    init(_ record: PracticeSessionRecord) {
        result = PracticeResult(id: record.id, patternID: record.patternID, patternName: record.patternName, bpm: record.bpm,
                                playedAt: record.playedAt, score: record.score, accuracy: record.accuracy, great: record.great,
                                good: record.good, miss: record.miss, extra: record.extra, maxCombo: record.maxCombo)
    }

    func makeRecord() -> PracticeSessionRecord { PracticeSessionRecord(result) }
}

private struct MobileBackupBest: Codable {
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

private struct MobileBackupTrainerRound: Codable {
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
    }

    func makeRecord() -> TrainerRoundRecord {
        TrainerRoundRecord(id: id, patternID: patternID, patternName: patternName, bpm: bpm, playedAt: playedAt,
                           mode: mode, repetitions: repetitions, ratings: ratings, score: score, accuracy: accuracy)
    }
}

private struct MobileProgressBackup: Codable {
    let app: String
    let schemaVersion: Int
    let exportedAt: Date
    let lessonProgress: [MobileBackupLesson]
    let practiceSessions: [MobileBackupPractice]
    let patternBests: [MobileBackupBest]
    let trainerRounds: [MobileBackupTrainerRound]

    init(lessonProgress: [LessonProgressRecord], practiceSessions: [PracticeSessionRecord], patternBests: [PatternBestRecord], trainerRounds: [TrainerRoundRecord]) {
        app = "drum-hero-ios"
        schemaVersion = 1
        exportedAt = .now
        self.lessonProgress = lessonProgress.map(MobileBackupLesson.init)
        self.practiceSessions = practiceSessions.map(MobileBackupPractice.init)
        self.patternBests = patternBests.map(MobileBackupBest.init)
        self.trainerRounds = trainerRounds.map(MobileBackupTrainerRound.init)
    }

    static var empty: MobileProgressBackup { MobileProgressBackup(lessonProgress: [], practiceSessions: [], patternBests: [], trainerRounds: []) }

    func validate(content: MobileContentDocument) throws {
        guard app == "drum-hero-ios", schemaVersion == 1 else { throw MobileBackupError.unsupportedFormat }
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
                      (item.score.map { (0...100).contains($0) } ?? true) && (item.accuracy.map { (0...100).contains($0) } ?? true)
              }) else { throw MobileBackupError.invalidRecords }
    }
}

private struct MobileProgressBackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }
    var backup: MobileProgressBackup

    init(backup: MobileProgressBackup) { self.backup = backup }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents, data.count <= 1_000_000 else { throw MobileBackupError.oversized }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        backup = try decoder.decode(MobileProgressBackup.self, from: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return FileWrapper(regularFileWithContents: try encoder.encode(backup))
    }
}

struct ProgressViewScreen: View {
    let content: MobileContentDocument
    @Environment(\.modelContext) private var modelContext
    @Query private var lessonProgress: [LessonProgressRecord]
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var sessions: [PracticeSessionRecord]
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var rounds: [TrainerRoundRecord]
    @Query private var bests: [PatternBestRecord]
    @State private var exportDocument = MobileProgressBackupDocument(backup: .empty)
    @State private var isExporting = false
    @State private var isImporting = false
    @State private var confirmingImport = false
    @State private var pendingImport: MobileProgressBackup?
    @State private var backupMessage = ""

    var body: some View {
        NavigationStack {
            List {
                Section("Lessons") {
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
                Section("Local backup") {
                    Text("Save lesson checkpoints, practice sessions, Trainer rounds, and best scores as a versioned JSON file. Recordings and cloud data are not included.").font(.footnote).foregroundStyle(.secondary)
                    Button("Export progress backup", systemImage: "square.and.arrow.up") {
                        exportDocument = MobileProgressBackupDocument(backup: MobileProgressBackup(lessonProgress: lessonProgress, practiceSessions: sessions, patternBests: bests, trainerRounds: rounds))
                        isExporting = true
                    }
                    Button("Import progress backup", systemImage: "square.and.arrow.down") { isImporting = true }
                    if !backupMessage.isEmpty { Text(backupMessage).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
                }
                if !sessions.isEmpty {
                    Section("Recent sessions") {
                        ForEach(sessions.prefix(20)) { session in
                            VStack(alignment: .leading) {
                                Text(session.patternName).font(.headline)
                                Text("\(session.accuracy)% accuracy · \(session.bpm) BPM · score \(session.score)").font(.caption).foregroundStyle(.secondary)
                            }
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
                .fileImporter(isPresented: $isImporting, allowedContentTypes: [.json], allowsMultipleSelection: false, onCompletion: readBackup)
                .alert("Replace local progress?", isPresented: $confirmingImport) {
                    Button("Replace this device’s data", role: .destructive) { applyPendingBackup() }
                    Button("Cancel", role: .cancel) { pendingImport = nil }
                } message: {
                    if let backup = pendingImport {
                        Text("This replaces lesson progress, practice sessions, Trainer rounds, and best scores on this device. The file contains \(backup.lessonProgress.count) lesson records, \(backup.practiceSessions.count) practice sessions, and \(backup.trainerRounds.count) Trainer rounds. Checkpoints and audio are not shown in this preview.")
                    }
                }
        }
    }

    private func readBackup(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let hasAccess = url.startAccessingSecurityScopedResource()
            defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
            let fileSize = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 1_000_001
            guard fileSize <= 1_000_000 else { throw MobileBackupError.oversized }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard data.count <= 1_000_000 else { throw MobileBackupError.oversized }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let backup = try decoder.decode(MobileProgressBackup.self, from: data)
            try backup.validate(content: content)
            pendingImport = backup
            confirmingImport = true
            backupMessage = "Backup loaded for review. Confirm replacement to apply it."
        } catch { backupMessage = error.localizedDescription }
    }

    private func applyPendingBackup() {
        guard let backup = pendingImport else { return }
        let lessonsByID = Dictionary(uniqueKeysWithValues: lessonProgress.map { ($0.lessonID, $0) })
        let incomingLessonIDs = Set(backup.lessonProgress.map(\.lessonID))
        for item in backup.lessonProgress {
            if let record = lessonsByID[item.lessonID] {
                record.completedAt = item.completedAt
                record.checkpoint = item.checkpoint
                record.updatedAt = item.updatedAt
            } else { modelContext.insert(item.makeRecord()) }
        }
        for record in lessonProgress where !incomingLessonIDs.contains(record.lessonID) { modelContext.delete(record) }

        let sessionsByID = Dictionary(uniqueKeysWithValues: sessions.map { ($0.id, $0) })
        let incomingSessionIDs = Set(backup.practiceSessions.map(\.result.id))
        for item in backup.practiceSessions {
            let result = item.result
            if let record = sessionsByID[result.id] {
                record.patternID = result.patternID; record.patternName = result.patternName; record.bpm = result.bpm
                record.playedAt = result.playedAt; record.score = result.score; record.accuracy = result.accuracy
                record.great = result.great; record.good = result.good; record.miss = result.miss
                record.extra = result.extra; record.maxCombo = result.maxCombo
            } else { modelContext.insert(item.makeRecord()) }
        }
        for record in sessions where !incomingSessionIDs.contains(record.id) { modelContext.delete(record) }

        let bestsByID = Dictionary(uniqueKeysWithValues: bests.map { ($0.patternID, $0) })
        let incomingBestIDs = Set(backup.patternBests.map(\.patternID))
        for item in backup.patternBests {
            if let record = bestsByID[item.patternID] {
                record.patternName = item.patternName; record.score = item.score; record.achievedAt = item.achievedAt
            } else { modelContext.insert(item.makeRecord()) }
        }
        for record in bests where !incomingBestIDs.contains(record.patternID) { modelContext.delete(record) }

        let roundsByID = Dictionary(uniqueKeysWithValues: rounds.map { ($0.id, $0) })
        let incomingRoundIDs = Set(backup.trainerRounds.map(\.id))
        for item in backup.trainerRounds {
            if let record = roundsByID[item.id] {
                record.patternID = item.patternID; record.patternName = item.patternName; record.bpm = item.bpm
                record.playedAt = item.playedAt; record.mode = item.mode; record.repetitions = item.repetitions
                record.ratingsData = (try? JSONEncoder().encode(item.ratings)) ?? Data()
                record.score = item.score; record.accuracy = item.accuracy
            } else { modelContext.insert(item.makeRecord()) }
        }
        for record in rounds where !incomingRoundIDs.contains(record.id) { modelContext.delete(record) }
        do {
            try modelContext.save()
            backupMessage = "Local progress replaced from backup."
        } catch {
            modelContext.rollback()
            backupMessage = "Could not restore this backup: \(error.localizedDescription)"
        }
        pendingImport = nil
    }
}
