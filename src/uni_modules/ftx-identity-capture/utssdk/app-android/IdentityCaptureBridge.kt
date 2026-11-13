package ftx.identity

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

object IdentityCaptureBridge {
    private val main = Handler(Looper.getMainLooper())
    internal var callback: ((String) -> Unit)? = null
    internal var pending: JSONObject? = null
    internal var screen: IdentityCaptureActivity? = null
    @JvmStatic fun open(activity: Activity, options: String, emit: (String) -> Unit) {
        activity.runOnUiThread {
            val input = JSONObject(options)
            if (pending != null || screen != null) {
                emit(JSONObject().put("id", input.optString("id")).put("type", "error").put("message", "正在认证，请勿重复打开").toString())
                return@runOnUiThread
            }
            pending = input; callback = emit
            try { activity.startActivity(Intent(activity, IdentityCaptureActivity::class.java)) }
            catch (_: Exception) { pending = null; callback = null; emit(JSONObject().put("id", input.optString("id")).put("type", "error").put("message", "请更新 App 安装包后重试").toString()) }
        }
    }
    @JvmStatic fun update(options: String) { main.post { screen?.update(JSONObject(options)) } }
    @JvmStatic fun close(id: String) {
        main.post {
            val activity = screen
            if (activity != null && activity.captureId == id) activity.complete("cancel")
            else if (pending?.optString("id") == id) { pending = null; callback = null }
        }
    }
}

