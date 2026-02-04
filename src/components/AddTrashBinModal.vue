<template>
  <view v-if="visible" class="modal-overlay" @click="handleOverlayClick">
    <!-- 自定义Toast提示 -->
    <view v-if="customToast.show" class="custom-toast" :class="customToast.type">
      <text class="toast-icon">{{ customToast.icon }}</text>
      <text class="toast-text">{{ customToast.message }}</text>
    </view>
    
    <view class="modal-content" @click.stop>
      <view class="modal-header">
        <text class="modal-title">新增垃圾桶</text>
        <text class="modal-close" @click="closeModal">✕</text>
      </view>
      
      <view class="modal-body">
        <view class="form-group">
          <text class="form-label">垃圾桶名称 *</text>
          <input 
            class="form-input" 
            v-model="formData.name" 
            placeholder="请输入垃圾桶名称"
            maxlength="50"
          />
        </view>
        
        <view class="form-group">
          <text class="form-label">描述信息 *</text>
          <textarea 
            class="form-textarea" 
            v-model="formData.description" 
            placeholder="请输入描述信息（如位置特征、容量等）"
            maxlength="200"
          />
        </view>
        
        <view class="form-group">
          <text class="form-label">位置信息 *</text>
          <view class="location-info">
            <text class="location-text" v-if="formData.latitude && formData.longitude">
              经纬度: {{ formData.latitude.toFixed(6) }}, {{ formData.longitude.toFixed(6) }}
            </text>
            <text class="location-text" v-if="formData.address">
              地址: {{ formData.address }}
            </text>
            <text class="location-text location-tip" v-if="!formData.address && formData.latitude && formData.longitude">
              地址解析中...
            </text>
            <button class="location-btn" @click="getCurrentLocation" :disabled="isGettingLocation">
              {{ isGettingLocation ? '获取中...' : '重新获取位置' }}
            </button>
          </view>
        </view>
        
        <view class="form-group">
          <text class="form-label">垃圾桶照片 *</text>
          <view class="image-upload">
            <view 
              v-if="!formData.imageUrl" 
              class="image-placeholder" 
              @click="chooseImage">
              <text class="upload-icon">📷</text>
              <text class="upload-text">点击上传照片</text>
            </view>
            <view v-else class="image-preview">
              <image 
                :src="formData.imageUrl" 
                :key="formData.imageUrl"
                class="preview-image" 
                mode="aspectFill"
                @error="onImageError"
                @load="onImageLoad"
              />
              <text class="image-remove" @click="removeImage">✕</text>
              <text class="image-debug-url">URL: {{ formData.imageUrl }}</text>
              <text v-if="imageErrorMsg" class="image-error">错误: {{ imageErrorMsg }}</text>
            </view>
          </view>
        </view>
      </view>
      
      <view class="modal-footer">
        <button class="btn btn-cancel" @click="closeModal">取消</button>
        <button 
          class="btn btn-primary" 
          @click="handleSubmit"
        >
          {{ isSubmitting ? '提交中...' : '确认新增' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { addTrashBin, uploadTrashBinImage, reverseGeocoder } from '../api/map.js'
import { getUserLocationOnce } from '../utils/location'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  userLocation: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close', 'success'])

// 表单数据
const formData = ref({
  name: '',
  description: '',
  latitude: null,
  longitude: null,
  address: '',
  imageUrl: '',
  imageFile: null
})

// 状态管理
const isGettingLocation = ref(false)
const isSubmitting = ref(false)
const imageErrorMsg = ref('')

// 自定义Toast
const customToast = ref({
  show: false,
  message: '',
  type: 'info',
  icon: 'ℹ️'
})

// 显示自定义Toast
function showCustomToast(message, type = 'info', duration = 2000) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  }
  
  customToast.value = {
    show: true,
    message,
    type,
    icon: icons[type] || icons.info
  }
  
  setTimeout(() => {
    customToast.value.show = false
  }, duration)
}

