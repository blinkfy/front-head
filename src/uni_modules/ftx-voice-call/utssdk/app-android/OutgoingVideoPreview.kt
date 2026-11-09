package ftx.voice

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.hardware.Camera
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import kotlin.math.abs

@Suppress("DEPRECATION")
object OutgoingVideoPreview {
    private val main = Handler(Looper.getMainLooper())
    private val cameraWorker = Executors.newSingleThreadExecutor()
    @Volatile private var active: Preview? = null
    private var requested: Pair<String, Any>? = null

    @JvmStatic fun show(activity: Activity, options: String, onCancel: () -> Unit): Boolean {
        val input = try { JSONObject(options) } catch (_: Exception) { return false }
        val id = input.optString("callId")
        if (id.isBlank() || activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return false
        val request = id to Any()
        synchronized(this) { requested = request }
        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed || !activity.window.decorView.isShown || RealtimeBridge.suspended()) return@runOnUiThread
            val container = activity.findViewById<FrameLayout>(android.R.id.content) ?: return@runOnUiThread
            synchronized(this) {
                if (requested !== request) return@runOnUiThread
                val previous = active
                if (previous?.id == id && previous.activity === activity && !previous.closing) return@runOnUiThread
                previous?.close()
                val preview = Preview(activity, id, input.optString("peerName", "联系人").take(80), onCancel)
                active = preview
                preview.attach(container)
            }
        }
        return true
    }

    @JvmStatic fun close(id: String) {
        val preview = synchronized(this) {
            if (requested?.first == id) requested = null
            active?.takeIf { it.id == id }
        }
        preview?.close()
    }

    // Called on the peer worker. Never open the RTC camera until the local-only camera is released.
    internal fun releaseBeforePeer(): Boolean {
        val preview = synchronized(this) {
            requested = null
            active
        } ?: return true
        return try { preview.close().get(1500, TimeUnit.MILLISECONDS); true } catch (_: Exception) { false }
    }

    private class Preview(val activity: Activity, val id: String, peerName: String, onCancel: () -> Unit) :
        TextureView.SurfaceTextureListener, Application.ActivityLifecycleCallbacks {
        @Volatile var closing = false; private set
        private var releaseTask: Future<*>? = null
        // Access Camera only from cameraWorker.
        private var camera: Camera? = null
        private var previewAspect = 0f
        private var cameraOpening = false
        private val frame = object : FrameLayout(activity) {
            override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
                super.onWindowFocusChanged(hasWindowFocus)
                if (hasWindowFocus) texture.surfaceTexture?.let(::startCamera)
            }
        }.apply {
            setBackgroundColor(Color.rgb(16, 25, 22))
            isClickable = true
        }
        private val texture = TextureView(activity).apply { surfaceTextureListener = this@Preview }
        private val status = label("正在打开相机…", 14f)

        init {
            frame.addView(texture, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
            frame.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> fitPreview() }
            val title = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setBackgroundColor(0x80202c27.toInt())
                setPadding(dp(16), dp(12), dp(16), dp(12))
                addView(label(peerName, 20f).apply { maxLines = 1; ellipsize = TextUtils.TruncateAt.END })
                addView(status)
            }
            frame.addView(title, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
            val cancel = Button(activity).apply {
                text = "取消呼叫"
                setTextColor(Color.WHITE)
                backgroundTintList = ColorStateList.valueOf(Color.rgb(196, 67, 66))
                setOnClickListener {
                    if (!closing && active === this@Preview) {
                        close()
                        onCancel()
                    }
                }
            }
            frame.addView(cancel, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(24) })
        }

        fun attach(container: FrameLayout) {
            activity.application.registerActivityLifecycleCallbacks(this)
            container.addView(frame, FrameLayout.LayoutParams(-1, -1))
        }

        private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
        private fun label(value: String, size: Float) = TextView(activity).apply {
            text = value; textSize = size; setTextColor(Color.WHITE); gravity = Gravity.CENTER
        }

        private fun fitPreview() {
            if (previewAspect <= 0f || frame.width == 0 || frame.height == 0) return
            val width = minOf(frame.width, (frame.height * previewAspect).toInt().coerceAtLeast(1))
            val height = minOf(frame.height, (width / previewAspect).toInt().coerceAtLeast(1))
            val params = texture.layoutParams as FrameLayout.LayoutParams
            if (params.width != width || params.height != height) {
                params.width = width; params.height = height; texture.layoutParams = params
            }
        }

        override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
            if (frame.hasWindowFocus()) startCamera(surface)
        }

        private fun startCamera(surface: SurfaceTexture) {
            if (closing || cameraOpening) return
            cameraOpening = true
            val degrees = when (activity.windowManager.defaultDisplay.rotation) {
                Surface.ROTATION_90 -> 90
                Surface.ROTATION_180 -> 180
                Surface.ROTATION_270 -> 270
                else -> 0
            }
            cameraWorker.execute {
                if (closing) return@execute
                try {
                    val info = Camera.CameraInfo()
                    val count = Camera.getNumberOfCameras()
                    val index = (0 until count).firstOrNull {
                        Camera.getCameraInfo(it, info); info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT
                    } ?: (0 until count).first()
                    Camera.getCameraInfo(index, info)
                    val rotation = if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT)
                        (360 - (info.orientation + degrees) % 360) % 360 else (info.orientation - degrees + 360) % 360
                    val device = Camera.open(index).also { camera = it }
                    if (closing) return@execute
                    device.setErrorCallback { _, _ -> close() }
                    val params = device.parameters
                    params.supportedPreviewSizes?.minByOrNull { abs(it.width - 640) + abs(it.height - 480) }?.let {
                        params.setPreviewSize(it.width, it.height)
                        device.parameters = params
                    }
                    val size = device.parameters.previewSize
                    device.setDisplayOrientation(rotation)
                    device.setPreviewTexture(surface)
                    device.startPreview()
                    main.post {
                        if (!closing) {
                            previewAspect = if (rotation % 180 == 0) size.width.toFloat() / size.height else size.height.toFloat() / size.width
                            fitPreview()
                            status.text = "等待接听 · 本机预览"
                        }
                    }
                } catch (_: Exception) { close() }
            }
        }

        @Synchronized fun close(): Future<*> {
            releaseTask?.let { return it }
            closing = true
            val task = cameraWorker.submit {
                camera?.let {
                    runCatching { it.stopPreview() }
                    it.release()
                }
                camera = null
                main.post { if (active === this) active = null }
            }
            releaseTask = task
            main.post {
                activity.application.unregisterActivityLifecycleCallbacks(this)
                (frame.parent as? FrameLayout)?.removeView(frame)
            }
            return task
        }

        override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
            close()
            cameraWorker.execute { surface.release() }
            return false // Keep the texture alive until the camera worker has released it.
        }

        override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
        override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
        override fun onActivityPaused(host: Activity) { if (host === activity) close() }
        override fun onActivityDestroyed(host: Activity) { if (host === activity) close() }
        override fun onActivityCreated(host: Activity, state: Bundle?) {}
        override fun onActivityStarted(host: Activity) {}
        override fun onActivityResumed(host: Activity) {}
        override fun onActivityStopped(host: Activity) {}
        override fun onActivitySaveInstanceState(host: Activity, state: Bundle) {}
    }
}
