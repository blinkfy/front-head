<template>
  <view class="home-page">
    <!-- 背景装饰 -->
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
    
    <!-- 顶部绿色背景区域 -->
    <view class="header-bg">
      <!-- 装饰元素 -->
      <view class="header-deco">
        <view class="deco-leaf leaf-1">🌿</view>
        <view class="deco-leaf leaf-2">🍃</view>
        <view class="deco-leaf leaf-3">♻️</view>
        <view class="deco-circle hc1"></view>
        <view class="deco-circle hc2"></view>
      </view>
      
      <view class="header-wave">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="#f5f7fa" fill-opacity="1" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,154.7C960,171,1056,181,1152,165.3C1248,149,1344,107,1392,85.3L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </view>
      
      <!-- 页面标题 -->
      <view class="header-content">
        <view class="main-title">
          <image class="title-icon" src="/static/colorful-bin.png" mode="aspectFill"></image>
          <text class="title-text">AI垃圾识别</text>
        </view>
        <text class="subtitle">智能分类 · 绿色环保 · 科技赋能</text>
      </view>
    </view>

    <!-- 主内容区域-->
    <view class="content-wrapper">
      <!-- 设备连接状态卡片-->
      <view v-if="hasConnection" class="device-card" @click="goToDeviceConnection">
        <view class="device-card-content">
          <view class="device-status">
            <view class="status-dot"></view>
            <view class="device-info">
              <text class="device-title">📡 智能设备在线</text>
              <text class="device-name">{{ connectedDevice?.device_name || '环保分类设备' }}</text>
            </view>
          </view>
          <view class="device-action">
            <text class="action-text">管理</text>
            <text class="action-arrow">›</text>
          </view>
        </view>
      </view>

      <!-- 上传区域 -->
      <view class="upload-card" @click="onAddImage" :class="{ 'processing': isProcessing }">
        <!-- 科技波纹效果层 -->
        <view class="tech-wave-2"></view>
        <view class="tech-wave-3"></view>
        <view class="glass-reflection"></view>
        <view class="upload-content">
          <view class="upload-icon-wrapper">
            <text v-if="!isProcessing" class="upload-icon">📷</text>
            <view v-else class="loading-spinner"></view>
          </view>
          <text class="upload-title" v-if="!isProcessing">点击拍照识别</text>
          <text class="upload-title processing" v-else>{{ processStatus }}</text>
          <text class="upload-desc" v-if="!isProcessing">支持 JPG、PNG 格式</text>
          <text class="upload-desc processing" v-else>正在分析中...</text>
        </view>
      </view>

      <!-- 识别结果区域 -->
      <view v-if="resultImage" class="result-card">
        <view class="result-header">
          <text class="result-title">🎯 识别结果</text>
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
            <view class="ai-helper-btn" v-if="aiEnabled" @click="goAiChatFromResult">AI对话</view>
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

      <!-- 默认欢迎区域 -->
      <view v-if="!resultImage" class="welcome-section">
        <view class="tips-card">
          <text class="tips-icon">🌱</text>
          <text class="tips-title">开始智能分类</text>
          <text class="tips-desc">上传图片，AI将为您识别垃圾类型</text>
        </view>

        <!-- 垃圾分类指南 -->
        <view class="guide-section">
          <text class="section-title">垃圾分类指南</text>
          <view class="guide-grid">
            <view class="guide-item recyclable" @click="showGuideDetail('recyclable')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">♻️</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">可回收</text>
                <text class="guide-examples">纸类、塑料、金属</text>
              </view>
            </view>
            
            <view class="guide-item harmful" @click="showGuideDetail('harmful')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">☢️</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">有害垃圾</text>
                <text class="guide-examples">电池、药品、灯管</text>
              </view>
            </view>
            
            <view class="guide-item kitchen" @click="showGuideDetail('kitchen')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">🍎</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">厨余垃圾</text>
                <text class="guide-examples">剩菜、果皮、茶叶</text>
              </view>
            </view>
            
            <view class="guide-item other" @click="showGuideDetail('other')">
              <view class="guide-icon-wrapper">
                <text class="guide-icon">🗑️</text>
              </view>
              <view class="guide-info">
                <text class="guide-name">其他垃圾</text>
                <text class="guide-examples">纸巾、烟蒂、陶瓷</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 快捷功能入口 -->
      <view class="quick-actions">
        <view class="action-item" @click="goShop">
          <view class="action-icon-wrapper shop">
            <text class="action-icon">🛍️</text>
          </view>
          <text class="action-name">积分商城</text>
          <text class="action-badge" v-if="points !== null">{{ points }}</text>
        </view>
        
        <view v-if="!isH5Platform" class="action-item" @click="scanDeviceQR">
          <view class="action-icon-wrapper device">
            <text class="action-icon">📱</text>
          </view>
          <text class="action-name">连接设备</text>
        </view>
        
        <view v-if="isH5Platform" class="action-item" @click="goMap">
          <view class="action-icon-wrapper map">
            <text class="action-icon">🗺️</text>
          </view>
          <text class="action-name">垃圾桶地图</text>
        </view>
        
        <view class="action-item" @click="goRanking">
          <view class="action-icon-wrapper ranking">
            <text class="action-icon">🏆</text>
          </view>
          <text class="action-name">环保排行</text>
        </view>
      </view>
    </view>

    <!-- 分类指南弹窗 -->
    <view v-if="showGuideModal && currentGuide.title" class="modal-overlay" @click="closeGuideModal">
      <view class="modal-content" @click.stop="">
        <view class="modal-header" :class="currentGuide.type">
          <text class="modal-icon">{{ currentGuide.icon }}</text>
          <text class="modal-title">{{ currentGuide.title }}</text>
          <text class="modal-close" @click="closeGuideModal">✕</text>
        </view>
        <view class="modal-body">
          <text class="modal-text">{{ currentGuide.content }}</text>
        </view>
        <view class="modal-footer">
          <button class="modal-btn" @click="closeGuideModal">我知道了</button>
        </view>
      </view>
    </view>

    <!-- 底部导航栏-->
    <view class="tabbar">
      <view class="tabbar-item active">
        <text class="tabbar-icon">🏠</text>
        <text class="tabbar-label">首页</text>
      </view>
      <view class="tabbar-item" @click="goMap">
        <text class="tabbar-icon">🗺️</text>
        <text class="tabbar-label">地图</text>
      </view>
      <view class="tabbar-item" @click="goShop">
        <text class="tabbar-icon">🛍️</text>
        <text class="tabbar-label">商城</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <text class="tabbar-icon">👤</text>
        <text class="tabbar-label">我的</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { recognizeImage } from '@/api/recognize'
