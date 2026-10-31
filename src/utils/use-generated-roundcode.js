import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { registerGeneratedCodeImage, forgetGeneratedCodeImage } from './roundcode-client.js'
import { createRoundCodePreparationProgress } from './roundcode-preparation-progress.mjs'

// Callers may start from a generated URL before the visible image has loaded.
// Only a successful registration acknowledgement makes a code APP-ready.
export function useGeneratedRoundCode(source, ready) {
  let active = true, disposed = false, revision = 0
  const state = ref('idle')
  const progress = ref(0), phase = ref('idle')
  const estimate = createRoundCodePreparationProgress({ onChange: next => { progress.value = next.value; phase.value = next.phase } })
  const offer = () => {
    if (!active || disposed || !ready()) return
    const url = source.value, currentRevision = revision
    if (!url) return
    const current = () => active && !disposed && revision === currentRevision && source.value === url && ready()
    if (state.value !== 'registered') { state.value = 'preparing'; estimate.update('image') }
    void Promise.resolve(registerGeneratedCodeImage(url, current, (next, fraction) => {
      if (current()) estimate.update(next, fraction)
    })).then(result => {
      if (!current()) return
      state.value = result?.status || 'unsupported'
      if (state.value === 'registered') estimate.update('registered')
      else estimate.stop()
    }, () => { if (current()) { state.value = 'failed'; estimate.stop() } })
  }
  watch([source, ready], (_, previous) => {
    if (previous?.[0] !== source.value) { revision++; state.value = 'idle'; estimate.reset(); forgetGeneratedCodeImage(previous?.[0]) }
    if (!ready()) { estimate.stop(); forgetGeneratedCodeImage(source.value) }
    offer()
  }, { flush: 'post' })
  onShow(() => { active = true; offer() })
  onHide(() => { active = false; revision++; estimate.stop(); forgetGeneratedCodeImage(source.value) })
  const stop = () => { disposed = true; active = false; revision++; estimate.stop(); forgetGeneratedCodeImage(source.value) }
  onUnload(stop)
  onBeforeUnmount(stop)
  // #ifdef H5
  const visibilityChanged = () => {
    active = !document.hidden
    revision++
    if (active) offer()
    else { estimate.stop(); forgetGeneratedCodeImage(source.value) }
  }
  onMounted(() => { document.addEventListener('visibilitychange', visibilityChanged); active = !document.hidden; offer() })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', visibilityChanged))
  // #endif
  return { state, progress, phase }
}
