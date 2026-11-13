package ftx.voice

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

object AppChatBadge {
    private val main = Handler(Looper.getMainLooper())
    private val counter = ChatBadgeCounter()
    private var owner = ""
    private var loaded = false
    private var displayed = -1

    @JvmStatic fun update(ctx: Context, json: String) { main.post {
        try {
            val input = JSONObject(json)
            val requested = input.optString("owner").takeIf { Regex("^[1-9]\\d{0,19}$").matches(it) }.orEmpty()
            load(ctx)
            val changed = requested != owner
            if (changed || input.optString("operation") == "clear") {
                owner = requested; counter.clear(); displayed = -1; save(ctx)
            }
            if (input.optString("operation") == "snapshot" && owner.isNotEmpty()) {
                val values = linkedMapOf<String, ChatBadgeCounter.Snapshot>()
                val counts = input.optJSONObject("counts") ?: return@post
                counts.keys().forEach { key ->
                    val value = counts.optJSONObject(key)
                    if (validConversation(key) && value != null) values[key] = ChatBadgeCounter.Snapshot(value.optInt("count"), value.optLong("through"))
                }
                if (!counter.snapshot(values, input.optLong("startedAt"))) return@post
                save(ctx)
            }
            // Do not overwrite newer vendor-delivered offline increments with a
            // stale disk count merely because the app resumed.
            if (changed || input.optString("operation") in listOf("snapshot", "clear")) display(ctx, true)
        } catch (_: Exception) { /* Badge failure must never interrupt messaging. */ }
    } }

    // Called on RealtimeBridge's main thread before foreground/deferred routing.
    internal fun event(ctx: Context, userId: String, event: JSONObject) {
        load(ctx)
        if (owner.isEmpty() || userId != owner || event.optString("type") != "chat.changed") return
        val conversation = event.optString("conversationId")
        if (!validConversation(conversation)) return
        val at = System.currentTimeMillis()
        when (event.optString("kind")) {
            "message" -> {
                val message = event.optJSONObject("message") ?: return
                if (event.optBoolean("muted") || event.optBoolean("isSelf") || message.optString("senderId") == userId || message.optBoolean("isWithdraw") || message.optBoolean("isRead")) return
                counter.message(conversation, message.optLong("id"), at)
            }
            "read", "badge.remove", "contact.deleted", "group.removed", "conversation.hidden" -> counter.read(conversation,
                if (event.has("throughMessageId")) event.optLong("throughMessageId") else null, at)
            else -> return
        }
        save(ctx); display(ctx)
    }
    private fun validConversation(value: String) = Regex("^(group:)?[1-9]\\d{0,19}$").matches(value)
    private fun load(ctx: Context) {
        if (loaded) return
        loaded = true
        try {
            val state = JSONObject(ctx.getSharedPreferences("ftx_chat_badge", Context.MODE_PRIVATE).getString("state", "{}") ?: "{}")
            owner = state.optString("owner")
            val values = state.optJSONObject("counts") ?: return
            values.keys().forEach { key ->
                val value = values.optJSONObject(key)
                if (validConversation(key) && value != null) {
                    val bucket = ChatBadgeCounter.Bucket(value.optInt("count").coerceIn(0, 9999), value.optLong("through"), value.optLong("readThrough"))
                    val ids = value.optJSONArray("pending") ?: JSONArray()
                    for (index in 0 until minOf(ids.length(), 512)) bucket.pending.add(ids.optLong(index))
                    counter.buckets[key] = bucket
                }
            }
        } catch (_: Exception) { counter.clear() }
    }
    private fun save(ctx: Context) {
        val counts = JSONObject()
        for ((key, value) in counter.buckets) counts.put(key, JSONObject().put("count", value.count).put("through", value.through)
            .put("readThrough", value.readThrough).put("pending", JSONArray(value.pending.toList())))
        ctx.getSharedPreferences("ftx_chat_badge", Context.MODE_PRIVATE).edit()
            .putString("state", JSONObject().put("owner", owner).put("counts", counts).toString()).apply()
    }
    private fun display(ctx: Context, force: Boolean = false) {
        val number = counter.total
        if (!force && displayed == number) return
        try {
            // Resolve the installed launcher component, including custom bases.
            val launcher = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.component ?: return
            val extras = Bundle().apply { putString("package", ctx.packageName); putString("class", launcher.className); putInt("badgenumber", number) }
            ctx.contentResolver.call(Uri.parse("content://com.huawei.android.launcher.settings/badge/"), "change_badge", null, extras)
            displayed = number
        } catch (_: Exception) { /* Other launchers may only provide notification dots. */ }
    }
}
