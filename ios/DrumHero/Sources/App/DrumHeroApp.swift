import SwiftData
import SwiftUI

@main
@MainActor
struct DrumHeroApp: App {
    private let container: ModelContainer = {
        if ProcessInfo.processInfo.arguments.contains("--uitesting") {
            let memory = ModelConfiguration(isStoredInMemoryOnly: true)
            return try! ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self, PatternBestRecord.self, TrainerRoundRecord.self, configurations: memory)
        }
        do { return try ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self, PatternBestRecord.self, TrainerRoundRecord.self) }
        catch {
            let memory = ModelConfiguration(isStoredInMemoryOnly: true)
            return try! ModelContainer(for: LessonProgressRecord.self, PracticeSessionRecord.self, PatternBestRecord.self, TrainerRoundRecord.self, configurations: memory)
        }
    }()

    var body: some Scene {
        WindowGroup { DrumHeroRootView() }
            .modelContainer(container)
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
    @Environment(\.scenePhase) private var scenePhase
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

    init() {
        if ProcessInfo.processInfo.arguments.contains("--uitesting-reset") {
            ["drumHero.selectedTab", "drumHero.practicePatternID", "drumHero.practiceBpm"].forEach { UserDefaults.standard.removeObject(forKey: $0) }
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
                .tint(Color(red: 0.20, green: 0.73, blue: 0.63))
                .onAppear {
                    if !content.patterns.contains(where: { $0.id == practicePatternID }),
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
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { practice.stopForInterruption() }
        }
    }
}
