package org.webrtc

// Cloud builds desugar EglBase's interface static factories separately from
// UTS Kotlin callers. Use the concrete constructor in this package so the
// caller never links to a static method removed from the EglBase interface.
object FtxEglBaseFactory {
    @JvmStatic fun create(): EglBase = EglBase14Impl(null, EglBase.CONFIG_PLAIN)
}
