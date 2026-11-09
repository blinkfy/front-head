const validId = value => /^[A-Za-z0-9_-]{12,80}$/.test(value || '')

// A foreground notification inbox, never a media peer or a second call session.
export function createMiniCallInbox({ state, send, identity, show, open, entry, notify = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let foreground = false, supported = false, owner = '', timer
  const reset = () => {
    clearTimer(timer); timer = null; owner = ''
    Object.assign(state, { callId: '', peer: null, mode: 'audio', opening: false, error: '' })
  }
  const current = (id, account) => foreground && state.callId === id && owner === account && identity().token === account
  return {
    state,
    connection(event) {
      reset(); supported = event?.voiceIncomingVersion === 1
      if (supported) send({ type: 'voice.listen', version: 1, available: foreground })
    },
    foreground(value) {
      const changed = foreground !== !!value
      foreground = !!value
      if (!foreground) reset()
      if (supported && changed) send({ type: 'voice.listen', version: 1, available: foreground })
    },
    handle(event) {
      if (event.type === 'voice.alert-ended') { if (state.callId === event.callId) reset(); return true }
      if (event.type !== 'voice.alert') return false
      const account = identity()
      if (!supported || !foreground || !account.token || !validId(event.callId) ||
        !['audio', 'video'].includes(event.mode) || !/^[1-9]\d{0,9}$/.test(String(event.peer?.id)) ||
        String(event.peer.id) === String(account.id) || state.callId === event.callId) return true
      reset(); owner = account.token
      const peer = { id: String(event.peer.id), name: String(event.peer.name || '联系人').slice(0, 80) }
      if (typeof event.peer.avatar === 'string') peer.avatar = event.peer.avatar
      Object.assign(state, { callId: event.callId, peer, mode: event.mode })
      const id = state.callId
      timer = setTimer(() => { if (state.callId === id) reset() }, 35000)
      notify()
      show(() => { if (state.callId === id) this.reject() })
      return true
    },
    async accept() {
      if (!state.callId || state.opening) return
      const id = state.callId, account = owner, offer = { ...state, peer: { ...state.peer } }
      if (!current(id, account)) { reset(); return }
      state.opening = true; state.error = ''
      try {
        const url = await entry(offer)
        if (!current(id, account)) return
        if (!url) throw new Error('暂时无法打开通话，请稍后重试')
        await open(url)
      } catch (error) { if (current(id, account)) { state.opening = false; state.error = error.message || '暂时无法打开通话' } }
    },
    reject() {
      if (state.callId && current(state.callId, owner) && !state.opening) send({ type: 'voice.alert-reject', callId: state.callId })
      reset()
    },
  }
}
