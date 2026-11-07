package ftx.voice

import android.Manifest
import android.app.AlertDialog
import android.app.Activity
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
        fun minimizeCurrent(id: String) { current?.get()?.let { host -> host.runOnUiThread { if (host.attachedCallId == id) host.minimize() } } }
        fun finishCall(id: String) { current?.get()?.let { if (it.attachedCallId == id) { it.released = true; it.finish() } } }
    }
    private var attachedCallId = ""
    private var released = false
    private var enteringPip = false
    private var resumed = false
    private var cameraRequestPending = false
    private var cameraAction: (() -> Unit)? = null
    fun withCameraPermission(id: String, action: () -> Unit) {
        if (released || id != attachedCallId || current?.get() !== this || isFinishing || isDestroyed || cameraRequestPending) return
        cameraAction = action
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { drainCameraAction(); return }
        cameraRequestPending = true
        try { requestPermissions(arrayOf(Manifest.permission.CAMERA), 2702) }
        catch (_: Exception) { cameraRequestPending = false; cameraAction = null; cameraSettings() }
    }
    private fun drainCameraAction() {
        if (!resumed || released || isFinishing || isDestroyed || current?.get() !== this ||
            checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return
        val action = cameraAction; cameraAction = null; action?.invoke()
    }
    private fun cameraSettings() {
        if (released || isFinishing || isDestroyed) return
        AlertDialog.Builder(this).setTitle("需要相机权限")
            .setMessage("语音通话会继续。请在应用设置中允许相机权限，返回后再次点击打开镜头。")
            .setNegativeButton("取消", null).setPositiveButton("去设置") { _, _ ->
                if (!released && !isFinishing && !isDestroyed) try {
                    startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:$packageName")))
                } catch (_: Exception) { Toast.makeText(this, "请在系统设置中开启相机权限", Toast.LENGTH_SHORT).show() }
            }.show()
    }
    @Deprecated("Deprecated in Android")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode != 2702) return
        cameraRequestPending = false
        if (released || isFinishing || isDestroyed) { cameraAction = null; return }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) window.decorView.post { drainCameraAction() }
        else {
            cameraAction = null
            if (!shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) cameraSettings()
            else Toast.makeText(this, "未开启相机，语音通话继续，可再次点击打开镜头", Toast.LENGTH_SHORT).show()
        }
    }
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
        resumed = true
        window.decorView.post { drainCameraAction() }
        if (!released && attachedCallId.isNotEmpty()) { current = WeakReference(this); visible = true; RealtimeBridge.setForeground(true) }
    }
    override fun onPause() {
        resumed = false
        if (!cameraRequestPending && current?.get() === this) { visible = false; RealtimeBridge.setForeground(false) }
        super.onPause()
    }
    fun minimize(returnToChat: Boolean = true) {
        if (released || current?.get() !== this || enteringPip || (Build.VERSION.SDK_INT >= 26 && isInPictureInPictureMode)) return
        if (!VoiceCallBridge.canPip(attachedCallId) || (RealtimeBridge.backgroundMask() and 1) == 0) {
            Toast.makeText(this, "接通且后台服务就绪后可最小化", Toast.LENGTH_SHORT).show(); return
        }
        if (Build.VERSION.SDK_INT >= 26 && packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) && VoiceCallBridge.canPip(attachedCallId)) {
            try {
                val stop = Intent(this, RealtimeService::class.java).putExtra("action", "hangup").putExtra("sessionId", attachedCallId).setData(android.net.Uri.parse("ftx-internal://call/hangup/$attachedCallId"))
                val action = RemoteAction(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "挂断", "挂断通话",
                    PendingIntent.getService(this, 2710, stop, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                enteringPip = true
                if (enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(3, 4)).setActions(listOf(action)).build())) {
                    if (returnToChat) RealtimeBridge.videoMinimized(this, attachedCallId)
                    RealtimeBridge.setForeground(false); return
                }
            } catch (_: Exception) {}
            enteringPip = false
        }
        if (returnToChat) {
            Toast.makeText(this, "小窗暂不可用，已最小化通话", Toast.LENGTH_SHORT).show()
            RealtimeBridge.videoMinimized(this, attachedCallId)
            released = true // Close this surface, keeping the peer/foreground service alive.
            finish()
        } else RealtimeBridge.setForeground(false)
    }
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!cameraRequestPending && !released && current?.get() === this) { minimize(false); RealtimeBridge.setForeground(false) }
    }
    @Deprecated("Deprecated in Android") override fun onBackPressed() { minimize() }
    override fun onPictureInPictureModeChanged(value: Boolean, config: Configuration) {
        super.onPictureInPictureModeChanged(value, config); enteringPip = false; VoiceCallBridge.pipChanged(attachedCallId, value)
    }
    // Stopping a surface during a PiP/fullscreen transition is not a hangup.
    // The explicit hangup action or a finishing Activity owns call cleanup.
    override fun onDestroy() {
        VoiceCallBridge.detachVideo(this, attachedCallId)
        cameraAction = null; cameraRequestPending = false
        if (current?.get() === this) { current = null; visible = false }
        if (!released && isFinishing && !isChangingConfigurations) VoiceCallBridge.videoClosed(attachedCallId)
        super.onDestroy()
    }
}
