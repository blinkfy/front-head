export const UI_SOUND_STORAGE_KEY = 'ui_sounds_enabled_v1'

export const UI_SOUNDS = {
  confirm: { file: '01-confirm.mp3', duration: 300, volume: 0.65 },
  glide: { file: '02-glide.mp3', duration: 440, volume: 0.55 },
  success: { file: '03-success.mp3', duration: 720, volume: 0.65 },
  retry: { file: '04-retry.mp3', duration: 540, volume: 0.55 },
  reveal: { file: '05-reveal.mp3', duration: 780, volume: 0.60 },
  reward: { file: '06-reward.mp3', duration: 1000, volume: 0.65 }
}

export const UI_SOUND_EVENTS = {
  confirm: { sound: 'confirm', priority: 1 },
  scanDetected: { sound: 'confirm', priority: 2, scanCue: true },
  preview: { sound: 'success', priority: 3, startTimeout: 5000 },
  recognitionStart: { sound: 'glide', priority: 1 },
  recognitionSuccess: { sound: 'success', priority: 3 },
  recognitionFail: { sound: 'retry', priority: 2 },
  upcyclingComplete: { sound: 'reveal', priority: 2 },
  answerCorrect: { sound: 'confirm', priority: 1 },
  answerWrong: { sound: 'retry', priority: 1 },
  challengeComplete: { sound: 'reward', priority: 3 },
  lotteryStart: { sound: 'glide', priority: 1 },
  lotteryWin: { sound: 'reward', priority: 3 },
  lotteryMiss: { sound: 'confirm', priority: 2 },
  redeemSuccess: { sound: 'success', priority: 3 },
  bookingSuccess: { sound: 'success', priority: 3 },
  deviceConnected: { sound: 'success', priority: 3 },
  achievementUnlock: { sound: 'reward', priority: 4 }
}

// No business flow awaits audio. Failed loads, muted devices and unavailable
// audio APIs must all behave like an intentionally silent interaction.
export function createUiSoundController({ getStoredEnabled = () => undefined,
  storeEnabled = () => {}, createDriver, now = Date.now, getPage = () => '',
  getOwner = () => '', isVisible = () => true } = {}) {
  let enabled = true
  try { enabled = ![false, 'false', 0, '0'].includes(getStoredEnabled()) } catch (_) {}
  let active = true
  let disposed = false
  let driver = null
  let current = null
  let generation = 0
  let lastPlayed = -Infinity
  const blocked = new Set()
  const played = new Map()
  const pageName = value => String(value || '').replace(/^\//, '').split('?')[0]
  const safe = (fn, fallback) => { try { return fn() } catch (_) { return fallback } }
  const available = () => !disposed && enabled && active && !blocked.size && safe(isVisible, false)

  function stop(options) {
    generation++
    current = null
    safe(() => driver?.stop(options))
  }
  function play(event, options = {}) {
    const definition = Object.prototype.hasOwnProperty.call(UI_SOUND_EVENTS, event) ? UI_SOUND_EVENTS[event] : null
    if (!definition || !available()) return false
    const page = pageName(safe(getPage, ''))
    const requested = options.page == null ? null : (Array.isArray(options.page) ? options.page : [options.page]).map(pageName)
    if (requested && !requested.includes(page)) return false
    const startedAt = now()
    const priority = definition.priority
    const startTimeout = definition.startTimeout || 650
    const key = options.key ? `${safe(getOwner, '')}:${event}:${String(options.key)}` : ''
    if (key && played.has(key)) return false
    if (current && startedAt < current.until && priority <= current.priority) return false
    // A real completion may replace an entry sound immediately, but repeated
    // low-priority taps cannot pile up or make a burst of sound.
    if (startedAt - lastPlayed < 100 && priority <= (current?.priority || 1)) return false
    stop()
    const requestId = generation
    const sound = { ...UI_SOUNDS[definition.sound], id: definition.sound, ...(definition.scanCue ? { scanCue: true } : {}) }
    const canStart = () => generation === requestId && available() &&
      pageName(safe(getPage, '')) === page && now() - startedAt <= startTimeout
    const onEnded = () => { if (generation === requestId) current = null }
    const onFailure = error => {
      onEnded()
      if (generation === requestId && available() && pageName(safe(getPage, '')) === page) {
        safe(() => options.onFailure?.(error))
      }
    }
    try {
      driver ||= createDriver?.()
      if (!driver?.play) { onFailure(new Error('UI audio is unavailable')); return false }
      current = { priority, until: startedAt + sound.duration + startTimeout }
      lastPlayed = startedAt
      if (key) {
        played.set(key, true)
        while (played.size > 200) played.delete(played.keys().next().value)
      }
      Promise.resolve(driver.play(sound, { canStart, onEnded, startTimeout })).then(result => {
        if (result === false) onFailure(new Error('UI audio did not start'))
      }).catch(onFailure)
      return true
    } catch (error) { onFailure(error); return false }
  }
  return {
    isEnabled: () => enabled,
    setEnabled(value) { enabled = !!value; safe(() => storeEnabled(enabled)); if (!enabled) stop() },
    setActive(value) { active = !!value; if (!active) stop() },
    setBlocked(reason, value) { if (value) { blocked.add(reason); stop() } else blocked.delete(reason) },
    play,
    stop,
    dispose() { stop(); disposed = true; played.clear(); blocked.clear(); safe(() => driver?.dispose()); driver = null }
  }
}
