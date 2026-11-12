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
import android.os.PowerManager
import android.net.Uri
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.util.UUID

// Background calls let the system present the initial audible notification,
// then keep ringing with the native loop under the same channel and system policy.
object RealtimeNotifications {
    private const val INCOMING = 2710
    private const val INCOMING_DISPLAY_CHANNEL = "ftx_incoming_quiet_v1"
    private const val INCOMING_SOUND_CHANNEL = "ftx_incoming_sound_v1"
    private const val SYSTEM_ALERT_HANDOFF_MS = 1500L
    private val main = Handler(Looper.getMainLooper())
    private var alertId = ""
    private var answerToken: String? = null
    private var alertTimeout: Runnable? = null
    private var alertHandoff: Runnable? = null
    private var systemAlertUpdate: Notification? = null
    fun incomingId(): String = alertId
    const val ANSWER_TOKEN_EXTRA = "ftx_call_answer_token"

    // The incoming activity also accepts public push links. Only the local
    // notification's immutable answer action can skip the on-screen button.
    fun consumeAnswerAction(id: String, token: String): Boolean {
        if (id != alertId || token != answerToken) return false
        answerToken = null
        return true
    }
    private fun manager(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private fun allowed(ctx: Context): Boolean = (Build.VERSION.SDK_INT < 33 ||
        ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
        (Build.VERSION.SDK_INT < 24 || manager(ctx).areNotificationsEnabled())
    private fun fullScreenAllowed(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 34 || manager(ctx).canUseFullScreenIntent()

    private fun callChannel(sound: Boolean) = if (sound) INCOMING_SOUND_CHANNEL else INCOMING_DISPLAY_CHANNEL

    @JvmStatic fun unlockedIncomingAllowed(ctx: Context): Boolean = Settings.canDrawOverlays(ctx)

    @JvmStatic fun openUnlockedIncomingSettings(activity: Activity): Boolean {
        val uri = Uri.fromParts("package", activity.packageName, null)
        return runCatching { activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, uri)) }.isSuccess
    }

    // Huawei background pop-ups are independent from Android overlay permission.
    // This OEM API is optional; an unreadable result must never mean granted.
    @JvmStatic fun backgroundPopupPermission(ctx: Context): String {
        if (!Build.MANUFACTURER.equals("huawei", ignoreCase = true) &&
            !Build.MANUFACTURER.equals("honor", ignoreCase = true)) return "not_required"
        return try {
            val api = Class.forName("com.huawei.android.app.AppOpsManagerEx")
            val op = api.getField("HW_OP_CODE_POPUP_BACKGROUND_WINDOW").getInt(null)
            val mode = api.getMethod("checkHwOpNoThrow", AppOpsManager::class.java,
                Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, String::class.java)
                .invoke(null, ctx.getSystemService(Context.APP_OPS_SERVICE), op, ctx.applicationInfo.uid, ctx.packageName) as? Int
            when (mode) {
                AppOpsManager.MODE_ALLOWED -> "allowed"
                AppOpsManager.MODE_IGNORED, AppOpsManager.MODE_ERRORED -> "denied"
                else -> "unknown"
            }
        } catch (_: Exception) { "unknown" }
    }

    @JvmStatic fun openBackgroundPopupSettings(activity: Activity): Boolean {
        val target = Intent("huawei.intent.action.HSM_PERMISSION_MANAGER")
            .setPackage("com.huawei.systemmanager").putExtra("packageName", activity.packageName)
        return try { activity.startActivity(target); true }
        catch (_: Exception) {
            runCatching {
                activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", activity.packageName, null)))
            }.isSuccess
        }
    }

    private fun openUnlockedIncoming(ctx: Context, id: String, target: Intent, sound: Boolean) {
        main.post {
            if (alertId != id || !RealtimeBridge.incomingPending(id) || !unlockedIncomingAllowed(ctx) ||
                incomingPresentation(ctx, sound) != "ready") return@post
            if (manager(ctx).currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) return@post
            val power = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val keyguard = ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            if (!power.isInteractive || keyguard.isKeyguardLocked) return@post
            try {
                // Keep the posted notification when Android declines the launch.
                ctx.startActivity(Intent(target).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP))
                Log.i("ftx-call-alert", "incoming-screen: launch_requested")
            } catch (_: RuntimeException) {
                Log.i("ftx-call-alert", "incoming-screen: notification_fallback")
            }
        }
    }

    @JvmStatic fun incomingPresentation(ctx: Context, sound: Boolean): String {
        if (!allowed(ctx)) return "notifications_disabled"
        if (Build.VERSION.SDK_INT >= 26 &&
            (manager(ctx).getNotificationChannel(callChannel(sound))?.importance
                ?: NotificationManager.IMPORTANCE_HIGH) < NotificationManager.IMPORTANCE_HIGH) return "channel_low"
        if (!fullScreenAllowed(ctx)) return "full_screen_denied"
        val interruptionFilter = manager(ctx).currentInterruptionFilter
        return if (interruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL ||
            interruptionFilter == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) "ready" else "dnd"
    }

