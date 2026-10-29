import { createRecognitionImagePicker } from './recognition-picker-core.mjs'
import { detectWebCamera } from './image-picker.js'

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

export const chooseRecognitionImage = createRecognitionImagePicker({
  runtime: uni, platform, detectCamera, openWebCamera
})
