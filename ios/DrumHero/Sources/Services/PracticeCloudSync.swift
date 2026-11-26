import Foundation
import Security
import SwiftData
import SwiftUI

struct PracticeCloudSession: Codable {
    var accessToken: String
    var refreshToken: String
    var userID: String
    var email: String
    var expiresAt: Date?
}

struct PracticeCloudSnapshot {
    var revision: Int
    var state: [String: Any]
    var deviceName: String
    var updatedAt: String
}

enum PracticeCloudSyncError: LocalizedError {
    case notConfigured
    case invalidResponse
    case request(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Set DRUM_HERO_SUPABASE_URL and DRUM_HERO_SUPABASE_PUBLISHABLE_KEY in the iOS build settings to enable account sync."
        case .invalidResponse: "The cloud response could not be read."
        case .request(let message): message
        }
    }
}

struct NativeSongCloudLibrary: Identifiable {
    var id: String
    var name: String
    var ownerID: String
    var revision: Int
    var state: [String: Any]
    var updatedAt: String
}

@MainActor
enum PracticeCloudSyncService {
    private static let keychainService = "com.codingmonkey.drumhero.practice-cloud"

    static var configurationAvailable: Bool {
        guard let values = configuration() else { return false }
        return !values.url.isEmpty && !values.key.isEmpty
    }

    private static func configuration() -> (url: String, key: String)? {
        guard let url = Bundle.main.object(forInfoDictionaryKey: "DrumHeroSupabaseURL") as? String,
              let key = Bundle.main.object(forInfoDictionaryKey: "DrumHeroSupabasePublishableKey") as? String,
              !url.hasPrefix("$"), !key.hasPrefix("$"),
              URL(string: url)?.scheme?.hasPrefix("http") == true, !key.isEmpty else { return nil }
        return (url.trimmingCharacters(in: CharacterSet(charactersIn: "/")), key)
    }

    static func storedSession() -> PracticeCloudSession? {
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: keychainService,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        query[kSecAttrAccount as String] = "session"
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(PracticeCloudSession.self, from: data)
    }

