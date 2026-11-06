package ftx.voice

import android.app.Activity
import android.app.KeyguardManager
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.widget.Toast
import java.lang.ref.WeakReference

class VideoCallActivity : Activity() {
    companion object {
        private var current: WeakReference<VideoCallActivity>? = null
        @Volatile var visible = false; private set
        fun markLaunching() { visible = true }
        fun cancelLaunching() { visible = false }
        fun finishCall(id: String) { current?.get()?.let { if (it.attachedCallId == id) { it.released = true; it.finish() } } }
    }
    private var attachedCallId = ""
    private var released = false
    private var wasPip = false
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        // The dedicated video surface can stay above keyguard; the main App never gains this ability.
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        val id = intent.getStringExtra("callId") ?: ""
        if (!VoiceCallBridge.attachVideo(this, id)) { released = true; finish(); return }
        attachedCallId = id; current = WeakReference(this)
    }
    override fun onNewIntent(value: Intent) {
        super.onNewIntent(value)
        val id = value.getStringExtra("callId") ?: return
        if (id != attachedCallId && !VoiceCallBridge.attachVideo(this, id)) return
        intent = value; attachedCallId = id; current = WeakReference(this); released = false
    }
    override fun onResume() {
        super.onResume()
        if (!released && attachedCallId.isNotEmpty()) { current = WeakReference(this); visible = true; RealtimeBridge.setForeground(true) }
    }
    override fun onPause() {
        if (current?.get() === this) { visible = false; RealtimeBridge.setForeground(false) }
        super.onPause()
    }
    fun minimize() {
        if (released || current?.get() !== this) return
        if (!VoiceCallBridge.canPip(attachedCallId) || (RealtimeBridge.backgroundMask() and 1) == 0) {
            Toast.makeText(this, "接通且后台服务就绪后可最小化", Toast.LENGTH_SHORT).show(); return
        }
        if (Build.VERSION.SDK_INT >= 26 && packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) && VoiceCallBridge.canPip(attachedCallId)) {
            try {
                val stop = Intent(this, RealtimeService::class.java).putExtra("action", "hangup").putExtra("sessionId", attachedCallId).setData(android.net.Uri.parse("ftx-internal://call/hangup/$attachedCallId"))
                val action = RemoteAction(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "挂断", "挂断通话",
                    PendingIntent.getService(this, 2710, stop, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                if (enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(3, 4)).setActions(listOf(action)).build())) {
                    RealtimeBridge.setForeground(false); return
                }
            } catch (_: Exception) {}
        }
        Toast.makeText(this, "画中画不可用，通话可在后台继续", Toast.LENGTH_SHORT).show()
        moveTaskToBack(true); RealtimeBridge.setForeground(false)
    }
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!released && current?.get() === this) { minimize(); RealtimeBridge.setForeground(false) }
    }
    @Deprecated("Deprecated in Android") override fun onBackPressed() { minimize() }
    override fun onPictureInPictureModeChanged(value: Boolean, config: Configuration) {
        super.onPictureInPictureModeChanged(value, config); wasPip = value; VoiceCallBridge.pipChanged(attachedCallId, value)
    }
    override fun onStop() {
        super.onStop()
        val locked = (getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
        if (wasPip && !locked && !isChangingConfigurations && !released) VoiceCallBridge.videoClosed(attachedCallId)
    }
    override fun onDestroy() {
        if (current?.get() === this) { current = null; visible = false }
        if (!released && isFinishing && !isChangingConfigurations) VoiceCallBridge.videoClosed(attachedCallId)
        super.onDestroy()
    }
}
