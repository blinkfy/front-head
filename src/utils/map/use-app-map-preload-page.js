import { getAppCurrentPages } from '@/utils/app-tab-context.js'
import { onScopeDispose, watch } from 'vue'
import { onHide, onReady, onShow, onUnload } from '@/utils/app-tab-lifecycle.js'
import { setAppMapPreloadPageIdle } from './app-map-preload-app.js'

export function useAppMapPreloadPage(isIdle = () => true) {
  let page = null
  let ready = false
  const sync = () => setAppMapPreloadPageIdle(page, ready && isIdle())
  const leave = () => {
    setAppMapPreloadPageIdle(page, false)
    page = null
  }

  onShow(() => { page = getAppCurrentPages().slice(-1)[0]; sync() })
  onReady(() => { ready = true; sync() })
  onHide(leave)
  onUnload(leave)
  onScopeDispose(leave)
  return sync
}

export function useAppHomeMapPreload(processing, showingOnboarding) {
  let choosing = false
  const sync = useAppMapPreloadPage(() => !choosing && !processing.value && !showingOnboarding.value)
  watch([processing, showingOnboarding], sync, { flush: 'sync' })

  return {
    startChoosing() {
      if (choosing) return false
      choosing = true
      sync()
      return true
    },
    finishChoosing() {
      choosing = false
      sync()
    }
  }
}