// 计算属性：是否可以提交
const canSubmit = computed(() => {
  return formData.value.name.trim() && 
         formData.value.latitude && 
         formData.value.longitude
})

// 监听弹窗显示状态，自动获取位置
watch(() => props.visible, (newVal) => {
  if (newVal) {
    resetForm()
    if (props.userLocation?.latitude && props.userLocation?.longitude) {
      formData.value.latitude = props.userLocation.latitude
      formData.value.longitude = props.userLocation.longitude
      // 延迟获取地址，避免阻塞弹窗显示
      setTimeout(() => {
        getAddressFromCoords(props.userLocation.latitude, props.userLocation.longitude)
      }, 300)
    } else {
      getCurrentLocation()
    }
  }
})

// 重置表单
function resetForm() {
  formData.value = {
    name: '',
    description: '',
    latitude: null,
    longitude: null,
    address: '',
    imageUrl: '',
    imageFile: null
  }
}

// 获取当前位置
async function getCurrentLocation() {
  if (isGettingLocation.value) return
  
  isGettingLocation.value = true
  try {
  const location = await getUserLocationOnce()  // 不指定坐标系，让 location.js 自动处理
    formData.value.latitude = location.latitude
    formData.value.longitude = location.longitude
    
    showCustomToast('位置获取成功', 'success', 1500)
    
    // 延迟进行地址解析，避免阻塞用户操作
    setTimeout(async () => {
      try {
        await getAddressFromCoords(location.latitude, location.longitude)
      } catch (error) {
        // 地址解析失败不影响主要功能
        console.warn('地址解析失败，但位置获取成功')
      }
    }, 500)
    
  } catch (error) {
    console.error('获取位置失败:', error)
    showCustomToast('位置获取失败，请检查定位权限', 'error', 2000)
  } finally {
    isGettingLocation.value = false
  }
}

// 使用共用定位工具 getUserLocationOnce

// 根据经纬度获取地址描述
async function getAddressFromCoords(lat, lng) {
  // 在H5环境中，直接跳过腾讯地图API调用，使用本地解析避免跨域问题
  const isH5 = typeof window !== 'undefined' && !window.wx && !window.my && !window.swan
  
  if (!isH5) {
    // 非H5环境才尝试调用腾讯地图API
    try {
      const result = await reverseGeocoder(lat, lng)
      if (result && result.result && result.result.address) {
        formData.value.address = result.result.address
        return
      }
    } catch (error) {
      console.warn('腾讯地图地址解析失败，使用本地解析:', error)
    }
  }
  
  // H5环境或API失败时的本地解析方案
  try {
    const addressParts = []
    
    // 根据经纬度范围推断大致区域（这里以中国为例）
    if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) {
      if (lat >= 39.4 && lat <= 41.6 && lng >= 115.7 && lng <= 117.4) {
        addressParts.push('北京市')
      } else if (lat >= 30.40 && lat <= 32.00 && lng >= 120.85 && lng <= 122.30) {
        addressParts.push('上海市')
      } else if (lat >= 22.4 && lat <= 23.9 && lng >= 113.1 && lng <= 114.8) {
        addressParts.push('广州市')
      } else if (lat >= 35.5 && lat <= 37.1 && lng >= 119.8 && lng <= 121.1) {
        addressParts.push('青岛市')
      } else if (lat >= 44.0 && lat <= 46.0 && lng >= 125.0 && lng <= 128.0) {
        addressParts.push('哈尔滨市')
      } else {
        addressParts.push('中国')
      }
    } else {
      addressParts.push('位置')
    }
    
    addressParts.push(`坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    formData.value.address = addressParts.join(' ')
  } catch (error) {
    console.warn('本地地址解析也失败:', error)
    formData.value.address = `坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
}

// 选择图片
function chooseImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: res => {
      if (res.tempFilePaths && res.tempFilePaths.length > 0) {
        formData.value.imageUrl = res.tempFilePaths[0]
        formData.value.imageFile = res.tempFilePaths[0]
      }
    },
    fail: (err) => {
      console.error('选择图片失败:', err)
      showCustomToast('选择图片失败', 'error')
    }
  })
}

