<template>
  <view class="home-bg">
    <!-- 鑷畾涔夌姸鎬佹爮 -->
    <view class="custom-statusbar"></view>
    
    <!-- 绉戞妧鑳屾櫙鍔ㄦ晥鍏冪礌 -->
    <view class="tech-bg">
      <view class="tech-grid"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 6" :key="n" :style="getParticleStyle(n)"></view>
      </view>
    </view>
    
    <!-- 涓昏鍐呭鍖哄煙 -->
    <view class="home-container">
      <!-- 椤堕儴鏍囬鍖哄煙 -->
      <view class="header-section">
        <view class="main-title">
          <image class="title-icon" src="/static/colorful-bin.png" mode="aspectFill"></image>
          <text class="title-text">AI鍨冨溇璇嗗埆</text>
        </view>
        <view class="subtitle">鏅鸿兘鍒嗙被 路 缁胯壊鐜繚 路 绉戞妧璧嬭兘</view>
      </view>
      
      <!-- 璁惧杩炴帴鐘舵€佹í骞?-->
      <view v-if="hasConnection" class="device-connection-banner" @click="goToDeviceConnection">
        <view class="connection-glow"></view>
        <view class="connection-content">
          <view class="connection-status">
            <view class="status-indicator">
              <view class="status-dot"></view>
              <view class="status-ring"></view>
            </view>
            <view class="connection-info">
              <view class="connection-header">
                <text class="connection-icon">馃摗</text>
                <text class="connection-title">鏅鸿兘璁惧鍦ㄧ嚎</text>
              </view>
              <text class="connection-desc">{{ connectedDevice?.device_name || '鐜繚鍒嗙被璁惧' }}</text>
            </view>
          </view>
          <view class="connection-action">
            <view class="action-icon">鈿?</view>
            <text class="action-text">绠＄悊</text>
          </view>
        </view>
        <view class="connection-scan-line"></view>
      </view>
      
      <!-- 涓婁紶鍖哄煙 -->
      <view class="upload-section">
        
        <view class="upload-container" @click="onAddImage" :class="{ 'processing': isProcessing }">
          <view class="upload-border">
            <view class="upload-inner">
              <view class="upload-icon">
                <text v-if="!isProcessing">馃摲</text>
                <view v-else class="loading-spinner">
                  <view class="spinner"></view>
                </view>
              </view>
              <text class="upload-text" v-if="!isProcessing">鐐瑰嚮涓婁紶鍥剧墖</text>
              <text class="upload-text processing" v-else>{{ processStatus }}</text>
              <text class="upload-hint" v-if="!isProcessing">鏀寔JPG銆丳NG鏍煎紡锛岃嚜鍔ㄥ帇缂╀紭鍖?</text>
              <text class="upload-hint processing" v-else>璇风◢鍊欙紝姝ｅ湪澶勭悊鎮ㄧ殑鍥剧墖...</text>
            </view>
          </view>
          <view class="scan-line" v-if="isProcessing"></view>
        </view>
      </view>
      
      <!-- 璇嗗埆缁撴灉鍖哄煙 -->
      <view v-if="resultImage" class="result-section">
        <view class="result-card">
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
          
          <view class="result-details">
            <view class="category-row">
              <view :class="['category-display', getCategoryClass(resultCategory)]">
                <view class="category-icon">{{ getCategoryIcon(resultCategory) }}</view>
              <view class="category-info">
                <text class="category-label">鍒嗙被缁撴灉</text>
                <text class="category-name">{{ resultCategory }}</text>
              </view>
            </view>
            
              <view class="ai-helper-btn" @click="goAiChatFromResult">AI对话</view>
            </view>

            <view v-if="recognizedItems.length" class="recognized-items-box">
              <text class="recognized-items-title">璇嗗埆鍒扮殑鍏蜂綋鐗╁搧</text>
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
                :class="['upcycling-plan-item', { 'is-warning': /鎻愰啋|椋庨櫓|娉ㄦ剰/.test(section.title) }]"
              >
                <text class="upcycling-plan-title">{{ section.title }}</text>
                <text class="upcycling-plan-content">{{ section.content }}</text>
              </view>
            </view>

            <view v-else-if="resultDesc" class="description-panel">
              <text class="desc-label">💡 处理建议</text>
              <text class="desc-content">{{ resultDesc }}</text>
            </view>
          </view>
        </view>
      </view>
      
      <!-- 榛樿鎻愮ず鍖哄煙 -->
      <view v-if="!resultImage" class="welcome-section">
        <view class="welcome-card">
          <text class="welcome-icon">馃尡</text>
          <text class="welcome-title">寮€濮嬫櫤鑳藉垎绫?</text>
          <text class="welcome-desc">涓婁紶鍥剧墖锛孉I灏嗕负鎮ㄨ瘑鍒瀮鍦剧被鍨?br/>鍏卞悓璺佃缁胯壊鐜繚鐞嗗康</text>
        </view>
        
        <!-- 鍨冨溇鍒嗙被鎸囧崡鍗＄墖 -->
        <view class="guide-cards">
          <view class="guide-card recyclable" @click="showGuideDetail('recyclable')">
            <view class="guide-icon">鈾伙笍</view>
            <view class="guide-content">
              <text class="guide-title">鍙洖鏀跺瀮鍦?</text>
              <text class="guide-desc">濉戞枡銆佺焊绫汇€侀噾灞炵瓑</text>
            </view>
            <view class="guide-arrow">鈫?</view>
          </view>
          
          <view class="guide-card harmful" @click="showGuideDetail('harmful')">
            <view class="guide-icon">鈽笍</view>
            <view class="guide-content">
              <text class="guide-title">鏈夊鍨冨溇</text>
              <text class="guide-desc">鐢垫睜銆佽嵂鍝併€佸寲瀛﹀搧</text>
            </view>
            <view class="guide-arrow">鈫?</view>
          </view>
          
          <view class="guide-card kitchen" @click="showGuideDetail('kitchen')">
            <view class="guide-icon">馃崕</view>
            <view class="guide-content">
              <text class="guide-title">鍘ㄤ綑鍨冨溇</text>
              <text class="guide-desc">鍓╄彍鍓╅キ銆佹灉鐨瓑</text>
            </view>
            <view class="guide-arrow">鈫?</view>
          </view>
          
          <view class="guide-card other" @click="showGuideDetail('other')">
            <view class="guide-icon">馃棏锔?</view>
            <view class="guide-content">
              <text class="guide-title">鍏朵粬鍨冨溇</text>
              <text class="guide-desc">闅句互鍥炴敹鐨勫簾寮冪墿</text>
            </view>
            <view class="guide-arrow">鈫?</view>
          </view>
        </view>
      </view>
        
        <!-- 鍔熻兘蹇嵎鍏ュ彛 -->
      <view class="welcome-section">
        <view class="quick-actions">
          <view class="action-item" @click="goShop">
            <view class="action-icon shop">馃泹锔?</view>
            <text class="action-text">绉垎鍟嗗煄</text>
            <text class="points-badge" v-if="points !== null">{{ points }}</text>
          </view>
          <view v-if="!isH5Platform" class="action-item" @click="scanDeviceQR">
            <view class="action-icon">馃摫</view>
            <text class="action-text">杩炴帴璁惧</text>
          </view>
          <view v-if="isH5Platform" class="action-item" @click="goMap">
            <view class="action-icon">馃椇锔?</view>
            <text class="action-text">鍨冨溇妗跺湴鍥?</text>
          </view>
          <view class="action-item" @click="goRanking">
            <view class="action-icon">馃弳</view>
            <text class="action-text">鐜繚鎺掕姒?</text>
          </view>
        </view>
      </view>
    </view>
    
    <!-- 鑷畾涔夊垎绫绘寚鍗楀脊绐?-->
    <view v-if="showGuideModal && currentGuide.title" class="guide-modal-overlay" @click="closeGuideModal">
      <view class="guide-modal" @click.stop="">
        <view class="modal-header">
          <view class="modal-icon">{{ currentGuide.icon || '❓' }}</view>
          <text class="modal-title">{{ currentGuide.title || '鏈煡鍒嗙被' }}</text>
          <view class="modal-close" @click="closeGuideModal">鉁?</view>
        </view>
        <view class="modal-content">
          <text class="modal-text">{{ currentGuide.content || '鏆傛棤鐩稿叧淇℃伅' }}</text>
        </view>
        <view class="modal-footer">
          <view class="modal-btn" @click="closeGuideModal">
            <text class="btn-text">鎴戠煡閬撲簡</text>
          </view>
        </view>
        <view class="modal-glow"></view>
      </view>
    </view>
    
    <!-- 绉戞妧鎰熷簳閮ㄥ鑸爮 -->
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
const recognizedItems = ref([])
const upcyclingSections = ref([])
const rawBboxes = ref([])
const displayBboxes = ref([])
const recognizeBBoxSpace = ref('')
let bboxRefreshTimer = 0
const bboxLoadBoundImages = new WeakSet()

