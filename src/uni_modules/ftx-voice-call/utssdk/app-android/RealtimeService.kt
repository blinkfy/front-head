package ftx.voice

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class RealtimeService : Service() {
    private var wake: PowerManager.WakeLock? = null
    private var stopping = false
    companion object {
        @Volatile var running = false; private set
        private const val CHANNEL = "ftx_realtime"
        private var instance: RealtimeService? = null
        fun stop(context: Context) {
            instance?.stopping = true
            running = false
            context.stopService(Intent(context, RealtimeService::class.java))
        }
    }
    override fun onCreate() { super.onCreate(); instance = this; running = false }
    private fun stopExpected() { stopping = true; if (instance === this) running = false; stopSelf() }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.getStringExtra("action")
        if (action != null) { RealtimeBridge.notificationAction(action, intent.getStringExtra("sessionId") ?: ""); if (!running) stopExpected(); return START_NOT_STICKY }
        try {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "后台消息、通话与位置", NotificationManager.IMPORTANCE_LOW).apply {
                description = "用户开启的后台消息接收或正在进行的通话与位置共享"; setSound(null, null); enableVibration(false)
            })
            val call = RealtimeBridge.callId
            val location = RealtimeBridge.activeLocationId()
            if (call.isEmpty() && location.isEmpty() && !RealtimeBridge.messagesEnabled()) { stopExpected(); return START_NOT_STICKY }
            val launch = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
            launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            launch.putExtra("ftx_realtime_route", if (call.isNotEmpty()) "/pages-nonTheme/voice-call" else if (location.isNotEmpty()) RealtimeBridge.locationRoute else "/pages-nonTheme/chatlist")
            val immutable = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val returnIntent = if (RealtimeBridge.video) Intent(this, VideoCallActivity::class.java).putExtra("callId", call).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT) else if (RealtimeBridge.isNativeCall(call)) Intent(this, CallNotificationActivity::class.java).putExtra("callId", call).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT) else launch
            val content = PendingIntent.getActivity(this, 2700, returnIntent, immutable)
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
            builder.setSmallIcon(applicationInfo.icon).setContentTitle(if (call.isNotEmpty()) "分投侠 · 通话进行中" else if (location.isNotEmpty()) "分投侠 · 实时位置共享中" else "分投侠 · 后台消息接收中")
                .setContentText(if (call.isNotEmpty() && location.isNotEmpty()) "通话和位置共享正在继续，点击返回" else if (call.isEmpty() && location.isEmpty()) "正在接收消息和来电，点击返回分投侠" else "点击返回 App，可随时停止")
                .setContentIntent(content).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE)
            fun action(label: String, command: String, id: String, request: Int) {
                val target = Intent(this, RealtimeService::class.java).putExtra("action", command).putExtra("sessionId", id)
                    .setData(android.net.Uri.parse("ftx-internal://call/$command/$id"))
                builder.addAction(Notification.Action.Builder(null, label, PendingIntent.getService(this, request, target, immutable)).build())
            }
            if (call.isNotEmpty()) { action(if (RealtimeBridge.muted) "取消静音" else "静音", "mute", call, 2701); action("挂断", "hangup", call, 2702) }
            if (location.isNotEmpty()) action("停止共享", "stop-location", location, 2703)
            if (RealtimeBridge.messagesEnabled()) {
                val settings = packageManager.getLaunchIntentForPackage(packageName)
                if (settings != null) {
                    settings.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    settings.putExtra("ftx_realtime_route", "/pages-nonTheme/settings")
                    builder.addAction(Notification.Action.Builder(null, "消息设置", PendingIntent.getActivity(this, 2704, settings, immutable)).build())
                }
            }
            var types = 0
            if (RealtimeBridge.messagesEnabled() && Build.VERSION.SDK_INT >= 34) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            if (call.isNotEmpty() && Build.VERSION.SDK_INT >= 30) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (RealtimeBridge.cameraServiceNeeded && Build.VERSION.SDK_INT >= 30) {
                if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                } else RealtimeBridge.cameraServiceUnavailable(call)
            }
            if (location.isNotEmpty() && Build.VERSION.SDK_INT >= 29) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            val notification = builder.build()
            if (Build.VERSION.SDK_INT >= 29) {
                try { startForeground(2700, notification, types) }
                catch (error: SecurityException) {
                    if (types and ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA == 0) throw error
                    startForeground(2700, notification, types and ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA.inv())
                    RealtimeBridge.cameraServiceUnavailable(call)
                }
            } else startForeground(2700, notification)
            if (call.isNotEmpty() || location.isNotEmpty()) {
                if (wake == null) {
                    wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ftx:realtime")
                    wake?.setReferenceCounted(false)
                }
                wake?.acquire(2 * 60 * 60 * 1000L) // Renew when a later overlapping session starts.
            } else { if (wake?.isHeld == true) wake?.release(); wake = null }
            running = true; RealtimeBridge.serviceReady()
        } catch (_: Exception) { running = false; RealtimeBridge.serviceFailed(); stopExpected() }
        return START_NOT_STICKY
    }
    override fun onTaskRemoved(rootIntent: Intent?) { if (!RealtimeBridge.messagesEnabled()) { RealtimeBridge.stopAll(); stopExpected() } }
    override fun onDestroy() {
        val current = instance === this
        if (current) { instance = null; running = false }
        if (wake?.isHeld == true) wake?.release(); wake = null
        if (current && !stopping && (RealtimeBridge.messagesEnabled() || RealtimeBridge.callId.isNotEmpty() || RealtimeBridge.activeLocationId().isNotEmpty())) RealtimeBridge.stopAll()
        super.onDestroy()
    }
}
