import Foundation
import SwiftUI

struct SupportedLanguage: Identifiable {
    let id: String
    let name: String

    static let all: [SupportedLanguage] = [
        .init(id: "en", name: "English"), .init(id: "es", name: "Español"),
        .init(id: "fr", name: "Français"), .init(id: "de", name: "Deutsch"),
        .init(id: "pt-BR", name: "Português (Brasil)"), .init(id: "it", name: "Italiano"),
        .init(id: "nl", name: "Nederlands"), .init(id: "pl", name: "Polski"),
        .init(id: "uk", name: "Українська"), .init(id: "ru", name: "Русский"),
        .init(id: "tr", name: "Türkçe"), .init(id: "ar", name: "العربية"),
        .init(id: "he", name: "עברית"), .init(id: "fa", name: "فارسی"),
        .init(id: "hi", name: "हिन्दी"), .init(id: "bn", name: "বাংলা"),
        .init(id: "ur", name: "اردو"), .init(id: "id", name: "Bahasa Indonesia"),
        .init(id: "vi", name: "Tiếng Việt"), .init(id: "th", name: "ไทย"),
        .init(id: "ja", name: "日本語"), .init(id: "ko", name: "한국어"),
        .init(id: "zh-Hans", name: "简体中文"), .init(id: "zh-Hant", name: "繁體中文")
    ]
}

@MainActor
final class LanguageSettings: ObservableObject {
    @Published var preference: String {
        didSet {
            UserDefaults.standard.set(preference, forKey: "drumHero.language")
            refreshDeviceLanguage()
        }
    }
    @Published private(set) var activeTag: String = "en"
    @Published var isShowingPicker = false

    init() {
        let saved = UserDefaults.standard.string(forKey: "drumHero.language") ?? "auto"
        preference = saved == "auto" || SupportedLanguage.all.contains(where: { $0.id == saved }) ? saved : "auto"
        refreshDeviceLanguage()
    }

    var locale: Locale { Locale(identifier: activeTag) }
    var layoutDirection: LayoutDirection {
        NSLocale.characterDirection(forLanguage: activeTag) == .rightToLeft ? .rightToLeft : .leftToRight
    }

    func refreshDeviceLanguage() {
        activeTag = preference == "auto" ? Self.matchDeviceLanguage() : preference
    }

    static func matchLanguage(_ identifiers: [String]) -> String {
        for identifier in identifiers {
            let components = identifier.replacingOccurrences(of: "_", with: "-").split(separator: "-").map(String.init)
            guard let first = components.first else { continue }
            let language = first.lowercased()
            if language == "zh" {
                let script = components.first { $0.count == 4 }?.lowercased()
                let region = components.first { $0.count == 2 && $0 != first }?.uppercased()
                if script == "hant" || ["TW", "HK", "MO"].contains(region ?? "") { return "zh-Hant" }
                return "zh-Hans"
            }
            if language == "pt" { return "pt-BR" }
            if SupportedLanguage.all.contains(where: { $0.id == language }) { return language }
        }
        return "en"
    }

    private static func matchDeviceLanguage() -> String { matchLanguage(Locale.preferredLanguages) }
}

struct LanguageSettingsButton: View {
    @EnvironmentObject private var settings: LanguageSettings

    var body: some View {
        Button {
            settings.isShowingPicker = true
        } label: {
            Image(systemName: "globe")
        }
        .accessibilityLabel(Text("Language"))
        .sheet(isPresented: $settings.isShowingPicker) {
            LanguageSettingsSheet().environmentObject(settings)
        }
    }
}

private struct LanguageSettingsSheet: View {
    @EnvironmentObject private var settings: LanguageSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Picker("Language", selection: $settings.preference) {
                    Text("Automatic (device language)").tag("auto")
                    ForEach(SupportedLanguage.all) { language in
                        Text(language.name).tag(language.id)
                    }
                }
                .pickerStyle(.inline)
            }
            .navigationTitle("Select display language")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
