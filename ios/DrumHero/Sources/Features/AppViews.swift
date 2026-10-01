import SwiftData
import SwiftUI

private let drumMint = Color(red: 0.20, green: 0.73, blue: 0.63)

struct HomeView: View {
    let content: MobileContentDocument
    @Binding var tab: DrumHeroTab
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
                            Text(nextLesson.title).font(.title2.bold())
                            Text(nextLesson.summary).foregroundStyle(.secondary)
                            Text("\(nextLesson.level.rawValue) · \(nextLesson.duration) min").font(.subheadline.weight(.semibold)).foregroundStyle(drumMint)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
                    }.buttonStyle(.plain).accessibilityHint("Opens the lesson catalogue")
                    HStack(spacing: 12) {
                        StatCard(title: "Lessons", value: "\(progress.filter { $0.completedAt != nil }.count)/\(content.lessons.count)", symbol: "book")
                        StatCard(title: "Sessions", value: "\(sessions.count)", symbol: "waveform")
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Choose a session").font(.title2.bold())
                        HomeDestination(title: "Practice Pad", subtitle: "Play grooves and rudiments", symbol: "circle.grid.3x3.fill") { tab = .practice }
                        HomeDestination(title: "Guided Trainer", subtitle: "Build consistency one round at a time", symbol: "metronome.fill") { tab = .trainer }
                    }
                }.padding()
            }.navigationTitle("Drum Hero").navigationBarTitleDisplayMode(.inline)
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
                            LessonDetailView(lesson: lesson, guide: content.lessonGuides[lesson.id]!, pattern: content.patterns.first { $0.id == lesson.practicePatternId }, openPractice: openPractice)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(lesson.title).font(.headline)
                                    Text("\(lesson.level.rawValue) · \(lesson.duration) min").font(.caption).foregroundStyle(.secondary)
                                    Text(lesson.summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
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
                    NavigationLink("Grooves · \(content.grooves.count)") { PatternCatalogueView(title: "Grooves", patterns: content.grooves, openPractice: openPractice) }
                    NavigationLink("Rudiments · \(content.rudiments.count)") { PatternCatalogueView(title: "Rudiments", patterns: content.rudiments, openPractice: openPractice) }
                    NavigationLink("Kit guide and hearing safety") { KitGuideView() }
                }
            }.navigationTitle("Learn")
        }
    }
}

private struct LessonDetailView: View {
    let lesson: DrumLesson
    let guide: LessonGuide
    let pattern: PracticePattern?
    let openPractice: (PracticePattern) -> Void
    @Environment(\.modelContext) private var modelContext
    @Query private var allProgress: [LessonProgressRecord]
    @State private var checkpoint = ""
    @State private var didLoadCheckpoint = false

    private var record: LessonProgressRecord? { allProgress.first { $0.lessonID == lesson.id } }

    var body: some View {
        List {
            Section { Text(lesson.summary); Label("\(lesson.level.rawValue) · about \(lesson.duration) minutes", systemImage: "clock") }
            Section("Goals") { ForEach(lesson.goals, id: \.self) { Label($0, systemImage: "checkmark.circle") } }
            Section("Lesson guide") {
                Text(guide.idea).font(.body)
                ForEach(Array(guide.steps.enumerated()), id: \.offset) { index, step in
                    Label(step, systemImage: "\(index + 1).circle")
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
                    Button("Open \(pattern.name)", systemImage: "play.fill") { openPractice(pattern) }
                }
            }
        }
        .navigationTitle(lesson.title).navigationBarTitleDisplayMode(.inline)
        .onAppear { if !didLoadCheckpoint { checkpoint = record?.checkpoint ?? ""; didLoadCheckpoint = true } }
    }
}

