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
)

private const val ARCHIVE_FORMAT = "drum-hero-learning-archive-v1"
private const val ARCHIVE_LIMIT_BYTES = 32 * 1024 * 1024
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
        val options = when (key) {
            "rounds" -> 50 to true
            "cueSequences" -> 30 to true
            "coachFeedback" -> 100 to true
            else -> null
        }
        if (options == null) continue
        merged.put(key, mergePortableArray(merged.optJSONArray(key), nextValue, options.first, options.second))
    }
    return merged
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
        if (patternId !in patternIds) { ignoredSessions++; continue }
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
            if (id in patternIds) put(id, score)
        }
    }
    val passthrough = JSONObject()
    listOf("earTraining", "trainerPractice", "guidedPracticeSession", "weeklyGoal", "personalSongs", "customGrooves")
        .forEach { key -> root.opt(key)?.let { value -> if (value != JSONObject.NULL) passthrough.put(key, value) } }
    val earCount = passthrough.optJSONArray("earTraining")?.length() ?: 0
    val trainerRounds = passthrough.optJSONObject("trainerPractice")?.optJSONArray("rounds")
    val trainerCount = trainerRounds?.length() ?: 0
    require(earCount <= 100 && trainerCount <= 50 && (passthrough.optJSONArray("personalSongs")?.length() ?: 0) <= 200 &&
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
        ignoredLessons, ignoredSessions, earCount, trainerCount)
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
