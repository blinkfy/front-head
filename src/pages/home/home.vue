<template>
  <view class="home-page">
    <!-- 鑳屾櫙瑁呴グ -->
    <view class="bg-decoration">
      <view class="bg-circle circle-1"></view>
      <view class="bg-circle circle-2"></view>
      <view class="bg-circle circle-3"></view>
      <view class="bg-dots">
        <view class="dot-row" v-for="n in 8" :key="n">
          <view class="dot" v-for="m in 12" :key="m"></view>
        </view>
      </view>
    </view>
    
    <!-- 椤堕儴缁胯壊鑳屾櫙鍖哄煙 -->
    <view class="header-bg">
      <!-- 瑁呴グ鍏冪礌 -->
      <view class="header-deco">
        <view class="deco-leaf leaf-1">馃尶</view>
        <view class="deco-leaf leaf-2">馃崈</view>
        <view class="deco-leaf leaf-3">鈾伙笍</view>
        <view class="deco-circle hc1"></view>
        <view class="deco-circle hc2"></view>
      </view>
      
      <view class="header-wave">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="#f5f7fa" fill-opacity="1" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,154.7C960,171,1056,181,1152,165.3C1248,149,1344,107,1392,85.3L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </view>
      
      <!-- 椤甸潰鏍囬 -->
      <view class="header-content">
        <view class="main-title">
          <image class="title-icon" src="/static/colorful-bin.png" mode="aspectFill"></image>
          <text class="title-text">AI鍨冨溇璇嗗埆</text>
        </view>
        <text class="subtitle">鏅鸿兘鍒嗙被 路 缁胯壊鐜繚 路 绉戞妧璧嬭兘</text>
      </view>
    </view>

    <!-- 涓诲唴瀹瑰尯鍩?-->
    <view class="content-wrapper">
      <!-- 璁惧杩炴帴鐘舵€佸崱鐗?-->
      <view v-if="hasConnection" class="device-card" @click="goToDeviceConnection">
        <view class="device-card-content">
          <view class="device-status">
            <view class="status-dot"></view>
            <view class="device-info">
              <text class="device-title">馃摗 鏅鸿兘璁惧鍦ㄧ嚎</text>
              <text class="device-name">{{ connectedDevice?.device_name || '鐜繚鍒嗙被璁惧' }}</text>
            </view>
          </view>
          <view class="device-action">
            <text class="action-text">绠＄悊</text>
            <text class="action-arrow">鈥?</text>
          </view>
        </view>
      </view>

      <!-- 涓婁紶鍖哄煙 -->
      <view class="upload-card" @click="onAddImage" :class="{ 'processing': isProcessing }">
        <!-- 绉戞妧娉㈢汗鏁堟灉灞?-->
        <view class="tech-wave-2"></view>
        <view class="tech-wave-3"></view>
        <view class="glass-reflection"></view>
        <view class="upload-content">
          <view class="upload-icon-wrapper">
            <text v-if="!isProcessing" class="upload-icon">馃摲</text>
            <view v-else class="loading-spinner"></view>
          </view>
          <text class="upload-title" v-if="!isProcessing">鐐瑰嚮鎷嶇収璇嗗埆</text>
          <text class="upload-title processing" v-else>{{ processStatus }}</text>
          <text class="upload-desc" v-if="!isProcessing">鏀寔 JPG銆丳NG 鏍煎紡</text>
          <text class="upload-desc processing" v-else>姝ｅ湪鍒嗘瀽涓?..</text>
        </view>
      </view>

      <!-- 璇嗗埆缁撴灉鍖哄煙 -->
      <view v-if="resultImage" class="result-card">
        <view class="result-header">
          <text class="result-title">馃幆 璇嗗埆缁撴灉</text>
          <view class="confidence-badge">
            <text class="confidence-text">{{ resultConfidence }}</text>
          </view>
        </view>
        
        <view class="result-image-wrap">
          <image :src="resultImage" class="result-image" mode="aspectFit" />
          <view v-if="displayBboxes.length" class="recognition-bbox-layer">
            <view
              v-for="(bbox, index) in displayBboxes"
              :key="`bbox-${index}`"
              class="recognition-bbox-item"
              :style="bbox.boxStyle"
            >
              <view class="recognition-bbox-label" :style="bbox.labelStyle">{{ bbox.label }}</view>
            </view>
          </view>
        </view>

        <view class="result-info">
          <view class="category-row">
            <view class="category-tag" :class="getCategoryClass(resultCategory)">
              <text class="tag-icon">{{ getCategoryIcon(resultCategory) }}</text>
              <text class="tag-text">{{ resultCategory }}</text>
            </view>
            <view class="ai-helper-btn" @click="goAiChatFromResult">AI对话</view>
          </view>

          <view v-if="recognizedItems.length" class="recognized-items-box">
            <text class="recognized-items-title">识别到的具体物品</text>
            <view class="recognized-items-list">
              <text
                v-for="(item, index) in recognizedItems"
                :key="`recognized-${index}`"
                class="recognized-item-chip"
              >{{ item }}</text>
            </view>
          </view>

          <view v-if="upcyclingSections.length" class="upcycling-plan">
            <view
              v-for="(section, index) in upcyclingSections"
              :key="`upcycling-${index}`"
              :class="['upcycling-plan-item', { 'is-warning': /提醒|风险|注意/.test(section.title) }]"
            >
              <text class="upcycling-plan-title">{{ section.title }}</text>
              <text class="upcycling-plan-content">{{ section.content }}</text>
            </view>
          </view>

          <view v-else-if="resultDesc" class="desc-box">
            <text class="desc-label">💡 处理建议</text>
            <text class="desc-text">{{ resultDesc }}</text>
          </view>
        </view>
      </view>

      <!-- 榛樿娆㈣繋鍖哄煙 -->
      <view v-if="!resultImage" class="welcome-section">
        <view class="tips-card">
          <text class="tips-icon">馃尡</text>
          <text class="tips-title">寮€濮嬫櫤鑳藉垎绫?</text>
          <text class="tips-desc">涓婁紶鍥剧墖锛孉I灏嗕负鎮ㄨ瘑鍒瀮鍦剧被鍨?</text>
        </view>

        <!-- 鍨冨溇鍒嗙被鎸囧崡 -->
        <view class="guide-section">
          <text class="section-title">鍨冨溇鍒嗙被鎸囧崡</text>
          <view class="guide-grid">
            <view class="guide-item recyclable" @click="showGuideDetail('recyclable')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">鈾伙笍</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">鍙洖鏀?</text>
                <text class="guide-examples">绾哥被銆佸鏂欍€侀噾灞?</text>
              </view>
            </view>
            
            <view class="guide-item harmful" @click="showGuideDetail('harmful')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">鈽笍</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">鏈夊鍨冨溇</text>
                <text class="guide-examples">鐢垫睜銆佽嵂鍝併€佺伅绠?</text>
              </view>
            </view>
            
            <view class="guide-item kitchen" @click="showGuideDetail('kitchen')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">馃崕</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">鍘ㄤ綑鍨冨溇</text>
                <text class="guide-examples">鍓╄彍銆佹灉鐨€佽尪鍙?</text>
              </view>
            </view>
            
            <view class="guide-item other" @click="showGuideDetail('other')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">馃棏锔?</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">鍏朵粬鍨冨溇</text>
                <text class="guide-examples">绾稿肪銆佺儫钂傘€侀櫠鐡?</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 蹇嵎鍔熻兘鍏ュ彛 -->
      <view class="quick-actions">
        <view class="action-item" @click="goShop">
          <view class="action-icon-wrapper shop">
            <text class="action-icon">馃泹锔?</text>
          </view>
          <text class="action-name">绉垎鍟嗗煄</text>
          <text class="action-badge" v-if="points !== null">{{ points }}</text>
        </view>
        
        <view v-if="!isH5Platform" class="action-item" @click="scanDeviceQR">
          <view class="action-icon-wrapper device">
            <text class="action-icon">馃摫</text>
          </view>
          <text class="action-name">杩炴帴璁惧</text>
        </view>
        
        <view v-if="isH5Platform" class="action-item" @click="goMap">
          <view class="action-icon-wrapper map">
            <text class="action-icon">馃椇锔?</text>
          </view>
          <text class="action-name">鍨冨溇妗跺湴鍥?</text>
        </view>
        
        <view class="action-item" @click="goRanking">
          <view class="action-icon-wrapper ranking">
            <text class="action-icon">馃弳</text>
          </view>
          <text class="action-name">鐜繚鎺掕</text>
        </view>
      </view>
    </view>

    <!-- 鍒嗙被鎸囧崡寮圭獥 -->
    <view v-if="showGuideModal && currentGuide.title" class="modal-overlay" @click="closeGuideModal">
      <view class="modal-content" @click.stop="">
        <view class="modal-header" :class="currentGuide.type">
          <text class="modal-icon">{{ currentGuide.icon }}</text>
          <text class="modal-title">{{ currentGuide.title }}</text>
          <text class="modal-close" @click="closeGuideModal">鉁?</text>
        </view>
        <view class="modal-body">
          <text class="modal-text">{{ currentGuide.content }}</text>
        </view>
        <view class="modal-footer">
          <button class="modal-btn" @click="closeGuideModal">鎴戠煡閬撲簡</button>
        </view>
      </view>
    </view>

    <!-- 搴曢儴瀵艰埅鏍?-->
    <view class="tabbar">
      <view class="tabbar-item active">
        <text class="tabbar-icon">馃彔</text>
        <text class="tabbar-label">棣栭〉</text>
      </view>
      <view class="tabbar-item" @click="goMap">
        <text class="tabbar-icon">馃椇锔?</text>
        <text class="tabbar-label">鍦板浘</text>
      </view>
      <view class="tabbar-item" @click="goShop">
        <text class="tabbar-icon">馃泹锔?</text>
        <text class="tabbar-label">鍟嗗煄</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <text class="tabbar-icon">馃懁</text>
        <text class="tabbar-label">鎴戠殑</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { recognizeImage } from '@/api/recognize'
