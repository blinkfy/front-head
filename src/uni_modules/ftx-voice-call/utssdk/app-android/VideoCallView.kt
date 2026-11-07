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
import org.webrtc.VideoSink
import org.webrtc.VideoTrack
import java.util.concurrent.atomic.AtomicBoolean

// Dedicated native Activity owns both renderers and system picture-in-picture.
// All methods are called on the Android main thread.
internal class VideoCallView(
    private val activity: Activity, private val egl: EglBase.Context,
    private val localTrack: VideoTrack, private val peerName: String,
    private val onControl: (JSONObject) -> Unit, private val onHangup: () -> Unit
) {
    private val main = Handler(Looper.getMainLooper())
    private val chrome = mutableListOf<View>()
    private var stage: FrameLayout? = null
    private var mainFrameWidth = 0
    private var mainFrameHeight = 0
    private var previewFrameWidth = 0
    private var previewFrameHeight = 0
    private var mainRenderer: SurfaceViewRenderer? = null
    private var previewRenderer: SurfaceViewRenderer? = null
    private var remoteTrack: VideoTrack? = null
    private var remoteSink: VideoSink? = null
    private var localSink: SurfaceViewRenderer? = null
    private var mainPlaceholder: TextView? = null
    private var previewPlaceholder: TextView? = null
    private var preview: FrameLayout? = null
    private var mainTapTarget: View? = null
    private var heading: LinearLayout? = null
    private var audioInfo: LinearLayout? = null
    private var audioStatus: TextView? = null
    private var status: TextView? = null
    private var muteButton: CallAction? = null
    private var speakerButton: CallAction? = null
    private var cameraButton: CallAction? = null
    private var switchButton: CallAction? = null
    private var recordButton: TextView? = null
    private var recordingBadge: TextView? = null
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
    private var frontCamera = true
    private var firstRemoteFrame = false
    private var selfIsMain = false
    private var controlsHidden = false
    private var inPip = false
    private val showSelfInMain get() = cameraEnabled && (!remoteCameraEnabled || (selfIsMain && !inPip))
    private val hasVideo get() = cameraEnabled || remoteCameraEnabled
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
                recordingBadge?.text = "● 录音中 · %02d:%02d".format(seconds / 60, seconds % 60)
            }
            audioStatus?.text = status?.text
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
    private fun rendererEvents(small: Boolean) = object : RendererCommon.RendererEvents {
        override fun onFirstFrameRendered() {}
        override fun onFrameResolutionChanged(width: Int, height: Int, rotation: Int) {
            val rotatedWidth = if (rotation % 180 == 0) width else height
            val rotatedHeight = if (rotation % 180 == 0) height else width
            main.post {
                if (!released) {
                    if (small) { previewFrameWidth = rotatedWidth; previewFrameHeight = rotatedHeight }
                    else { mainFrameWidth = rotatedWidth; mainFrameHeight = rotatedHeight }
                    layoutVideo()
                }
            }
        }
    }
    private fun layoutVideo() {
        val root = stage ?: return
        if (root.width <= 0 || root.height <= 0) return
        fun fit(view: View?, width: Int, height: Int, maxWidth: Int, maxHeight: Int, gravity: Int) {
            if (view == null || width <= 0 || height <= 0) return
            val scale = minOf(maxWidth.toDouble() / width, maxHeight.toDouble() / height)
            val targetWidth = (width * scale).toInt().coerceAtLeast(1)
            val targetHeight = (height * scale).toInt().coerceAtLeast(1)
            val params = view.layoutParams as FrameLayout.LayoutParams
            if (params.width == targetWidth && params.height == targetHeight && params.gravity == gravity) return
            params.width = targetWidth; params.height = targetHeight; params.gravity = gravity
            view.layoutParams = params
        }
        // SurfaceViewRenderer's scaling flag only affects measurement. MATCH_PARENT
        // still forces a portrait EGL viewport, which crops a landscape frame.
        fit(mainRenderer, mainFrameWidth, mainFrameHeight, root.width, root.height, Gravity.CENTER)
        fit(preview, previewFrameWidth, previewFrameHeight,
            minOf(dp(144), (root.width * 0.32).toInt()).coerceAtLeast(1),
            minOf(dp(160), (root.height * 0.3).toInt()).coerceAtLeast(1), Gravity.TOP or Gravity.END)
    }
    fun show() {
        check(!activity.isFinishing && !activity.isDestroyed)
        val root = FrameLayout(activity).apply { setBackgroundColor(Color.rgb(16, 25, 22)) }
        stage = root
        root.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) layoutVideo()
        }
        mainRenderer = SurfaceViewRenderer(activity).apply {
            init(egl, rendererEvents(false))
            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
            root.addView(this, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        }
        mainPlaceholder = text("正在等待对方画面", 16f).also { root.addView(it, FrameLayout.LayoutParams(-1, -1)) }
        mainTapTarget = View(activity).apply {
            isFocusable = true
            setOnClickListener { controlsHidden = !controlsHidden; refreshChrome() }
            root.addView(this, FrameLayout.LayoutParams(-1, -1))
        }
        audioInfo = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(dp(24), 0, dp(24), 0)
            addView(text(peerName, 26f))
            addView(text("语音通话中", 15f), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
            audioStatus = text("正在连接…", 15f).also {
                addView(it, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            }
            root.addView(this, FrameLayout.LayoutParams(-1, -1))
        }

        val heading = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        this.heading = heading
        heading.addView(text(peerName, 20f).apply { setShadowLayer(5f, 0f, 1f, Color.BLACK) })
        status = text("正在连接…").apply { setShadowLayer(5f, 0f, 1f, Color.BLACK) }
        heading.addView(status)
        root.addView(heading, FrameLayout.LayoutParams(-1, dp(74), Gravity.TOP).apply { topMargin = dp(18) })
        chrome.add(heading)

        preview = FrameLayout(activity).apply {
            setBackgroundColor(Color.rgb(35, 54, 45))
            isFocusable = true
            setOnClickListener { selfIsMain = !selfIsMain; bindVideo(); refresh() }
            previewRenderer = SurfaceViewRenderer(activity).also { renderer ->
                renderer.init(egl, rendererEvents(true))
                renderer.setZOrderMediaOverlay(true)
                renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                addView(renderer, FrameLayout.LayoutParams(-1, -1))
            }
            previewPlaceholder = text("摄像头已关闭", 12f).also { addView(it, FrameLayout.LayoutParams(-1, -1)) }
            root.addView(this, FrameLayout.LayoutParams(dp(96), dp(128), Gravity.TOP or Gravity.END).apply {
                topMargin = dp(72); rightMargin = dp(12)
            })
        }

        val controls = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(dp(10), 0, dp(10), dp(12))
        }
        val tools = LinearLayout(activity).apply { gravity = Gravity.CENTER }
        recordButton = text("开始录音", 13f).apply {
            visibility = View.GONE
            background = background(Color.argb(184, 29, 45, 37), 14)
            setOnClickListener { onControl(JSONObject().put("recordingEnabled", !recording)) }
        }
        controls.addView(recordButton, LinearLayout.LayoutParams(dp(154), dp(36)).apply { bottomMargin = dp(8) })
        controls.addView(tools, LinearLayout.LayoutParams(-1, dp(70)))
        fun button(kind: String, label: String, danger: Boolean = false, action: () -> Unit): CallAction {
            val view = CallAction(activity, kind, label, danger, action)
            tools.addView(view, LinearLayout.LayoutParams(0, -1, 1f))
            return view
        }
        muteButton = button("mic", "静音") { onControl(JSONObject().put("muted", !muted)) }
        speakerButton = button("speaker", "免提") { onControl(JSONObject().put("speaker", !speaker)) }
        cameraButton = button("camera", "关闭摄像头") { onControl(JSONObject().put("cameraEnabled", !cameraEnabled)) }
        switchButton = button("switch", "切换镜头") { onControl(JSONObject().put("switchCamera", true)) }
        button("hangup", "挂断", danger = true) { if (!released) onHangup() }
        root.addView(controls, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        chrome.add(controls)
        val minimize = text("最小化", 13f).apply {
            setOnClickListener { (activity as? VideoCallActivity)?.minimize() }; contentDescription = "最小化通话"
            background = background(Color.argb(184, 29, 45, 37), 14)
        }
        root.addView(minimize, FrameLayout.LayoutParams(dp(76), dp(38), Gravity.TOP or Gravity.END).apply { topMargin = dp(24); rightMargin = dp(12) })
        chrome.add(minimize)
        recordingBadge = text("● 录音中", 12f).apply {
            background = background(Color.argb(170, 23, 35, 31), 9)
            setTextColor(Color.rgb(255, 204, 204))
            setPadding(dp(8), dp(4), dp(8), dp(4))
            root.addView(this, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply { topMargin = dp(16); leftMargin = dp(12) })
        }
        activity.setContentView(root)
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        bindVideo(); refresh(); main.post(ticker)
    }
    fun setPip(value: Boolean) {
        if (inPip == value) return
        val wasSelf = showSelfInMain
        inPip = value
        if (wasSelf != showSelfInMain) bindVideo()
        layoutVideo(); refresh()
    }
    fun setRemoteTrack(track: VideoTrack?) {
        if (released || track === remoteTrack) return
        remoteSink?.let { remoteTrack?.removeSink(it) }
        remoteSink = null
        remoteTrack = track
        bindVideo()
        refresh()
    }
    private fun bindVideo() {
        val large = mainRenderer ?: return
        val small = previewRenderer ?: return
        // Keep the surfaces in their original Z-order and route frames to the new slots.
        localSink?.let { localTrack.removeSink(it) }
        remoteSink?.let { remoteTrack?.removeSink(it) }
        firstRemoteFrame = false
        large.clearImage()
        small.clearImage()
        val self = if (showSelfInMain) large else small
        val other = if (showSelfInMain) small else large
        self.setMirror(frontCamera)
        other.setMirror(false)
        localSink = self
        localTrack.addSink(self)
        remoteSink = remoteTrack?.let { track ->
            val firstFrame = AtomicBoolean(true)
            val sink = object : VideoSink {
                override fun onFrame(frame: org.webrtc.VideoFrame) {
                    other.onFrame(frame)
                    if (firstFrame.getAndSet(false)) main.post {
                        if (!released && remoteSink === this) { firstRemoteFrame = true; refresh() }
                    }
                }
            }
            track.addSink(sink)
            sink
        }
    }
    fun update(muted: Boolean, speaker: Boolean, camera: Boolean, remoteCamera: Boolean, front: Boolean, connected: Boolean = false,
               canSwitch: Boolean = false, recordingState: JSONObject? = null) {
        if (released) return
        val wasSelf = showSelfInMain
        this.canSwitchCamera = canSwitch; this.muted = muted; this.speaker = speaker; cameraEnabled = camera; remoteCameraEnabled = remoteCamera
        if (wasSelf != showSelfInMain) bindVideo()
        if (connected && connectedAt == 0L) connectedAt = SystemClock.elapsedRealtime()
        recordingSupported = recordingState?.optBoolean("recordingSupported") == true
        recording = recordingState?.optBoolean("recording") == true
        recordingSince = recordingState?.optLong("recordingStartedAt") ?: 0L
        val error = recordingState?.optString("recordingError").orEmpty()
        if (error.isNotEmpty() && error != lastRecordingError) android.widget.Toast.makeText(activity, error, android.widget.Toast.LENGTH_SHORT).show()
        lastRecordingError = error
        frontCamera = front
        localSink?.setMirror(front)
        if (!cameraEnabled && !remoteCameraEnabled) controlsHidden = false
        refresh()
    }
    private fun refresh() {
        val selfLarge = showSelfInMain
        val remoteMessage = if (remoteCameraEnabled) "正在等待对方画面" else "对方已关闭摄像头"
        val mainEnabled = if (selfLarge) cameraEnabled else remoteCameraEnabled
        val previewEnabled = if (selfLarge) remoteCameraEnabled else cameraEnabled
        mainRenderer?.visibility = if (mainEnabled) View.VISIBLE else View.INVISIBLE
        previewRenderer?.visibility = if (previewEnabled) View.VISIBLE else View.INVISIBLE
        mainPlaceholder?.apply {
            text = if (selfLarge) "摄像头已关闭" else remoteMessage
            visibility = if (!hasVideo || (mainEnabled && (selfLarge || firstRemoteFrame))) View.GONE else View.VISIBLE
        }
        previewPlaceholder?.apply {
            text = if (selfLarge) remoteMessage else "摄像头已关闭"
            visibility = if (previewEnabled && (!selfLarge || firstRemoteFrame)) View.GONE else View.VISIBLE
        }
        muteButton?.update(if (muted) "麦克风已关闭" else "静音", muted, muted)
        speakerButton?.update(if (speaker) "免提已开启" else "免提", speaker)
        cameraButton?.update(if (cameraEnabled) "关闭摄像头" else "开启摄像头", cameraEnabled, !cameraEnabled)
        switchButton?.visibility = if (canSwitchCamera) View.VISIBLE else View.GONE
        switchButton?.isEnabled = cameraEnabled
        switchButton?.alpha = if (cameraEnabled) 1f else 0.4f
        recordButton?.visibility = if (recordingSupported && connectedAt != 0L) View.VISIBLE else View.GONE
        if (!recording) recordButton?.text = "开始录音"
        refreshChrome()
    }
    private fun refreshChrome() {
        for (view in chrome) view.visibility = if (inPip || controlsHidden) View.GONE else View.VISIBLE
        heading?.visibility = if (inPip || controlsHidden || !hasVideo) View.GONE else View.VISIBLE
        audioInfo?.visibility = if (hasVideo) View.GONE else View.VISIBLE
        preview?.visibility = if (!inPip && cameraEnabled && remoteCameraEnabled) View.VISIBLE else View.GONE
        preview?.contentDescription = if (showSelfInMain) "将对方画面放大" else "将自己画面放大"
        mainTapTarget?.visibility = if (inPip || !hasVideo) View.GONE else View.VISIBLE
        mainTapTarget?.contentDescription = if (controlsHidden) "显示通话控件" else "隐藏通话控件"
        recordingBadge?.visibility = if (!inPip && controlsHidden && recording) View.VISIBLE else View.GONE
    }
    fun release() {
        if (released) return
        released = true; main.removeCallbacks(ticker)
        try { localSink?.let { localTrack.removeSink(it) } } catch (_: Exception) {}
        try { remoteSink?.let { remoteTrack?.removeSink(it) } } catch (_: Exception) {}
        try { mainRenderer?.release() } catch (_: Exception) {}
        try { previewRenderer?.release() } catch (_: Exception) {}
        remoteTrack = null; localSink = null; remoteSink = null; mainRenderer = null; previewRenderer = null
        stage = null
        chrome.clear()
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
        icon.setImageDrawable(glyph); icon.setPadding(dp(11), dp(11), dp(11), dp(11))
        icon.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(if (danger) Color.rgb(200, 79, 75) else Color.argb(164, 25, 40, 33)) }
        addView(icon, LayoutParams(dp(46), dp(46)))
        caption.textSize = 12f; caption.setTextColor(Color.rgb(229, 238, 232)); caption.gravity = Gravity.CENTER
        caption.setShadowLayer(4f, 0f, 1f, Color.BLACK)
        addView(caption, LayoutParams(-1, dp(24)))
        caption.text = label; contentDescription = label
        setOnClickListener { if (isEnabled) action() }
        isFocusable = true
    }
    fun update(label: String, selected: Boolean, off: Boolean = false) {
        caption.text = label; contentDescription = label
        icon.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(if (selected) Color.argb(220, 46, 98, 71) else Color.argb(164, 25, 40, 33)) }
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
