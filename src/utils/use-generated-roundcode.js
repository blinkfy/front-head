import { watch, onMounted, onBeforeUnmount } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { registerGeneratedCodeImage, forgetGeneratedCodeImage } from './roundcode-client.js'

// No rendering changes: only react after the original image has loaded successfully.
export function useGeneratedRoundCode(source, ready) {
  let active = true, disposed = false, revision = 0
  const offer = () => {
    if (!active || disposed || !ready()) return
    const url = source.value, currentRevision = revision
    void registerGeneratedCodeImage(url, () => active && !disposed && revision === currentRevision && source.value === url && ready())
  }
  watch([source, ready], (_, previous) => {
    if (previous?.[0] !== source.value) forgetGeneratedCodeImage(previous?.[0])
    if (!ready()) forgetGeneratedCodeImage(source.value)
    offer()
  }, { flush: 'post' })
  onShow(() => { active = true; offer() })
  onHide(() => { active = false; revision++; forgetGeneratedCodeImage(source.value) })
  const stop = () => { disposed = true; active = false; revision++; forgetGeneratedCodeImage(source.value) }
  onUnload(stop)
  onBeforeUnmount(stop)
  // #ifdef H5
  const visibilityChanged = () => {
    active = !document.hidden
    revision++
    if (active) offer()
    else forgetGeneratedCodeImage(source.value)
  }
  onMounted(() => { document.addEventListener('visibilitychange', visibilityChanged); active = !document.hidden; offer() })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', visibilityChanged))
  // #endif
}
