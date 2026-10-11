import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onHide, onUnload } from '@dcloudio/uni-app'
import { getWechatQrMenuPosition } from './wechat-qr-save.mjs'
// #ifdef H5
import { downloadWechatQr } from './wechat-qr-save.mjs'
// #endif
// #ifdef APP-PLUS
import { saveWechatQrToAlbum } from './wechat-qr-save.mjs'
// #endif

export function useWechatQrSave(source, isDisabled = () => false) {
  const saving = ref(false), qrMenu = ref(null)
  function closeQrMenu() { qrMenu.value = null }
  function openQrMenu(event) {
    if (saving.value || isDisabled() || !source.value) return
    // #ifdef H5
    if (window.innerWidth > 760) return
    // #endif
    const info = uni.getSystemInfoSync()
    const viewport = { width: info.windowWidth, height: info.windowHeight }
    // #ifdef H5
    viewport.width = window.innerWidth
    viewport.height = window.innerHeight
    viewport.scrollX = window.scrollX
    viewport.scrollY = window.scrollY
    // #endif
    qrMenu.value = { ...getWechatQrMenuPosition(event, viewport), src: source.value }
  }
  function suppressQrContextMenu(event) {
    // #ifdef H5
    if (window.innerWidth <= 760) event?.preventDefault?.()
    // #endif
  }
  async function downloadQr() {
    const src = qrMenu.value?.src
    closeQrMenu()
    if (src !== source.value) return
    await saveQr(src, isDisabled())
  }
  watch([source, isDisabled], closeQrMenu)
  onHide(closeQrMenu)
  onUnload(closeQrMenu)
  onBeforeUnmount(closeQrMenu)
  // #ifdef H5
  onMounted(() => {
    window.addEventListener('resize', closeQrMenu)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', closeQrMenu)
  })
  // #endif
  async function saveQr(src, disabled = false) {
    if (saving.value || disabled || !src) return
    // #ifdef H5
    if (window.innerWidth > 760) return
    // #endif
    saving.value = true
    try {
      // #ifdef H5
      await downloadWechatQr({ src })
      uni.showToast({ title: '已发起图片下载', icon: 'none' })
      // #endif
      // #ifdef APP-PLUS
      await saveWechatQrToAlbum({ src,
        downloadFile: options => uni.downloadFile(options),
        saveImageToPhotosAlbum: options => uni.saveImageToPhotosAlbum(options)
      })
      uni.showToast({ title: '二维码已保存到相册', icon: 'success' })
      // #endif
    } catch (error) {
      // #ifdef H5
      uni.showModal({ title: '保存二维码', content: '下载未完成，可打开原图后长按保存。',
        confirmText: '打开图片', cancelText: '取消',
        success: result => { if (result.confirm) window.open(src, '_blank', 'noopener,noreferrer') }
      })
      // #endif
      // #ifdef APP-PLUS
      uni.showToast({ title: error?.message || '保存失败，请检查相册权限后重试', icon: 'none' })
      // #endif
    } finally { saving.value = false }
  }
  return { qrMenu, openQrMenu, closeQrMenu, downloadQr, suppressQrContextMenu }
}
