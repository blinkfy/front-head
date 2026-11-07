package ftx.voice

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// One account-bound socket. Coordinates/tokens remain in memory only. All mutable
// state is serialized on main. Opted-in messaging reconnects with bounded backoff.
object RealtimeBridge {
    private val main = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    private var context: Context? = null
    @Volatile private var socket: WebSocket? = null
    @Volatile private var authenticated = false
    @Volatile private var lastSeen = 0L
    @Volatile private var foreground = true
    @Volatile private var serverSupported = false
    @Volatile var callId = ""; private set
    @Volatile var video = false; private set
    @Volatile var muted = false; private set
    @Volatile private var callConnected = false
    @Volatile var locationId = ""; private set
    @Volatile private var watching = false
    var locationRoute = ""; private set
    @Volatile private var selfId = ""
    private var installationId = ""
    @Volatile private var messagingEnabled = false
    @Volatile private var messagingPaused = false
    @Volatile private var startingService = false
    private var soundEnabled = true
    private var messageServerSupported = false
    private var socketUrl = ""
    private var tokenExpiry = 0L
    private var reconnectTask: Runnable? = null
    private var reconnectAttempts = 0
    private var incoming: JSONObject? = null
    private var incomingDeadline: Runnable? = null
    private val incomingAcceptance = IncomingCallAcceptance()
    @Volatile private var nativeAnswered = false
    private var nativePeer: JSONObject? = null
    private var nativeStartedAt = 0L
    private var nativeSpeaker = false
    private var nativeEntryMode = "audio"
    private var nativeCanSwitchCamera = false
    private var nativeCamera = true
    private var nativeRemoteCamera = true
    private var nativeAcceptSent = false
    private var nativeReported = false
    private var nativeDeadline: Runnable? = null
    @JvmStatic fun isNativeCall(id: String): Boolean = nativeAnswered && callId == id && id.isNotEmpty()
    private fun nativeSnapshot(phase: String = if (callConnected) "connected" else "connecting", reason: String = ""): JSONObject =
        JSONObject().put("type", "voice.native").put("callId", callId).put("phase", phase).put("mode", nativeEntryMode).put("cameraSupported", video).put("canSwitchCamera", nativeCanSwitchCamera)
            .put("peer", nativePeer).put("userId", selfId).put("muted", muted).put("speaker", nativeSpeaker)
            .put("cameraEnabled", nativeCamera).put("remoteCameraEnabled", nativeRemoteCamera).put("startedAt", nativeStartedAt).put("reason", reason)
            .apply {
                val recording = VoiceCallBridge.recordingState(callId)
                recording?.keys()?.forEach { key -> put(key, recording.opt(key)) }
            }
    private fun publishNative() {
        if (!nativeAnswered) return
        deliver(nativeSnapshot()); notifyIncomingScreen()
    }
    fun answerNative(activity: Activity, id: String): Boolean {
        if (!incomingPending(id) || callId.isNotEmpty() || activity.isFinishing || activity.isDestroyed) return false
        val invitation = incoming ?: return false
        val isVideo = invitation.optString("mode") == "video"
        val flexible = invitation.optBoolean("cameraToggle")
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
            (isVideo && activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)) return false
        if (!incomingAcceptance.accept(id, incomingOwner())) return false
        callId = id; video = isVideo || flexible; nativeEntryMode = if (isVideo) "video" else "audio"; nativeCanSwitchCamera = false; callConnected = false; muted = false; nativeSpeaker = isVideo
        nativeAnswered = true; nativePeer = invitation.optJSONObject("peer"); nativeStartedAt = 0L
        nativeCamera = isVideo; nativeRemoteCamera = isVideo; nativeAcceptSent = false; nativeReported = false
        clearIncoming()
        refreshHeartbeat()
        if (!updateService()) { endCall("failed", true); return false }
        publishNative()
        val deadline = Runnable { if (isNativeCall(id) && !callConnected) endCall("connect_failed", true) }
        nativeDeadline = deadline; main.postDelayed(deadline, 30000)
        VoiceCallBridge.open(activity, JSONObject().put("callId", id).put("offerer", false).put("nativeAnswer", true)
            .put("entryMode", nativeEntryMode).put("recordingOwner", selfId)
            .put("mode", if (video) "video" else "audio").put("cameraEnabled", isVideo).put("remoteCameraEnabled", isVideo).put("cameraRequested", isVideo).put("speaker", isVideo).put("peerName", nativePeer?.optString("name", "联系人"))
            .put("stunUrls", org.json.JSONArray().put("stun:stun.cloudflare.com:3478")).toString()) { event ->
                // Errors emitted before the native Session exists still terminate the reservation.
                main.post { if (isNativeCall(id)) try {
                    val data = JSONObject(event)
                    if (data.optString("type") == "error") endCall(data.optString("reason", "failed"), true)
                } catch (_: Exception) { endCall("failed", true) } }
            }
        return true
    }
    fun videoMinimized(activity: Activity, id: String) { main.post {
        if (callId != id) return@post
        if (!isNativeCall(id)) {
            deliver(JSONObject().put("type", "voice.minimized").put("callId", id)); return@post
        }
        // Notification acceptance may never have loaded a Uni call page/listener.
        val launch = activity.packageManager.getLaunchIntentForPackage(activity.packageName) ?: return@post
        val peerId = nativePeer?.optString("id") ?: ""
        val title = java.net.URLEncoder.encode(nativePeer?.optString("name", "联系人") ?: "联系人", "UTF-8")
        val route = if (Regex("^[1-9]\\d{0,9}$").matches(peerId)) "/pages-nonTheme/chat?chatId=$peerId&userId=$peerId&title=$title" else "/pages-nonTheme/chatlist"
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launch.putExtra("ftx_realtime_route", route)
        try { activity.startActivity(launch); CallNotificationActivity.finishForCall(id) } catch (_: Exception) {}
    } }
    @JvmStatic fun controlNative(id: String, json: String) { main.post {
        if (!isNativeCall(id)) return@post
        try {
            val value = JSONObject(json)
            if (value.optBoolean("hangup")) { endCall("hangup", true); return@post }
            applyNativeControl(value)
        } catch (_: Exception) {}
    } }
    private fun applyNativeControl(value: JSONObject) {
        if (value.has("muted")) muted = value.optBoolean("muted")
        if (value.has("speaker")) nativeSpeaker = value.optBoolean("speaker")
        if (video && value.has("cameraEnabled")) {
            nativeCamera = value.optBoolean("cameraEnabled")
            raw(JSONObject().put("type", "voice.media").put("callId", callId).put("cameraEnabled", nativeCamera))
        }
        VoiceCallBridge.control(callId, value.toString()); updateService(); publishNative()
    }
    private var incomingObserver: ((JSONObject?) -> Unit)? = null
    private var observedIncomingId = ""
    private fun incomingOwner() = "$selfId:$generation"
    // Activity callbacks run on main; only the UTS consume method can run off-main.
    fun incomingPending(id: String): Boolean = incoming?.optString("callId") == id && alive() &&
        (tokenExpiry == 0L || tokenExpiry > System.currentTimeMillis()) && incomingAcceptance.pending(id, incomingOwner())
    fun observeIncoming(id: String, listener: (JSONObject?) -> Unit) {
        observedIncomingId = id; incomingObserver = listener
        listener(if (isNativeCall(id)) nativeSnapshot() else if (incomingPending(id)) JSONObject(incoming.toString()) else null)
    }
    fun unobserveIncoming(listener: (JSONObject?) -> Unit) {
        if (incomingObserver === listener) { incomingObserver = null; observedIncomingId = "" }
    }
    private fun notifyIncomingScreen() {
        incomingObserver?.invoke(if (isNativeCall(observedIncomingId)) nativeSnapshot() else if (incomingPending(observedIncomingId)) JSONObject(incoming.toString()) else null)
    }
    fun acceptIncomingFromScreen(id: String): Boolean = incomingPending(id) && incomingAcceptance.accept(id, incomingOwner())
    fun cancelIncomingAcceptance(id: String) { incomingAcceptance.cancelAcceptance(id) }
    fun rejectIncomingFromScreen(id: String) {
        if (incoming?.optString("callId") != id) return
        raw(JSONObject().put("type", "voice.end").put("callId", id).put("reason", "rejected"))
        clearIncoming()
    }
    @JvmStatic fun takeIncomingAcceptance(id: String): Boolean = authenticated &&
        (tokenExpiry == 0L || tokenExpiry > System.currentTimeMillis()) && incomingAcceptance.consume(id, incomingOwner())
    @JvmStatic fun messagesEnabled(): Boolean = messagingEnabled && messageServerSupported && socketUrl.isNotEmpty()
    @JvmStatic fun messagesPaused(ctx: Context): Boolean = messagingPaused || ctx.getSharedPreferences("ftx_realtime", Context.MODE_PRIVATE).getBoolean("paused", false)
    @JvmStatic fun suspended(): Boolean = !foreground
    private fun idleMessages(): Boolean = messagesEnabled() && !foreground && callId.isEmpty() && !watching
    private fun staleAfter(): Long = if (idleMessages()) 150000L else 45000L
    @JvmStatic fun configureMessaging(ctx: Context, options: String) { main.post {
        try {
            val value = JSONObject(options)
            context = ctx.applicationContext
            installationId = value.optString("installationId").takeIf { Regex("^[A-Za-z0-9_-]{16,64}$").matches(it) } ?: ""
            if (!value.optBoolean("enabled")) {
                messagingPaused = false
                ctx.getSharedPreferences("ftx_realtime", Context.MODE_PRIVATE).edit().putBoolean("paused", false).apply()
            } else messagingPaused = messagesPaused(ctx)
            messagingEnabled = value.optBoolean("enabled") && !messagingPaused && installationId.isNotEmpty()
            val previousSound = soundEnabled
            soundEnabled = value.optBoolean("sound", true)
            if (previousSound && !soundEnabled) context?.let { RealtimeNotifications.cancelIncoming(it) }
            if (authenticated) announceMessaging()
            updateService()
        } catch (_: Exception) { messagingEnabled = false; updateService() }
    } }
    private fun announceMessaging() {
        if (messageServerSupported && installationId.isNotEmpty()) raw(JSONObject().put("type", "native.capability")
            .put("version", 1).put("installationId", installationId).put("enabled", messagingEnabled))
    }
    private fun clearIncoming(transfer: Boolean = false) {
        if (!transfer) incomingAcceptance.clear()
        incoming = null; incomingDeadline?.let(main::removeCallbacks); incomingDeadline = null
        if (!transfer) context?.let { RealtimeNotifications.cancelIncoming(it) }
        notifyIncomingScreen()
    }
    private fun receiveIncoming(event: JSONObject) {
        if (callId.isNotEmpty() || incoming != null) {
            raw(JSONObject().put("type", "voice.end").put("callId", event.optString("callId")).put("reason", "busy")); return
        }
        incoming = event
        incomingAcceptance.offer(event.optString("callId"), incomingOwner())
        notifyIncomingScreen()
        val ctx = context
        if (ctx == null || !RealtimeNotifications.incoming(ctx, event, soundEnabled)) {
            raw(JSONObject().put("type", "voice.end").put("callId", event.optString("callId")).put("reason", "unavailable"))
            clearIncoming(); return
        }
        val task = Runnable {
            if (incoming?.optString("callId") == event.optString("callId")) {
                raw(JSONObject().put("type", "voice.end").put("callId", event.optString("callId")).put("reason", "timeout")); clearIncoming()
            }
        }
        incomingDeadline = task; main.postDelayed(task, 30000)
        raw(JSONObject().put("type", "voice.notified").put("callId", event.optString("callId")))
    }
    @Volatile private var generation = 0
    private var closing = false
    private var callback: ((String) -> Unit)? = null
    private val deferred = linkedMapOf<String, String>()
    private var watchCallback: ((String) -> Unit)? = null
    private var watchId = 0
    private var manager: LocationManager? = null
    private var listener: LocationListener? = null
    private var point: Location? = null
    private var pending: Location? = null
    private var lastSent: Location? = null
    private var lastSentAt = 0L
    private var sequence = 0
    private var locationDeadline: Runnable? = null
    private var flushTask: Runnable? = null
    private var disconnectedTask: Runnable? = null
    private val heartbeat = object : Runnable {
        override fun run() {
            if (socket == null) return
            if (System.currentTimeMillis() - lastSeen > staleAfter()) { failSocket(); return }
            if (authenticated) raw(JSONObject().put("type", "ping"))
            main.postDelayed(this, if (idleMessages()) 60000 else 20000)
        }
    }
    private fun refreshHeartbeat() {
        main.removeCallbacks(heartbeat)
        if (socket != null) {
            if (authenticated) raw(JSONObject().put("type", "ping"))
            main.postDelayed(heartbeat, 20000)
        }
    }
    private fun emit(type: String, data: String = "", code: Int = 1000) {
        callback?.invoke(JSONObject().put("type", type).put("data", data).put("code", code).toString())
    }
    private fun deliver(event: JSONObject) {
        if (foreground) emit("message", event.toString())
        else if (event.optString("type").startsWith("voice.") || event.optString("type").startsWith("location.")) {
            val close = deferred.remove("close")
            val key = event.optString("type") + ":" + event.optString("callId", event.optString("sessionId"))
            deferred.remove(key); deferred[key] = event.toString()
            while (deferred.size > 32) deferred.remove(deferred.keys.first())
            if (close != null) deferred["close"] = close // Terminal reasons must precede socket disposal.
        }
    }
    private fun raw(event: JSONObject): Boolean = authenticated && socket?.send(event.toString()) == true
    @JvmStatic fun alive(): Boolean = authenticated && socket != null && System.currentTimeMillis() - lastSeen <= staleAfter()
    @JvmStatic fun backgroundMask(): Int = if (!serverSupported) 0
        else (if (RealtimeService.running && alive() && callId.isNotEmpty() && (callConnected || nativeAnswered)) 1 else 0) or
            (if (RealtimeService.running && alive() && watching) 2 else 0) or (if (messagesEnabled() && (RealtimeService.running || startingService)) 4 else 0)
    @JvmStatic fun open(ctx: Context, url: String, listener: (String) -> Unit) { main.post {
        closeNow(false)
        context = ctx.applicationContext; callback = listener; foreground = true
        socketUrl = url
        tokenExpiry = try {
            val jwt = android.net.Uri.parse(url).getQueryParameter("token") ?: ""
            val payload = String(android.util.Base64.decode(jwt.split(".")[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP), Charsets.UTF_8)
            JSONObject(payload).optLong("exp", 0) * 1000L
        } catch (_: Exception) { 0L }
        reconnectAttempts = 0
        connectNative()
    } }
    private fun connectNative() {
        if (socketUrl.isEmpty()) return
        val epoch = ++generation
        val previous = socket; socket = null; authenticated = false; previous?.cancel()
        lastSeen = System.currentTimeMillis()
        try {
            val request = Request.Builder().url(socketUrl).build()
            socket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onMessage(ws: WebSocket, text: String) { main.post {
                    if (epoch != generation) return@post
                    try {
                        val event = JSONObject(text); lastSeen = System.currentTimeMillis()
                        if (isNativeCall(event.optString("callId"))) {
                            when (event.optString("type")) {
                                "voice.accepted" -> return@post
                                "voice.offer", "voice.answer", "voice.ice" -> {
                                    VoiceCallBridge.signal(callId, JSONObject(event.toString()).put("type", event.optString("type").removePrefix("voice.")).toString())
                                    return@post
                                }
                                "voice.media" -> {
                                    nativeRemoteCamera = event.optBoolean("cameraEnabled", true)
                                    VoiceCallBridge.control(callId, JSONObject().put("remoteCameraEnabled", nativeRemoteCamera).toString())
                                    publishNative(); return@post
                                }
                                "voice.connected" -> {
                                    callConnected = true; nativeStartedAt = System.currentTimeMillis()
                                    nativeDeadline?.let(main::removeCallbacks); nativeDeadline = null
                                    VoiceCallBridge.control(callId, "{\"connected\":true}"); publishNative(); return@post
                                }
                                "voice.ended" -> { endCall(event.optString("reason", "hangup"), false); return@post }
                            }
                        }
                        when (event.optString("type")) {
                            "connected" -> {
                                authenticated = true; selfId = event.optString("userId"); serverSupported = event.optInt("realtimeBackgroundVersion") == 1
                                messageServerSupported = event.optInt("backgroundMessagesVersion") == 1
                                announceMessaging()
                                if (!foreground) {
                                    raw(JSONObject().put("type", "background").put("keepRealtime", true))
                                    raw(JSONObject().put("type", "voice.capability").put("version", 1).put("available", true).put("video", true).put("cameraToggle", true))
                                    deferred["connected"] = event.toString()
                                }
                                updateService()
                            }
                            "voice.incoming" -> if (!foreground) { receiveIncoming(event); return@post }
                                else if (callId.isEmpty()) context?.let { RealtimeNotifications.incoming(it, event, soundEnabled, background = false) }
                            "voice.ready" -> if (foreground && incoming != null) {
                                deliver(event)
                                val invitation = incoming; clearIncoming(transfer = true)
                                if (invitation != null) deliver(invitation)
                                return@post
                            }
                            "pong" -> reconnectAttempts = 0
                            "voice.connected" -> if (event.optString("callId") == callId) {
                                callConnected = true; VoiceCallBridge.control(callId, "{\"connected\":true}")
                            }
                            "voice.ended" -> {
                                context?.let { RealtimeNotifications.cancelIncoming(it, event.optString("callId")) }
                                incomingAcceptance.clear(event.optString("callId"))
                                if (event.optString("callId") == incoming?.optString("callId")) clearIncoming()
                                if (event.optString("callId") == callId) endCall(event.optString("reason", "hangup"), false)
                            }
                            "voice.media" -> if (!foreground && event.optString("callId") == callId) VoiceCallBridge.control(callId,
                                JSONObject().put("remoteCameraEnabled", event.optBoolean("cameraEnabled")).toString())
                            "location.joined" -> if (!watching || locationId == event.optString("sessionId")) {
                                locationId = event.optString("sessionId")
                                val peer = if (event.optJSONObject("from")?.optString("id") == selfId) event.optJSONObject("to") else event.optJSONObject("from")
                                locationRoute = "/pages-nonTheme/live-location?peerId=${peer?.optString("id") ?: ""}&name=${java.net.URLEncoder.encode(peer?.optString("name") ?: "联系人", "UTF-8")}&sessionId=$locationId"
                            }
                            "location.ended" -> if (event.optString("sessionId") == locationId) stopLocation(false)
                        }
                        val receipt = event.optJSONObject("delivery")
                        val notification = event.optString("type") in listOf("chat.changed", "notification.changed")
                        if (receipt != null && notification) {
                            val handled = foreground || messagesEnabled() && context?.let { RealtimeNotifications.message(it, event, soundEnabled) } == true
                            if (handled) raw(JSONObject().put("type", "notification.ack").put("id", receipt.optString("id")).put("nonce", receipt.optString("nonce")))
                        }
                        deliver(event)
                    } catch (_: Exception) { failSocket() }
                } }
                override fun onClosed(ws: WebSocket, code: Int, reason: String) { main.post { if (epoch == generation) failSocket(code) } }
                override fun onFailure(ws: WebSocket, error: Throwable, response: Response?) { main.post { if (epoch == generation) failSocket() } }
            })
            main.removeCallbacks(heartbeat); main.postDelayed(heartbeat, 20000)
        } catch (_: Exception) { failSocket() }
    }
    @JvmStatic fun send(json: String) { main.post {
        try {
            val event = JSONObject(json)
            if (event.optString("type") in listOf("voice.accept", "voice.end"))
                context?.let { RealtimeNotifications.cancelIncoming(it, event.optString("callId")) }
            // Native owns heartbeat and Android location sequence/throttle, even in foreground.
            if (event.optString("type") in listOf("ping", "location.point")) return@post
            if (!raw(event)) failSocket()
        } catch (_: Exception) { failSocket() }
    } }
    @JvmStatic fun stopIncomingAlert(id: String) { main.post { context?.let { RealtimeNotifications.cancelIncoming(it, id) } } }
    @JvmStatic fun close() { main.post { closeNow(false); context?.let { RealtimeNotifications.clear(it) } } }
    private fun closeNow(notify: Boolean, code: Int = 1000) {
        incoming?.let { raw(JSONObject().put("type", "voice.end").put("callId", it.optString("callId")).put("reason", "rejected")) }
        generation++; authenticated = false; serverSupported = false; messageServerSupported = false; socketUrl = ""
        reconnectTask?.let(main::removeCallbacks); reconnectTask = null
        clearIncoming()
        main.removeCallbacks(heartbeat)
        val previous = socket; socket = null
        stopLocation(false); endCall("disconnected", false)
        previous?.cancel()
        updateService()
        deferred.clear()
        if (notify) emit("close", code = code)
        callback = null
    }
    private fun failSocket(code: Int = 1006, graceful: Boolean = false) {
        if (closing) return
        closing = true
        if (!foreground) {
            stopLocation(false); endCall("disconnected", false); clearIncoming()
            val previous = socket; socket = null; authenticated = false
            if (graceful) previous?.close(1000, "Realtime finished") else previous?.cancel()
            main.removeCallbacks(heartbeat)
            // Preserve only a close marker; foreground reconnect reauthorizes the account.
            val terminal = deferred.filter { (key, value) -> key.startsWith("voice.ended:") || key.startsWith("location.ended:") ||
                (key.startsWith("voice.native:") && JSONObject(value).optString("phase") == "ended") }
            deferred.clear(); deferred.putAll(terminal); generation++
            if (messagesEnabled() && code != 4001 && code != 4000 && (tokenExpiry == 0L || tokenExpiry > System.currentTimeMillis())) {
                val wait = (1000L shl reconnectAttempts.coerceAtMost(6)).coerceAtMost(60000L) + (Math.random() * 1000).toLong()
                reconnectAttempts++
                reconnectTask?.let(main::removeCallbacks)
                val task = Runnable {
                    reconnectTask = null
                    if (messagesEnabled() && !foreground && (tokenExpiry == 0L || tokenExpiry > System.currentTimeMillis())) connectNative()
                    else if (!foreground) { closeNow(false); deferred["close"] = "4001" }
                }
                reconnectTask = task; main.postDelayed(task, wait)
            } else {
                deferred["close"] = code.toString(); socketUrl = ""; updateService()
            }
        } else closeNow(true, code)
        closing = false
    }
    @JvmStatic fun setForeground(value: Boolean) { main.post {
        foreground = value
        if (value) {
            raw(JSONObject().put("type", "foreground"))
            reconnectTask?.let(main::removeCallbacks); reconnectTask = null
            if (socket == null && socketUrl.isNotEmpty()) connectNative()
            else refreshHeartbeat()
            val events = deferred.toMap(); deferred.clear()
            for ((key, event) in events) if (key == "close") emit("close", code = event.toInt()) else emit("message", event)
            point?.let { if (System.currentTimeMillis() - it.time < 45000) locationCallback(it) }
            if (incoming != null) {
                raw(JSONObject().put("type", "voice.capability").put("version", 1).put("available", true).put("video", true).put("cameraToggle", true))
            }
            VoiceCallBridge.resumeState(); publishNative()
        } else {
            if (backgroundMask() == 0) { closeNow(true); return@post }
            raw(JSONObject().put("type", "background").put("keepRealtime", true))
            if (!callConnected && !nativeAnswered && callId.isNotEmpty()) endCall("background", true)
        }
    } }
    private fun updateService(): Boolean {
        val ctx = context ?: return false
        if (callId.isEmpty() && !watching && !messagesEnabled()) {
            startingService = false
            ctx.stopService(Intent(ctx, RealtimeService::class.java))
            if (!foreground && socket != null) failSocket(1000, true)
            return true
        }
        return try {
            val intent = Intent(ctx, RealtimeService::class.java)
            startingService = true
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
            true
        } catch (_: Exception) {
            startingService = false
            messagingEnabled = false; messagingPaused = true; announceMessaging()
            emit("status", "SERVICE_UNAVAILABLE")
            if (!foreground && callId.isEmpty() && !watching) failSocket(1000, true)
            false
        }
    }
    @JvmStatic fun attachCall(ctx: Context, id: String, isVideo: Boolean) { main.post {
        if (nativeAnswered && callId == id) return@post
        context = ctx.applicationContext; callId = id; video = isVideo; muted = false; callConnected = false
        refreshHeartbeat()
        if (!updateService()) endCall("failed", true)
    } }
    @JvmStatic fun detachCall(id: String) { main.post {
        if (callId != id) return@post
        if (nativeAnswered) { endCall("failed", true); return@post }
        pendingCameraAction = null
        callId = ""; callConnected = false; video = false
        disconnectedTask?.let(main::removeCallbacks); disconnectedTask = null
        updateService()
    } }
    @JvmStatic fun updateMuted(id: String, value: Boolean) { main.post {
        if (id == callId && muted != value) { muted = value; updateService(); publishNative() }
    } }
    // A camera granted mid-call needs its foreground service type refreshed.
    private var pendingCameraAction: Pair<String, () -> Unit>? = null
    @JvmStatic fun withCameraService(id: String, action: () -> Unit) { main.post {
        val ctx = context ?: return@post
        if (callId != id || !video || ctx.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return@post
        pendingCameraAction = id to action
        if (!updateService()) pendingCameraAction = null
    } }
    @JvmStatic fun cancelCameraServiceAction(id: String) { main.post {
        if (pendingCameraAction?.first == id) pendingCameraAction = null
    } }
    @JvmStatic fun activeLocationId(): String = if (watching) locationId else ""
    // Return true when native consumed an event while JS may be suspended.
    @JvmStatic fun callEvent(id: String, type: String, data: JSONObject): Boolean {
        val background = !foreground
        val owned = isNativeCall(id)
        // Native owns the disconnect grace period on both sides of a JS pause.
        if (!owned && !background && type != "state" && type != "control") return false
        main.post {
            if (callId != id) return@post
            when (type) {
                "ready" -> if (owned && !nativeAcceptSent) {
                    nativeAcceptSent = true
                    if (!raw(JSONObject().put("type", "voice.accept").put("callId", id))) endCall("disconnected", false)
                }
                "offer", "answer", "ice" -> raw(JSONObject(data.toString()).put("type", "voice.$type").put("callId", id))
                "camera" -> {
                    if (data.has("canSwitchCamera")) nativeCanSwitchCamera = data.optBoolean("canSwitchCamera")
                    if (data.has("cameraEnabled")) {
                        nativeCamera = data.optBoolean("cameraEnabled")
                        raw(JSONObject().put("type", "voice.media").put("callId", id).put("cameraEnabled", nativeCamera))
                    }
                    if (owned) publishNative()
                }
                "control" -> if (owned) applyNativeControl(data) else {
                    // The dedicated video Activity must not wait for a paused Uni JS runtime.
                    VoiceCallBridge.control(id, data.toString())
                    if (video && data.has("cameraEnabled")) raw(JSONObject().put("type", "voice.media").put("callId", id).put("cameraEnabled", data.optBoolean("cameraEnabled")))
                    deliver(JSONObject(data.toString()).put("type", "voice.local-control").put("callId", id))
                }
                "recording" -> if (owned) publishNative() else
                    deliver(JSONObject(data.toString()).put("type", "voice.local-recording").put("callId", id))
                "hangup", "error" -> endCall(if (type == "hangup") "hangup" else data.optString("reason", "failed"), true)
                "state" -> when (data.optString("state")) {
                    "failed" -> endCall("connect_failed", true)
                    "disconnected" -> {
                        disconnectedTask?.let(main::removeCallbacks)
                        val task = Runnable { if (callId == id) endCall("disconnected", true) }
                        disconnectedTask = task; main.postDelayed(task, 8000)
                    }
                    "connected" -> {
                        disconnectedTask?.let(main::removeCallbacks); disconnectedTask = null
                        if (owned && !nativeReported) { nativeReported = true; raw(JSONObject().put("type", "voice.connected").put("callId", id)) }
                    }
                }
            }
        }
        return background || owned || type == "control"
    }
    private fun endCall(reason: String, signal: Boolean) {
        val id = callId
        if (id.isEmpty()) return
        val nativeEnd = if (nativeAnswered) nativeSnapshot("ended", reason) else null
        pendingCameraAction = null
        nativeAnswered = false; nativePeer = null
        nativeDeadline?.let(main::removeCallbacks); nativeDeadline = null
        callId = ""; video = false; callConnected = false
        deferred.keys.filter { it.startsWith("voice.") && it.endsWith(":$id") }.forEach(deferred::remove)
        disconnectedTask?.let(main::removeCallbacks); disconnectedTask = null
        if (signal) raw(JSONObject().put("type", "voice.end").put("callId", id).put("reason", reason))
        VoiceCallBridge.close(id)
        if (nativeEnd != null) { deliver(nativeEnd); incomingObserver?.invoke(null) }
        if (signal || !foreground) deliver(JSONObject().put("type", "voice.ended").put("callId", id).put("reason", reason))
        updateService()
    }
    @JvmStatic fun notificationAction(action: String, id: String) { main.post {
        when (action) {
            "stop-messages" -> {
                messagingEnabled = false; messagingPaused = true
                context?.getSharedPreferences("ftx_realtime", Context.MODE_PRIVATE)?.edit()?.putBoolean("paused", true)?.apply()
                announceMessaging(); updateService()
                if (foreground) emit("status", "PAUSED")
            }
            "reject-incoming" -> if (id == incoming?.optString("callId") || id == RealtimeNotifications.incomingId()) {
                raw(JSONObject().put("type", "voice.end").put("callId", id).put("reason", "rejected"))
                if (id == incoming?.optString("callId")) clearIncoming()
                else context?.let { RealtimeNotifications.cancelIncoming(it, id) }
                deliver(JSONObject().put("type", "voice.ended").put("callId", id).put("reason", "rejected"))
            }
            "hangup" -> if (id == callId) endCall("hangup", true)
            "mute" -> if (id == callId) {
                muted = !muted; VoiceCallBridge.control(id, JSONObject().put("muted", muted).toString()); updateService(); publishNative()
            }
            "stop-location" -> if (id == locationId) stopLocation(true)
        }
    } }
    @JvmStatic fun serviceReady() { main.post {
        startingService = false
        val pending = pendingCameraAction; pendingCameraAction = null
        val ctx = context
        if (pending != null && ctx != null && pending.first == callId && video && RealtimeService.running &&
            ctx.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) pending.second()
    } }
    @JvmStatic fun serviceFailed() { main.post {
        pendingCameraAction = null
        startingService = false
        messagingEnabled = false; messagingPaused = true
        emit("status", "SERVICE_UNAVAILABLE"); clearIncoming(); endCall("failed", true); stopLocation(true); updateService()
    } }
    @JvmStatic fun stopAll() { main.post {
        messagingEnabled = false; messagingPaused = true
        endCall("hangup", true); stopLocation(true); clearIncoming(); closeNow(true)
    } }
    @JvmStatic fun watchLocation(ctx: Context, callback: (String) -> Unit): Int {
        val id = ++watchId
        main.post {
            context = ctx.applicationContext
            if (locationId.isEmpty() || !alive()) { callback("{\"error\":2}"); return@post }
            watchCallback = callback; watching = true; sequence = 0; lastSentAt = 0
            refreshHeartbeat()
            if (!updateService()) { locationError(2); return@post }
            try {
                manager = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
                val precise = ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                val coarse = ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                if (!precise && !coarse) { locationError(1); return@post }
                val source = object : LocationListener {
                    override fun onLocationChanged(value: Location) {
                        if (!watching || id != watchId || !value.hasAccuracy() || !value.latitude.isFinite() || !value.longitude.isFinite()) return
                        point = Location(value); pending = Location(value)
                        locationDeadline?.let(main::removeCallbacks); locationDeadline = null
                        if (foreground) locationCallback(value)
                        flushLocation()
                    }
                    override fun onProviderDisabled(provider: String) {
                        if (manager?.getProviders(true)?.any { it == LocationManager.GPS_PROVIDER || it == LocationManager.NETWORK_PROVIDER } != true) locationError(2)
                    }
                    override fun onProviderEnabled(provider: String) {}
                    @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                }
                listener = source
                val providers = manager!!.getProviders(true).filter { it == LocationManager.NETWORK_PROVIDER || precise && it == LocationManager.GPS_PROVIDER }
                if (providers.isEmpty()) { locationError(2); return@post }
                for (provider in providers) manager!!.requestLocationUpdates(provider, 5000L, 0f, source, Looper.getMainLooper())
                // Show a recent cached fix immediately while requesting fresh GPS/network fixes.
                providers.mapNotNull { manager!!.getLastKnownLocation(it) }
                    .filter { it.hasAccuracy() && System.currentTimeMillis() - it.time in 0L..30000L }
                    .minByOrNull { it.accuracy }?.let(source::onLocationChanged)
                val deadline = Runnable { if (watching && id == watchId && point == null) locationError(2) }
                locationDeadline = deadline; main.postDelayed(deadline, 45000)
            } catch (_: SecurityException) { locationError(1) } catch (_: Exception) { locationError(2) }
        }
        return id
    }
    private fun locationCallback(value: Location) { watchCallback?.invoke(JSONObject().put("latitude", value.latitude)
        .put("longitude", value.longitude).put("accuracy", value.accuracy.toDouble()).toString()) }
    private fun locationError(code: Int) {
        watchCallback?.invoke(JSONObject().put("error", code).toString())
        stopLocation(true)
    }
    private fun flushLocation() {
        if (!watching || pending == null || flushTask != null) return
        val delay = (5000 - (System.currentTimeMillis() - lastSentAt)).coerceAtLeast(0)
        if (delay > 0) {
            val task = Runnable { flushTask = null; flushLocation() }; flushTask = task; main.postDelayed(task, delay); return
        }
        val value = pending ?: return
        if (lastSent?.distanceTo(value)?.let { it < 10 && System.currentTimeMillis() - lastSentAt < 30000 } == true) {
            val task = Runnable { flushTask = null; flushLocation() }; flushTask = task
            main.postDelayed(task, 30000 - (System.currentTimeMillis() - lastSentAt)); return
        }
        pending = null; lastSent = Location(value); lastSentAt = System.currentTimeMillis()
        val coordinates = JSONObject().put("latitude", value.latitude).put("longitude", value.longitude)
            .put("accuracy", value.accuracy.toDouble()).put("coordinateSystem", "wgs84")
        if (!raw(JSONObject().put("type", "location.point").put("sessionId", locationId).put("sequence", ++sequence).put("point", coordinates))) failSocket()
    }
    @JvmStatic fun clearLocation(id: Int) { main.post { if (id == watchId) stopLocation(false) } }
    private fun stopLocation(signal: Boolean) {
        val id = locationId
        deferred.keys.filter { it.startsWith("location.") && it.endsWith(":$id") }.forEach(deferred::remove)
        if (signal && id.isNotEmpty()) raw(JSONObject().put("type", "location.leave").put("sessionId", id))
        if (watching) {
            watching = false
            listener?.let { try { manager?.removeUpdates(it) } catch (_: Exception) {} }
            if (signal) deliver(JSONObject().put("type", "location.ended").put("sessionId", id).put("reason", "left"))
        }
        locationId = ""; locationRoute = ""; listener = null; manager = null; watchCallback = null
        point = null; pending = null; lastSent = null
        locationDeadline?.let(main::removeCallbacks); locationDeadline = null
        flushTask?.let(main::removeCallbacks); flushTask = null
        // Avoid recursion from updateService -> failSocket -> stopLocation.
        if (RealtimeService.running) updateServiceWithoutSocketClose()
        if (!foreground && callId.isEmpty() && !watching && !messagesEnabled() && socket != null && !closing) failSocket(1000, true)
    }
    private fun updateServiceWithoutSocketClose() {
        val ctx = context ?: return
        if (callId.isEmpty() && !watching && !messagesEnabled()) ctx.stopService(Intent(ctx, RealtimeService::class.java))
        else updateService()
    }
}