class IdentityCaptureActivity : ComponentActivity() {
    internal var captureId = ""
    private var emit: ((String) -> Unit)? = null
    private val worker = Executors.newSingleThreadExecutor()
    private var provider: ProcessCameraProvider? = null
    private var detector: FaceLandmarker? = null
    private lateinit var root: IdentityCaptureUi
    private lateinit var preview: PreviewView
    @Volatile private var closed = false
    @Volatile private var waiting = false
    private var permissionPending = false
    private var startedCamera = false
    private var frameTime = 0L
    private var frameId = 0L
    private var photo: Bitmap? = null
    private var originalBrightness = -1f
    private var modelPath = ""
    private val timeout = Runnable { complete("error", "认证超时，请重新开始") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val input = IdentityCaptureBridge.pending
        if (input == null || savedInstanceState != null) { finish(); return }
        IdentityCaptureBridge.pending = null; IdentityCaptureBridge.screen = this
        emit = IdentityCaptureBridge.callback
        captureId = input.optString("id"); modelPath = input.optString("modelPath").removePrefix("file://")
        originalBrightness = window.attributes.screenBrightness
        window.attributes = window.attributes.apply { screenBrightness = 1f }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
        buildUi(input.optJSONArray("actions"))
        root.postDelayed(timeout, 90000)
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) prepareCamera()
        else { permissionPending = true; requestPermissions(arrayOf(Manifest.permission.CAMERA), 481) }
    }
    private fun buildUi(actions: JSONArray?) {
        preview = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        val order = if (actions?.optString(0) == "mouth") listOf("mouth", "blink") else listOf("blink", "mouth")
        root = IdentityCaptureUi(this, preview, order, { complete("cancel") }, { send("light") })
        window.statusBarColor = Color.WHITE; window.navigationBarColor = Color.WHITE
        window.decorView.systemUiVisibility = android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
            (if (android.os.Build.VERSION.SDK_INT >= 26) android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else 0)
        setContentView(root)
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, grants: IntArray) {
        super.onRequestPermissionsResult(code, permissions, grants)
        if (code != 481 || closed) return
        permissionPending = false
        if (grants.firstOrNull() == PackageManager.PERMISSION_GRANTED) prepareCamera() else complete("error", "请在系统设置中允许相机权限后重试")
    }
    private fun prepareCamera() {
        worker.execute {
            try {
                val file = File(modelPath)
                val digest = MessageDigest.getInstance("SHA-256")
                file.inputStream().use { stream -> val buffer = ByteArray(65536); var size: Int; while (stream.read(buffer).also { size = it } > 0) digest.update(buffer, 0, size) }
                check(digest.digest().joinToString("") { "%02x".format(it) } == "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff")
            } catch (_: Exception) { runOnUiThread { complete("error", "认证资源校验失败，请重新下载后重试", "MODEL") }; return@execute }
            try {
                val task = FaceLandmarker.createFromOptions(this, FaceLandmarker.FaceLandmarkerOptions.builder()
                    .setBaseOptions(BaseOptions.builder().setModelAssetPath(modelPath).build())
                    .setRunningMode(RunningMode.VIDEO).setNumFaces(2).setOutputFaceBlendshapes(true)
                    .setMinFaceDetectionConfidence(.65f).setMinFacePresenceConfidence(.65f).build())
                if (closed) { task.close(); return@execute }
                detector = task
                runOnUiThread {
                    if (closed) return@runOnUiThread
                    val future = ProcessCameraProvider.getInstance(this)
                    future.addListener({
                        if (closed) return@addListener
                        try {
                            provider = future.get()
                            val display = Preview.Builder().build().apply { setSurfaceProvider(preview.surfaceProvider) }
                            val analysis = ImageAnalysis.Builder().setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).setTargetResolution(android.util.Size(640, 480)).build()
                            analysis.setAnalyzer(worker) { frame -> analyze(frame) }
                            provider!!.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, display, analysis)
                            startedCamera = true
                        } catch (_: Exception) { complete("error", "无法打开前置相机，请检查相机权限") }
                    }, ContextCompat.getMainExecutor(this))
                }
            } catch (_: Exception) { runOnUiThread { complete("error", "无法准备动作认证，请更新 App 后重试") } }
        }
    }
    private fun analyze(frame: ImageProxy) {
        try {
            val now = SystemClock.uptimeMillis()
            if (closed || waiting || now - frameTime < 120) return
            frameTime = now; waiting = true
            val plane = frame.planes[0]
            val padded = Bitmap.createBitmap(plane.rowStride / 4, frame.height, Bitmap.Config.ARGB_8888)
            plane.buffer.rewind(); padded.copyPixelsFromBuffer(plane.buffer)
            val crop = Bitmap.createBitmap(padded, 0, 0, frame.width, frame.height)
            val bitmap = Bitmap.createBitmap(crop, 0, 0, crop.width, crop.height, Matrix().apply { postRotate(frame.imageInfo.rotationDegrees.toFloat()) }, true)
            if (crop !== bitmap) crop.recycle(); if (padded !== crop && padded !== bitmap) padded.recycle()
            // MPImage.close recycles its bitmap. Keep the approved photo independently owned.
            val image = BitmapImageBuilder(bitmap.copy(Bitmap.Config.ARGB_8888, false)).build()
            val result = try { detector!!.detectForVideo(image, now) } finally { image.close() }
            val faces = result.faceLandmarks(); val points = faces.firstOrNull()
            val bounds = JSONArray()
            if (!points.isNullOrEmpty()) {
                bounds.put(JSONObject().put("x", points.minOf { it.x() }).put("y", points.minOf { it.y() }))
                bounds.put(JSONObject().put("x", points.maxOf { it.x() }).put("y", points.maxOf { it.y() }))
            }
            val scores = if (result.faceBlendshapes().isPresent) result.faceBlendshapes().get().firstOrNull()?.associate { it.categoryName() to it.score() } else null
            val color = JSONArray(); val sums = DoubleArray(3); var count = 0
            if (points != null && points.size > 280) for (index in intArrayOf(50, 280)) {
                val cx = (points[index].x() * (bitmap.width - 1)).toInt(); val cy = (points[index].y() * (bitmap.height - 1)).toInt()
                val radius = (bitmap.width * .025).toInt().coerceAtLeast(1)
                for (y in (cy - radius).coerceAtLeast(0)..(cy + radius).coerceAtMost(bitmap.height - 1) step 3)
                    for (x in (cx - radius).coerceAtLeast(0)..(cx + radius).coerceAtMost(bitmap.width - 1) step 3) {
                        val c = bitmap.getPixel(x, y); val r = Color.red(c); val g = Color.green(c); val b = Color.blue(c)
                        if (r + g + b >= 45 && minOf(r, g, b) <= 245) { sums[0] += r; sums[1] += g; sums[2] += b; count++ }
                    }
            }
            if (count >= 8) sums.forEach { color.put(it / count) }
            val event = JSONObject().put("count", faces.size).put("points", bounds).put("blink", minOf(scores?.get("eyeBlinkLeft") ?: 0f, scores?.get("eyeBlinkRight") ?: 0f))
                .put("blinkLeft", scores?.get("eyeBlinkLeft") ?: 0f).put("blinkRight", scores?.get("eyeBlinkRight") ?: 0f)
                .put("mouth", scores?.get("jawOpen") ?: 0f).put("video", JSONObject().put("width", bitmap.width).put("height", bitmap.height))
            event.put("quality", IdentityImageQuality.measure(bitmap, bounds))
            if (color.length() == 3) event.put("color", color)
            runOnUiThread {
                if (closed) { bitmap.recycle(); return@runOnUiThread }
                photo?.recycle(); photo = bitmap; frameId++
                event.put("frameId", frameId).put("viewport", JSONObject().put("width", preview.width).put("height", preview.height)
                    .put("guide", JSONObject().put("width", root.guideWidth.toDouble()).put("height", root.guideHeight.toDouble())))
                send("frame", event)
            }
        } catch (_: Exception) { runOnUiThread { complete("error", "动作认证未完成，请重新认证") } }
        finally { frame.close() }
    }
    internal fun update(input: JSONObject) {
        if (closed || input.optString("id") != captureId) return
        root.update(input)
        if (input.optLong("frameId", -1) != frameId) return
        if (input.optBoolean("capture") && photo != null) {
            try {
                val file = File.createTempFile("identity-", ".jpg", cacheDir)
                file.outputStream().use { check(photo!!.compress(Bitmap.CompressFormat.JPEG, 90, it)) }
                complete("photo", path = file.absolutePath)
            } catch (_: Exception) { complete("error", "认证失败，请重新尝试") }
        } else waiting = false
    }
    private fun send(type: String, extra: JSONObject = JSONObject()) { extra.put("id", captureId).put("type", type); emit?.invoke(extra.toString()) }
    internal fun complete(type: String, message: String = "", code: String = "", path: String = "") {
        if (closed) return
        closed = true
        window.attributes = window.attributes.apply { screenBrightness = originalBrightness }
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        send(type, JSONObject().put("message", message).put("code", code).put("path", path))
        finish()
    }
    override fun onPause() {
        if (!closed && !permissionPending && startedCamera) complete("cancel")
        super.onPause()
    }
    override fun onStop() { super.onStop(); if (!closed) complete("cancel") }
    @Deprecated("Deprecated in Java") override fun onBackPressed() { complete("cancel") }
    override fun onDestroy() {
        if (!closed) complete("cancel")
        if (::root.isInitialized) root.removeCallbacks(timeout)
        window.attributes = window.attributes.apply { screenBrightness = originalBrightness }
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        provider?.unbindAll()
        worker.execute { detector?.close(); detector = null }
        worker.shutdown()
        photo?.recycle(); photo = null
        if (IdentityCaptureBridge.screen === this) { IdentityCaptureBridge.screen = null; IdentityCaptureBridge.callback = null }
        emit = null; super.onDestroy()
    }
}