import { useDeviceConnection } from '@/composables/useDeviceConnection'
import {
  appendAchievementQueue,
  buildExpandedUpcyclingText,
  buildSeedFromRecognizeData,
  extractRecognizedItems,
  getBboxColor,
  mapBboxToDisplay,
  parseLabelBbox,
  saveSeed,
  splitUpcyclingSections
} from '@/utils/recognition-sync'

const resultImage = ref('')
const resultCategory = ref('')
const resultConfidence = ref('')
const resultDesc = ref('')
const isProcessing = ref(false)
const processStatus = ref('澶勭悊涓?..')
const showGuideModal = ref(false)
const currentGuide = ref({})
const isH5Platform = ref(false)
const targetConfidence = ref(0)
const recognizedItems = ref([])
const upcyclingSections = ref([])
const rawBboxes = ref([])
const displayBboxes = ref([])
const recognizeBBoxSpace = ref('')
let bboxRefreshTimer = 0
const bboxLoadBoundImages = new WeakSet()

// 鏁板瓧鍔ㄧ敾鍑芥暟
const animateNumber = (target, duration = 800) => {
  const start = 0
  const startTime = Date.now()
  
  const updateNumber = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // 浣跨敤 easeOutQuart 缂撳姩鍑芥暟
    const easeProgress = 1 - Math.pow(1 - progress, 4)
    const current = Math.round(start + (target - start) * easeProgress)
    
    resultConfidence.value = current + '%'
    
    if (progress < 1) {
      requestAnimationFrame(updateNumber)
    }
  }
  
  requestAnimationFrame(updateNumber)
}

const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

const compressionConfig = {
  h5: { quality: 0.99, maxWidth: 800, maxHeight: 800 },
  miniProgram: { quality: 100, maxSize: 800 }
}

onMounted(() => {
  let platform, uniPlatform
  try {
    const deviceInfo = uni.getDeviceInfo ? uni.getDeviceInfo() : uni.getSystemInfoSync()
    platform = deviceInfo.platform
  } catch (e) {
    platform = uni.getSystemInfoSync().platform
  }
  
  try {
    const appBaseInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync()
    uniPlatform = appBaseInfo.uniPlatform
  } catch (e) {
    uniPlatform = 'unknown'
  }
  
  isH5Platform.value = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  let statusBarHeight = 0
  try {
    const windowInfo = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBarHeight = windowInfo.statusBarHeight || 0
  } catch (e) {
    const systemInfo = uni.getSystemInfoSync()
    statusBarHeight = systemInfo.statusBarHeight || 0
  }
  
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')
  }
  
  // 娣诲姞鍨冨溇鍒嗙被鍗＄墖榧犳爣杩借釜鏁堟灉
  if (typeof document !== 'undefined') {
    const guideItems = document.querySelectorAll('.guide-item')
    guideItems.forEach(item => {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
      
      item.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = item.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
    })
    
    // 涓婁紶鍗＄墖榧犳爣杩借釜鏁堟灉
    const uploadCard = document.querySelector('.upload-card')
    if (uploadCard) {
      uploadCard.addEventListener('mousemove', (e) => {
        const rect = uploadCard.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        uploadCard.style.setProperty('--mouse-x', x + '%')
        uploadCard.style.setProperty('--mouse-y', y + '%')
      })
      
      uploadCard.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = uploadCard.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        uploadCard.style.setProperty('--mouse-x', x + '%')
        uploadCard.style.setProperty('--mouse-y', y + '%')
      })
    }
    
    // 蹇嵎鎿嶄綔閫夐」鍗￠紶鏍囪拷韪晥鏋?
    const actionItems = document.querySelectorAll('.action-item')
    actionItems.forEach(item => {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
      
      item.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = item.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
    })
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', queueRefreshDisplayBboxes)
  }
})

onBeforeUnmount(() => {
  if (bboxRefreshTimer) {
    if (typeof window !== 'undefined') {
      window.clearTimeout(bboxRefreshTimer)
    } else {
      clearTimeout(bboxRefreshTimer)
    }
    bboxRefreshTimer = 0
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', queueRefreshDisplayBboxes)
  }
})

function getCategoryClass(category) {
  const text = String(category || '')
  if (text.includes('可回收') || text.toLowerCase().includes('recycl')) return 'recyclable'
  if (text.includes('有害') || text.toLowerCase().includes('harm')) return 'harmful'
  if (text.includes('厨余') || text.toLowerCase().includes('kitchen')) return 'kitchen'
  return 'other'
}

function getCategoryIcon(category) {
  const cls = getCategoryClass(category)
  if (cls === 'recyclable') return '♻️'
  if (cls === 'harmful') return '☠️'
  if (cls === 'kitchen') return '🍃'
  return '🗑️'
}

function resetEnhancedRecognition() {
  recognizedItems.value = []
  upcyclingSections.value = []
  rawBboxes.value = []
  displayBboxes.value = []
  recognizeBBoxSpace.value = ''
}

function getResultImageElement() {
  if (typeof document === 'undefined') return null
  const host = document.querySelector('.result-image')
  if (!host) return null
  if (host.tagName === 'IMG') return host
  return host.querySelector ? host.querySelector('img') : null
}

function queueRefreshDisplayBboxes() {
  if (!isH5Platform.value) {
    displayBboxes.value = []
    return
  }

  if (bboxRefreshTimer) {
    window.clearTimeout(bboxRefreshTimer)
  }

  bboxRefreshTimer = window.setTimeout(() => {
    nextTick(() => {
      refreshDisplayBboxes()
    })
  }, 60)
}

