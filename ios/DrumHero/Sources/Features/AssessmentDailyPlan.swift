import SwiftData
import SwiftUI

struct AssessmentDailyPlan: View {
    let content: MobileContentDocument
    @State private var store = AssessmentHistory.read()
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var rounds: [TrainerRoundRecord]
    private var focus: PracticePattern? {
        guard let baseline = store.applied, let assessment = try? AssessmentContent.load(), let lesson = baseline.recommendation(assessment) else { return nil }
        let newer = rounds.filter { row in
            (row.mode == "scored" || row.mode == "scored-adapted") && row.score != nil && row.playedAt > (AssessmentResult.date(baseline.playedAt) ?? .distantFuture) && row.inputProfile == baseline.inputProfile && row.assessmentAdaptation == baseline.adaptation
        }
        if let weakest = newer.min(by: { ($0.accuracy ?? 0) < ($1.accuracy ?? 0) }), let pattern = content.practicePatterns.first(where: { $0.id == weakest.patternID }) { return pattern }
        let patternID = assessment.focusPatterns[lesson] ?? content.lessons.first { $0.id == lesson }?.practicePatternId ?? "first-beat"
        return content.practicePatterns.first { $0.id == patternID }
    }
    var body: some View {
        Group {
            if let focus, let baseline = store.applied {
                GroupBox("Your 12-minute practice") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your applied assessment sets the focus until newer practice on the same input and adaptation is available.").font(.caption)
                        practiceLink("Warm up · 3 min", id: "quarter-pulse", fallback: focus, adaptation: baseline.adaptation)
                        practiceLink("Focus · 5 min", id: focus.id, fallback: focus, adaptation: baseline.adaptation)
                        practiceLink("Play musically · 4 min", id: "motown-pocket", fallback: focus, adaptation: baseline.adaptation)
                    }
                }
            }
        }.onReceive(NotificationCenter.default.publisher(for: AssessmentHistory.changed)) { _ in store = AssessmentHistory.read() }
    }
    private func practiceLink(_ title: String, id: String, fallback: PracticePattern, adaptation: String) -> some View {
        let pattern = content.practicePatterns.first { $0.id == id } ?? fallback
        return NavigationLink { TrainerView(content: content, initialPatternId: pattern.id, initialAdaptation: adaptation) } label: {
            VStack(alignment: .leading) { Text(title); Text(pattern.name).font(.caption) }
        }
    }
}
