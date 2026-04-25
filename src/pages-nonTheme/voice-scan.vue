<template>
  <view class="voice-page" :class="{ 'dark-mode': isDark }">
    <!-- 动态背景 -->
    <view class="bg-effects">
      <view class="bg-circle c1"></view>
      <view class="bg-circle c2"></view>
      <view class="bg-circle c3"></view>
    </view>

    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="safe-area-top"></view>
      <view class="nav-content">
        <view class="nav-left" @click="goBack">
          <text class="back-icon">←</text>
        </view>
        <view class="nav-title-wrap">
          <view class="title-icon-pill"><text>🎤</text></view>
          <text class="nav-title">语音识别</text>
        </view>
        <view class="nav-right">
          <view class="action-icon-btn" @click="goToCamera">
            <text>📷</text>
          </view>
        </view>
      </view>
    </view>

    <view class="content-wrapper">
      <!-- 中央麦克风区域 -->
      <view class="mic-section">
        <view :class="['mic-ring', isListening ? 'listening' : '']">
          <view class="mic-inner">
            <text class="mic-icon">🎤</text>
          </view>
        </view>
        <view class="mic-status">
          <text class="status-text">{{ statusText }}</text>
        </view>
      </view>

      <!-- 语音波形可视化 -->
      <view class="wave-section" v-if="isListening">
        <view class="wave-bars">
          <view v-for="i in 12" :key="i" :class="['wave-bar', `wave-${(i % 3) + 1}`]" :style="{ height: getWaveHeight(i) + 'px' }"></view>
        </view>
      </view>

      <!-- 长按说话按钮 -->
      <view class="press-section">
        <view
          :class="['press-btn', isListening ? 'active' : '']"
          @touchstart="startListening"
          @touchend="stopListening"
          @touchcancel="stopListening"
        >
          <text class="press-text">{{ isListening ? '松开结束' : '长按说话' }}</text>
        </view>
        <text class="press-hint">或输入文字描述垃圾类型</text>
      </view>

      <!-- 文字输入区域（替代语音） -->
      <view class="text-section">
        <view class="text-input-card">
          <textarea
            v-model="textInput"
            class="text-input"
            placeholder="输入垃圾描述，如：废报纸、塑料瓶、旧电池..."
            placeholder-class="input-placeholder"
            auto-height
          ></textarea>
        </view>
        <view class="text-submit-btn" @click="submitText">
          <text>识别</text>
        </view>
      </view>

      <!-- 最近识别记录 -->
      <view class="history-section" v-if="historyRecords.length > 0">
        <view class="section-title">最近识别记录</view>
        <view class="history-list">
          <view v-for="(record, index) in historyRecords" :key="index" class="history-item" @click="useRecord(record)">
            <view class="history-content">
              <text class="history-text">{{ record.text }}</text>
              <text class="history-result">{{ record.result }}</text>
            </view>
            <text class="history-time">{{ formatTime(record.time) }}</text>
          </view>
        </view>
      </view>

      <!-- 识别结果 -->
      <view class="result-section" v-if="currentResult">
        <view class="result-header">
          <text class="result-title">识别结果</text>
        </view>
        <view class="result-card">
          <view class="result-category">
            <text class="category-icon">{{ currentResult.icon }}</text>
            <text class="category-name">{{ currentResult.category }}</text>
          </view>
          <view class="result-detail">
            <text class="result-text">{{ currentResult.description }}</text>
          </view>
          <view class="result-tags">
            <view v-for="(tag, idx) in currentResult.tags" :key="idx" class="result-tag">
              <text>{{ tag }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部提示 -->
    <view class="bottom-hint">
      <text>语音功能预留中，当前支持文字输入识别</text>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      isListening: false,
      textInput: '',
      currentResult: null,
      historyRecords: [],
      statusText: '点击按钮开始识别',
      isDark: false
    };
  },
  onLoad() {
    this.checkTheme();
    this.loadHistory();
  },
  onShow() {
    this.checkTheme();
  },
  methods: {
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    goBack() { uni.navigateBack(); },
    goToCamera() {
      uni.navigateTo({ url: '/pages/scan/scan' });
    },
    getWaveHeight(index) {
      // rpx: 基础高度 20rpx，波动 ±15rpx（共 20~35rpx）
      return 20 + Math.random() * 15;
    },
    startListening() {
      this.isListening = true;
      this.statusText = '正在聆听...';
    },
    stopListening() {
      if (!this.isListening) return;
      this.isListening = false;
      this.statusText = '识别中...';
      setTimeout(() => {
        this.statusText = '语音功能开发中，请使用文字输入';
        uni.showToast({ title: '语音功能预留中，请输入文字', icon: 'none' });
      }, 500);
    },
    async submitText() {
      if (!this.textInput.trim()) {
        uni.showToast({ title: '请输入垃圾描述', icon: 'none' });
        return;
      }
      this.statusText = '识别中...';
      const normalizedText = this.textInput.trim();
      this.currentResult = this.getMockResult(normalizedText);
      this.addToHistory(normalizedText, this.currentResult);
      this.statusText = '识别完成';
    },
    getMockResult(text) {
      const lower = text.toLowerCase();
      if (lower.includes('纸') || lower.includes('报纸')) {
        return { icon: '📄', category: '可回收垃圾', description: '废纸属于可回收垃圾，建议叠放整齐后投放', tags: ['可回收', '废纸'] };
      }
      if (lower.includes('塑料') || lower.includes('瓶')) {
        return { icon: '🧴', category: '可回收垃圾', description: '塑料瓶属于可回收垃圾，请清空内容物后投放', tags: ['可回收', '塑料'] };
      }
      if (lower.includes('电池')) {
        return { icon: '🔋', category: '有害垃圾', description: '废旧电池属于有害垃圾，请投入有害垃圾收集容器', tags: ['有害垃圾', '电池'] };
      }
      if (lower.includes('厨余') || lower.includes('剩菜') || lower.includes('果皮')) {
        return { icon: '🍎', category: '厨余垃圾', description: '厨余垃圾请投入绿色垃圾桶，注意沥干水分', tags: ['厨余垃圾', '易腐'] };
      }
      return { icon: '♻️', category: '可回收垃圾', description: '该物品属于可回收垃圾，可投入蓝色垃圾桶', tags: ['可回收'] };
    },
    addToHistory(text, result) {
      this.historyRecords.unshift({
        text,
        result: result.category,
        time: new Date().toISOString()
      });
      if (this.historyRecords.length > 10) {
        this.historyRecords.pop();
      }
      this.saveHistory();
    },
    loadHistory() {
      try {
        const raw = uni.getStorageSync('voice_history') || '[]';
        this.historyRecords = JSON.parse(raw);
      } catch (e) {
        this.historyRecords = [];
      }
    },
    saveHistory() {
      try {
        uni.setStorageSync('voice_history', JSON.stringify(this.historyRecords));
      } catch (e) {}
    },
    useRecord(record) {
      this.textInput = record.text;
    },
    formatTime(isoStr) {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }
};
</script>