// 妫€娴嬫槸鍚︿负H5骞冲彴
const isH5Platform = ref(false)

// 浣跨敤璁惧杩炴帴鐘舵€佺鐞?
const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

// 鍥剧墖鍘嬬缉閰嶇疆
const compressionConfig = {
  h5: {
    quality: 0.99,        // H5鍘嬬缉璐ㄩ噺 (0-1)
    maxWidth: 800,      // 鏈€澶у搴?
    maxHeight: 800      // 鏈€澶ч珮搴?
  },
  miniProgram: {
    quality: 100,         // 灏忕▼搴忓帇缂╄川閲?(0-100)
    maxSize: 800,        // 鏈€闀胯竟灏哄 (px)
  }
}

// 妫€娴嬪钩鍙扮被鍨?
onMounted(() => {
  // 鏇寸簿纭殑骞冲彴妫€娴?
  let platform
  let uniPlatform
  
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
  
  // 鏇寸簿纭殑H5骞冲彴妫€娴?
  isH5Platform.value = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  console.log('Platform detected:', { platform, uniPlatform, isH5Platform: isH5Platform.value })
  
  // 鑾峰彇绯荤粺鐘舵€佹爮楂樺害
  let statusBarHeight = 0
  try {
    const windowInfo = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBarHeight = windowInfo.statusBarHeight || 0
  } catch (e) {
    const systemInfo = uni.getSystemInfoSync()
    statusBarHeight = systemInfo.statusBarHeight || 0
  }
  
  // 鍙湪H5鐜涓缃瓹SS鍙橀噺
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')
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

// 鐢熸垚绮掑瓙鍔ㄧ敾鏍峰紡
const getParticleStyle = (index) => {
  const positions = [
    { left: '10%', animationDelay: '0s' },
    { left: '20%', animationDelay: '2s' },
    { left: '70%', animationDelay: '1s' },
    { left: '85%', animationDelay: '3s' },
    { left: '45%', animationDelay: '1.5s' },
    { left: '60%', animationDelay: '2.5s' }
  ]
  return positions[index - 1] || positions[0]
}
// 鍥剧墖鍘嬬缉鍑芥暟
function getCategoryClass(category) {
  const text = String(category || '')
  if (text.includes('可回收') || text.toLowerCase().includes('recycl')) return 'recyclable'
  if (text.includes('鏈夊') || text.toLowerCase().includes('harm')) return 'harmful'
  if (text.includes('鍘ㄤ綑') || text.toLowerCase().includes('kitchen')) return 'kitchen'
  return 'other'
}

function getCategoryIcon(category) {
  const cls = getCategoryClass(category)
  if (cls === 'recyclable') return '鈾伙笍'
  if (cls === 'harmful') return '鈽狅笍'
  if (cls === 'kitchen') return '馃崈'
  return '馃棏锔?'
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
    const labelName = String((item.label && (item.label.name || item.label.source_name)) || `鐩爣${item.index + 1}`)
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
    // 妫€鏌ユ槸鍚︽敮鎸乧anvas
    if (typeof document === 'undefined') {
      reject(new Error('褰撳墠鐜涓嶆敮鎸乧anvas鍘嬬缉'))
      return
    }
    
    // 鍒涘缓canvas杩涜鍘嬬缉
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = function() {
      try {
        // 璁＄畻鍘嬬缉鍚庣殑灏哄
        let { width, height } = img
        
        // 璁板綍鍘熷灏哄
        const originalWidth = width
        const originalHeight = height
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        
        // 璁剧疆canvas灏哄
        canvas.width = width
        canvas.height = height
        
        // 璁剧疆楂樿川閲忕缉鏀?
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        
        // 缁樺埗骞跺帇缂?
        ctx.drawImage(img, 0, 0, width, height)
        
        // 杞崲涓篵lob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log('鍥剧墖鍘嬬缉瀹屾垚:', {
                originalSize: `${originalWidth}x${originalHeight}`,
                compressedSize: `${width}x${height}`,
                compressedFileSize: (blob.size / 1024 / 1024).toFixed(2) + 'MB',
                quality: Math.round(quality * 100) + '%'
              })
              resolve(blob)
            } else {
              reject(new Error('鍥剧墖鍘嬬缉澶辫触锛氭棤娉曠敓鎴怋lob'))
            }
          },
          'image/jpeg',
          quality
        )
      } catch (drawError) {
        reject(new Error('鍥剧墖缁樺埗澶辫触: ' + drawError.message))
      }
    }
    
    img.onerror = (error) => {
      reject(new Error('鍥剧墖鍔犺浇澶辫触: ' + error))
    }
    
    // 璁剧疆璺ㄥ煙灞炴€?
    img.crossOrigin = 'anonymous'
    img.src = filePath
  })
}

