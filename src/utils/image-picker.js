import { createRecognitionImagePicker } from './recognition-picker-core.mjs'

// Generic photo entry: only H5 uses the web camera; native pickers remain unchanged.
export async function detectWebCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) return false
  let timer
  try {
    const devices = await Promise.race([
      navigator.mediaDevices.enumerateDevices(),
      new Promise(resolve => { timer = setTimeout(() => resolve([]), 1800) })
    ])
    return devices.some(device => device.kind === 'videoinput')
  } finally { clearTimeout(timer) }
}

let platform = 'native'
let detectCamera, openWebCamera
// #ifdef H5
platform = 'h5'
detectCamera = detectWebCamera
openWebCamera = async () => {
  const { captureRecognitionPhoto } = await import('./recognition-camera-h5.js')
  return captureRecognitionPhoto({ recognition: false })
}
// #endif

export const chooseAppImage = createRecognitionImagePicker({
  runtime: {
    chooseImage: options => uni.chooseImage(options),
    showActionSheet: options => uni.showActionSheet(options),
    navigateTo: options => uni.navigateTo(options)
  },
  platform, detectCamera, openWebCamera
})
