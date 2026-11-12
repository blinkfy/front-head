package ftx.voice

import android.Manifest
import android.content.pm.PackageManager
import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import org.json.JSONObject

// Only a live authenticated invitation enables Accept. Public push links cannot
// create an identity, grant media access, or manufacture an acceptance gesture.
class CallNotificationActivity : Activity() {
    companion object {
        private var current: java.lang.ref.WeakReference<CallNotificationActivity>? = null
        fun finishForCall(id: String) { current?.get()?.let { if (it.call == id) it.finish() } }
    }
    private val main = Handler(Looper.getMainLooper())
    private var call = ""
    private var leaving = false
    private var unlocking = false
    private var unlockVersion = 0
    private var legacySequence = 100
    private var legacyRequest = -1
    private var legacyCall = ""
    private var legacyVersion = 0
    private var observed = false
    private lateinit var name: TextView
    private lateinit var avatar: CallAvatarView
    private lateinit var subtitle: TextView
    private lateinit var hint: TextView
    private lateinit var accept: Button
    private lateinit var reject: Button
    private lateinit var fallback: Button
    private lateinit var record: Button
    private var recordingSince = 0L
    private val recordTicker = object : Runnable {
        override fun run() {
            if (recordingSince == 0L || isFinishing) return
            val seconds = ((System.currentTimeMillis() - recordingSince) / 1000).coerceAtLeast(0)
            record.text = "停止录音 · %02d:%02d".format(seconds / 60, seconds % 60)
            main.postDelayed(this, 1000)
        }
    }
    private var observer: ((JSONObject?) -> Unit)? = null
    private val finishTask = Runnable { if (!isFinishing) finish() }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        current = java.lang.ref.WeakReference(this)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
        window.statusBarColor = Color.rgb(16, 35, 40); window.navigationBarColor = Color.rgb(16, 35, 40)
        render(); bind(intent)
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) answerFromNotification()
    }
    override fun onNewIntent(value: Intent) { super.onNewIntent(value); intent = value; bind(value) }
    private fun bind(value: Intent) {
        val data = value.data
        val id = value.getStringExtra("callId") ?: if (data?.scheme == "fentouxia" && data.host == "incoming-call") data.lastPathSegment else null
        if (id == null || !Regex("^[A-Za-z0-9_-]{12,80}$").matches(id)) { finish(); return }
        observer?.let { RealtimeBridge.unobserveIncoming(it) }
        unlockVersion++; legacyRequest = -1
        call = id; leaving = false; unlocking = false; observed = false
        hideRecording()
        main.removeCallbacks(finishTask)
        val listener: (JSONObject?) -> Unit = { update(it) }
        observer = listener; RealtimeBridge.observeIncoming(call, listener)
        if (!observed) {
            name.text = "分投侠来电"; subtitle.text = "打开应用确认来电状态"
            avatar.visibility = View.GONE; avatar.setPeer("分投侠", "")
            hint.text = "已结束的来电不会接通"
            accept.visibility = View.GONE; reject.text = "关闭"; fallback.visibility = View.VISIBLE
            main.postDelayed(finishTask, 30000)
        }
        if (hasWindowFocus()) answerFromNotification()
    }
    private fun answerFromNotification() {
        val token = intent.getStringExtra(RealtimeNotifications.ANSWER_TOKEN_EXTRA) ?: return
        intent.removeExtra(RealtimeNotifications.ANSWER_TOKEN_EXTRA)
        if (RealtimeBridge.incomingPending(call) && RealtimeNotifications.consumeAnswerAction(call, token)) answer()
    }
    private fun update(event: JSONObject?) {
        if (isFinishing || leaving) return
        if (event == null || event.optString("callId") != call) {
            if (observed) ended()
            return
        }
        observed = true
        val peer = event.optJSONObject("peer")
        val peerName = peer?.optString("name", "联系人")?.take(80) ?: "联系人"
        name.text = peerName
        avatar.setPeer(peerName, RealtimeBridge.incomingAvatar(peer)); avatar.visibility = View.VISIBLE
        if (event.optString("type") == "voice.native") {
            unlocking = false
            val connected = event.optString("phase") == "connected"
            subtitle.text = if (connected) "通话中" else "正在连接…"
            hint.text = if (event.optBoolean("speaker")) "免提播放" else "听筒 / 耳机播放"
            accept.visibility = View.VISIBLE; accept.isEnabled = true
            accept.text = if (event.optBoolean("muted")) "取消静音" else "静音"
            accept.setOnClickListener { RealtimeBridge.controlNative(call, JSONObject().put("muted", !event.optBoolean("muted")).toString()) }
            reject.text = "挂断"
            fallback.visibility = View.VISIBLE
            fallback.text = if (event.optBoolean("speaker")) "关闭免提" else "开启免提"
            fallback.setOnClickListener { RealtimeBridge.controlNative(call, JSONObject().put("speaker", !event.optBoolean("speaker")).toString()) }
            hideRecording()
            if (connected && event.optBoolean("recordingSupported")) {
                val recording = event.optBoolean("recording")
                record.visibility = View.VISIBLE
                record.text = if (recording) "停止录音" else "开始录音"
                record.setOnClickListener { RealtimeBridge.controlNative(call, JSONObject().put("recordingEnabled", !recording).toString()) }
                recordingSince = event.optLong("recordingStartedAt")
                if (recording) recordTicker.run()
                event.optString("recordingError").takeIf { it.isNotEmpty() }?.let { hint.text = it }
            }
            if (connected) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            return
        }
        val video = event.optString("mode") == "video"
        subtitle.text = if (video) "邀请你视频通话" else "邀请你语音通话"
        hint.text = "接听后开始通话"
        accept.text = if (video) "接听视频" else "接听语音"
        accept.visibility = View.VISIBLE; accept.isEnabled = !unlocking
        accept.setOnClickListener { answer() }
        reject.text = "拒绝"; fallback.visibility = View.GONE
        hideRecording()
    }
    private fun hideRecording() {
        record.visibility = View.GONE
        recordingSince = 0L
        main.removeCallbacks(recordTicker)
    }
    private fun ended() {
        unlockVersion++; legacyRequest = -1
        unlocking = false; accept.isEnabled = false; accept.visibility = View.GONE; fallback.visibility = View.GONE
        hideRecording()
        subtitle.text = "通话已结束"; hint.text = ""; reject.text = "关闭"
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        main.removeCallbacks(finishTask); main.postDelayed(finishTask, 1200)
    }
    private fun answer() {
        if (unlocking || leaving) return
        if (!RealtimeBridge.incomingPending(call)) { ended(); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            accept.isEnabled = false
            if (!RealtimeBridge.answerNative(this, call)) ended()
            return
        }
        // First-use permissions still use the established visible App permission flow.
        unlocking = true; accept.isEnabled = false; hint.text = "授权后继续接听…"
        val requestedCall = call; val version = ++unlockVersion
        val keyguard = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (!keyguard.isKeyguardLocked) { completeAnswer(requestedCall, version); return }
        try {
        if (Build.VERSION.SDK_INT >= 26) {
            keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() { completeAnswer(requestedCall, version) }
                override fun onDismissCancelled() { if (currentUnlock(requestedCall, version)) resetUnlock() }
                override fun onDismissError() { if (currentUnlock(requestedCall, version)) resetUnlock() }
            })
        } else {
            val credential = keyguard.createConfirmDeviceCredentialIntent("接听分投侠来电", "解锁后继续接听")
            if (credential != null) {
                legacyRequest = ++legacySequence; legacyCall = requestedCall; legacyVersion = version
                startActivityForResult(credential, legacyRequest)
            } else { window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD); completeAnswer(requestedCall, version) }
        }
        } catch (_: Exception) { resetUnlock(); hint.text = "请解锁手机后接听" }
    }
    private fun currentUnlock(id: String, version: Int) = unlocking && call == id && unlockVersion == version &&
        !isFinishing && !isDestroyed && !leaving
    private fun completeAnswer(id: String, version: Int) {
        if (!currentUnlock(id, version)) return
        if (!RealtimeBridge.acceptIncomingFromScreen(id)) { ended(); return }
        openApp(true)
    }
    @Deprecated("Deprecated in Android")
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        if (request == legacyRequest && currentUnlock(legacyCall, legacyVersion)) {
            legacyRequest = -1
            if (result == RESULT_OK) completeAnswer(legacyCall, legacyVersion) else resetUnlock()
        }
    }
    private fun resetUnlock() {
        if (isFinishing || isDestroyed) return
        unlockVersion++; legacyRequest = -1; unlocking = false
        if (!RealtimeBridge.incomingPending(call)) ended()
        else { accept.isEnabled = true; hint.text = "解锁授权后即可接听" }
    }
    private fun openApp(accepted: Boolean) {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch == null) { RealtimeBridge.cancelIncomingAcceptance(call); resetUnlock(); return }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launch.putExtra("ftx_realtime_route", "/pages-nonTheme/voice-call?incomingCallId=$call")
        try {
            leaving = true
            startActivity(launch)
            if (accepted) RealtimeNotifications.cancelIncoming(this, call)
            finish()
        }
        catch (_: Exception) {
            leaving = false
            if (accepted) RealtimeBridge.cancelIncomingAcceptance(call)
            resetUnlock(); hint.text = "暂时无法打开通话，请重试"
        }
    }
    private fun render() {
        val scroll = ScrollView(this).apply { isFillViewport = true; setBackgroundColor(Color.rgb(16, 35, 40)) }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(28), dp(40), dp(28), dp(32)) }
        scroll.addView(root, FrameLayout.LayoutParams(-1, -1))
        fun label(text: String, size: Float, color: Int) = TextView(this).apply {
            this.text = text; textSize = size; setTextColor(color); gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(10))
        }
        val white = Color.rgb(241, 248, 247); val muted = Color.rgb(167, 193, 192)
        root.addView(label("分投侠 · 来电", 16f, muted))
        avatar = CallAvatarView(this).apply { visibility = View.GONE }
        root.addView(avatar, LinearLayout.LayoutParams(dp(88), dp(88)).apply { topMargin = dp(24) })
        name = label("联系人", 30f, white).apply { typeface = Typeface.DEFAULT_BOLD; maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END }
        root.addView(name, LinearLayout.LayoutParams(-1, -2))
        subtitle = label("", 18f, muted); root.addView(subtitle)
        root.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        hint = label("", 14f, muted); root.addView(hint, LinearLayout.LayoutParams(-1, -2))
        fun button(text: String, color: Int, click: () -> Unit) = Button(this).apply {
            this.text = text; textSize = 18f; isAllCaps = false; setTextColor(Color.WHITE); minHeight = dp(60)
            background = GradientDrawable().apply { setColor(color); cornerRadius = dp(30).toFloat() }
            setPadding(dp(12), dp(12), dp(12), dp(12)); setOnClickListener { click() }
        }
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        reject = button("拒绝", Color.rgb(167, 66, 65)) {
            if (RealtimeBridge.isNativeCall(call)) RealtimeBridge.controlNative(call, "{\"hangup\":true}")
            else if (RealtimeBridge.incomingPending(call)) RealtimeBridge.rejectIncomingFromScreen(call)
            finish()
        }
        accept = button("接听", Color.rgb(23, 134, 101)) { answer() }
        actions.addView(reject, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = dp(8) })
        actions.addView(accept, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(8) })
        root.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(20) })
        fallback = button("打开应用", Color.rgb(40, 103, 143)) { openApp(false) }
        root.addView(fallback, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })
        record = button("开始录音", Color.rgb(45, 84, 72)) {}.apply { visibility = View.GONE }
        root.addView(record, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        setContentView(scroll)
    }
    @Deprecated("Deprecated in Android") override fun onBackPressed() {
        if (RealtimeBridge.isNativeCall(call)) moveTaskToBack(true) else finish()
    }
    override fun onDestroy() {
        if (current?.get() === this) current = null
        observer?.let { RealtimeBridge.unobserveIncoming(it) }; observer = null
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