// 灏忕▼搴忕幆澧冨浘鐗囧帇缂╋紙淇濇寔闀垮姣旓紝鎸夋渶闀胯竟缂╂斁锛?
function compressImageMiniProgram(filePath, quality = 80, maxSize = 800) {
  return new Promise((resolve, reject) => {
    // 鍏堣幏鍙栧浘鐗囦俊鎭?
    uni.getImageInfo({
      src: filePath,
      success: (info) => {
        const { width: originalWidth, height: originalHeight } = info
        
        // 璁＄畻缂╂斁鍚庣殑灏哄锛堜繚鎸侀暱瀹芥瘮锛?
        let targetWidth = originalWidth
        let targetHeight = originalHeight
        
        // 鎵惧嚭鏈€闀胯竟
        const maxOriginalSize = Math.max(originalWidth, originalHeight)
        
        // 濡傛灉鏈€闀胯竟瓒呰繃闄愬埗锛岃繘琛岀瓑姣旂缉鏀?
        if (maxOriginalSize > maxSize) {
          const scale = maxSize / maxOriginalSize
          targetWidth = Math.round(originalWidth * scale)
          targetHeight = Math.round(originalHeight * scale)
        }
        
        console.log('灏忕▼搴忓浘鐗囧昂瀵歌绠?', {
          originalSize: `${originalWidth}x${originalHeight}`,
          maxSideLimit: maxSize + 'px',
          targetSize: `${targetWidth}x${targetHeight}`,
          scaleRatio: (maxOriginalSize > maxSize ? (maxSize / maxOriginalSize).toFixed(3) : '1.000')
        })
        
        // 鎵ц鍘嬬缉
        uni.compressImage({
          src: filePath,
          quality: quality,
          compressedWidth: targetWidth,   // 浣跨敤璁＄畻鍚庣殑瀹藉害
          compressedHeight: targetHeight, // 浣跨敤璁＄畻鍚庣殑楂樺害
          success: (res) => {
            console.log('灏忕▼搴忓浘鐗囧帇缂╁畬鎴?', {
              originalPath: filePath,
              compressedPath: res.tempFilePath,
              quality: quality + '%',
              finalSize: `${targetWidth}x${targetHeight}`
            })
            resolve(res.tempFilePath)
          },
          fail: (err) => {
            console.warn('灏忕▼搴忓浘鐗囧帇缂╁け璐ワ紝浣跨敤鍘熷浘:', err)
            resolve(filePath) // 鍘嬬缉澶辫触鏃朵娇鐢ㄥ師鍥?
          }
        })
      },
      fail: (err) => {
        console.warn('鑾峰彇鍥剧墖淇℃伅澶辫触锛岀洿鎺ヤ娇鐢ㄨ川閲忓帇缂?', err)
        // 濡傛灉鑾峰彇鍥剧墖淇℃伅澶辫触锛屽彧杩涜璐ㄩ噺鍘嬬缉
        uni.compressImage({
          src: filePath,
          quality: quality,
          success: (res) => {
            console.log('灏忕▼搴忓浘鐗囪川閲忓帇缂╁畬鎴?', {
              originalPath: filePath,
              compressedPath: res.tempFilePath,
              quality: quality + '%'
            })
            resolve(res.tempFilePath)
          },
          fail: (compressErr) => {
            console.warn('灏忕▼搴忓浘鐗囧帇缂╁け璐ワ紝浣跨敤鍘熷浘:', compressErr)
            resolve(filePath)
          }
        })
      }
    })
  })
}