    static func freshSession() async throws -> PracticeCloudSession {
        guard let current = storedSession(), let config = configuration() else { throw PracticeCloudSyncError.notConfigured }
        if let expiresAt = current.expiresAt, expiresAt > Date.now.addingTimeInterval(60) { return current }
        var request = URLRequest(url: URL(string: "\(config.url)/auth/v1/token?grant_type=refresh_token")!)
        request.httpMethod = "POST"
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": current.refreshToken])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if [400, 401, 403].contains(http.statusCode) { signOut() }
            throw responseError(data)
        }
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = value["access_token"] as? String,
              let refreshToken = value["refresh_token"] as? String,
              let user = value["user"] as? [String: Any] else { throw PracticeCloudSyncError.invalidResponse }
        let refreshed = PracticeCloudSession(accessToken: accessToken, refreshToken: refreshToken,
            userID: user["id"] as? String ?? current.userID, email: user["email"] as? String ?? current.email,
            expiresAt: Date.now.addingTimeInterval(value["expires_in"] as? TimeInterval ?? 3600))
        try store(refreshed)
        return refreshed
    }

    private static func store(_ session: PracticeCloudSession) throws {
        let data = try JSONEncoder().encode(session)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: keychainService,
                                    kSecAttrAccount as String: "session"]
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var create = query
            create[kSecValueData as String] = data
            create[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(create as CFDictionary, nil) == errSecSuccess else { throw PracticeCloudSyncError.request("Could not save the sign-in session to Keychain.") }
        } else if status != errSecSuccess {
            throw PracticeCloudSyncError.request("Could not update the sign-in session in Keychain.")
        }
    }

    static func signOut() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: keychainService,
                                    kSecAttrAccount as String: "session"]
        SecItemDelete(query as CFDictionary)
    }

    static func signIn(email: String, password: String) async throws -> PracticeCloudSession {
        guard let config = configuration() else { throw PracticeCloudSyncError.notConfigured }
        let url = URL(string: "\(config.url)/auth/v1/token?grant_type=password")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw responseError(data) }
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = value["access_token"] as? String,
              let refreshToken = value["refresh_token"] as? String,
              let user = value["user"] as? [String: Any],
              let userID = user["id"] as? String else { throw PracticeCloudSyncError.invalidResponse }
        let session = PracticeCloudSession(accessToken: accessToken, refreshToken: refreshToken,
                                           userID: userID, email: user["email"] as? String ?? email,
                                           expiresAt: Date.now.addingTimeInterval(value["expires_in"] as? TimeInterval ?? 3600))
        try store(session)
        return session
    }

    static func review(profileID: String) async throws -> PracticeCloudSnapshot? {
        guard let config = configuration() else { throw PracticeCloudSyncError.notConfigured }
        let session = try await freshSession()
        var components = URLComponents(string: "\(config.url)/rest/v1/drum_practice_snapshots")!
        components.queryItems = [URLQueryItem(name: "select", value: "revision,state,device_name,updated_at"),
                                 URLQueryItem(name: "local_profile_id", value: "eq.\(profileID)")]
        var request = URLRequest(url: components.url!)
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw responseError(data) }
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw PracticeCloudSyncError.invalidResponse }
        guard let row = rows.first else { return nil }
        guard let revision = row["revision"] as? Int,
              let state = row["state"] as? [String: Any],
              state["progress"] is [String: Any], state["trainer"] is [String: Any] else { throw PracticeCloudSyncError.invalidResponse }
        return PracticeCloudSnapshot(revision: revision, state: state,
                                     deviceName: row["device_name"] as? String ?? "",
                                     updatedAt: row["updated_at"] as? String ?? "")
    }

    static func save(profileID: String, learnerName: String, deviceName: String,
                     expectedRevision: Int, state: [String: Any]) async throws -> PracticeCloudSnapshot {
        guard let config = configuration() else { throw PracticeCloudSyncError.notConfigured }
        let session = try await freshSession()
        var request = URLRequest(url: URL(string: "\(config.url)/rest/v1/rpc/save_drum_practice_snapshot")!)
        request.httpMethod = "POST"
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_local_profile_id": profileID,
            "p_expected_revision": expectedRevision,
            "p_learner_name": String(learnerName.prefix(60)),
            "p_device_name": String(deviceName.prefix(80)),
            "p_state": state
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw responseError(data) }
        let object = try JSONSerialization.jsonObject(with: data)
        let row = (object as? [[String: Any]])?.first ?? object as? [String: Any]
        guard let row, let revision = row["revision"] as? Int,
              let savedState = row["state"] as? [String: Any] else { throw PracticeCloudSyncError.invalidResponse }
        return PracticeCloudSnapshot(revision: revision, state: savedState,
                                     deviceName: row["device_name"] as? String ?? deviceName,
                                     updatedAt: row["updated_at"] as? String ?? "")
    }

    static func songLibraries() async throws -> [NativeSongCloudLibrary] {
        guard let config = configuration() else { throw PracticeCloudSyncError.notConfigured }
        let session = try await freshSession()
        var libraryComponents = URLComponents(string: "\(config.url)/rest/v1/drum_libraries")!
        libraryComponents.queryItems = [
            URLQueryItem(name: "select", value: "id,name,owner_id,revision,state,share_scope,updated_at"),
            URLQueryItem(name: "order", value: "name.asc")
        ]
        var libraryRequest = URLRequest(url: libraryComponents.url!)
        libraryRequest.setValue(config.key, forHTTPHeaderField: "apikey")
        libraryRequest.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let (libraryData, libraryResponse) = try await URLSession.shared.data(for: libraryRequest)
        guard let libraryHTTP = libraryResponse as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(libraryHTTP.statusCode) else { throw responseError(libraryData) }
        guard let rows = try JSONSerialization.jsonObject(with: libraryData) as? [[String: Any]] else { throw PracticeCloudSyncError.invalidResponse }

        var memberComponents = URLComponents(string: "\(config.url)/rest/v1/drum_library_members")!
        memberComponents.queryItems = [
            URLQueryItem(name: "select", value: "library_id,role"),
            URLQueryItem(name: "user_id", value: "eq.\(session.userID)")
        ]
        var memberRequest = URLRequest(url: memberComponents.url!)
        memberRequest.setValue(config.key, forHTTPHeaderField: "apikey")
        memberRequest.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let (memberData, memberResponse) = try await URLSession.shared.data(for: memberRequest)
        guard let memberHTTP = memberResponse as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(memberHTTP.statusCode) else { throw responseError(memberData) }
        let memberRows = (try? JSONSerialization.jsonObject(with: memberData)) as? [[String: Any]] ?? []
        let roles = Dictionary(uniqueKeysWithValues: memberRows.compactMap { row -> (String, String)? in
            guard let libraryID = row["library_id"] as? String, let role = row["role"] as? String else { return nil }
            return (libraryID, role)
        })

        return rows.compactMap { row in
            guard let id = row["id"] as? String,
                  let name = row["name"] as? String,
                  let ownerID = row["owner_id"] as? String,
                  let revision = row["revision"] as? Int,
                  let state = row["state"] as? [String: Any],
                  (state["version"] as? Int) == 1,
                  state["songs"] is [Any],
                  (row["share_scope"] as? Bool) != true,
                  ownerID == session.userID || roles[id] == "editor" else { return nil }
            return NativeSongCloudLibrary(id: id, name: name, ownerID: ownerID, revision: revision,
                                          state: state, updatedAt: row["updated_at"] as? String ?? "")
        }
    }

    static func saveSongLibrary(id: String, revision: Int, state: [String: Any], deviceName: String) async throws -> PracticeCloudSnapshot {
        guard let config = configuration() else { throw PracticeCloudSyncError.notConfigured }
        let session = try await freshSession()
        var request = URLRequest(url: URL(string: "\(config.url)/rest/v1/rpc/save_drum_library")!)
        request.httpMethod = "POST"
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_library_id": id,
            "p_revision": revision,
            "p_state": state,
            "p_device_name": String(deviceName.prefix(80))
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PracticeCloudSyncError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw responseError(data) }
        let object = try JSONSerialization.jsonObject(with: data)
        let row = (object as? [[String: Any]])?.first ?? object as? [String: Any]
        guard let row, let savedRevision = row["revision"] as? Int,
              let savedState = row["state"] as? [String: Any] else { throw PracticeCloudSyncError.invalidResponse }
        return PracticeCloudSnapshot(revision: savedRevision, state: savedState,
                                     deviceName: row["device_name"] as? String ?? deviceName,
                                     updatedAt: row["updated_at"] as? String ?? "")
    }

    private static func responseError(_ data: Data) -> PracticeCloudSyncError {
        if let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let message = (value["msg"] as? String) ?? (value["message"] as? String) ?? (value["error_description"] as? String) ?? (value["error"] as? String)
            if let message, !message.isEmpty { return .request(message) }
        }
        return .request("The cloud request failed. Check the connection, account, and database migration.")
    }
}

