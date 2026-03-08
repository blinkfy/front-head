<template>
  <view class="home-bg">
    <!-- 自定义状态栏 -->
    <view class="custom-statusbar"></view>
    
    <!-- 科技背景动效元素 -->
    <view class="tech-bg">
      <view class="tech-grid"></view>
      <view class="floating-particles">
        <view class="particle" v-for="n in 6" :key="n" :style="getParticleStyle(n)"></view>
      </view>
    </view>
    
    <!-- 主要内容区域 -->
    <view class="home-container">
      <!-- 顶部标题区域 -->
      <view class="header-section">
        <view class="main-title">
          <image class="title-icon" src="/static/colorful-bin.png" mode="aspectFill"></image>
          <text class="title-text">AI垃圾识别</text>
        </view>
        <view class="subtitle">智能分类 · 绿色环保 · 科技赋能</view>
      </view>
      
      <!-- 设备连接状态横幅-->
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
                <text class="connection-icon">📡</text>
                <text class="connection-title">智能设备在线</text>
              </view>
              <text class="connection-desc">{{ connectedDevice?.device_name || '环保分类设备' }}</text>
            </view>
          </view>
          <view class="connection-action">
            <view class="action-icon">⚡</view>
            <text class="action-text">管理</text>
          </view>
        </view>
        <view class="connection-scan-line"></view>
      </view>
      
      <!-- 上传区域 -->
      <view class="upload-section">
        
        <view class="upload-container" @click="onAddImage" :class="{ 'processing': isProcessing }">
          <view class="upload-border">
            <view class="upload-inner">
              <view class="upload-icon">
                <text v-if="!isProcessing">📷</text>
                <view v-else class="loading-spinner">
                  <view class="spinner"></view>
                </view>
              </view>
              <text class="upload-text" v-if="!isProcessing">点击上传图片</text>
              <text class="upload-text processing" v-else>{{ processStatus }}</text>
              <text class="upload-hint" v-if="!isProcessing">支持JPG、PNG格式，自动压缩优化</text>
              <text class="upload-hint processing" v-else>请稍候，正在处理您的图片...</text>
            </view>
          </view>
          <view class="scan-line" v-if="isProcessing"></view>
        </view>
      </view>
      
      <!-- 识别结果区域 -->
      <view v-if="resultImage" class="result-section">
        <view class="result-card">
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
          
          <view class="result-details">
            <view class="category-row">
              <view :class="['category-display', getCategoryClass(resultCategory)]">
                <view class="category-icon">{{ getCategoryIcon(resultCategory) }}</view>
              <view class="category-info">
                <text class="category-label">分类结果</text>
                <text class="category-name">{{ resultCategory }}</text>
              </view>
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

            <view v-else-if="resultDesc" class="description-panel">
              <text class="desc-label">💡 处理建议</text>
              <text class="desc-content">{{ resultDesc }}</text>
            </view>
          </view>
        </view>
      </view>
      
      <!-- 默认提示区域 -->
      <view v-if="!resultImage" class="welcome-section">
        <view class="welcome-card">
          <text class="welcome-icon">🌱</text>
          <text class="welcome-title">开始智能分类</text>
          <text class="welcome-desc">上传图片，AI将为您识别垃圾类型<br/>共同践行绿色环保理念</text>
        </view>
        
        <!-- 垃圾分类指南卡片 -->
        <view class="guide-cards">
          <view class="guide-card recyclable" @click="showGuideDetail('recyclable')">
            <view class="guide-icon">♻️</view>
            <view class="guide-content">
              <text class="guide-title">可回收垃圾</text>
              <text class="guide-desc">塑料、纸类、金属等</text>
            </view>
            <view class="guide-arrow">→</view>
          </view>
          
          <view class="guide-card harmful" @click="showGuideDetail('harmful')">
            <view class="guide-icon">☢️</view>
            <view class="guide-content">
              <text class="guide-title">有害垃圾</text>
              <text class="guide-desc">电池、药品、化学品</text>
            </view>
            <view class="guide-arrow">→</view>
          </view>
          
          <view class="guide-card kitchen" @click="showGuideDetail('kitchen')">
            <view class="guide-icon">🍎</view>
            <view class="guide-content">
              <text class="guide-title">厨余垃圾</text>
              <text class="guide-desc">剩菜剩饭、果皮等</text>
            </view>
            <view class="guide-arrow">→</view>
          </view>
          
          <view class="guide-card other" @click="showGuideDetail('other')">
            <view class="guide-icon">🗑️</view>
            <view class="guide-content">
              <text class="guide-title">其他垃圾</text>
              <text class="guide-desc">难以回收的废弃物</text>
            </view>
            <view class="guide-arrow">→</view>
          </view>
        </view>
      </view>
        
        <!-- 功能快捷入口 -->
      <view class="welcome-section">
        <view class="quick-actions">
          <view class="action-item" @click="goShop">
            <view class="action-icon shop">🛍️</view>
            <text class="action-text">积分商城</text>
            <text class="points-badge" v-if="points !== null">{{ points }}</text>
          </view>
          <view v-if="!isH5Platform" class="action-item" @click="scanDeviceQR">
            <view class="action-icon">📱</view>
            <text class="action-text">连接设备</text>
          </view>
          <view v-if="isH5Platform" class="action-item" @click="goMap">
            <view class="action-icon">🗺️</view>
            <text class="action-text">垃圾桶地图</text>
          </view>
          <view class="action-item" @click="goRanking">
            <view class="action-icon">🏆</view>
            <text class="action-text">环保排行榜</text>
          </view>
        </view>
      </view>
    </view>
    
    <!-- 自定义分类指南弹窗-->
    <view v-if="showGuideModal && currentGuide.title" class="guide-modal-overlay" @click="closeGuideModal">
      <view class="guide-modal" @click.stop="">
        <view class="modal-header">
          <view class="modal-icon">{{ currentGuide.icon || '❓' }}</view>
          <text class="modal-title">{{ currentGuide.title || '未知分类' }}</text>
          <view class="modal-close" @click="closeGuideModal">✕</view>
        </view>
        <view class="modal-content">
          <text class="modal-text">{{ currentGuide.content || '暂无相关信息' }}</text>
        </view>
        <view class="modal-footer">
          <view class="modal-btn" @click="closeGuideModal">
            <text class="btn-text">我知道了</text>
          </view>
        </view>
        <view class="modal-glow"></view>
      </view>
    </view>
    
    <!-- 科技感底部导航栏 -->
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
const recognizedItems = ref([])
const upcyclingSections = ref([])
const rawBboxes = ref([])
const displayBboxes = ref([])
const recognizeBBoxSpace = ref('')
let bboxRefreshTimer = 0
const bboxLoadBoundImages = new WeakSet()

