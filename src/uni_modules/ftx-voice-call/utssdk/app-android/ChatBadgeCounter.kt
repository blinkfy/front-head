package ftx.voice

// No Android dependencies: the same reducer is used by foreground and native
// background delivery. A list response is reconciled with events received while
// its existing HTTP request was in flight, rather than starting another request.
internal class ChatBadgeCounter {
    data class Snapshot(val count: Int, val through: Long)
    data class Bucket(var count: Int = 0, var through: Long = 0, var readThrough: Long = 0,
        val pending: MutableSet<Long> = linkedSetOf())
    private data class Change(val conversation: String, val id: Long?, val read: Boolean, val at: Long)
    val buckets = linkedMapOf<String, Bucket>()
    private val journal = java.util.ArrayDeque<Change>()
    private var lostThrough = 0L
    private var lastSnapshotStartedAt = 0L
    val total: Int get() = buckets.values.sumOf { it.count.toLong() + it.pending.size }.coerceAtMost(9999).toInt()

    fun message(conversation: String, id: Long, at: Long) {
        if (conversation.isEmpty() || id <= 0) return
        record(Change(conversation, id, false, at)); add(conversation, id)
    }
    private fun add(conversation: String, id: Long) {
        val bucket = buckets.getOrPut(conversation) { Bucket() }
        if (id > bucket.through && id > bucket.readThrough) bucket.pending.add(id)
        // Bound storage while preserving the count. Earlier IDs become a fence.
        if (bucket.pending.size > 512) {
            val oldest = bucket.pending.minOrNull() ?: return
            bucket.pending.remove(oldest); bucket.count++; bucket.through = maxOf(bucket.through, oldest)
        }
    }
    fun read(conversation: String, through: Long?, at: Long) {
        if (conversation.isEmpty()) return
        record(Change(conversation, through, true, at)); consume(conversation, through)
    }
    private fun consume(conversation: String, through: Long?) {
        val bucket = buckets.getOrPut(conversation) { Bucket() }
        val cutoff = through ?: maxOf(bucket.through, bucket.pending.maxOrNull() ?: 0, bucket.readThrough)
        if (through == null || cutoff >= bucket.through) bucket.count = 0
        bucket.pending.removeAll { it <= cutoff }
        bucket.readThrough = maxOf(bucket.readThrough, cutoff)
    }
    fun snapshot(values: Map<String, Snapshot>, startedAt: Long): Boolean {
        // An exceptionally slow request must not erase changes beyond our journal.
        if (startedAt <= lostThrough || startedAt < lastSnapshotStartedAt) return false
        lastSnapshotStartedAt = startedAt
        val previous = buckets.toMap()
        // Legacy direct-read updates do not return a message cutoff. Keep that
        // conversation's current reducer state rather than replaying an unbounded
        // clear over a snapshot which may already include a later new message.
        val unboundedReads = journal.filter { it.read && it.id == null && it.at >= startedAt }.map { it.conversation }.toSet()
        buckets.clear()
        for ((key, value) in values) if (key !in unboundedReads) buckets[key] = Bucket(value.count.coerceIn(0, 9999), value.through.coerceAtLeast(0))
        // Preserve replay fences for conversations with no unread rows. Pending
        // messages during this request are replayed below, not fenced away here.
        for ((key, value) in previous) if (key in unboundedReads) buckets[key] = value
        else if (!values.containsKey(key)) {
            val inFlight = journal.filter { !it.read && it.conversation == key && it.at >= startedAt }.mapNotNull { it.id }.toSet()
            val oldPending = value.pending.filter { it !in inFlight }.maxOrNull() ?: 0
            buckets[key] = Bucket(through = maxOf(value.through, value.readThrough, oldPending), readThrough = value.readThrough)
        }
        for (change in journal) if (change.at >= startedAt && change.conversation !in unboundedReads) {
            if (change.read) consume(change.conversation, change.id) else add(change.conversation, change.id ?: 0)
        }
        return true
    }
    private fun record(change: Change) {
        journal.addLast(change)
        while (journal.size > 1024) lostThrough = maxOf(lostThrough, journal.removeFirst().at)
    }
    fun clear() { buckets.clear(); journal.clear(); lostThrough = 0; lastSnapshotStartedAt = 0 }
}