import { useDeviceConnection } from '@/composables/useDeviceConnection'
import { resolveH5StandalonePath } from '@/utils/h5-route'
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
const aiEnabled = ref(false)
const isProcessing = ref(false)
const processStatus = ref('处理中...')
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

// 数字动画函数（兼容小程序：小程序无 requestAnimationFrame，用 setTimeout 模拟）
const animateNumber = (target, duration = 800) => {
  const start = 0
  const startTime = Date.now()
  // 帧间隔约 16ms（≈60fps），小程序和 H5 均兼容
  const frameInterval = 16

  const updateNumber = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // 使用 easeOutQuart 缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 4)
    const current = Math.round(start + (target - start) * easeProgress)

    resultConfidence.value = current + '%'

    if (progress < 1) {
      setTimeout(updateNumber, frameInterval)
    }
  }

  setTimeout(updateNumber, frameInterval)
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
  
  // 添加垃圾分类卡片鼠标追踪效果
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
    
    // 上传卡片鼠标追踪效果
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
    
    // 快捷操作选项卡鼠标追踪效果
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
  aiEnabled.value = false
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
    // 强制使用 contain 模式，对应模板中的 mode="aspectFit"
    // 避免部分浏览器或 uni-app H5 实现中 getComputedStyle(img).objectFit 返回默认值 'fill' 导致计算偏差
    objectFit: 'contain'
  }
  const compact = window.innerWidth <= 768

  // 计算其实际渲染尺寸
  // 当 object-fit 为 contain 时，图片渲染大小取决于容器大小和图片原始纵横比
  const ratio = Math.min(
    metrics.displayWidth / metrics.naturalWidth,
    metrics.displayHeight / metrics.naturalHeight
  )
  const finalRenderW = metrics.naturalWidth * ratio
  const finalRenderH = metrics.naturalHeight * ratio

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

    // 过滤掉几乎覆盖整个图片的框（宽或高任意一边超过图片渲染尺寸的 90%，则跳过）
    // 注意：这里的渲染尺寸是指图片实际在屏幕上占据的宽高（finalRenderW/H），而不是容器的宽高（displayWidth/displayHeight）
    if (mapped.width >= finalRenderW * 0.9 && mapped.height >= finalRenderH * 0.9) continue

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
  uni.navigateTo({ url: '/pages-nonTheme/ai-chat' })
}
function compressImage(filePath, quality = 0.8, maxWidth = 1024) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('当前环境不支持canvas压缩'))
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
              reject(new Error('图片压缩失败'))
            }
          },
          'image/jpeg',
          quality
        )
      } catch (drawError) {
        reject(new Error('图片绘制失败'))
      }
    }
    
    img.onerror = () => reject(new Error('图片加载失败'))
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
    processStatus.value = '图片处理中...'
    uni.showLoading({ title: '处理中...' })
    
    let compressedFile = filePath
    let compressedBlob = null
    
    try {
      if (isH5Platform.value) {
        processStatus.value = '正在压缩...'
        const { quality, maxWidth } = compressionConfig.h5
        compressedBlob = await compressImage(filePath, quality, maxWidth)
        const timestamp = Date.now()
        const randomId = Math.random().toString(36).substring(2, 8)
        compressedFile = new File([compressedBlob], `compressed_${timestamp}_${randomId}.jpg`, { type: 'image/jpeg' })
      } else {
        processStatus.value = '正在优化...'
        const { quality, maxSize } = compressionConfig.miniProgram
        compressedFile = await compressImageMiniProgram(filePath, quality, maxSize)
      }
    } catch (compressError) {
      console.warn('图片压缩失败，使用原图:', compressError)
      compressedFile = filePath
    }
    
    if (isH5Platform.value && compressedBlob) {
      resultImage.value = URL.createObjectURL(compressedBlob)
    } else {
      resultImage.value = compressedFile
    }
    
    processStatus.value = 'AI识别中...'
    uni.showLoading({ title: '识别中...' })
    const res = await recognizeImage(compressedFile)
    
    if (res.labels && res.labels.length > 0) {
      const label = res.labels[0]
      resultCategory.value = label.name || '未知类别'
      // 保存目标置信度并启动动画
      const confidenceValue = label.confidence ? Math.round(label.confidence * 100) : 0
      targetConfidence.value = confidenceValue
      resultConfidence.value = '0%' // 先设为 0
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
      resultDesc.value = label.describe
      // 延迟启动数字动画，让结果卡片先显示
      setTimeout(() => {
        animateNumber(confidenceValue, 800)
      }, 300)
    } else {
      resultCategory.value = '未识别到'
      resultConfidence.value = ''
      resultDesc.value = '未检测到任何标签信息'
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
    }

    applyEnhancedRecognitionData(res)

    // 根据后端返回的 aiSettings 决定是否显示 AI对话 按钮
    aiEnabled.value = !!(res.aiSettings && res.aiSettings.aiEnabled === true)

    if (isH5Platform.value && resultImage.value && resultImage.value.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(resultImage.value), 10000)
    }
    
    processStatus.value = '识别完成！'
    uni.showToast({ title: '识别完成！', icon: 'success' })
    
  } catch (err) {
    resetEnhancedRecognition()
    resultImage.value = ''
    resultCategory.value = ''
    resultConfidence.value = ''
    resultDesc.value = ''
    processStatus.value = '处理失败'
    
    if (err && err.msg) {
      uni.showToast({ title: err.msg || '识别失败', icon: 'none' })
      if (err.msg == '未登录') {
        uni.redirectTo({ url: '/pages/index/index' })
      }
    } else {
      uni.showToast({ title: '网络错误', icon: 'none' })
    }
  } finally {
    uni.hideLoading()
    isProcessing.value = false
    processStatus.value = '处理中...'
  }
}

