import { getPendingTabTransition } from '@/utils/tab-page-transition.js'

const PAGE_TRANSITION_DURATION = 180

const PAGE_TRANSITIONS = {
  navigateTo: 'slide-in-right',
  navigateBack: 'slide-out-right'
}

export function installPageTransitions() {
  // #ifdef H5 || APP-PLUS
  if (typeof uni === 'undefined') return

  Object.entries(PAGE_TRANSITIONS).forEach(([apiName, animationType]) => {
    const original = uni[apiName]
    if (typeof original !== 'function' || original.__pageTransitionWrapped) return

    const wrapped = function (options = {}) {
      const pageOptions = options && typeof options === 'object' ? options : {}
      const tabTransition = apiName === 'navigateTo'
        ? getPendingTabTransition(pageOptions.url)
        : null
      return original.call(this, {
        animationType: tabTransition ? 'none' : animationType,
        animationDuration: PAGE_TRANSITION_DURATION,
        ...pageOptions
      })
    }

    wrapped.__pageTransitionWrapped = true
    uni[apiName] = wrapped
  })
  // #endif
}