// 图片加载错误处理
function onImageError(e) {
  try {
    console.error('图片加载错误事件:', e)
  } catch (err) { /* ignore */ }
  imageErrorMsg.value = '图片加载失败，可能是本地临时路径在 H5 不可访问或 URL 格式不受支持'
}

function onImageLoad() {
  imageErrorMsg.value = ''
}

// 移除图片
function removeImage() {
  formData.value.imageUrl = ''
  formData.value.imageFile = null
}

// 提交表单
async function handleSubmit() {
  if (isSubmitting.value) return
  // 表单验证
  if (!formData.value.name.trim()) {
    showCustomToast('请输入垃圾桶名称', 'warning')
    return
  }else if (!formData.value.latitude || !formData.value.longitude) {
    showCustomToast('请获取位置信息', 'warning')
    return
  }else if (!formData.value.imageFile) {
    showCustomToast('请上传垃圾桶照片', 'warning')
    return
  }

  isSubmitting.value = true
  
  try {
    let imageUrl = ''
    // 如果有图片，先上传图片
    if (formData.value.imageFile) {
      try {
        const uploadResult = await uploadTrashBinImage(formData.value.imageFile)
        imageUrl = uploadResult.url || uploadResult.path || ''
      } catch (uploadError) {
        console.warn('图片上传失败，继续提交:', uploadError)
        // 图片上传失败不阻止整体提交
      }
    }
    
    // 提交数据 - 使用新的API数据结构
    const submitData = {
      name: formData.value.name.trim(),
      description: formData.value.description.trim(),
      latitude: formData.value.latitude,
      longitude: formData.value.longitude,
      image: imageUrl
    }
    
    await addTrashBin(submitData)
    
    showCustomToast('新增成功', 'success', 1500)
    
    // 延迟关闭，让用户看到成功提示
    setTimeout(() => {
      emit('success', submitData)
      closeModal()
    }, 1500)
    
  } catch (error) {
    console.error('提交失败:', error)
    const message = error.message || error.msg || '提交失败，请重试'
    showCustomToast(message, 'error', 2000)
  } finally {
    isSubmitting.value = false
  }
}

// 关闭弹窗
function closeModal() {
  emit('close')
}

// 点击遮罩层关闭
function handleOverlayClick(e) {
  // 只有点击遮罩层本身才关闭
  if (e.target === e.currentTarget) {
    closeModal()
  }
}
</script>

<style scoped>
/* 模态框遮罩 - 现代化设计 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(10, 26, 47, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: overlayFadeIn 0.3s ease-out;
}

/* 自定义Toast样式 */
.custom-toast {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  min-width: 240rpx;
  max-width: 80vw;
  padding: 24rpx 32rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  backdrop-filter: blur(20px) saturate(1.2);
  z-index: 10001;
  animation: toastSlideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 
    0 12rpx 32rpx rgba(0, 0, 0, 0.15),
    0 4rpx 16rpx rgba(0, 0, 0, 0.1),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.3);
}

.custom-toast.success {
  background: rgba(72, 187, 120, 0.95);
  color: white;
  border: 1rpx solid rgba(255, 255, 255, 0.2);
}

.custom-toast.error {
  background: rgba(245, 101, 101, 0.95);
  color: white;
  border: 1rpx solid rgba(255, 255, 255, 0.2);
}

.custom-toast.warning {
  background: rgba(237, 137, 54, 0.95);
  color: white;
  border: 1rpx solid rgba(255, 255, 255, 0.2);
}

