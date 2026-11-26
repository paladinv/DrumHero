package com.codingmonkey.drumhero

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.time.Instant
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong

private data class AndroidSightSettings(val level: String, val bpm: Int, val bars: Int, val meter: String, val dynamicsFocus: Boolean = false)
private data class AndroidSightNote(val step: Int, val voice: String, val accent: Boolean = false, val velocityTarget: Int? = null)
private data class AndroidSightExercise(val seed: Long, val settings: AndroidSightSettings, val subdivision: Int, val beatsPerBar: Double, val stepsPerBar: Int, val hits: List<AndroidSightNote>, val sourceLabel: String? = null) {
    val durationMs: Double get() = settings.bars * beatsPerBar * 60_000.0 / settings.bpm
    val fingerprint: String get() = "${settings.meter}:$subdivision:${if (settings.dynamicsFocus) 1 else 0}:${hits.joinToString(",") { "${it.step}/${it.voice}/${if (it.accent) 1 else 0}${it.velocityTarget?.let { target -> "/v$target" } ?: ""}" }}"
}
private data class AndroidSightTap(val voice: String, val atMs: Double, val velocity: Int)
private data class AndroidSightScore(val accuracy: Int, val score: Int, val misses: Int, val extras: Int, val early: Int, val late: Int, val meanOffset: Int?, val dynamicAccuracy: Int?, val contextErrors: Map<String, Int>)
private val sightVoices = listOf("kick", "snare", "hihat", "tom", "crash")
private val sightVoiceNames = mapOf("kick" to "Kick", "snare" to "Snare", "hihat" to "Hi-hat", "tom" to "Tom", "crash" to "Crash")
private fun androidJsonRows(rows: JSONArray): List<JSONObject> = buildList {
    for (index in 0 until rows.length()) rows.optJSONObject(index)?.let { add(JSONObject(it.toString())) }
}

private data class AndroidSightReviewSuggestion(val level: String, val meter: String, val bpm: Int, val dynamicsFocus: Boolean, val reason: String)

private fun androidSightReviewSuggestion(history: List<JSONObject>, nowMs: Long = System.currentTimeMillis()): AndroidSightReviewSuggestion? {
    val readings = history.filter { it.optString("classification") == "reading" && it.optJSONObject("settings") != null }
    val groups = readings.groupBy { row ->
        val settings = row.optJSONObject("settings")!!
        "${settings.optString("level")}|${settings.optString("meter")}|${settings.optInt("bpm", 80)}|${settings.optString("focusRhythm", "mixed")}"
    }
    return groups.values.mapNotNull { rows ->
        val last = rows.maxByOrNull { it.optString("playedAt") } ?: return@mapNotNull null
        val lastAt = runCatching { Instant.parse(last.optString("playedAt")).toEpochMilli() }.getOrNull() ?: return@mapNotNull null
        val recent = rows.sortedBy { it.optString("playedAt") }.takeLast(3)
        val average = recent.map { it.optInt("accuracy") }.average().roundToInt()
        val intervalDays = when {
            average < 70 -> 1
            average < 85 -> 3
            else -> 7
        }
        val elapsedDays = ((nowMs - lastAt).coerceAtLeast(0) / 86_400_000L).toInt()
        if (elapsedDays < intervalDays) return@mapNotNull null
        val settings = last.getJSONObject("settings")
        AndroidSightReviewSuggestion(
            settings.optString("level", "Beginner"), settings.optString("meter", "4/4"), settings.optInt("bpm", 80), settings.optBoolean("dynamicsFocus"),
            "Due after $intervalDays day${if (intervalDays == 1) "" else "s"} · recent first-read accuracy $average%."
        ) to lastAt
    }.minByOrNull { it.second }?.first
}

private fun androidSightContextSuggestion(history: List<JSONObject>): Pair<String, Int>? {
    val recent = history.filter { it.optString("classification") == "reading" }.takeLast(5)
    val counts = mutableMapOf<String, Int>()
    recent.forEach { row ->
        val contexts = row.optJSONArray("contextErrors") ?: return@forEach
        for (index in 0 until contexts.length()) {
            val item = contexts.optJSONObject(index) ?: continue
            val key = item.optString("context")
            if (key in setOf("after-rest", "barline-entry", "group-entry", "offbeat", "voice-change")) {
                counts[key] = (counts[key] ?: 0) + item.optInt("count").coerceAtLeast(0)
            }
        }
    }
    return counts.entries.filter { it.value >= 2 }.maxByOrNull { it.value }?.let { it.key to it.value }
}