async function processImage(filePath) {
  try {
    resetEnhancedRecognition()
    processStatus.value = '鍥剧墖澶勭悊涓?..'
    uni.showLoading({ title: '鍥剧墖澶勭悊涓?..' })
    
    // 绗竴姝ワ細鍥剧墖鍘嬬缉
    let compressedFile = filePath
    let compressedBlob = null
    try {
      if (isH5Platform.value) {
        // H5鐜浣跨敤canvas鍘嬬缉
        processStatus.value = '姝ｅ湪鍘嬬缉鍥剧墖...'
        console.log('H5鐜锛氬紑濮嬪浘鐗囧帇缂?..')
        const { quality, maxWidth } = compressionConfig.h5
        compressedBlob = await compressImage(filePath, quality, maxWidth)
        
        // 鍒涘缓File瀵硅薄鐢ㄤ簬API涓婁紶锛屼娇鐢ㄦ椂闂存埑+闅忔満鏁扮敓鎴愬敮涓€鏂囦欢鍚?
        const timestamp = Date.now()
        const randomId = Math.random().toString(36).substring(2, 8)
        const uniqueFileName = `compressed_${timestamp}_${randomId}.jpg`
        
        compressedFile = new File([compressedBlob], uniqueFileName, {
          type: 'image/jpeg'
        })
        
        console.log('H5鍥剧墖鍘嬬缉瀹屾垚锛屾枃浠跺ぇ灏?', (compressedFile.size / 1024 / 1024).toFixed(2) + 'MB')
      } else {
        // 灏忕▼搴忕幆澧冧娇鐢╱ni.compressImage
        processStatus.value = '姝ｅ湪浼樺寲鍥剧墖...'
        console.log('灏忕▼搴忕幆澧冿細寮€濮嬪浘鐗囧帇缂?..')
        const { quality, maxSize } = compressionConfig.miniProgram
        compressedFile = await compressImageMiniProgram(filePath, quality, maxSize)
      }
      
      console.log('鍥剧墖鍘嬬缉鎴愬姛')
    } catch (compressError) {
      console.warn('鍥剧墖鍘嬬缉澶辫触锛屼娇鐢ㄥ師鍥?', compressError)
      compressedFile = filePath
    }
    
    // 绗簩姝ワ細鏄剧ず鍘嬬缉鍚庣殑鍥剧墖棰勮
    if (isH5Platform.value && compressedBlob) {
      // H5鐜鏄剧ず鍘嬬缉鍚庣殑棰勮
      resultImage.value = URL.createObjectURL(compressedBlob)
    } else {
      // 灏忕▼搴忕幆澧冩樉绀哄帇缂╁悗鐨勮矾寰?
      resultImage.value = compressedFile
    }
    
    // 绗笁姝ワ細璋冪敤璇嗗埆API
    processStatus.value = 'AI鏅鸿兘璇嗗埆涓?..'
    uni.showLoading({ title: 'AI璇嗗埆涓?..' })
    const res = await recognizeImage(compressedFile)
    // console.log('鍚庣杩斿洖鏁版嵁:', res) // 璋冭瘯鏃ュ織

    // 绗洓姝ワ細澶勭悊璇嗗埆缁撴灉
    processStatus.value = '澶勭悊璇嗗埆缁撴灉...'
    
    // 纭繚鍚庣杩斿洖鐨勬暟鎹粨鏋勬纭?
    if (res.labels && res.labels.length > 0) {
      const label = res.labels[0]
      resultCategory.value = label.name || '鏈煡绫诲埆'
      resultConfidence.value = label.confidence ? (label.confidence * 100).toFixed(2) + '%' : '未知置信度'
      // 妫€鏌ュ苟閬垮厤閲嶅娣诲姞鍓嶇紑
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
      resultDesc.value = label.describe
    } else {
      resultCategory.value = '鏈瘑鍒埌'
      resultConfidence.value = 'NA'
      resultDesc.value = '鏈娴嬪埌浠讳綍鏍囩淇℃伅'
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
    }
    
    // 娓呯悊H5鐜涓嬬殑涓存椂URL锛堝欢杩熸竻鐞嗭紝閬垮厤褰卞搷鏄剧ず锛?
    applyEnhancedRecognitionData(res)

    if (isH5Platform.value && resultImage.value && resultImage.value.startsWith('blob:')) {
      setTimeout(() => {
        URL.revokeObjectURL(resultImage.value)
      }, 10000) // 10绉掑悗娓呯悊棰勮URL
    }
    
    processStatus.value = '识别完成'
    uni.showToast({
      title: '识别完成',
      icon: 'success'
    })
    
  } catch (err) {
    resetEnhancedRecognition()
    resultImage.value = ''
    resultCategory.value = ''
    resultConfidence.value = ''
    resultDesc.value = ''
    processStatus.value = '澶勭悊澶辫触'
    
    if (err && err.msg){
      uni.showToast({
        title: err.msg || '璇嗗埆澶辫触',
        icon: 'none'
      })
      if (err.msg == '鏈櫥褰?') {
        uni.redirectTo({ url: '/pages-dark/index/index' })
      }
    }else{ 
      uni.showToast({
        title: '缃戠粶閿欒',
        icon: 'none'
      })
    }
    console.error('鍥剧墖澶勭悊澶辫触:', err)
  } finally {
    uni.hideLoading()
    isProcessing.value = false
    processStatus.value = '澶勭悊涓?..' // 閲嶇疆鐘舵€?
  }
}

function onAddImage() {
  if (isProcessing.value) {
    uni.showToast({
      title: '姝ｅ湪澶勭悊涓紝璇风◢鍊?..',
      icon: 'none'
    })
    return
  }
  
  console.log('onAddImage 寮€濮嬮€夋嫨鍥剧墖')
  
  // 閰嶇疆鍥剧墖閫夋嫨鍙傛暟
  const chooseConfig = {
    count: 1,
    sizeType: ['compressed'], // 浼樺厛閫夋嫨鍘嬬缉鍥?
    sourceType: ['album', 'camera'], // 鏀寔鐩稿唽鍜屾媿鐓?
    success: chooseRes => {
      const filePath = chooseRes.tempFilePaths[0]
      console.log('鍥剧墖閫夋嫨鎴愬姛:', {
        path: filePath,
        size: chooseRes.tempFiles?.[0]?.size ? (chooseRes.tempFiles[0].size / 1024 / 1024).toFixed(2) + 'MB' : 'unknown'
      })
      
      isProcessing.value = true
      processImage(filePath).catch(err => {
        console.error('鍥剧墖澶勭悊澶辫触:', err)
        isProcessing.value = false
      })
    },
    fail: err => {
      console.log('鍥剧墖閫夋嫨澶辫触:', err)
      uni.showToast({
        title: '鍥剧墖閫夋嫨鍙栨秷',
        icon: 'none'
      })
    }
  }
  
  uni.chooseImage(chooseConfig)
}

function goHistory() {
  uni.navigateTo({ url: '/pages-dark/history/history?from=home' })
}

function goShop() {
  uni.navigateTo({ url: '/pages-dark/shop/shop?from=home' })
}

function goProfile() {
  uni.redirectTo({ url: '/pages-dark/profile/profile' })
}

function goMap() {
  uni.navigateTo({ url: '/pages-dark/map/map?from=home' })
}

function goGuide() {
  uni.navigateTo({ url: '/pages-dark/guide/guide?from=home' })
}

function goRanking() {
  uni.navigateTo({ url: '/pages-dark/ranking/ranking?from=home' })
}

