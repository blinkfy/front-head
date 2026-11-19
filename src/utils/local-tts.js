import { ref, shallowRef } from 'vue'
// #ifdef APP-PLUS
import { probeLocalTts, speakLocalTts, stopLocalTts } from '@/uni_modules/ftx-local-tts'
// #endif

export const localSpeechAvailable = ref(false)
export const localSpeechOwner = shallowRef(null)

let active = null
let platform = null
let requestId = 0
let foreground = true

// #ifdef H5
let observedSynth
function refreshBrowserVoice() {
  const synth = globalThis.speechSynthesis
  const Utterance = globalThis.SpeechSynthesisUtterance
  if (!synth?.getVoices || !Utterance) return
  if (observedSynth !== synth) {
    observedSynth = synth
    synth.addEventListener?.('voiceschanged', refreshBrowserVoice)
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (globalThis.document.hidden) stopLocalSpeech()
    })
  }
  const voices = synth.getVoices().filter(voice => voice.localService === true && /^zh(?:[-_]|$)/i.test(voice.lang))
  const voice = voices.find(item => /^zh-(?:CN|Hans)(?:-|$)/i.test(item.lang)) || voices[0]
  platform = voice ? {
    speak(text, id, done) {
      const utterance = new Utterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.onend = () => done(true)
      utterance.onerror = () => done(false)
      synth.speak(utterance)
      return utterance
    },
    stop: () => synth.cancel()
  } : null
  localSpeechAvailable.value = !!platform
  if (!voice) stopLocalSpeech()
}
// #endif

// #ifdef APP-PLUS
let pendingProbe = false
function refreshAppVoice() {
  if (pendingProbe) return
  pendingProbe = true
  const complete = available => {
    pendingProbe = false
    platform = available ? { speak: speakLocalTts, stop: stopLocalTts } : null
    localSpeechAvailable.value = available
    if (!available) stopLocalSpeech()
  }
  try { probeLocalTts(complete) } catch (_) { complete(false) }
}
// #endif

export function refreshLocalSpeech() {
  // #ifdef H5
  refreshBrowserVoice()
  // #endif
  // #ifdef APP-PLUS
  refreshAppVoice()
  // #endif
}

export function stopLocalSpeech(owner) {
  if (!active || (owner && active.owner !== owner)) return
  const job = active
  active = null
  localSpeechOwner.value = null
  clearTimeout(job.timer)
  try { job.platform.stop(job.id) } catch (_) {}
}

export function setLocalSpeechForeground(visible) {
  foreground = visible
  if (!visible) stopLocalSpeech()
}

export function playLocalSpeech(owner, text) {
  if (!foreground || !platform || !text.trim()) return false
  // #ifdef H5
  if (globalThis.document?.hidden) return false
  // #endif
  stopLocalSpeech()
  // Browsers can cut off long utterances. Prefer sentence breaks and keep each chunk short.
  const chunks = (text.match(/[^。！？；\n]{1,70}[。！？；\n]*|[。！？；\n]+/gu) || []).map(chunk => chunk.trim()).filter(Boolean)
  let position = 0
  const job = { owner, platform, id: '', timer: null, utterance: null }
  active = job
  localSpeechOwner.value = owner
  function next() {
    const chunk = chunks[position++]
    if (!chunk) {
      active = null
      localSpeechOwner.value = null
      return
    }
    const id = `${Date.now()}-${++requestId}`
    job.id = id
    job.timer = setTimeout(() => { if (active === job && job.id === id) stopLocalSpeech(owner) }, 45000)
    try {
      // Keep the browser utterance reachable until its callback fires.
      job.utterance = job.platform.speak(chunk, id, ok => {
        if (active !== job || job.id !== id) return
        clearTimeout(job.timer)
        if (ok) next()
        else {
          stopLocalSpeech(owner)
          refreshLocalSpeech()
        }
      })
    } catch (_) { stopLocalSpeech(owner) }
  }
  next()
  return true
}
