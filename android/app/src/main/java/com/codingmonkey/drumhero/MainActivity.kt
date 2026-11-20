package com.codingmonkey.drumhero

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.media.AudioAttributes
import android.media.SoundPool
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale
import java.text.SimpleDateFormat
import java.util.Date
import java.util.TimeZone
import java.util.UUID
import kotlin.math.abs
import kotlin.math.roundToInt

private val Teal = Color(0xFF166456)
private val Paper = Color(0xFFF7F5EF)
private val Voices = listOf("kick", "snare", "hihat", "tom", "crash")
private val VoiceNames = mapOf("kick" to "Kick", "snare" to "Snare", "hihat" to "Hi-hat", "tom" to "Tom", "crash" to "Crash")

private data class PatternHit(val step: Int, val voice: String, val accent: Boolean)
private data class DrumPattern(
    val id: String,
    val name: String,
    val level: String,
    val description: String,
    val beats: Double,
    val subdivision: Int,
    val bpm: Int,
    val meter: String,
    val hits: List<PatternHit>
) {
    val steps: Int get() = (beats * subdivision / 4).roundToInt()
}
private data class Target(val at: Long, val voice: String, val step: Int, var rating: String? = null, var offset: Long = 0)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DrumHeroApp() }
    }
}

private class DrumSounds(context: android.content.Context) {
    private val pool = SoundPool.Builder().setMaxStreams(12).setAudioAttributes(
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    ).build()
    private val sounds = Voices.associateWith { voice -> runCatching { pool.load(context.assets.openFd("$voice-1.wav"), 1) }.getOrNull() }
    fun play(voice: String, velocity: Int = 100) {
        sounds[voice]?.let { pool.play(it, velocity / 127f, velocity / 127f, 1, 0, 1f) }
    }
    fun release() { pool.release() }
}

