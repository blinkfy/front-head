package ftx.voice

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaPlayer
import android.media.AudioAttributes
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.StatFs
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Private, owner-scoped management for recordings created by this app. */
object CallRecordingFiles {
    internal data class Config(val owner: String, val admin: Boolean, val auto: Boolean)
    @Volatile private var config = Config("", false, false)
    private const val ROOT = "ftx-call-recordings"
    private val idPattern = Regex("^[a-f0-9]{32}$")
    private val ownerPattern = Regex("^[0-9]{1,32}$")
    private val io by lazy { Handler(HandlerThread("ftx-recording-files").apply { start() }.looper) }
    private val main = Handler(Looper.getMainLooper())
    private data class Playback(val owner: String, val id: String, val session: String, val player: MediaPlayer,
                                var ended: Boolean = false, var failed: Boolean = false)
    private var playback: Playback? = null

    @JvmStatic fun configure(optionsJSON: String) {
        val input = try { JSONObject(optionsJSON) } catch (_: Throwable) { JSONObject() }
        val owner = input.optString("owner").takeIf { ownerPattern.matches(it) } ?: ""
        val previous = config
        val next = Config(owner, input.optBoolean("admin"), input.optBoolean("auto"))
        config = next
        if (previous.admin && (!next.admin || previous.owner != next.owner)) {
            io.post { if (playback?.owner == previous.owner) releasePlayback() }
        }
    }

    @JvmStatic fun forSession(ctx: Context, peerName: String, mode: String, expectedOwner: String, callId: String,
                              onState: (JSONObject) -> Unit): CallAudioRecording {
        val current = config.takeIf { it.owner == expectedOwner } ?: Config("", false, false)
        return CallAudioRecording(ctx.applicationContext, peerName, mode, callId, current, onState)
    }

    private fun ownerDir(ctx: Context, owner: String): File = File(File(ctx.noBackupFilesDir, ROOT), owner)
    private fun readMeta(file: File): JSONObject? = try { JSONObject(file.readText(Charsets.UTF_8)) } catch (_: Throwable) { null }
    private fun writeMeta(file: File, value: JSONObject) {
        val temp = File(file.parentFile, file.name + ".tmp")
        FileOutputStream(temp).use { it.write(value.toString().toByteArray(Charsets.UTF_8)); it.fd.sync() }
        if (!temp.renameTo(file)) { temp.delete(); throw IllegalStateException("录音目录保存失败") }
    }

    private fun releasePlayback() {
        val current = playback ?: return
        playback = null
        current.player.release()
    }

    private fun playbackState(current: Playback, result: JSONObject) {
        if (current.failed) {
            releasePlayback()
            throw IllegalStateException("系统无法解码这段录音")
        }
        val player = current.player
        val duration = player.duration.coerceAtLeast(0)
        result.put("durationMs", duration).put("positionMs", if (current.ended) duration else player.currentPosition.coerceIn(0, duration))
            .put("playing", !current.ended && player.isPlaying).put("ended", current.ended)
    }

    private fun startPlayback(owner: String, id: String, request: JSONObject, audio: File, result: JSONObject) {
        val session = request.optString("session").takeIf { Regex("^[A-Za-z0-9_-]{12,80}$").matches(it) }
            ?: throw IllegalArgumentException("播放器编号无效")
        releasePlayback()
        val player = MediaPlayer()
        val current = Playback(owner, id, session, player)
        try {
            player.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            // The media service can read an opened descriptor for app-private files.
            FileInputStream(audio).use { player.setDataSource(it.fd) }
            player.prepare()
            if (!permits(owner)) throw IllegalStateException("登录账号已变更")
            player.setOnCompletionListener { current.ended = true }
            player.setOnErrorListener { _, _, _ -> current.failed = true; true }
            player.start()
            playbackState(current, result)
            playback = current
        } catch (error: Exception) {
            if (playback === current) playback = null
            player.release()
            throw IllegalStateException("录音无法播放，请检查文件是否完整", error)
        }
    }

