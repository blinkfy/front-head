import { onBeforeMount, onScopeDispose } from 'vue'
import * as pageHooks from '@dcloudio/uni-app'
import { useAppTabContext } from './app-tab-context.js'

export * from '@dcloudio/uni-app'

function hook(name, callback, target) {
  const context = useAppTabContext()
  if (!context) return pageHooks[name](callback, target)
  if (name === 'onLoad') { onBeforeMount(() => callback(context.options)); return }
  const listeners = context.hooks[name] ||= new Set()
  listeners.add(callback)
  onScopeDispose(() => listeners.delete(callback))
}

export const onLoad = (fn, target) => hook('onLoad', fn, target)
export const onReady = (fn, target) => hook('onReady', fn, target)
export const onShow = (fn, target) => hook('onShow', fn, target)
export const onHide = (fn, target) => hook('onHide', fn, target)
export const onUnload = (fn, target) => hook('onUnload', fn, target)
export const onPageScroll = (fn, target) => hook('onPageScroll', fn, target)
export const onResize = (fn, target) => hook('onResize', fn, target)
export const onBackPress = (fn, target) => hook('onBackPress', fn, target)

export function emitAppTabHook(context, name, event) {
  let handled = false
  for (const callback of context?.hooks[name] || []) {
    try {
      const result = callback(event)
      if (result === true) handled = true
      result?.catch?.(error => console.warn('[app-tabs] ' + name, error))
    } catch (error) { console.warn('[app-tabs] ' + name, error) }
  }
  return handled
}
