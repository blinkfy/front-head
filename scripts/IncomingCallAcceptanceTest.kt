package ftx.voice

private fun checkThat(value: Boolean, message: String) {
    if (!value) error(message)
}

fun main() {
    var clock = 1000L
    val gate = IncomingCallAcceptance { clock }

    gate.offer("call-1", "account-A")
    checkThat(gate.pending("call-1", "account-A"), "offered call should be pending for its account")
    checkThat(!gate.pending("call-1", "account-B"), "wrong account must not observe the offer")
    checkThat(!gate.accept("call-other", "account-A"), "wrong call cannot be accepted")
    checkThat(!gate.accept("call-1", "account-B"), "wrong account cannot accept")
    checkThat(gate.accept("call-1", "account-A"), "user acceptance should be recorded")
    checkThat(!gate.accept("call-1", "account-A"), "acceptance cannot be duplicated")
    checkThat(!gate.consume("call-1", "account-B"), "wrong account cannot consume acceptance")
    checkThat(!gate.consume("call-other", "account-A"), "wrong call cannot consume acceptance")
    checkThat(gate.consume("call-1", "account-A"), "accepted call should be consumed")
    checkThat(!gate.consume("call-1", "account-A"), "consumption is one-shot")

    gate.offer("call-cancel", "account-A")
    checkThat(gate.accept("call-cancel", "account-A"), "cancel test accepts first")
    gate.cancelAcceptance("call-cancel")
    checkThat(!gate.consume("call-cancel", "account-A"), "cancelled acceptance must not consume")

    gate.offer("call-expire", "account-A", 30)
    checkThat(gate.accept("call-expire", "account-A"), "expiry test accepts first")
    clock += 30
    checkThat(!gate.pending("call-expire", "account-A"), "offer expires at the deadline")
    checkThat(!gate.consume("call-expire", "account-A"), "expired acceptance cannot consume")

    gate.offer("call-old", "account-A")
    checkThat(gate.accept("call-old", "account-A"), "replacement test accepts old call")
    gate.offer("call-new", "account-A")
    checkThat(!gate.consume("call-old", "account-A"), "replacement invalidates previous acceptance")
    checkThat(!gate.consume("call-new", "account-A"), "replacement itself still requires explicit acceptance")
    checkThat(gate.accept("call-new", "account-A"), "replacement can be accepted")
    gate.clear("call-new")
    checkThat(!gate.pending("call-new", "account-A"), "clear removes pending offer")
    checkThat(!gate.consume("call-new", "account-A"), "cleared acceptance cannot consume")

    println("PASS IncomingCallAcceptance gate")
}
