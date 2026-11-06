package ftx.voice

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

// A notification link only opens the application. The authenticated API resolves
// its recipient and destination; a public intent cannot grant order access.
class BusinessNotificationActivity : Activity() {
    override fun onCreate(state: Bundle?) { super.onCreate(state); open(intent) }
    override fun onNewIntent(value: Intent) { super.onNewIntent(value); open(value) }
    private fun open(value: Intent) {
        val uri = value.data
        val id = uri?.lastPathSegment ?: ""
        if (uri?.scheme == "fentouxia" && uri.host == "notification" &&
            Regex("^[0-9]{1,16}$").matches(id) && id.toLongOrNull()?.let { it in 1..9007199254740991L } == true) {
            val launch = packageManager.getLaunchIntentForPackage(packageName)
            if (launch != null) {
                launch.data = Uri.parse("fentouxia://notification/$id")
                launch.putExtra("ftxNotificationId", id)
                launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(launch)
            }
        }
        finish()
    }
}
