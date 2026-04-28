<template>
  <view class="test-container">
    <view class="test-header">
      <text class="test-title">地图功能测试</text>
    </view>
    
    <view class="test-section">
      <text class="section-title">API密钥状态</text>
      <view class="status-item">
        <text class="status-label">API密钥:</text>
        <text class="status-value" :class="{ 'error': !isApiKeyConfigured }">
          {{ isApiKeyConfigured ? '已配置' : '未配置' }}
        </text>
      </view>
    </view>

    <view class="test-section">
      <text class="section-title">位置权限测试</text>
      <button class="test-btn" @click="testLocation">测试获取位置</button>
      <view v-if="locationResult" class="test-result">
        <text>纬度: {{ locationResult.latitude }}</text>
        <text>经度: {{ locationResult.longitude }}</text>
      </view>
    </view>

    <view class="test-section">
      <text class="section-title">搜索功能测试</text>
      <input 
        class="test-input" 
        v-model="testKeyword" 
        placeholder="输入搜索关键词"
      />
      <button class="test-btn" @click="testSearch">测试搜索</button>
      <view v-if="searchResult" class="test-result">
        <text>搜索结果数量: {{ searchResult.count }}</text>
        <text v-if="searchResult.error">错误: {{ searchResult.error }}</text>
      </view>
    </view>

    <view class="test-section">
      <button class="test-btn primary" @click="goToMap">进入地图页面</button>
    </view>
  </view>
</template>

<script>
import { isApiKeyConfigured, searchPlaces } from '@/api/map.js'

export default {
  data() {
    return {
      testKeyword: '餐厅',
      locationResult: null,
      searchResult: null
    }
  },
  computed: {
    isApiKeyConfigured() {
      return isApiKeyConfigured()
    }
  },
  methods: {
    testLocation() {
      // 检测是否为支付宝小程序
      const systemInfo = uni.getSystemInfoSync()
      const isAlipay = systemInfo.uniPlatform === 'mp-alipay'
      
      const locationOptions = {
        success: (res) => {
          // 兼容不同平台的返回数据结构
          let latitude = res.latitude
          let longitude = res.longitude
          
          // 支付宝小程序可能返回字符串，需要转换
          if (typeof latitude === 'string') {
            latitude = parseFloat(latitude)
          }
          if (typeof longitude === 'string') {
            longitude = parseFloat(longitude)
          }
          
          this.locationResult = {
            latitude: latitude,
            longitude: longitude
          }
          uni.showToast({
            title: '位置获取成功',
            icon: 'success'
          })
        },
        fail: (err) => {
          console.log('获取位置失败:', err)
          
          // 如果是支付宝小程序不支持type的错误，重试不传type
          if (err.errMsg && err.errMsg.includes('暂不支持 type')) {
            console.log('支付宝小程序不支持type参数，重试不传type')
            const retryOptions = { ...locationOptions }
            delete retryOptions.type
            uni.getLocation(retryOptions)
            return
          }
          
          uni.showToast({
            title: '位置获取失败',
            icon: 'none'
          })
        }
      }
      
      // 支付宝小程序不传type参数
      if (!isAlipay) {
        locationOptions.type = 'gcj02'
      }
      
      uni.getLocation(locationOptions)
    },

    testSearch() {
      if (!this.locationResult || !this.locationResult.latitude || !this.locationResult.longitude) {
        uni.showToast({
          title: '位置未初始化',
          icon: 'none'
        });
        return;
      }

      searchPlaces(this.testKeyword, this.locationResult.latitude, this.locationResult.longitude, 5000)
        .then((res) => {
          const data = res && res.data
          this.searchResult = {
            count: Array.isArray(data) ? data.length : 0
          }
          uni.showToast({
            title: '搜索测试成功',
            icon: 'success'
          })
        })
        .catch((error) => {
          this.searchResult = {
            count: 0,
            error: (error && (error.msg || error.message)) || '搜索测试失败'
          }
          uni.showToast({
            title: '搜索测试失败',
            icon: 'none'
          })
        })
    },

    goToMap() {
      uni.navigateTo({ url: '/pages/map/map' })
    }
  },
  server: {
    proxy: {
      '/api/map': {
        target: 'https://apis.map.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/map/, '')
      }
    }
  }
}
</script>

<style scoped>
.test-container {
  padding: 4vh;
  background: #f5f5f5;
  height: 85.4vh;
}

.test-header {
  text-align: center;
  margin-bottom: 40rpx;
}

.test-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.test-section {
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 30rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.1);
}

.section-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
  display: block;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10rpx;
}

.status-label {
  font-size: 26rpx;
  color: #666;
}

.status-value {
  font-size: 26rpx;
  color: #4CAF50;
  font-weight: bold;
}

.status-value.error {
  color: #F44336;
}

.test-input {
  width: 100%;
  height: 80rpx;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  margin-bottom: 20rpx;
  box-sizing: border-box;
}

.test-btn {
  width: 100%;
  height: 80rpx;
  background: #007aff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 28rpx;
  margin-bottom: 20rpx;
}

.test-btn.primary {
  background: #4CAF50;
}

.test-result {
  background: #f8f9fa;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-top: 20rpx;
}

.test-result text {
  display: block;
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}
</style>