function refreshDisplayBboxes() {
  if (!isH5Platform.value || typeof window === 'undefined') {
    displayBboxes.value = []
    return
  }

  if (!rawBboxes.value.length) {
    displayBboxes.value = []
    return
  }

  const img = getResultImageElement()
  if (!img) {
    displayBboxes.value = []
    return
  }

  if (!img.complete || !(img.naturalWidth > 0)) {
    if (!bboxLoadBoundImages.has(img)) {
      bboxLoadBoundImages.add(img)
      img.addEventListener('load', () => queueRefreshDisplayBboxes(), { once: true })
    }
    return
  }

  const displayWidth = Number(img.clientWidth || 0)
  const displayHeight = Number(img.clientHeight || 0)
  if (displayWidth <= 0 || displayHeight <= 0) {
    displayBboxes.value = []
    return
  }

  const metrics = {
    displayWidth,
    displayHeight,
    naturalWidth: Number(img.naturalWidth || 0),
    naturalHeight: Number(img.naturalHeight || 0),
    objectFit: String(window.getComputedStyle(img).objectFit || 'contain')
  }
  const compact = window.innerWidth <= 768

  const next = []
  for (let i = 0; i < rawBboxes.value.length; i += 1) {
    const item = rawBboxes.value[i]
    const mapped = mapBboxToDisplay(
      item.bbox,
      metrics,
      recognizeBBoxSpace.value,
      item && item.label ? item.label.bbox_space : ''
    )
    if (!mapped) continue

    const color = getBboxColor(item.label, item.index)
    const labelName = String((item.label && (item.label.name || item.label.source_name)) || `目标${item.index + 1}`)
    const confidence = Number(item.label && item.label.confidence)
    const confidenceText = Number.isFinite(confidence)
      ? ` ${Math.max(0, Math.min(100, Math.round(confidence * 100)))}%`
      : ''

    const boxStyle = {
      left: `${mapped.left}px`,
      top: `${mapped.top}px`,
      width: `${mapped.width}px`,
      height: `${mapped.height}px`,
      borderColor: color
    }

    const labelStyle = {
      background: color,
      top: mapped.top <= 24 || mapped.height < 38 ? '2px' : (compact ? '-20px' : '-24px')
    }

    if (mapped.left + mapped.width >= (displayWidth - 120)) {
      labelStyle.left = 'auto'
      labelStyle.right = '-1px'
    }

    next.push({
      label: `${labelName}${confidenceText}`,
      boxStyle,
      labelStyle
    })
  }

  displayBboxes.value = next
}

function applyEnhancedRecognitionData(recognizeData) {
  if (!recognizeData || typeof recognizeData !== 'object') {
    resetEnhancedRecognition()
    return
  }

  recognizedItems.value = extractRecognizedItems(recognizeData)
  const upcyclingText = buildExpandedUpcyclingText(recognizeData)
  upcyclingSections.value = upcyclingText ? splitUpcyclingSections(upcyclingText) : []

  recognizeBBoxSpace.value = String(recognizeData.bbox_space || '')
  const labels = Array.isArray(recognizeData.labels) ? recognizeData.labels : []
  rawBboxes.value = labels
    .map((label, index) => ({ index, label, bbox: parseLabelBbox(label) }))
    .filter((item) => Array.isArray(item.bbox) && item.bbox.length >= 4)

  const unlocks = Array.isArray(
    recognizeData &&
    recognizeData.achievementInfo &&
    recognizeData.achievementInfo.newlyUnlocked
  ) ? recognizeData.achievementInfo.newlyUnlocked : []
  appendAchievementQueue(unlocks)

  const seed = buildSeedFromRecognizeData(recognizeData)
  if (seed) {
    saveSeed(seed)
  }

  queueRefreshDisplayBboxes()
}

function goAiChatFromResult() {
  if (!resultImage.value) return
  if (isH5Platform.value && typeof window !== 'undefined') {
    window.location.href = '/ai-chat'
    return
  }
  uni.navigateTo({ url: '/pages-nonTheme/ai-chat' })
}
function compressImage(filePath, quality = 0.8, maxWidth = 1024) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('褰撳墠鐜涓嶆敮鎸乧anvas鍘嬬缉'))
      return
    }
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = function() {
      try {
        let { width, height } = img
        const originalWidth = width
        const originalHeight = height
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        
        canvas.width = width
        canvas.height = height
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log('图片压缩完成:', {
                originalSize: `${originalWidth}x${originalHeight}`,
                compressedSize: `${width}x${height}`,
                compressedMb: (blob.size / 1024 / 1024).toFixed(2) + 'MB'
              })
              resolve(blob)
            } else {
              reject(new Error('鍥剧墖鍘嬬缉澶辫触'))
            }
          },
          'image/jpeg',
          quality
        )
      } catch (drawError) {
        reject(new Error('鍥剧墖缁樺埗澶辫触'))
      }
    }
    
    img.onerror = () => reject(new Error('鍥剧墖鍔犺浇澶辫触'))
    img.crossOrigin = 'anonymous'
    img.src = filePath
  })
}

function compressImageMiniProgram(filePath, quality = 80, maxSize = 800) {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src: filePath,
      success: (info) => {
        const { width: originalWidth, height: originalHeight } = info
        let targetWidth = originalWidth
        let targetHeight = originalHeight
        const maxOriginalSize = Math.max(originalWidth, originalHeight)
        
        if (maxOriginalSize > maxSize) {
          const scale = maxSize / maxOriginalSize
          targetWidth = Math.round(originalWidth * scale)
          targetHeight = Math.round(originalHeight * scale)
        }
        
        uni.compressImage({
          src: filePath,
          quality: quality,
          compressedWidth: targetWidth,
          compressedHeight: targetHeight,
          success: (res) => resolve(res.tempFilePath),
          fail: () => resolve(filePath)
        })
      },
      fail: () => {
        uni.compressImage({
          src: filePath,
          quality: quality,
          success: (res) => resolve(res.tempFilePath),
          fail: () => resolve(filePath)
        })
      }
    })
  })
}