// 检测是否为 H5 平台
const isH5Platform = ref(false)

// 使用设备连接状态管理
const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

// 图片压缩配置
const compressionConfig = {
  h5: {
    quality: 0.99,        // H5压缩质量 (0-1)
    maxWidth: 800,      // 最大宽度
    maxHeight: 800      // 最大高度
  },
  miniProgram: {
    quality: 100,         // 小程序压缩质量(0-100)
    maxSize: 800,        // 最长边尺寸 (px)
  }
}

// 检测平台类型
onMounted(() => {
  // 更精确的平台检测
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
  
  // 更精确的 H5 平台检测
  isH5Platform.value = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  console.log('Platform detected:', { platform, uniPlatform, isH5Platform: isH5Platform.value })
  
  // 获取系统状态栏高度
  let statusBarHeight = 0
  try {
    const windowInfo = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBarHeight = windowInfo.statusBarHeight || 0
  } catch (e) {
    const systemInfo = uni.getSystemInfoSync()
    statusBarHeight = systemInfo.statusBarHeight || 0
  }
  
  // 只在H5环境中设置CSS变量
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

// 生成粒子动画样式
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
// 图片压缩函数
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

    // 过滤掉几乎覆盖整个图片的框（宽或高超过实际渲染尺寸的 90%）
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
    // 检查是否支持 canvas
    if (typeof document === 'undefined') {
      reject(new Error('当前环境不支持canvas压缩'))
      return
    }
    
    // 创建canvas进行压缩
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = function() {
      try {
        // 计算压缩后的尺寸
        let { width, height } = img
        
        // 记录原始尺寸
        const originalWidth = width
        const originalHeight = height
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        
        // 设置canvas尺寸
        canvas.width = width
        canvas.height = height
        
        // 设置高质量缩放
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        
        // 绘制并压缩
        ctx.drawImage(img, 0, 0, width, height)
        
        // 转换为blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log('图片压缩完成:', {
                originalSize: `${originalWidth}x${originalHeight}`,
                compressedSize: `${width}x${height}`,
                compressedFileSize: (blob.size / 1024 / 1024).toFixed(2) + 'MB',
                quality: Math.round(quality * 100) + '%'
              })
              resolve(blob)
            } else {
              reject(new Error('图片压缩失败：无法生成Blob'))
            }
          },
          'image/jpeg',
          quality
        )
      } catch (drawError) {
        reject(new Error('图片绘制失败: ' + drawError.message))
      }
    }
    
    img.onerror = (error) => {
      reject(new Error('图片加载失败: ' + error))
    }
    
    // 设置跨域属性
    img.crossOrigin = 'anonymous'
    img.src = filePath
  })
}

