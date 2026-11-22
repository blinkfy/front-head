package ftx.share

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject

object DirectShare {
    private const val PREFIX = "ftx-share:"
    private val targetPattern = Regex("ftx-share:([1-9][0-9]{0,19}):(direct|group):([1-9][0-9]{0,19})")
    private var pending = ""
    private var expires = 0L

    @JvmStatic @Synchronized fun sync(context: Context, owner: String, targets: String) {
        if (Build.VERSION.SDK_INT < 29) return
        val manager = context.getSystemService(ShortcutManager::class.java) ?: return
        val existing = manager.dynamicShortcuts.filter { it.id.startsWith(PREFIX) }
        val stale = existing.filter { !it.id.startsWith("$PREFIX$owner:") }
        if (stale.isNotEmpty()) manager.removeDynamicShortcuts(stale.map { it.id })
        if (owner.isEmpty()) { pending = ""; return }
        // An empty string revalidates the owner without discarding their current targets.
        if (targets.isEmpty()) return
        val list = JSONArray(targets)
        val launcher = context.packageManager.getLaunchIntentForPackage(context.packageName)?.component ?: return
        val limit = (manager.maxShortcutCountPerActivity - manager.dynamicShortcuts.count {
            it.activity == launcher && !it.id.startsWith(PREFIX)
        }).coerceIn(0, 4)
        val shortcuts = (0 until minOf(list.length(), limit)).mapNotNull { rank ->
            val item = list.optJSONObject(rank) ?: return@mapNotNull null
            val id = "$PREFIX$owner:${item.optString("kind")}:${item.optString("id")}"
            val name = item.optString("label").trim().take(80)
            if (!targetPattern.matches(id) || name.isEmpty()) return@mapNotNull null
            ShortcutInfo.Builder(context, id)
                .setShortLabel(name).setIcon(Icon.createWithResource(context, context.applicationInfo.icon))
                .setActivity(launcher)
                .setCategories(setOf("ftx.share.CONVERSATION"))
                .setIntent(Intent.makeMainActivity(launcher))
                .setRank(rank).build()
        }
        val keep = shortcuts.map { it.id }.toSet()
        val removed = existing.filter { it !in stale && it.id !in keep }.map { it.id }
        if (removed.isNotEmpty()) manager.removeDynamicShortcuts(removed)
        val changes = shortcuts.filter { next -> existing.none { it.id == next.id && it.shortLabel?.toString() == next.shortLabel.toString() && it.rank == next.rank } }
        if (changes.isNotEmpty()) manager.addDynamicShortcuts(changes)
    }

    @Synchronized internal fun queue(activity: Activity, intent: Intent): Boolean {
        if (Build.VERSION.SDK_INT < 29 || intent.action != Intent.ACTION_SEND || intent.type != "text/plain") return false
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim() ?: return false
        if (text.isEmpty() || text.length > 24_000) return false
        val payload = JSONObject().put("text", text)
        val shortcut = intent.getStringExtra(Intent.EXTRA_SHORTCUT_ID)
        if (shortcut != null) {
            val target = targetPattern.matchEntire(shortcut) ?: return false
            val manager = activity.getSystemService(ShortcutManager::class.java) ?: return false
            if (manager.dynamicShortcuts.none { it.id == shortcut }) return false
            payload.put("owner", target.groupValues[1]).put("kind", target.groupValues[2]).put("id", target.groupValues[3])
        }
        pending = payload.toString()
        expires = SystemClock.elapsedRealtime() + 60_000
        return true
    }

    @JvmStatic @Synchronized fun take(): String {
        val result = if (SystemClock.elapsedRealtime() < expires) pending else ""
        pending = ""
        return result
    }
}

class DirectShareActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        try {
            if (DirectShare.queue(this, intent)) {
                packageManager.getLaunchIntentForPackage(packageName)?.let {
                    it.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    it.data = Uri.parse("fentouxia://direct-share")
                    startActivity(it)
                }
            }
        } finally { finish() }
    }
}
