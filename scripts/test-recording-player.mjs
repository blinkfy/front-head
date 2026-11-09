import assert from 'node:assert/strict'
import fs from 'node:fs'

class Element extends EventTarget {
  constructor() {
    super(); this.value = '0'; this.disabled = false; this.attributes = new Map(); this.styles = new Map()
    this.style = { setProperty: (key, value) => this.styles.set(key, value) }
    this.classList = { toggle() {} }
    this.children = new Map()
  }
  set innerHTML(value) { this.html = value }
  querySelector(selector) { if (!this.children.has(selector)) this.children.set(selector, new Element()); return this.children.get(selector) }
  setAttribute(key, value) { this.attributes.set(key, value) }
  replaceChildren(...children) { this.nodes = children }
  remove() { this.removed = true }
}
class Audio extends Element {
  constructor() { super(); this.duration = Infinity; this.currentTime = 0; this.readyState = 0; this.paused = true; this.ended = false }
  async play() { this.paused = false; this.ended = false; this.dispatchEvent(new Event('play')) }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  removeAttribute() {}
  load() { this.dispatchEvent(new Event('error')) }
}
globalThis.document = { createElement: () => new Element() }
const source = fs.readFileSync(new URL('../src/embedded-call/recording-player.js', import.meta.url), 'utf8')
const { createRecordingPlayer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const emit = (element, name) => element.dispatchEvent(new Event(name))
const h = (durationMs = 4000) => {
  const audio = new Audio(), host = new Element(), errors = []
  const player = createRecordingPlayer(audio, host, { durationMs, onError: message => errors.push(message) })
  const root = host.nodes[0], seek = root.querySelector('.recording-seek'), toggle = root.querySelector('.recording-toggle')
  return { audio, root, seek, toggle, player, errors }
}
{
  const { audio, root, seek, toggle, player, errors } = h()
  assert.equal(seek.value, '0')
  assert.equal(seek.disabled, true)
  audio.readyState = 1; emit(audio, 'loadedmetadata')
  assert.equal(seek.disabled, false, 'saved duration supports media with Infinity duration')
  await player.play(); audio.currentTime = 1; emit(audio, 'timeupdate')
  assert.equal(seek.value, '250'); assert.equal(toggle.attributes.get('aria-label'), '暂停录音')
  audio.pause(); audio.currentTime = 0.5; emit(audio, 'timeupdate')
  audio.duration = 20; emit(audio, 'durationchange')
  assert.equal(seek.value, '250', 'paused progress does not drift backwards with native clock/metadata updates')
  seek.value = '500'; emit(seek, 'input')
  audio.currentTime = 1.2; emit(audio, 'timeupdate')
  assert.equal(seek.value, '500', 'time updates cannot fight a user dragging the seek bar')
  emit(seek, 'change')
  assert.equal(audio.currentTime, 2); assert.equal(audio.paused, true)
  assert.equal(root.querySelector('.recording-elapsed').textContent, '0:02')
  await player.play(); audio.currentTime = 4; audio.ended = true; audio.paused = true; emit(audio, 'ended')
  assert.equal(seek.value, '1000')
  await player.play()
  assert.equal(audio.currentTime, 0); assert.equal(seek.value, '0', 'replay resets the timeline')
  player.dispose(); player.dispose()
  assert.equal(root.removed, true); assert.equal(audio.removed, true)
  assert.equal(errors.length, 0, 'disposal removes error listeners before aborting media loading')
  emit(audio, 'timeupdate'); emit(toggle, 'click')
  assert.equal(audio.paused, true)
}
{
  const { audio, seek, player } = h(0)
  audio.readyState = 1; emit(audio, 'loadedmetadata')
  assert.equal(seek.disabled, true, 'unknown duration cannot produce invalid seek percentages')
  audio.duration = 8; emit(audio, 'durationchange')
  assert.equal(seek.disabled, false)
  await player.play(); audio.currentTime = 2; emit(audio, 'timeupdate')
  assert.equal(seek.value, '250', 'old rows with missing duration use finite media metadata')
  player.dispose()
}
delete globalThis.document
console.log('PASS recording timeline, unknown duration, pause stability, seek, replay and cleanup')
