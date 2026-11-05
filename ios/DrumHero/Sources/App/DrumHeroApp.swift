import SwiftData
import SwiftUI

@main
@MainActor
struct DrumHeroApp: App {
    private let container: ModelContainer?
    private let persistenceNotice: String?

    init() {
        let startup = Self.makeModelContainer()
        container = startup.container
        persistenceNotice = startup.notice
        if ProcessInfo.processInfo.arguments.contains("--uitesting-complete-curriculum"),
           let container = startup.container,
           let content = try? MobileContentDocument.load() {
            let context = ModelContext(container)
            for lesson in content.lessons {
                let lessonID = lesson.id
                let descriptor = FetchDescriptor<LessonProgressRecord>(predicate: #Predicate { $0.lessonID == lessonID })
                if let record = try? context.fetch(descriptor).first {
                    record.completedAt = record.completedAt ?? .now
                } else {
                    context.insert(LessonProgressRecord(lessonID: lesson.id, completedAt: .now))
                }
            }
            try? context.save()
        }
    }

    private static func makeModelContainer() -> (container: ModelContainer?, notice: String?) {
        if ProcessInfo.processInfo.arguments.contains("--uitesting") {
            let memory = ModelConfiguration(isStoredInMemoryOnly: true)
            do {
                return (try ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self,
                                           PatternBestRecord.self, TrainerRoundRecord.self, PersonalSongRecord.self,
                                           configurations: memory), nil)
            } catch {
                return (nil, "The test progress store could not be initialized. \(error.localizedDescription)")
            }
        }

        do {
            return (try ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self,
                                       PatternBestRecord.self, TrainerRoundRecord.self, PersonalSongRecord.self), nil)
        } catch {
            let memory = ModelConfiguration(isStoredInMemoryOnly: true)
            do {
                return (try ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self,
                                           PatternBestRecord.self, TrainerRoundRecord.self, PersonalSongRecord.self,
                                           configurations: memory),
                        "Local storage could not be opened. Progress changes will be temporary and lost when you close the app.")
            } catch {
                return (nil, "Drum Hero could not open local progress storage. \(error.localizedDescription)")
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            if let container {
                DrumHeroRootView(storageNotice: persistenceNotice)
                    .modelContainer(container)
            } else {
                ContentUnavailableView("Progress storage unavailable", systemImage: "externaldrive.badge.exclamationmark",
                                       description: Text(persistenceNotice ?? "Drum Hero could not open local progress storage."))
            }
        }
    }
}

enum DrumHeroTab: String, CaseIterable, Identifiable {
    case home, learn, practice, trainer, progress
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .learn: "book.fill"
        case .practice: "circle.grid.3x3.fill"
        case .trainer: "metronome.fill"
        case .progress: "chart.bar.fill"
        }
    }
}

struct DrumHeroRootView: View {
    let storageNotice: String?
    private static var didResetForUITests = false
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var language = LanguageSettings()
    @AppStorage("drumHero.selectedTab") private var savedTab = DrumHeroTab.home.rawValue
    @State private var content: MobileContentDocument?
    @State private var loadError: String?
    @AppStorage("drumHero.practicePatternID") private var practicePatternID = "first-beat"
    @AppStorage("drumHero.practiceBpm") private var practiceBpm = 80
    @StateObject private var practice = PracticeController()

    private var tab: Binding<DrumHeroTab> {
        Binding(
            get: { DrumHeroTab(rawValue: savedTab) ?? .home },
            set: { savedTab = $0.rawValue }
        )
    }

    init(storageNotice: String? = nil) {
        self.storageNotice = storageNotice
        if ProcessInfo.processInfo.arguments.contains("--uitesting-reset"), !Self.didResetForUITests {
            Self.didResetForUITests = true
            [AssessmentHistory.key, SightHistory.key, SightHistory.goalKey, "drumHero.selectedTab", "drumHero.practicePatternID", "drumHero.practiceBpm", "drumHero.language"].forEach { UserDefaults.standard.removeObject(forKey: $0) }
        }
        do { _content = State(initialValue: try MobileContentDocument.load()) }
        catch { _loadError = State(initialValue: error.localizedDescription) }
    }

    var body: some View {
        Group {
            if let content {
                TabView(selection: tab) {
                    HomeView(content: content, tab: tab).tabItem { Label("Home", systemImage: "house.fill") }.tag(DrumHeroTab.home)
                    LearnView(content: content, openPractice: { pattern in
                        practicePatternID = pattern.id
                        practiceBpm = pattern.defaultBpm
                        practice.reset()
                        tab.wrappedValue = .practice
                    }).tabItem { Label("Learn", systemImage: "book.fill") }.tag(DrumHeroTab.learn)
                    PracticeView(content: content, controller: practice, selectedPatternID: $practicePatternID, bpm: $practiceBpm).tabItem { Label("Practice", systemImage: "circle.grid.3x3.fill") }.tag(DrumHeroTab.practice)
                    TrainerView(content: content).tabItem { Label("Trainer", systemImage: "metronome.fill") }.tag(DrumHeroTab.trainer)
                    ProgressViewScreen(content: content).tabItem { Label("Progress", systemImage: "chart.bar.fill") }.tag(DrumHeroTab.progress)
                }
                .tint(DrumHeroStyle.accent)
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let storageNotice {
                        Label(storageNotice, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                            .background(.orange.opacity(0.16))
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }
                .onAppear {
                    if !content.practicePatterns.contains(where: { $0.id == practicePatternID }),
                       let firstPattern = content.patterns.first {
                        practicePatternID = firstPattern.id
                        practiceBpm = firstPattern.defaultBpm
                    }
                    practiceBpm = min(200, max(40, practiceBpm))
                }
            } else {
                ContentUnavailableView("Drum Hero content is unavailable", systemImage: "exclamationmark.triangle", description: Text(loadError ?? "The bundled content could not be opened."))
            }
        }
        .environmentObject(language)
        .environment(\.locale, language.locale)
        .environment(\.layoutDirection, language.layoutDirection)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { language.refreshDeviceLanguage() }
            else { practice.stopForInterruption() }
        }
    }
}
