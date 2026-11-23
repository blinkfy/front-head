import { ref } from 'vue'
import { baseUrl } from '@/api/settings'
import { resolveUpcyclingImage } from './image-download.mjs'
import { recentRecognition } from './recent-recognition.js'

export function useUpcyclingImage(isPageVisible) {
  const upcyclingImageUrl = ref('')
  const upcyclingTaskId = ref('')
  const imageLoading = ref(false)
  let currentPoll = null
  let recognitionId = ''
  let pendingSound = ''

  function stopUpcyclingPoll() {
    clearTimeout(currentPoll?.timer)
    currentPoll = null
  }

  function startUpcyclingPoll() {
    const taskId = upcyclingTaskId.value
    if (!taskId || !isPageVisible() || currentPoll) return
    const poll = { timer: null, attempts: 0 }
    currentPoll = poll
    const resultId = recognitionId
    const base = baseUrl || ''
    const token = uni.getStorageSync('token') || ''
    const isCurrent = () => currentPoll === poll && isPageVisible() &&
      token === (uni.getStorageSync('token') || '')

    function finish(url = '') {
      stopUpcyclingPoll()
      pendingSound = url ? taskId : ''
      upcyclingImageUrl.value = url
      upcyclingTaskId.value = ''
      imageLoading.value = false
      recentRecognition.updateImage(resultId, { upcyclingTaskId: '', upcyclingImageUrl: url })
    }

    async function checkStatus() {
      if (!isCurrent()) return
      if (poll.attempts >= 30) {
        console.warn('[upcycling poll] 轮询超时')
        finish()
        return
      }
      poll.attempts++
      try {
        const response = await new Promise((resolve, reject) => {
          uni.request({
            url: `${base}/api/upcycling-image/${taskId}${token ? '?imageTransport=url' : ''}`,
            method: 'GET',
            header: { Authorization: token },
            success: result => resolve(result.data),
            fail: reject
          })
        })
        if (!isCurrent()) return
        const image = response?.code === 0 ? response.data : null
        if (image?.status === 'done' && image.url) {
          finish(resolveUpcyclingImage(image.url, base, token))
          return
        }
        if (image?.status === 'failed') {
          finish()
          return
        }
      } catch (error) {
        if (isCurrent()) console.warn('[upcycling poll] 请求失败:', error)
      }
      if (isCurrent()) poll.timer = setTimeout(checkStatus, 2000)
    }
    void checkStatus()
  }

  function setUpcyclingImage(result, resultId = '') {
    stopUpcyclingPoll()
    recognitionId = resultId
    pendingSound = ''
    const directUrl = result?.upcyclingImageUrl
    upcyclingImageUrl.value = directUrl
      ? resolveUpcyclingImage(directUrl, baseUrl || '', uni.getStorageSync('token'))
      : ''
    upcyclingTaskId.value = directUrl ? '' : result?.upcyclingTaskId || ''
    imageLoading.value = !!upcyclingTaskId.value
    if (imageLoading.value) startUpcyclingPoll()
  }

  function takeUpcyclingSound() {
    const key = pendingSound
    pendingSound = ''
    return key
  }

  return { upcyclingImageUrl, upcyclingTaskId, imageLoading, setUpcyclingImage,
    startUpcyclingPoll, stopUpcyclingPoll, takeUpcyclingSound }
}
