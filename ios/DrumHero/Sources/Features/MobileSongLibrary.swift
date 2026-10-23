import Foundation
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

private struct MobileSongProjectEnvelope: Codable {
    let format: String
    var song: MobileSong
}

enum MobileSongProjectError: LocalizedError {
    case tooLarge
    case unsupportedFormat
    case invalidSong(String)

    var errorDescription: String? {
        switch self {
        case .tooLarge:
            "Song projects must be 8 MB or smaller."
        case .unsupportedFormat:
            "Choose a Drum Hero song export in JSON format."
        case .invalidSong(let reason):
            reason
        }
    }
}

enum MobileSongProjectCodec {
    static let format = "drum-hero-song-v1"
    static let maximumBytes = 8 * 1024 * 1024
    private static let sectionKinds: Set<String> = ["intro", "verse", "chorus", "bridge", "fill", "outro", "other"]
    private static let articulations: Set<String> = ["normal", "flam", "drag", "buzz", "roll", "choke", "foot-splash"]

    static func decode(_ data: Data) throws -> MobileSong {
        guard data.count <= maximumBytes else { throw MobileSongProjectError.tooLarge }
        let envelope: MobileSongProjectEnvelope
        do {
            envelope = try JSONDecoder().decode(MobileSongProjectEnvelope.self, from: data)
        } catch {
            throw MobileSongProjectError.invalidSong("This file is invalid or uses drum voices that are not supported on iOS yet.")
        }
        guard envelope.format == format else { throw MobileSongProjectError.unsupportedFormat }
        try validate(envelope.song)

        var song = envelope.song
        let now = ISO8601DateFormatter().string(from: .now)
        if !isTimestamp(song.createdAt) { song.createdAt = now }
        if !isTimestamp(song.updatedAt) { song.updatedAt = song.createdAt }
        return song
    }

    static func encode(_ song: MobileSong) throws -> Data {
        try validate(song)
        let envelope = MobileSongProjectEnvelope(format: format, song: song)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(envelope)
        guard data.count <= maximumBytes else { throw MobileSongProjectError.tooLarge }
        return data
    }

    private static func isTimestamp(_ value: String?) -> Bool {
        guard let value else { return false }
        return ISO8601DateFormatter().date(from: value) != nil
    }

    private static func validate(_ song: MobileSong) throws {
        guard validID(song.id), validText(song.title, max: 120), validText(song.artist, max: 120),
              LearnerLevel(rawValue: song.difficulty) != nil,
              (40...200).contains(song.bpm), !song.meter.isEmpty, song.meter.count <= 20,
              song.tags.count <= 12, song.tags.allSatisfy({ $0.count <= 40 }), song.notes.count <= 4_000,
              song.sections.count <= 32 else {
            throw MobileSongProjectError.invalidSong("The song metadata is incomplete or outside the supported limits.")
        }

        if let source = song.source {
            if (source.url?.count ?? 0) > 2_000 || (source.title?.count ?? 0) > 100 ||
                (source.attribution?.count ?? 0) > 200 || (source.authorization?.count ?? 0) > 200 {
                throw MobileSongProjectError.invalidSong("The source attribution fields exceed the supported limits.")
            }
        }

        var totalParts = 0
        var totalHits = 0
        guard Set(song.sections.map(\.id)).count == song.sections.count,
              song.sections.allSatisfy({ validID($0.id) && validText($0.name, max: 80) &&
                  ($0.bpm.map { (40...200).contains($0) } ?? true) &&
                  ($0.notes?.count ?? 0) <= 2_000 && ($0.kind.map(sectionKinds.contains) ?? true) && $0.parts.count <= 256 }) else {
            throw MobileSongProjectError.invalidSong("One or more song sections are invalid.")
        }

        for section in song.sections {
            totalParts += section.parts.count
            guard Set(section.parts.map(\.id)).count == section.parts.count else {
                throw MobileSongProjectError.invalidSong("Part names and IDs must be unique within each section.")
            }
            for part in section.parts {
                totalHits += part.hits.count
                let stepCount = part.beats * Double(part.subdivision) / 4
                guard validID(part.id), validText(part.name, max: 80), (40...200).contains(part.bpm),
                      part.beats > 0, part.beats <= 32, (part.beats * 2).rounded() == part.beats * 2,
                      [4, 8, 12, 16].contains(part.subdivision), stepCount.isFinite,
                      stepCount.rounded() == stepCount, part.hits.count <= 256, part.meter.count <= 40 else {
                    throw MobileSongProjectError.invalidSong("One or more drum parts are invalid.")
                }
                for hit in part.hits {
                    guard hit.step >= 0, Double(hit.step) < stepCount,
                          (hit.velocity.map { (1...127).contains($0) } ?? true),
                          (hit.articulation.map(articulations.contains) ?? true),
                          (hit.sticking.map { ["R", "L"].contains($0) } ?? true),
                          (hit.timingOffsetMs.map { $0.isFinite && (-1_000...1_000).contains($0) } ?? true) else {
                        throw MobileSongProjectError.invalidSong("One or more drum hits are outside the supported range.")
                    }
                }
            }
        }
        guard totalParts <= 512, totalHits <= 40_000 else {
            throw MobileSongProjectError.invalidSong("This song has more parts or hits than iOS can currently handle.")
        }
    }

