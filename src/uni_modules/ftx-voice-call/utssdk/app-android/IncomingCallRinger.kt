package ftx.voice

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator

// Own only the pending incoming call's alert, never the media/music stream.
// Notification UIs may stop FLAG_INSISTENT after opening the full-screen page.
object IncomingCallRinger {
    private val main = Handler(Looper.getMainLooper())
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    private var callId = ""
    private var ringtone: Ringtone? = null
    private var ringtoneUri = ""
    private var vibrator: Vibrator? = null
    private var vibrating = false
    private var refresh: Runnable? = null

    fun start(ctx: Context, id: String, sound: Boolean, channelId: String, displayChannelId: String) {
        stop()
        if (!sound) return
        callId = id
        val context = ctx.applicationContext
        val task = object : Runnable {
            override fun run() {
                if (callId != id) return
                try { update(context, channelId, displayChannelId) } catch (_: Exception) { stopAudio(); stopVibration() }
                if (callId == id) main.postDelayed(this, 500)
            }
        }
        refresh = task
        task.run()
    }

    @Suppress("DEPRECATION")
    private fun update(ctx: Context, channelId: String, displayChannelId: String) {
        val notifications = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val channel = if (Build.VERSION.SDK_INT >= 26) notifications.getNotificationChannel(channelId) else null
        val displayChannel = if (Build.VERSION.SDK_INT >= 26) notifications.getNotificationChannel(displayChannelId) else null
        val allowed = notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL &&
            (Build.VERSION.SDK_INT < 24 || notifications.areNotificationsEnabled()) &&
            (Build.VERSION.SDK_INT < 26 || (channel != null && channel.importance >= NotificationManager.IMPORTANCE_DEFAULT &&
                displayChannel != null && displayChannel.importance >= NotificationManager.IMPORTANCE_DEFAULT))
        val mode = audio.ringerMode
        val uri = if (Build.VERSION.SDK_INT >= 26) channel?.sound else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val audible = allowed && mode == AudioManager.RINGER_MODE_NORMAL && audio.getStreamVolume(AudioManager.STREAM_RING) > 0 && uri != null
        if (!audible) stopAudio()
        else {
            if (ringtone == null || ringtoneUri != uri.toString()) {
                stopAudio()
                ringtone = RingtoneManager.getRingtone(ctx, uri)?.apply {
                    audioAttributes = attributes
                    if (Build.VERSION.SDK_INT >= 28) isLooping = true
                }
                ringtoneUri = uri.toString()
            }
            // Android 23–27 has no setLooping; restart after the system tone ends.
            if (ringtone?.isPlaying == false) ringtone?.play()
        }
        val shouldVibrate = allowed && mode != AudioManager.RINGER_MODE_SILENT &&
            (channel?.shouldVibrate() ?: true) &&
            (mode == AudioManager.RINGER_MODE_VIBRATE || audio.shouldVibrate(AudioManager.VIBRATE_TYPE_RINGER))
        if (!shouldVibrate) stopVibration()
        else if (!vibrating) {
            val service = ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            val pattern = channel?.vibrationPattern?.takeIf { it.size > 1 && it.any { duration -> duration > 0 } }
                ?: longArrayOf(0, 650, 1000)
            if (Build.VERSION.SDK_INT >= 26) service.vibrate(VibrationEffect.createWaveform(pattern, 0), attributes)
            else service.vibrate(pattern, 0, attributes)
            vibrator = service; vibrating = true
        }
    }

    private fun stopAudio() {
        try { ringtone?.stop() } catch (_: Exception) {}
        ringtone = null; ringtoneUri = ""
    }
    private fun stopVibration() {
        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null; vibrating = false
    }
    fun stop(id: String = callId) {
        if (id != callId) return
        callId = ""
        refresh?.let(main::removeCallbacks); refresh = null
        stopAudio(); stopVibration()
    }
}