function scanDeviceQR() {
  // 妫€鏌ュ綋鍓嶅钩鍙?- 浣跨敤涓巓nMounted鐩稿悓鐨勯€昏緫
  let platform
  let uniPlatform
  let isH5 = false
  
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
  
  // 鏇寸簿纭殑H5骞冲彴妫€娴?
  isH5 = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  console.log('scanDeviceQR - Platform:', { platform, uniPlatform, isH5 })
  
  if (isH5) {
    // H5绔娇鐢ㄨ緭鍏ユ鏇夸唬鎵爜
    uni.showModal({
      title: '杩炴帴璁惧',
      content: '璇疯緭鍏ヨ澶嘔D锛圚5绔殏涓嶆敮鎸佹壂鐮侊級',
      editable: true,
      placeholderText: '璇疯緭鍏ヨ澶嘔D',
      success: function(res) {
        if (res.confirm && res.content) {
          connectDevice(res.content)
        }
      }
    })
  } else {
    // 灏忕▼搴忕浣跨敤鎵爜鍔熻兘
    uni.scanCode({
      scanType: ['qrCode'],
      success: function(res) {
        connectDevice(res.result)
      },
      fail: function(err) {
        console.log('鎵爜澶辫触:', err)
        uni.showToast({
          title: '鎵爜澶辫触锛岃閲嶈瘯',
          icon: 'none'
        })
      }
    })
  }
}

function connectDevice(deviceId) {
  if (!deviceId || deviceId.trim() === '') {
    uni.showToast({
      title: '璁惧ID涓嶈兘涓虹┖',
      icon: 'none'
    })
    return
  }
  //鎴彇deviceId涓?鍚庨潰鐨勫唴瀹?
  const targetId = deviceId.split('#')[1]
  console.log('Connecting to device with ID:', targetId)
  uni.navigateTo({ url: targetId })
  return
  // 鏄剧ず杩炴帴涓殑鎻愮ず
  uni.showLoading({
    title: '杩炴帴璁惧涓?..'
  })
  
  // 妯℃嫙杩炴帴璁惧鐨勮繃绋?
  setTimeout(() => {
    uni.hideLoading()
    
    // 淇濆瓨璁惧杩炴帴淇℃伅鍒版湰鍦板瓨鍌?
    const deviceInfo = {
      device_id: deviceId.trim(),
      device_name: '鏅鸿兘鍨冨溇鍒嗙被璁惧',
      connected_time: Date.now()
    }
    
    uni.setStorageSync('connectedDevice', deviceInfo)
    uni.setStorageSync('connection', Date.now())
    
    // 鏄剧ず杩炴帴鎴愬姛鎻愮ず
    uni.showToast({
      title: '璁惧杩炴帴鎴愬姛',
      icon: 'success'
    })
    
    // 鍒锋柊椤甸潰浠ユ樉绀鸿繛鎺ョ姸鎬?
    setTimeout(() => {
      uni.redirectTo({ url: '/pages-dark/home/home' })
    }, 1500)
    
  }, 2000)
}

function showGuideDetail(type) {
  if (!type) return

  const guides = {
    recyclable: {
      icon: '鈾伙笍',
      title: '可回收垃圾',
      content: '包括废纸、塑料、玻璃、金属和布料等。可回收物经过分类处理后可再利用，能减少污染并节约资源。'
    },
    harmful: {
      icon: '鈽笍',
      title: '有害垃圾',
      content: '包括废电池、废灯管、废药品、废油漆及其容器等，需投放到有害垃圾回收点进行专门处理。'
    },
    kitchen: {
      icon: '馃崕',
      title: '厨余垃圾',
      content: '包括剩菜剩饭、果皮果核、骨头、菜叶等厨余废弃物，可通过堆肥等方式资源化处理。'
    },
    other: {
      icon: '馃棏锔?',
      title: '其他垃圾',
      content: '包括砖瓦陶瓷、卫生纸、尘土等难以回收利用的废弃物，一般采用卫生填埋等方式处理。'
    }
  }

  const guide = guides[type]
  if (guide) {
    currentGuide.value = { ...guide }
    showGuideModal.value = true
  } else {
    currentGuide.value = {
      icon: '❓',
      title: '信息缺失',
      content: '抱歉，该分类的详细信息暂时无法显示，请稍后重试。'
    }
    showGuideModal.value = true
  }
}

function closeGuideModal() {
  showGuideModal.value = false
  // 寤舵椂娓呯悊锛岄伩鍏嶅姩鐢昏繃绋嬩腑鏁版嵁闂儊
  setTimeout(() => {
    currentGuide.value = {}
  }, 300)
}
</script>

<style scoped>
/* 涓昏儗鏅?*/
.home-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 25%, #2d1b69 50%, #0f0f23 100%);
  position: relative;
  overflow: hidden;
}

/* 鑷畾涔夌姸鎬佹爮 */
.custom-statusbar {
  height: var(--status-bar-height);
  background: transparent;
  position: relative;
  z-index: 10;
}

/* 绉戞妧鑳屾櫙鍏冪礌 */
.tech-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.tech-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(64, 224, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 224, 255, 0.1) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
}

/* 娴姩绮掑瓙 */
.floating-particles {
  position: absolute;
  width: 100%;
  height: 100%;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 50%;
  animation: float 6s ease-in-out infinite;
  box-shadow: 0 0 10px rgba(64, 224, 255, 0.5);
}

@keyframes float {
  0%, 100% { transform: translateY(0px) scale(1); opacity: 0.7; }
  50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
}

/* 涓诲鍣?*/
.home-container {
  position: relative;
  z-index: 2;
  padding: 40rpx 32rpx 140rpx 32rpx; /* 鎭㈠鍘熸潵鐨刾adding锛屽洜涓哄凡鏈夎嚜瀹氫箟鐘舵€佹爮 */
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--status-bar-height));
}

/* 鏍囬鍖哄煙 */
.header-section {
  text-align: center;
  margin-bottom: 60rpx;
  margin-top: 40rpx;
}

.main-title {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}

.title-icon {
  width: 64rpx;
  height: 64rpx;
  margin-right: 16rpx;
  border-radius: 12rpx;
  object-fit: cover;
  box-shadow: 0 6rpx 14rpx rgba(64, 224, 255, 0.15);
  border: 1rpx solid rgba(64, 224, 255, 0.08);
  filter: brightness(0.9);
}

