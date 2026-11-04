// A single account-bound connection shared by all pages. HTTP polling is the fallback.
export function createChatEventsTransport({ getToken, getBaseUrl, connectSocket, onEvent, onConnected,
    setTimer = setTimeout, clearTimer = clearTimeout }) {
    let active = false, socket = null, identity = '', generation = 0, timer = null
    let retryAt = 0, attempts = 0, lastPong = 0, lastPing = 0, authenticated = false
    let previouslyConnected = false
    function close() {
        generation++
        const previous = socket
        socket = null
        authenticated = false
        try { previous?.close({ code: 1000, reason: 'Session changed' }) } catch (_) {}
    }
    function tick() {
        timer = null
        if (!active) return
        const token = String(getToken() || '')
        if (token !== identity) {
            close()
            previouslyConnected = false
            identity = token
            retryAt = 0
            attempts = 0
        }
        const now = Date.now()
        if (socket && now - lastPong > 45000) { close(); retryAt = now + 1000 }
        if (socket && authenticated && now - lastPing > 20000) {
            lastPing = now
            socket.send({ data: JSON.stringify({ type: 'ping' }), fail: () => close() })
        }
        if (token && !socket && now >= retryAt) {
            const version = ++generation
            lastPong = now
            lastPing = now
            try {
                const url = `${getBaseUrl().replace(/^http/, 'ws').replace(/\/$/, '')}/ws/chat/events?token=${encodeURIComponent(token)}`
                const current = connectSocket({ url, complete() {} })
                socket = current
                const valid = () => active && version === generation && token === String(getToken() || '')
                const disconnected = (event = {}) => {
                    if (version !== generation) return
                    close()
                    // An expired token must be replaced rather than retried in a tight loop.
                    retryAt = Date.now() + (event.code === 4001 ? 60000 : Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)))
                }
                current.onMessage(({ data }) => {
                    if (!valid()) return
                    try {
                        const event = JSON.parse(data)
                        lastPong = Date.now()
                        if (event.type === 'connected') {
                            authenticated = true
                            attempts = 0
                            const reconnected = previouslyConnected
                            previouslyConnected = true
                            onConnected?.({ ...event, reconnected })
                        }
                        else if (event.type === 'chat.changed' || event.type === 'community.changed') onEvent(event)
                    } catch (_) {}
                })
                current.onClose(disconnected)
                current.onError(disconnected)
            } catch (_) { close(); retryAt = now + 5000 }
        }
        timer = setTimer(tick, 1000)
    }
    return {
        isConnected() {
            return active && authenticated && !!socket && identity === String(getToken() || '') && Date.now() - lastPong <= 45000
        },
        setActive(value) {
            active = !!value
            if (timer) clearTimer(timer)
            timer = null
            if (active) tick()
            else { close(); identity = ''; retryAt = 0; previouslyConnected = false }
        }
    }
}
