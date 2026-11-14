import { chooseImageWithPermission } from './feature-permission.js'
import { createRecognitionImagePicker } from './recognition-picker-core.mjs'
import { detectWebCamera } from './image-picker.js'
// #ifdef APP-PLUS
import { appVersionGuard } from './app-version-guard.js'
// #endif

let platform = 'native'
let detectCamera, openWebCamera
// #ifdef MP-WEIXIN
platform = 'weixin'
// #endif
// #ifdef H5
platform = 'h5'
detectCamera = detectWebCamera
openWebCamera = async () => {
  const { captureRecognitionPhoto } = await import('./recognition-camera-h5.js')
  return captureRecognitionPhoto()
}
// #endif

const pickRecognitionImage = createRecognitionImagePicker({
  runtime: {
    chooseImage: chooseImageWithPermission,
    showActionSheet: options => uni.showActionSheet(options),
    navigateTo: options => uni.navigateTo(options)
  },
  platform, detectCamera, openWebCamera
})

export function chooseRecognitionImage(options = {}) {
  // #ifdef APP-PLUS
  void appVersionGuard().ensure({ feature: 'recognition' }).then(allowed => {
    if (allowed) pickRecognitionImage(options)
    else {
      const error = { code: 'APP_UPGRADE_REQUIRED', errMsg: 'chooseImage:fail app upgrade required' }
      options.fail?.(error)
      options.complete?.(error)
    }
  })
  return
  // #endif
  // #ifndef APP-PLUS
  return pickRecognitionImage(options)
  // #endif
}