private fun loadPatterns(context: android.content.Context): Pair<List<JSONObject>, List<DrumPattern>> {
    val root = JSONObject(context.assets.open("drum-content.json").bufferedReader().use { it.readText() })
    val lessons = (0 until root.getJSONArray("lessons").length()).map { root.getJSONArray("lessons").getJSONObject(it) }
    val patterns = listOf("rudiments", "grooves").flatMap { key ->
        val array = root.getJSONArray(key)
        (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            val hitsArray = item.getJSONArray("hits")
            DrumPattern(
                id = item.getString("id"), name = item.getString("name"), level = item.optString("level", "Beginner"),
                description = item.optString("description", "Practice this rhythm steadily."), beats = item.optDouble("beats", 4.0),
                subdivision = item.optInt("subdivision", 8), bpm = item.optInt("defaultBpm", 80),
                meter = item.optString("meter", "4/4"), hits = (0 until hitsArray.length()).map { hit ->
                    val note = hitsArray.getJSONObject(hit)
                    PatternHit(note.getInt("step"), note.getString("instrument"), note.optBoolean("accent"))
                }
            )
        }
    }
    return lessons to patterns
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DrumHeroApp() {
    val context = LocalContext.current
    val content = remember { runCatching { loadPatterns(context) }.getOrNull() }
    val drumSounds = remember(context) { DrumSounds(context) }
    val progressStore = remember(context) { DrumProgressStore(context) }
    val midiInput = remember(context) { AndroidMidiInput(context) }
    val scope = rememberCoroutineScope()
    var tab by remember { mutableIntStateOf(0) }
    var completed by remember { mutableStateOf(emptySet<String>()) }
    var recentSessions by remember { mutableStateOf(emptyList<AndroidPracticeSession>()) }
    var preferredBpm by remember { mutableIntStateOf(80) }
    var archiveMessage by remember { mutableStateOf("") }
    var pendingArchiveReview by remember { mutableStateOf<AndroidArchiveReview?>(null) }
    LaunchedEffect(progressStore) {
        val snapshot = withContext(Dispatchers.IO) { Triple(progressStore.completedLessons(), progressStore.recentSessions(), progressStore.preferredBpm()) }
        completed = snapshot.first
        recentSessions = snapshot.second
        preferredBpm = snapshot.third
    }
    val exportArchive = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) scope.launch {
            archiveMessage = try {
                val raw = withContext(Dispatchers.IO) { progressStore.exportArchive(preferredBpm) }
                withContext(Dispatchers.IO) {
                    val output = context.contentResolver.openOutputStream(uri) ?: error("The selected file could not be opened for writing.")
                    output.bufferedWriter(Charsets.UTF_8).use { it.write(raw) }
                }
                "Learning archive exported. The file contains the Android progress supported here and preserves imported web/iOS ear-training and Trainer detail." 
            } catch (error: Exception) { "Could not export the learning archive: ${error.localizedMessage ?: "file write failed"}" }
        }
    }
    val importArchive = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            pendingArchiveReview = null
            archiveMessage = try {
                val raw = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use(::readAndroidArchive)
                        ?: error("The selected file could not be opened.")
                }
                val lessonIds = content?.first?.map { it.optString("id") }?.toSet().orEmpty()
                val patternIds = content?.second?.map { it.id }?.toSet().orEmpty()
                val review = withContext(Dispatchers.IO) { parseAndroidArchive(raw, lessonIds, patternIds) }
                pendingArchiveReview = review
                "Archive ready for review. Nothing has been merged yet."
            } catch (error: Exception) { "Could not import the learning archive: ${error.localizedMessage ?: "file is unsupported"}" }
        }
    }
    val mergePendingArchive: () -> Unit = {
        val review = pendingArchiveReview
        if (review != null) scope.launch {
            archiveMessage = "Merging the reviewed archive…"
            try {
                withContext(Dispatchers.IO) { progressStore.mergeArchive(review) }
                val snapshot = withContext(Dispatchers.IO) { Triple(progressStore.completedLessons(), progressStore.recentSessions(), progressStore.preferredBpm()) }
                completed = snapshot.first; recentSessions = snapshot.second; preferredBpm = snapshot.third
                archiveMessage = "Merged ${review.completedLessons.size} lesson records and ${review.sessions.size} practice sessions. Preserved ${review.preservedEarResults} ear-training results and ${review.preservedTrainerRounds} Trainer rounds for later export.${if (review.ignoredLessons + review.ignoredSessions > 0) " Skipped ${review.ignoredLessons + review.ignoredSessions} records for content this app version does not know." else ""}"
                pendingArchiveReview = null
            } catch (error: Exception) {
                archiveMessage = "Could not merge the learning archive: ${error.localizedMessage ?: "merge failed"}"
            }
        }
    }
    LaunchedEffect(tab) {
        if (tab != 2) {
            midiInput.clearListeners()
            midiInput.disconnect()
        }
    }
    DisposableEffect(drumSounds, progressStore, midiInput) { onDispose { midiInput.close(); drumSounds.release(); progressStore.close() } }

    MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = Teal, secondary = Color(0xFFE77655), background = Paper, surface = Color.White)) {
        Scaffold(
            topBar = { TopAppBar(title = { Text("Drum Hero", fontWeight = FontWeight.Bold) }) },
            bottomBar = {
                NavigationBar {
                    listOf("Home", "Learn", "Practice", "Progress").forEachIndexed { index, label ->
                        NavigationBarItem(selected = tab == index, onClick = { tab = index }, icon = { Text(listOf("⌂", "▤", "◉", "▥")[index]) }, label = { Text(label) })
                    }
                }
            }
        ) { padding ->
            Surface(color = Paper, modifier = Modifier.fillMaxSize().padding(padding)) {
                when (tab) {
                    1 -> if (content != null) LearnScreen(content.first, completed.toList()) { id ->
                        completed = completed + id
                        scope.launch(Dispatchers.IO) { progressStore.completeLesson(id) }
                    } else ErrorScreen()
                    2 -> if (content != null) PracticeScreen(content.second, recentSessions, drumSounds, midiInput, progressStore) { session ->
                        recentSessions = (listOf(session) + recentSessions.filterNot { it.id == session.id }).take(50)
                        scope.launch(Dispatchers.IO) { progressStore.saveSession(session) }
                    } else ErrorScreen()
                    3 -> ProgressScreen(completed.size, recentSessions, archiveMessage, pendingArchiveReview,
                        onExport = { exportArchive.launch("drum-hero-learning-archive-${SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())}.json") },
                        onImport = { importArchive.launch(arrayOf("application/json", "text/json")) },
                        onConfirmImport = mergePendingArchive,
                        onCancelImport = { pendingArchiveReview = null; archiveMessage = "Import cancelled. No archive data was merged." })
                    else -> HomeScreen(completed.size, content?.first?.size ?: 0) { tab = 2 }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(completed: Int, total: Int, practice: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Build the beat. Own the pocket.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Clear lessons, playable patterns, and timing feedback. Your progress stays on this device.")
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Continue learning", fontWeight = FontWeight.Bold)
                Text("$completed of $total lessons completed")
                Button(onClick = practice) { Text("Start a practice round") }
            }
        }
        Text("Choose a session", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text("Practice follows the drum score with a moving playhead. Touch pads work without an account or network connection.")
    }
}

@Composable
private fun LearnScreen(lessons: List<JSONObject>, completed: List<String>, onComplete: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text("Lessons", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 14.dp))
        androidx.compose.foundation.lazy.LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(lessons) { index, lesson ->
                val id = lesson.optString("id")
                val done = completed.contains(id)
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${lesson.optInt("order", index + 1)}. ${lesson.optString("title")}", fontWeight = FontWeight.Bold)
                        Text("${lesson.optString("level")} · ${lesson.optInt("duration")} min", color = Teal, fontSize = 12.sp)
                        Text(lesson.optString("summary"), fontSize = 14.sp)
                        Button(onClick = { onComplete(id) }, enabled = !done) { Text(if (done) "Completed" else "Mark lesson complete") }
                    }
                }
            }
        }
    }
}

