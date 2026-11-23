import { ref } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { config } from '@/api/config'
import { userinfo } from '@/api/user'

const videoPath = `${config.baseUrl}/files/preview/${encodeURIComponent('分投侠设计')}`
const scenarioVideoUrl = `${videoPath}/${encodeURIComponent('分投侠宣传片')}/${encodeURIComponent('分投侠设计.m3u8')}`
const appVideoUrl = `${videoPath}/${encodeURIComponent('功能展示')}/${encodeURIComponent('功能展示.m3u8')}`

function getImageUrl(name) {
  if (!name) return ''
  // #ifdef APP-PLUS
  return `/static/app/images/${name}`
  // #endif
  // #ifndef APP-PLUS
  return `${config.baseUrl}/images/${name}`
  // #endif
}

function readAiSettings() {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${config.baseUrl}/api/ai/settings`,
      timeout: 10_000,
      success: ({ data }) => resolve(data?.code === 0 ? data.data : null),
      fail: reject
    })
  })
}

async function canShowGuideVideo() {
  const settings = await readAiSettings().catch(() => null)
  if (settings?.aiEnabled !== false) return true

  const token = uni.getStorageSync('token')
  if (!token) return false
  try {
    const response = await userinfo('false', { silent: true, sessionProbe: true, timeout: 10_000 })
    return token === uni.getStorageSync('token') && response?.code === 0 && response.data?.isAdmin === true
  } catch (_) {
    return false
  }
}

export function useGuideVideos() {
  const showVideo = ref(false)
  const showScenarioOverlay = ref(true)
  const showAppOverlay = ref(true)
  const scenarioPlayTrigger = ref(0)
  const appPlayTrigger = ref(0)
  let visibilityRequest = 0

  onShow(async () => {
    const request = ++visibilityRequest
    const visible = await canShowGuideVideo()
    if (request === visibilityRequest) showVideo.value = visible
  })

  function stopVideos() {
    visibilityRequest++
    // #ifndef APP-PLUS
    if (showVideo.value) {
      uni.createVideoContext('scenarioVideo').pause()
      uni.createVideoContext('appVideo').pause()
    }
    // #endif
    showVideo.value = false
    showScenarioOverlay.value = showAppOverlay.value = true
    scenarioPlayTrigger.value = appPlayTrigger.value = 0
  }

  onHide(stopVideos)
  onUnload(stopVideos)

  function requestPlay(type) {
    if (!showVideo.value) return
    const isScenario = type === 'scenario'
    const overlay = isScenario ? showScenarioOverlay : showAppOverlay
    overlay.value = false
    // #ifdef APP-PLUS
    const trigger = isScenario ? scenarioPlayTrigger : appPlayTrigger
    trigger.value++
    // #endif
    // #ifndef APP-PLUS
    const showRetryOverlay = () => { overlay.value = true }
    try {
      uni.createVideoContext(isScenario ? 'scenarioVideo' : 'appVideo').play()?.catch?.(showRetryOverlay)
    } catch (_) {
      showRetryOverlay()
    }
    // #endif
  }

  return {
    showVideo, showScenarioOverlay, showAppOverlay, scenarioPlayTrigger, appPlayTrigger,
    getImageUrl, requestPlay, scenarioVideoUrl, appVideoUrl,
    scenarioVideoPoster: getImageUrl('cover.webp'), appVideoPoster: getImageUrl('app.webp')
  }
}
