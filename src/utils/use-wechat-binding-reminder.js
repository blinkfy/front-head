import { onBeforeUnmount, ref } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import { getWechatLoginSettings } from '@/api/user'
import { remindUnboundWechat } from './wechat-binding-reminder.mjs'

export function useWechatBindingReminder() {
  const visible = ref(false)
  let active = true, closeDialog = null
  function dismiss() {
    visible.value = false
    const resolve = closeDialog
    closeDialog = null
    resolve?.()
  }
  function dispose() { active = false; dismiss() }
  onBeforeUnmount(dispose)
  onUnload(dispose)
  async function remindIfUnbound() {
    const token = uni.getStorageSync('token')
    if (!token) return active
    const isCurrent = () => active && token === uni.getStorageSync('token')
    await remindUnboundWechat({
      getSettings: getWechatLoginSettings, isCurrent,
      showReminder: () => new Promise(resolve => { closeDialog = resolve; visible.value = true })
    })
    return isCurrent()
  }
  return { visible, dismiss, remindIfUnbound }
}
