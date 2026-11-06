package ftx.voice

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

// System notification channels own sound/vibration/DND. Never use media audio,
// override DND, acquire an idle wake lock, or start microphone/camera on ringing.
object RealtimeNotifications {
    private const val INCOMING = 2710
    private val main = Handler(Looper.getMainLooper())
    private var alertId = ""
    private var alertTimeout: Runnable? = null
    fun incomingId(): String = alertId
    private fun manager(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private fun allowed(ctx: Context): Boolean = (Build.VERSION.SDK_INT < 33 ||
        ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
        (Build.VERSION.SDK_INT < 24 || manager(ctx).areNotificationsEnabled())
    private fun channel(ctx: Context, call: Boolean, sound: Boolean): String {
        val id = "ftx_${if (call) "incoming" else "messages"}_${if (sound) "sound" else "quiet"}_v1"
        if (Build.VERSION.SDK_INT >= 26) manager(ctx).createNotificationChannel(NotificationChannel(id,
            "${if (call) "来电" else "聊天与业务消息"}（${if (sound) "跟随系统" else "无提示音"}）",
            if (call) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "响铃、振动和勿扰遵循系统通知设置"
            setBypassDnd(false)
            setSound(if (sound) RingtoneManager.getDefaultUri(if (call) RingtoneManager.TYPE_RINGTONE else RingtoneManager.TYPE_NOTIFICATION) else null,
                AudioAttributes.Builder().setUsage(if (call) AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_NOTIFICATION).build())
            enableVibration(sound)
        })
        return id
    }
    private fun builder(ctx: Context, call: Boolean, sound: Boolean): Notification.Builder {
        val id = channel(ctx, call, sound)
        return (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, id) else Notification.Builder(ctx)).apply {
            setSmallIcon(ctx.applicationInfo.icon); setAutoCancel(true); setVisibility(Notification.VISIBILITY_PRIVATE)
            if (Build.VERSION.SDK_INT < 26 && sound) setDefaults(Notification.DEFAULT_ALL)
        }
    }
    private fun launch(ctx: Context, route: String, request: Int): PendingIntent? {
        val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        intent.putExtra("ftx_realtime_route", route)
        return PendingIntent.getActivity(ctx, request, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun message(ctx: Context, event: JSONObject, sound: Boolean): Boolean {
        // Explicit quiet/self/withdrawn events are handled successfully without alerting.
        if (event.optBoolean("muted") || event.optBoolean("isSelf") || event.optJSONObject("message")?.optBoolean("isWithdraw") == true) return true
        if (!allowed(ctx)) return false
        val system = event.optString("type") == "notification.changed"
        val item = event.optJSONObject(if (system) "notification" else "message") ?: return false
        val id = event.optJSONObject("delivery")?.optString("id") ?: return false
        val content = if (system) item.optString("content") else event.optString("notificationBody", "你收到一条新消息")
        val title = if (system) item.optString("title", "分投侠") else event.optString("title", "新消息")
        val route = if (system) "/pages-nonTheme/system-notifications" else if (event.optString("conversationType") == "group")
            "/pages-nonTheme/chat?groupId=${event.optString("groupId")}&conversationType=group" else "/pages-nonTheme/chat?chatId=${event.optString("otherId")}&userId=${event.optString("otherId")}" 
        val tag = "ftx_message_$id"
        val request = tag.hashCode() and 0x7fffffff
        val notification = builder(ctx, false, sound).setContentTitle(title.take(100)).setContentText(content.take(180))
            .setContentIntent(launch(ctx, route, request)).setCategory(Notification.CATEGORY_MESSAGE).setOnlyAlertOnce(true).build()
        return try { manager(ctx).notify(tag, request, notification); true } catch (_: Exception) { false }
    }
    fun incoming(ctx: Context, event: JSONObject, sound: Boolean, background: Boolean = true): Boolean {
        if (!allowed(ctx)) return false
        val id = event.optString("callId")
        if (alertId == id) return true // Replays must not restart the ring timeout.
        if (alertId.isNotEmpty()) return false
        val name = event.optJSONObject("peer")?.optString("name", "联系人") ?: "联系人"
        val target = Intent(ctx, CallNotificationActivity::class.java).putExtra("callId", id)
            .setData(android.net.Uri.parse("ftx-internal://call/incoming/$id"))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val content = if (background) PendingIntent.getActivity(ctx, INCOMING, target, flags)
            else launch(ctx, "/pages-nonTheme/voice-call?incomingCallId=$id", INCOMING)
        val reject = PendingIntent.getService(ctx, INCOMING + 1, Intent(ctx, RealtimeService::class.java)
            .putExtra("action", "reject-incoming").putExtra("sessionId", id)
            .setData(android.net.Uri.parse("ftx-internal://call/reject/$id")), flags)
        val notification = builder(ctx, true, sound).setContentTitle(name.take(100))
            .setContentText("邀请你进行${if (event.optString("mode") == "video") "视频" else "语音"}通话")
            .setContentIntent(content).setCategory(Notification.CATEGORY_CALL).setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, "拒绝", reject).build())
            .addAction(Notification.Action.Builder(null, "查看接听", content).build())
        if (Build.VERSION.SDK_INT >= 26) notification.setTimeoutAfter(30000)
        else if (sound) notification.setDefaults(Notification.DEFAULT_VIBRATE)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
        // Android 14+ may require the user to grant this special access. Heads-up
        // notification/actions still work without it; never open settings automatically.
        if (background && (Build.VERSION.SDK_INT < 34 || manager(ctx).canUseFullScreenIntent())) notification.setFullScreenIntent(content, true)
        val built = notification.build()
        // The system loops both ringtone and vibration, honoring ringer mode,
        // DND and the user's channel preferences. Do not emulate it with media audio.
        built.flags = built.flags or Notification.FLAG_INSISTENT
        return try {
            // A previous process may have left this notification ID behind.
            manager(ctx).cancel(INCOMING)
            manager(ctx).notify(INCOMING, built)
            alertId = id
            val timeout = Runnable { cancelIncoming(ctx, id) }
            alertTimeout = timeout; main.postDelayed(timeout, 30000)
            true
        } catch (_: Exception) { false }
    }
    fun cancelIncoming(ctx: Context, id: String = alertId) {
        if (id != alertId) return
        alertTimeout?.let(main::removeCallbacks); alertTimeout = null; alertId = ""
        manager(ctx).cancel(INCOMING)
    }
    fun clear(ctx: Context) {
        cancelIncoming(ctx)
        if (Build.VERSION.SDK_INT >= 23) for (entry in manager(ctx).activeNotifications)
            if (entry.tag?.startsWith("ftx_message_") == true) manager(ctx).cancel(entry.tag, entry.id)
    }
}
