package ftx.voice

fun main() {
    val counter = ChatBadgeCounter()
    fun count(expected: Int) = check(counter.total == expected) { "Expected $expected, got ${counter.total}" }
    fun snapshot(vararg values: Pair<String, ChatBadgeCounter.Snapshot>, at: Long = 1) = check(counter.snapshot(mapOf(*values), at))
    snapshot("2" to ChatBadgeCounter.Snapshot(3, 10), "group:3" to ChatBadgeCounter.Snapshot(2, 20))
    count(5)
    counter.message("2", 10, 2); count(5) // Already included in the snapshot.
    counter.message("2", 12, 3); counter.message("2", 11, 4); count(7) // Out-of-order IDs are still counted.
    counter.message("2", 12, 5); count(7) // Native socket replay cannot increment twice.
    counter.read("2", 11, 6); count(3) // Read through 11, retain message 12 and group.
    counter.read("group:3", null, 7); count(1)
    counter.clear(); count(0)

    // Snapshot includes one of the in-flight events, but not the newer one.
    counter.message("2", 11, 110); counter.message("2", 12, 120)
    snapshot("2" to ChatBadgeCounter.Snapshot(1, 11), at = 100); count(2)
    counter.read("2", 12, 140)
    snapshot("2" to ChatBadgeCounter.Snapshot(2, 12), at = 130); count(0)
    check(!counter.snapshot(mapOf("2" to ChatBadgeCounter.Snapshot(99, 99)), 125)); count(0)
    counter.clear()

    // An empty snapshot must retain messages delivered during the request and
    // remember older read IDs so a late realtime duplicate does not restore them.
    counter.message("2", 1, 20); counter.message("2", 2, 110)
    snapshot(at = 100); count(1)
    counter.message("2", 1, 130); counter.message("2", 2, 140); count(1)
    counter.read("2", null, 150); count(0)
    counter.message("2", 2, 160); count(0)
    counter.message("2", 3, 170); count(1)

    counter.clear()
    snapshot("2" to ChatBadgeCounter.Snapshot(5, 20))
    counter.read("2", null, 110); counter.message("2", 21, 120)
    snapshot("2" to ChatBadgeCounter.Snapshot(1, 21), "group:3" to ChatBadgeCounter.Snapshot(2, 30), at = 100)
    count(3) // An unbounded read must not erase a message committed after the read.

    counter.clear()
    snapshot("group:3" to ChatBadgeCounter.Snapshot(20, 100))
    counter.read("group:3", 90, 2); count(20) // Partial old-page read cannot erase newer unread base.
    counter.read("group:3", 100, 3); count(0)
    counter.clear()
    for (id in 1L..1500L) counter.message("2", id, id + 100)
    count(1500)
    check(counter.buckets["2"]!!.pending.size <= 512)
    check(!counter.snapshot(emptyMap(), 1)); count(1500) // Too-old response cannot lose journal entries.
    counter.clear(); count(0)
    println("PASS native badge reducer: snapshots, duplicate/out-of-order delivery, read cutoffs, in-flight races, account reset and bounded journal")
}