<style scoped>
.voice-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
  position: relative;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  transition: all 0.3s ease;
}
.voice-page.dark-mode {
  background: linear-gradient(135deg, #28285f 0%, #28346f 30%, #322c8a 70%, #442977 100%);
}
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s; }
.voice-page:not(.dark-mode) .bg-circle { background: #10b981; }
.voice-page.dark-mode .bg-circle { background: rgba(255, 255, 255, 0.1); }
.c1 { width: 600rpx; height: 600rpx; top: -200rpx; right: -200rpx; }
.c2 { width: 400rpx; height: 400rpx; bottom: 30%; left: -200rpx; }
.c3 { width: 300rpx; height: 300rpx; bottom: 10%; right: -100rpx; }

.navbar { position: relative; z-index: 10; }
.safe-area-top { height: env(safe-area-inset-top); min-height: 44rpx; }
.nav-content {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 32rpx;
  height: 88rpx; box-sizing: content-box;
}
.back-icon { font-size: 48rpx; font-weight: 600; padding: 8rpx; color: #1f2937; }
.dark-mode .back-icon { color: #fff; }
.nav-title-wrap { display: flex; align-items: center; gap: 12rpx; flex: 1; justify-content: center; }
.title-icon-pill {
  width: 56rpx; height: 56rpx;
  background: rgba(16, 185, 129, 0.12);
  border-radius: 14rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 26rpx;
}
.dark-mode .title-icon-pill { background: rgba(255, 255, 255, 0.15); }
.nav-title { font-size: 32rpx; font-weight: 700; color: #1f2937; }
.dark-mode .nav-title { color: #fff; }
.action-icon-btn {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  display: flex; align-items: center; justify-content: center;
  font-size: 28rpx;
  transition: all 0.3s;
}
.action-icon-btn:active { transform: scale(0.92); }
.dark-mode .action-icon-btn { background: rgba(255, 255, 255, 0.15); }

.content-wrapper { position: relative; z-index: 10; padding: 40rpx 32rpx 160rpx; }

.mic-section {
  display: flex; flex-direction: column; align-items: center;
  padding: 60rpx 0;
}
.mic-ring {
  width: 280rpx; height: 280rpx;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.08);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.3s;
  border: 4rpx solid rgba(16, 185, 129, 0.2);
}
.mic-ring.listening {
  background: rgba(16, 185, 129, 0.15);
  animation: pulse 1.5s infinite;
  border-color: rgba(16, 185, 129, 0.4);
}
@keyframes pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 40rpx rgba(16, 185, 129, 0); }
}
.mic-inner {
  width: 200rpx; height: 200rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.4);
}
.mic-icon { font-size: 80rpx; }
.mic-status { margin-top: 32rpx; }
.status-text { color: #6b7280; font-size: 28rpx; font-weight: 500; }
.dark-mode .status-text { color: rgba(255, 255, 255, 0.7); }

.wave-section { margin-bottom: 40rpx; display: flex; justify-content: center; padding: 40rpx 0; }
.wave-bars { display: flex; align-items: flex-end; gap: 8rpx; height: 80rpx; }
.wave-bar {
  width: 8rpx; border-radius: 4rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  animation: waveAnim 0.8s ease-in-out infinite alternate;
}
.wave-1 { animation-delay: 0s; }
.wave-2 { animation-delay: 0.1s; }
.wave-3 { animation-delay: 0.2s; }
@keyframes waveAnim { from { height: 20rpx; } to { height: 60rpx; } }

.press-section {
  display: flex; flex-direction: column; align-items: center;
  padding: 20rpx 0 60rpx;
}
.press-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  padding: 28rpx 80rpx;
  border-radius: 60rpx;
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.35);
  transition: all 0.3s;
}
.press-btn.active {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 8rpx 32rpx rgba(239, 68, 68, 0.35);
}
.press-btn:active { transform: scale(0.96); }
.press-text { color: #fff; font-size: 32rpx; font-weight: 700; letter-spacing: 2rpx; }
.press-hint { color: #9ca3af; font-size: 22rpx; margin-top: 24rpx; }
.dark-mode .press-hint { color: rgba(255, 255, 255, 0.5); }

.text-section { display: flex; gap: 16rpx; align-items: flex-start; margin-bottom: 60rpx; }
.text-input-card {
  flex: 1;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.08);
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
}
.dark-mode .text-input-card { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.text-input {
  width: 100%; min-height: 120rpx;
  color: #1f2937;
  font-size: 28rpx;
  line-height: 1.7;
}
.dark-mode .text-input { color: #fff; }
.input-placeholder { color: #9ca3af; }
.dark-mode .input-placeholder { color: rgba(255, 255, 255, 0.5); }
.text-submit-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  padding: 24rpx 40rpx;
  border-radius: 20rpx;
  flex-shrink: 0;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.3);
  transition: all 0.3s;
}
.text-submit-btn:active { transform: scale(0.95); }
.text-submit-btn text { color: #fff; font-size: 28rpx; font-weight: 700; }

.history-section { margin-bottom: 60rpx; }
.section-title {
  display: flex; align-items: center; gap: 12rpx;
  font-size: 28rpx; font-weight: 700; color: #1f2937;
  margin-bottom: 20rpx;
}
.dark-mode .section-title { color: #fff; }
.section-title::before {
  content: '';
  width: 6rpx; height: 28rpx;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 3rpx;
}
.history-item {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  display: flex; justify-content: space-between; align-items: center;
  box-shadow: 0 4rpx 16rpx rgba(16, 185, 129, 0.06);
  border: 1rpx solid rgba(16, 185, 129, 0.06);
  transition: all 0.3s;
}
.history-item:active { transform: scale(0.98); }
.dark-mode .history-item { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.history-content { flex: 1; }
.history-text { display: block; color: #1f2937; font-size: 26rpx; margin-bottom: 6rpx; }
.dark-mode .history-text { color: #fff; }
.history-result { display: block; color: #10b981; font-size: 22rpx; font-weight: 600; }
.dark-mode .history-result { color: #34d399; }
.history-time { color: #9ca3af; font-size: 20rpx; margin-left: 20rpx; }
.dark-mode .history-time { color: rgba(255, 255, 255, 0.5); }

.result-section { margin-top: 40rpx; }
.result-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx;
  border: 1rpx solid rgba(16, 185, 129, 0.08);
  box-shadow: 0 8rpx 32rpx rgba(16, 185, 129, 0.1);
}
.dark-mode .result-card { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.1); }
.result-category { display: flex; align-items: center; margin-bottom: 24rpx; }
.category-icon { font-size: 56rpx; margin-right: 20rpx; }
.category-name { color: #1f2937; font-size: 32rpx; font-weight: 800; }
.dark-mode .category-name { color: #fff; }
.result-detail { margin-bottom: 24rpx; }
.result-text { color: #4b5563; font-size: 26rpx; line-height: 1.8; }
.dark-mode .result-text { color: rgba(255, 255, 255, 0.8); }
.result-tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.result-tag {
  background: rgba(16, 185, 129, 0.1);
  padding: 8rpx 20rpx;
  border-radius: 40rpx;
}
.dark-mode .result-tag { background: rgba(16, 185, 129, 0.2); }
.result-tag text { color: #10b981; font-size: 22rpx; font-weight: 600; }
.dark-mode .result-tag text { color: #34d399; }

.bottom-hint {
  position: fixed;
  bottom: 40rpx;
  left: 0; right: 0;
  text-align: center;
}
.bottom-hint text { color: #9ca3af; font-size: 22rpx; }
.dark-mode .bottom-hint text { color: rgba(255, 255, 255, 0.5); }
</style>
