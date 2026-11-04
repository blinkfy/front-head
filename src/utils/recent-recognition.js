import { createRecentRecognitionStore } from './recent-recognition-core.mjs'

export const recentRecognition = createRecentRecognitionStore({
  getOwner: () => String(uni.getStorageSync('token') || '')
})