async function processImage(filePath) {
  try {
    resetEnhancedRecognition()
    processStatus.value = '鍥剧墖澶勭悊涓?..'
    uni.showLoading({ title: '澶勭悊涓?..' })
    
    let compressedFile = filePath
    let compressedBlob = null
    
    try {
      if (isH5Platform.value) {
        processStatus.value = '姝ｅ湪鍘嬬缉...'
        const { quality, maxWidth } = compressionConfig.h5
        compressedBlob = await compressImage(filePath, quality, maxWidth)
        const timestamp = Date.now()
        const randomId = Math.random().toString(36).substring(2, 8)
        compressedFile = new File([compressedBlob], `compressed_${timestamp}_${randomId}.jpg`, { type: 'image/jpeg' })
      } else {
        processStatus.value = '姝ｅ湪浼樺寲...'
        const { quality, maxSize } = compressionConfig.miniProgram
        compressedFile = await compressImageMiniProgram(filePath, quality, maxSize)
      }
    } catch (compressError) {
      console.warn('鍥剧墖鍘嬬缉澶辫触锛屼娇鐢ㄥ師鍥?', compressError)
      compressedFile = filePath
    }
    
    if (isH5Platform.value && compressedBlob) {
      resultImage.value = URL.createObjectURL(compressedBlob)
    } else {
      resultImage.value = compressedFile
    }
    
    processStatus.value = 'AI璇嗗埆涓?..'
    uni.showLoading({ title: '璇嗗埆涓?..' })
    const res = await recognizeImage(compressedFile)
    
    if (res.labels && res.labels.length > 0) {
      const label = res.labels[0]
      resultCategory.value = label.name || '鏈煡绫诲埆'
      // 淇濆瓨鐩爣缃俊搴﹀苟鍚姩鍔ㄧ敾
      const confidenceValue = label.confidence ? Math.round(label.confidence * 100) : 0
      targetConfidence.value = confidenceValue
      resultConfidence.value = '0%' // 鍏堣涓?
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
      resultDesc.value = label.describe
      // 寤惰繜鍚姩鏁板瓧鍔ㄧ敾锛岃缁撴灉鍗＄墖鍏堟樉绀?
      setTimeout(() => {
        animateNumber(confidenceValue, 800)
      }, 300)
    } else {
      resultCategory.value = '鏈瘑鍒埌'
      resultConfidence.value = ''
      resultDesc.value = '鏈娴嬪埌浠讳綍鏍囩淇℃伅'
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
    }

    applyEnhancedRecognitionData(res)

    if (isH5Platform.value && resultImage.value && resultImage.value.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(resultImage.value), 10000)
    }
    
    processStatus.value = '璇嗗埆瀹屾垚锛?'
    uni.showToast({ title: '璇嗗埆瀹屾垚锛?', icon: 'success' })
    
  } catch (err) {
    resetEnhancedRecognition()
    resultImage.value = ''
    resultCategory.value = ''
    resultConfidence.value = ''
    resultDesc.value = ''
    processStatus.value = '澶勭悊澶辫触'
    
    if (err && err.msg) {
      uni.showToast({ title: err.msg || '璇嗗埆澶辫触', icon: 'none' })
      if (err.msg == '鏈櫥褰?') {
        uni.redirectTo({ url: '/pages/index/index' })
      }
    } else {
      uni.showToast({ title: '缃戠粶閿欒', icon: 'none' })
    }
  } finally {
    uni.hideLoading()
    isProcessing.value = false
    processStatus.value = '澶勭悊涓?..'
  }
}

function onAddImage() {
  if (isProcessing.value) {
    uni.showToast({ title: '姝ｅ湪澶勭悊涓?..', icon: 'none' })
    return
  }
  
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (chooseRes) => {
      const filePath = chooseRes.tempFilePaths[0]
      isProcessing.value = true
      processImage(filePath).catch(() => isProcessing.value = false)
    },
    fail: () => uni.showToast({ title: '閫夋嫨鍙栨秷', icon: 'none' })
  })
}

function goHistory() {
  uni.navigateTo({ url: '/pages/history/history?from=home' })
}

function goShop() {
  uni.navigateTo({ url: '/pages/shop/shop?from=home' })
}

function goProfile() {
  uni.redirectTo({ url: '/pages/profile/profile' })
}

function goMap() {
  uni.navigateTo({ url: '/pages/map/map?from=home' })
}

function goRanking() {
  uni.navigateTo({ url: '/pages/ranking/ranking?from=home' })
}

function scanDeviceQR() {
  let platform, uniPlatform, isH5 = false
  
  try {
    const deviceInfo = uni.getDeviceInfo ? uni.getDeviceInfo() : uni.getSystemInfoSync()
    platform = deviceInfo.platform
  } catch (e) {
    platform = uni.getSystemInfoSync().platform
  }
  
  try {
    const appBaseInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync()
    uniPlatform = appBaseInfo.uniPlatform
  } catch (e) {
    uniPlatform = 'unknown'
  }
  
  isH5 = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  if (isH5) {
    uni.showModal({
      title: '杩炴帴璁惧',
      content: '璇疯緭鍏ヨ澶嘔D锛圚5绔殏涓嶆敮鎸佹壂鐮侊級',
      editable: true,
      placeholderText: '璇疯緭鍏ヨ澶嘔D',
      success: (res) => {
        if (res.confirm && res.content) connectDevice(res.content)
      }
    })
  } else {
    uni.scanCode({
      scanType: ['qrCode'],
      success: (res) => connectDevice(res.result),
      fail: () => uni.showToast({ title: '鎵爜澶辫触', icon: 'none' })
    })
  }
}

function connectDevice(deviceId) {
  if (!deviceId || deviceId.trim() === '') {
    uni.showToast({ title: '璁惧ID涓嶈兘涓虹┖', icon: 'none' })
    return
  }
  const targetId = deviceId.split('#')[1]
  uni.navigateTo({ url: targetId })
}

function showGuideDetail(type) {
  if (!type) return
  
  const guides = {
    recyclable: {
      type: 'recyclable',
      icon: '鈾伙笍',
      title: '可回收垃圾',
      content: '包括废纸、塑料、玻璃、金属和布料等。可回收物经过分类处理后可再利用，能减少污染并节约资源。'
    },
    harmful: {
      type: 'harmful',
      icon: '鈽笍',
      title: '鏈夊鍨冨溇',
      content: '包括废电池、废灯管、废药品、废油漆及其容器等，需投放到有害垃圾回收点进行专门处理。'
    },
    kitchen: {
      type: 'kitchen',
      icon: '馃崕',
      title: '鍘ㄤ綑鍨冨溇',
      content: '包括剩菜剩饭、果皮果核、骨头、菜叶等厨余废弃物，可通过堆肥等方式资源化处理。'
    },
    other: {
      type: 'other',
      icon: '馃棏锔?',
      title: '鍏朵粬鍨冨溇',
      content: '包括砖瓦陶瓷、卫生纸、尘土等难以回收利用的废弃物，一般采用卫生填埋等方式处理。'
    }
  }
  
  const guide = guides[type]
  if (guide) {
    currentGuide.value = { ...guide }
    showGuideModal.value = true
  }
}

function closeGuideModal() {
  showGuideModal.value = false
  setTimeout(() => currentGuide.value = {}, 300)
}
</script>

<style scoped>
/* 椤甸潰鍩虹 */
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  padding-bottom: 140rpx;
  position: relative;
  overflow-x: hidden;
}

/* 鑳屾櫙瑁呴グ */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  animation: bgLightShift 15s ease-in-out infinite;
}

