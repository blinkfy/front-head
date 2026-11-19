package ftx.voice

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt
import kotlin.math.sqrt

internal object CallRecordingAnalysis {
    // Matches the browser's 20 ms audio-energy windows. Missing PCM frames
    // are null so decoder gaps cannot be mistaken for silence.
    private const val FRAME_US = 20_000L

    fun analyze(audio: File, fromMs: Long, toMs: Long, channel: Int?, wav: File?, authorized: () -> Boolean): JSONArray {
        require(fromMs >= 0 && toMs <= 3_600_000 && toMs - fromMs in 1..30_000) { "录音分析范围无效" }
        // New native recordings are 16 kHz stereo AAC; the ASR input is
        // a mono WAV with just the requested participant on the playback clock.
        val rateOut = 16000
        val samples = if (wav != null) ShortArray(((toMs - fromMs) * rateOut / 1000).toInt()) else null
        val fromUs = fromMs * 1000
        val toUs = toMs * 1000
        val sums = DoubleArray(((toUs - fromUs + FRAME_US - 1) / FRAME_US).toInt())
        val counts = IntArray(sums.size)
        val extractor = MediaExtractor()
        var decoder: MediaCodec? = null
        var expectedSamples = 0
        try {
            extractor.setDataSource(audio.absolutePath)
            val track = (0 until extractor.trackCount).first {
                extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            }
            val format = extractor.getTrackFormat(track)
            extractor.selectTrack(track)
            extractor.seekTo(fromUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
            val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            decoder = codec
            codec.configure(format, null, null, 0)
            codec.start()
            val info = MediaCodec.BufferInfo()
            var pcm = format
            var inputDone = false
            var outputDone = false
            val deadline = System.nanoTime() + (if (channel == null) 2_000_000_000L else 12_000_000_000L)
            while (!outputDone) {
                check(authorized() && System.nanoTime() < deadline)
                if (!inputDone) {
                    val index = codec.dequeueInputBuffer(10000)
                    if (index >= 0) {
                        val pts = extractor.sampleTime
                        val buffer = codec.getInputBuffer(index)!!
                        val size = if (pts in 0 until toUs) extractor.readSampleData(buffer, 0) else -1
                        if (size < 0) {
                            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            codec.queueInputBuffer(index, 0, size, pts, 0)
                            extractor.advance()
                        }
                    }
                }
                val index = codec.dequeueOutputBuffer(info, 10000)
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) pcm = codec.outputFormat
                if (index < 0) continue
                if (info.size > 0) {
                    val buffer = codec.getOutputBuffer(index)!!.duplicate().order(ByteOrder.LITTLE_ENDIAN)
                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    val rate = pcm.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    val channels = pcm.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    val encoding = if (pcm.containsKey(MediaFormat.KEY_PCM_ENCODING)) pcm.getInteger(MediaFormat.KEY_PCM_ENCODING)
                        else AudioFormat.ENCODING_PCM_16BIT
                    val bytes = when (encoding) {
                        AudioFormat.ENCODING_PCM_FLOAT -> 4
                        AudioFormat.ENCODING_PCM_16BIT -> 2
                        else -> error("Unsupported PCM encoding")
                    }
                    require(rate > 0 && channels > 0)
                    require(channel == null || (channels == 2 && channel in 0..1 && rate == rateOut)) { "无法分离通话音轨" }
                    expectedSamples = (rate * FRAME_US / 1_000_000L).toInt()
                    var sample = 0L
                    while (buffer.remaining() >= bytes * channels) {
                        val relativeUs = info.presentationTimeUs + sample++ * 1_000_000L / rate - fromUs
                        var energy = 0.0
                        var selected = 0.0
                        repeat(channels) { ch ->
                            val value = if (bytes == 4) buffer.float.toDouble() else buffer.short / 32768.0
                            if (ch == channel) selected = value
                            if (channel == null || ch == channel) energy += value * value
                        }
                        if (relativeUs < 0 || relativeUs >= toUs - fromUs) continue
                        val frame = (relativeUs / FRAME_US).toInt()
                        if (frame >= sums.size) continue
                        sums[frame] += if (channel == null) energy / channels else energy
                        counts[frame]++
                        if (samples != null) {
                            val pos = ((relativeUs * rateOut + 500_000L) / 1_000_000L).toInt()
                            if (pos in samples.indices) samples[pos] = (selected * 32768).roundToInt().coerceIn(-32768, 32767).toShort()
                        }
                    }
                }
                outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                codec.releaseOutputBuffer(index, false)
            }
        } finally {
            runCatching { decoder?.stop() }
            decoder?.release()
            extractor.release()
        }
        if (wav != null && samples != null) {
            check(authorized() && counts.any { it > 0 }) { "无法读取通话音轨片段" }
            val size = samples.size * 2
            val data = ByteBuffer.allocate(44 + size).order(ByteOrder.LITTLE_ENDIAN)
            data.put("RIFF".toByteArray()).putInt(36 + size).put("WAVEfmt ".toByteArray()).putInt(16)
            data.putShort(1).putShort(1).putInt(rateOut).putInt(rateOut * 2).putShort(2).putShort(16)
            data.put("data".toByteArray()).putInt(size)
            data.asShortBuffer().put(samples)
            wav.writeBytes(data.array())
        }
        return JSONArray().apply {
            for (frame in sums.indices) {
                val expected = if (frame == sums.lastIndex) expectedSamples * (toUs - fromUs - frame * FRAME_US) / FRAME_US else expectedSamples.toLong()
                if (counts[frame] == 0 || counts[frame] * 4 < expected * 3) put(JSONObject.NULL)
                else put(sqrt(sums[frame] / counts[frame]))
            }
        }
    }
}
