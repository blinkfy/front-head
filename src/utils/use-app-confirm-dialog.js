import { ref, provide } from 'vue'
import { onHide, onUnload, onBackPress } from '@dcloudio/uni-app'
import { showAppModal } from './app-confirm-dialog.js'

// 页面和子组件共用同一个弹窗队列；未挂载宿主时回退原生弹窗。
export function useAppConfirmDialog() {
  const appConfirmDialog = ref(null)
  const showPageModal = options => showAppModal({ $refs: { appConfirmDialog: appConfirmDialog.value } }, options)
  provide('app-confirm-dialog', showPageModal)
  // #ifdef APP-PLUS
  const cancel = () => appConfirmDialog.value?.cancelAll()
  onHide(cancel)
  onUnload(cancel)
  onBackPress(event => {
    if (event.from === 'backbutton' && appConfirmDialog.value?.current) {
      appConfirmDialog.value.settle(false)
      return true
    }
  })
  // #endif
  return { appConfirmDialog, showPageModal }
}