// 小程序环境图片压缩（保持长宽比，按最长边缩放）
function compressImageMiniProgram(filePath, quality = 80, maxSize = 800) {
  return new Promise((resolve, reject) => {
    // 先获取图片信息
    uni.getImageInfo({
      src: filePath,
      success: (info) => {
        const { width: originalWidth, height: originalHeight } = info
        
        // 计算缩放后的尺寸（保持长宽比）
        let targetWidth = originalWidth
        let targetHeight = originalHeight
        
        // 找出最长边
        const maxOriginalSize = Math.max(originalWidth, originalHeight)
        
        // 如果最长边超过限制，进行等比缩放
        if (maxOriginalSize > maxSize) {
          const scale = maxSize / maxOriginalSize
          targetWidth = Math.round(originalWidth * scale)
          targetHeight = Math.round(originalHeight * scale)
        }
        
        console.log('小程序图片尺寸计算', {
          originalSize: `${originalWidth}x${originalHeight}`,
          maxSideLimit: maxSize + 'px',
          targetSize: `${targetWidth}x${targetHeight}`,
          scaleRatio: (maxOriginalSize > maxSize ? (maxSize / maxOriginalSize).toFixed(3) : '1.000')
        })
        
        // 执行压缩
        uni.compressImage({
          src: filePath,
          quality: quality,
          compressedWidth: targetWidth,   // 使用计算后的宽度
          compressedHeight: targetHeight, // 使用计算后的高度
          success: (res) => {
            console.log('小程序图片压缩完成', {
              originalPath: filePath,
              compressedPath: res.tempFilePath,
              quality: quality + '%',
              finalSize: `${targetWidth}x${targetHeight}`
            })
            resolve(res.tempFilePath)
          },
          fail: (err) => {
            console.warn('小程序图片压缩失败，使用原图:', err)
            resolve(filePath) // 压缩失败时使用原图
          }
        })
      },
      fail: (err) => {
        console.warn('获取图片信息失败，直接使用质量压缩', err)
        // 如果获取图片信息失败，只进行质量压缩
        uni.compressImage({
          src: filePath,
          quality: quality,
          success: (res) => {
            console.log('小程序图片质量压缩完成', {
              originalPath: filePath,
              compressedPath: res.tempFilePath,
              quality: quality + '%'
            })
            resolve(res.tempFilePath)
          },
          fail: (compressErr) => {
            console.warn('小程序图片压缩失败，使用原图:', compressErr)
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
    processStatus.value = '图片处理中...'
    uni.showLoading({ title: '图片处理中...' })
    
    // 第一步：图片压缩
    let compressedFile = filePath
    let compressedBlob = null
    try {
      if (isH5Platform.value) {
        // H5环境使用canvas压缩
        processStatus.value = '正在压缩图片...'
        console.log('H5环境：开始图片压缩...')
        const { quality, maxWidth } = compressionConfig.h5
        compressedBlob = await compressImage(filePath, quality, maxWidth)
        
        // 创建File对象用于API上传，使用时间戳+随机数生成唯一文件名
        const timestamp = Date.now()
        const randomId = Math.random().toString(36).substring(2, 8)
        const uniqueFileName = `compressed_${timestamp}_${randomId}.jpg`
        
        compressedFile = new File([compressedBlob], uniqueFileName, {
          type: 'image/jpeg'
        })
        
        console.log('H5图片压缩完成，文件大小:', (compressedFile.size / 1024 / 1024).toFixed(2) + 'MB')
      } else {
        // 小程序环境使用uni.compressImage
        processStatus.value = '正在优化图片...'
        console.log('小程序环境：开始图片压缩...')
        const { quality, maxSize } = compressionConfig.miniProgram
        compressedFile = await compressImageMiniProgram(filePath, quality, maxSize)
      }
      
      console.log('图片压缩成功')
    } catch (compressError) {
      console.warn('图片压缩失败，使用原图', compressError)
      compressedFile = filePath
    }
    
    // 第二步：显示压缩后的图片预览
    if (isH5Platform.value && compressedBlob) {
      // H5环境显示压缩后的预览
      resultImage.value = URL.createObjectURL(compressedBlob)
    } else {
      // 小程序环境显示压缩后的路径
      resultImage.value = compressedFile
    }
    
    // 第三步：调用识别API
    processStatus.value = 'AI智能识别中...'
    uni.showLoading({ title: 'AI识别中...' })
    const res = await recognizeImage(compressedFile)
    // console.log('后端返回数据:', res) // 调试日志

    // 第四步：处理识别结果
    processStatus.value = '处理识别结果...'
    
    // 确保后端返回的数据结构正确
    if (res.labels && res.labels.length > 0) {
      const label = res.labels[0]
      resultCategory.value = label.name || '未知类别'
      resultConfidence.value = label.confidence ? (label.confidence * 100).toFixed(2) + '%' : '未知置信度'
      // 检查并避免重复添加前缀
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
      resultDesc.value = label.describe
    } else {
      resultCategory.value = '未识别到'
      resultConfidence.value = 'NA'
      resultDesc.value = '未检测到任何标签信息'
      resultImage.value = res.result_img_base64.startsWith('data:image/jpeg;base64,')
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
    }
    
    // 清理H5环境下的临时URL（延迟清理，避免影响显示）
    applyEnhancedRecognitionData(res)

    // 根据后端返回的 aiSettings 决定是否显示 AI对话 按钮
    aiEnabled.value = !!(res.aiSettings && res.aiSettings.aiEnabled === true)

    if (isH5Platform.value && resultImage.value && resultImage.value.startsWith('blob:')) {
      setTimeout(() => {
        URL.revokeObjectURL(resultImage.value)
      }, 10000) // 10秒后清理预览URL
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
    processStatus.value = '处理失败'
    
    if (err && err.msg){
      uni.showToast({
        title: err.msg || '识别失败',
        icon: 'none'
      })
      if (err.msg == '未登录') {
        uni.redirectTo({ url: '/pages-dark/index/index' })
      }
    }else{ 
      uni.showToast({
        title: '网络错误',
        icon: 'none'
      })
    }
    console.error('图片处理失败:', err)
  } finally {
    uni.hideLoading()
    isProcessing.value = false
    processStatus.value = '处理中...' // 重置状态
  }
}

function onAddImage() {
  if (isProcessing.value) {
    uni.showToast({
      title: '正在处理中，请稍候...',
      icon: 'none'
    })
    return
  }
  
  console.log('onAddImage 开始选择图片')
  
  // 配置图片选择参数
  const chooseConfig = {
    count: 1,
    sizeType: ['compressed'], // 优先选择压缩图
    sourceType: ['album', 'camera'], // 支持相册和拍照
    success: chooseRes => {
      const filePath = chooseRes.tempFilePaths[0]
      console.log('图片选择成功:', {
        path: filePath,
        size: chooseRes.tempFiles?.[0]?.size ? (chooseRes.tempFiles[0].size / 1024 / 1024).toFixed(2) + 'MB' : 'unknown'
      })
      
      isProcessing.value = true
      processImage(filePath).catch(err => {
        console.error('图片处理失败:', err)
        isProcessing.value = false
      })
    },
    fail: err => {
      console.log('图片选择失败:', err)
      uni.showToast({
        title: '图片选择取消',
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
  // 检查当前平台，使用与 onMounted 相同的逻辑
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
  
  // 更精确的 H5 平台检测
  isH5 = (
    uniPlatform === 'web' || 
    (platform === 'devtools' && typeof window !== 'undefined' && window.location) ||
    (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wx && !window.my)
  )
  
  console.log('scanDeviceQR - Platform:', { platform, uniPlatform, isH5 })
  
  if (isH5) {
    // H5端使用输入框替代扫码
    uni.showModal({
      title: '连接设备',
      content: '请输入设备ID（H5端暂不支持扫码）',
      editable: true,
      placeholderText: '请输入设备ID',
      success: function(res) {
        if (res.confirm && res.content) {
          connectDevice(res.content)
        }
      }
    })
  } else {
    // 小程序端使用扫码功能
    uni.scanCode({
      scanType: ['qrCode'],
      success: function(res) {
        connectDevice(res.result)
      },
      fail: function(err) {
        console.log('扫码失败:', err)
        uni.showToast({
          title: '扫码失败，请重试',
          icon: 'none'
        })
      }
    })
  }
}

function connectDevice(deviceId) {
  if (!deviceId || deviceId.trim() === '') {
    uni.showToast({
      title: '设备ID不能为空',
      icon: 'none'
    })
    return
  }
  //截取deviceId中#后面的内容
  const targetId = deviceId.split('#')[1]
  console.log('Connecting to device with ID:', targetId)
  uni.navigateTo({ url: targetId })
  return
  // 显示连接中的提示
  uni.showLoading({
    title: '连接设备中...'
  })
  
  // 模拟连接设备的过程
  setTimeout(() => {
    uni.hideLoading()
    
    // 保存设备连接信息到本地存储
    const deviceInfo = {
      device_id: deviceId.trim(),
      device_name: '智能垃圾分类设备',
      connected_time: Date.now()
    }
    
    uni.setStorageSync('connectedDevice', deviceInfo)
    uni.setStorageSync('connection', Date.now())
    
    // 显示连接成功提示
    uni.showToast({
      title: '设备连接成功',
      icon: 'success'
    })
    
    // 刷新页面以显示连接状态
    setTimeout(() => {
      uni.redirectTo({ url: '/pages-dark/home/home' })
    }, 1500)
    
  }, 2000)
}

function showGuideDetail(type) {
  if (!type) return

  const guides = {
    recyclable: {
      icon: '♻️',
      title: '可回收垃圾',
      content: '包括废纸、塑料、玻璃、金属和布料等。可回收物经过分类处理后可再利用，能减少污染并节约资源。'
    },
    harmful: {
      icon: '☢️',
      title: '有害垃圾',
      content: '包括废电池、废灯管、废药品、废油漆及其容器等，需投放到有害垃圾回收点进行专门处理。'
    },
    kitchen: {
      icon: '🍎',
      title: '厨余垃圾',
      content: '包括剩菜剩饭、果皮果核、骨头、菜叶等厨余废弃物，可通过堆肥等方式资源化处理。'
    },
    other: {
      icon: '🗑️',
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
  // 延时清理，避免动画过程中数据闪烁
  setTimeout(() => {
    currentGuide.value = {}
  }, 300)
}
</script>

<style scoped>
/* 主背景*/
.home-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 25%, #2d1b69 50%, #0f0f23 100%);
  position: relative;
  overflow: hidden;
}

/* 自定义状态栏 */
.custom-statusbar {
  height: var(--status-bar-height);
  background: transparent;
  position: relative;
  z-index: 10;
}

/* 科技背景元素 */
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

/* 浮动粒子 */
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

/* 主容器*/
.home-container {
  position: relative;
  z-index: 2;
  padding: 40rpx 32rpx 140rpx 32rpx; /* 恢复原来的 padding，因为已有自定义状态栏 */
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--status-bar-height));
}

/* 标题区域 */
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

/* 上传区域 */
.upload-section {
  margin-bottom: 60rpx;
}

/* 设备连接横幅 */
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

/* 扫描线动画*/
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

/* 结果区域 */
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

/* 欢迎区域 */
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

/* 垃圾分类指南卡片 */
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

/* 功能快捷入口 */
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

/* 积分商城入口特殊样式 */
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

/* 自定义分类指南弹窗*/
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

/* 底部导航栏*/
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