@MainActor
struct NativePracticeCloudSyncView: View {
    let content: MobileContentDocument
    @Environment(\.modelContext) private var modelContext
    @AppStorage("drumHero.practiceBpm") private var preferredBpm = 80
    @AppStorage("drumHero.cloudProfileID") private var profileID = "default"
    @AppStorage("drumHero.portableTrainerRoutineJSON") private var portableTrainerRoutineJSON = ""
    @AppStorage("drumHero.portableTrainerCueSequencesJSON") private var portableTrainerCueSequencesJSON = "[]"
    @AppStorage("drumHero.portableTrainerCoachFeedbackJSON") private var portableTrainerCoachFeedbackJSON = "[]"
    @Query private var lessons: [LessonProgressRecord]
    @Query(sort: \PracticeSessionRecord.playedAt, order: .reverse) private var sessions: [PracticeSessionRecord]
    @Query private var bests: [PatternBestRecord]
    @Query(sort: \TrainerRoundRecord.playedAt, order: .reverse) private var trainerRounds: [TrainerRoundRecord]
    @State private var email = ""
    @State private var password = ""
    @State private var learnerName = "This device"
    @State private var deviceName = "iOS device"
    @State private var signedInEmail: String?
    @State private var snapshot: PracticeCloudSnapshot?
    @State private var busy = false
    @State private var message = ""

