const seconds = value => Number.isFinite(value) && value > 0 ? value : 0
const timeLabel = value => {
  const whole = Math.floor(Math.max(0, value))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function createRecordingPlayer(audio, host, { durationMs = 0, onError = () => {} } = {}) {
  const savedDuration = seconds(Number(durationMs) / 1000)
  let elapsed = 0, dragging = false, closed = false
  const root = document.createElement('div')
  root.className = 'recording-player'
  root.innerHTML = `<button type="button" class="recording-toggle" aria-label="播放录音"><span class="recording-play-icon" aria-hidden="true"></span></button>
    <div class="recording-timeline"><input class="recording-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="录音播放进度">
    <div class="recording-times"><span class="recording-elapsed">0:00</span><span class="recording-total">0:00</span></div></div>`
  const toggle = root.querySelector('.recording-toggle'), seek = root.querySelector('.recording-seek')
  const currentLabel = root.querySelector('.recording-elapsed'), totalLabel = root.querySelector('.recording-total')
  const total = () => savedDuration || seconds(audio.duration)
  const listeners = []
  const listen = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)) }
  const render = () => {
    if (closed) return
    const length = total()
    const position = length ? Math.min(length, Math.max(0, elapsed)) : Math.max(0, elapsed)
    const progress = length ? Math.round(position / length * 1000) : 0
    if (!dragging) seek.value = String(progress)
    seek.style.setProperty('--recording-progress', `${Number(seek.value) / 10}%`)
    seek.disabled = !length || audio.readyState < 1
    currentLabel.textContent = timeLabel(position)
    totalLabel.textContent = length ? timeLabel(length) : '--:--'
    seek.setAttribute('aria-valuetext', `${timeLabel(position)} / ${length ? timeLabel(length) : '未知时长'}`)
    toggle.setAttribute('aria-label', audio.paused ? audio.ended ? '重新播放录音' : '播放录音' : '暂停录音')
    root.classList.toggle('recording-playing', !audio.paused)
  }
  const update = force => {
    if (closed || dragging) return
    // A paused WebView may still emit metadata/time events. Do not animate a
    // paused position or use an unknown/infinite media duration as a percentage.
    if (force || !audio.paused || audio.seeking) elapsed = seconds(audio.currentTime)
    render()
  }
  const play = async () => {
    if (closed) return
    if (audio.ended) { audio.currentTime = 0; elapsed = 0; render() }
    try { await audio.play() }
    catch (error) { if (!closed && error.name !== 'AbortError') onError('暂时无法播放，请点击播放按钮重试') }
  }
  listen(toggle, 'click', () => {
    if (audio.paused) {
      void play()
      return
    }
    audio.pause()
    update(true)
  })
  listen(seek, 'input', () => {
    dragging = true
    elapsed = total() * Number(seek.value) / 1000
    render()
  })
  listen(seek, 'change', () => {
    const target = total() * Number(seek.value) / 1000
    dragging = false
    try { audio.currentTime = target; elapsed = target; render() }
    catch (_) { update(true); onError('暂时无法跳转，请播放后重试') }
  })
  listen(seek, 'pointercancel', () => { dragging = false; update(true) })
  for (const event of ['loadedmetadata', 'durationchange', 'canplay']) listen(audio, event, () => update(false))
  listen(audio, 'timeupdate', () => update(false))
  for (const event of ['play', 'pause', 'seeking', 'seeked']) listen(audio, event, () => update(true))
  listen(audio, 'ended', () => { elapsed = total() || seconds(audio.currentTime); render() })
  listen(audio, 'error', () => { if (!closed) onError('录音播放失败，请尝试导出后播放') })
  audio.controls = false
  audio.preload = 'metadata'
  audio.hidden = true
  host.replaceChildren(root, audio)
  render()
  return { play, dispose() {
    if (closed) return
    closed = true
    for (const remove of listeners) remove()
    audio.pause(); audio.removeAttribute('src'); audio.load()
    root.remove(); audio.remove()
  } }
}