private fun generateAndroidSight(settings: AndroidSightSettings, seed: Long, previous: String? = null, drillContext: String? = null): AndroidSightExercise {
    val beats = if (settings.meter == "7/8") 3.5 else settings.meter.substringBefore('/').toDoubleOrNull() ?: 4.0
    val subdivision = if (settings.level == "Beginner") if (seed.toUInt() % 2u == 0u) 4 else 8 else 16
    val stepsPerBar = (beats * subdivision / 4).roundToInt()
    val unit = subdivision / 4
    val base = when (subdivision) {
        4 -> listOf(listOf(0), listOf(0), emptyList(), listOf(0))
        8 -> listOf(listOf(0), listOf(0, 1), listOf(1), emptyList())
        12 -> listOf(listOf(0, 1, 2), listOf(0, 2), listOf(1), emptyList())
        else -> listOf(listOf(0, 2), listOf(0, 3), listOf(1, 2), listOf(0, 1, 3), listOf(2), emptyList())
    }
    var actualSeed = seed.toUInt()
    repeat(100) {
        var state = actualSeed
        fun next(bound: Int): Int {
            state = state * 1664525u + 1013904223u
            return ((state.toLong() * bound) shr 32).toInt().coerceIn(0, bound - 1)
        }
        val notes = mutableListOf<AndroidSightNote>()
        repeat(settings.bars) { bar ->
            var beat = 0
            while (beat.toDouble() < beats) {
                val template = base[next(base.size)]
                template.forEach { offset ->
                    val local = beat * unit + offset
                    if (local < stepsPerBar) {
                        val step = bar * stepsPerBar + local
                        val voice = if (settings.level == "Advanced") listOf("snare", "hihat", "tom", "crash")[next(4)] else if (next(3) == 0) "snare" else "hihat"
                        val accent = settings.level != "Beginner" && next(4) == 0
                        if (notes.none { it.step == step && it.voice == voice }) notes.add(AndroidSightNote(step, voice, accent))
                        if (offset == 0 && next(3) == 0 && notes.none { it.step == step && it.voice == "kick" }) notes.add(AndroidSightNote(step, "kick"))
                    }
                }
                beat++
            }
            if (notes.none { it.step in (bar * stepsPerBar) until ((bar + 1) * stepsPerBar) }) notes.add(AndroidSightNote(bar * stepsPerBar, "snare"))
            val start = bar * stepsPerBar
            val beatUnit = subdivision / 4
            val focusedStep = when (drillContext) {
                "barline-entry" -> start
                "group-entry" -> start + when (settings.meter) { "5/4" -> 3 * beatUnit; "7/8" -> subdivision / 4; "4/4" -> 2 * beatUnit; else -> beatUnit }
                "offbeat" -> start + max(1, beatUnit / 2)
                "after-rest" -> (start + 1 until start + stepsPerBar).firstOrNull { candidate ->
                    notes.none { it.step == candidate } && notes.none { it.step == candidate - 1 }
                } ?: -1
                else -> -1
            }
            if (focusedStep in start until (start + stepsPerBar) && notes.none { it.step == focusedStep }) {
                notes.add(AndroidSightNote(focusedStep, if (drillContext == "barline-entry") "snare" else "hihat"))
            }
            if (drillContext == "voice-change") {
                val inBar = notes.filter { it.step in start until (start + stepsPerBar) }.sortedBy { it.step }
                if (inBar.size < 2 || inBar.zipWithNext().all { it.first.voice == it.second.voice }) {
                    val changeStep = start + min(max(1, beatUnit), max(1, stepsPerBar - 1))
                    if (notes.none { it.step == changeStep && it.voice == "tom" }) notes.add(AndroidSightNote(changeStep, "tom"))
                }
            }
        }
        val sorted = notes.map { note ->
            if (!settings.dynamicsFocus) note
            else note.copy(velocityTarget = if (note.accent) 105 else if ((note.step * 11 + sightVoices.indexOf(note.voice) * 7) % 7 == 0) 45 else 70)
        }.sortedWith(compareBy<AndroidSightNote> { it.step }.thenBy { sightVoices.indexOf(it.voice) })
        val result = AndroidSightExercise(actualSeed.toLong(), settings, subdivision, beats, stepsPerBar, sorted, drillContext?.let { "Focused drill · ${it.replace('-', ' ')}" })
        if (previous == null || previous != result.fingerprint) return result
        actualSeed += 1u
    }
    return generateAndroidSight(settings, actualSeed.toLong(), null, drillContext)
}

private fun sightErrorContexts(exercise: AndroidSightExercise, step: Int, voice: String): List<String> {
    val safeStep = step.coerceIn(0, max(0, exercise.settings.bars * exercise.stepsPerBar - 1))
    val bar = safeStep / exercise.stepsPerBar
    val local = safeStep - bar * exercise.stepsPerBar
    val beatUnit = max(1, exercise.subdivision / 4)
    val meter = exercise.settings.meter
    val groups = when (meter) {
        "7/8" -> setOf(0, exercise.subdivision / 4, exercise.subdivision / 2)
        "5/4" -> setOf(0, 3 * beatUnit)
        "4/4" -> setOf(0, 2 * beatUnit)
        else -> (0 until ceil(exercise.beatsPerBar).toInt()).map { it * beatUnit }.toSet()
    }
    val contexts = mutableListOf<String>()
    if (local == 0) contexts += "barline-entry"
    if (local in groups) contexts += "group-entry"
    if (local % beatUnit != 0) contexts += "offbeat"
    if (local > 0 && exercise.hits.none { it.step == safeStep - 1 }) contexts += "after-rest"
    val prior = exercise.hits.lastOrNull { it.step < safeStep }
    if (prior != null && prior.voice != voice) contexts += "voice-change"
    return contexts
}

private fun scoreAndroidSight(exercise: AndroidSightExercise, taps: List<AndroidSightTap>, calibrations: Map<String, Pair<Int, Int>> = emptyMap()): AndroidSightScore {
    val stepMs = 60_000.0 / exercise.settings.bpm * 4 / exercise.subdivision
    val matched = BooleanArray(exercise.hits.size)
    val matchedTap = IntArray(exercise.hits.size) { -1 }
    val offsets = mutableListOf<Double>()
    val extraTaps = mutableListOf<AndroidSightTap>()
    taps.forEachIndexed { tapIndex, tap ->
        var best = -1
        var difference = Double.MAX_VALUE
        exercise.hits.forEachIndexed { index, target ->
            if (!matched[index] && target.voice == tap.voice) {
                val current = abs(tap.atMs - target.step * stepMs)
                if (current < difference) { difference = current; best = index }
            }
        }
        if (best >= 0 && difference <= 100) {
            matched[best] = true
            matchedTap[best] = tapIndex
            offsets += tap.atMs - exercise.hits[best].step * stepMs
        } else extraTaps += tap
    }
    val misses = matched.count { !it }
    val extras = extraTaps.size
    val accuracy = if (exercise.hits.isEmpty()) 0 else (matched.count { it } * 100.0 / exercise.hits.size).roundToInt()
    val average = offsets.takeIf { it.isNotEmpty() }?.average()
    val contextErrors = mutableMapOf<String, Int>()
    exercise.hits.forEachIndexed { index, target ->
        if (!matched[index]) sightErrorContexts(exercise, target.step, target.voice).forEach { key -> contextErrors[key] = (contextErrors[key] ?: 0) + 1 }
    }
    extraTaps.forEach { tap ->
        val inferredStep = (tap.atMs / stepMs).roundToInt()
        sightErrorContexts(exercise, inferredStep, tap.voice).forEach { key -> contextErrors[key] = (contextErrors[key] ?: 0) + 1 }
    }
    val dynamicTargets = exercise.hits.indices.filter { exercise.hits[it].velocityTarget != null }
    val dynamicCorrect = dynamicTargets.count { index ->
        val tapIndex = matchedTap[index]
        if (tapIndex < 0) false
        else {
            val target = exercise.hits[index].velocityTarget ?: 0
            val velocity = taps[tapIndex].velocity
            val calibration = calibrations[exercise.hits[index].voice]
            if (calibration == null) abs(velocity - target) <= 18
            else {
                val gap = calibration.second - calibration.first
                val ghostLimit = calibration.first + max(5, gap / 3)
                val accentLimit = calibration.second - max(5, gap / 3)
                when {
                    target <= 50 -> velocity <= ghostLimit
                    target >= 100 -> velocity >= accentLimit
                    else -> velocity > ghostLimit && velocity < accentLimit
                }
            }
        }
    }
    val dynamicAccuracy = if (exercise.settings.dynamicsFocus && dynamicTargets.isNotEmpty()) (dynamicCorrect * 100.0 / dynamicTargets.size).roundToInt() else null
    return AndroidSightScore(accuracy, accuracy, misses, extras, offsets.count { it < 0 }, offsets.count { it > 0 }, average?.roundToInt(), dynamicAccuracy, contextErrors)
}