    private var syncProfileID: String {
        String(profileID.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sign in with the same account as the web app. Use the same learner profile code on both devices. Trainer summaries, routines, cue sequences, and coach notes sync; audio, per-hit timing, and device calibration stay local.")
                .font(.footnote).foregroundStyle(.secondary)
            if !PracticeCloudSyncService.configurationAvailable {
                Text("Cloud sync needs DRUM_HERO_SUPABASE_URL and DRUM_HERO_SUPABASE_PUBLISHABLE_KEY in the iOS build settings, plus database migration 202610210001.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let signedInEmail {
                LabeledContent("Account", value: signedInEmail)
                TextField("Learner profile code", text: $profileID)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .accessibilityHint("Use the same profile code shown in the web app's practice sync panel. The default profile code is default.")
                TextField("Learner name", text: $learnerName).textContentType(.name)
                TextField("Device label", text: $deviceName).textInputAutocapitalization(.words)
                Button("Review cloud progress", systemImage: "arrow.clockwise") { Task { await review() } }.disabled(busy || syncProfileID.isEmpty)
                if let snapshot {
                    Text("Revision \(snapshot.revision) · \(snapshot.deviceName.isEmpty ? "unnamed device" : snapshot.deviceName) · \(snapshot.updatedAt.isEmpty ? "" : snapshot.updatedAt)")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("Merge cloud progress into this device", systemImage: "arrow.down.doc") { mergeRemote(snapshot.state) }.disabled(busy)
                    Button("Merge both and sync", systemImage: "arrow.triangle.2.circlepath") { Task { await syncMerged(snapshot) } }.disabled(busy)
                } else if message.contains("No cloud snapshot") {
                    Button("Create cloud snapshot from this device", systemImage: "icloud.and.arrow.up") { Task { await createSnapshot() } }.disabled(busy)
                }
                Button("Sign out", role: .destructive) { PracticeCloudSyncService.signOut(); self.signedInEmail = nil; snapshot = nil; message = "Signed out. Local progress remains on this device." }
                    .disabled(busy)
            } else {
                TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Password", text: $password).textContentType(.password)
                Button("Sign in", systemImage: "person.crop.circle") { Task { await signIn() } }.disabled(busy || email.isEmpty || password.isEmpty || !PracticeCloudSyncService.configurationAvailable)
            }
            if !message.isEmpty { Text(message).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
        }
        .onAppear {
            signedInEmail = PracticeCloudSyncService.storedSession()?.email
        }
    }

    @MainActor private func signIn() async {
        busy = true; defer { busy = false }
        do { let session = try await PracticeCloudSyncService.signIn(email: email, password: password); signedInEmail = session.email; password = ""; message = "Signed in. Review the cloud snapshot before merging or syncing." }
        catch { message = error.localizedDescription }
    }

    @MainActor private func review() async {
        busy = true; defer { busy = false }
        do {
            snapshot = try await PracticeCloudSyncService.review(profileID: syncProfileID)
            if let snapshot { message = "Reviewed revision \(snapshot.revision). Choose whether to merge it into this device or merge both copies and sync." }
            else { message = "No cloud snapshot exists for this profile yet." }
        } catch { snapshot = nil; signedInEmail = PracticeCloudSyncService.storedSession()?.email; message = error.localizedDescription }
    }

    @MainActor private func createSnapshot() async {
        busy = true; defer { busy = false }
        do {
            let state = mergedState(cloudState: nil)
            snapshot = try await PracticeCloudSyncService.save(profileID: syncProfileID, learnerName: learnerName, deviceName: deviceName, expectedRevision: 0, state: state)
            message = "Cloud snapshot created at revision \(snapshot?.revision ?? 1)."
        } catch { signedInEmail = PracticeCloudSyncService.storedSession()?.email; message = error.localizedDescription }
    }

    @MainActor private func syncMerged(_ cloud: PracticeCloudSnapshot) async {
        busy = true; defer { busy = false }
        do {
            let state = mergedState(cloudState: cloud.state)
            snapshot = try await PracticeCloudSyncService.save(profileID: syncProfileID, learnerName: learnerName, deviceName: deviceName, expectedRevision: cloud.revision, state: state)
            guard let savedState = snapshot?.state else { message = "The cloud saved the merge, but its response could not be read back. Review the latest revision before continuing."; return }
            guard mergeRemote(savedState) else { return }
            message = "Both devices’ lesson, Practice Pad, and Trainer round summaries were merged at cloud revision \(snapshot?.revision ?? cloud.revision + 1). Device calibration and audio remain local."
        } catch {
            snapshot = nil
            signedInEmail = PracticeCloudSyncService.storedSession()?.email
            message = error.localizedDescription.contains("Revision conflict") ? "The cloud changed after review. Review the latest revision, then merge again." : error.localizedDescription
        }
    }

    @MainActor @discardableResult private func mergeRemote(_ state: [String: Any]) -> Bool {
        guard let remote = state["progress"] as? [String: Any] else { message = "This cloud snapshot has no compatible progress data."; return false }
        let lessonIDs = Set(content.lessons.map(\.id))
        let patternIDs = Set(content.practicePatterns.map(\.id))
        let remoteLessons = (remote["completedLessons"] as? [String] ?? []).filter(lessonIDs.contains)
        let completionDates = remote["lessonCompletedAt"] as? [String: String] ?? [:]
        let existingLessons = Dictionary(uniqueKeysWithValues: ((try? modelContext.fetch(FetchDescriptor<LessonProgressRecord>())) ?? []).map { ($0.lessonID, $0) })
        for id in remoteLessons {
            let date = completionDates[id].flatMap(Self.date(from:))
            if let record = existingLessons[id] { if record.completedAt == nil { record.completedAt = date ?? .now } }
            else { modelContext.insert(LessonProgressRecord(lessonID: id, completedAt: date ?? .now)) }
        }
        var existingSessions = Dictionary(uniqueKeysWithValues: ((try? modelContext.fetch(FetchDescriptor<PracticeSessionRecord>())) ?? []).map { ($0.id, $0) })
        let rawSessions = remote["sessions"] as? [[String: Any]] ?? []
        for item in rawSessions {
            guard let id = item["id"] as? String, let patternID = item["patternId"] as? String, patternIDs.contains(patternID),
                  let name = item["patternName"] as? String, let bpm = item["bpm"] as? Int,
                  let dateText = item["playedAt"] as? String, let date = Self.date(from: dateText),
                  let score = item["score"] as? Int, let accuracy = item["accuracy"] as? Int else { continue }
            let result = PracticeResult(id: id, patternID: patternID, patternName: name, bpm: bpm, playedAt: date,
                                        score: score, accuracy: accuracy, great: item["great"] as? Int ?? 0,
                                        good: item["good"] as? Int ?? 0, miss: item["miss"] as? Int ?? 0,
                                        extra: item["extra"] as? Int ?? 0, maxCombo: item["maxCombo"] as? Int ?? 0)
            if let existing = existingSessions[id] {
                existing.patternID = patternID; existing.patternName = name; existing.bpm = bpm; existing.playedAt = date
                existing.score = score; existing.accuracy = accuracy; existing.great = result.great; existing.good = result.good
                existing.miss = result.miss; existing.extra = result.extra; existing.maxCombo = result.maxCombo
            } else { let record = PracticeSessionRecord(result); modelContext.insert(record); existingSessions[id] = record }
        }
        let remoteBests = remote["bestScores"] as? [String: Int] ?? [:]
        var existingBests = Dictionary(uniqueKeysWithValues: ((try? modelContext.fetch(FetchDescriptor<PatternBestRecord>())) ?? []).map { ($0.patternID, $0) })
        for (patternID, score) in remoteBests where patternIDs.contains(patternID) {
            if let current = existingBests[patternID] { current.score = max(current.score, score) }
            else { let best = PatternBestRecord(patternID: patternID, patternName: patternID, score: score); modelContext.insert(best); existingBests[patternID] = best }
        }
        var existingTrainerRounds = Dictionary(uniqueKeysWithValues: ((try? modelContext.fetch(FetchDescriptor<TrainerRoundRecord>())) ?? []).map { ($0.id, $0) })
        let remoteTrainer = state["trainer"] as? [String: Any] ?? [:]
        for item in remoteTrainer["rounds"] as? [[String: Any]] ?? [] {
            guard let id = item["id"] as? String, !id.isEmpty, let patternID = item["patternId"] as? String,
                  let name = item["patternName"] as? String, let bpm = item["bpm"] as? Int,
                  let dateText = item["playedAt"] as? String, let playedAt = Self.date(from: dateText),
                  let mode = item["mode"] as? String, let repetitions = item["repetitions"] as? Int else { continue }
            let ratings = (item["ratings"] as? [String] ?? []).compactMap(TrainerRating.init(rawValue:))
            let result = item["result"] as? [String: Any]
            let adaptation = item["adaptation"] as? String
            if let record = existingTrainerRounds[id] {
                record.patternID = patternID; record.patternName = name; record.bpm = bpm; record.playedAt = playedAt
                record.mode = mode; record.repetitions = repetitions
                record.ratingsData = (try? JSONEncoder().encode(ratings)) ?? record.ratingsData
                if let result { record.score = result["score"] as? Int; record.accuracy = result["accuracy"] as? Int }
                record.assessmentAdaptation = adaptation
            } else {
                let record = TrainerRoundRecord(id: id, patternID: patternID, patternName: name, bpm: bpm,
                    playedAt: playedAt, mode: mode, repetitions: repetitions, ratings: ratings,
                    score: result?["score"] as? Int, accuracy: result?["accuracy"] as? Int,
                    assessmentAdaptation: adaptation)
                modelContext.insert(record); existingTrainerRounds[id] = record
            }
        }
        var routineJSONToApply: String?
        if let routine = remoteTrainer["routine"], let data = try? JSONSerialization.data(withJSONObject: routine), let json = String(data: data, encoding: .utf8) {
            routineJSONToApply = json
        }
        var cueSequencesJSONToApply: String?
        if let cues = remoteTrainer["cueSequences"] {
            cueSequencesJSONToApply = mergedArrayJSON(local: portableTrainerCueSequencesJSON, remote: cues, limit: 30)
        }
        var coachFeedbackJSONToApply: String?
        if let feedback = remoteTrainer["coachFeedback"] {
            coachFeedbackJSONToApply = mergedArrayJSON(local: portableTrainerCoachFeedbackJSON, remote: feedback, limit: 100)
        }
        let remoteSight = SightHistory.decodeCloud(state["sightReading"] as? [[String: Any]] ?? [])
        let mergedSight = SightHistory.merge(SightHistory.read(), remoteSight)
        let all = (try? modelContext.fetch(FetchDescriptor<PracticeSessionRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)]))) ?? []
        for stale in all.dropFirst(50) { modelContext.delete(stale) }
        let allTrainerRounds = (try? modelContext.fetch(FetchDescriptor<TrainerRoundRecord>(sortBy: [SortDescriptor(\.playedAt, order: .reverse)]))) ?? []
        for stale in allTrainerRounds.dropFirst(1_000) { modelContext.delete(stale) }
        do {
            try modelContext.save()
            try SightHistory.write(mergedSight)
            if let routineJSONToApply { portableTrainerRoutineJSON = routineJSONToApply }
            if let cueSequencesJSONToApply { portableTrainerCueSequencesJSON = cueSequencesJSONToApply }
            if let coachFeedbackJSONToApply { portableTrainerCoachFeedbackJSON = coachFeedbackJSONToApply }
            preferredBpm = min(200, max(40, remote["settings"].flatMap { ($0 as? [String: Any])?["preferredBpm"] as? Int } ?? preferredBpm))
            message = "Cloud lesson, practice, Trainer, and sight-reading histories merged into this device. Device calibration stayed local."
            return true
        }
        catch { modelContext.rollback(); message = "Could not save the merged progress locally: \(error.localizedDescription)"; return false }
    }

    private func mergedState(cloudState: [String: Any]?) -> [String: Any] {
        let cloudProgress = cloudState?["progress"] as? [String: Any] ?? [:]
        let localLessons = lessons.filter { $0.completedAt != nil }
        let cloudLessonIDs = cloudProgress["completedLessons"] as? [String] ?? []
        let completed = Array(Set(cloudLessonIDs + localLessons.map(\.lessonID))).sorted()
        var completedAt = cloudProgress["lessonCompletedAt"] as? [String: String] ?? [:]
        let formatter = ISO8601DateFormatter()
        for lesson in localLessons where completedAt[lesson.lessonID] == nil { completedAt[lesson.lessonID] = formatter.string(from: lesson.completedAt ?? .now) }
        let cloudSessions = cloudProgress["sessions"] as? [[String: Any]] ?? []
        var sessionsByID = Dictionary(uniqueKeysWithValues: cloudSessions.compactMap { row in (row["id"] as? String).map { ($0, row) } })
        for record in sessions.prefix(50) {
            sessionsByID[record.id] = ["id": record.id, "patternId": record.patternID, "patternName": record.patternName,
                "bpm": record.bpm, "playedAt": formatter.string(from: record.playedAt), "score": record.score,
                "accuracy": record.accuracy, "great": record.great, "good": record.good, "miss": record.miss,
                "extra": record.extra, "maxCombo": record.maxCombo]
        }
        let mergedSessions = sessionsByID.values.sorted { ($0["playedAt"] as? String ?? "") > ($1["playedAt"] as? String ?? "") }.prefix(50)
        var mergedBests = cloudProgress["bestScores"] as? [String: Int] ?? [:]
        for best in bests { mergedBests[best.patternID] = max(mergedBests[best.patternID] ?? 0, best.score) }
        for session in mergedSessions { if let id = session["patternId"] as? String, let score = session["score"] as? Int { mergedBests[id] = max(mergedBests[id] ?? 0, score) } }
        var dates = Set(cloudProgress["practiceDates"] as? [String] ?? [])
        let day = DateFormatter(); day.calendar = Calendar(identifier: .gregorian); day.locale = Locale(identifier: "en_US_POSIX"); day.timeZone = .current; day.dateFormat = "yyyy-MM-dd"
        for session in mergedSessions { if let raw = session["playedAt"] as? String, let date = Self.date(from: raw) { dates.insert(day.string(from: date)) } }
        let progress: [String: Any] = ["version": 1, "completedLessons": completed, "lessonCompletedAt": completedAt,
            "sessions": Array(mergedSessions), "bestScores": mergedBests, "practiceDates": dates.sorted(),
            "settings": ["sound": true, "preferredBpm": preferredBpm]]
        let cloudTrainer = cloudState?["trainer"] as? [String: Any] ?? [:]
        let cloudSight = SightHistory.decodeCloud(cloudState?["sightReading"] as? [[String: Any]] ?? [])
        let mergedSight = SightHistory.merge(SightHistory.read(), cloudSight)
        var trainerRoundsByID = Dictionary<String, [String: Any]>(uniqueKeysWithValues: (cloudTrainer["rounds"] as? [[String: Any]] ?? []).compactMap { raw -> (String, [String: Any])? in
            guard let item = portableTrainerRound(raw), let id = item["id"] as? String else { return nil }
            return (id, item)
        })
        for record in trainerRounds.prefix(1_000) {
            let playedAt = formatter.string(from: record.playedAt)
            let profile = record.inputProfile?.lowercased() ?? ""
            let source = profile.contains("midi") ? "midi" : profile.contains("audio") || profile.contains("microphone") ? "audio-voices" : "touch"
            let result: Any = if let score = record.score, let accuracy = record.accuracy {
                ["id": record.id, "patternId": record.patternID, "patternName": record.patternName, "bpm": record.bpm,
                 "playedAt": playedAt, "score": score, "accuracy": accuracy, "great": 0, "good": 0, "miss": 0, "extra": 0, "maxCombo": 0]
            } else { NSNull() }
            var item: [String: Any] = ["id": record.id, "patternId": record.patternID, "patternName": record.patternName,
                "bpm": record.bpm, "playedAt": playedAt, "mode": record.mode.hasPrefix("scored") ? "scored" : "self",
                "source": source, "ratings": record.ratings.map(\.rawValue), "repetitions": record.repetitions,
                "result": result, "summaryOnly": true]
            if record.assessmentAdaptation == "hands-only" { item["adaptation"] = "seated" }
            else if record.assessmentAdaptation == "single-voice" { item["adaptation"] = "single-voice" }
            else if record.assessmentAdaptation == "standard" { item["adaptation"] = "standard" }
            trainerRoundsByID[record.id] = item
        }
        let mergedTrainerRounds = trainerRoundsByID.values.sorted { ($0["playedAt"] as? String ?? "") > ($1["playedAt"] as? String ?? "") }.prefix(1_000)
        var trainer: [String: Any] = ["version": 2, "rounds": Array(mergedTrainerRounds), "latencyMs": 0,
            "midiMap": ["35": "kick", "36": "kick", "38": "snare", "40": "snare", "42": "hihat", "44": "hihat", "46": "hihat", "41": "tom", "43": "tom", "45": "tom", "47": "tom", "48": "tom", "49": "crash", "55": "crash", "57": "crash"], "deviceProfiles": [:]]
        if let routine = jsonObject(from: portableTrainerRoutineJSON) ?? cloudTrainer["routine"] { trainer["routine"] = routine }
        if let cloudCues = cloudTrainer["cueSequences"] { trainer["cueSequences"] = mergeJSONArrays(decodeJSONArray(portableTrainerCueSequencesJSON), cloudCues, limit: 30) ?? cloudCues }
        else if let localCues = decodeJSONArray(portableTrainerCueSequencesJSON) { trainer["cueSequences"] = localCues }
        if let cloudFeedback = cloudTrainer["coachFeedback"] { trainer["coachFeedback"] = mergeJSONArrays(decodeJSONArray(portableTrainerCoachFeedbackJSON), cloudFeedback, limit: 100) ?? cloudFeedback }
        else if let localFeedback = decodeJSONArray(portableTrainerCoachFeedbackJSON) { trainer["coachFeedback"] = localFeedback }
        var output: [String: Any] = ["version": 1, "progress": progress, "trainer": trainer]
        if let earTraining = cloudState?["earTraining"] { output["earTraining"] = earTraining }
        output["sightReading"] = SightHistory.encodeCloud(mergedSight)
        return output
    }

    private func jsonObject(from raw: String) -> Any? {
        guard let data = raw.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private func decodeJSONArray(_ raw: String) -> [[String: Any]]? {
        jsonObject(from: raw) as? [[String: Any]]
    }

    private func mergeJSONArrays(_ local: [[String: Any]]?, _ remote: Any, limit: Int) -> [[String: Any]]? {
        guard let remoteRows = remote as? [[String: Any]] else { return nil }
        var byID: [String: [String: Any]] = [:]
        var orderedIDs: [String] = []
        for item in (local ?? []) + remoteRows {
            guard let id = item["id"] as? String, !id.isEmpty else { continue }
            if byID[id] == nil { orderedIDs.append(id) }
            byID[id] = item
        }
        var merged = orderedIDs.compactMap { byID[$0] }
        if limit == 100 {
            merged.sort { left, right in
                let leftDate = Self.date(from: left["receivedAt"] as? String ?? "") ?? .distantPast
                let rightDate = Self.date(from: right["receivedAt"] as? String ?? "") ?? .distantPast
                return leftDate < rightDate
            }
            return Array(merged.suffix(limit))
        }
        return Array(merged.prefix(max(0, limit)))
    }

    private func mergedArrayJSON(local: String, remote: Any, limit: Int) -> String? {
        guard let rows = mergeJSONArrays(decodeJSONArray(local), remote, limit: limit),
              let data = try? JSONSerialization.data(withJSONObject: rows) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func portableTrainerRound(_ raw: [String: Any]) -> [String: Any]? {
        guard let id = raw["id"] as? String, !id.isEmpty, let patternID = raw["patternId"] as? String,
              let patternName = raw["patternName"] as? String, let bpm = raw["bpm"] as? Int,
              let playedAt = raw["playedAt"] as? String else { return nil }
        let rawMode = raw["mode"] as? String ?? "self"
        let mode = rawMode.hasPrefix("scored") ? "scored" : "self"
        let supportedSources = Set(["keyboard", "touch", "midi", "audio-timing", "audio-voices", "self"])
        let source = (raw["source"] as? String).flatMap { supportedSources.contains($0) ? $0 : nil } ?? "touch"
        let ratings = (raw["ratings"] as? [String] ?? []).filter { ["clean", "needsWork", "missed"].contains($0) }
        var result: Any = NSNull()
        if let score = raw["result"] as? [String: Any], let value = score["score"] as? Int, let accuracy = score["accuracy"] as? Int {
            result = ["id": id, "patternId": patternID, "patternName": patternName, "bpm": bpm,
                "playedAt": playedAt, "score": value, "accuracy": accuracy,
                "great": score["great"] as? Int ?? 0, "good": score["good"] as? Int ?? 0,
                "miss": score["miss"] as? Int ?? 0, "extra": score["extra"] as? Int ?? 0,
                "maxCombo": score["maxCombo"] as? Int ?? 0]
        }
        var item: [String: Any] = ["id": id, "patternId": patternID, "patternName": patternName,
            "bpm": bpm, "playedAt": playedAt, "mode": mode, "source": source,
            "ratings": ratings, "result": result, "summaryOnly": true]
        if let repetitions = raw["repetitions"] as? Int { item["repetitions"] = repetitions }
        if let durationSeconds = raw["durationSeconds"] as? Int { item["durationSeconds"] = durationSeconds }
        if let adaptation = raw["adaptation"] as? String, ["standard", "seated", "single-voice"].contains(adaptation) { item["adaptation"] = adaptation }
        if let feel = raw["feel"] as? String, ["straight", "shuffle", "laid-back", "shuffle-laid-back"].contains(feel) { item["feel"] = feel }
        if let limbFocus = raw["limbFocus"] as? String, ["all", "hands", "feet"].contains(limbFocus) { item["limbFocus"] = limbFocus }
        if let variationId = raw["variationId"] as? String, variationId.count <= 80 { item["variationId"] = variationId }
        if let challenge = raw["backingChallenge"] as? String, ["rock", "funk", "shuffle"].contains(challenge) { item["backingChallenge"] = challenge }
        if let notes = raw["notes"] as? String, notes.count <= 500 { item["notes"] = notes }
        if let tags = raw["tags"] as? [String] { item["tags"] = Array(tags.filter { ["warm-up", "focused", "teacher", "recording-review", "rough-session"].contains($0) }.prefix(5)) }
        if let voicePractice = raw["voicePractice"] as? String, ["all", "single", "layers"].contains(voicePractice) { item["voicePractice"] = voicePractice }
        if let voiceFocus = raw["voiceFocus"] as? String, ["kick", "snare", "hihat", "tom", "crash"].contains(voiceFocus) { item["voiceFocus"] = voiceFocus }
        if let voiceLayerCount = raw["voiceLayerCount"] as? Int, (1...5).contains(voiceLayerCount) { item["voiceLayerCount"] = voiceLayerCount }
        if let handCheck = raw["rudimentHandCheck"] as? Bool { item["rudimentHandCheck"] = handCheck }
        if let transferID = raw["transferFromPatternId"] as? String, transferID.count <= 200 { item["transferFromPatternId"] = transferID }
        if let drill = raw["focusedDrill"] as? [String: Any],
           let instrument = drill["instrument"] as? String, ["kick", "snare", "hihat", "tom", "crash"].contains(instrument),
           let beat = drill["beat"] as? Int, (1...64).contains(beat) {
            var focused: [String: Any] = ["instrument": instrument, "beat": beat]
            if let sourceRoundID = drill["sourceRoundId"] as? String, sourceRoundID.count <= 100 { focused["sourceRoundId"] = sourceRoundID }
            if let sourcePatternID = drill["sourcePatternId"] as? String, sourcePatternID.count <= 200 { focused["sourcePatternId"] = sourcePatternID }
            item["focusedDrill"] = focused
        }
        return item
    }

    private static func date(from value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }
}