.title-text {
  font-size: 56rpx;
  font-weight: 700;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4, #44a08d);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30px rgba(64, 224, 255, 0.3);
}

.subtitle {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 2rpx;
}

/* 涓婁紶鍖哄煙 */
.upload-section {
  margin-bottom: 60rpx;
}

/* 璁惧杩炴帴妯箙 */
.device-connection-banner {
  position: relative;
  background: linear-gradient(135deg, 
    rgba(16, 185, 129, 0.15) 0%, 
    rgba(5, 150, 105, 0.15) 50%, 
    rgba(6, 78, 59, 0.15) 100%);
  backdrop-filter: blur(25px) saturate(1.2);
  border: 2px solid rgba(16, 185, 129, 0.4);
  border-radius: 24rpx;
  padding: 10rpx 40rpx;
  margin-bottom: 40rpx;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
  box-shadow: 
    0 12rpx 40rpx rgba(16, 185, 129, 0.15),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.1),
    inset 0 -1rpx 0 rgba(0, 0, 0, 0.1);
}

.device-connection-banner:active {
  transform: scale(0.97) translateY(2rpx);
  box-shadow: 
    0 6rpx 20rpx rgba(16, 185, 129, 0.25),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.1);
}

.connection-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%);
  animation: connectionGlow 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes connectionGlow {
  0%, 100% { opacity: 0.3; transform: scale(1) rotate(0deg); }
  50% { opacity: 0.6; transform: scale(1.1) rotate(180deg); }
}

.connection-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 24rpx;
  flex: 1;
}

.status-indicator {
  position: relative;
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-dot {
  width: 16rpx;
  height: 16rpx;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 
    0 0 20rpx #10b981,
    inset 0 2rpx 4rpx rgba(255, 255, 255, 0.3);
  animation: statusPulse 2s ease-in-out infinite;
  z-index: 2;
}

.status-ring {
  position: absolute;
  width: 40rpx;
  height: 40rpx;
  border: 2rpx solid rgba(16, 185, 129, 0.4);
  border-radius: 50%;
  animation: ringExpand 2s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { 
    transform: scale(1); 
    box-shadow: 0 0 20rpx #10b981, inset 0 2rpx 4rpx rgba(255, 255, 255, 0.3); 
  }
  50% { 
    transform: scale(1.2); 
    box-shadow: 0 0 30rpx #10b981, 0 0 40rpx rgba(16, 185, 129, 0.4), inset 0 2rpx 4rpx rgba(255, 255, 255, 0.3); 
  }
}

@keyframes ringExpand {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.8); opacity: 0; }
}

.connection-info {
  flex: 1;
}

.connection-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 5rpx;
}

.connection-icon {
  font-size: 32rpx;
  filter: drop-shadow(0 0 8rpx rgba(16, 185, 129, 0.6));
}

.connection-title {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  text-shadow: 0 0 12rpx rgba(16, 185, 129, 0.4);
}

.connection-desc {
  color: rgba(255, 255, 255, 0.8);
  font-size: 24rpx;
  font-weight: 400;
  margin-left: 44rpx;
  font-family: 'Courier New', monospace;
}

.connection-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 10rpx 20rpx;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 16rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.3);
  transition: all 0.3s ease;
}

.action-icon {
  font-size: 24rpx;
  color: #10b981;
  animation: actionPulse 1.5s ease-in-out infinite;
}

.action-text {
  color: #10b981;
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
}

@keyframes actionPulse {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.8; }
  50% { transform: scale(1.1) rotate(5deg); opacity: 1; }
}

.connection-scan-line {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(16, 185, 129, 0.6) 50%, 
    transparent 100%);
  animation: scanLine 3s linear infinite;
  pointer-events: none;
}

@keyframes scanLine {
  0% { left: -100%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { left: 100%; opacity: 0; }
}

.upload-container {
  position: relative;
  margin: 0 auto;
  width: 600rpx;
  height: 300rpx;
}

.upload-border {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 24rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4, #44a08d);
  padding: 4rpx;
  transition: all 0.3s ease;
}

.upload-container:active .upload-border {
  transform: scale(0.98);
  box-shadow: 0 8rpx 32rpx rgba(64, 224, 255, 0.4);
}

.upload-inner {
  width: 100%;
  height: 100%;
  background: rgba(15, 15, 35, 0.9);
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(64, 224, 255, 0.3);
}

.upload-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
  filter: drop-shadow(0 0 20px rgba(64, 224, 255, 0.6));
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  margin-bottom: 24rpx;
}

.spinner {
  width: 100%;
  height: 100%;
  border: 4rpx solid rgba(64, 224, 255, 0.3);
  border-top: 4rpx solid #40e0ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.upload-text {
  font-size: 32rpx;
  color: #40e0ff;
  font-weight: 600;
  margin-bottom: 16rpx;
  text-shadow: 0 0 10px rgba(64, 224, 255, 0.5);
}

.upload-text.processing {
  color: #4ecdc4;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.upload-hint {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.3s ease;
}

.upload-hint.processing {
  color: rgba(78, 205, 196, 0.8);
  font-size: 22rpx;
}

/* 鎵弿绾垮姩鏁?*/
.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4rpx;
  background: linear-gradient(90deg, transparent, #40e0ff, transparent);
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(300rpx); opacity: 0; }
}

/* 缁撴灉鍖哄煙 */
.result-section {
  flex: 1;
  margin-bottom: 10rpx;
}

