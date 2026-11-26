package com.codingmonkey.drumhero

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.time.Instant
import java.time.LocalDate
import java.io.InputStream
import java.io.ByteArrayOutputStream

data class AndroidPracticeSession(
    val id: String,
    val patternId: String,
    val patternName: String,
    val bpm: Int,
    val playedAt: String,
    val score: Int,
    val accuracy: Int,
    val great: Int,
    val good: Int,
    val miss: Int,
    val extra: Int,
    val maxCombo: Int = 0,
) {
    fun toJson() = JSONObject().apply {
        put("id", id); put("patternId", patternId); put("patternName", patternName); put("bpm", bpm)
        put("playedAt", playedAt); put("score", score); put("accuracy", accuracy); put("great", great)
        put("good", good); put("miss", miss); put("extra", extra); put("maxCombo", maxCombo)
    }
}

data class AndroidArchiveReview(
    val completedLessons: List<Pair<String, String>>,
    val sessions: List<AndroidPracticeSession>,
    val bestScores: Map<String, Int>,
    val preferredBpm: Int,
    val passthrough: JSONObject,
    val ignoredLessons: Int,
    val ignoredSessions: Int,
    val preservedEarResults: Int,
    val preservedTrainerRounds: Int,
    val preservedSightAttempts: Int,
)

private const val ARCHIVE_FORMAT = "drum-hero-learning-archive-v1"
private const val ARCHIVE_LIMIT_BYTES = 32 * 1024 * 1024
private val PORTABLE_SONG_VOICES = setOf("kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine", "custom1", "custom2", "custom3", "custom4", "custom5", "custom6", "custom7", "custom8")

internal fun portableSongPatternId(songId: String, sectionId: String, partId: String, bar: Int): String =
    "song-part-${UUID.nameUUIDFromBytes(JSONArray().put(songId).put(sectionId).put(partId).put(bar).toString().toByteArray(Charsets.UTF_8))}"

internal fun portableSongPartBarCount(song: JSONObject, section: JSONObject, part: JSONObject): Int {
    val meter = part.optString("meter").ifBlank { section.optString("meter").ifBlank { song.optString("meter", "4/4") } }
    val beatsPerBar = meter.substringBefore('/').toIntOrNull()?.coerceIn(1, 12) ?: 4
    val subdivision = part.optInt("subdivision", 16).takeIf { it in setOf(4, 8, 12, 16, 20) } ?: 16
    val stepsPerBar = (beatsPerBar * subdivision / 4.0).toInt().coerceAtLeast(1)
    val hits = part.optJSONArray("hits")
    var maxStep = -1
    if (hits != null) for (index in 0 until hits.length()) maxStep = maxOf(maxStep, hits.optJSONObject(index)?.optInt("step", -1) ?: -1)
    val totalBeats = part.optDouble("beats", beatsPerBar.toDouble()).coerceIn(0.25, 256.0)
    return maxOf(1, kotlin.math.ceil(totalBeats / beatsPerBar).toInt(), kotlin.math.ceil((maxStep + 1).coerceAtLeast(0) / stepsPerBar.toDouble()).toInt()).coerceAtMost(64)
}

internal fun portableSongPatternIds(songs: JSONArray?): Set<String> {
    if (songs == null) return emptySet()
    return buildSet {
        for (songIndex in 0 until songs.length()) {
            val song = songs.optJSONObject(songIndex) ?: continue
            val sections = song.optJSONArray("sections") ?: continue
            for (sectionIndex in 0 until sections.length()) {
                val section = sections.optJSONObject(sectionIndex) ?: continue
                val sectionId = section.optString("id")
                val parts = section.optJSONArray("parts") ?: continue
                for (partIndex in 0 until parts.length()) {
                    val part = parts.optJSONObject(partIndex) ?: continue
                    val partId = part.optString("id")
                    if (song.optString("id").isBlank() || sectionId.isBlank() || partId.isBlank()) continue
                    repeat(portableSongPartBarCount(song, section, part)) { bar -> add(portableSongPatternId(song.getString("id"), sectionId, partId, bar)) }
                }
            }
        }
    }
}

