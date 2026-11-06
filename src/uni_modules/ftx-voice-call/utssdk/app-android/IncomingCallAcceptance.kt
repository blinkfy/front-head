package ftx.voice

// One-shot, in-memory user consent; never trusted from an Intent or URL.
class IncomingCallAcceptance(private val now: () -> Long = { System.nanoTime() / 1000000 }) {
    private var id = ""
    private var owner = ""
    private var until = 0L
    private var accepted = false
    @Synchronized fun offer(call: String, account: String, duration: Long = 30000) {
        id = call; owner = account; until = now() + duration; accepted = false
    }
    @Synchronized fun pending(call: String, account: String): Boolean =
        id == call && owner == account && now() < until
    @Synchronized fun accept(call: String, account: String): Boolean {
        if (!pending(call, account) || accepted) return false
        accepted = true; return true
    }
    @Synchronized fun consume(call: String, account: String): Boolean {
        if (!accepted || !pending(call, account)) return false
        clear(); return true
    }
    @Synchronized fun cancelAcceptance(call: String) { if (id == call) accepted = false }
    @Synchronized fun clear(call: String = id) {
        if (id == call) { id = ""; owner = ""; until = 0; accepted = false }
    }
}
