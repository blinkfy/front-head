package ftx.qbar

import android.app.Activity
import android.content.ComponentName
import android.webkit.ValueCallback

// Do not link AAR-only types in this hot-loaded bridge's signatures or lambdas.
// Android may verify them before a method body (and its try/catch) is entered.
object QbarBridge {
    private fun scannerClass(activity: Activity): Class<*>? {
        return try {
            val loader = activity.classLoader
            val scanner = Class.forName("ftx.qbar.ScannerActivity", false, loader)
            for (name in arrayOf("ftx.qbar.ScanEngine", "com.tencent.qbar.QbarNative",
                "com.tencent.qbar.WxQbarNative", "com.tencent.qbar.QbarNative\$QbarAiModelParam",
                "com.tencent.qbar.QbarNative\$QBarResultJNI")) {
                Class.forName(name, false, loader)
            }
            scanner.getMethod("open", Activity::class.java, ValueCallback::class.java)
            activity.packageManager.getActivityInfo(ComponentName(activity, scanner), 0)
            scanner
        } catch (_: Throwable) { null }
    }
    @JvmStatic fun isAvailable(activity: Activity): Boolean = scannerClass(activity) != null
    @JvmStatic
    fun start(activity: Activity, callback: (String) -> Unit) {
        val scanner = scannerClass(activity)
        if (scanner == null) { callback("{\"error\":\"UNAVAILABLE\"}"); return }
        activity.runOnUiThread {
            try {
                val receiver = object : ValueCallback<String> {
                    override fun onReceiveValue(result: String) { callback(result) }
                }
                scanner.getMethod("open", Activity::class.java, ValueCallback::class.java)
                    .invoke(null, activity, receiver)
            } catch (_: Throwable) { callback("{\"error\":\"UNAVAILABLE\"}") }
        }
    }
    @JvmStatic fun cancel(activity: Activity) {
        try { scannerClass(activity)?.getMethod("cancelCurrent")?.invoke(null) }
        catch (_: Throwable) { /* A missing/replaced native base must not crash cancellation. */ }
    }
}