private fun validatePortableSongs(songs: JSONArray) {
    require(songs.length() <= 200) { "The learning archive contains too many personal songs." }
    val songIds = mutableSetOf<String>()
    var totalHits = 0
    var totalParts = 0
    var totalBars = 0
    for (songIndex in 0 until songs.length()) {
        val song = songs.optJSONObject(songIndex) ?: throw IllegalArgumentException("The learning archive contains an invalid personal song.")
        val id = song.optString("id")
        val title = song.optString("title")
        require(id.isNotBlank() && id.length <= 120 && songIds.add(id) && title.isNotBlank() && title.length <= 120 && song.optString("artist").length <= 120) {
            "The learning archive contains an invalid personal song."
        }
        val sections = song.optJSONArray("sections") ?: throw IllegalArgumentException("A personal song is missing its sections.")
        require(sections.length() <= 32) { "A personal song has an invalid number of sections." }
        var songBars = 0
        for (sectionIndex in 0 until sections.length()) {
            val section = sections.optJSONObject(sectionIndex) ?: throw IllegalArgumentException("The learning archive contains an invalid song section.")
            val parts = section.optJSONArray("parts") ?: throw IllegalArgumentException("A song section is missing its parts.")
            require(parts.length() <= 256) { "A song section has an invalid number of parts." }
            for (partIndex in 0 until parts.length()) {
                totalParts += 1
                require(totalParts <= 20_000) { "The learning archive contains too many song parts to browse on Android." }
                val part = parts.optJSONObject(partIndex) ?: throw IllegalArgumentException("The learning archive contains an invalid song part.")
                val beats = part.optDouble("beats", Double.NaN)
                val subdivision = part.optInt("subdivision", -1)
                val hits = part.optJSONArray("hits") ?: throw IllegalArgumentException("A song part is missing its score events.")
                require(beats.isFinite() && beats > 0 && beats <= 32 && beats * 2 % 1.0 == 0.0 && subdivision in setOf(4, 8, 12, 16, 20) && hits.length() <= 256) {
                    "A personal song has invalid score timing."
                }
                val barCount = portableSongPartBarCount(song, section, part)
                songBars += barCount
                totalBars += barCount
                require(songBars <= 512 && totalBars <= 20_000) { "The learning archive contains too many song bars to browse on Android." }
                totalHits += hits.length()
                require(totalHits <= 100_000) { "The learning archive contains too many personal-song score events." }
                val steps = (beats * subdivision / 4.0).toInt()
                for (hitIndex in 0 until hits.length()) {
                    val hit = hits.optJSONObject(hitIndex) ?: throw IllegalArgumentException("The learning archive contains an invalid song score event.")
                    require(hit.optInt("step", -1) in 0 until steps && hit.optString("instrument") in PORTABLE_SONG_VOICES) {
                        "The learning archive contains an invalid song score event."
                    }
                }
            }
        }
    }
}

fun readAndroidArchive(input: InputStream): String {
    val bytes = ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        require(bytes.size() + count <= ARCHIVE_LIMIT_BYTES) { "This learning archive is larger than 32 MB." }
        bytes.write(buffer, 0, count)
    }
    return String(bytes.toByteArray(), Charsets.UTF_8)
}

private fun validArchiveDate(value: String): Boolean = try { Instant.parse(value); true } catch (_: Exception) {
    try { LocalDate.parse(value); true } catch (_: Exception) { false }
}

private fun mergePortableArray(current: JSONArray?, incoming: JSONArray?, limit: Int, incomingWins: Boolean): JSONArray {
    val ordered = linkedMapOf<String, Any>()
    fun add(rows: JSONArray?, replace: Boolean) {
        if (rows == null) return
        for (index in 0 until rows.length()) {
            val value = rows.opt(index) ?: continue
            val id = (value as? JSONObject)?.optString("id")?.takeIf(String::isNotBlank) ?: "row-$index-${value.toString().hashCode()}"
            if (replace || id !in ordered) ordered[id] = value
        }
    }
    add(current, replace = false)
    add(incoming, replace = incomingWins)
    return JSONArray().also { merged -> ordered.values.take(limit).forEach { merged.put(it) } }
}

private fun mergeTrainerPractice(current: JSONObject?, incoming: JSONObject): JSONObject {
    val merged = if (current == null) JSONObject() else JSONObject(current.toString())
    val keys = incoming.keys()
    while (keys.hasNext()) {
        val key = keys.next()
        val nextValue = incoming.opt(key)
        if (nextValue !is JSONArray) { merged.put(key, nextValue); continue }
        if (key == "rounds") {
            merged.put(key, mergeTrainerRounds(merged.optJSONArray(key), nextValue as? JSONArray))
            continue
        }
        val options = when (key) {
            "cueSequences" -> 30 to true
            "coachFeedback" -> 100 to true
            else -> null
        }
        if (options == null) continue
        merged.put(key, mergePortableArray(merged.optJSONArray(key), nextValue, options.first, options.second))
    }
    return merged
}