/* 鑳屾櫙鍏夊奖娴佸姩鏁堟灉 */
@keyframes bgLightShift {
  0%, 100% {
    background: radial-gradient(ellipse at 80% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
                radial-gradient(ellipse at 20% 60%, rgba(59, 130, 246, 0.06) 0%, transparent 40%),
                radial-gradient(ellipse at 70% 80%, rgba(245, 158, 11, 0.05) 0%, transparent 45%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
  25% {
    background: radial-gradient(ellipse at 85% 25%, rgba(16, 185, 129, 0.1) 0%, transparent 55%),
                radial-gradient(ellipse at 15% 55%, rgba(59, 130, 246, 0.08) 0%, transparent 45%),
                radial-gradient(ellipse at 75% 75%, rgba(245, 158, 11, 0.07) 0%, transparent 50%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
  50% {
    background: radial-gradient(ellipse at 75% 15%, rgba(16, 185, 129, 0.06) 0%, transparent 45%),
                radial-gradient(ellipse at 25% 65%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at 65% 85%, rgba(245, 158, 11, 0.08) 0%, transparent 55%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
  75% {
    background: radial-gradient(ellipse at 90% 30%, rgba(16, 185, 129, 0.09) 0%, transparent 50%),
                radial-gradient(ellipse at 10% 50%, rgba(59, 130, 246, 0.07) 0%, transparent 40%),
                radial-gradient(ellipse at 80% 70%, rgba(245, 158, 11, 0.06) 0%, transparent 45%),
                linear-gradient(135deg, #f0fdf4 0%, #ffffff 50%, #ecfdf5 100%);
  }
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.15;
}

.circle-1 {
  width: 600rpx;
  height: 600rpx;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  top: -200rpx;
  right: -200rpx;
  animation: float1 8s ease-in-out infinite;
}

.circle-2 {
  width: 400rpx;
  height: 400rpx;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  top: 400rpx;
  left: -150rpx;
  animation: float2 10s ease-in-out infinite;
}

.circle-3 {
  width: 500rpx;
  height: 500rpx;
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  bottom: 300rpx;
  right: -200rpx;
  animation: float3 12s ease-in-out infinite;
}

/* 鐞冨舰娴姩鍔ㄧ敾 */
@keyframes float1 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30rpx, -20rpx) scale(1.02);
  }
  50% {
    transform: translate(20rpx, 30rpx) scale(0.98);
  }
  75% {
    transform: translate(-10rpx, 20rpx) scale(1.01);
  }
}

@keyframes float2 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(-20rpx, 40rpx) scale(1.03);
  }
  66% {
    transform: translate(30rpx, -30rpx) scale(0.97);
  }
}

@keyframes float3 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  20% {
    transform: translate(40rpx, 10rpx) scale(1.02);
  }
  40% {
    transform: translate(20rpx, -40rpx) scale(0.99);
  }
  60% {
    transform: translate(-30rpx, -20rpx) scale(1.01);
  }
  80% {
    transform: translate(-20rpx, 30rpx) scale(0.98);
  }
}

.bg-dots {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.03;
}

.dot-row {
  display: flex;
  gap: 60rpx;
  margin-bottom: 60rpx;
  padding: 0 30rpx;
}

.dot {
  width: 8rpx;
  height: 8rpx;
  background: #10b981;
  border-radius: 50%;
}

/* 椤堕儴缁胯壊鑳屾櫙 */
.header-bg {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  padding: 60rpx 32rpx 120rpx;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

/* 澶撮儴瑁呴グ */
.header-deco {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.deco-leaf {
  position: absolute;
  font-size: 40rpx;
  opacity: 0.3;
  animation: float 3s ease-in-out infinite;
}

.leaf-1 {
  top: 20%;
  right: 15%;
  animation-delay: 0s;
}

.leaf-2 {
  top: 50%;
  right: 8%;
  font-size: 32rpx;
  animation-delay: 1s;
}

.leaf-3 {
  top: 15%;
  left: 10%;
  font-size: 36rpx;
  animation-delay: 2s;
}

.header-deco .deco-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.hc1 {
  width: 300rpx;
  height: 300rpx;
  top: -100rpx;
  right: -80rpx;
  animation: pulse1 6s ease-in-out infinite;
}

.hc2 {
  width: 150rpx;
  height: 150rpx;
  bottom: 20%;
  left: 5%;
  background: rgba(255, 255, 255, 0.08);
  animation: pulse2 8s ease-in-out infinite;
}

/* 澶撮儴鍦嗗舰鍛煎惛鍔ㄧ敾 */
@keyframes pulse1 {
  0%, 100% {
    transform: scale(1);
    opacity: 0.1;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.15;
  }
}

@keyframes pulse2 {
  0%, 100% {
    transform: scale(1);
    opacity: 0.08;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.12;
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10rpx) rotate(5deg); }
}

.header-bg::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 400rpx;
  height: 400rpx;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  border-radius: 50%;
}

.header-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80rpx;
}

.header-wave svg {
  width: 100%;
  height: 100%;
}

.header-content {
  position: relative;
  z-index: 1;
}

.main-title {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.title-icon {
  width: 56rpx;
  height: 56rpx;
  margin-right: 16rpx;
  border-radius: 12rpx;
}

.title-text {
  font-size: 48rpx;
  font-weight: 700;
  color: #ffffff;
}

.subtitle {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

/* 鍐呭鍖哄煙 */
.content-wrapper {
  padding: 0 32rpx;
  margin-top: -60rpx;
  position: relative;
  z-index: 2;
}

/* 璁惧杩炴帴鍗＄墖 */
.device-card {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08);
  border-left: 6rpx solid #10b981;
}

.device-card-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.device-status {
  display: flex;
  align-items: center;
  flex: 1;
}

.status-dot {
  width: 16rpx;
  height: 16rpx;
  background: #10b981;
  border-radius: 50%;
  margin-right: 16rpx;
  box-shadow: 0 0 8rpx rgba(16, 185, 129, 0.5);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.device-info {
  display: flex;
  flex-direction: column;
}

.device-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}

.device-name {
  font-size: 22rpx;
  color: #6b7280;
  margin-top: 4rpx;
}

.device-action {
  display: flex;
  align-items: center;
  padding: 12rpx 20rpx;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 24rpx;
}

.action-text {
  font-size: 24rpx;
  color: #10b981;
  font-weight: 500;
}

.action-arrow {
  font-size: 28rpx;
  color: #10b981;
  margin-left: 4rpx;
}

/* 涓婁紶鍗＄墖 */
.upload-card {
  background: 
    linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.2) 100%),
    linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.1) 100%);
  border-radius: 24rpx;
  padding: 60rpx 40rpx;
  margin-bottom: 24rpx;
  box-shadow: 
    0 8rpx 32rpx rgba(16, 185, 129, 0.15), 
    inset 0 1rpx 1rpx rgba(255, 255, 255, 0.6),
    inset 0 -1rpx 1rpx rgba(255, 255, 255, 0.2),
    inset 0 0 0 1rpx rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
  backdrop-filter: blur(20rpx) saturate(180%);
  position: relative;
  overflow: hidden;
  border: 1rpx solid rgba(255, 255, 255, 0.4);
}

/* 鐜荤拑鍙嶅厜灞?*/
.upload-card .glass-reflection {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.5) 0%, 
    rgba(255, 255, 255, 0.2) 40%,
    transparent 100%);
  border-radius: 24rpx 24rpx 0 0;
  pointer-events: none;
}

/* 绉戞妧娴佸姩娉㈢汗鏁堟灉 - 澶氬眰鍙犲姞 */
.upload-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(45deg, 
    transparent 25%, 
    rgba(255, 255, 255, 0.1) 35%,
    rgba(255, 255, 255, 0.25) 45%,
    rgba(255, 255, 255, 0.35) 50%,
    rgba(255, 255, 255, 0.25) 55%,
    rgba(255, 255, 255, 0.1) 65%,
    transparent 75%);
  animation: techScan 2.5s linear infinite;
}

/* 绗簩灞傛尝绾?- 閿欎綅鍔ㄧ敾 */
.upload-card .tech-wave-2 {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(45deg, 
    transparent 30%, 
    rgba(16, 185, 129, 0.15) 45%,
    rgba(52, 211, 153, 0.25) 50%,
    rgba(16, 185, 129, 0.15) 55%,
    transparent 70%);
  animation: techScan 3s linear infinite;
  animation-delay: -1s;
  pointer-events: none;
}

/* 绗笁灞傛尝绾?- 缁嗙嚎鏁堟灉 */
.upload-card .tech-wave-3 {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: repeating-linear-gradient(45deg,
    transparent 0rpx,
    transparent 20rpx,
    rgba(255, 255, 255, 0.08) 20rpx,
    rgba(255, 255, 255, 0.08) 22rpx,
    transparent 22rpx,
    transparent 60rpx);
  animation: techScan 4s linear infinite;
  animation-delay: -0.5s;
  pointer-events: none;
}

/* 鍏夋劅杩介殢榧犳爣鏁堟灉 */
.upload-card::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 300rpx;
  height: 300rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.35) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 10;
}

.upload-card:hover::after,
.upload-card:active::after {
  opacity: 1;
}

@keyframes techScan {
  0% { 
    transform: translateX(-100%) translateY(-100%) rotate(45deg); 
  }
  100% { 
    transform: translateX(100%) translateY(100%) rotate(45deg); 
  }
}