@Composable
private fun PracticeScreen(patterns: List<DrumPattern>, recentScores: List<AndroidPracticeSession>, drumSounds: DrumSounds, midiInput: AndroidMidiInput, progressStore: DrumProgressStore, onResult: (AndroidPracticeSession) -> Unit) {
    var patternIndex by remember { mutableIntStateOf(0) }
    val pattern = patterns.getOrNull(patternIndex)
    var bpm by remember { mutableIntStateOf(pattern?.bpm ?: 80) }
    var menuOpen by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf(false) }
    var playhead by remember { mutableIntStateOf(-1) }
    var startAt by remember { mutableStateOf(0.0) }
    var beatMs by remember { mutableStateOf(750.0) }
    var countIn by remember { mutableIntStateOf(0) }
    var extraHits by remember { mutableIntStateOf(0) }
    val targets = remember { mutableStateListOf<Target>() }
    var feedback by remember { mutableStateOf("") }
    var completedRound by remember { mutableStateOf(false) }
    var midiPorts by remember { mutableStateOf(emptyList<AndroidMidiPort>()) }
    var selectedMidiPort by remember { mutableStateOf<AndroidMidiPort?>(null) }
    var showMidiMenu by remember { mutableStateOf(false) }
    var bluetoothMidiDevices by remember { mutableStateOf(emptyList<AndroidBluetoothMidiDevice>()) }
    var selectedBluetoothMidiDevice by remember { mutableStateOf<AndroidBluetoothMidiDevice?>(null) }
    var showBluetoothMidiMenu by remember { mutableStateOf(false) }
    var midiStatus by remember { mutableStateOf("MIDI disconnected.") }
    var midiCorrectionMs by remember { mutableIntStateOf(0) }
    var midiCalibrationActive by remember { mutableStateOf(false) }
    var midiCalibrationStart by remember { mutableStateOf(0.0) }
    var midiCalibrationTargets by remember { mutableStateOf(emptyList<Double>()) }
    val midiCalibrationCaptured = remember { mutableStateListOf<Int>() }
    val midiCalibrationOffsets = remember { mutableStateListOf<Double>() }
    var midiCalibrationMessage by remember { mutableStateOf("") }
    val practiceScope = rememberCoroutineScope()
    val context = LocalContext.current
    val bluetoothPermissions = remember {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }
    val startBluetoothScan: () -> Unit = {
        bluetoothMidiDevices = emptyList()
        midiInput.scanBluetoothMidi { found ->
            if (bluetoothMidiDevices.none { it.id == found.id }) bluetoothMidiDevices = bluetoothMidiDevices + found
        }
    }
    val bluetoothPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (bluetoothPermissions.all { grants[it] == true }) startBluetoothScan()
        else midiStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "Bluetooth MIDI discovery needs Nearby devices permission." else "Bluetooth MIDI discovery needs Location permission on this Android version."
    }

    LaunchedEffect(selectedMidiPort?.key) {
        val key = selectedMidiPort?.key
        midiCorrectionMs = if (key == null) 0 else withContext(Dispatchers.IO) { progressStore.midiCorrection(key) }
        midiCalibrationMessage = if (midiCorrectionMs == 0) "No saved timing correction for this MIDI port." else "Saved correction for this MIDI port: ${midiCorrectionMs} ms."
    }

    fun recordHit(voice: String, velocity: Int, atMs: Double = System.nanoTime() / 1_000_000.0, audition: Boolean = true, fromMidi: Boolean = false) {
        if (audition) drumSounds.play(voice, velocity)
        if (fromMidi && midiCalibrationActive) {
            val closest = midiCalibrationTargets.withIndex().filter { it.index !in midiCalibrationCaptured }
                .minByOrNull { abs(it.value - atMs) }
            if (closest != null && abs(closest.value - atMs) <= 220) {
                midiCalibrationCaptured.add(closest.index)
                midiCalibrationOffsets.add(atMs - closest.value)
                midiCalibrationMessage = "Calibration strike ${midiCalibrationCaptured.size} of 8."
                if (midiCalibrationCaptured.size == 8) {
                    val sorted = midiCalibrationOffsets.sorted()
                    midiCorrectionMs = ((sorted[3] + sorted[4]) / 2.0).roundToInt().coerceIn(-200, 200)
                    selectedMidiPort?.key?.let { key -> practiceScope.launch(Dispatchers.IO) { progressStore.saveMidiCorrection(key, midiCorrectionMs) } }
                    midiCalibrationActive = false
                    midiCalibrationMessage = "Saved ${midiCorrectionMs} ms correction for this MIDI port. Physical-device timing still needs validation."
                }
            } else midiCalibrationMessage = "Wait for the next click, then play one clear drum hit."
            return
        }
        if (!active || playhead < 0 || pattern == null) return
        val correctedAt = if (fromMidi) atMs - midiCorrectionMs else atMs
        val matched = targets.withIndex().filter { it.value.voice == voice && it.value.rating == null }
            .minByOrNull { abs(it.value.at - correctedAt) }
        if (matched != null && abs(matched.value.at - correctedAt) <= 100) {
            matched.value.rating = if (abs(matched.value.at - correctedAt) <= 50) "Great" else "Good"
            matched.value.offset = (correctedAt - matched.value.at).toLong()
        } else extraHits += 1
    }
    SideEffect { midiInput.onHit = { event -> recordHit(event.voice, event.velocity, event.atMs, audition = false, fromMidi = true) } }
    SideEffect { midiInput.onStatus = { status -> midiStatus = status } }

    LaunchedEffect(midiCalibrationActive, midiCalibrationStart, bpm) {
        if (!midiCalibrationActive) return@LaunchedEffect
        val intervalMs = 60_000.0 / bpm
        val start = midiCalibrationStart
        midiCalibrationTargets = (0 until 8).map { start + it * intervalMs }
        midiCalibrationCaptured.clear(); midiCalibrationOffsets.clear()
        for (targetAt in midiCalibrationTargets) {
            while (midiCalibrationActive && System.nanoTime() / 1_000_000.0 < targetAt) delay(8)
            if (!midiCalibrationActive) return@LaunchedEffect
            drumSounds.play("hihat", 90)
        }
        if (midiCalibrationActive) {
            midiCalibrationActive = false
            midiCalibrationMessage = "Received ${midiCalibrationCaptured.size} of 8 calibration strikes. Try again with one strike per click."
        }
    }

    LaunchedEffect(active, pattern?.id, bpm) {
        if (!active || pattern == null) return@LaunchedEffect
        val quarter = 60_000.0 / bpm
        beatMs = quarter
        val stepMs = quarter * 4 / pattern.subdivision
        val start = System.nanoTime() / 1_000_000.0 + quarter * 4
        startAt = start
        val roundTargets = (0 until 4).flatMap { bar -> pattern.hits.map { hit ->
            Target((start + bar * pattern.beats * quarter + hit.step * stepMs).toLong(), hit.voice, hit.step)
        } }
        extraHits = 0
        targets.clear(); targets.addAll(roundTargets)
        val endAt = start + pattern.beats * quarter * 4
        while (active && System.nanoTime() / 1_000_000.0 < endAt) {
            val now = System.nanoTime() / 1_000_000.0
            countIn = if (now < start) (4 - ((start - now) / quarter).toInt()).coerceIn(1, 4) else 0
            playhead = if (now < start) -1 else (((now - start) / stepMs).toInt()).coerceIn(0, pattern.steps * 4 - 1)
            delay(24)
        }
        if (active) {
            val great = targets.count { it.rating == "Great" }
            val good = targets.count { it.rating == "Good" }
            val missed = targets.count { it.rating == null }
            val extras = extraHits
            val total = maxOf(1, targets.size)
            val score = ((great * 100 + good * 70) / total - extras * 2).coerceIn(0, 100)
            val accuracy = ((great + good) * 100 / total).coerceIn(0, 100)
            val playedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
            val session = AndroidPracticeSession(UUID.randomUUID().toString(), pattern.id, pattern.name, bpm, playedAt, score, accuracy, great, good, missed, extras)
            active = false; completedRound = true; playhead = -1
            feedback = "Round complete · $score% · Great $great · Good $good · Miss $missed · Extra $extras"
            onResult(session)
        }
    }
    LaunchedEffect(active, playhead, pattern?.id) {
        if (active && playhead >= 0 && pattern != null) {
            val step = playhead % pattern.steps
            pattern.hits.filter { it.step == step }.forEach { drumSounds.play(it.voice, if (it.accent) 115 else 82) }
        }
    }
    LaunchedEffect(active, countIn) {
        if (active && countIn > 0) drumSounds.play("hihat", if (countIn == 4) 112 else 68)
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Practice", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("MIDI input", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = {
                val missing = bluetoothPermissions.any { context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
                if (missing) bluetoothPermissionLauncher.launch(bluetoothPermissions) else startBluetoothScan()
            }, modifier = Modifier.weight(1f)) { Text("Scan Bluetooth MIDI", maxLines = 1) }
            Box(Modifier.weight(1f)) {
                Button(onClick = { showBluetoothMidiMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(selectedBluetoothMidiDevice?.label ?: "Select Bluetooth kit", maxLines = 1)
                }
                DropdownMenu(expanded = showBluetoothMidiMenu, onDismissRequest = { showBluetoothMidiMenu = false }) {
                    if (bluetoothMidiDevices.isEmpty()) DropdownMenuItem(text = { Text("No Bluetooth MIDI kits found") }, onClick = { showBluetoothMidiMenu = false }, enabled = false)
                    bluetoothMidiDevices.forEach { found -> DropdownMenuItem(text = { Text(found.label) }, onClick = {
                        selectedBluetoothMidiDevice = found; selectedMidiPort = null; showBluetoothMidiMenu = false
                    }) }
                }
            }
            Button(onClick = { selectedBluetoothMidiDevice?.let { found -> midiInput.connectBluetooth(found) { port -> selectedMidiPort = port } }, enabled = selectedBluetoothMidiDevice != null && !active) { Text("Connect") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                Button(onClick = { midiPorts = midiInput.availablePorts(); showMidiMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(selectedMidiPort?.label ?: "Find MIDI drum kit", maxLines = 1)
                }
                DropdownMenu(expanded = showMidiMenu, onDismissRequest = { showMidiMenu = false }) {
                    if (midiPorts.isEmpty()) DropdownMenuItem(text = { Text("No MIDI drum outputs found") }, onClick = { showMidiMenu = false }, enabled = false)
                    midiPorts.forEach { port -> DropdownMenuItem(text = { Text(port.label) }, onClick = { midiInput.disconnect(); selectedBluetoothMidiDevice = null; selectedMidiPort = port; showMidiMenu = false }) }
                    DropdownMenuItem(text = { Text("Refresh device list") }, onClick = { midiPorts = midiInput.availablePorts() })
                }
            }
            Button(onClick = { selectedBluetoothMidiDevice = null; selectedMidiPort?.let(midiInput::connect) }, enabled = selectedMidiPort != null && selectedBluetoothMidiDevice == null && !active) { Text("Connect USB / MIDI") }
            Button(onClick = { midiInput.disconnect() }, enabled = !midiStatus.startsWith("MIDI disconnected")) { Text("Disconnect") }
        }
        Text(midiStatus, fontSize = 11.sp, color = Teal)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = {
                midiCalibrationActive = true
                midiCalibrationStart = System.nanoTime() / 1_000_000.0 + 4 * 60_000.0 / bpm
                midiCalibrationMessage = "Count in for four beats, then play one drum hit on each of the next eight clicks."
            }, enabled = midiStatus.startsWith("Connected") && selectedMidiPort != null && !active && !midiCalibrationActive) { Text("Calibrate MIDI timing") }
            if (midiCalibrationActive) Button(onClick = { midiCalibrationActive = false; midiCalibrationMessage = "Calibration cancelled; saved correction was not changed." }) { Text("Cancel") }
        }
        if (midiCalibrationMessage.isNotBlank()) Text(midiCalibrationMessage, fontSize = 11.sp, color = Teal)
        Text("General MIDI percussion notes map to kick, snare, hi-hat, tom, and crash. Android input timing is experimental until physical-device testing is complete.", fontSize = 11.sp, color = Color.DarkGray)
        Box {
            Button(onClick = { menuOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(pattern?.let { "${it.name} · ${it.level}" } ?: "Choose pattern") }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                patterns.take(100).forEachIndexed { index, item -> DropdownMenuItem(text = { Text("${item.name} · ${item.level}") }, onClick = { patternIndex = index; bpm = item.bpm; menuOpen = false; active = false; completedRound = false }) }
            }
        }
        if (pattern != null) {
            Text(pattern.description, color = Color.DarkGray)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("$bpm BPM", fontWeight = FontWeight.Bold)
                Slider(value = bpm.toFloat(), onValueChange = { bpm = it.roundToInt() }, valueRange = 40f..200f, modifier = Modifier.weight(1f), enabled = !active)
            }
            Text("${pattern.meter} · follow the staff and moving beat", fontSize = 12.sp, color = Teal)
            Text("Score voices: ${pattern.hits.map { VoiceNames[it.voice] ?: it.voice }.distinct().joinToString()}", fontSize = 12.sp, color = Color.DarkGray)
            androidx.compose.foundation.rememberScrollState().let { scroll ->
                Row(Modifier.fillMaxWidth().horizontalScroll(scroll)) {
                    for (bar in 0 until 4) {
                        RhythmStaff(pattern, playhead - bar * pattern.steps, bar, Modifier.width((pattern.steps * 42 + 12).dp).height(160.dp))
                    }
                }
            }
            Text(if (active && countIn > 0) "Count in · $countIn" else if (active) "Playing · step ${playhead + 1}" else feedback.ifBlank { "Four bars · touch a pad when its voice appears in the score." }, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { active = !active; feedback = ""; completedRound = false }, enabled = !active) { Text(if (completedRound) "Play again" else "Start 4 bars") }
                if (active) Button(onClick = { active = false; playhead = -1; feedback = "Round paused. Start again for a fresh count-in." }) { Text("Stop") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Voices.forEach { voice ->
                    Button(onClick = { recordHit(voice, 100) }, modifier = Modifier.weight(1f).height(64.dp), shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = if (voice == "kick") Teal else Color(0xFF333B44))) {
                        Text(VoiceNames[voice] ?: voice, fontSize = 11.sp)
                    }
                }
            }
        }
        if (recentScores.isNotEmpty()) Text("Last score · ${recentScores.first().patternName} · ${recentScores.first().score}% · ${recentScores.first().bpm} BPM", fontSize = 12.sp, color = Color.DarkGray)
    }
}