private fun mergeTrainerRounds(current: JSONArray?, incoming: JSONArray?): JSONArray {
    val byId = linkedMapOf<String, JSONObject>()
    fun add(rows: JSONArray?, replace: Boolean) {
        if (rows == null) return
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            val id = row.optString("id").takeIf(String::isNotBlank) ?: continue
            if (replace || id !in byId) byId[id] = row
        }
    }
    add(current, replace = false)
    add(incoming, replace = true)
    return JSONArray().also { result -> byId.values.sortedByDescending { it.optString("playedAt") }.take(1000).forEach { result.put(it) } }
}

private fun mergeSightReading(current: JSONObject?, incoming: JSONObject): JSONObject {
    val result = current?.let { JSONObject(it.toString()) } ?: JSONObject()
    val byId = linkedMapOf<String, JSONObject>()
    fun add(rows: JSONArray?, replace: Boolean) {
        if (rows == null) return
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            val id = row.optString("id").takeIf(String::isNotBlank) ?: continue
            if (replace || id !in byId) byId[id] = JSONObject(row.toString())
        }
    }
    add(result.optJSONArray("attempts"), replace = false)
    add(incoming.optJSONArray("attempts"), replace = true)
    result.put("attempts", JSONArray().also { rows -> byId.values.sortedBy { it.optString("playedAt") }.takeLast(100).forEach(rows::put) })
    val templates = linkedMapOf<String, JSONObject>()
    for (source in listOf(result.optJSONArray("templates"), incoming.optJSONArray("templates"))) {
        if (source == null) continue
        for (index in 0 until source.length()) source.optJSONObject(index)?.let { row -> row.optString("id").takeIf(String::isNotBlank)?.let { templates.putIfAbsent(it, JSONObject(row.toString())) } }
    }
    result.put("templates", JSONArray().also { rows -> templates.values.takeLast(40).forEach(rows::put) })
    incoming.optJSONObject("goal")?.let { result.put("goal", JSONObject(it.toString())) }
    return result
}