    private static func validID(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.count <= 100
    }

    private static func validText(_ value: String, max: Int) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.count <= max
    }
}

struct MobileSongProjectDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    private let data: Data

    init(song: MobileSong) throws {
        data = try MobileSongProjectCodec.encode(song)
    }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents else {
            throw MobileSongProjectError.unsupportedFormat
        }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

struct MobileSongLibraryScreen: View {
    let content: MobileContentDocument
    let openPractice: (PracticePattern) -> Void
    @Environment(\.modelContext) private var modelContext
    @State private var query = ""
    @State private var isImporting = false
    @State private var isExporting = false
    @State private var isCreating = false
    @State private var exportDocument: MobileSongProjectDocument?
    @State private var exportFilename = "Drum-Hero-Song"
    @State private var message = ""
    @Query(sort: \PersonalSongRecord.updatedAt, order: .reverse) private var personalSongs: [PersonalSongRecord]

    private var matchingExamples: [MobileSong] {
        content.songs.filter { matches($0) }
    }

    private var matchingPersonalSongs: [(PersonalSongRecord, MobileSong)] {
        personalSongs.compactMap { record in
            guard let song = record.song, matches(song) else { return nil }
            return (record, song)
        }
    }

    var body: some View {
        List {
            Section("Your projects") {
                Text("Single-song Drum Hero JSON files can move arrangements between web and iOS Song Libraries. Import and export each song from its detail screen; full backups remain platform-specific.")
                    .font(.footnote).foregroundStyle(.secondary)
                if personalSongs.isEmpty {
                    ContentUnavailableView("No personal songs yet", systemImage: "music.note.list",
                                           description: Text("Create a song here or import a Drum Hero song JSON file. Projects stay on this device until you export them."))
                } else if matchingPersonalSongs.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    ForEach(personalSongs) { record in
                        if let song = record.song, matches(song) {
                            NavigationLink {
                                PersonalMobileSongDetail(song: song, openPractice: openPractice,
                                                         onSave: saveSong, onExport: beginExport)
                            } label: {
                                SongLibraryRow(song: song)
                            }
                            .swipeActions {
                                Button("Delete", systemImage: "trash", role: .destructive) { delete(record) }
                            }
                        }
                    }
                }
            }

            Section("Song examples") {
                if matchingExamples.isEmpty {
                    Text("No examples match your search.").foregroundStyle(.secondary)
                } else {
                    ForEach(matchingExamples) { song in
                        NavigationLink {
                            PersonalMobileSongDetail(song: song, openPractice: openPractice,
                                                     onSave: nil, onExport: beginExport)
                        } label: {
                            SongLibraryRow(song: song)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Find a song")
        .navigationTitle("Song Library")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("New song project", systemImage: "plus") { isCreating = true }
                    Button("Import song JSON", systemImage: "square.and.arrow.down") { isImporting = true }
                } label: {
                    Label("Add song", systemImage: "plus")
                }
                .accessibilityIdentifier("song-library.add")
            }
        }
        .sheet(isPresented: $isCreating) {
            NavigationStack {
                MobileSongProjectEditor(song: blankSong(), onSave: saveSong)
            }
        }
        .fileImporter(isPresented: $isImporting, allowedContentTypes: [.json], allowsMultipleSelection: false, onCompletion: importSong)
        .fileExporter(isPresented: $isExporting, document: exportDocument, contentType: .json, defaultFilename: exportFilename) { result in
            switch result {
            case .success: message = "Song JSON export is ready."
            case .failure(let error): message = "Could not export this song: \(error.localizedDescription)"
            }
            exportDocument = nil
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !message.isEmpty {
                Text(message)
                    .font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    .padding(.vertical, 10)
                    .background(.thinMaterial)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private func matches(_ song: MobileSong) -> Bool {
        query.isEmpty || "\(song.title) \(song.artist) \(song.tags.joined(separator: " ")) \(song.notes)".localizedCaseInsensitiveContains(query)
    }

    private func importSong(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard let url = urls.first else { return }
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }

            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: MobileSongProjectCodec.maximumBytes + 1) ?? Data()
            var song = try MobileSongProjectCodec.decode(data)
            song.id = UUID().uuidString
            let encoded = try MobileSongProjectCodec.encode(song)
            modelContext.insert(PersonalSongRecord(song: song, data: encoded))
            do {
                try modelContext.save()
                message = "Imported \(song.title). The project is saved on this device."
            } catch {
                modelContext.rollback()
                message = "Could not save this song to the library. Try importing it again."
            }
        } catch {
            message = "Could not import this song: \(error.localizedDescription)"
        }
    }

    private func saveSong(_ input: MobileSong) -> Bool {
        var song = input
        let now = ISO8601DateFormatter().string(from: .now)
        if song.createdAt == nil { song.createdAt = now }
        song.updatedAt = now
        do {
            let encoded = try MobileSongProjectCodec.encode(song)
            if let record = personalSongs.first(where: { $0.id == song.id }) {
                record.title = song.title
                record.artist = song.artist
                record.difficulty = song.difficulty
                record.bpm = song.bpm
                record.meter = song.meter
                record.songData = encoded
                record.updatedAt = .now
            } else {
                modelContext.insert(PersonalSongRecord(song: song, data: encoded))
            }
            try modelContext.save()
            message = "Saved \(song.title) on this device."
            return true
        } catch {
            modelContext.rollback()
            message = "Could not save this song: \(error.localizedDescription)"
            return false
        }
    }

    private func blankSong() -> MobileSong {
        let part = MobileSongPart(id: UUID().uuidString, name: "Main groove", bpm: 90,
                                  beats: 4, subdivision: 16, meter: "4/4", hits: [])
        let section = MobileSongSection(id: UUID().uuidString, name: "Verse", bpm: nil, parts: [part], kind: "verse", notes: "")
        return MobileSong(id: UUID().uuidString, title: "Untitled song", artist: "My arrangement",
                          difficulty: LearnerLevel.beginner.rawValue, bpm: 90, meter: "4/4", tags: [],
                          notes: "", sections: [section], source: nil, createdAt: nil, updatedAt: nil)
    }

    private func beginExport(_ song: MobileSong) {
        do {
            exportDocument = try MobileSongProjectDocument(song: song)
            exportFilename = song.title
                .replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: ":", with: "-")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            isExporting = true
        } catch {
            message = "Could not prepare this song for export: \(error.localizedDescription)"
        }
    }

