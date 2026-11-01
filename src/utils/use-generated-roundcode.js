import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { registerGeneratedCodeImage, forgetGeneratedCodeImage } from './roundcode-client.js'
import { createRoundCodePreparationProgress } from './roundcode-preparation-progress.mjs'

// Callers may start from a generated URL before the visible image has loaded.
// Only a successful registration acknowledgement makes a code APP-ready.
export function useGeneratedRoundCode(source, ready) {
  let active = true, disposed = false, revision = 0, staged = null
  const state = ref('idle')
  const progress = ref(0), phase = ref('idle')
  const estimate = createRoundCodePreparationProgress({ onChange: next => { progress.value = next.value; phase.value = next.phase } })
  const offer = () => {
    if (!active || disposed || staged || !ready()) return
    const url = source.value, currentRevision = revision
    if (!url) return
    const current = () => active && !disposed && revision === currentRevision && source.value === url && ready()
    if (state.value !== 'registered') { state.value = 'preparing'; estimate.update('image') }
    void Promise.resolve(registerGeneratedCodeImage(url, current, (next, fraction) => {
      if (current() && !staged) estimate.update(next, fraction)
    })).then(result => {
      if (!current() || staged) return
      state.value = result?.status || 'unsupported'
      if (state.value === 'registered') estimate.update('registered')
      else estimate.stop()
    }, () => { if (current() && !staged) { state.value = 'failed'; estimate.stop() } })
  }
  const cancelStaged = () => {
    if (!staged) return
    forgetGeneratedCodeImage(staged.url); staged.cancelLoad?.(); staged = null
  }
  async function prepareRefresh(url, isCurrent) {
    cancelStaged()
    const wasRegistered = state.value === 'registered'
    const job = { url }
    staged = job
    const current = () => active && !disposed && staged === job && isCurrent()
    estimate.reset(); estimate.update('image'); state.value = 'preparing'
    try {
      const result = await registerGeneratedCodeImage(url, current, (next, fraction) => {
        if (current()) estimate.update(next, fraction)
      })
      if (!current()) return { status: 'inactive' }
      // Once this browser registered the old code, a missing new receipt is a refresh failure.
      if (wasRegistered && result?.status === 'unsupported') return { status: 'failed' }
      // Validate the next visible image too; a registration receipt alone cannot prevent a blank swap.
      if (['registered', 'unsupported'].includes(result?.status)) {
        // #ifdef H5
        const loaded = await new Promise(resolve => {
          const image = new Image()
          const finish = value => {
            clearTimeout(timer); image.onload = image.onerror = null; job.cancelLoad = null
            if (!value) image.src = ''
            resolve(value)
          }
          const timer = setTimeout(() => finish(false), 15000)
          job.cancelLoad = () => finish(false)
          image.onload = () => finish(true); image.onerror = () => finish(false); image.src = url
        })
        if (!loaded) return { status: 'failed' }
        // #endif
        // #ifdef APP-PLUS
        const loaded = await new Promise(resolve => {
          let settled = false
          const finish = value => {
            if (settled) return
            settled = true; clearTimeout(timer); job.cancelLoad = null; resolve(value)
          }
          const timer = setTimeout(() => finish(false), 15000)
          job.cancelLoad = () => finish(false)
          uni.getImageInfo({ src: url, success: () => finish(true), fail: () => finish(false) })
        })
        if (!loaded) return { status: 'failed' }
        // #endif
      }
      if (!current()) return { status: 'inactive' }
      state.value = result?.status || 'unsupported'
      return result || { status: 'unsupported' }
    } finally {
      if (staged === job) { staged = null; estimate.stop(); offer() }
    }
  }
  watch([source, ready], (_, previous) => {
    if (previous?.[0] !== source.value) { revision++; state.value = 'idle'; estimate.reset(); forgetGeneratedCodeImage(previous?.[0]) }
    if (!ready()) { estimate.stop(); cancelStaged(); forgetGeneratedCodeImage(source.value) }
    offer()
  }, { flush: 'post' })
  onShow(() => { active = true; offer() })
  onHide(() => { active = false; revision++; estimate.stop(); cancelStaged(); forgetGeneratedCodeImage(source.value) })
  const stop = () => { disposed = true; active = false; revision++; estimate.stop(); cancelStaged(); forgetGeneratedCodeImage(source.value) }
  onUnload(stop)
  onBeforeUnmount(stop)
  // #ifdef H5
  const visibilityChanged = () => {
    active = !document.hidden
    revision++
    if (active) offer()
    else { estimate.stop(); cancelStaged(); forgetGeneratedCodeImage(source.value) }
  }
  onMounted(() => { document.addEventListener('visibilitychange', visibilityChanged); active = !document.hidden; offer() })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', visibilityChanged))
  // #endif
  return { state, progress, phase, prepareRefresh }
}