.upload-card:active {
  transform: scale(0.98);
  box-shadow: 
    0 4rpx 16rpx rgba(16, 185, 129, 0.1), 
    inset 0 0 0 2rpx rgba(255, 255, 255, 0.3),
    inset 0 0 0 6rpx rgba(16, 185, 129, 0.25),
    inset 0 0 0 8rpx rgba(255, 255, 255, 0.15),
    inset 0 0 15rpx rgba(16, 185, 129, 0.15);
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.upload-icon-wrapper {
  width: 120rpx;
  height: 120rpx;
  background: 
    linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.7) 40%, rgba(220, 252, 231, 0.6) 100%),
    linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.05) 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
  box-shadow: 
    0 6rpx 20rpx rgba(16, 185, 129, 0.25),
    0 2rpx 8rpx rgba(0, 0, 0, 0.08),
    inset 0 2rpx 4rpx rgba(255, 255, 255, 0.9),
    inset 0 -2rpx 6rpx rgba(16, 185, 129, 0.15),
    inset 0 0 0 1rpx rgba(255, 255, 255, 0.6);
  border: 2rpx solid rgba(255, 255, 255, 0.7);
  position: relative;
  overflow: hidden;
}

/* 閲戝睘鍏夋辰鏁堟灉 */
.upload-icon-wrapper::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.9) 0%, 
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%);
  border-radius: 50% 50% 0 0;
  pointer-events: none;
}

/* 搴曢儴閲戝睘鍙嶅厜 */
.upload-icon-wrapper::after {
  content: '';
  position: absolute;
  bottom: 10%;
  left: 20%;
  right: 20%;
  height: 20%;
  background: linear-gradient(180deg, 
    transparent 0%,
    rgba(16, 185, 129, 0.2) 50%,
    rgba(16, 185, 129, 0.3) 100%);
  border-radius: 0 0 50% 50%;
  filter: blur(4rpx);
  pointer-events: none;
}

.upload-icon {
  font-size: 56rpx;
}

.loading-spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.3);
  border-top: 4rpx solid #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.upload-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 12rpx;
}

.upload-title.processing {
  font-size: 28rpx;
}

.upload-desc {
  font-size: 24rpx;
  color: #4b5563;
}

/* 璇嗗埆缁撴灉鍗＄墖 */
.result-card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.result-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.confidence-badge {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  animation: confidencePulse 0.6s ease 0.3s both;
  position: relative;
  overflow: hidden;
}

@keyframes confidencePulse {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 寰界珷鍏夋晥 */
.confidence-badge::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: confidenceShine 1.5s ease-in-out 0.8s;
}

@keyframes confidenceShine {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

.confidence-text {
  font-size: 22rpx;
  color: #ffffff;
  font-weight: 500;
  display: inline-block;
  min-width: 40rpx;
  text-align: center;
}


.result-image-wrap {
  position: relative;
  margin-bottom: 24rpx;
}


.category-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}


.ai-helper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  padding: 12rpx 24rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(135deg, #0ea56b, #36c98e);
  box-shadow: 0 8rpx 18rpx rgba(14, 165, 107, 0.28);
}

.category-tag.recyclable {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(219, 234, 254, 0.7) 50%, rgba(255, 255, 255, 0.95) 100%);
  border: 2rpx solid #60a5fa;
}

.category-tag.harmful {
  background: rgba(239, 68, 68, 0.1);
  border: 2rpx solid #ef4444;
}

.category-tag.kitchen {
  background: rgba(245, 158, 11, 0.1);
  border: 2rpx solid #f59e0b;
}

.category-tag.other {
  background: rgba(107, 114, 128, 0.1);
  border: 2rpx solid #6b7280;
}

.tag-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.tag-text {
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
}

.desc-box {
  background: #f9fafb;
  border-radius: 16rpx;
  padding: 20rpx;
}

.desc-label {
  display: block;
  font-size: 24rpx;
  color: #10b981;
  font-weight: 600;
  margin-bottom: 8rpx;
}


.recognized-items-box {
  border: 1rpx solid rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.06);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
}

.recognized-items-title {
  font-size: 24rpx;
  margin-bottom: 12rpx;
  color: #0f766e;
  font-weight: 700;
}

.recognized-items-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.recognized-item-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 1rpx solid rgba(15, 118, 110, 0.2);
  background: rgba(255, 255, 255, 0.78);
  color: #0f4c5a;
  font-size: 22rpx;
  padding: 8rpx 16rpx;
}

.upcycling-plan {
  display: grid;
  gap: 12rpx;
}

.upcycling-plan-item {
  border: 1rpx solid rgba(24, 117, 255, 0.15);
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  background: linear-gradient(135deg, rgba(245, 250, 255, 0.98), rgba(236, 248, 242, 0.92));
}

.upcycling-plan-item.is-warning {
  border-color: rgba(215, 125, 20, 0.22);
  background: linear-gradient(135deg, rgba(255, 249, 236, 0.97), rgba(255, 242, 226, 0.92));
}

.upcycling-plan-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: rgba(21, 103, 255, 0.12);
  color: #1e5ed8;
  font-size: 20rpx;
  font-weight: 700;
  padding: 6rpx 14rpx;
}

.upcycling-plan-item.is-warning .upcycling-plan-title {
  background: rgba(215, 125, 20, 0.16);
  color: #b45d08;
}

.upcycling-plan-content {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #334155;
}

.recognition-bbox-layer {
  position: absolute;
  inset: 0;
  z-index: 18;
  pointer-events: none;
}

.recognition-bbox-item {
  position: absolute;
  border: 2px solid #2f6fed;
  border-radius: 10rpx;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.recognition-bbox-label {
  position: absolute;
  left: -1px;
  top: -24px;
  max-width: 220rpx;
  padding: 2px 8px;
  border-radius: 999px;
  color: #ffffff;
  font-size: 20rpx;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid rgba(255, 255, 255, 0.28);
}

/* 娆㈣繋鍖哄煙 */
.welcome-section {
  margin-bottom: 24rpx;
}

.tips-card {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-radius: 8rpx;
  padding: 32rpx 40rpx;
  text-align: center;
  margin-bottom: 24rpx;
  box-shadow: 
    4rpx 4rpx 12rpx rgba(0, 0, 0, 0.1),
    8rpx 8rpx 24rpx rgba(16, 185, 129, 0.15),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.5);
  transform: rotate(-1deg);
  position: relative;
}

.tips-card::before {
  content: '';
  position: absolute;
  top: -12rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 40rpx;
  height: 40rpx;
  background: linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%);
  border-radius: 50%;
  box-shadow: 
    0 4rpx 8rpx rgba(0, 0, 0, 0.25),
    0 2rpx 4rpx rgba(0, 0, 0, 0.15),
    inset 0 -2rpx 4rpx rgba(0, 0, 0, 0.1),
    inset 0 2rpx 4rpx rgba(255, 255, 255, 0.3);
}

.tips-icon {
  font-size: 64rpx;
  display: block;
  margin-bottom: 16rpx;
  animation: gentleSway 4s ease-in-out infinite;
  transform-origin: bottom center;
}

@keyframes gentleSway {
  0%, 100% {
    transform: rotate(-3deg) scale(1);
  }
  25% {
    transform: rotate(2deg) scale(1.02);
  }
  50% {
    transform: rotate(3deg) scale(1);
  }
  75% {
    transform: rotate(-2deg) scale(0.98);
  }
}

.tips-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #065f46;
  margin-bottom: 8rpx;
  font-family: 'KaiTi', 'STKaiti', serif;
}

.tips-desc {
  font-size: 24rpx;
  color: #047857;
  font-style: italic;
}

/* 鎸囧崡鍖哄煙 */
.guide-section {
  margin-bottom: 24rpx;
}

.section-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 20rpx;
}

.guide-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}

