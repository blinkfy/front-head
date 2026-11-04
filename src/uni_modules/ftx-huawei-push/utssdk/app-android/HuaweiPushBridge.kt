package ftx.push

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Bundle
import com.huawei.hms.aaid.HmsInstanceId
import com.huawei.hms.push.HmsMessageService
import org.json.JSONObject
import java.util.concurrent.Executors

object HuaweiPushBridge {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private const val appId = "119662995"
    private var pending: ((String) -> Unit)? = null
    private var latestToken: String? = null

    fun tokenReceived(token: String?) {
        if (token.isNullOrEmpty()) return
        main.post {
            latestToken = token
            val callback = pending
            pending = null
            callback?.invoke(JSONObject().put("token", token).toString())
        }
    }

    @JvmStatic
    fun getToken(context: Context, callback: (String) -> Unit) {
        if (!Build.MANUFACTURER.equals("HUAWEI", ignoreCase = true)) {
            callback("{\"error\":\"UNSUPPORTED\"}")
            return
        }
        worker.execute {
            val result = try {
                val token = HmsInstanceId.getInstance(context).getToken(appId, "HCM")
                if (token.isNullOrEmpty()) "{\"error\":\"TOKEN_PENDING\"}"
                else JSONObject().put("token", token).toString()
            } catch (_: Exception) { "{\"error\":\"TOKEN_UNAVAILABLE\"}" }
            main.post {
                if (result.contains("TOKEN_PENDING")) {
                    if (!latestToken.isNullOrEmpty()) {
                        callback(JSONObject().put("token", latestToken).toString())
                        return@post
                    }
                    pending = callback
                    main.postDelayed({
                        if (pending === callback) {
                            pending = null
                            callback("{\"error\":\"TOKEN_PENDING\"}")
                        }
                    }, 30000)
                } else callback(result)
            }
        }
    }

    @JvmStatic
    fun deleteToken(context: Context, callback: (String) -> Unit) {
        if (!Build.MANUFACTURER.equals("HUAWEI", ignoreCase = true)) {
            callback("{\"ok\":true}")
            return
        }
        latestToken = null
        worker.execute {
            val result = try {
                HmsInstanceId.getInstance(context).deleteToken(appId, "HCM")
                "{\"ok\":true}"
            } catch (_: Exception) { "{\"error\":\"DELETE_FAILED\"}" }
            main.post { callback(result) }
        }
    }
}

// HMS owns background notification display; foreground alerts remain on the existing chat socket.
class HuaweiMessageService : HmsMessageService() {
    override fun onNewToken(token: String?) { HuaweiPushBridge.tokenReceived(token) }
    override fun onNewToken(token: String?, bundle: Bundle?) { HuaweiPushBridge.tokenReceived(token) }
}