.result-card {
  background: rgba(15, 15, 35, 0.95);
  border-radius: 24rpx;
  padding: 40rpx;
  border: 1px solid rgba(64, 224, 255, 0.3);
  backdrop-filter: blur(20px);
  box-shadow: 
    0 8rpx 32rpx rgba(64, 224, 255, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.result-title {
  font-size: 36rpx;
  color: #40e0ff;
  font-weight: 600;
}

.confidence-badge {
  background: linear-gradient(45deg, #4ecdc4, #44a08d);
  padding: 12rpx 24rpx;
  border-radius: 50rpx;
  box-shadow: 0 4rpx 12rpx rgba(78, 205, 196, 0.3);
}

.confidence-text {
  color: white;
  font-size: 24rpx;
  font-weight: 600;
}

.result-image {
  width: 100%;
  height: 400rpx;
  border-radius: 16rpx;
  margin-bottom: 32rpx;
  border: 2rpx solid rgba(64, 224, 255, 0.3);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.3);
}

.result-image-wrap {
  position: relative;
}

.result-details {
  margin-top: 32rpx;
}

.category-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.ai-helper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: 999rpx;
  padding: 12rpx 24rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #031521;
  background: linear-gradient(135deg, #40e0ff, #58e8d4);
  box-shadow: 0 8rpx 20rpx rgba(64, 224, 255, 0.3);
}

.category-display {
  display: flex;
  align-items: center;
  background: rgba(64, 224, 255, 0.1);
  padding: 24rpx;
  border-radius: 16rpx;
  margin-bottom: 24rpx;
  border-left: 6rpx solid #40e0ff;
}

.category-display.recyclable {
  border-left-color: #2ad47a;
}

.category-display.harmful {
  border-left-color: #ff8a6b;
}

.category-display.kitchen {
  border-left-color: #ffc76c;
}

.category-display.other {
  border-left-color: #73a4c4;
}

.category-icon {
  font-size: 48rpx;
  margin-right: 24rpx;
}

.category-info {
  flex: 1;
}

.category-label {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8rpx;
}

.category-name {
  font-size: 32rpx;
  color: #40e0ff;
  font-weight: 600;
}

.description-panel {
  background: rgba(78, 205, 196, 0.1);
  padding: 24rpx;
  border-radius: 16rpx;
  border-left: 6rpx solid #4ecdc4;
}

.recognized-items-box {
  border: 1px solid rgba(64, 224, 255, 0.26);
  background: rgba(12, 31, 58, 0.62);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
}

.recognized-items-title {
  display: block;
  font-size: 24rpx;
  color: #9ceeff;
  font-weight: 700;
  margin-bottom: 12rpx;
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
  border: 1px solid rgba(120, 229, 255, 0.35);
  background: rgba(23, 51, 85, 0.7);
  color: #c7f6ff;
  font-size: 22rpx;
  padding: 8rpx 16rpx;
}

.upcycling-plan {
  display: grid;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.upcycling-plan-item {
  border: 1px solid rgba(91, 204, 255, 0.26);
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  background: linear-gradient(135deg, rgba(20, 41, 71, 0.82), rgba(11, 27, 48, 0.86));
}

.upcycling-plan-item.is-warning {
  border-color: rgba(255, 174, 92, 0.35);
  background: linear-gradient(135deg, rgba(63, 41, 18, 0.88), rgba(48, 30, 12, 0.88));
}

.upcycling-plan-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: rgba(64, 224, 255, 0.18);
  color: #8eefff;
  font-size: 20rpx;
  font-weight: 700;
  padding: 6rpx 14rpx;
}

.upcycling-plan-item.is-warning .upcycling-plan-title {
  background: rgba(255, 196, 120, 0.22);
  color: #ffe2af;
}

.upcycling-plan-content {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(235, 247, 255, 0.9);
}

.recognition-bbox-layer {
  position: absolute;
  inset: 0;
  z-index: 18;
  pointer-events: none;
}

.recognition-bbox-item {
  position: absolute;
  border: 2px solid #40e0ff;
  border-radius: 10rpx;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
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

.desc-label {
  display: block;
  font-size: 28rpx;
  color: #4ecdc4;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.desc-content {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

/* 娆㈣繋鍖哄煙 */
.welcome-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 32rpx;
  margin-bottom: 20rpx;
}

.welcome-card {
  text-align: center;
  background: rgba(15, 15, 35, 0.8);
  padding: 48rpx 40rpx;
  border-radius: 24rpx;
  border: 1px solid rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(20px);
  width: 100%;
  max-width: 600rpx;
}

.welcome-icon {
  font-size: 80rpx;
  display: block;
  margin-bottom: 24rpx;
  filter: drop-shadow(0 0 20px rgba(78, 205, 196, 0.6));
}

.welcome-title {
  display: block;
  font-size: 32rpx;
  color: #40e0ff;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.welcome-desc {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
}

/* 鍨冨溇鍒嗙被鎸囧崡鍗＄墖 */
.guide-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  width: 100%;
  max-width: 600rpx;
}

.guide-card {
  background: rgba(15, 15, 35, 0.9);
  border-radius: 16rpx;
  padding: 24rpx;
  border: 1px solid rgba(64, 224, 255, 0.3);
  backdrop-filter: blur(15px);
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
  cursor: pointer;
}

.guide-card:active {
  transform: scale(0.95);
  box-shadow: 0 4rpx 16rpx rgba(64, 224, 255, 0.2);
}

.guide-card.recyclable {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.05);
}

.guide-card.harmful {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.05);
}

.guide-card.kitchen {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.05);
}

.guide-card.other {
  border-color: rgba(107, 114, 128, 0.4);
  background: rgba(107, 114, 128, 0.05);
}

.guide-icon {
  font-size: 32rpx;
  margin-right: 16rpx;
  filter: drop-shadow(0 0 8rpx rgba(64, 224, 255, 0.4));
}

.guide-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.guide-title {
  font-size: 26rpx;
  color: #ffffff;
  font-weight: 600;
  margin-bottom: 4rpx;
}

.guide-desc {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.3;
}

.guide-arrow {
  color: rgba(64, 224, 255, 0.7);
  font-size: 24rpx;
  margin-left: 12rpx;
  transition: transform 0.3s ease;
}

.guide-card:active .guide-arrow {
  transform: translateX(4rpx);
}

/* 鍔熻兘蹇嵎鍏ュ彛 */
.quick-actions {
  display: flex;
  justify-content: space-around;
  width: 100%;
  max-width: 650rpx;
  background: rgba(15, 15, 35, 0.8);
  border-radius: 20rpx;
  padding: 24rpx 16rpx;
  border: 1px solid rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(15px);
  box-sizing: border-box;
  gap: 16rpx;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 12rpx;
  border-radius: 16rpx;
  background: rgba(64, 224, 255, 0.08);
  border: 1px solid rgba(64, 224, 255, 0.2);
  transition: all 0.3s ease;
  cursor: pointer;
  box-sizing: border-box;
  min-height: 120rpx;
  flex: 1;
  min-width: 0;
}