.custom-toast.info {
  background: rgba(66, 153, 225, 0.95);
  color: white;
  border: 1rpx solid rgba(255, 255, 255, 0.2);
}

.toast-icon {
  font-size: 32rpx;
  line-height: 1;
}

.toast-text {
  font-size: 28rpx;
  font-weight: 500;
  letter-spacing: 0.3rpx;
}

@keyframes toastSlideIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20rpx) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 模态框主体 - 玻璃拟态设计 */
.modal-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px) saturate(1.2);
  border-radius: 24rpx;
  width: 85vw;
  max-width: 640rpx;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 
    0 24rpx 80rpx rgba(0, 0, 0, 0.15),
    0 8rpx 32rpx rgba(0, 0, 0, 0.1),
    inset 0 2rpx 0 rgba(255, 255, 255, 0.3),
    inset 0 0 0 1rpx rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  animation: modalSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(60px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 头部设计 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 48rpx 48rpx 32rpx 48rpx;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%);
}

.modal-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1a202c;
  letter-spacing: 0.5rpx;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.02);
}

.modal-close {
  font-size: 32rpx;
  color: #718096;
  padding: 16rpx;
  line-height: 1;
  transition: all 0.3s ease;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.03);
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:active {
  color: #e53e3e;
  background: rgba(229, 62, 62, 0.1);
  transform: scale(0.9);
}

/* 主体内容 */
.modal-body {
  padding: 40rpx 48rpx;
}

/* 表单组件设计 */
.form-group {
  margin-bottom: 8rpx;
}

.form-label {
  display: block;
  font-size: 30rpx;
  color: #2d3748;
  margin-bottom: 20rpx;
  font-weight: 600;
  letter-spacing: 0.3rpx;
}

.form-input {
  width: 100%;
  height: 88rpx;
  padding: 0 32rpx;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
  font-size: 30rpx;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  color: #2d3748;
}

.form-input:focus {
  border-color: #667eea;
  outline: none;
  box-shadow: 
    0 0 0 4rpx rgba(102, 126, 234, 0.1),
    0 4rpx 16rpx rgba(102, 126, 234, 0.15);
  background: rgba(255, 255, 255, 0.95);
  transform: translateY(-1rpx);
}

.form-textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 24rpx 32rpx;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
  font-size: 30rpx;
  resize: none;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  color: #2d3748;
  line-height: 1.6;
}

.form-textarea:focus {
  border-color: #667eea;
  outline: none;
  box-shadow: 
    0 0 0 4rpx rgba(102, 126, 234, 0.1),
    0 4rpx 16rpx rgba(102, 126, 234, 0.15);
  background: rgba(255, 255, 255, 0.95);
  transform: translateY(-1rpx);
}

/* 位置信息卡片 */
.location-info {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  padding: 32rpx;
  border-radius: 16rpx;
  border: 2rpx solid rgba(102, 126, 234, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.02);
}

.location-text {
  display: block;
  font-size: 28rpx;
  color: #4a5568;
  margin-bottom: 16rpx;
  line-height: 1.5;
  font-weight: 500;
}

.location-tip {
  color: #9ca3af;
  font-style: italic;
  font-weight: 400;
}

.location-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  color: white;
  border: none;
  padding: 20rpx 40rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
  cursor: pointer;
}

.location-btn:active {
  transform: translateY(2rpx);
  box-shadow: 0 2rpx 8rpx rgba(16, 185, 129, 0.4);
}

.location-btn:disabled {
  background: linear-gradient(135deg, #cbd5e0 0%, #a0aec0 100%);
  box-shadow: none;
  transform: none;
  cursor: not-allowed;
}

.image-upload {
  border: 2rpx dashed #e0e0e0;
  border-radius: 8rpx;
  position: relative;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 20rpx;
  color: #999;
}

.upload-icon {
  font-size: 60rpx;
  margin-bottom: 20rpx;
}

.upload-text {
  font-size: 26rpx;
}

.image-preview {
  position: relative;
  display: inline-block;
}

.preview-image {
  width: 100%;
  border-radius: 8rpx;
  object-fit: cover;
}

.image-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 40rpx;
  height: 40rpx;
  background: #ff4757;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  line-height: 1;
}

