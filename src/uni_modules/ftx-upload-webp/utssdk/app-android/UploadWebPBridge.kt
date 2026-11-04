package ftx.upload

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.exifinterface.media.ExifInterface
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

object UploadWebPBridge {
    // Queue paths, not decoded images; at most one bitmap job holds memory.
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private fun open(context: Context, source: String): InputStream {
        val uri = Uri.parse(source)
        return if (uri.scheme == "content") {
            context.contentResolver.openInputStream(uri) ?: throw IOException("SOURCE_UNAVAILABLE")
        } else FileInputStream(if (uri.scheme == "file") uri.path!! else source)
    }

    @JvmStatic
    fun encode(context: Context, options: String, callback: (String) -> Unit) {
        worker.execute {
            var output: File? = null
            var owned = false
            var completed = false
            val bitmaps = mutableListOf<Bitmap>()
            val result = try {
                val args = JSONObject(options)
                val source = args.getString("source")
                val destination = args.getString("destination")
                val maxSize = args.getInt("maxSize").coerceIn(1, 1600)
                val quality = args.getInt("quality").coerceIn(1, 100)
                val deadline = args.getLong("deadline")
                fun checkDeadline() {
                    if (System.currentTimeMillis() >= deadline) throw IOException("EXPIRED")
                }
                checkDeadline()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                open(context, source).use { BitmapFactory.decodeStream(it, null, bounds) }
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("INVALID_IMAGE")
                val orientation = open(context, source).use {
                    ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
                }
                var sample = 1
                while (max(bounds.outWidth, bounds.outHeight) / sample > maxSize * 2) sample *= 2
                checkDeadline()
                val decode = BitmapFactory.Options().apply {
                    inSampleSize = sample
                    inPreferredConfig = Bitmap.Config.ARGB_8888
                }
                val original = open(context, source).use { BitmapFactory.decodeStream(it, null, decode) }
                    ?: throw IOException("DECODE_FAILED")
                bitmaps.add(original)
                val matrix = Matrix()
                when (orientation) {
                    ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
                    ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
                    ExifInterface.ORIENTATION_FLIP_VERTICAL -> { matrix.setRotate(180f); matrix.postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
                    ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(-90f); matrix.postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
                }
                val scale = min(1f, maxSize.toFloat() / max(original.width, original.height))
                matrix.postScale(scale, scale)
                var image = Bitmap.createBitmap(original, 0, 0, original.width, original.height, matrix, true)
                if (image !== original) bitmaps.add(image)
                if (!args.optBoolean("preserveAlpha", false) && image.hasAlpha()) {
                    val opaque = Bitmap.createBitmap(image.width, image.height, Bitmap.Config.ARGB_8888)
                    bitmaps.add(opaque)
                    Canvas(opaque).apply { drawColor(Color.WHITE); drawBitmap(image, 0f, 0f, null) }
                    opaque.setHasAlpha(false)
                    image = opaque
                }
                checkDeadline()
                val destinationUri = Uri.parse(destination)
                val file = File(if (destinationUri.scheme == "file") destinationUri.path!! else destination)
                if (!file.isAbsolute || !file.name.startsWith("upload_webp_") || file.path == source) {
                    throw IOException("INVALID_DESTINATION")
                }
                file.parentFile?.mkdirs()
                if (!file.createNewFile()) throw IOException("DESTINATION_EXISTS")
                output = file
                owned = true
                @Suppress("DEPRECATION")
                val format = if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
                FileOutputStream(file).use {
                    if (!image.compress(format, quality, it)) throw IOException("ENCODE_FAILED")
                }
                checkDeadline()
                val header = ByteArray(12)
                FileInputStream(file).use { if (it.read(header) != 12) throw IOException("INVALID_WEBP") }
                if (String(header, 0, 4, Charsets.US_ASCII) != "RIFF" ||
                    String(header, 8, 4, Charsets.US_ASCII) != "WEBP") throw IOException("INVALID_WEBP")
                val sourceUri = Uri.parse(source)
                val sourceFile = if (sourceUri.scheme == "content") null else
                    File(if (sourceUri.scheme == "file") sourceUri.path!! else source)
                if (max(bounds.outWidth, bounds.outHeight) <= maxSize && sourceFile != null &&
                    sourceFile.length() > 0 && file.length() >= sourceFile.length()) throw IOException("NOT_SMALLER")
                val response = JSONObject().put("path", destination).put("size", file.length())
                    .put("width", image.width).put("height", image.height).toString()
                completed = true
                response
            } catch (_: Throwable) {
                "{\"error\":\"ENCODE_UNAVAILABLE\"}"
            } finally {
                bitmaps.forEach { if (!it.isRecycled) it.recycle() }
                if (owned && !completed) output?.delete()
            }
            // UTS callbacks are one-shot. Never report intermediate progress here.
            main.post { callback(result) }
        }
    }
}