fun parseAndroidArchive(raw: String, lessonIds: Set<String>, patternIds: Set<String>): AndroidArchiveReview {
    require(raw.toByteArray(Charsets.UTF_8).size <= ARCHIVE_LIMIT_BYTES) { "This learning archive is larger than 32 MB." }
    val root = try { JSONObject(raw) } catch (_: Exception) { throw IllegalArgumentException("This file is not a valid Drum Hero learning archive.") }
    require(root.optString("application") == "Drum Hero" && root.optInt("version") == 1 &&
        (root.optString("format") == ARCHIVE_FORMAT || root.optString("format") == "drum-hero-progress-transfer-v1")) {
        "This file is not a supported Drum Hero learning archive."
    }
    require(root.optInt("preferredBpm", 80) in 40..200) { "The learning archive has an invalid preferred tempo." }
    require(validArchiveDate(root.optString("exportedAt"))) { "The learning archive has an invalid export date." }
    val lessonRows = root.optJSONArray("completedLessons") ?: throw IllegalArgumentException("The learning archive has no lesson list.")
    val sessionRows = root.optJSONArray("practiceSessions") ?: throw IllegalArgumentException("The learning archive has no practice history.")
    val personalSongValue = root.opt("personalSongs")
    val archiveSongs = if (personalSongValue == null || personalSongValue == JSONObject.NULL) null
        else personalSongValue as? JSONArray ?: throw IllegalArgumentException("The learning archive has invalid personal songs.")
    archiveSongs?.let(::validatePortableSongs)
    val sightReading = root.optJSONObject("sightReading")?.let { JSONObject(it.toString()) }
    if (root.has("sightReading") && sightReading == null) throw IllegalArgumentException("The learning archive contains invalid sight-reading data.")
    sightReading?.let { reading ->
        val attempts = reading.optJSONArray("attempts") ?: throw IllegalArgumentException("The learning archive contains invalid sight-reading attempts.")
        val templates = reading.optJSONArray("templates")
        require(attempts.length() <= 100 && (templates?.length() ?: 0) <= 40) { "The learning archive contains too many sight-reading records." }
        val ids = mutableSetOf<String>()
        for (index in 0 until attempts.length()) {
            val row = attempts.optJSONObject(index) ?: throw IllegalArgumentException("The learning archive contains an invalid sight-reading attempt.")
            val id = row.optString("id"); val accuracy = row.optInt("accuracy", -1); val score = row.optInt("score", -1)
            require(id.isNotBlank() && id.length <= 100 && ids.add(id) && validArchiveDate(row.optString("playedAt")) &&
                accuracy in 0..100 && score in 0..100 && row.optJSONObject("settings") != null &&
                row.optString("source") in setOf("keyboard", "touch", "midi", "audio-voices") && row.optString("classification") in setOf("reading", "practice", "assisted")) {
                "The learning archive contains an invalid sight-reading attempt."
            }
        }
        if (templates != null) {
            val templateIds = mutableSetOf<String>()
            for (index in 0 until templates.length()) {
                val row = templates.optJSONObject(index) ?: throw IllegalArgumentException("The learning archive contains invalid phrase templates.")
                val id = row.optString("id"); val hits = row.optJSONArray("hits")
                val level = row.optString("level")
                val meter = row.optString("meter")
                val subdivision = row.optInt("subdivision", -1)
                val beats = row.optDouble("beats", Double.NaN)
                val expectedBeats = if (meter == "7/8") 3.5 else meter.substringBefore('/').toDoubleOrNull() ?: Double.NaN
                val supportedMeters = when (level) { "Beginner" -> setOf("4/4"); "Intermediate" -> setOf("4/4", "3/4"); "Advanced" -> setOf("4/4", "3/4", "5/4", "7/8"); else -> emptySet() }
                require(id.isNotBlank() && id.length <= 100 && templateIds.add(id) && row.optString("name").isNotBlank() && row.optString("name").length <= 80 &&
                    meter in supportedMeters && subdivision in setOf(4, 8, 12, 16) && (level == "Advanced" || subdivision !in setOf(12, 16)) &&
                    !(meter == "7/8" && subdivision % 8 != 0) && beats.isFinite() && kotlin.math.abs(beats - expectedBeats) < 0.0001 &&
                    validArchiveDate(row.optString("createdAt")) && hits != null && hits.length() in 1..120) {
                    "The learning archive contains invalid phrase templates."
                }
                val stepCount = (beats * subdivision / 4.0).toInt()
                val noteKeys = mutableSetOf<String>()
                val notesPerStep = mutableMapOf<Int, Int>()
                for (hitIndex in 0 until hits!!.length()) {
                    val hit = hits.optJSONObject(hitIndex) ?: throw IllegalArgumentException("The learning archive contains invalid phrase templates.")
                    val step = hit.optInt("step", -1)
                    val voice = hit.optString("instrument")
                    val velocity = hit.optInt("velocityTarget", -1)
                    require(step in 0 until stepCount && voice in setOf("kick", "snare", "hihat", "tom", "crash") && noteKeys.add("$step/$voice") &&
                        (velocity == -1 || velocity in 1..127)) { "The learning archive contains invalid phrase templates." }
                    notesPerStep[step] = (notesPerStep[step] ?: 0) + 1
                    require(notesPerStep.getValue(step) <= 3) { "The learning archive contains invalid phrase templates." }
                }
            }
        }
    }
    val supportedPatternIds = patternIds + portableSongPatternIds(archiveSongs)
    require(lessonRows.length() <= 100 && sessionRows.length() <= 100) { "The learning archive contains too many progress records." }

    val importedLessons = mutableListOf<Pair<String, String>>()
    var ignoredLessons = 0
    val seenLessons = mutableSetOf<String>()
    for (i in 0 until lessonRows.length()) {
        val row = lessonRows.optJSONObject(i) ?: throw IllegalArgumentException("The learning archive contains an invalid lesson record.")
        val id = row.optString("id")
        require(id.isNotBlank() && id.length <= 120 && seenLessons.add(id)) { "The learning archive contains an invalid lesson record." }
        val completedAt = row.optString("completedAt").takeIf { it.isNotBlank() && it != "null" } ?: root.optString("exportedAt")
        require(validArchiveDate(completedAt)) { "The learning archive contains an invalid lesson date." }
        if (id in lessonIds) importedLessons += id to completedAt else ignoredLessons++
    }
    val sessions = mutableListOf<AndroidPracticeSession>()
    var ignoredSessions = 0
    val seenSessions = mutableSetOf<String>()
    for (i in 0 until sessionRows.length()) {
        val row = sessionRows.optJSONObject(i) ?: throw IllegalArgumentException("The learning archive contains an invalid practice record.")
        val id = row.optString("id"); val patternId = row.optString("patternId")
        val playedAt = row.optString("playedAt")
        val score = row.optInt("score", -1); val accuracy = row.optInt("accuracy", -1); val bpm = row.optInt("bpm", -1)
        require(id.isNotBlank() && id.length <= 120 && seenSessions.add(id) && patternId.isNotBlank() && patternId.length <= 160 &&
            row.optString("patternName").isNotBlank() && row.optString("patternName").length <= 200 && bpm in 40..200 &&
            playedAt.length <= 40 && validArchiveDate(playedAt) && score in 0..100 && accuracy in 0..100) {
            "The learning archive contains an invalid practice record."
        }
        if (patternId !in supportedPatternIds) { ignoredSessions++; continue }
        sessions += AndroidPracticeSession(id, patternId, row.getString("patternName"), bpm, playedAt, score, accuracy,
            row.optInt("great").coerceIn(0, 100_000), row.optInt("good").coerceIn(0, 100_000),
            row.optInt("miss").coerceIn(0, 100_000), row.optInt("extra").coerceIn(0, 100_000), row.optInt("maxCombo").coerceIn(0, 100_000))
    }
    val bestObject = root.optJSONObject("bestScores") ?: JSONObject()
    require(bestObject.length() <= 256) { "The learning archive contains too many best-score records." }
    val bestScores = buildMap {
        val keys = bestObject.keys()
        while (keys.hasNext()) {
            val id = keys.next(); val score = bestObject.optInt(id, -1)
            require(id.isNotBlank() && id.length <= 160 && score in 0..100) { "The learning archive contains an invalid best score." }
            if (id in supportedPatternIds) put(id, score)
        }
    }
    val passthrough = JSONObject()
    listOf("earTraining", "trainerPractice", "guidedPracticeSession", "weeklyGoal", "personalSongs", "customGrooves", "sightReading")
        .forEach { key -> root.opt(key)?.let { value -> if (value != JSONObject.NULL) passthrough.put(key, value) } }
    val earCount = passthrough.optJSONArray("earTraining")?.length() ?: 0
    val trainerRounds = passthrough.optJSONObject("trainerPractice")?.optJSONArray("rounds")
    val trainerCount = trainerRounds?.length() ?: 0
    val sightCount = passthrough.optJSONObject("sightReading")?.optJSONArray("attempts")?.length() ?: 0
    require(earCount <= 100 && trainerCount <= 1000 && (passthrough.optJSONArray("personalSongs")?.length() ?: 0) <= 200 &&
        (passthrough.optJSONArray("customGrooves")?.length() ?: 0) <= 100) { "The learning archive contains too many optional records." }
    if (passthrough.has("earTraining")) {
        val ear = passthrough.optJSONArray("earTraining") ?: throw IllegalArgumentException("The learning archive has invalid ear-training history.")
        val ids = mutableSetOf<String>()
        for (i in 0 until ear.length()) {
            val row = ear.optJSONObject(i) ?: throw IllegalArgumentException("The learning archive has invalid ear-training history.")
            val id = row.optString("id"); val playedAt = row.optString("playedAt"); val score = row.optInt("score", -1)
            require(id.isNotBlank() && id.length <= 120 && ids.add(id) && validArchiveDate(playedAt) && score in 0..100) {
                "The learning archive has invalid ear-training history."
            }
        }
    }
    if (trainerRounds != null) for (i in 0 until trainerRounds.length()) {
        val row = trainerRounds.optJSONObject(i) ?: throw IllegalArgumentException("The learning archive contains invalid Trainer rounds.")
        val timing = row.optJSONArray("hits")
        require(!row.has("hits") || timing != null && timing.length() <= 600) { "The learning archive contains invalid Trainer timing." }
    }
    return AndroidArchiveReview(importedLessons, sessions, bestScores, root.optInt("preferredBpm", 80), passthrough,
        ignoredLessons, ignoredSessions, earCount, trainerCount, sightCount)
}