function onAddImage() {
  if (isProcessing.value) {
    uni.showToast({ title: '正在处理中...', icon: 'none' })
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
    fail: () => uni.showToast({ title: '选择取消', icon: 'none' })
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
      title: '连接设备',
      content: '请输入设备ID（H5端暂不支持扫码）',
      editable: true,
      placeholderText: '请输入设备ID',
      success: (res) => {
        if (res.confirm && res.content) connectDevice(res.content)
      }
    })
  } else {
    uni.scanCode({
      scanType: ['qrCode'],
      success: (res) => connectDevice(res.result),
      fail: () => uni.showToast({ title: '扫码失败', icon: 'none' })
    })
  }
}

function connectDevice(deviceId) {
  if (!deviceId || deviceId.trim() === '') {
    uni.showToast({ title: '设备ID不能为空', icon: 'none' })
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
      icon: '♻️',
      title: '可回收垃圾',
      content: '包括废纸、塑料、玻璃、金属和布料五大类。这些垃圾可以通过综合处理回收利用，减少污染，节省资源。正确分类投放可以大大提高回收效率，为环保事业贡献力量。'
    },
    harmful: {
      type: 'harmful',
      icon: '☢️',
      title: '有害垃圾',
      content: '包括废电池、废灯管、废药品、废油漆及其容器等。这些垃圾含有有毒有害物质，需要特殊处理，避免对环境和人体造成危害。请务必投放到专门的有害垃圾收集点。'
    },
    kitchen: {
      type: 'kitchen',
      icon: '🍎',
      title: '厨余垃圾',
      content: '包括剩菜剩饭、骨头、菜根菜叶、果皮等食品类废物。这些有机垃圾可以通过生物技术就地处理堆肥，转化为有机肥料，实现资源循环利用。'
    },
    other: {
      type: 'other',
      icon: '🗑️',
      title: '其他垃圾',
      content: '包括除上述几类垃圾之外的砖瓦陶瓷、渣土、卫生间废纸、纸巾等难以回收的废弃物。这些垃圾通常采用卫生填埋等方式进行无害化处理。'
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
/* 页面基础 */
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  padding-bottom: 140rpx;
  position: relative;
  overflow-x: hidden;
}

/* 背景装饰 */
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

/* 背景光影流动效果 */
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

/* 球形浮动动画 */
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

/* 顶部绿色背景 */
.header-bg {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  padding: 60rpx 32rpx 120rpx;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

/* 头部装饰 */
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

/* 头部圆形呼吸动画 */
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

/* 内容区域 */
.content-wrapper {
  padding: 0 32rpx;
  margin-top: -60rpx;
  position: relative;
  z-index: 2;
}

/* 设备连接卡片 */
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

/* 上传卡片 */
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

/* 玻璃反光层*/
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

/* 科技流动波纹效果 - 多层叠加 */
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

/* 第二层波纹- 错位动画 */
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

/* 第三层波纹 - 细线效果 */
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

/* 光感追随鼠标效果 */
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

/* 金属光泽效果 */
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

/* 底部金属反光 */
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

/* 识别结果卡片 */
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

/* 徽章光效 */
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
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.result-image {
  width: 100%;
  height: 400rpx;
  border-radius: 16rpx;
  display: block;
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

/* 欢迎区域 */
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

/* 指南区域 */
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

/* 纸质纹理效果 */
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

/* 纸质纤维纹理 */
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

/* 光感追随鼠标效果 */
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

/* 鼠标悬停时图标容器效果 */
.guide-item:hover .guide-icon-wrapper {
  transform: scale(1.1);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
}

.guide-icon {
  font-size: 32rpx;
  animation: iconWiggle 3s ease-in-out infinite;
  transition: all 0.3s ease;
}

/* 鼠标悬停时图标动画 */
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

/* 鼠标悬停时的弹跳动画 */
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

/* 快捷功能 */
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

/* 塑料/金属光泽效果 */
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

/* 光感追随鼠标效果 */
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

/* 3D立体光泽效果 */
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

/* 底部阴影增强立体感 */
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

/* 弹窗 */
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

/* 弹窗图标轻轻晃动 */
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

/* 按钮悬停效果 */
.modal-btn:hover {
  transform: translateY(-2rpx);
  box-shadow: 0 8rpx 24rpx rgba(16, 185, 129, 0.4);
}

.modal-btn:active {
  transform: translateY(0);
}

/* 底部导航 */
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