    private fun controlPlayback(owner: String, id: String, request: JSONObject, action: String, result: JSONObject) {
        val current = playback?.takeIf { it.owner == owner && it.id == id && it.session == request.optString("session") }
        if (action == "playback-stop") {
            if (current != null) releasePlayback()
            return
        }
        if (current == null) throw IllegalStateException("播放器已关闭")
        if (current.failed) { playbackState(current, result); return }
        var seekPosition: Int? = null
        when (action) {
            "playback-status" -> Unit
            "playback-pause" -> if (current.player.isPlaying) current.player.pause()
            "playback-resume" -> { current.ended = false; current.player.start() }
            "playback-seek" -> {
                val position = request.optInt("positionMs").coerceIn(0, current.player.duration.coerceAtLeast(0))
                if (Build.VERSION.SDK_INT >= 26) current.player.seekTo(position.toLong(), MediaPlayer.SEEK_CLOSEST)
                else current.player.seekTo(position)
                current.ended = false
                seekPosition = position
            }
            else -> throw IllegalArgumentException("操作无效")
        }
        playbackState(current, result)
        seekPosition?.let { result.put("positionMs", it) }
    }

    private fun operation(ctx: Context, requestJSON: String): String {
        val cfg = config
        val result = JSONObject()
        try {
            if (!cfg.admin || !ownerPattern.matches(cfg.owner)) throw IllegalStateException("无录音管理权限")
            val request = JSONObject(requestJSON)
            if (request.optString("owner") != cfg.owner) throw IllegalStateException("登录账号已变更")
            val dir = ownerDir(ctx.applicationContext, cfg.owner)
            val action = request.optString("action")
            if (action == "list") {
                val rows = JSONArray()
                val files = if (dir.isDirectory) dir.listFiles().orEmpty() else emptyArray()
                val staleBefore = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(2)
                files.filter { it.lastModified() < staleBefore && (it.name.endsWith(".partial.m4a") ||
                    it.name.endsWith(".json.tmp") || (it.extension == "m4a" && idPattern.matches(it.nameWithoutExtension) &&
                        !File(dir, "${it.nameWithoutExtension}.json").isFile)) }.forEach { it.delete() }
                files.filter { it.extension == "json" && idPattern.matches(it.nameWithoutExtension) }.forEach { metaFile ->
                    val meta = readMeta(metaFile) ?: return@forEach
                    val id = meta.optString("id")
                    val audio = File(dir, "$id.m4a")
                    if (idPattern.matches(id) && meta.optString("owner") == cfg.owner && audio.isFile) {
                        meta.put("size", audio.length()).put("status", "saved")
                        rows.put(meta)
                    }
                }
                result.put("rows", rows)
            } else {
                val id = request.optString("id")
                if (!idPattern.matches(id)) throw IllegalArgumentException("录音编号无效")
                if (action.startsWith("playback-") && action != "playback-start") {
                    controlPlayback(cfg.owner, id, request, action, result)
                    return result.toString()
                }
                val metaFile = File(dir, "$id.json")
                val audio = File(dir, "$id.m4a")
                val meta = readMeta(metaFile) ?: throw IllegalArgumentException("录音不存在")
                if (meta.optString("owner") != cfg.owner || !audio.isFile) throw IllegalArgumentException("录音不存在")
                when (action) {
                    "delete" -> {
                        if (playback?.let { it.owner == cfg.owner && it.id == id } == true) releasePlayback()
                        if (!audio.delete()) throw IllegalStateException("无法删除录音")
                        metaFile.delete()
                        result.put("ok", true)
                    }
                    "playback-start" -> startPlayback(cfg.owner, id, request, audio, result)
                    "file" -> result.put("path", audio.absolutePath).put("mimeType", "audio/mp4").put("name", meta.optString("name", "通话录音.m4a"))
                    "rename" -> {
                        val name = request.optString("name").trim().take(80)
                        if (name.isEmpty() || name.any { it == '/' || it == '\\' || it.code < 32 }) throw IllegalArgumentException("名称无效")
                        meta.put("name", name); writeMeta(metaFile, meta); result.put("ok", true)
                    }
                    "export" -> export(ctx.applicationContext, audio, meta.optString("name", "通话录音.m4a"), result)
                    else -> throw IllegalArgumentException("操作无效")
                }
            }
        } catch (e: Throwable) { result.put("ok", false).put("error", e.message ?: "录音操作失败") }
        return result.toString()
    }

