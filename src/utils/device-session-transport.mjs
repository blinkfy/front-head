// One lazy socket serves all active device-session consumers in this client.
export function createDeviceSessionTransport(runtime) {
  const subscribers = new Map()
  const acknowledged = new Set()
  let socket = null
  let ready = false
  let tokenUsed = ''
  let blockedToken = null
  let retries = 0
  let retryTimer = null
  let handshakeTimer = null
  let heartbeatTimer = null
  let pongTimer = null
  const schedule = runtime.setTimeout || setTimeout
  const cancel = runtime.clearTimeout || clearTimeout
  const random = runtime.random || Math.random

  function notify(deviceId, method, value) {
    for (const listener of subscribers.get(deviceId) || []) {
      try { listener[method]?.(value) } catch (_) { /* A view cannot break the shared connection. */ }
    }
  }

  function clearTimers() {
    for (const timer of [retryTimer, handshakeTimer, heartbeatTimer, pongTimer]) cancel(timer)
    retryTimer = handshakeTimer = heartbeatTimer = pongTimer = null
  }

  function drop() {
    const previous = socket
    socket = null
    ready = false
    acknowledged.clear()
    clearTimers()
    try { previous?.close({}) } catch (_) {}
    for (const deviceId of subscribers.keys()) notify(deviceId, 'onState', 'offline')
  }

  function reconnectLater() {
    if (!subscribers.size || retryTimer !== null) return
    const token = runtime.getToken()
    if (!token || token === blockedToken) return
    const delay = Math.min(30000, 1000 * (2 ** Math.min(retries++, 5)) * (.8 + random() * .4))
    retryTimer = schedule(() => { retryTimer = null; connect() }, delay)
  }

  function fail() {
    drop()
    reconnectLater()
  }

  function send(body) {
    if (!socket) return
    const current = socket
    try {
      current.send({ data: JSON.stringify(body), fail: () => { if (socket === current) fail() } })
    } catch (_) { if (socket === current) fail() }
  }

  function heartbeat() {
    heartbeatTimer = schedule(() => {
      if (!socket || !ready) return
      if (runtime.getToken() !== tokenUsed) { fail(); return }
      // Install the timeout before sending, including for synchronous test runtimes.
      pongTimer = schedule(fail, 10000)
      send({ type: 'ping' })
    }, 25000)
  }

  function connect() {
    if (socket || !subscribers.size) return
    const token = runtime.getToken()
    if (!token || token === blockedToken) return
    if (blockedToken !== token) blockedToken = null
    tokenUsed = token
    for (const deviceId of subscribers.keys()) notify(deviceId, 'onState', 'connecting')
    let current
    try {
      const base = runtime.getBaseUrl().replace(/\/$/, '').replace(/^http/i, 'ws')
      current = runtime.connectSocket({ url: `${base}/ws/device/session?token=${encodeURIComponent(token)}`, complete: () => {} })
      if (!current?.onMessage || !current?.onClose || !current?.onOpen || !current?.onError) throw new Error('SocketTask unavailable')
      socket = current
      handshakeTimer = schedule(fail, 5000)
      current.onOpen(() => { /* Opening alone does not prove the server supports this protocol. */ })
      current.onError(() => { if (socket === current) fail() })
      current.onClose(event => {
        if (socket !== current) return
        if (event?.code === 1008) blockedToken = tokenUsed
        fail()
      })
      current.onMessage(event => {
        if (socket !== current) return
        let message
        try { message = JSON.parse(event.data) } catch (_) { return }
        if (message?.type === 'error' && (message.code === 401 || message.code === 403)) {
          blockedToken = tokenUsed
          fail()
          return
        }
        if (message?.type === 'ready') {
          if (message.version !== 1 || !message.capabilities?.includes('device.session.changed')) { fail(); return }
          ready = true
          for (const deviceId of subscribers.keys()) send({ type: 'subscribe', deviceId })
        } else if (message?.type === 'subscribed' && ready && message.version === 1) {
          const deviceId = String(message.deviceId)
          if (!subscribers.has(deviceId)) return
          acknowledged.add(deviceId)
          retries = 0
          if ([...subscribers.keys()].every(id => acknowledged.has(id))) {
            cancel(handshakeTimer)
            handshakeTimer = null
          }
          notify(deviceId, 'onState', 'online')
          if (heartbeatTimer === null && pongTimer === null) heartbeat()
        } else if (message?.type === 'pong') {
          if (pongTimer === null) return
          cancel(pongTimer)
          pongTimer = null
          heartbeatTimer = null
          heartbeat()
        } else if (message?.type === 'device.session.changed' && ready && message.version === 1) {
          const deviceId = String(message.deviceId)
          if (acknowledged.has(deviceId)) notify(deviceId, 'onChange', message)
        }
      })
    } catch (_) {
      try { current?.close({}) } catch (_) {}
      fail()
    }
  }

  function subscribe(deviceId, listener) {
    const id = String(deviceId)
    const isNew = !subscribers.has(id)
    if (isNew) subscribers.set(id, new Set())
    subscribers.get(id).add(listener)
    if (socket && runtime.getToken() !== tokenUsed) drop()
    notify(id, 'onState', acknowledged.has(id) ? 'online' : socket ? 'connecting' : 'offline')
    if (ready && isNew) {
      send({ type: 'subscribe', deviceId: id })
      // A missing subscription acknowledgement must not disable fallback polling.
      cancel(handshakeTimer)
      handshakeTimer = schedule(fail, 5000)
    } else if (!socket) {
      cancel(retryTimer)
      retryTimer = null
      connect()
    }
    return () => {
      const listeners = subscribers.get(id)
      listeners?.delete(listener)
      if (listeners?.size) return
      subscribers.delete(id)
      acknowledged.delete(id)
      if (!subscribers.size) {
        drop()
        retries = 0
      } else if (ready) {
        send({ type: 'unsubscribe', deviceId: id })
        if ([...subscribers.keys()].every(key => acknowledged.has(key))) {
          cancel(handshakeTimer)
          handshakeTimer = null
        }
      }
    }
  }

  return { subscribe }
}
