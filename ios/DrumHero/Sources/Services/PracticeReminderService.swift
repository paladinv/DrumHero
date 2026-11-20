import SwiftUI
import UserNotifications

@MainActor
final class PracticeReminderSettings: ObservableObject {
    @Published var enabled = false
    @Published var weekdays: Set<Int> = [2, 4, 6]
    @Published var reminderTime: Date = Calendar.current.date(from: DateComponents(hour: 18, minute: 0)) ?? .now
    @Published var message = ""

    private let enabledKey = "drumHero.practiceReminder.enabled"
    private let weekdaysKey = "drumHero.practiceReminder.weekdays"
    private let timeKey = "drumHero.practiceReminder.time"
    private let identifiers = Set(1...7).map { "drumHero.practiceReminder.\($0)" }

    init() {
        let defaults = UserDefaults.standard
        enabled = defaults.bool(forKey: enabledKey)
        let savedDays = defaults.array(forKey: weekdaysKey) as? [Int] ?? [2, 4, 6]
        weekdays = Set(savedDays.filter { (1...7).contains($0) })
        if let savedTime = defaults.object(forKey: timeKey) as? Date { reminderTime = savedTime }
    }

    func updateSchedule() async {
        let center = UNUserNotificationCenter.current()
        guard !weekdays.isEmpty else {
            center.removePendingNotificationRequests(withIdentifiers: identifiers)
            enabled = false
            persist()
            message = "Choose at least one day for a reminder. Existing reminders were turned off."
            return
        }
        let existing = await center.notificationSettings()
        let authorized: Bool
        if existing.authorizationStatus == .authorized || existing.authorizationStatus == .provisional {
            authorized = true
        } else {
            do { authorized = try await center.requestAuthorization(options: [.alert, .sound]) }
            catch { authorized = false; message = "Notification permission could not be requested. Open iOS Settings to review notifications." }
        }
        guard authorized else {
            enabled = false
            persist()
            message = "Allow notifications in iOS Settings before scheduling practice reminders."
            return
        }

        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        let time = Calendar.current.dateComponents([.hour, .minute], from: reminderTime)
        for weekday in weekdays.sorted() {
            var components = DateComponents()
            components.weekday = weekday
            components.hour = time.hour
            components.minute = time.minute
            let content = UNMutableNotificationContent()
            content.title = "A little practice goes a long way"
            content.body = "Your Drum Hero practice reminder is ready. Pick up with a short focused session."
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            let request = UNNotificationRequest(identifier: "drumHero.practiceReminder.\(weekday)", content: content, trigger: trigger)
            do { try await center.add(request) }
            catch {
                center.removePendingNotificationRequests(withIdentifiers: identifiers)
                enabled = false
                persist()
                message = "Some reminders could not be scheduled. Check notification permissions and try again."
                return
            }
        }
        enabled = true
        persist()
        message = "Practice reminders set for \(weekdays.sorted().map(Self.weekdayName).joined(separator: ", ")). They stay on this device."
    }

    func disable() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers)
        enabled = false
        persist()
        message = "Practice reminders turned off."
    }

    func toggleWeekday(_ weekday: Int) {
        if weekdays.contains(weekday) { weekdays.remove(weekday) } else { weekdays.insert(weekday) }
        persist()
    }

    private func persist() {
        let defaults = UserDefaults.standard
        defaults.set(enabled, forKey: enabledKey)
        defaults.set(weekdays.sorted(), forKey: weekdaysKey)
        defaults.set(reminderTime, forKey: timeKey)
    }

    private static func weekdayName(_ value: Int) -> String {
        Calendar.current.weekdaySymbols[max(0, min(6, value - 1))]
    }
}

struct NativePracticeReminderView: View {
    @StateObject private var settings = PracticeReminderSettings()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Set optional weekly reminders on this device. No account or practice data is sent with a notification.")
                .font(.footnote).foregroundStyle(.secondary)
            DatePicker("Reminder time", selection: $settings.reminderTime, displayedComponents: .hourAndMinute)
            HStack(spacing: 7) {
                ForEach(Array(Calendar.current.weekdaySymbols.enumerated()), id: \.offset) { index, day in
                    let weekday = index + 1
                    Button { settings.toggleWeekday(weekday) } label: {
                        Text(String(day.prefix(1)))
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .background(settings.weekdays.contains(weekday) ? DrumHeroStyle.accent : Color.secondary.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(day)
                    .accessibilityValue(settings.weekdays.contains(weekday) ? "Selected" : "Not selected")
                }
            }
            HStack {
                Button(settings.enabled ? "Update reminders" : "Enable reminders", systemImage: "bell.badge") { Task { await settings.updateSchedule() } }
                    .buttonStyle(.borderedProminent).tint(DrumHeroStyle.prominentAction)
                if settings.enabled { Button("Turn off", role: .destructive) { settings.disable() }.buttonStyle(.bordered) }
            }
            if !settings.message.isEmpty {
                Text(settings.message).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently)
            }
        }
        .onChange(of: settings.reminderTime) { _, _ in if settings.enabled { Task { await settings.updateSchedule() } } }
    }
}