    @JvmStatic fun perform(ctx: Context, requestJSON: String, callback: (String) -> Unit) {
        io.post {
            val value = operation(ctx.applicationContext, requestJSON)
            main.post { try { callback(value) } catch (_: Exception) {} }
        }
    }

    private fun export(ctx: Context, source: File, rawName: String, result: JSONObject) {
        val baseName = rawName.removeSuffix(".m4a").replace(Regex("[^\\p{L}\\p{N} ._()-]"), "_").trim('.', ' ').take(75)
        val name = "${baseName.ifEmpty { "通话录音" }}.m4a"
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, "audio/mp4")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/分投侠/通话录音")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("无法创建下载文件")
            try {
                ctx.contentResolver.openOutputStream(uri, "w")?.use { output -> source.inputStream().use { it.copyTo(output, 64 * 1024) } }
                    ?: throw IllegalStateException("无法写入下载文件")
                val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
                ctx.contentResolver.update(uri, done, null, null)
                result.put("ok", true).put("exported", true).put("path", "下载/分投侠/通话录音/$name")
            } catch (e: Throwable) {
                try { ctx.contentResolver.delete(uri, null, null) } catch (_: Throwable) {}
                throw e
            }
        } else {
            if (ctx.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
                throw IllegalStateException("需要存储权限才能导出")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "分投侠/通话录音")
            if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("无法创建下载目录")
            val dest = File(dir, name).let { if (it.exists()) File(dir, "${it.nameWithoutExtension}_${System.currentTimeMillis()}.m4a") else it }
            if (!dest.createNewFile()) throw IllegalStateException("无法创建下载文件")
            try {
                source.inputStream().use { input -> FileOutputStream(dest).use { output -> input.copyTo(output, 64 * 1024); output.fd.sync() } }
            } catch (error: Exception) { dest.delete(); throw error }
            result.put("ok", true).put("exported", true).put("path", "下载/分投侠/通话录音/${dest.name}")
        }
    }

    internal fun permits(owner: String) = config.let { it.admin && owner.isNotEmpty() && it.owner == owner }
    internal fun directory(ctx: Context, owner: String) = ownerDir(ctx, owner)
    internal fun saveMetadata(file: File, value: JSONObject) = writeMeta(file, value)
}