.guide-item {
  border-radius: 16rpx;
  padding: 20rpx;
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  box-shadow: 
    0 2rpx 8rpx rgba(0, 0, 0, 0.06),
    0 1rpx 3rpx rgba(0, 0, 0, 0.04),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.8);
}

/* 绾歌川绾圭悊鏁堟灉 */
.guide-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.7) 0%, 
    rgba(255, 255, 255, 0.3) 50%, 
    transparent 100%);
  pointer-events: none;
  border-radius: 16rpx 16rpx 0 0;
}

/* 绾歌川绾ょ淮绾圭悊 */
.guide-item .paper-texture {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    repeating-linear-gradient(90deg, transparent, transparent 2rpx, rgba(0,0,0,0.01) 2rpx, rgba(0,0,0,0.01) 4rpx),
    repeating-linear-gradient(0deg, transparent, transparent 2rpx, rgba(0,0,0,0.01) 2rpx, rgba(0,0,0,0.01) 4rpx);
  pointer-events: none;
  border-radius: 16rpx;
  opacity: 0.5;
}

/* 鍏夋劅杩介殢榧犳爣鏁堟灉 */
.guide-item::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 200rpx;
  height: 200rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.guide-item:hover::after,
.guide-item:active::after {
  opacity: 1;
}

.guide-item:active {
  transform: scale(0.98);
}

.guide-item.recyclable {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.98) 0%, 
    rgba(255, 255, 255, 0.95) 15%,
    rgba(34, 197, 94, 0.08) 30%,
    rgba(34, 197, 94, 0.18) 45%,
    rgba(34, 197, 94, 0.22) 50%,
    rgba(34, 197, 94, 0.18) 55%,
    rgba(34, 197, 94, 0.08) 70%,
    rgba(255, 255, 255, 0.95) 85%,
    rgba(255, 255, 255, 0.98) 100%);
  box-shadow: 0 4rpx 20rpx rgba(34, 197, 94, 0.2), 0 8rpx 40rpx rgba(0, 0, 0, 0.08), inset 0 0 0 2rpx rgba(34, 197, 94, 0.25);
}

.guide-item.harmful {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.98) 0%, 
    rgba(255, 255, 255, 0.95) 15%,
    rgba(239, 68, 68, 0.08) 30%,
    rgba(239, 68, 68, 0.18) 45%,
    rgba(239, 68, 68, 0.22) 50%,
    rgba(239, 68, 68, 0.18) 55%,
    rgba(239, 68, 68, 0.08) 70%,
    rgba(255, 255, 255, 0.95) 85%,
    rgba(255, 255, 255, 0.98) 100%);
  box-shadow: 0 4rpx 20rpx rgba(239, 68, 68, 0.2), 0 8rpx 40rpx rgba(0, 0, 0, 0.08), inset 0 0 0 2rpx rgba(239, 68, 68, 0.25);
}

.guide-item.kitchen {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.98) 0%, 
    rgba(255, 255, 255, 0.95) 15%,
    rgba(245, 158, 11, 0.08) 30%,
    rgba(245, 158, 11, 0.18) 45%,
    rgba(245, 158, 11, 0.22) 50%,
    rgba(245, 158, 11, 0.18) 55%,
    rgba(245, 158, 11, 0.08) 70%,
    rgba(255, 255, 255, 0.95) 85%,
    rgba(255, 255, 255, 0.98) 100%);
  box-shadow: 0 4rpx 20rpx rgba(245, 158, 11, 0.2), 0 8rpx 40rpx rgba(0, 0, 0, 0.08), inset 0 0 0 2rpx rgba(245, 158, 11, 0.25);
}

.guide-item.other {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.98) 0%, 
    rgba(255, 255, 255, 0.95) 15%,
    rgba(107, 114, 128, 0.08) 30%,
    rgba(107, 114, 128, 0.18) 45%,
    rgba(107, 114, 128, 0.22) 50%,
    rgba(107, 114, 128, 0.18) 55%,
    rgba(107, 114, 128, 0.08) 70%,
    rgba(255, 255, 255, 0.95) 85%,
    rgba(255, 255, 255, 0.98) 100%);
  box-shadow: 0 4rpx 20rpx rgba(107, 114, 128, 0.2), 0 8rpx 40rpx rgba(0, 0, 0, 0.08), inset 0 0 0 2rpx rgba(107, 114, 128, 0.25);
}

.guide-icon-wrapper {
  width: 64rpx;
  height: 64rpx;
  background: #f3f4f6;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  transition: all 0.3s ease;
  cursor: pointer;
}

/* 榧犳爣鎮仠鏃跺浘鏍囧鍣ㄦ晥鏋?*/
.guide-item:hover .guide-icon-wrapper {
  transform: scale(1.1);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
}

.guide-icon {
  font-size: 32rpx;
  animation: iconWiggle 3s ease-in-out infinite;
  transition: all 0.3s ease;
}

/* 榧犳爣鎮仠鏃跺浘鏍囧姩鐢?*/
.guide-item:hover .guide-icon {
  animation: iconHoverBounce 0.6s ease;
}

@keyframes iconWiggle {
  0%, 100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-5deg);
  }
  75% {
    transform: rotate(5deg);
  }
}

/* 榧犳爣鎮仠鏃剁殑寮硅烦鍔ㄧ敾 */
@keyframes iconHoverBounce {
  0% {
    transform: scale(1) rotate(0deg);
  }
  30% {
    transform: scale(1.3) rotate(-10deg);
  }
  50% {
    transform: scale(1.3) rotate(0deg);
  }
  70% {
    transform: scale(0.9) rotate(5deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

.guide-info {
  flex: 1;
}

.guide-name {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
}

.guide-examples {
  display: block;
  font-size: 20rpx;
  color: #9ca3af;
  margin-top: 4rpx;
}

/* 蹇嵎鍔熻兘 */
.quick-actions {
  display: flex;
  justify-content: space-around;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 253, 244, 0.9) 50%, rgba(255, 255, 255, 0.98) 100%);
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08), 0 2rpx 8rpx rgba(16, 185, 129, 0.05);
  backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding: 16rpx 24rpx;
  border-radius: 16rpx;
  transition: all 0.3s ease;
  overflow: hidden;
  background: linear-gradient(145deg, 
    rgba(255, 255, 255, 0.95) 0%, 
    rgba(245, 247, 250, 0.9) 50%,
    rgba(255, 255, 255, 0.95) 100%);
  box-shadow: 
    0 2rpx 6rpx rgba(0, 0, 0, 0.05),
    0 1rpx 2rpx rgba(0, 0, 0, 0.03),
    inset 0 1rpx 0 rgba(255, 255, 255, 1),
    inset 0 -1rpx 0 rgba(0, 0, 0, 0.02);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}

/* 濉戞枡/閲戝睘鍏夋辰鏁堟灉 */
.action-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.8) 0%, 
    rgba(255, 255, 255, 0.3) 60%,
    transparent 100%);
  pointer-events: none;
  border-radius: 16rpx 16rpx 0 0;
}

/* 鍏夋劅杩介殢榧犳爣鏁堟灉 */
.action-item::after {
  content: '';
  position: absolute;
  top: var(--mouse-y, 50%);
  left: var(--mouse-x, 50%);
  width: 180rpx;
  height: 180rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.action-item:hover::after,
.action-item:active::after {
  opacity: 1;
}

.action-item:active {
  transform: scale(0.95);
  background: rgba(16, 185, 129, 0.05);
}

.action-icon-wrapper {
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
  position: relative;
  overflow: hidden;
  box-shadow: 
    0 6rpx 16rpx rgba(0, 0, 0, 0.12),
    0 2rpx 6rpx rgba(0, 0, 0, 0.08),
    inset 0 1rpx 2rpx rgba(255, 255, 255, 0.6),
    inset 0 -1rpx 2rpx rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

/* 3D绔嬩綋鍏夋辰鏁堟灉 */
.action-icon-wrapper::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 45%;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, 0.7) 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%);
  border-radius: 24rpx 24rpx 0 0;
  pointer-events: none;
}