private fun exerciseFromAndroidTemplate(settings: AndroidSightSettings, template: JSONObject, seed: Long): AndroidSightExercise? {
    val level = template.optString("level")
    val meter = template.optString("meter")
    val subdivision = template.optInt("subdivision", -1)
    val beats = if (meter == "7/8") 3.5 else meter.substringBefore('/').toDoubleOrNull() ?: return null
    if (level !in setOf("Beginner", "Intermediate", "Advanced") || meter !in setOf("4/4", "3/4", "5/4", "7/8") || subdivision !in setOf(4, 8, 12, 16)) return null
    if (level != "Advanced" && subdivision in setOf(12, 16) || meter == "7/8" && subdivision % 8 != 0) return null
    val sourceHits = template.optJSONArray("hits") ?: return null
    if (sourceHits.length() !in 1..120) return null
    val stepsPerBar = (beats * subdivision / 4).roundToInt()
    val oneBar = mutableListOf<AndroidSightNote>()
    for (index in 0 until sourceHits.length()) {
        val row = sourceHits.optJSONObject(index) ?: return null
        val step = row.optInt("step", -1)
        val voice = row.optString("instrument")
        if (step !in 0 until stepsPerBar || voice !in sightVoices) return null
        oneBar += AndroidSightNote(step, voice, row.optBoolean("accent"), row.optInt("velocityTarget", -1).takeIf { it >= 0 })
    }
    if (oneBar.map { "${it.step}/${it.voice}" }.toSet().size != oneBar.size || oneBar.groupingBy { it.step }.eachCount().values.any { it > 3 }) return null
    val config = settings.copy(level = level, meter = meter, dynamicsFocus = settings.dynamicsFocus && level == "Advanced")
    val notes = (0 until config.bars).flatMap { bar ->
        oneBar.map { note ->
            val step = note.step + bar * stepsPerBar
            val target = if (!config.dynamicsFocus) null else if (note.accent) 105 else if ((step * 11 + sightVoices.indexOf(note.voice) * 7) % 7 == 0) 45 else 70
            note.copy(step = step, velocityTarget = target)
        }
    }.sortedWith(compareBy<AndroidSightNote> { it.step }.thenBy { sightVoices.indexOf(it.voice) })
    return AndroidSightExercise(seed, config, subdivision, beats, stepsPerBar, notes, template.optString("name"))
}

