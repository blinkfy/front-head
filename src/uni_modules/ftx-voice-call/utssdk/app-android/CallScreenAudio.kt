package ftx.voice

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Process
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal class CallScreenAudio private constructor(private val recorder: AudioRecord, private val sampleRate: Int,
    private val failed: (CallScreenAudio) -> Unit) : AutoCloseable {
    private val samples = ShortArray(sampleRate / 100)
    private var active = true
    private var closed = false

    // The WebRTC audio thread owns the microphone buffer. Read playback without blocking it.
    @Synchronized
    fun mix(buffer: ByteBuffer, format: Int, channels: Int, rate: Int, bytes: Int, muted: Boolean) {
        if (format != AudioFormat.ENCODING_PCM_16BIT || channels < 1 || bytes < 1) return
        val byteCount = minOf(bytes, buffer.limit())
        if (muted) for (offset in 0 until byteCount) buffer.put(offset, 0)
        if (!active || rate != sampleRate) return
        val frames = minOf(samples.size, byteCount / (channels * Short.SIZE_BYTES))
        if (frames == 0) return
        val read = runCatching { recorder.read(samples, 0, frames, AudioRecord.READ_NON_BLOCKING) }.getOrDefault(AudioRecord.ERROR)
        if (read < 0) {
            active = false
            failed(this)
            return
        }
        if (read == 0) return
        val order = buffer.order()
        buffer.order(ByteOrder.nativeOrder())
        try {
            for (frame in 0 until read) {
                val playback = samples[frame] * 2 / 3
                for (channel in 0 until channels) {
                    val offset = (frame * channels + channel) * Short.SIZE_BYTES
                    val mixed = (buffer.getShort(offset) + playback).coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                    buffer.putShort(offset, mixed.toShort())
                }
            }
        } finally { buffer.order(order) }
    }

    override fun close() {
        synchronized(this) {
            if (closed) return
            closed = true
            active = false
        }
        runCatching { recorder.stop() }
        runCatching { recorder.release() }
    }

    companion object {
        fun start(projection: MediaProjection, rate: Int, failed: (CallScreenAudio) -> Unit): CallScreenAudio? {
            if (Build.VERSION.SDK_INT < 29 || rate <= 0) return null
            var recorder: AudioRecord? = null
            try {
                val format = AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()
                val capture = AudioPlaybackCaptureConfiguration.Builder(projection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .excludeUid(Process.myUid()).build()
                val minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                if (minimum <= 0) return null
                recorder = AudioRecord.Builder().setAudioFormat(format).setAudioPlaybackCaptureConfig(capture)
                    .setBufferSizeInBytes(maxOf(minimum, rate / 25 * Short.SIZE_BYTES)).build()
                recorder.startRecording()
                check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING)
                return CallScreenAudio(recorder, rate, failed)
            } catch (_: Exception) {
                recorder?.let { runCatching { it.release() } }
                return null
            }
        }
    }
}