/** Non-blocking PCM taps feed a bounded queue; only the private worker touches the AAC encoder. */
class CallAudioRecording internal constructor(
    private val context: Context,
    private val peerName: String,
    private val mode: String,
    private val callId: String,
    private val config: CallRecordingFiles.Config,
    private val onState: (JSONObject) -> Unit
) {
    private data class Pcm(val playback: Boolean, val bytes: ByteArray, val format: Int, val channels: Int, val rate: Int, val nanoTime: Long)
    private val queue = ArrayBlockingQueue<Pcm>(128)
    private val running = AtomicBoolean(false)
    private val muted = AtomicBoolean(false)
    private val lock = Any()
    private var worker: Thread? = null
    @Volatile private var closed = false
    @Volatile private var startedAt = 0L
    @Volatile private var stoppedAtNano = 0L
    @Volatile private var error = ""
    @Volatile private var saved = false
    private val owner = config.owner
    val allowed = config.admin && owner.isNotEmpty()
    val automatic = allowed && config.auto

    fun snapshot(): JSONObject = JSONObject().put("recordingSupported", allowed && CallRecordingFiles.permits(owner))
        .put("recording", running.get()).put("recordingStartedAt", if (running.get()) startedAt else 0L)
        .put("recordingError", error).put("saved", saved)

    private fun notifyState(extra: JSONObject = JSONObject()) {
        try { val value = snapshot(); val it = extra.keys(); while (it.hasNext()) { val key = it.next(); value.put(key, extra.get(key)) }; onState(value) } catch (_: Throwable) {}
    }

    fun capture(samples: JavaAudioDeviceModule.AudioSamples) = enqueue(false, samples)
    fun playback(samples: JavaAudioDeviceModule.AudioSamples) = enqueue(true, samples)
    fun capture(buffer: ByteBuffer, format: Int, channels: Int, rate: Int, bytes: Int) =
        enqueue(false, format, channels, rate) {
            val copy = buffer.duplicate()
            copy.position(0)
            ByteArray(bytes.coerceIn(0, copy.limit())).also { copy.get(it) }
        }
    private fun enqueue(playback: Boolean, samples: JavaAudioDeviceModule.AudioSamples) =
        enqueue(playback, samples.audioFormat, samples.channelCount, samples.sampleRate) { samples.data }

    private inline fun enqueue(playback: Boolean, format: Int, channels: Int, rate: Int, read: () -> ByteArray) {
        if (!running.get() || (!playback && muted.get())) return
        if (!CallRecordingFiles.permits(owner)) { stop(); return }
        try {
            if (rate <= 0 || channels <= 0) return
            val data = read()
            if (data.isEmpty()) return
            if (!queue.offer(Pcm(playback, data, format, channels, rate, System.nanoTime()))) {
                stopWithError("录音数据过多，已停止")
            }
        } catch (_: Exception) { stopWithError("录音采集失败") }
    }

    fun setMuted(value: Boolean) { muted.set(value) }

    fun start() {
        synchronized(lock) {
            if (!allowed || closed || !CallRecordingFiles.permits(owner) || worker != null) return
            error = ""
            saved = false
            queue.clear()
            val id = UUID.randomUUID().toString().replace("-", "")
            val start = System.currentTimeMillis()
            startedAt = start
            stoppedAtNano = 0
            running.set(true)
            try {
                worker = Thread({ encodeLoop(id, start) }, "ftx-call-recorder").apply { isDaemon = true }
                worker?.start()
            } catch (_: Exception) {
                worker = null
                running.set(false)
                error = "无法启动录音，通话仍可继续"
            }
        }
        notifyState()
    }

    fun stop() = stopWithError("")
    fun close() { closed = true; stop() }
    private fun stopWithError(reason: String) {
        synchronized(lock) {
            if (!running.get()) return
            if (reason.isNotEmpty()) error = reason
            stoppedAtNano = System.nanoTime()
            running.set(false)
        }
        notifyState()
    }

    private fun encodeLoop(id: String, startMillis: Long) {
        val dir = CallRecordingFiles.directory(context, owner)
        var muxer: MediaMuxer? = null
        var codec: MediaCodec? = null
        var muxerStarted = false
        var trackIndex = -1
        var outputFile: File? = null
        var partial: File? = null
        var metaTemp: File? = null
        var containerFinalized = false
        var encodedDuration = 0L
        fun persistRecording() {
            val target = outputFile ?: throw IllegalStateException("录音文件不存在")
            val source = partial ?: throw IllegalStateException("录音文件不存在")
            if (!target.isFile && !source.renameTo(target)) throw IllegalStateException("录音文件保存失败")
            CallRecordingFiles.saveMetadata(File(dir, "$id.json"), JSONObject().put("id", id).put("owner", owner)
                .put("peerName", peerName.take(80)).put("mode", mode.take(16)).put("createdAt", startMillis).put("callId", callId)
                .put("durationMs", encodedDuration).put("size", target.length()).put("mimeType", "audio/mp4")
                .put("name", "${peerName.take(60)}的通话录音").put("status", "saved"))
            saved = true
        }
        try {
            if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("无法创建录音目录")
            val stats = StatFs(dir.absolutePath)
            if (stats.availableBytes < 8L * 1024 * 1024) throw IllegalStateException("存储空间不足")
            partial = File(dir, "$id.partial.m4a"); outputFile = File(dir, "$id.m4a"); metaTemp = File(dir, "$id.json.tmp")
            val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, OUT_RATE, 1)
            format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            format.setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE); format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 8192)
            val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
            codec = encoder
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            encoder.start()
            val writer = MediaMuxer(partial.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            muxer = writer
            val ringSize = OUT_RATE * 8
            val ringMic = FloatArray(ringSize); val ringPlay = FloatArray(ringSize)
            val stampMic = LongArray(ringSize) { Long.MIN_VALUE }; val stampPlay = LongArray(ringSize) { Long.MIN_VALUE }
            val info = MediaCodec.BufferInfo()
            var baseNano = Long.MIN_VALUE
            var cursor = 0L
            var lastSpaceCheck = System.nanoTime()
            var receivedEos = false
            var written = false
            fun drain(timeout: Long) {
                var index = encoder.dequeueOutputBuffer(info, timeout)
                while (index != MediaCodec.INFO_TRY_AGAIN_LATER) {
                    if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        trackIndex = writer.addTrack(encoder.outputFormat)
                        writer.start()
                        muxerStarted = true
                    } else if (index >= 0) {
                        val out = encoder.getOutputBuffer(index)
                        if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && out != null) {
                            if (!muxerStarted) throw IllegalStateException("音频编码器初始化失败")
                            out.position(info.offset)
                            out.limit(info.offset + info.size)
                            writer.writeSampleData(trackIndex, out, info)
                            written = true
                            encodedDuration = max(encodedDuration, info.presentationTimeUs / 1000L + FRAME_SAMPLES * 1000L / OUT_RATE)
                            if (partial.length() >= MAX_BYTES) throw IllegalStateException("录音超过文件大小上限")
                        }
                        receivedEos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        encoder.releaseOutputBuffer(index, false)
                        if (receivedEos) return
                    }
                    index = encoder.dequeueOutputBuffer(info, 0)
                }
            }
            var flushDeadline = Long.MAX_VALUE
            while (true) {
                val packet = queue.poll(10, TimeUnit.MILLISECONDS)
                if (packet != null) {
                    if (baseNano == Long.MIN_VALUE) baseNano = packet.nanoTime - 10_000_000L
                    mixPacket(packet, baseNano, if (packet.playback) ringPlay else ringMic, if (packet.playback) stampPlay else stampMic, ringSize)
                }
                val stopping = !running.get()
                // Drain already queued PCM before writing the final blocks.
                if (stopping && queue.isNotEmpty()) continue
                val now = System.nanoTime()
                if (stopping && flushDeadline == Long.MAX_VALUE) flushDeadline = now + 1_000_000_000L
                val cutoff = if (stopping) stoppedAtNano else now - 80_000_000L
                val target = if (baseNano == Long.MIN_VALUE) 0L else
                    ((cutoff - baseNano) * OUT_RATE / 1_000_000_000L).coerceIn(0L, MAX_SAMPLES)
                while (cursor + FRAME_SAMPLES <= target) {
                    val inputIndex = encoder.dequeueInputBuffer(0)
                    if (inputIndex < 0) break
                    val input = encoder.getInputBuffer(inputIndex) ?: throw IllegalStateException("录音编码器不可用")
                    input.clear()
                    val cursorAt = cursor
                    repeat(FRAME_SAMPLES) { offset ->
                        val frame = cursorAt + offset; val slot = (frame % ringSize).toInt()
                        val m = if (stampMic[slot] == frame) ringMic[slot] else 0f
                        val p = if (stampPlay[slot] == frame) ringPlay[slot] else 0f
                        val sample = ((m + p) * 0.5f).coerceIn(-1f, 1f)
                        val v = (sample * 32767f).roundToInt().coerceIn(-32768, 32767)
                        input.put(v.toByte()); input.put((v shr 8).toByte())
                    }
                    encoder.queueInputBuffer(inputIndex, 0, FRAME_SAMPLES * 2, cursor * 1_000_000L / OUT_RATE, 0)
                    cursor += FRAME_SAMPLES
                }
                drain(0)
                if (stopping && (cursor + FRAME_SAMPLES > target || now >= flushDeadline)) break
                if (now - lastSpaceCheck > 1_000_000_000L) {
                    if (StatFs(dir.absolutePath).availableBytes < 2L * 1024 * 1024) throw IllegalStateException("存储空间不足，已停止")
                    lastSpaceCheck = now
                }
                if (cursor >= MAX_SAMPLES) stopWithError("录音达到一小时上限，已停止")
            }
            if (cursor == 0L) return
            val eosDeadline = System.nanoTime() + 1_000_000_000L
            var eosQueued = false
            while (!receivedEos && System.nanoTime() < eosDeadline) {
                if (!eosQueued) {
                    val eos = encoder.dequeueInputBuffer(10_000)
                    if (eos >= 0) {
                        encoder.queueInputBuffer(eos, 0, 0, cursor * 1_000_000L / OUT_RATE, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        eosQueued = true
                    }
                }
                drain(10_000)
            }
            if (!receivedEos || !written) throw IllegalStateException("录音未能完整保存")
            writer.stop()
            containerFinalized = true
            muxerStarted = false
            writer.release()
            muxer = null
            encoder.stop()
            encoder.release()
            codec = null
            persistRecording()
        } catch (e: Throwable) {
            error = e.message ?: "录音保存失败"
        } finally {
            try { codec?.stop() } catch (_: Throwable) {}; try { codec?.release() } catch (_: Throwable) {}
            try { if (muxerStarted) { muxer?.stop(); containerFinalized = true } } catch (_: Throwable) {}
            try { muxer?.release() } catch (_: Throwable) {}
            if (!saved && containerFinalized && encodedDuration > 0L) {
                try { persistRecording(); error = "录制中断，已保存已有声音" } catch (_: Throwable) {}
            }
            if (!saved) { partial?.delete(); metaTemp?.delete(); outputFile?.delete() }
            synchronized(lock) {
                running.set(false)
                worker = null
                notifyState()
            }
        }
    }

    private fun mixPacket(packet: Pcm, baseNano: Long, ring: FloatArray, stamps: LongArray, ringSize: Int) {
        if (packet.format != 2 || packet.channels !in 1..2) return // Android ENCODING_PCM_16BIT
        val samples = packet.bytes.size / (2 * packet.channels)
        if (samples <= 0) return
        val outputCount = (samples.toDouble() * OUT_RATE / packet.rate).roundToInt().coerceAtLeast(1)
        val end = (packet.nanoTime - baseNano) * OUT_RATE / 1_000_000_000L
        val start = (end - outputCount).coerceAtLeast(0L)
        for (i in 0 until outputCount) {
            val source = min(samples - 1, (i.toDouble() * packet.rate / OUT_RATE).toInt())
            var mono = 0f
            for (ch in 0 until packet.channels) {
                val offset = (source * packet.channels + ch) * 2
                val value = ((packet.bytes[offset].toInt() and 0xff) or (packet.bytes[offset + 1].toInt() shl 8)).toShort()
                mono += value / 32768f
            }
            mono /= packet.channels
            val frame = start + i; val slot = (frame % ringSize).toInt()
            if (stamps[slot] != frame) { stamps[slot] = frame; ring[slot] = 0f }
            ring[slot] = (ring[slot] + mono).coerceIn(-1f, 1f)
        }
    }

    companion object {
        private const val OUT_RATE = 16000
        private const val BIT_RATE = 64000
        private const val FRAME_SAMPLES = 320
        private const val MAX_SAMPLES = 60L * 60L * OUT_RATE
        private const val MAX_BYTES = 64L * 1024L * 1024L
    }
}