.image-debug-url {
  display: block;
  font-size: 20rpx;
  color: #666;
  margin-top: 10rpx;
  word-break: break-all;
}

.image-error {
  display: block;
  font-size: 22rpx;
  color: #ff4757;
  margin-top: 8rpx;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 24rpx;
  padding: 30rpx 32rpx 32rpx 32rpx;
  border-top: 2rpx solid rgba(226, 232, 240, 0.8);
  backdrop-filter: blur(10px);
}

.btn {
  padding: 2rpx 48rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  border: none;
  min-width: 140rpx;
  text-align: center;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
  overflow: hidden;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.8);
  color: #4a5568;
  border: 2rpx solid #e2e8f0;
  backdrop-filter: blur(10px);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.btn-cancel::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.03), transparent);
  transition: all 0.5s;
}

.btn-cancel:hover::before {
  left: 100%;
}

.btn-cancel:active {
  transform: translateY(1rpx);
  box-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.1);
}

.btn-primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  color: white;
  box-shadow: 
    0 4rpx 16rpx rgba(16, 185, 129, 0.3),
    inset 0 1rpx 2rpx rgba(255, 255, 255, 0.2);
}

.btn-primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: all 0.5s;
}

.btn-primary:hover::before {
  left: 100%;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%);
  transform: translateY(-1rpx);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(2rpx);
  box-shadow: 
    0 2rpx 8rpx rgba(16, 185, 129, 0.4),
    inset 0 1rpx 2rpx rgba(255, 255, 255, 0.1);
}

.btn-primary:disabled {
  background: linear-gradient(135deg, #cbd5e0 0%, #a0aec0 100%);
  color: #718096;
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
}

.btn-primary:disabled::before {
  display: none;
}

/* 微动画效果 */
@keyframes buttonPulse {
  0%, 100% { transform: translateY(-1rpx) scale(1); }
  50% { transform: translateY(-1rpx) scale(1.02); }
}

.btn-primary:not(:disabled):hover {
  animation: buttonPulse 1.5s infinite;
}

/* H5 内置图片预览覆盖层样式 */
.img-overlay {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100000;
}
.img-box {
  position: relative;
  max-width: 94vw;
  max-height: 94vh;
}
.img-full {
  max-width: 100%;
  max-height: 100%;
  display: block;
  border-radius: 8px;
}
.img-close {
  position: absolute;
  right: -12px;
  top: -12px;
  background: #ff4757;
  color: white;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
}

/* 表单输入焦点微光效果 */
@keyframes inputGlow {
  0%, 100% { 
    box-shadow: 
      0 0 0 4rpx rgba(102, 126, 234, 0.1), 
      0 4rpx 16rpx rgba(102, 126, 234, 0.15); 
  }
  50% { 
    box-shadow: 
      0 0 0 6rpx rgba(102, 126, 234, 0.15), 
      0 6rpx 20rpx rgba(102, 126, 234, 0.2); 
  }
}

.form-input:focus,
.form-textarea:focus {
  animation: inputGlow 2s ease-in-out infinite;
}

/* 上传区域悬浮效果 */
.upload-area:hover {
  transform: translateY(-2rpx);
  border-color: rgba(102, 126, 234, 0.3);
  background: rgba(102, 126, 234, 0.02);
  transition: all 0.3s ease;
}

/* 位置按钮加载状态 */
.location-btn:disabled {
  position: relative;
}

.location-btn:disabled::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20rpx;
  height: 20rpx;
  margin: -10rpx 0 0 -10rpx;
  border: 2rpx solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: btnSpin 1s linear infinite;
}

@keyframes btnSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