struct PatternCatalogueView: View {
    let title: String
    let patterns: [PracticePattern]
    let openPractice: (PracticePattern) -> Void
    @State private var query = ""
    @State private var level = "All"
    private var filtered: [PracticePattern] {
        patterns.filter { (level == "All" || $0.level.rawValue == level) && (query.isEmpty || "\($0.name) \($0.description) \($0.focus ?? "") \($0.style ?? "")".localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        List {
            Section {
                Picker("Level", selection: $level) { Text("All").tag("All"); ForEach(LearnerLevel.allCases) { Text($0.rawValue).tag($0.rawValue) } }
                    .pickerStyle(.segmented)
            }
            ForEach(filtered) { pattern in
                VStack(alignment: .leading, spacing: 7) {
                    HStack { Text(pattern.name).font(.headline); Spacer(); Text(pattern.level.rawValue).font(.caption).foregroundStyle(drumMint) }
                    Text(pattern.description).font(.subheadline).foregroundStyle(.secondary)
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
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var records: [PracticeSessionRecord]
    private var selectedPattern: PracticePattern? { content.patterns.first { $0.id == selectedPatternID } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Picker("Pattern", selection: $selectedPatternID) {
                        ForEach(content.patterns) { pattern in Text("\(pattern.name) · \(pattern.level.rawValue)").tag(pattern.id) }
                    }.pickerStyle(.menu).accessibilityIdentifier("practice.pattern")
                    if let selectedPattern {
                        VStack(alignment: .leading, spacing: 9) {
                            Text(selectedPattern.name).font(.title2.bold())
                            Text(selectedPattern.description).foregroundStyle(.secondary)
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
            .onChange(of: selectedPatternID) { _, newValue in
                if controller.currentPatternID != newValue { controller.reset() }
                if let pattern = content.patterns.first(where: { $0.id == newValue }) { bpm = pattern.defaultBpm }
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
    @Environment(\.modelContext) private var modelContext
    @StateObject private var controller = PracticeController()
    @State private var patternID = "single-stroke"
    @State private var bpm = 70
    @State private var repetitions = 4
    @State private var countInBeats = 4
    @State private var mode = "Self-rated"
    @State private var ratings: [TrainerRating] = []
    @State private var pendingRating = false
    @State private var savedRound = false
    private var patterns: [PracticePattern] { content.rudiments + content.grooves }
    private var pattern: PracticePattern { patterns.first { $0.id == patternID } ?? patterns[0] }

    var body: some View {
        NavigationStack {
            Form {
                Section("Round setup") {
                    Picker("Pattern", selection: $patternID) { ForEach(patterns) { Text($0.name).tag($0.id) } }
                    Picker("Mode", selection: $mode) { Text("Self-rated").tag("Self-rated"); Text("Scored").tag("Scored") }
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
                                ForEach(DrumVoice.allCases) { voice in Button(voice.title) { controller.hit(voice) }.frame(maxWidth: .infinity, minHeight: 60).buttonStyle(.bordered).accessibilityIdentifier("trainer.pad.\(voice.rawValue)") }
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
            .confirmationDialog("How did that repetition feel?", isPresented: $pendingRating, titleVisibility: .visible) {
                ForEach(TrainerRating.allCases) { rating in Button(rating.title) { record(rating) } }
            }
            .onChange(of: controller.status) { oldValue, newValue in
                if mode == "Self-rated", oldValue == .playing, newValue == .complete { pendingRating = true }
                if mode == "Scored", oldValue == .playing, newValue == .complete { saveScoredRound() }
            }
            .onChange(of: patternID) { _, _ in resetRound() }
            .onChange(of: mode) { _, _ in resetRound() }
            .onChange(of: repetitions) { _, _ in resetRound() }
            .onChange(of: countInBeats) { _, _ in resetRound() }
            .onChange(of: bpm) { _, _ in resetRound() }
        }
    }

    private func beginRound() {
        ratings = []; pendingRating = false; savedRound = false
        controller.start(pattern: pattern, bpm: bpm, repetitions: mode == "Scored" ? repetitions : 1,
                         countInBeats: countInBeats)
    }

    private func record(_ rating: TrainerRating) {
        ratings.append(rating)
        if ratings.count >= repetitions {
            saveRound(TrainerRoundRecord(patternID: pattern.id, patternName: pattern.name, bpm: bpm,
                                         mode: "self", repetitions: repetitions, ratings: ratings))
            savedRound = true
            return
        }
        controller.reset()
        controller.start(pattern: pattern, bpm: bpm, countInBeats: countInBeats)
    }

    private func saveScoredRound() {
        guard !savedRound, let result = controller.result else { return }
        modelContext.insert(PracticeSessionRecord(result))
        let bestDescriptor = FetchDescriptor<PatternBestRecord>(predicate: #Predicate { $0.patternID == result.patternID })
        if let best = try? modelContext.fetch(bestDescriptor).first {
            if result.score > best.score { best.score = result.score; best.achievedAt = result.playedAt }
        } else {
            modelContext.insert(PatternBestRecord(patternID: pattern.id, patternName: pattern.name, score: result.score, achievedAt: result.playedAt))
        }
        saveRound(TrainerRoundRecord(patternID: pattern.id, patternName: pattern.name, bpm: bpm,
                                     mode: "scored", repetitions: repetitions, ratings: [], score: result.score, accuracy: result.accuracy))
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

struct ProgressViewScreen: View {
    let content: MobileContentDocument
    @Query private var lessonProgress: [LessonProgressRecord]
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var sessions: [PracticeSessionRecord]
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var rounds: [TrainerRoundRecord]

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
        }
    }
}