.action-item:active {
  transform: scale(0.95);
  background: rgba(64, 224, 255, 0.15);
  box-shadow: 0 4rpx 12rpx rgba(64, 224, 255, 0.2);
}

.action-icon {
  font-size: 40rpx;
  margin-bottom: 12rpx;
  filter: drop-shadow(0 0 10rpx rgba(64, 224, 255, 0.5));
}

.action-text {
  font-size: 22rpx;
  color: #40e0ff;
  font-weight: 500;
  text-align: center;
}

/* 绉垎鍟嗗煄鍏ュ彛鐗规畩鏍峰紡 */
.action-item.shop-entry {
  position: relative;
  background: linear-gradient(135deg, 
    rgba(255, 215, 0, 0.15) 0%, 
    rgba(255, 193, 7, 0.15) 50%, 
    rgba(255, 152, 0, 0.15) 100%);
  border: 1px solid rgba(255, 215, 0, 0.4);
}

.action-item.shop-entry:active {
  background: linear-gradient(135deg, 
    rgba(255, 215, 0, 0.25) 0%, 
    rgba(255, 193, 7, 0.25) 50%, 
    rgba(255, 152, 0, 0.25) 100%);
  box-shadow: 0 4rpx 12rpx rgba(255, 215, 0, 0.3);
}

.action-icon.shop {
  color: #FFD700;
  filter: drop-shadow(0 0 10rpx rgba(255, 215, 0, 0.8));
}

.points-badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  background: linear-gradient(135deg, #FFD700, #FFA000);
  color: #1a1a1a;
  font-size: 18rpx;
  font-weight: 700;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  min-width: 32rpx;
  text-align: center;
  box-shadow: 0 2rpx 8rpx rgba(255, 215, 0, 0.4);
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* 鑷畾涔夊垎绫绘寚鍗楀脊绐?*/
.guide-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.guide-modal {
  position: relative;
  background: rgba(5, 25, 45, 0.95);
  backdrop-filter: blur(25px);
  border-radius: 24rpx;
  border: 2px solid rgba(64, 224, 255, 0.4);
  max-width: 600rpx;
  width: 100%;
  overflow: hidden;
  animation: modalSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 
    0 20rpx 60rpx rgba(0, 0, 0, 0.5),
    0 0 40rpx rgba(64, 224, 255, 0.2);
}

@keyframes modalSlideIn {
  0% { 
    opacity: 0; 
    transform: scale(0.8) translateY(40rpx); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1) translateY(0); 
  }
}

.modal-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(64, 224, 255, 0.15) 0%, transparent 70%);
  animation: modalGlow 3s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes modalGlow {
  0%, 100% { opacity: 0.3; transform: scale(1) rotate(0deg); }
  50% { opacity: 0.6; transform: scale(1.1) rotate(180deg); }
}

.modal-header {
  position: relative;
  background: linear-gradient(135deg, 
    rgba(64, 224, 255, 0.15) 0%, 
    rgba(0, 255, 136, 0.1) 100%);
  padding: 32rpx 40rpx;
  border-bottom: 1px solid rgba(64, 224, 255, 0.3);
  display: flex;
  align-items: center;
}

.modal-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
  filter: drop-shadow(0 0 15rpx rgba(64, 224, 255, 0.8));
  animation: iconFloat 2s ease-in-out infinite;
}

@keyframes iconFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4rpx); }
}

.modal-title {
  flex: 1;
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  text-shadow: 0 0 20rpx rgba(64, 224, 255, 0.6);
}

.modal-close {
  width: 48rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.8);
  font-size: 24rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.modal-close:active {
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.modal-content {
  padding: 40rpx;
  min-height: 200rpx;
  display: flex;
  align-items: center;
}

.modal-text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 28rpx;
  line-height: 1.8;
  letter-spacing: 1rpx;
  text-align: justify;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.5);
}

.modal-footer {
  padding: 0 40rpx 40rpx;
  display: flex;
  justify-content: center;
}

.modal-btn {
  background: linear-gradient(135deg, #40e0ff 0%, #4ecdc4 50%, #44a08d 100%);
  border-radius: 50rpx;
  padding: 20rpx 60rpx;
  box-shadow: 
    0 8rpx 24rpx rgba(64, 224, 255, 0.3),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.modal-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.3) 50%, 
    transparent 100%);
  transition: left 0.6s ease;
}

.modal-btn:active {
  transform: scale(0.95) translateY(2rpx);
  box-shadow: 
    0 4rpx 12rpx rgba(64, 224, 255, 0.4),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.2);
}

.modal-btn:active::before {
  left: 100%;
}

.btn-text {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
  text-shadow: 0 0 10rpx rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 2;
}

/* 搴曢儴瀵艰埅鏍?*/
@media (max-width: 768px) {
  .category-row {
    align-items: flex-start;
    flex-direction: column;
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

  .ai-helper-btn {
    width: 100%;
  }

  .desc-content {
    font-size: 22rpx;
  }
}

.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background: rgba(15, 15, 35, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(64, 224, 255, 0.3);
  box-shadow: 
    0 -8rpx 24rpx rgba(0, 0, 0, 0.3),
    0 0 40rpx rgba(64, 224, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24rpx;
  padding: 16rpx 0;
  transition: all 0.3s ease;
  position: relative;
}

.tabbar-item.active {
  color: #40e0ff;
  font-weight: 600;
  transform: translateY(-4rpx);
}

.tabbar-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60rpx;
  height: 6rpx;
  background: linear-gradient(45deg, #40e0ff, #4ecdc4);
  border-radius: 3rpx;
  box-shadow: 0 0 12rpx rgba(64, 224, 255, 0.6);
}

.tabbar-icon {
  font-size: 48rpx;
  margin-bottom: 8rpx;
  filter: drop-shadow(0 0 8px rgba(64, 224, 255, 0.3));
}

.tabbar-item.active .tabbar-icon {
  filter: drop-shadow(0 0 12px rgba(64, 224, 255, 0.8));
  animation: iconGlow 2s ease-in-out infinite;
}

@keyframes iconGlow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.tabbar-label {
  font-size: 22rpx;
  letter-spacing: 1rpx;
}
</style>

