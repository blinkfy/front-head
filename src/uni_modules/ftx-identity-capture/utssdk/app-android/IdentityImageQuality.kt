package ftx.identity

import android.graphics.Bitmap
import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.floor

// Same 64x64 inner-face sampling and metrics as identity-image-quality.mjs.
internal object IdentityImageQuality {
    fun measure(bitmap: Bitmap, bounds: JSONArray): JSONObject {
        val width = bitmap.width; val height = bitmap.height
        var left = .25; var top = .2; var right = .75; var bottom = .8
        if (bounds.length() >= 2) {
            left = bounds.getJSONObject(0).getDouble("x"); top = bounds.getJSONObject(0).getDouble("y")
            right = bounds.getJSONObject(1).getDouble("x"); bottom = bounds.getJSONObject(1).getDouble("y")
            val dx = (right - left) * .1; val dy = (bottom - top) * .1
            left += dx; right -= dx; top += dy; bottom -= dy
        }
        val x0 = floor(left * width).toInt().coerceIn(0, width - 1)
        val y0 = floor(top * height).toInt().coerceIn(0, height - 1)
        val rw = ceil(right * width).toInt().coerceIn(x0 + 1, width) - x0
        val rh = ceil(bottom * height).toInt().coerceIn(y0 + 1, height) - y0
        val size = 64; val luma = DoubleArray(size * size)
        var sum = 0.0; var black = 0; var dark = 0; var clipped = 0
        for (y in 0 until size) for (x in 0 until size) {
            val sx = (x0 + floor((x + .5) * rw / size).toInt()).coerceAtMost(width - 2)
            val sy = (y0 + floor((y + .5) * rh / size).toInt()).coerceAtMost(height - 2)
            var value = 0.0
            for (dy in 0..1) for (dx in 0..1) {
                val c = bitmap.getPixel(sx + dx, sy + dy)
                value += .299 * Color.red(c) + .587 * Color.green(c) + .114 * Color.blue(c)
            }
            value /= 4; luma[y * size + x] = value; sum += value
            if (value < 12) black++; if (value < 40) dark++; if (value > 245) clipped++
        }
        var edge = 0.0; var square = 0.0
        for (y in 1 until size - 1) for (x in 1 until size - 1) {
            val i = y * size + x
            val v = luma[i - 1] + luma[i + 1] + luma[i - size] + luma[i + size] - 4 * luma[i]
            edge += v; square += v * v
        }
        val count = ((size - 2) * (size - 2)).toDouble(); val pixels = (size * size).toDouble()
        return JSONObject().put("mean", sum / pixels).put("black", black / pixels).put("dark", dark / pixels)
            .put("clipped", clipped / pixels).put("sharpness", (square / count - (edge / count) * (edge / count)).coerceAtLeast(0.0))
            .put("resolution", minOf(rw, rh))
    }
}
