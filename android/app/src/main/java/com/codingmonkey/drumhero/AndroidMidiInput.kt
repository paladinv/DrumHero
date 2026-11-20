package com.codingmonkey.drumhero

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.io.IOException
import java.util.UUID

data class AndroidMidiPort(val key: String, val deviceId: Int, val portNumber: Int, val label: String)
data class AndroidMidiHit(val voice: String, val velocity: Int, val atMs: Double)
class AndroidBluetoothMidiDevice internal constructor(val id: String, val label: String, internal val nativeDevice: BluetoothDevice)

class AndroidMidiInput(context: Context) : AutoCloseable {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(Context.MIDI_SERVICE) as? MidiManager
    private val bluetoothManager = appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private var device: MidiDevice? = null
    private var outputPort: MidiOutputPort? = null
    private var receiver: MidiReceiver? = null
    private var connectionRequest = 0
    private var bleScanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private var scanTimeout: Runnable? = null
    var onHit: (AndroidMidiHit) -> Unit = {}
    var onStatus: (String) -> Unit = {}
    private val bluetoothPermissionName: String get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "Nearby devices" else "Location"

    fun availablePorts(): List<AndroidMidiPort> {
        val midiManager = manager ?: return emptyList()
        val infos = try {
            if (Build.VERSION.SDK_INT >= 33) midiManager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).toList()
            else midiManager.devices.toList()
        } catch (_: SecurityException) {
            onStatus("Allow $bluetoothPermissionName permission to find Bluetooth MIDI kits.")
            return emptyList()
        }
        return try {
            infos.flatMap { info ->
                val name = info.properties.getString(MidiDeviceInfo.PROPERTY_NAME)?.takeIf(String::isNotBlank) ?: "MIDI device ${info.id}"
                info.ports.filter { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }.map { port ->
                    val portName = port.name.takeIf(String::isNotBlank) ?: "Output ${port.portNumber + 1}"
                    AndroidMidiPort("${info.id}:${port.portNumber}", info.id, port.portNumber, "$name · $portName")
                }
            }
        } catch (_: SecurityException) {
            onStatus("Allow $bluetoothPermissionName permission to find Bluetooth MIDI kits.")
            emptyList()
        }
    }

    fun scanBluetoothMidi(onDevice: (AndroidBluetoothMidiDevice) -> Unit) {
        stopBluetoothScan()
        val scanner = try { bluetoothManager?.adapter?.bluetoothLeScanner } catch (_: SecurityException) {
            onStatus("Allow $bluetoothPermissionName permission before scanning for Bluetooth MIDI kits.")
            return
        }
        if (scanner == null) { onStatus("Bluetooth is unavailable or turned off on this device."); return }
        val midiUuid = ParcelUuid(UUID.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700"))
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                if (scanCallback !== this) return
                val native = result.device
                val name = runCatching { native.name }.getOrNull()
                    ?: result.scanRecord?.deviceName
                    ?: "Bluetooth MIDI device"
                val address = runCatching { native.address }.getOrNull() ?: "${native.hashCode()}"
                val item = AndroidBluetoothMidiDevice(address.hashCode().toUInt().toString(16), name, native)
                mainHandler.post { if (scanCallback === this) onDevice(item) }
            }

            override fun onScanFailed(errorCode: Int) {
                mainHandler.post {
                    if (scanCallback === this) {
                        stopBluetoothScan()
                        onStatus("Bluetooth MIDI scan failed (code $errorCode). Check Bluetooth and try again.")
                    }
                }
            }
        }
        try {
            bleScanner = scanner
            scanCallback = callback
            scanner.startScan(
                listOf(ScanFilter.Builder().setServiceUuid(midiUuid).build()),
                ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
                callback,
            )
            onStatus("Scanning for Bluetooth MIDI kits for up to 12 seconds…")
            scanTimeout = Runnable {
                stopBluetoothScan()
                onStatus("Bluetooth MIDI scan finished. Select a discovered kit or scan again.")
            }.also { mainHandler.postDelayed(it, 12_000L) }
        } catch (error: SecurityException) {
            stopBluetoothScan()
            onStatus("Bluetooth scan permission was not granted. Allow $bluetoothPermissionName access and try again.")
        } catch (error: IllegalStateException) {
            stopBluetoothScan()
            onStatus("Bluetooth scanning is currently unavailable. Check Bluetooth and try again.")
        }
    }

    fun connect(port: AndroidMidiPort) {
        val midiManager = manager
        if (midiManager == null) { onStatus("This Android device does not provide the MIDI service."); return }
        disconnect()
        val request = connectionRequest
        onStatus("Connecting to ${port.label}…")
        val selected = availablePorts().firstOrNull { it.key == port.key }
        if (selected == null) { onStatus("That MIDI output disappeared. Refresh the device list and try again."); return }
        val info = try {
            midiManager.devices.firstOrNull { it.id == selected.deviceId }
                ?: if (Build.VERSION.SDK_INT >= 33) midiManager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).firstOrNull { it.id == selected.deviceId } else null
        } catch (_: SecurityException) {
            onStatus("Allow $bluetoothPermissionName permission before connecting to this MIDI kit.")
            return
        }
        if (info == null) { onStatus("That MIDI device is no longer available."); return }
        midiManager.openDevice(info, { opened ->
            if (request != connectionRequest) { opened?.close(); return@openDevice }
            if (opened == null) { onStatus("Android could not open this MIDI device."); return@openDevice }
            attachOutput(opened, selected.portNumber, port.label, request)
        }, mainHandler)
    }

    fun connectBluetooth(selected: AndroidBluetoothMidiDevice, onConnected: (AndroidMidiPort) -> Unit) {
        val midiManager = manager
        if (midiManager == null) { onStatus("This Android device does not provide the MIDI service."); return }
        disconnect()
        val request = connectionRequest
        onStatus("Connecting to ${selected.label}…")
        try {
            midiManager.openBluetoothDevice(selected.nativeDevice, { opened ->
                if (request != connectionRequest) { opened?.close(); return@openBluetoothDevice }
                if (opened == null) { onStatus("Android could not open this Bluetooth MIDI device."); return@openBluetoothDevice }
                val info = try { opened.info } catch (_: SecurityException) {
                    opened.close(); onStatus("Bluetooth permission changed before the MIDI kit opened."); return@openBluetoothDevice
                }
                val output = info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }
                if (output == null) { opened.close(); onStatus("This Bluetooth MIDI device has no drum output port."); return@openBluetoothDevice }
                val label = info.properties.getString(MidiDeviceInfo.PROPERTY_NAME)?.takeIf(String::isNotBlank) ?: selected.label
                val port = AndroidMidiPort("${info.id}:${output.portNumber}", info.id, output.portNumber, label)
                if (attachOutput(opened, output.portNumber, label, request)) onConnected(port)
            }, mainHandler)
        } catch (_: SecurityException) {
            onStatus("Allow $bluetoothPermissionName permission to connect to this Bluetooth MIDI kit.")
        }
    }

    private fun attachOutput(opened: MidiDevice, portNumber: Int, label: String, request: Int): Boolean {
        if (request != connectionRequest) { opened.close(); return false }
        val output = try { opened.openOutputPort(portNumber) } catch (_: SecurityException) { null }
        if (output == null) { opened.close(); onStatus("This MIDI port could not be opened."); return false }
        val listener = object : MidiReceiver() {
            override fun onSend(message: ByteArray, offset: Int, count: Int, timestamp: Long) {
                if (count < 3 || offset < 0 || offset + 2 >= message.size) return
                val status = message[offset].toInt() and 0xF0
                val note = message[offset + 1].toInt() and 0x7F
                val velocity = message[offset + 2].toInt() and 0x7F
                if (status != 0x90 || velocity == 0) return
                val voice = voiceForGeneralMidiNote(note) ?: return
                val event = AndroidMidiHit(voice, velocity, (if (timestamp > 0) timestamp else System.nanoTime()) / 1_000_000.0)
                mainHandler.post { if (request == connectionRequest) onHit(event) }
            }
        }
        return try {
            output.connect(listener)
            device = opened; outputPort = output; receiver = listener
            onStatus("Connected to $label. General MIDI percussion notes map to the five core voices.")
            true
        } catch (error: IOException) {
            output.close(); opened.close()
            onStatus("Could not receive MIDI input: ${error.localizedMessage ?: "connection failed"}")
            false
        }
    }

    private fun stopBluetoothScan() {
        scanTimeout?.let(mainHandler::removeCallbacks)
        scanTimeout = null
        val scanner = bleScanner
        val callback = scanCallback
        if (scanner != null && callback != null) runCatching { scanner.stopScan(callback) }
        bleScanner = null; scanCallback = null
    }

    fun disconnect() {
        connectionRequest += 1
        stopBluetoothScan()
        val port = outputPort
        val currentReceiver = receiver
        if (port != null && currentReceiver != null) runCatching { port.disconnect(currentReceiver) }
        runCatching { port?.close() }
        runCatching { device?.close() }
        outputPort = null; receiver = null; device = null
        onStatus("MIDI disconnected.")
    }

    fun clearListeners() {
        onHit = {}
        onStatus = {}
    }

    override fun close() = disconnect()

    private fun voiceForGeneralMidiNote(note: Int): String? = when (note) {
        35, 36 -> "kick"
        37, 38, 39, 40 -> "snare"
        41, 43, 45, 47, 48, 50 -> "tom"
        42, 44, 46 -> "hihat"
        49, 51, 52, 53, 55, 57, 59 -> "crash"
        else -> null
    }
}