@Composable
private fun RhythmStaff(pattern: DrumPattern, currentStep: Int, bar: Int, modifier: Modifier = Modifier) {
    val staff = Color(0xFF384046)
    val notePositions = mapOf("crash" to 18f, "hihat" to 30f, "tom" to 54f, "snare" to 78f, "kick" to 102f)
    val accessibleScore = buildString {
        append("Bar ${bar + 1} drum staff. ")
        val barHits = pattern.hits.sortedBy { it.step }
        if (barHits.isEmpty()) append("Rest.")
        else barHits.forEach { hit -> append("Step ${hit.step + 1}: ${VoiceNames[hit.voice] ?: hit.voice}${if (hit.accent) ", accent" else ""}. ") }
    }
    Column(modifier.semantics(mergeDescendants = true) { contentDescription = accessibleScore }.background(Color.White, RoundedCornerShape(12.dp)).padding(6.dp)) {
        Text("Bar ${bar + 1}", fontSize = 11.sp, color = Teal, fontWeight = FontWeight.Bold)
        Canvas(Modifier.fillMaxSize()) {
            val stepWidth = size.width / pattern.steps.coerceAtLeast(1)
            for (line in 0..4) {
                val y = 16.dp.toPx() + line * 22.dp.toPx()
                drawLine(staff, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
            }
            for (step in 0 until pattern.steps) {
                val x = stepWidth * (step + 0.5f)
                if (step % (pattern.subdivision / 4).coerceAtLeast(1) == 0) {
                    val label = (step / (pattern.subdivision / 4).coerceAtLeast(1) + 1).toString()
                    drawContext.canvas.nativeCanvas.drawText(label, x - 4.dp.toPx(), 144.dp.toPx(), android.graphics.Paint().apply { color = android.graphics.Color.DKGRAY; textSize = 10.sp.toPx() })
                }
                if (step % (pattern.subdivision / 4).coerceAtLeast(1) == 0 && pattern.hits.none { it.step == step }) {
                    drawContext.canvas.nativeCanvas.drawText("𝄽", x - 5.dp.toPx(), 86.dp.toPx(), android.graphics.Paint().apply { color = android.graphics.Color.DKGRAY; textSize = 18.sp.toPx() })
                }
                pattern.hits.filter { it.step == step }.forEach { hit ->
                    val y = (notePositions[hit.voice] ?: 78f).dp.toPx()
                    if (hit.voice == "hihat" || hit.voice == "crash") {
                        drawLine(Color(0xFF17232B), Offset(x - 6.dp.toPx(), y - 5.dp.toPx()), Offset(x + 6.dp.toPx(), y + 5.dp.toPx()), 1.8.dp.toPx())
                        drawLine(Color(0xFF17232B), Offset(x - 6.dp.toPx(), y + 5.dp.toPx()), Offset(x + 6.dp.toPx(), y - 5.dp.toPx()), 1.8.dp.toPx())
                    } else {
                        drawOval(Color(0xFF17232B), topLeft = Offset(x - 6.dp.toPx(), y - 4.dp.toPx()), size = androidx.compose.ui.geometry.Size(12.dp.toPx(), 8.dp.toPx()))
                    }
                    drawLine(staff, Offset(x + 5.dp.toPx(), y), Offset(x + 5.dp.toPx(), y - 29.dp.toPx()), 1.4.dp.toPx())
                    if (hit.accent) {
                        val accent = Path().apply { moveTo(x - 7.dp.toPx(), y - 14.dp.toPx()); lineTo(x, y - 18.dp.toPx()); lineTo(x + 7.dp.toPx(), y - 14.dp.toPx()) }
                        drawPath(accent, Teal, style = Stroke(width = 1.4.dp.toPx()))
                    }
                }
            }
            if (currentStep >= 0 && currentStep < pattern.steps) {
                val x = stepWidth * (currentStep + 0.5f)
                drawLine(Color(0xFFE77655), Offset(x, 0f), Offset(x, size.height), 2.dp.toPx())
            }
        }
    }
}

@Composable
private fun ProgressScreen(completed: Int, recent: List<AndroidPracticeSession>, archiveMessage: String, pendingArchiveReview: AndroidArchiveReview?, onExport: () -> Unit, onImport: () -> Unit, onConfirmImport: () -> Unit, onCancelImport: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Progress", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("$completed lessons completed · ${recent.size} recent practice rounds")
        Text("Your progress is stored in a local database on this device.", fontSize = 12.sp, color = Color.DarkGray)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onExport) { Text("Export learning archive") }
            Button(onClick = onImport) { Text("Import archive") }
        }
        pendingArchiveReview?.let { review ->
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Review imported archive", fontWeight = FontWeight.Bold)
                    Text("${review.completedLessons.size} lesson records · ${review.sessions.size} practice rounds · ${review.bestScores.size} best scores · preferred tempo ${review.preferredBpm} BPM")
                    Text("${review.preservedEarResults} ear-training results and ${review.preservedTrainerRounds} Trainer rounds will be retained for later export. ${review.passthrough.optJSONArray("personalSongs")?.length() ?: 0} songs and ${review.passthrough.optJSONArray("customGrooves")?.length() ?: 0} grooves will also be preserved.")
                    if (review.ignoredLessons + review.ignoredSessions > 0) Text("${review.ignoredLessons + review.ignoredSessions} lesson or practice records use IDs this Android content version does not recognize and will be skipped.")
                    Text("Supported progress merges into this device. Review the fields above before continuing.", fontSize = 12.sp, color = Color.DarkGray)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onConfirmImport) { Text("Merge archive") }
                        Button(onClick = onCancelImport) { Text("Cancel") }
                    }
                }
            }
        }
        if (archiveMessage.isNotBlank()) Text(archiveMessage, fontSize = 12.sp, color = Teal, modifier = Modifier.semantics { contentDescription = archiveMessage })
        HorizontalDivider()
        recent.take(15).forEach { session -> Text("${session.patternName} · ${session.accuracy}% accuracy · ${session.bpm} BPM · ${session.playedAt.take(10)}", fontSize = 13.sp) }
        if (recent.isEmpty()) Text("Your scores will appear here after a practice round.", color = Color.DarkGray)
    }
}

@Composable
private fun ErrorScreen() { Text("Learning content could not be loaded.", modifier = Modifier.padding(20.dp)) }
