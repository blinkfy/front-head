package ftx.voice

import android.content.Context
import android.content.Intent
import android.graphics.Point
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Display
import org.webrtc.CapturerObserver
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoFrame
import org.webrtc.VideoTrack
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

internal class CallScreenCapture(
    private val context: Context, private val factory: PeerConnectionFactory, private val egl: EglBase.Context,
    private val resize: (Int, Int) -> Unit, private val frameReady: () -> Unit, private val stopped: () -> Unit
) {
    private val displays = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    private var texture: SurfaceTextureHelper? = null
    private var source: VideoSource? = null
    var track: VideoTrack? = null; private set
    private var capture: ScreenCapturerAndroid? = null
    val projection: MediaProjection? get() = capture?.mediaProjection
    private var size: Pair<Int, Int>? = null
    private var listening = false
    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(id: Int) {}
        override fun onDisplayRemoved(id: Int) {}
        override fun onDisplayChanged(id: Int) {
            if (id == Display.DEFAULT_DISPLAY) displaySize().let { resize(it.x, it.y) }
        }
    }

    fun start(consent: Intent) {
        val helper = SurfaceTextureHelper.create("ftx-screen", egl) ?: error("Screen texture unavailable")
        texture = helper
        val screen = factory.createVideoSource(true)
        source = screen
        track = factory.createVideoTrack("ftx-screen", screen)
        val capturer = ScreenCapturerAndroid(consent, object : MediaProjection.Callback() {
            override fun onStop() = stopped()
            override fun onCapturedContentResize(width: Int, height: Int) = resize(width, height)
        })
        capture = capturer
        val observer = screen.capturerObserver
        val first = AtomicBoolean(true)
        capturer.initialize(helper, context, object : CapturerObserver {
            override fun onCapturerStarted(success: Boolean) = observer.onCapturerStarted(success)
            override fun onCapturerStopped() = observer.onCapturerStopped()
            override fun onFrameCaptured(frame: VideoFrame) {
                observer.onFrameCaptured(frame)
                if (first.getAndSet(false)) frameReady()
            }
        })
        val (width, height) = displaySize().let { scaledSize(it.x, it.y) }
        capturer.startCapture(width, height, 15)
        size = width to height
        if (Build.VERSION.SDK_INT < 34) {
            displays.registerDisplayListener(displayListener, Handler(Looper.getMainLooper()))
            listening = true
        }
    }

    fun changeSize(width: Int, height: Int) {
        if (width <= 0 || height <= 0) return
        val next = scaledSize(width, height)
        if (size == next) return
        capture?.changeCaptureFormat(next.first, next.second, 15)
        size = next
    }

    fun close() {
        if (listening) displays.unregisterDisplayListener(displayListener)
        listening = false
        try { capture?.stopCapture() } catch (_: Exception) {}
        try { capture?.dispose() } catch (_: Exception) {}
        try { texture?.dispose() } catch (_: Exception) {}
        try { track?.dispose() } catch (_: Exception) {}
        try { source?.dispose() } catch (_: Exception) {}
    }

    @Suppress("DEPRECATION")
    private fun displaySize(): Point = Point().also { size ->
        displays.getDisplay(Display.DEFAULT_DISPLAY)?.getRealSize(size)
        if (size.x <= 0 || size.y <= 0) context.resources.displayMetrics.let { size.set(it.widthPixels, it.heightPixels) }
    }

    private fun scaledSize(width: Int, height: Int): Pair<Int, Int> {
        val scale = minOf(1.0, 1280.0 / maxOf(width, height, 1))
        return (width * scale / 2).roundToInt().coerceAtLeast(1) * 2 to (height * scale / 2).roundToInt().coerceAtLeast(1) * 2
    }
}
