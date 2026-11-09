package ftx.voice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder

// Keep projection permission and its foreground lifetime separate from the call's audio service.
class ScreenShareService : Service() {
    private var active: Pair<String, Int>? = null

    companion object {
        private const val CHANNEL = "ftx_call_screen_share"
        private const val NOTIFICATION = 2712
        private const val STOP = "ftx.voice.STOP_SCREEN_SHARE"
        private var instance: ScreenShareService? = null

        fun start(context: Context, callId: String, request: Int) {
            val intent = Intent(context, ScreenShareService::class.java).putExtra("callId", callId).putExtra("request", request)
            try {
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
            } catch (_: Exception) { VoiceCallBridge.screenServiceStopped(callId, request, true) }
        }

        fun stop(callId: String, request: Int) {
            instance?.takeIf { it.active == (callId to request) }?.stopSelf()
        }
    }

    override fun onCreate() { super.onCreate(); instance = this }
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val callId = intent?.getStringExtra("callId").orEmpty()
        val request = intent?.getIntExtra("request", 0) ?: 0
        if (intent?.action == STOP) {
            if (active == (callId to request)) VoiceCallBridge.screenServiceStopped(callId, request, false)
            if (active == null) stopSelf(startId)
            return START_NOT_STICKY
        }
        if (callId.isEmpty() || request == 0) { stopSelf(startId); return START_NOT_STICKY }
        if (active == (callId to request)) return START_NOT_STICKY
        try {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "通话屏幕共享", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null); enableVibration(false) })
            val stop = Intent(this, ScreenShareService::class.java).setAction(STOP)
                .setData(Uri.parse("ftx-internal://call/screen/$callId/$request"))
                .putExtra("callId", callId).putExtra("request", request)
            val action = PendingIntent.getService(this, NOTIFICATION, stop, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
            val notification = builder.setSmallIcon(applicationInfo.icon).setContentTitle("分投侠 · 正在共享屏幕")
                .setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
                .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "停止共享", action).build()).build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            else startForeground(NOTIFICATION, notification)
            active = callId to request
            if (VoiceCallBridge.expectsScreenShare(callId, request)) VoiceCallBridge.screenServiceReady(callId, request)
            else stopSelf(startId)
        } catch (_: Exception) {
            VoiceCallBridge.screenServiceStopped(callId, request, true)
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        active?.let { (callId, request) -> VoiceCallBridge.screenServiceStopped(callId, request, false) }
        super.onDestroy()
    }
}