    private func delete(_ record: PersonalSongRecord) {
        let title = record.title
        modelContext.delete(record)
        do {
            try modelContext.save()
            message = "Deleted \(title) from this device."
        } catch {
            modelContext.rollback()
            message = "Could not delete this song. Try again."
        }
    }
}

private struct SongLibraryRow: View {
    let song: MobileSong

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(song.title).font(.headline)
            Text("\(song.artist) · \(song.difficulty) · \(song.meter) · \(song.bpm) BPM")
                .font(.caption).foregroundStyle(.secondary)
            Text(song.notes).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
        }
        .padding(.vertical, 4)
    }
}

private struct PersonalMobileSongDetail: View {
    @State private var song: MobileSong
    let openPractice: (PracticePattern) -> Void
    let onSave: ((MobileSong) -> Bool)?
    let onExport: (MobileSong) -> Void

    init(song: MobileSong, openPractice: @escaping (PracticePattern) -> Void,
         onSave: ((MobileSong) -> Bool)?, onExport: @escaping (MobileSong) -> Void) {
        _song = State(initialValue: song)
        self.openPractice = openPractice
        self.onSave = onSave
        self.onExport = onExport
    }

    var body: some View {
        List {
            Section("Song details") {
                LabeledContent("Artist", value: song.artist)
                LabeledContent("Difficulty", value: song.difficulty)
                LabeledContent("Meter", value: song.meter)
                LabeledContent("Starting tempo", value: "\(song.bpm) BPM")
                if !song.tags.isEmpty { Text(song.tags.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
            }
            if !song.notes.isEmpty { Section("About this song") { Text(song.notes) } }
            if let onSave {
                Section {
                    NavigationLink {
                        MobileSongProjectEditor(song: song) { updatedSong in
                            guard onSave(updatedSong) else { return false }
                            song = updatedSong
                            return true
                        }
                    } label: {
                        Label("Edit song project", systemImage: "pencil")
                    }
                }
            }
            if let source = song.source, let url = source.url, let attribution = source.attribution, !attribution.isEmpty {
                Section("Source attribution") {
                    Text(attribution)
                    if !source.title.isNilOrEmpty { Text(source.title ?? "").font(.caption).foregroundStyle(.secondary) }
                    if !source.authorization.isNilOrEmpty { Text(source.authorization ?? "").font(.caption).foregroundStyle(.secondary) }
                    if !url.isEmpty { Text(url).font(.caption).textSelection(.enabled) }
                }
            }
            ForEach(song.sections) { section in
                Section(section.name) {
                    if let notes = section.notes, !notes.isEmpty { Text(notes).font(.subheadline).foregroundStyle(.secondary) }
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
            Section {
                Button("Export song JSON", systemImage: "square.and.arrow.up") { onExport(song) }
            } footer: {
                Text("This file uses the shared Drum Hero song format and can be imported into the web Song Library.")
            }
        }
        .navigationTitle(song.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct MobileSongProjectEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var song: MobileSong
    let onSave: (MobileSong) -> Bool

    init(song: MobileSong, onSave: @escaping (MobileSong) -> Bool) {
        _song = State(initialValue: song)
        self.onSave = onSave
    }

    var body: some View {
        Form {
            Section("Song details") {
                TextField("Title", text: $song.title)
                    .textInputAutocapitalization(.words)
                TextField("Artist or source", text: $song.artist)
                    .textInputAutocapitalization(.words)
                Picker("Difficulty", selection: $song.difficulty) {
                    ForEach(LearnerLevel.allCases) { level in Text(level.rawValue).tag(level.rawValue) }
                }
                Stepper(value: $song.bpm, in: 40...200) { Text("Tempo · \(song.bpm) BPM") }
                TextField("Meter", text: $song.meter)
                TextField("Tags, separated by commas", text: Binding(
                    get: { song.tags.joined(separator: ", ") },
                    set: { song.tags = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.prefix(12).map { $0 } }
                ))
                TextField("Notes", text: $song.notes, axis: .vertical)
                    .lineLimit(3...8)
            }

            Section("Arrangement sections") {
                ForEach($song.sections) { $section in
                    NavigationLink {
                        MobileSongSectionEditor(section: $section, defaultBpm: song.bpm)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(section.name).font(.headline)
                            Text("\(section.parts.count) parts · \(section.kind ?? "other")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { song.sections.remove(atOffsets: $0) }
                Button("Add section", systemImage: "plus") {
                    let part = MobileSongPart(id: UUID().uuidString, name: "Main groove", bpm: song.bpm,
                                              beats: 4, subdivision: 16, meter: song.meter, hits: [])
                    song.sections.append(MobileSongSection(id: UUID().uuidString, name: "New section",
                                                           bpm: nil, parts: [part], kind: "other", notes: ""))
                }
                .disabled(song.sections.count >= 32)
            }

            Section {
                Text("Native editing supports kick, snare, hi-hat, tom, and crash. Other web voices remain unsupported on iOS.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Edit Song")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { if onSave(song) { dismiss() } }
                    .disabled(song.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              song.artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}

private struct MobileSongSectionEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var section: MobileSongSection
    let defaultBpm: Int
    private let kinds = ["intro", "verse", "chorus", "bridge", "fill", "outro", "other"]

    var body: some View {
        Form {
            Section("Section details") {
                TextField("Name", text: $section.name)
                Picker("Section type", selection: Binding(
                    get: { section.kind ?? "other" },
                    set: { section.kind = $0 }
                )) {
                    ForEach(kinds, id: \.self) { kind in Text(kind.capitalized).tag(kind) }
                }
                Stepper(value: Binding(
                    get: { section.bpm ?? defaultBpm },
                    set: { section.bpm = $0 }
                ), in: 40...200) {
                    Text("Section tempo · \(section.bpm ?? defaultBpm) BPM")
                }
                TextField("Section notes", text: Binding(
                    get: { section.notes ?? "" },
                    set: { section.notes = $0 }
                ), axis: .vertical)
                    .lineLimit(2...5)
            }

            Section("Drum parts") {
                ForEach($section.parts) { $part in
                    NavigationLink {
                        MobileSongPartEditor(part: $part)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(part.name).font(.headline)
                            Text("\(part.bpm) BPM · \(part.hits.count) hits")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { section.parts.remove(atOffsets: $0) }
                Button("Add drum part", systemImage: "plus") {
                    let part = MobileSongPart(id: UUID().uuidString, name: "New part", bpm: section.bpm ?? defaultBpm,
                                              beats: 4, subdivision: 16, meter: "4/4", hits: [])
                    section.parts.append(part)
                }
                .disabled(section.parts.count >= 256)
            }
        }
        .navigationTitle(section.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }
}

private struct MobileSongPartEditor: View {
    @Binding var part: MobileSongPart
    private let subdivisions = [4, 8, 12, 16]
    private var stepCount: Int { Int((part.beats * Double(part.subdivision) / 4).rounded()) }

    var body: some View {
        Form {
            Section("Part settings") {
                TextField("Part name", text: $part.name)
                Stepper(value: $part.bpm, in: 40...200) { Text("Tempo · \(part.bpm) BPM") }
                Stepper(value: $part.beats, in: 0.5...32, step: 0.5) { Text("Length · \(part.beats.formatted()) beats") }
                Picker("Subdivision", selection: $part.subdivision) {
                    ForEach(validSubdivisions, id: \.self) { value in Text("\(value) per beat").tag(value) }
                }
                TextField("Meter", text: $part.meter)
            }

            Section {
                ForEach(0..<max(0, stepCount), id: \.self) { step in
                    HStack(spacing: 10) {
                        Text("\(step + 1)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(width: 28, alignment: .leading)
                        ForEach(DrumVoice.allCases) { voice in
                            let active = part.hits.contains { $0.step == step && $0.instrument == voice }
                            Button {
                                toggleHit(step: step, voice: voice)
                            } label: {
                                Text(String(voice.title.prefix(1)))
                                    .font(.caption.bold())
                                    .frame(maxWidth: .infinity, minHeight: 34)
                                    .background(active ? DrumHeroStyle.accent : Color.secondary.opacity(0.12), in: Circle())
                                    .foregroundStyle(active ? Color.primary : Color.secondary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Step \(step + 1), \(voice.title)")
                            .accessibilityValue(active ? "Hit" : "Rest")
                            .accessibilityHint("Double-tap to toggle this drum hit")
                            .disabled(!active && part.hits.count >= 256)
                        }
                    }
                }
            } header: {
                Text("Pattern · \(stepCount) steps")
            } footer: {
                Text("Tap a voice at a step to add or remove its hit. H means hi-hat. Each part can contain up to 256 hits.")
            }
        }
        .navigationTitle(part.name)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: part.beats) { _, _ in
            ensureValidSubdivision()
            trimOutOfRangeHits()
        }
        .onChange(of: part.subdivision) { _, _ in trimOutOfRangeHits() }
    }

    private var validSubdivisions: [Int] {
        subdivisions.filter { (part.beats * Double($0) / 4).rounded() == part.beats * Double($0) / 4 }
    }

    private func toggleHit(step: Int, voice: DrumVoice) {
        if let index = part.hits.firstIndex(where: { $0.step == step && $0.instrument == voice }) {
            part.hits.remove(at: index)
        } else {
            part.hits.append(PatternHit(step: step, instrument: voice))
        }
    }

    private func trimOutOfRangeHits() {
        part.hits.removeAll { $0.step >= stepCount }
    }

    private func ensureValidSubdivision() {
        guard !validSubdivisions.contains(part.subdivision), let replacement = validSubdivisions.last else { return }
        part.subdivision = replacement
    }
}

private extension Optional where Wrapped == String {
    var isNilOrEmpty: Bool { self?.isEmpty ?? true }
}