@Composable
internal fun SightReadingScreen(
    drumSounds: DrumSounds,
    midiInput: AndroidMidiInput,
    progressStore: DrumProgressStore,
    onAttemptSaved: (JSONObject) -> Unit,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var level by remember { mutableStateOf("Beginner") }
    var bpm by remember { mutableIntStateOf(80) }
    var bars by remember { mutableIntStateOf(8) }
    var meter by remember { mutableStateOf("4/4") }
    var dynamicsFocus by remember { mutableStateOf(false) }
    var templates by remember { mutableStateOf(emptyList<JSONObject>()) }
    var selectedTemplateId by remember { mutableStateOf("") }
    var templateName by remember { mutableStateOf("") }
    var templateStatus by remember { mutableStateOf("") }
    var templateMenuOpen by remember { mutableStateOf(false) }
    var drillContext by remember { mutableStateOf<String?>(null) }
    var phase by remember { mutableStateOf("Setup") }
    var exercise by remember { mutableStateOf<AndroidSightExercise?>(null) }
    var seed by remember { mutableLongStateOf(1L) }
    var previousFingerprint by remember { mutableStateOf<String?>(null) }
    var playTargetDrums by remember { mutableStateOf(true) }
    var useMidi by remember { mutableStateOf(false) }
    var selectedPort by remember { mutableStateOf<AndroidMidiPort?>(null) }
    var midiStatus by remember { mutableStateOf("MIDI is disconnected.") }
    var midiMenuOpen by remember { mutableStateOf(false) }
    var availablePorts by remember { mutableStateOf(emptyList<AndroidMidiPort>()) }
    var velocityCalibrations by remember { mutableStateOf(emptyMap<String, Pair<Int, Int>>()) }
    var velocityCalibrationVoice by remember { mutableStateOf("kick") }
    var velocityCalibrationStage by remember { mutableStateOf<String?>(null) }
    var velocitySoftMedian by remember { mutableStateOf<Int?>(null) }
    var velocityCalibrationStatus by remember { mutableStateOf("") }
    val velocityCalibrationSamples = remember { mutableStateListOf<Int>() }
    var targetCursorMs by remember { mutableDoubleStateOf(0.0) }
    var currentBar by remember { mutableIntStateOf(0) }
    var message by remember { mutableStateOf("Choose settings, preview the notation, then play one uninterrupted pass.") }
    var result by remember { mutableStateOf<AndroidSightScore?>(null) }
    var resultClassification by remember { mutableStateOf<String?>(null) }
    var referencePlaying by remember { mutableStateOf(false) }
    var history by remember { mutableStateOf(emptyList<JSONObject>()) }
    var attempted by remember { mutableStateOf(false) }
    var captureStartMs by remember { mutableDoubleStateOf(0.0) }
    var timerJob by remember { mutableStateOf<Job?>(null) }
    var zoom by remember { mutableDoubleStateOf(1.0) }
    val taps = remember { mutableStateListOf<AndroidSightTap>() }
    val scrollState = rememberScrollState()
    val horizontalScoreScrollState = rememberScrollState()
    val screenDensity = LocalDensity.current
    val registerHit by rememberUpdatedState<(AndroidSightTap) -> Unit> { tap ->
        val current = exercise
        if (phase == "Play" && current != null && tap.atMs >= captureStartMs && tap.atMs <= captureStartMs + current.durationMs + 100) {
            taps.add(tap.copy(atMs = tap.atMs - captureStartMs))
            drumSounds.play(tap.voice, tap.velocity)
        }
    }
    LaunchedEffect(progressStore) {
        val saved = withContext(Dispatchers.IO) {
            androidJsonRows(progressStore.sightReadingAttempts()).takeLast(100) to androidJsonRows(progressStore.sightReadingTemplates()).takeLast(40)
        }
        history = saved.first
        templates = saved.second
        previousFingerprint = saved.first.lastOrNull()?.optString("fingerprint")?.takeIf(String::isNotBlank)
    }
    LaunchedEffect(selectedPort?.key, progressStore) {
        val portKey = selectedPort?.key
        velocityCalibrationStage = null
        velocitySoftMedian = null
        velocityCalibrationSamples.clear()
        velocityCalibrations = withContext(Dispatchers.IO) {
            if (portKey.isNullOrBlank()) emptyMap<String, Pair<Int, Int>>()
            else buildMap<String, Pair<Int, Int>> { sightVoices.forEach { voice -> progressStore.sightVelocityCalibration(portKey, voice)?.let { put(voice, it) } } }
        }
    }
    fun newExercise(): AndroidSightExercise {
        timerJob?.cancel(); timerJob = null; referencePlaying = false
        val supported = when (level) { "Beginner" -> listOf("4/4"); "Intermediate" -> listOf("4/4", "3/4"); else -> listOf("4/4", "3/4", "5/4", "7/8") }
        val normalizedMeter = meter.takeIf { it in supported } ?: supported.first()
        meter = normalizedMeter
        val selectedTemplate = templates.firstOrNull { it.optString("id") == selectedTemplateId }
        val config = AndroidSightSettings(level, bpm.coerceIn(40, 200), bars.coerceIn(1, 32), normalizedMeter, dynamicsFocus && level == "Advanced")
        val next = if (selectedTemplate != null && drillContext == null) {
            exerciseFromAndroidTemplate(config, selectedTemplate, seed) ?: generateAndroidSight(config, seed, previousFingerprint)
        } else {
            generateAndroidSight(config, seed, previousFingerprint, drillContext)
        }
        val repeatsPreviousPhrase = previousFingerprint == next.fingerprint
        seed = (next.seed + 1) and 0xffffffffL
        previousFingerprint = next.fingerprint
        level = next.settings.level
        meter = next.settings.meter
        dynamicsFocus = next.settings.dynamicsFocus
        exercise = next; result = null; resultClassification = null; attempted = repeatsPreviousPhrase; phase = "Setup"; targetCursorMs = 0.0; currentBar = 0
        message = "New ${next.settings.bars}-bar ${next.settings.meter} phrase ready${next.sourceLabel?.let { " · $it" } ?: ""}."
        return next
    }
    fun saveCurrentTemplate() {
        val current = exercise ?: return
        val firstBar = current.hits.filter { it.step < current.stepsPerBar }
        if (firstBar.isEmpty()) { templateStatus = "This first measure has no notes to save."; return }
        val name = templateName.trim().ifBlank { "Reading template ${templates.size + 1}" }.take(80)
        val row = JSONObject().apply {
            put("id", UUID.randomUUID().toString().lowercase(Locale.US))
            put("name", name); put("level", current.settings.level); put("meter", current.settings.meter)
            put("subdivision", current.subdivision); put("beats", current.beatsPerBar)
            put("createdAt", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date()))
            put("hits", JSONArray().also { rows -> firstBar.forEach { hit -> rows.put(JSONObject().apply { put("step", hit.step); put("instrument", hit.voice); put("accent", hit.accent); hit.velocityTarget?.let { put("velocityTarget", it) } }) } })
        }
        scope.launch {
            val savedRows = withContext(Dispatchers.IO) {
                progressStore.saveSightReadingTemplate(row)
                androidJsonRows(progressStore.sightReadingTemplates()).takeLast(40)
            }
            templates = savedRows
            selectedTemplateId = row.optString("id")
            templateName = ""
            templateStatus = "Saved $name. It will be included in learning archive transfers."
        }
    }
    fun cancelSightAttempt() {
        timerJob?.cancel(); timerJob = null
        referencePlaying = false
        if (phase in setOf("Preview", "Count-in", "Play")) {
            phase = "Setup"; captureStartMs = 0.0; taps.clear(); attempted = true
            message = "Attempt ended. Restarting this phrase counts as practice."
        }
    }
    fun saveCompletedAttempt(current: AndroidSightExercise, scored: AndroidSightScore, input: String, isPractice: Boolean) {
        val classification = if (playTargetDrums) "assisted" else if (isPractice) "practice" else "reading"
        val row = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("playedAt", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date()))
            put("version", if (current.settings.dynamicsFocus) 4 else 1); put("seed", current.seed); put("source", input); put("inputProfile", if (input == "midi") "midi:${selectedPort?.key ?: "android"}" else "touch")
            put("classification", classification); put("targetPlayback", playTargetDrums); put("score", scored.score); put("accuracy", scored.accuracy)
            put("dynamicAccuracy", scored.dynamicAccuracy ?: JSONObject.NULL)
            put("meanOffsetMs", scored.meanOffset ?: JSONObject.NULL); put("timingSpreadMs", JSONObject.NULL); put("misses", scored.misses); put("extras", scored.extras)
            put("earlyHits", scored.early); put("lateHits", scored.late)
            put("contextErrors", JSONArray().also { rows -> scored.contextErrors.forEach { (context, count) -> rows.put(JSONObject().put("context", context).put("count", count)) } })
            put("settings", JSONObject().apply { put("level", current.settings.level); put("bpm", current.settings.bpm); put("bars", current.settings.bars); put("meter", current.settings.meter); put("mixedMeters", false); put("articulationFocus", JSONObject.NULL); put("dynamicsFocus", current.settings.dynamicsFocus); put("triplets", false); put("snareOnly", false); put("focusVoice", "mixed"); put("focusRhythm", "mixed"); put("style", "varied"); put("density", "balanced") })
            put("fingerprint", current.fingerprint); put("previewSeconds", 10); put("countInBars", 1)
            current.sourceLabel?.let { put("sourceLabel", it) }
        }
        resultClassification = classification
        history = (history + row).takeLast(100); onAttemptSaved(row); previousFingerprint = current.fingerprint
    }
    fun playReference() {
        val current = exercise ?: return
        timerJob?.cancel()
        referencePlaying = true
        timerJob = scope.launch {
            val stepMs = 60_000.0 / current.settings.bpm * 4 / current.subdivision
            var previousAt = 0.0
            current.hits.forEach { target ->
                val targetAt = target.step * stepMs
                delay((targetAt - previousAt).coerceAtLeast(0.0).roundToLong())
                drumSounds.play(target.voice, if (target.velocityTarget != null) target.velocityTarget else if (target.accent) 110 else 78)
                previousAt = targetAt
            }
            delay((current.durationMs - previousAt).coerceAtLeast(0.0).roundToLong())
            referencePlaying = false
            timerJob = null
        }
    }
    val cancelLatest = rememberUpdatedState(::cancelSightAttempt)
    SideEffect {
        midiInput.onHit = { hit ->
            if (useMidi && velocityCalibrationStage != null && hit.voice == velocityCalibrationVoice && phase != "Play") {
                velocityCalibrationSamples.add(hit.velocity)
                if (velocityCalibrationSamples.size >= 5) {
                    val median = velocityCalibrationSamples.sorted()[2]
                    velocityCalibrationSamples.clear()
                    if (velocityCalibrationStage == "soft") {
                        velocitySoftMedian = median
                        velocityCalibrationStage = "accented"
                        velocityCalibrationStatus = "Soft level recorded at $median. Strike five accented ${sightVoiceNames[hit.voice]} hits."
                    } else {
                        val soft = velocitySoftMedian
                        velocityCalibrationStage = null
                        if (soft == null || median - soft < 12) {
                            velocityCalibrationStatus = "Soft and accented levels were too close. Calibrate again with a clearer difference."
                        } else {
                            val portKey = selectedPort?.key
                            if (portKey != null) scope.launch {
                                withContext(Dispatchers.IO) { progressStore.saveSightVelocityCalibration(portKey, hit.voice, soft, median) }
                                velocityCalibrations = velocityCalibrations + (hit.voice to (soft to median))
                                velocityCalibrationStatus = "${sightVoiceNames[hit.voice]} velocity range saved for this MIDI device."
                            }
                        }
                    }
                }
            } else if (useMidi) registerHit(AndroidSightTap(hit.voice, hit.atMs, hit.velocity))
        }
        midiInput.onStatus = { status ->
            midiStatus = status
            if (phase in setOf("Preview", "Count-in", "Play") && useMidi && status.startsWith("MIDI disconnected")) cancelLatest.value()
        }
    }
    DisposableEffect(lifecycleOwner, midiInput) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) cancelLatest.value() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); timerJob?.cancel(); midiInput.onHit = {}; midiInput.onStatus = {} }
    }
    fun startPass() {
        val current = exercise ?: newExercise()
        timerJob?.cancel(); referencePlaying = false; taps.clear(); result = null
        val isPractice = attempted
        attempted = true
        phase = "Preview"; message = "Silent preview · 10 seconds."
        timerJob = scope.launch {
            delay(10_000)
            phase = "Count-in"; message = "Count-in · one bar."
            val beatMs = 60_000.0 / current.settings.bpm
            val countTicks = if (current.settings.meter == "7/8") 7 else ceil(current.beatsPerBar).toInt()
            val countTickMs = if (current.settings.meter == "7/8") beatMs / 2 else beatMs
            repeat(countTicks) { beat ->
                drumSounds.play("hihat", if (beat == 0) 115 else 75)
                delay(countTickMs.toLong())
            }
            phase = "Play"; message = "Read the score and play the phrase."
            captureStartMs = System.nanoTime() / 1_000_000.0
            val endAt = captureStartMs + current.durationMs
            var nextClick = 0
            var nextTarget = 0
            val eighthMeter = current.settings.meter == "7/8"
            val clickInterval = if (eighthMeter) beatMs / 2 else beatMs
            val clickCount = (if (eighthMeter) 7 else ceil(current.beatsPerBar).toInt()) * current.settings.bars
            while (System.nanoTime() / 1_000_000.0 < endAt) {
                val now = System.nanoTime() / 1_000_000.0
                val relative = now - captureStartMs
                targetCursorMs = relative
                currentBar = min(current.settings.bars - 1, (relative / (current.beatsPerBar * beatMs)).toInt())
                while (nextClick < clickCount && nextClick * clickInterval <= relative) {
                    val beat = nextClick % (if (eighthMeter) 7 else ceil(current.beatsPerBar).toInt())
                    drumSounds.play("hihat", if (beat == 0) 110 else 58)
                    nextClick++
                }
                while (nextTarget < current.hits.size && current.hits[nextTarget].step * beatMs * 4 / current.subdivision <= relative) {
                    val target = current.hits[nextTarget]
                    if (playTargetDrums) drumSounds.play(target.voice, if (target.accent) 110 else 78)
                    nextTarget++
                }
                delay(4)
            }
            val scored = scoreAndroidSight(current, taps.toList(), velocityCalibrations)
            result = scored; phase = "Results"; message = "Pass complete."
            saveCompletedAttempt(current, scored, if (useMidi) "midi" else "touch", isPractice)
        }
    }
    fun chooseLevel(value: String) {
        level = value
        val allowed = when (value) { "Beginner" -> listOf("4/4"); "Intermediate" -> listOf("4/4", "3/4"); else -> listOf("4/4", "3/4", "5/4", "7/8") }
        if (meter !in allowed) meter = allowed.first()
        if (value != "Advanced") dynamicsFocus = false
        exercise = null
    }
    fun startSpacedReview(suggestion: AndroidSightReviewSuggestion) {
        level = suggestion.level
        meter = suggestion.meter
        bpm = suggestion.bpm.coerceIn(40, 200)
        bars = 2
        dynamicsFocus = suggestion.dynamicsFocus && suggestion.level == "Advanced"
        if (dynamicsFocus) useMidi = true
        else if (useMidi && !midiStatus.startsWith("Connected to ")) useMidi = false
        selectedTemplateId = ""
        drillContext = null
        newExercise()
        attempted = true
        if (dynamicsFocus) message = "Spaced review due. Connect MIDI, calibrate the voices in this phrase, then start the practice pass."
        else startPass()
    }
    fun startContextDrill(context: String) {
        if (level == "Beginner" && context == "offbeat") level = "Intermediate"
        if (level != "Advanced" && meter !in listOf("4/4", "3/4")) meter = "4/4"
        bars = 2
        dynamicsFocus = false
        if (useMidi && !midiStatus.startsWith("Connected to ")) useMidi = false
        selectedTemplateId = ""
        drillContext = context
        newExercise()
        attempted = true
        startPass()
    }
    LaunchedEffect(currentBar, phase, zoom) {
        if (phase == "Play") scrollState.animateScrollTo(with(screenDensity) { (currentBar / 4 * 204 * zoom).dp.roundToPx() })
    }
    val dynamicVoices = exercise?.hits?.map { it.voice }?.distinct().orEmpty()
    val dynamicsReady = !dynamicsFocus || useMidi && dynamicVoices.isNotEmpty() && dynamicVoices.all { it in velocityCalibrations }
    val canStart = (phase == "Setup" || phase == "Results") && (!useMidi || midiStatus.startsWith("Connected to ")) && dynamicsReady
    val dueReview = remember(history) { androidSightReviewSuggestion(history) }
    val contextSuggestion = remember(history) { androidSightContextSuggestion(history) }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 16.dp)) {
                Text("Sight reading", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Read a fresh drum phrase from notation. Silent first reads build reading history; target playback is marked assisted.")
                if (phase == "Setup" || phase == "Results") {
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                var levelMenu by remember { mutableStateOf(false) }
                                Box {
                                    Button(onClick = { levelMenu = true }) { Text(level) }
                                    DropdownMenu(expanded = levelMenu, onDismissRequest = { levelMenu = false }) {
                                        listOf("Beginner", "Intermediate", "Advanced").forEach { option -> DropdownMenuItem(text = { Text(option) }, onClick = { chooseLevel(option); levelMenu = false }) }
                                    }
                                }
                                var meterMenu by remember { mutableStateOf(false) }
                                val meters = when (level) { "Beginner" -> listOf("4/4"); "Intermediate" -> listOf("4/4", "3/4"); else -> listOf("4/4", "3/4", "5/4", "7/8") }
                                Box {
                                    OutlinedButton(onClick = { meterMenu = true }) { Text(meter) }
                                    DropdownMenu(expanded = meterMenu, onDismissRequest = { meterMenu = false }) {
                                        meters.forEach { option -> DropdownMenuItem(text = { Text(if (option == "7/8") "7/8 · 2+2+3" else if (option == "5/4") "5/4 · 3+2" else option) }, onClick = { meter = option; exercise = null; meterMenu = false }) }
                                    }
                                }
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box {
                                    OutlinedButton(onClick = { templateMenuOpen = true }) {
                                        val selectedName = templates.firstOrNull { it.optString("id") == selectedTemplateId }?.optString("name")
                                        Text(selectedName?.let { "Template · $it" } ?: "Generated phrase")
                                    }
                                    DropdownMenu(expanded = templateMenuOpen, onDismissRequest = { templateMenuOpen = false }) {
                                        DropdownMenuItem(text = { Text("Generated phrase") }, onClick = { selectedTemplateId = ""; drillContext = null; exercise = null; templateMenuOpen = false })
                                        templates.forEach { row ->
                                            DropdownMenuItem(text = { Text("${row.optString("name")} · ${row.optString("meter")}") }, onClick = { selectedTemplateId = row.optString("id"); drillContext = null; exercise = null; templateMenuOpen = false })
                                        }
                                    }
                                }
                                if (selectedTemplateId.isNotEmpty()) Text("Repeats the saved measure across the chosen length.", style = MaterialTheme.typography.bodySmall)
                            }
                            Text("Quarter-note tempo · $bpm BPM")
                            Slider(value = bpm.toFloat(), onValueChange = { bpm = it.roundToInt(); exercise = null }, valueRange = 40f..200f)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("$bars bars"); Button(onClick = { bars = max(1, bars - 1); exercise = null }) { Text("−") }; Button(onClick = { bars = min(32, bars + 1); exercise = null }) { Text("+") }
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) { Text("Play target drums (assisted)", modifier = Modifier.weight(1f)); Switch(checked = playTargetDrums, onCheckedChange = { playTargetDrums = it }) }
                            Row(verticalAlignment = Alignment.CenterVertically) { Text("Use MIDI input", modifier = Modifier.weight(1f)); Switch(checked = useMidi, onCheckedChange = { useMidi = it }) }
                            if (level == "Advanced") {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("Read ghost, normal, and accented strokes (MIDI velocity)", modifier = Modifier.weight(1f))
                                    Switch(checked = dynamicsFocus, onCheckedChange = { value -> dynamicsFocus = value; if (value) useMidi = true; exercise = null })
                                }
                                if (dynamicsFocus) Text("Velocity targets are scored separately from timing and voice accuracy. Connect a MIDI device; target playback remains an assisted attempt.", style = MaterialTheme.typography.bodySmall)
                            }
                            if (useMidi) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = { availablePorts = midiInput.availablePorts(); midiMenuOpen = true }) { Text(selectedPort?.label ?: "Choose MIDI input") }
                                    DropdownMenu(expanded = midiMenuOpen, onDismissRequest = { midiMenuOpen = false }) {
                                        availablePorts.forEach { port -> DropdownMenuItem(text = { Text(port.label) }, onClick = { selectedPort = port; midiInput.connect(port); midiMenuOpen = false }) }
                                    }
                                    OutlinedButton(onClick = { midiInput.disconnect() }) { Text("Disconnect") }
                                }
                                Text(midiStatus, style = MaterialTheme.typography.bodySmall)
                                if (dynamicsFocus) {
                                    Text("Calibrate each voice with five soft strikes followed by five accented strikes. Saved ranges are specific to this MIDI device.", style = MaterialTheme.typography.bodySmall)
                                    sightVoices.filter { voice -> exercise?.hits?.any { it.voice == voice } == true }.forEach { voice ->
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            val calibration = velocityCalibrations[voice]
                                            Text("${sightVoiceNames[voice]} · ${calibration?.let { "soft ${it.first}, accent ${it.second}" } ?: "needs calibration"}", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                                            OutlinedButton(onClick = {
                                                velocityCalibrationVoice = voice
                                                velocityCalibrationStage = "soft"
                                                velocitySoftMedian = null
                                                velocityCalibrationSamples.clear()
                                                velocityCalibrationStatus = "Strike five soft ${sightVoiceNames[voice]} hits."
                                            }, enabled = midiStatus.startsWith("Connected to ") && phase != "Play") { Text(if (velocityCalibrationVoice == voice && velocityCalibrationStage != null) "Restart" else "Calibrate") }
                                        }
                                    }
                                    if (velocityCalibrationStage != null) Text("${velocityCalibrationStatus} · ${velocityCalibrationSamples.size}/5", style = MaterialTheme.typography.bodySmall)
                                    else if (velocityCalibrationStatus.isNotBlank()) Text(velocityCalibrationStatus, style = MaterialTheme.typography.bodySmall)
                                    if (!dynamicsReady && exercise != null) Text("Calibrate the voices in this phrase before starting the dynamics reading.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                                }
                            }
                            if (exercise != null && phase != "Play") {
                                OutlinedTextField(value = templateName, onValueChange = { templateName = it.take(80) }, label = { Text("Name this first-measure template") }, singleLine = true)
                                Button(onClick = { saveCurrentTemplate() }) { Text("Save first measure") }
                                if (templateStatus.isNotBlank()) Text(templateStatus, style = MaterialTheme.typography.bodySmall)
                            }
                            Text("10-second silent preview · one-bar count-in · one pass", style = MaterialTheme.typography.bodySmall)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { drillContext = null; newExercise() }) { Text(if (selectedTemplateId.isEmpty()) "New exercise" else "New from template") }
                                Button(onClick = { startPass() }, enabled = canStart) { Text(if (attempted || phase == "Results") "Retry as practice" else "Start reading") }
                            }
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${exercise?.settings?.level} · ${exercise?.settings?.meter} · ${exercise?.settings?.bpm} BPM · ${exercise?.settings?.bars} bars", modifier = Modifier.weight(1f))
                        Button(onClick = { cancelSightAttempt() }) { Text("Cancel") }
                    }
                    Text(message, fontWeight = FontWeight.SemiBold)
                }
                if (phase == "Setup" || phase == "Results") {
                    dueReview?.let { suggestion ->
                        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF4DB))) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Spaced review due", fontWeight = FontWeight.Bold)
                                Text("${suggestion.level} · ${suggestion.meter} · ${suggestion.bpm} BPM · ${suggestion.reason}")
                                Button(onClick = { startSpacedReview(suggestion) }) { Text("Start 2-bar review") }
                            }
                        }
                    }
                    contextSuggestion?.let { (context, count) ->
                        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF2FF))) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Focused reading drill", fontWeight = FontWeight.Bold)
                                Text("${context.replace('-', ' ').replaceFirstChar { it.uppercase() }} appeared $count times in your recent first reads.")
                                Button(onClick = { startContextDrill(context) }) { Text("Practice this pattern") }
                            }
                        }
                    }
                }
                if (exercise == null && phase == "Setup") {
                    Button(onClick = { newExercise() }) { Text("Generate notation") }
                }
                if (exercise != null) {
                    val current = exercise!!
                    Row(verticalAlignment = Alignment.CenterVertically) { Text("Notation zoom", modifier = Modifier.weight(1f)); Text("${(zoom * 100).roundToInt()}%") }
                    Slider(value = zoom.toFloat(), onValueChange = { zoom = it.toDouble() }, valueRange = .8f..1.5f)
                    BoxWithConstraints(Modifier.fillMaxWidth()
                        .height(min(ceil(current.settings.bars / 4.0) * 204 * zoom, 360.0).dp)) {
                        val density = LocalDensity.current
                        LaunchedEffect(currentBar, phase, zoom, maxWidth) {
                            if (phase == "Play") {
                                val fraction = max(0.0, zoom * (currentBar % 4) / 4.0 - 0.5)
                                horizontalScoreScrollState.animateScrollTo(with(density) { (maxWidth * fraction.toFloat()).roundToPx() })
                            }
                        }
                        Box(Modifier.fillMaxSize().verticalScroll(scrollState).horizontalScroll(horizontalScoreScrollState)) {
                            AndroidSightScoreCanvas(current, phase, targetCursorMs, currentBar, zoom.toFloat(), Modifier.width(maxWidth * zoom.toFloat()))
                        }
                    }
                    Text("Voice legend: Kick · Snare · Hi-hat · Tom · Crash. Cymbals use cross noteheads. > means accented. Rests mean silence.${if (current.settings.dynamicsFocus) " Parentheses mark ghost strokes; dynamic targets are scored separately." else ""} ${if (current.settings.meter == "7/8") "Grouping is 2+2+3." else if (current.settings.meter == "5/4") "Grouping is 3+2." else ""}", style = MaterialTheme.typography.bodySmall)
                    if (phase == "Play" && !useMidi) {
                        Text("Touch pads", fontWeight = FontWeight.Bold)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            sightVoices.forEach { voice -> Button(onClick = { registerHit(AndroidSightTap(voice, System.nanoTime() / 1_000_000.0, 84)) }, modifier = Modifier.size(width = 92.dp, height = 76.dp), shape = RoundedCornerShape(18.dp)) { Text(sightVoiceNames[voice] ?: voice) } }
                        }
                    }
                }
                result?.let { scored ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${when (resultClassification) { "assisted" -> "Assisted pass"; "practice" -> "Practice pass"; "reading" -> "First reading"; else -> "Pass complete" }} · ${scored.accuracy}% accuracy", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text("${scored.score} score · ${scored.misses} misses · ${scored.extras} extras")
                            Text("${scored.early} early · ${scored.late} late · ${scored.meanOffset?.let { "${abs(it)} ms average offset" } ?: "no matched hits"}")
                            scored.dynamicAccuracy?.let { Text("MIDI dynamics accuracy · $it% (reported separately)") }
                            if (scored.contextErrors.isNotEmpty()) Text("Common error contexts · ${scored.contextErrors.entries.sortedByDescending { it.value }.take(3).joinToString(" · ") { "${it.key.replace('-', ' ')} ${it.value}" }}")
                            OutlinedButton(onClick = { playReference() }, enabled = !referencePlaying) { Text(if (referencePlaying) "Playing reference…" else "Play reference") }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button(onClick = { newExercise() }) { Text("New exercise") }; OutlinedButton(onClick = { startPass() }, enabled = canStart) { Text("Retry as practice") } }
                        }
                    }
                }
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Reading history · ${history.size} attempts", fontWeight = FontWeight.Bold)
                        if (history.isEmpty()) Text("Completed passes appear here and in the portable learning archive.")
                    }
                }
            }
        }
        items(history.reversed()) { row ->
            Text("${row.optString("playedAt").take(10)} · ${row.optJSONObject("settings")?.optString("meter")} · ${row.optJSONObject("settings")?.optInt("bpm")} BPM · ${row.optInt("accuracy")}% · ${row.optString("classification")}", modifier = Modifier.padding(vertical = 4.dp))
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun AndroidSightScoreCanvas(exercise: AndroidSightExercise, phase: String, cursorMs: Double, currentBar: Int, zoom: Float, modifier: Modifier = Modifier) {
    val scale = zoom * LocalDensity.current.density
    val lineHeight = 204f * scale
    val lineCount = ceil(exercise.settings.bars / 4.0).toInt()
    val staffColor = Color(0xFF635E57)
    Canvas(modifier.height((lineCount * 204f * zoom).dp).semantics {
                contentDescription = "${exercise.settings.meter} drum score, ${exercise.settings.bars} bars. ${exercise.hits.joinToString { hit -> "${sightVoiceNames[hit.voice]} at step ${hit.step + 1}${hit.velocityTarget?.let { if (it <= 50) ", ghost stroke" else if (it >= 100) ", accented stroke" else ", normal stroke" } ?: ""}" }}"
    }) {
        val native = drawContext.canvas.nativeCanvas
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(68, 63, 56); textSize = 13f * scale; typeface = Typeface.create("serif", Typeface.NORMAL) }
        val staffTop = 30f * scale
        val systemGap = lineHeight
        val left = 40f * scale
        val usableWidth = size.width - left - 18f * scale
        val barWidth = usableWidth / 4f
        val staffGap = 12f * scale
        val staffHeight = staffGap * 4f
        val red = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(208, 59, 45); alpha = 24 }
        val cursorPaint = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(208, 59, 45); strokeWidth = 3f * zoom }
        val notePaint = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(32, 37, 43); style = Paint.Style.FILL }
        val linePaint = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(99, 94, 87); strokeWidth = 1.2f * zoom }
        val voiceY = mapOf("kick" to staffTop + staffHeight + 15f * scale, "snare" to staffTop + staffGap * 2, "hihat" to staffTop - 12f * scale, "tom" to staffTop + staffGap * 3, "crash" to staffTop - 24f * scale)
        repeat(exercise.settings.bars) { bar ->
            val system = bar / 4; val column = bar % 4; val x0 = left + column * barWidth; val y0 = staffTop + system * systemGap
            if (phase == "Play" && bar == currentBar) drawContext.canvas.drawRect(x0, y0 - 18f * scale, x0 + barWidth, y0 + staffHeight + 45f * scale, red)
            native.drawText("${bar + 1}", x0 - 20f * scale, y0 - 3f * scale, paint)
            repeat(5) { row -> drawLine(staffColor, Offset(x0, y0 + row * staffGap), Offset(x0 + barWidth, y0 + row * staffGap), 1f * scale) }
            drawLine(staffColor, Offset(x0, y0), Offset(x0, y0 + staffHeight), 1.5f * scale)
            if (bar % 4 == 3 || bar == exercise.settings.bars - 1) drawLine(staffColor, Offset(x0 + barWidth, y0), Offset(x0 + barWidth, y0 + staffHeight), 1.5f * scale)
            val barStart = bar * exercise.stepsPerBar
            val barHits = exercise.hits.filter { it.step in barStart until barStart + exercise.stepsPerBar }
            val occupied = barHits.map { it.step - barStart }.toSet()
            val beatUnit = exercise.subdivision / 4
            for (step in 0 until exercise.stepsPerBar) if (step % beatUnit == 0 && step !in occupied) {
                val x = x0 + 14f * scale + (step.toFloat() / exercise.stepsPerBar) * (barWidth - 28f * scale)
                native.drawText("𝄽", x, y0 + staffGap * 2 + 5f * scale, paint)
            }
            barHits.forEach { hit ->
                val local = hit.step - barStart
                val x = x0 + 14f * scale + (local.toFloat() / exercise.stepsPerBar) * (barWidth - 28f * scale)
                val y = y0 + (voiceY[hit.voice] ?: y0 + staffGap * 2) - staffTop
                val cymbal = hit.voice == "hihat" || hit.voice == "crash"
                if (cymbal) {
                    drawLine(Color(0xFF20252B), Offset(x - 5f * scale, y - 5f * scale), Offset(x + 5f * scale, y + 5f * scale), 2f * scale)
                    drawLine(Color(0xFF20252B), Offset(x - 5f * scale, y + 5f * scale), Offset(x + 5f * scale, y - 5f * scale), 2f * scale)
                } else drawOval(Color(0xFF20252B), topLeft = Offset(x - 5f * scale, y - 3f * scale), size = androidx.compose.ui.geometry.Size(10f * scale, 6f * scale))
                drawLine(Color(0xFF20252B), Offset(x + 5f * scale, y), Offset(x + 5f * scale, y - 23f * scale), 1.3f * scale)
                if (hit.velocityTarget != null && hit.velocityTarget <= 50) native.drawText("( )", x - 10f * scale, y - 10f * scale, paint)
                else if (hit.accent || (hit.velocityTarget ?: 0) >= 100) native.drawText(">", x - 6f * scale, y - 11f * scale, paint)
            }
            if (phase == "Play" && bar == currentBar) {
                val elapsedBar = cursorMs - bar * exercise.beatsPerBar * 60_000.0 / exercise.settings.bpm
                val fraction = (elapsedBar / (exercise.beatsPerBar * 60_000.0 / exercise.settings.bpm)).toFloat().coerceIn(0f, 1f)
                val x = x0 + 7f * scale + fraction * (barWidth - 14f * scale)
                drawLine(Color(0xFFD03B2D), Offset(x, y0 - 15f * scale), Offset(x, y0 + staffHeight + 25f * scale), 3f * scale)
            }
        }
        if (exercise.settings.meter == "5/4" || exercise.settings.meter == "7/8") native.drawText(if (exercise.settings.meter == "7/8") "2+2+3" else "3+2", size.width - 54f * scale, 16f * scale, paint)
    }
}
