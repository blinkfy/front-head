package ftx.voice

import android.app.Activity
import android.app.Dialog
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
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
    private var muteButton: CallAction? = null
    private var speakerButton: CallAction? = null
    private var cameraButton: CallAction? = null
    private var switchButton: CallAction? = null
    private var recordButton: TextView? = null
    private var recording = false
    private var recordingSince = 0L
    private var recordingSupported = false
    private var lastRecordingError = ""
    private var canSwitchCamera = false
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
            if (recording) {
                val seconds = ((System.currentTimeMillis() - recordingSince) / 1000).coerceAtLeast(0)
                recordButton?.text = "停止录音 · %02d:%02d".format(seconds / 60, seconds % 60)
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
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(dp(16), dp(20), dp(16), dp(24)); setBackgroundColor(Color.argb(225, 23, 35, 31))
        }
        val tools = LinearLayout(activity).apply { gravity = Gravity.CENTER }
        recordButton = text("开始录音", 13f).apply {
            visibility = View.GONE
            background = background(Color.rgb(43, 66, 54), 14)
            setOnClickListener { onControl(JSONObject().put("recordingEnabled", !recording)) }
        }
        controls.addView(recordButton, LinearLayout.LayoutParams(dp(154), dp(36)).apply { bottomMargin = dp(8) })
        controls.addView(tools, LinearLayout.LayoutParams(-1, dp(88)))
        fun button(kind: String, label: String, action: () -> Unit): CallAction {
            val view = CallAction(activity, kind, label, false, action)
            tools.addView(view, LinearLayout.LayoutParams(0, -1, 1f))
            return view
        }
        muteButton = button("mic", "静音") { onControl(JSONObject().put("muted", !muted)) }
        speakerButton = button("speaker", "免提") { onControl(JSONObject().put("speaker", !speaker)) }
        cameraButton = button("camera", "关闭摄像头") { onControl(JSONObject().put("cameraEnabled", !cameraEnabled)) }
        switchButton = button("switch", "切换镜头") { onControl(JSONObject().put("switchCamera", true)) }
        val hangup = CallAction(activity, "hangup", "挂断", true) { if (!released) onHangup() }
        controls.addView(hangup, LinearLayout.LayoutParams(dp(96), dp(88)).apply { topMargin = dp(18); gravity = Gravity.CENTER_HORIZONTAL })
        root.addView(controls, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
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
    fun update(muted: Boolean, speaker: Boolean, camera: Boolean, remoteCamera: Boolean, front: Boolean, connected: Boolean = false,
               canSwitch: Boolean = false, recordingState: JSONObject? = null) {
        if (released) return
        this.canSwitchCamera = canSwitch; this.muted = muted; this.speaker = speaker; cameraEnabled = camera; remoteCameraEnabled = remoteCamera
        if (connected && connectedAt == 0L) connectedAt = SystemClock.elapsedRealtime()
        recordingSupported = recordingState?.optBoolean("recordingSupported") == true
        recording = recordingState?.optBoolean("recording") == true
        recordingSince = recordingState?.optLong("recordingStartedAt") ?: 0L
        val error = recordingState?.optString("recordingError").orEmpty()
        if (error.isNotEmpty() && error != lastRecordingError) android.widget.Toast.makeText(activity, error, android.widget.Toast.LENGTH_SHORT).show()
        lastRecordingError = error
        local?.setMirror(front); refresh()
    }
    private fun refresh() {
        local?.visibility = if (cameraEnabled) View.VISIBLE else View.INVISIBLE
        localPlaceholder?.visibility = if (cameraEnabled) View.GONE else View.VISIBLE
        remote?.visibility = if (remoteCameraEnabled) View.VISIBLE else View.INVISIBLE
        remotePlaceholder?.visibility = if (remoteCameraEnabled && firstRemoteFrame) View.GONE else View.VISIBLE
        remotePlaceholder?.text = if (remoteCameraEnabled) "正在等待对方画面" else "对方已关闭摄像头"
        if (!cameraEnabled && !remoteCameraEnabled) {
            remotePlaceholder?.text = peerName.take(1) + "\n语音通话中"
            remotePlaceholder?.textSize = 28f
        } else remotePlaceholder?.textSize = 16f
        muteButton?.update(if (muted) "麦克风已关闭" else "静音", muted, muted)
        speakerButton?.update(if (speaker) "免提已开启" else "免提", speaker)
        cameraButton?.update(if (cameraEnabled) "关闭摄像头" else "开启摄像头", cameraEnabled, !cameraEnabled)
        switchButton?.visibility = if (canSwitchCamera) View.VISIBLE else View.GONE
        switchButton?.isEnabled = cameraEnabled
        switchButton?.alpha = if (cameraEnabled) 1f else 0.4f
        recordButton?.visibility = if (recordingSupported && connectedAt != 0L) View.VISIBLE else View.GONE
        if (!recording) recordButton?.text = "开始录音"
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

// Same round controls and line icons as the shared web/voice call page.
private class CallAction(activity: Activity, kind: String, label: String, danger: Boolean, action: () -> Unit) : LinearLayout(activity) {
    private val density = resources.displayMetrics.density
    private fun dp(value: Int) = (value * density).toInt()
    private val glyph = CallGlyph(kind)
    private val icon = ImageView(activity)
    private val caption = TextView(activity)
    init {
        orientation = VERTICAL; gravity = Gravity.CENTER
        icon.setImageDrawable(glyph); icon.setPadding(dp(15), dp(15), dp(15), dp(15))
        icon.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(if (danger) Color.rgb(200, 79, 75) else Color.rgb(44, 61, 52)) }
        addView(icon, LayoutParams(dp(60), dp(60)))
        caption.textSize = 12f; caption.setTextColor(Color.rgb(229, 238, 232)); caption.gravity = Gravity.CENTER
        addView(caption, LayoutParams(-1, dp(26)))
        caption.text = label; contentDescription = label
        setOnClickListener { if (isEnabled) action() }
        isFocusable = true
    }
    fun update(label: String, selected: Boolean, off: Boolean = false) {
        caption.text = label; contentDescription = label
        icon.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(if (selected) Color.rgb(52, 92, 69) else Color.rgb(44, 61, 52)) }
        glyph.off = off; glyph.invalidateSelf()
    }
}
private class CallGlyph(private val kind: String) : Drawable() {
    var off = false
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(229, 238, 232); strokeWidth = 2f; style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    override fun draw(canvas: Canvas) {
        canvas.save(); canvas.translate(bounds.left.toFloat(), bounds.top.toFloat()); canvas.scale(bounds.width() / 30f, bounds.height() / 30f)
        paint.style = Paint.Style.STROKE
        when (kind) {
            "mic" -> {
                canvas.drawRoundRect(RectF(11f, 3f, 19f, 20f), 5f, 5f, paint)
                canvas.drawArc(RectF(7f, 7f, 23f, 24f), 0f, 180f, false, paint)
                canvas.drawLine(15f, 24f, 15f, 28f, paint)
            }
            "speaker" -> {
                val p = Path().apply { moveTo(4f, 11f); lineTo(10f, 11f); lineTo(17f, 5f); lineTo(17f, 25f); lineTo(10f, 19f); lineTo(4f, 19f); close() }
                canvas.drawPath(p, paint); canvas.drawArc(RectF(15f, 6f, 27f, 24f), -60f, 120f, false, paint)
            }
            "camera", "switch" -> {
                canvas.drawRoundRect(RectF(3f, 7f, if (kind == "camera") 20f else 27f, 23f), 3f, 3f, paint)
                if (kind == "camera") {
                    val p = Path().apply { moveTo(20f, 12f); lineTo(27f, 8f); lineTo(27f, 22f); lineTo(20f, 18f) }
                    canvas.drawPath(p, paint)
                } else {
                    canvas.drawLine(10f, 12f, 20f, 12f, paint); canvas.drawLine(20f, 12f, 17f, 9f, paint)
                    canvas.drawLine(20f, 18f, 10f, 18f, paint); canvas.drawLine(10f, 18f, 13f, 21f, paint)
                }
            }
            "hangup" -> {
                canvas.drawArc(RectF(4f, 9f, 26f, 26f), 200f, 140f, false, paint)
                canvas.drawLine(5f, 14f, 5f, 21f, paint); canvas.drawLine(25f, 14f, 25f, 21f, paint)
            }
        }
        if (off) canvas.drawLine(4f, 3f, 27f, 27f, paint)
        canvas.restore()
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Android") override fun getOpacity() = PixelFormat.TRANSLUCENT
}
