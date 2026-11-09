package ftx.voice

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

internal class CallAvatarView(context: Context) : FrameLayout(context) {
    companion object {
        private const val MAX_DOWNLOAD_BYTES = 1024L * 1024
        private val client = OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS).build()
        private val main = Handler(Looper.getMainLooper())
        private val placeholder = Regex("(?:^|/)(?:person\\.webp\\.png|default-avatar[^/?#]*)(?:[?#]|$)", RegexOption.IGNORE_CASE)
        private val inlineImage = Regex("^data:image/(?:jpeg|jpg|png|webp|gif);base64,", RegexOption.IGNORE_CASE)
    }

    private val initial = TextView(context).apply {
        gravity = Gravity.CENTER; textSize = 30f; setTextColor(Color.rgb(195, 228, 207))
    }
    private val image = ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
    private var avatarSource: String? = null
    private var request: Call? = null
    private var revision = 0

    init {
        background = GradientDrawable().apply {
            cornerRadius = 24 * resources.displayMetrics.density; setColor(Color.rgb(38, 66, 52))
        }
        clipToOutline = true
        addView(initial, LayoutParams(-1, -1))
        addView(image, LayoutParams(-1, -1))
    }

    fun setPeer(name: String, avatar: String) {
        val label = name.trim().ifEmpty { "聊" }
        initial.text = label.substring(0, label.offsetByCodePoints(0, 1))
        val source = avatar.trim().takeUnless { placeholder.containsMatchIn(it) ||
            it.startsWith("https://ui-avatars.com/", ignoreCase = true) || it.startsWith("http://ui-avatars.com/", ignoreCase = true) }.orEmpty()
        if (source == avatarSource) return
        avatarSource = source
        val current = ++revision
        request?.cancel(); request = null
        image.setImageDrawable(null)
        initial.visibility = VISIBLE
        val publish: (Bitmap?) -> Unit = { bitmap ->
            if (bitmap != null) main.post {
                if (current == revision) { image.setImageBitmap(bitmap); initial.visibility = GONE }
            }
        }
        if (source.length <= 140000 && inlineImage.containsMatchIn(source)) {
            client.dispatcher.executorService.execute {
                try { publish(decode(Base64.decode(source.substringAfter(','), Base64.DEFAULT))) } catch (_: IllegalArgumentException) {}
            }
        } else if (source.startsWith("https://", true) || source.startsWith("http://", true)) {
            val target = try { Request.Builder().url(source).build() } catch (_: IllegalArgumentException) { return }
            request = client.newCall(target).also { call ->
                call.enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) = Unit
                    override fun onResponse(call: Call, response: Response) {
                        response.use {
                            if (!it.isSuccessful) return
                            val bytes = it.body?.source() ?: return
                            try { if (!bytes.request(MAX_DOWNLOAD_BYTES + 1)) publish(decode(bytes.readByteArray())) }
                            catch (_: IOException) {}
                        }
                    }
                })
            }
        }
    }

    private fun decode(bytes: ByteArray): Bitmap? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        if (options.outWidth <= 0 || options.outHeight <= 0) return null
        options.inJustDecodeBounds = false
        options.inSampleSize = 1
        while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }

    override fun onDetachedFromWindow() {
        revision++
        request?.cancel(); request = null
        avatarSource = null
        super.onDetachedFromWindow()
    }
}
