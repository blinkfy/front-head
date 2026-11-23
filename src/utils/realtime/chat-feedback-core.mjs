// Chat-only policy: never change global volume, ringer mode or other UI feedback.
export function androidChatAlertPolicy(state = {}) {
  const allowed = state.notificationsEnabled === true && state.interruptionFilter === 1
  return {
    sound: allowed && state.ringerMode === 2 && state.notificationVolume > 0,
    vibrate: allowed && (state.ringerMode === 1 || (state.ringerMode === 2 && state.vibrateWhenRinging === true))
  }
}

export function createChatFeedback({ policy, enabled, driver, vibrate, getOwner = () => '', now = Date.now }) {
  let active = false, generation = 0
  let receivedAt = -Infinity, sentAt = -Infinity
  const blocked = new Set(), sent = new Set()
  function stop() { generation++; driver.stop() }
  function permitted() { return active && !blocked.size }
  async function cue(kind, options = {}) {
    if (!permitted()) return false
    const time = now(), owner = getOwner(), receiving = kind === 'received'
    if (time - (receiving ? receivedAt : sentAt) < (receiving ? 1200 : 200)) return false
    const settings = policy()
    const sound = options.sound !== false && enabled() && settings.sound
    const buzz = receiving && options.vibrate !== false && !options.quiet && settings.vibrate
    if (!sound && !buzz) return false
    if (receiving) receivedAt = time
    else sentAt = time
    // Vibration never waits for audio decoding or preparation.
    if (buzz) { try { vibrate() } catch (_) {} }
    if (!sound) return true
    stop()
    const version = generation
    const canStart = () => permitted() && owner === getOwner() && version === generation && now() - time < 400 && enabled() && policy().sound
    try { return await driver.play(kind, options.quiet ? 0.36 : receiving ? 0.68 : 0.48, canStart) } catch (_) { return false }
  }
  return {
    receive: options => cue('received', options),
    sent(key) {
      if (key && sent.has(key)) return Promise.resolve(false)
      if (key) { sent.add(key); if (sent.size > 128) sent.delete(sent.values().next().value) }
      return cue('sent', { vibrate: false })
    },
    setActive(value) { active = !!value; if (active) driver.warm(); else stop() },
    setBlocked(reason, value) { if (value) { blocked.add(reason); stop() } else blocked.delete(reason) },
    stop
  }
}