    @JvmStatic fun openIncomingSettings(activity: Activity, sound: Boolean): Boolean {
        val packageUri = Uri.fromParts("package", activity.packageName, null)
        val status = incomingPresentation(activity, sound)
        val appSettings = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
        val target = when {
            status == "full_screen_denied" && Build.VERSION.SDK_INT >= 34 ->
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, packageUri)
            status == "dnd" -> Intent(Settings.ACTION_SOUND_SETTINGS)
            Build.VERSION.SDK_INT >= 26 -> Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
                .putExtra(Settings.EXTRA_CHANNEL_ID, channel(activity, true, sound))
            else -> appSettings
        }
        return try { activity.startActivity(target); true }
        catch (_: Exception) {
            try { activity.startActivity(appSettings); true } catch (_: Exception) { false }
        }
    }

    private fun channel(ctx: Context, call: Boolean, sound: Boolean): String {
        val id = if (call) callChannel(sound) else "ftx_messages_${if (sound) "sound" else "quiet"}_v1"
        if (Build.VERSION.SDK_INT >= 26) manager(ctx).createNotificationChannel(NotificationChannel(id,
            if (call && !sound) "来电接听界面" else "${if (call) "来电" else "聊天与业务消息"}（${if (sound) "跟随系统" else "无提示音"}）",
            if (call) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "响铃、振动和勿扰遵循系统通知设置"
            setBypassDnd(false)
            setSound(if (sound) RingtoneManager.getDefaultUri(if (call) RingtoneManager.TYPE_RINGTONE else RingtoneManager.TYPE_NOTIFICATION) else null,
                AudioAttributes.Builder().setUsage(if (call) AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_NOTIFICATION).build())
            enableVibration(sound)
        })
        return id
    }
    private fun builder(ctx: Context, channelId: String, sound: Boolean): Notification.Builder {
        return (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, channelId) else Notification.Builder(ctx)).apply {
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
        val locationInvite = !system && event.has("notificationTtlMs")
        val ttl = event.optLong("notificationTtlMs").coerceIn(0L, 60000L)
        if (locationInvite && ttl == 0L) return true
        val content = if (system) item.optString("content") else event.optString("notificationBody", "你收到一条新消息")
        val title = if (system) item.optString("title", "分投侠") else event.optString("title", "新消息")
        val route = if (system) "/pages-nonTheme/system-notifications" else if (event.optString("conversationType") == "group")
            "/pages-nonTheme/chat?groupId=${event.optString("groupId")}&conversationType=group" else "/pages-nonTheme/chat?chatId=${event.optString("otherId")}&userId=${event.optString("otherId")}" 
        val tag = "ftx_message_$id"
        val request = tag.hashCode() and 0x7fffffff
        val channelId = channel(ctx, false, sound)
        if (Build.VERSION.SDK_INT >= 26 && manager(ctx).getNotificationChannel(channelId)?.importance == NotificationManager.IMPORTANCE_NONE) return false
        val notification = builder(ctx, channelId, sound).setContentTitle(title.take(100)).setContentText(content.take(180))
            .setContentIntent(launch(ctx, route, request))
            .setCategory(if (locationInvite) Notification.CATEGORY_LOCATION_SHARING else Notification.CATEGORY_MESSAGE).setOnlyAlertOnce(true)
            .apply { if (locationInvite && Build.VERSION.SDK_INT >= 26) setTimeoutAfter(ttl) }.build()
        return try { manager(ctx).notify(tag, request, notification); true } catch (_: Exception) { false }
    }
    fun incoming(ctx: Context, event: JSONObject, sound: Boolean, background: Boolean = true): Boolean {
        if (!allowed(ctx)) {
            if (background) Log.i("ftx-call-alert", "incoming: notifications_disabled")
            return false
        }
        val id = event.optString("callId")
        if (alertId == id) return true // Replays must not restart the ring timeout.
        if (alertId.isNotEmpty()) return false
        val name = event.optJSONObject("peer")?.optString("name")?.trim()?.take(100)?.ifBlank { "联系人" } ?: "联系人"
        val video = event.optString("mode") == "video"
        val target = Intent(ctx, CallNotificationActivity::class.java).putExtra("callId", id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .setData(Uri.parse("ftx-internal://call/incoming/$id"))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val content = if (background) PendingIntent.getActivity(ctx, INCOMING, target, flags)
            else launch(ctx, "/pages-nonTheme/voice-call?incomingCallId=$id", INCOMING)
        val reject = PendingIntent.getService(ctx, INCOMING + 1, Intent(ctx, RealtimeService::class.java)
            .putExtra("action", "reject-incoming").putExtra("sessionId", id)
            .setData(Uri.parse("ftx-internal://call/reject/$id")), flags)
        // Some OEMs lower the effective importance of silent channels even when
        // they are configured as HIGH. Use the user's audible channel on arrival.
        val systemAlert = background && sound
        val alertChannel = channel(ctx, true, sound)
        val displayChannel = if (systemAlert) alertChannel else channel(ctx, true, false)
        if (Build.VERSION.SDK_INT >= 26 && manager(ctx).getNotificationChannel(displayChannel)?.importance == NotificationManager.IMPORTANCE_NONE) {
            if (background) Log.i("ftx-call-alert", "incoming: channel_blocked")
            return false
        }
        fun incomingBuilder() = builder(ctx, displayChannel, false).setContentTitle(name)
            .setContentText("邀请你进行${if (video) "视频" else "语音"}通话")
            .setContentIntent(content).setCategory(Notification.CATEGORY_CALL).setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
            .apply {
                if (Build.VERSION.SDK_INT >= 26) setTimeoutAfter(30000)
                else if (systemAlert) setDefaults(Notification.DEFAULT_VIBRATE)
                    .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
                else setDefaults(0).setSound(null).setVibrate(longArrayOf(0))
            }
        fun basicActions(builder: Notification.Builder) = builder
            .addAction(Notification.Action.Builder(null, "拒绝", reject).build())
            .addAction(Notification.Action.Builder(null, "查看接听", content).build())
        fun buildIncoming(builder: Notification.Builder) = builder.build().apply {
            if (systemAlert) this.flags = this.flags or Notification.FLAG_INSISTENT
        }
        val notification = incomingBuilder()
        var token = if (background && Build.VERSION.SDK_INT >= 31) {
            val nonce = UUID.randomUUID().toString()
            val answer = PendingIntent.getActivity(ctx, INCOMING, Intent(target)
                .setData(Uri.parse("ftx-internal://call/answer/$id"))
                .putExtra(ANSWER_TOKEN_EXTRA, nonce), flags)
            val person = Person.Builder().setName(name).setImportant(true).build()
            notification.setStyle(Notification.CallStyle.forIncomingCall(person, reject, answer).setIsVideo(video))
            nonce
        } else {
            basicActions(notification)
            null
        }
        // Let Android select the full-screen or emphasized heads-up presentation,
        // including when the user has not granted full-screen access.
        if (background) notification.setFullScreenIntent(content, true)
        return try {
            val notifications = manager(ctx)
            // A previous process may have left this notification ID behind.
            notifications.cancel(INCOMING)
            val posted = try {
                buildIncoming(notification).also { notifications.notify(INCOMING, it) }
            } catch (error: RuntimeException) {
                if (!background || (error !is SecurityException && (token == null || error !is IllegalArgumentException))) throw error
                // CallStyle itself may be rejected when the system removes the full-screen intent.
                Log.i("ftx-call-alert", "incoming: using_basic_notification")
                token = null
                buildIncoming(basicActions(incomingBuilder())).also { notifications.notify(INCOMING, it) }
            }
            if (background) Log.i("ftx-call-alert", "incoming: ${runCatching { incomingPresentation(ctx, sound) }.getOrDefault("status_unavailable")}")
            alertId = id; answerToken = token
            if (systemAlert) {
                // Updating the same notification with ONLY_ALERT_ONCE stops its
                // current audio/vibration before the native loop takes over.
                systemAlertUpdate = posted.clone().apply { this.flags = this.flags and Notification.FLAG_INSISTENT.inv() }
                val handoff = Runnable {
                    if (alertId == id && stopSystemAlert(ctx)) {
                        IncomingCallRinger.start(ctx, id, sound, alertChannel, displayChannel)
                    }
                }
                alertHandoff = handoff
                main.postDelayed(handoff, SYSTEM_ALERT_HANDOFF_MS)
            } else IncomingCallRinger.start(ctx, id, sound, alertChannel, displayChannel)
            val timeout = Runnable { cancelIncoming(ctx, id) }
            alertTimeout = timeout; main.postDelayed(timeout, 30000)
            if (background) openUnlockedIncoming(ctx, id, target, sound)
            true
        } catch (_: Exception) { false }
    }
    private fun clearHandoff(): Notification? {
        alertHandoff?.let(main::removeCallbacks)
        alertHandoff = null
        return systemAlertUpdate.also { systemAlertUpdate = null }
    }

    private fun stopSystemAlert(ctx: Context): Boolean {
        val update = clearHandoff() ?: return false
        return runCatching { manager(ctx).notify(INCOMING, update) }.isSuccess
    }

    fun silenceIncoming(ctx: Context) {
        stopSystemAlert(ctx)
        IncomingCallRinger.stop(alertId)
    }

    fun cancelIncoming(ctx: Context, id: String = alertId) {
        if (id != alertId) return
        clearHandoff()
        IncomingCallRinger.stop(id)
        alertTimeout?.let(main::removeCallbacks); alertTimeout = null; alertId = ""; answerToken = null
        manager(ctx).cancel(INCOMING)
    }
    fun clear(ctx: Context) {
        cancelIncoming(ctx)
        if (Build.VERSION.SDK_INT >= 23) for (entry in manager(ctx).activeNotifications)
            if (entry.tag?.startsWith("ftx_message_") == true) manager(ctx).cancel(entry.tag, entry.id)
    }
}