/* 搴曢儴闃村奖澧炲己绔嬩綋鎰?*/
.action-icon-wrapper::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 10%;
  right: 10%;
  height: 30%;
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(0, 0, 0, 0.1) 100%);
  border-radius: 0 0 24rpx 24rpx;
  filter: blur(6rpx);
  pointer-events: none;
}

.action-icon-wrapper:active {
  transform: scale(0.95);
  box-shadow: 
    0 3rpx 10rpx rgba(0, 0, 0, 0.1),
    0 1rpx 3rpx rgba(0, 0, 0, 0.06),
    inset 0 1rpx 2rpx rgba(255, 255, 255, 0.5);
}

.action-icon-wrapper.shop {
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%);
}

.action-icon-wrapper.device {
  background: linear-gradient(135deg, #dbeafe 0%, #60a5fa 50%, #3b82f6 100%);
}

.action-icon-wrapper.map {
  background: linear-gradient(135deg, #d1fae5 0%, #34d399 50%, #10b981 100%);
}

.action-icon-wrapper.ranking {
  background: linear-gradient(135deg, #fce7f3 0%, #f472b6 50%, #ec4899 100%);
}

.action-icon {
  font-size: 40rpx;
  animation: iconPulse 2.5s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}

.action-name {
  font-size: 22rpx;
  color: #4b5563;
}

.action-badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #ffffff;
  font-size: 18rpx;
  font-weight: 600;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  min-width: 32rpx;
  text-align: center;
}

/* 寮圭獥 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: modalFadeIn 0.3s ease;
}

@keyframes modalFadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.modal-content {
  background: #ffffff;
  border-radius: 24rpx;
  width: 100%;
  max-width: 600rpx;
  overflow: hidden;
  animation: modalSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalSlideUp {
  0% {
    opacity: 0;
    transform: translateY(60rpx) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 32rpx;
  display: flex;
  align-items: center;
  border-bottom: 2rpx solid #f3f4f6;
  animation: modalHeaderSlide 0.5s ease 0.1s both;
}

@keyframes modalHeaderSlide {
  0% {
    opacity: 0;
    transform: translateX(-30rpx);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.modal-header.recyclable {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%);
}

.modal-header.harmful {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%);
}

.modal-header.kitchen {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
}

.modal-header.other {
  background: linear-gradient(135deg, rgba(107, 114, 128, 0.1) 0%, rgba(107, 114, 128, 0.05) 100%);
}

.modal-icon {
  font-size: 40rpx;
  margin-right: 16rpx;
  animation: modalIconPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both, modalIconWiggle 2s ease-in-out infinite 1s;
  display: inline-block;
}

@keyframes modalIconPop {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-45deg);
  }
  50% {
    transform: scale(1.3) rotate(10deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

/* 寮圭獥鍥炬爣杞昏交鏅冨姩 */
@keyframes modalIconWiggle {
  0%, 100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-8deg);
  }
  75% {
    transform: rotate(8deg);
  }
}

.modal-title {
  flex: 1;
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}

.modal-close {
  width: 48rpx;
  height: 48rpx;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #6b7280;
}

.modal-body {
  padding: 32rpx;
  animation: modalBodyFade 0.5s ease 0.25s both;
}

@keyframes modalBodyFade {
  0% {
    opacity: 0;
    transform: translateY(20rpx);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-text {
  font-size: 28rpx;
  color: #4b5563;
  line-height: 1.6;
}

.modal-footer {
  padding: 0 32rpx 32rpx;
  animation: modalFooterSlide 0.5s ease 0.35s both;
}

@keyframes modalFooterSlide {
  0% {
    opacity: 0;
    transform: translateY(30rpx);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  border-radius: 44rpx;
  border: none;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

/* 鎸夐挳鎮仠鏁堟灉 */
.modal-btn:hover {
  transform: translateY(-2rpx);
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
}

.modal-btn:active {
  transform: translateY(0);
}

/* 搴曢儴瀵艰埅 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background: rgba(255, 255, 255, 0.7);
  border-top: 2rpx solid rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
  backdrop-filter: blur(20rpx);
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16rpx 0;
  position: relative;
  transition: all 0.3s ease;
}

.tabbar-item:active {
  transform: scale(0.92);
}

.tabbar-item.active .tabbar-icon {
  color: #10b981;
  transform: scale(1.15) translateY(-4rpx);
  filter: drop-shadow(0 4rpx 8rpx rgba(16, 185, 129, 0.4));
  animation: iconBounce 0.5s ease;
}

.tabbar-item.active .tabbar-label {
  color: #10b981;
  font-weight: 600;
  transform: scale(1.05);
}

.tabbar-icon {
  font-size: 40rpx;
  margin-bottom: 8rpx;
  color: #9ca3af;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  filter: grayscale(30%);
}

.tabbar-item.active .tabbar-icon {
  filter: grayscale(0%) brightness(1.1);
}

.tabbar-label {
  font-size: 20rpx;
  color: #9ca3af;
  transition: all 0.3s ease;
}

@media (max-width: 768px) {
  .category-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12rpx;
  }

  .ai-helper-btn {
    padding: 10rpx 20rpx;
    font-size: 20rpx;
  }

  .recognized-items-box {
    padding: 16rpx 18rpx;
  }

  .recognized-item-chip {
    font-size: 20rpx;
    padding: 6rpx 14rpx;
  }

  .upcycling-plan-item {
    padding: 14rpx 16rpx;
  }

  .upcycling-plan-content {
    font-size: 22rpx;
  }

  .recognition-bbox-label {
    max-width: 180rpx;
    font-size: 18rpx;
  }
}

@media (max-width: 420px) {
  .result-card {
    padding: 22rpx 20rpx;
  }

  .tag-text {
    font-size: 24rpx;
  }

  .ai-helper-btn {
    width: 100%;
  }

  .desc-box {
    padding: 16rpx;
  }
}

@media (prefers-color-scheme: dark) {
  .home-page {
    background: linear-gradient(180deg, #0f172a 0%, #111827 38%, #0b1120 100%);
  }

  .result-card {
    background: rgba(15, 23, 42, 0.9);
    border-color: rgba(148, 163, 184, 0.24);
    box-shadow: 0 8rpx 24rpx rgba(2, 6, 23, 0.55);
  }

  .tag-text {
    color: #dbeafe;
  }

  .desc-box {
    background: rgba(30, 41, 59, 0.7);
  }

  .desc-label {
    color: #5eead4;
  }

  .recognized-items-box {
    border-color: rgba(45, 212, 191, 0.28);
    background: rgba(13, 38, 33, 0.6);
  }

  .recognized-item-chip {
    background: rgba(15, 23, 42, 0.84);
    border-color: rgba(45, 212, 191, 0.28);
    color: #ccfbf1;
  }

  .upcycling-plan-item {
    border-color: rgba(96, 165, 250, 0.28);
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.86));
  }

  .upcycling-plan-content {
    color: rgba(226, 232, 240, 0.95);
  }

  .tabbar {
    background: rgba(15, 23, 42, 0.88);
    border-top: 2rpx solid rgba(148, 163, 184, 0.2);
  }

  .tabbar-icon,
  .tabbar-label {
    color: #94a3b8;
  }
}

@keyframes iconBounce {
  0% { transform: scale(1) translateY(0); }
  40% { transform: scale(1.2) translateY(-8rpx); }
  70% { transform: scale(1.1) translateY(-2rpx); }
  100% { transform: scale(1.15) translateY(-4rpx); }
}
</style>













