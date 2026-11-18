package ftx.speech

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteOrder
import java.lang.reflect.Proxy
import java.util.concurrent.Executor

object LocalAsrBridge {
    private val main = Handler(Looper.getMainLooper())
    // The HBuilderX local compiler can ship API 31 stubs. Resolve Android 13
    // file-input/segmented APIs only after the runtime version check.
    private const val AUDIO_SOURCE = "android.speech.extra.AUDIO_SOURCE"
    private class Job(val id: String, val callback: (String) -> Unit) {
        @Volatile var cancelled = false
        @Volatile var fed = false
        var recognizer: SpeechRecognizer? = null
        var pipes: Array<ParcelFileDescriptor>? = null
        var timeout: Runnable? = null
        val text = mutableListOf<String>()
    }
    private var active: Job? = null
    private fun finish(job: Job, result: JSONObject) {
        if (active !== job) return
        active = null; job.cancelled = true
        job.timeout?.let { main.removeCallbacks(it) }
        job.pipes?.forEach { try { it.close() } catch (_: Exception) {} }
        try { job.recognizer?.cancel(); job.recognizer?.destroy() } catch (_: Exception) {}
        job.callback(result.toString())
    }
    private fun fail(job: Job, error: String) = finish(job, JSONObject().put("error", error))
    @JvmStatic fun cancel(id: String) { main.post { active?.takeIf { it.id == id }?.let { fail(it, "CANCELLED") } } }
    @JvmStatic fun request(context: Context, options: String, callback: (String) -> Unit) {
        main.post {
            try {
                // File injection and segmented completion require Android 13+.
                // Never use createSpeechRecognizer or the advisory PREFER_OFFLINE flag.
                val input = JSONObject(options)
                if (Build.VERSION.SDK_INT < 33 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context) ||
                    context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    callback("{\"available\":false}"); return@post
                }
                if (input.optString("action") == "available") { callback("{\"available\":true}"); return@post }
                if (active != null) { callback("{\"error\":\"BUSY\"}"); return@post }
                val list = input.optJSONArray("paths") ?: throw IllegalArgumentException()
                val paths = (0 until list.length()).map { list.getString(it) }
                if (paths.isEmpty() || paths.size > 12 || paths.any { !it.startsWith("/") || !File(it).isFile }) {
                    callback("{\"error\":\"AUDIO_UNSUPPORTED\"}"); return@post
                }
                val job = Job(input.getString("id"), callback); active = job
                job.timeout = Runnable { fail(job, "TIMEOUT") }.also { main.postDelayed(it, 20000) }
                val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                job.recognizer = recognizer
                val pipes = ParcelFileDescriptor.createPipe(); job.pipes = pipes
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                    .putExtra(AUDIO_SOURCE, pipes[0])
                    .putExtra("android.speech.extra.AUDIO_SOURCE_CHANNEL_COUNT", 1)
                    .putExtra("android.speech.extra.AUDIO_SOURCE_ENCODING", AudioFormat.ENCODING_PCM_16BIT)
                    .putExtra("android.speech.extra.AUDIO_SOURCE_SAMPLING_RATE", 16000)
                    .putExtra("android.speech.extra.SEGMENTED_SESSION", AUDIO_SOURCE)
                val listener = Proxy.newProxyInstance(RecognitionListener::class.java.classLoader,
                    arrayOf(RecognitionListener::class.java)) { _, method, args ->
                    when (method.name) {
                        "onError" -> fail(job, "RECOGNITION_FAILED")
                        // Ignore ordinary microphone results from engines that do
                        // not honor the external-audio segmented request.
                        "onResults" -> fail(job, "FILE_MODE_UNSUPPORTED")
                        "onSegmentResults" -> if (active === job) {
                            (args?.firstOrNull() as? Bundle)?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?.firstOrNull()?.let { job.text.add(it) }
                        }
                        "onEndOfSegmentedSession" -> if (job.fed) {
                            finish(job, JSONObject().put("text", job.text.joinToString("")))
                        } else { fail(job, "FILE_MODE_UNSUPPORTED") }
                        "toString" -> return@newProxyInstance "FtxLocalAsrListener"
                        "hashCode" -> return@newProxyInstance System.identityHashCode(job)
                        "equals" -> return@newProxyInstance false
                    }
                    null
                } as RecognitionListener
                recognizer.setRecognitionListener(listener)
                // Unsupported query/Chinese language models fall back immediately,
                // without downloading a model or selecting a network recognizer.
                val supportClass = Class.forName("android.speech.RecognitionSupportCallback")
                val supportCallback = Proxy.newProxyInstance(supportClass.classLoader, arrayOf(supportClass)) { _, method, args ->
                    if (method.name == "onError") fail(job, "UNAVAILABLE")
                    if (method.name == "onSupportResult") {
                        if (active !== job) return@newProxyInstance null
                        val support = args?.firstOrNull() ?: throw IllegalArgumentException()
                        val languages = support.javaClass.getMethod("getInstalledOnDeviceLanguages").invoke(support) as? List<*>
                        if (languages?.none { (it as? String)?.replace('_', '-')?.startsWith("zh", true) == true } != false) {
                            fail(job, "LANGUAGE_UNAVAILABLE"); return@newProxyInstance null
                        }
                        Thread {
                            try {
                                val audio = decode(paths, job)
                                main.post {
                                    if (active !== job) return@post
                                    try {
                                        recognizer.startListening(intent)
                                        Thread {
                                            try {
                                                ParcelFileDescriptor.AutoCloseOutputStream(pipes[1]).use { output ->
                                                    var offset = 0
                                                    while (offset < audio.size && !job.cancelled) {
                                                        val count = minOf(3200, audio.size - offset)
                                                        output.write(audio, offset, count); offset += count
                                                    }
                                                    job.fed = !job.cancelled
                                                }
                                            } catch (_: Exception) { main.post { fail(job, "AUDIO_UNSUPPORTED") } }
                                        }.start()
                                    } catch (_: Exception) { fail(job, "UNAVAILABLE") }
                                }
                            } catch (_: Exception) { main.post { fail(job, "AUDIO_UNSUPPORTED") } }
                        }.start()
                    }
                    when (method.name) {
                        "toString" -> "FtxLocalAsrSupport"
                        "hashCode" -> System.identityHashCode(job)
                        "equals" -> false
                        else -> null
                    }
                }
                SpeechRecognizer::class.java.getMethod("checkRecognitionSupport", Intent::class.java, Executor::class.java, supportClass)
                    .invoke(recognizer, intent, Executor { main.post(it) }, supportCallback)
            } catch (_: Exception) {
                val job = active
                if (job != null) fail(job, "UNAVAILABLE") else callback("{\"available\":false}")
            }
        }
    }
    // Decode each independent container, then concatenate PCM (never MP3 headers).
    private fun decode(paths: List<String>, job: Job): ByteArray {
        val output = ByteArrayOutputStream()
        for (path in paths) {
            if (job.cancelled) throw IllegalStateException()
            val extractor = MediaExtractor()
            var codec: MediaCodec? = null
            try {
                if (File(path).length() > 50L * 1024 * 1024) throw IllegalArgumentException()
                extractor.setDataSource(path)
                val track = (0 until extractor.trackCount).first { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
                extractor.selectTrack(track)
                val format = extractor.getTrackFormat(track)
                codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
                codec.configure(format, null, null, 0); codec.start()
                var inputDone = false; var outputDone = false; var pcmFormat = format
                val samples = ArrayList<Float>()
                val info = MediaCodec.BufferInfo()
                val deadline = System.nanoTime() + 10_000_000_000L
                while (!outputDone && !job.cancelled) {
                    if (System.nanoTime() > deadline) throw IllegalStateException()
                    if (!inputDone) {
                        val index = codec.dequeueInputBuffer(10000)
                        if (index >= 0) {
                            val buffer = codec.getInputBuffer(index)!!
                            val size = extractor.readSampleData(buffer, 0)
                            if (size < 0) { codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true }
                            else { codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0); extractor.advance() }
                        }
                    }
                    val index = codec.dequeueOutputBuffer(info, 10000)
                    if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) pcmFormat = codec.outputFormat
                    else if (index >= 0) {
                        val buffer = codec.getOutputBuffer(index)!!.duplicate().order(ByteOrder.LITTLE_ENDIAN)
                        buffer.position(info.offset); buffer.limit(info.offset + info.size)
                        val channels = pcmFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        val encoding = if (pcmFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) pcmFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
                        val bytes = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) 4 else if (encoding == AudioFormat.ENCODING_PCM_16BIT) 2 else throw IllegalArgumentException()
                        while (buffer.remaining() >= bytes * channels) {
                            var mono = 0f
                            repeat(channels) { mono += if (bytes == 4) buffer.float else buffer.short / 32768f }
                            samples.add(mono / channels)
                            if (samples.size > pcmFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) * 61) throw IllegalArgumentException()
                        }
                        codec.releaseOutputBuffer(index, false)
                        outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    }
                }
                val rate = pcmFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                val count = (samples.size.toLong() * 16000 / rate).toInt()
                if (count <= 0 || output.size() + count * 2 > 16000 * 2 * 61) throw IllegalArgumentException()
                for (i in 0 until count) {
                    val position = i.toDouble() * rate / 16000
                    val low = position.toInt().coerceAtMost(samples.lastIndex)
                    val high = (low + 1).coerceAtMost(samples.lastIndex)
                    val value = (samples[low] + (samples[high] - samples[low]) * (position - low)).coerceIn(-1.0, 1.0)
                    val pcm = (value * 32767).toInt()
                    output.write(pcm and 255); output.write((pcm shr 8) and 255)
                }
            } finally {
                try { codec?.stop(); codec?.release() } catch (_: Exception) {}
                extractor.release()
            }
        }
        return output.toByteArray()
    }
}
