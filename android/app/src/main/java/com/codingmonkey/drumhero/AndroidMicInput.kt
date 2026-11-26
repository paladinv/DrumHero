package com.codingmonkey.drumhero

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

/** Detects one selected drum voice from microphone level changes. Audio is processed in memory and never saved. */
class AndroidMicInput(context: Context) : AutoCloseable {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val running = AtomicBoolean(false)
    @Volatile private var recorder: AudioRecord? = null
    @Volatile private var worker: Thread? = null
    @Volatile private var threshold = 0.035
    @Volatile private var calibrated = false

    @Volatile var onHit: (atMs: Double, level: Int) -> Unit = { _, _ -> }
    @Volatile var onStatus: (String) -> Unit = {}

    val isListening: Boolean get() = running.get()

    fun startNoiseCalibrationAndListening(): Boolean {
        if (running.get()) return true
        if (appContext.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            postStatus("Allow microphone access to score one selected drum voice.")
            return false
        }

        val sampleRate = 22_050
        val minBytes = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBytes <= 0) {
            postStatus("Microphone input is unavailable on this device.")
            return false
        }
        val audioRecord = try {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBytes, 4_096),
            )
        } catch (_: SecurityException) {
            postStatus("Microphone permission was not granted.")
            return false
        } catch (_: IllegalArgumentException) {
            postStatus("Microphone input could not be opened on this device.")
            return false
        }
        if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
            audioRecord.release()
            postStatus("Microphone input could not be initialized.")
            return false
        }

        return try {
            audioRecord.startRecording()
            recorder = audioRecord
            calibrated = false
            running.set(true)
            worker = Thread({ capture(audioRecord) }, "DrumHeroMicInput").apply { isDaemon = true; start() }
            postStatus("Measuring room noise for a moment. Keep the room quiet, then play only the selected voice.")
            true
        } catch (_: SecurityException) {
            running.set(false)
            audioRecord.release()
            postStatus("Microphone permission was not granted.")
            false
        } catch (_: IllegalStateException) {
            running.set(false)
            audioRecord.release()
            postStatus("Microphone input could not be started.")
            false
        }
    }

    fun stop() {
        if (!running.getAndSet(false)) return
        runCatching { recorder?.stop() }
        val captureThread = worker
        if (captureThread != null && captureThread !== Thread.currentThread()) runCatching { captureThread.join(500) }
        runCatching { recorder?.release() }
        recorder = null
        worker = null
        calibrated = false
        postStatus("Microphone scoring stopped. No audio was saved.")
    }

    override fun close() = stop()

    private fun capture(audioRecord: AudioRecord) {
        val samples = ShortArray(512)
        val calibrationStartedAt = System.nanoTime() / 1_000_000L
        var calibrationFrames = 0
        var noiseTotal = 0.0
        var previousRms = 0.0
        var lastHitAt = 0L
        try {
            while (running.get()) {
                val count = audioRecord.read(samples, 0, samples.size, AudioRecord.READ_BLOCKING)
                if (count < 0) {
                    postStatus("Microphone input stopped unexpectedly. Try measuring room noise again.")
                    break
                }
                if (count == 0) continue
                var sum = 0.0
                for (index in 0 until count) {
                    val normalized = samples[index] / 32768.0
                    sum += normalized * normalized
                }
                val rms = sqrt(sum / count)
                val now = System.nanoTime() / 1_000_000L
                if (!calibrated) {
                    noiseTotal += rms
                    calibrationFrames += 1
                    if (now - calibrationStartedAt >= 1_500L && calibrationFrames > 0) {
                        val noiseFloor = noiseTotal / calibrationFrames
                        threshold = maxOf(0.025, noiseFloor * 3.2).coerceAtMost(0.28)
                        calibrated = true
                        previousRms = rms
                        postStatus("Room noise measured. Play the selected drum voice with headphones if possible; microphone audio stays in memory only.")
                    }
                    continue
                }

                if (rms >= threshold && previousRms < threshold * 0.72 && now - lastHitAt >= 130L) {
                    lastHitAt = now
                    val level = ((rms * 240.0).toInt()).coerceIn(1, 127)
                    val hitAt = now.toDouble()
                    mainHandler.post { if (running.get()) onHit(hitAt, level) }
                }
                previousRms = rms
            }
        } catch (_: SecurityException) {
            postStatus("Microphone permission changed. Microphone scoring stopped.")
        } catch (_: IllegalStateException) {
            if (running.get()) postStatus("Microphone input stopped unexpectedly. Try measuring room noise again.")
        } finally {
            if (running.getAndSet(false)) {
                runCatching { audioRecord.stop() }
                runCatching { audioRecord.release() }
            }
            if (recorder === audioRecord) recorder = null
            worker = null
        }
    }

    private fun postStatus(message: String) { mainHandler.post { onStatus(message) } }
}
