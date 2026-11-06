package ftx.voice

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

// Dedicated native Activity owns both renderers and system picture-in-picture.
// All methods are called on the Android main thread.
internal class VideoCallView(
    private val activity: Activity, private val egl: EglBase.Context,
    private val localTrack: VideoTrack, private val peerName: String,
    private val onControl: (JSONObject) -> Unit, private val onHangup: () -> Unit
) {
    private val main = Handler(Looper.getMainLooper())
    private val pipHidden = mutableListOf<View>()
    private var local: SurfaceViewRenderer? = null
    private var remote: SurfaceViewRenderer? = null
    private var remoteTrack: VideoTrack? = null
    private var remotePlaceholder: TextView? = null
    private var localPlaceholder: TextView? = null
    private var status: TextView? = null
    private var muteButton: TextView? = null
    private var speakerButton: TextView? = null
    private var cameraButton: TextView? = null
    private var switchButton: TextView? = null
    private var released = false
    private var muted = false
    private var speaker = true
    private var cameraEnabled = true
    private var remoteCameraEnabled = true
    private var firstRemoteFrame = false
    private var connectedAt = 0L
    private val ticker = object : Runnable {
        override fun run() {
            if (released) return
            status?.text = if (connectedAt == 0L) "正在连接…" else {
                val seconds = (SystemClock.elapsedRealtime() - connectedAt) / 1000
                "%02d:%02d".format(seconds / 60, seconds % 60)
            }
            main.postDelayed(this, 1000)
        }
    }
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun text(value: String, size: Float = 14f) = TextView(activity).apply {
        text = value; textSize = size; setTextColor(Color.WHITE); gravity = Gravity.CENTER
    }
    private fun background(color: Int, radius: Int = 24) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
    }
    fun show() {
        check(!activity.isFinishing && !activity.isDestroyed)
        val root = FrameLayout(activity).apply { setBackgroundColor(Color.rgb(16, 25, 22)) }
        val renderer = SurfaceViewRenderer(activity)
        remote = renderer
        renderer.init(egl, object : RendererCommon.RendererEvents {
            override fun onFirstFrameRendered() { main.post { if (!released) { firstRemoteFrame = true; refresh() } } }
            override fun onFrameResolutionChanged(width: Int, height: Int, rotation: Int) {}
        })
        renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
        root.addView(renderer, FrameLayout.LayoutParams(-1, -1))
        remotePlaceholder = text("正在等待对方画面", 16f)
        root.addView(remotePlaceholder, FrameLayout.LayoutParams(-1, -1))

        val heading = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        heading.addView(text(peerName, 20f))
        status = text("正在连接…")
        heading.addView(status)
        root.addView(heading, FrameLayout.LayoutParams(-1, dp(74), Gravity.TOP).apply { topMargin = dp(18) })
        pipHidden.add(heading)

        val preview = FrameLayout(activity).apply { setBackgroundColor(Color.rgb(35, 54, 45)) }
        val self = SurfaceViewRenderer(activity)
        local = self
        self.init(egl, null); self.setZOrderMediaOverlay(true); self.setMirror(true)
        self.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
        preview.addView(self, FrameLayout.LayoutParams(-1, -1))
        localPlaceholder = text("摄像头已关闭", 12f)
        preview.addView(localPlaceholder, FrameLayout.LayoutParams(-1, -1))
        root.addView(preview, FrameLayout.LayoutParams(dp(104), dp(145), Gravity.TOP or Gravity.END).apply {
            topMargin = dp(104); rightMargin = dp(16)
        })
        localTrack.addSink(self)
        pipHidden.add(preview)

        val controls = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
            setPadding(dp(8), dp(16), dp(8), dp(24)); setBackgroundColor(Color.argb(215, 16, 25, 22))
        }
        fun button(label: String, danger: Boolean = false, action: () -> Unit): TextView {
            val view = text(label, 12f).apply {
                background = background(if (danger) Color.rgb(190, 70, 65) else Color.rgb(43, 66, 54))
                setOnClickListener { if (!released) action() }
                contentDescription = label
            }
            controls.addView(view, LinearLayout.LayoutParams(0, dp(54), 1f).apply { leftMargin = dp(4); rightMargin = dp(4) })
            return view
        }
        muteButton = button("静音") { onControl(JSONObject().put("muted", !muted)) }
        speakerButton = button("免提开") { onControl(JSONObject().put("speaker", !speaker)) }
        cameraButton = button("关闭镜头") { onControl(JSONObject().put("cameraEnabled", !cameraEnabled)) }
        switchButton = button("切换镜头") { onControl(JSONObject().put("switchCamera", true)) }
        button("挂断", true) { onHangup() }
        root.addView(controls, FrameLayout.LayoutParams(-1, dp(100), Gravity.BOTTOM))
        pipHidden.add(controls)
        val minimize = text("最小化", 13f).apply {
            setOnClickListener { (activity as? VideoCallActivity)?.minimize() }; contentDescription = "最小化通话"
            background = background(Color.rgb(43, 66, 54), 14)
        }
        root.addView(minimize, FrameLayout.LayoutParams(dp(76), dp(38), Gravity.TOP or Gravity.END).apply { topMargin = dp(24); rightMargin = dp(12) })
        pipHidden.add(minimize)
        activity.setContentView(root)
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        refresh(); main.post(ticker)
    }
    fun setPip(value: Boolean) { for (view in pipHidden) view.visibility = if (value) View.GONE else View.VISIBLE }
    fun setRemoteTrack(track: VideoTrack?) {
        if (released || track === remoteTrack) return
        remote?.let { renderer ->
            remoteTrack?.removeSink(renderer); remoteTrack = track; track?.addSink(renderer)
        }
    }
    fun update(muted: Boolean, speaker: Boolean, camera: Boolean, remoteCamera: Boolean, front: Boolean, connected: Boolean = false) {
        if (released) return
        this.muted = muted; this.speaker = speaker; cameraEnabled = camera; remoteCameraEnabled = remoteCamera
        if (connected && connectedAt == 0L) connectedAt = SystemClock.elapsedRealtime()
        local?.setMirror(front); refresh()
    }
    private fun refresh() {
        local?.visibility = if (cameraEnabled) View.VISIBLE else View.INVISIBLE
        localPlaceholder?.visibility = if (cameraEnabled) View.GONE else View.VISIBLE
        remote?.visibility = if (remoteCameraEnabled) View.VISIBLE else View.INVISIBLE
        remotePlaceholder?.visibility = if (remoteCameraEnabled && firstRemoteFrame) View.GONE else View.VISIBLE
        remotePlaceholder?.text = if (remoteCameraEnabled) "正在等待对方画面" else "对方已关闭摄像头"
        muteButton?.text = if (muted) "取消静音" else "静音"
        speakerButton?.text = if (speaker) "免提开" else "免提关"
        cameraButton?.text = if (cameraEnabled) "关闭镜头" else "打开镜头"
        switchButton?.isEnabled = cameraEnabled
        switchButton?.alpha = if (cameraEnabled) 1f else 0.4f
    }
    fun release() {
        if (released) return
        released = true; main.removeCallbacks(ticker)
        try { local?.let { localTrack.removeSink(it) } } catch (_: Exception) {}
        try { remote?.let { remoteTrack?.removeSink(it) } } catch (_: Exception) {}
        try { local?.release() } catch (_: Exception) {}
        try { remote?.release() } catch (_: Exception) {}
        remoteTrack = null; local = null; remote = null
        pipHidden.clear()
    }
}
