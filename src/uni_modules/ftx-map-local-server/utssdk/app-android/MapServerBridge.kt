package ftx.map

import android.content.Context

// Keep AAR-only types out of signatures so older hot-loaded bases can verify this bridge.
object MapServerBridge {
    @JvmStatic
    fun start(context: Context, indexPath: String): String {
        return try {
            val service = Class.forName("ftx.map.AndroidMapAssetService", false, context.classLoader)
            service.getMethod("start", Context::class.java, String::class.java)
                .invoke(null, context, indexPath) as? String ?: ""
        } catch (_: Throwable) {
            ""
        }
    }

    @JvmStatic
    fun stop(baseUrl: String) {
        try {
            val service = Class.forName("ftx.map.AndroidMapAssetService", false,
                MapServerBridge::class.java.classLoader)
            service.getMethod("stop", String::class.java).invoke(null, baseUrl)
        } catch (_: Throwable) {
            // Stopping a missing service is intentionally idempotent.
        }
    }
}