class DrumProgressStore(context: Context) : SQLiteOpenHelper(context.applicationContext, "drum-hero-progress.db", null, 1) {
    private val appContext = context.applicationContext
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE lesson_progress (lesson_id TEXT PRIMARY KEY NOT NULL, completed_at TEXT NOT NULL)")
        db.execSQL("CREATE TABLE practice_sessions (id TEXT PRIMARY KEY NOT NULL, pattern_id TEXT NOT NULL, pattern_name TEXT NOT NULL, bpm INTEGER NOT NULL, played_at TEXT NOT NULL, score INTEGER NOT NULL, accuracy INTEGER NOT NULL, great INTEGER NOT NULL, good INTEGER NOT NULL, miss INTEGER NOT NULL, extra INTEGER NOT NULL, max_combo INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE best_scores (pattern_id TEXT PRIMARY KEY NOT NULL, score INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE archive_extras (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        migrateLegacyPreferences(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { }

    private fun migrateLegacyPreferences(db: SQLiteDatabase) {
        val preferences = appContext.getSharedPreferences("drum-hero", Context.MODE_PRIVATE)
        preferences.getStringSet("completed-lessons", emptySet()).orEmpty().forEach { id ->
            db.insertWithOnConflict("lesson_progress", null, ContentValues().apply { put("lesson_id", id); put("completed_at", now()) }, SQLiteDatabase.CONFLICT_IGNORE)
        }
        preferences.getString("recent-scores", "").orEmpty().lineSequence().filter(String::isNotBlank).take(50).forEachIndexed { index, line ->
            val parts = line.split(" · ")
            val score = Regex("(\\d{1,3})%").find(line)?.groupValues?.get(1)?.toIntOrNull()?.coerceIn(0, 100) ?: 0
            val bpm = Regex("(\\d{2,3}) BPM").find(line)?.groupValues?.get(1)?.toIntOrNull()?.coerceIn(40, 200) ?: 80
            val playedAt = parts.getOrNull(3)?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) } ?: now().take(10)
            val name = parts.firstOrNull()?.take(200) ?: "Imported Android practice"
            val session = AndroidPracticeSession("legacy-${UUID.randomUUID()}", "legacy", name, bpm, "${playedAt}T00:00:00.000Z", score, score, 0, 0, 0, 0)
            insertSession(db, session)
        }
        db.insertWithOnConflict("settings", null, ContentValues().apply { put("key", "preferredBpm"); put("value", "80") }, SQLiteDatabase.CONFLICT_IGNORE)
        preferences.edit().clear().apply()
    }

    fun completedLessons(): Set<String> = readableDatabase.rawQuery("SELECT lesson_id FROM lesson_progress", null).use { cursor ->
        buildSet { while (cursor.moveToNext()) add(cursor.getString(0)) }
    }

    fun recentSessions(limit: Int = 50): List<AndroidPracticeSession> = readableDatabase.rawQuery(
        "SELECT id, pattern_id, pattern_name, bpm, played_at, score, accuracy, great, good, miss, extra, max_combo FROM practice_sessions ORDER BY played_at DESC LIMIT ?",
        arrayOf(limit.coerceIn(1, 100).toString())
    ).use { cursor ->
        buildList { while (cursor.moveToNext()) add(AndroidPracticeSession(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getInt(3), cursor.getString(4), cursor.getInt(5), cursor.getInt(6), cursor.getInt(7), cursor.getInt(8), cursor.getInt(9), cursor.getInt(10), cursor.getInt(11))) }
    }

    fun completeLesson(id: String, at: String = now()) {
        writableDatabase.insertWithOnConflict("lesson_progress", null, ContentValues().apply { put("lesson_id", id); put("completed_at", at) }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun saveSession(session: AndroidPracticeSession) {
        val db = writableDatabase
        insertSession(db, session)
        saveBestScore(db, session.patternId, session.score)
        db.execSQL("DELETE FROM practice_sessions WHERE id NOT IN (SELECT id FROM practice_sessions ORDER BY played_at DESC LIMIT 50)")
    }

    fun trainerRoundCount(): Int {
        val extras = readableDatabase.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
        return extras.optJSONObject("trainerPractice")?.optJSONArray("rounds")?.length() ?: 0
    }

    fun personalSongs(): List<JSONObject> {
        val extras = readableDatabase.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
        val songs = extras.optJSONArray("personalSongs") ?: return emptyList()
        return buildList {
            for (index in 0 until songs.length()) songs.optJSONObject(index)?.let { add(JSONObject(it.toString())) }
        }
    }

    fun customGrooves(): List<JSONObject> {
        val extras = readableDatabase.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
        val grooves = extras.optJSONArray("customGrooves") ?: return emptyList()
        return buildList { for (index in 0 until grooves.length()) grooves.optJSONObject(index)?.let { add(JSONObject(it.toString())) } }
    }

    fun saveTrainerRound(round: JSONObject): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val extras = db.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
            val trainer = extras.optJSONObject("trainerPractice")?.let { JSONObject(it.toString()) } ?: JSONObject()
            trainer.put("rounds", mergeTrainerRounds(trainer.optJSONArray("rounds"), JSONArray().put(round)))
            extras.put("trainerPractice", trainer)
            db.insertWithOnConflict("archive_extras", null, ContentValues().apply { put("key", "portable"); put("value", extras.toString()) }, SQLiteDatabase.CONFLICT_REPLACE)
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return trainerRoundCount()
    }

    fun sightReadingAttempts(): JSONArray {
        val extras = readableDatabase.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
        return extras.optJSONObject("sightReading")?.optJSONArray("attempts")?.let { JSONArray(it.toString()) } ?: JSONArray()
    }

    fun sightReadingTemplates(): JSONArray {
        val extras = readableDatabase.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
        return extras.optJSONObject("sightReading")?.optJSONArray("templates")?.let { JSONArray(it.toString()) } ?: JSONArray()
    }

    fun saveSightReadingAttempt(attempt: JSONObject): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val extras = db.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
            val merged = mergeSightReading(extras.optJSONObject("sightReading"), JSONObject().put("attempts", JSONArray().put(attempt)))
            extras.put("sightReading", merged)
            db.insertWithOnConflict("archive_extras", null, ContentValues().apply { put("key", "portable"); put("value", extras.toString()) }, SQLiteDatabase.CONFLICT_REPLACE)
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return sightReadingAttempts().length()
    }

    fun saveSightReadingTemplate(template: JSONObject): Int {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val extras = db.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
            val merged = mergeSightReading(extras.optJSONObject("sightReading"), JSONObject().put("templates", JSONArray().put(template)))
            extras.put("sightReading", merged)
            db.insertWithOnConflict("archive_extras", null, ContentValues().apply { put("key", "portable"); put("value", extras.toString()) }, SQLiteDatabase.CONFLICT_REPLACE)
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        return sightReadingTemplates().length()
    }

    fun sightVelocityCalibration(portKey: String, voice: String): Pair<Int, Int>? {
        if (portKey.isBlank() || voice !in setOf("kick", "snare", "hihat", "tom", "crash")) return null
        val safePort = portKey.filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(80)
        val raw = readableDatabase.rawQuery("SELECT value FROM settings WHERE key=?", arrayOf("sightDynamics:$safePort:$voice")).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: return null
        val values = raw.split(',').mapNotNull { it.toIntOrNull() }
        if (values.size != 2 || values[0] !in 1..126 || values[1] !in 2..127 || values[1] - values[0] < 12) return null
        return values[0] to values[1]
    }

    fun saveSightVelocityCalibration(portKey: String, voice: String, softMedian: Int, accentedMedian: Int) {
        if (portKey.isBlank() || voice !in setOf("kick", "snare", "hihat", "tom", "crash") || softMedian !in 1..126 || accentedMedian !in 2..127 || accentedMedian - softMedian < 12) return
        val safePort = portKey.filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(80)
        writableDatabase.insertWithOnConflict("settings", null, ContentValues().apply {
            put("key", "sightDynamics:$safePort:$voice"); put("value", "$softMedian,$accentedMedian")
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun exportArchive(preferredBpm: Int): String {
        val lessons = JSONArray().also { rows ->
            completedLessons().forEach { id -> rows.put(JSONObject().put("id", id).put("completedAt", completedAt(id))) }
        }
        val sessions = JSONArray().also { rows -> recentSessions().forEach { rows.put(it.toJson()) } }
        val bests = JSONObject().also { result ->
            readableDatabase.rawQuery("SELECT pattern_id, score FROM best_scores", null).use { cursor -> while (cursor.moveToNext()) result.put(cursor.getString(0), cursor.getInt(1)) }
        }
        val root = JSONObject().put("application", "Drum Hero").put("format", ARCHIVE_FORMAT).put("version", 1)
            .put("exportedAt", now()).put("completedLessons", lessons).put("practiceSessions", sessions)
            .put("bestScores", bests).put("preferredBpm", preferredBpm.coerceIn(40, 200))
        val extras = readableDatabase.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
        val keys = extras.keys()
        while (keys.hasNext()) { val key = keys.next(); root.put(key, extras.get(key)) }
        return root.toString(2)
    }

    fun mergeArchive(review: AndroidArchiveReview) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            review.completedLessons.forEach { (id, date) -> db.insertWithOnConflict("lesson_progress", null, ContentValues().apply { put("lesson_id", id); put("completed_at", date.ifBlank { now() }) }, SQLiteDatabase.CONFLICT_IGNORE) }
            review.sessions.forEach { session -> insertSession(db, session) }
            review.bestScores.forEach { (id, score) -> saveBestScore(db, id, score) }
            review.sessions.forEach { session -> saveBestScore(db, session.patternId, session.score) }
            db.insertWithOnConflict("settings", null, ContentValues().apply {
                put("key", "preferredBpm"); put("value", review.preferredBpm.toString())
            }, SQLiteDatabase.CONFLICT_REPLACE)
            val previous = db.rawQuery("SELECT value FROM archive_extras WHERE key='portable'", null).use { cursor -> if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject() }
            val keys = review.passthrough.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val incoming = review.passthrough.get(key)
                val merged = when (key) {
                    "earTraining" -> mergePortableArray(previous.optJSONArray(key), incoming as? JSONArray, 100, incomingWins = true)
                    "personalSongs" -> mergePortableArray(previous.optJSONArray(key), incoming as? JSONArray, 200, incomingWins = false)
                    "customGrooves" -> mergePortableArray(previous.optJSONArray(key), incoming as? JSONArray, 100, incomingWins = false)
                    "trainerPractice" -> if (incoming is JSONObject) mergeTrainerPractice(previous.optJSONObject(key), incoming) else incoming
                    "sightReading" -> if (incoming is JSONObject) mergeSightReading(previous.optJSONObject(key), incoming) else incoming
                    else -> incoming
                }
                previous.put(key, merged)
            }
            db.insertWithOnConflict("archive_extras", null, ContentValues().apply { put("key", "portable"); put("value", previous.toString()) }, SQLiteDatabase.CONFLICT_REPLACE)
            db.execSQL("DELETE FROM practice_sessions WHERE id NOT IN (SELECT id FROM practice_sessions ORDER BY played_at DESC LIMIT 50)")
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    fun preferredBpm(): Int = readableDatabase.rawQuery("SELECT value FROM settings WHERE key='preferredBpm'", null).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0).toIntOrNull()?.coerceIn(40, 200) ?: 80 else 80 }

    fun midiCorrection(portKey: String): Int = readableDatabase.rawQuery("SELECT value FROM settings WHERE key=?", arrayOf("midi:$portKey")).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0).toIntOrNull()?.coerceIn(-200, 200) ?: 0 else 0
    }

    fun saveMidiCorrection(portKey: String, correctionMs: Int) {
        if (portKey.isBlank() || portKey.length > 100) return
        writableDatabase.insertWithOnConflict("settings", null, ContentValues().apply {
            put("key", "midi:$portKey"); put("value", correctionMs.coerceIn(-200, 200).toString())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun completedAt(id: String): String = readableDatabase.rawQuery("SELECT completed_at FROM lesson_progress WHERE lesson_id=?", arrayOf(id)).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else now() }
    private fun saveBestScore(db: SQLiteDatabase, patternId: String, score: Int) {
        val previous = db.rawQuery("SELECT score FROM best_scores WHERE pattern_id=?", arrayOf(patternId)).use { cursor -> if (cursor.moveToFirst()) cursor.getInt(0) else null }
        if (previous == null || score > previous) {
            db.insertWithOnConflict("best_scores", null, ContentValues().apply {
                put("pattern_id", patternId); put("score", score)
            }, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }
    private fun insertSession(db: SQLiteDatabase, item: AndroidPracticeSession) {
        db.insertWithOnConflict("practice_sessions", null, ContentValues().apply {
            put("id", item.id); put("pattern_id", item.patternId); put("pattern_name", item.patternName); put("bpm", item.bpm); put("played_at", item.playedAt)
            put("score", item.score); put("accuracy", item.accuracy); put("great", item.great); put("good", item.good); put("miss", item.miss); put("extra", item.extra); put("max_combo", item.maxCombo)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun now(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
}
