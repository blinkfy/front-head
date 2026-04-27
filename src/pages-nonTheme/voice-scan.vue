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
        <view :class="['mic-ring', isListening ? 'listening' : '']"
          @touchstart="startListening"
          @touchend="stopListening"
          @touchcancel="stopListening"
        >
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
      <text>{{ isH5 ? 'H5 环境暂不支持录音，请使用文字输入' : '长按录音，松开后自动识别' }}</text>
    </view>
  </view>
</template>

<script>
import { transcribeAudio, transcribeAudioBlob, transcribeAudioSegments, recognizeByText } from '@/api/voice.js';
import { baseUrl } from '@/api/settings.js';

let recorderManager = null;

export default {
  data() {
    return {
      isListening: false,
      textInput: '',
      currentResult: null,
      historyRecords: [],
      statusText: '点击按钮开始识别',
      isDark: false,
      isH5: false,
      isApp: false,
      realtimeFrameSupported: false,
      h5MediaRecorder: null,
      h5AudioStream: null,
      h5AudioChunks: [],
      h5RecordingMimeType: '',
      realtimeSocket: null,
      realtimeReady: false,
      realtimeFailed: false,
      realtimeText: '',
      realtimeCommittedText: '',
      realtimeLiveText: '',
      realtimeFrameQueue: [],
      realtimeSocketState: 'closed',
      realtimeFinishSent: false,
      appSegmentMode: false,
      appSegmentStopRequested: false,
      appSegmentFiles: [],
      appSegmentTranscribing: false,
      appSegmentPendingTranscribe: false,
      appSegmentFinalizing: false,
      appSegmentDuration: 1500,
      appSegmentMaxWindow: 8,
      appSegmentBaseText: '',
      appSegmentCumulativeText: '',
      appSegmentWindowText: '',
      appSegmentWindowStartIndex: 0
    };
  },
  onLoad() {
    this.checkTheme();
    this.loadHistory();
    this.initRecorder();
  },
  onShow() {
    this.checkTheme();
  },
  onUnload() {
    this.destroyRecorder();
  },
  methods: {
    checkTheme() {
      const theme = uni.getStorageSync('app_theme');
      this.isDark = theme === 'dark';
    },
    initRecorder() {
      // 检测平台
      try {
        const appBaseInfo = uni.getAppBaseInfo ? uni.getAppBaseInfo() : uni.getSystemInfoSync();
        this.isH5 = appBaseInfo.uniPlatform === 'web';
        this.isApp = appBaseInfo.uniPlatform === 'app';
      } catch (e) {
        this.isH5 = false;
        this.isApp = false;
      }

      if (this.isH5) {
        // H5 环境暂不支持原生录音，使用文字输入
        return;
      }

      recorderManager = uni.getRecorderManager();
      this.realtimeFrameSupported = !this.isApp && typeof recorderManager.onFrameRecorded === 'function';
      recorderManager.onStart(() => {
        this.statusText = '正在聆听...';
      });
      if (this.realtimeFrameSupported) {
        recorderManager.onFrameRecorded((res) => {
          if (res && res.frameBuffer) {
            this.sendRealtimeAudioFrame(res.frameBuffer);
          }
        });
      }
      recorderManager.onStop((res) => {
        if (this.appSegmentMode) {
          this.handleAppSegmentStop(res);
          return;
        }
        this.isListening = false;
        if (res.tempFilePath) {
          this.statusText = '识别中...';
          this.finishRealtimeOrFallback(res.tempFilePath);
        } else {
          this.stopRealtimeAsr();
          this.statusText = '录音失败，请重试';
          uni.showToast({ title: '录音失败', icon: 'none' });
        }
      });
      recorderManager.onError((err) => {
        this.isListening = false;
        this.realtimeFailed = true;
        this.stopRealtimeAsr();
        this.statusText = '录音出错，请重试';
        console.error('[voice] recorder error:', err);
        uni.showToast({ title: '录音权限未开启或设备不支持', icon: 'none' });
      });
    },
    destroyRecorder() {
      if (recorderManager) {
        try { recorderManager.stop(); } catch (e) {}
        recorderManager = null;
      }
      this.stopRealtimeAsr();
    },
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        if (this.isDark) {
          uni.reLaunch({url: '/pages-dark/home/home'})
        } else {
          uni.reLaunch({url: '/pages/home/home'})
        }
      }
    },
    goToCamera() {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (chooseRes) => {
          const filePath = chooseRes.tempFilePaths[0];
          uni.setStorageSync('pending_recognize_image', filePath);
          const homeUrl = this.isDark ? '/pages-dark/home/home' : '/pages/home/home';
          uni.reLaunch({ url: homeUrl });
        },
        fail: () => {
          uni.showToast({ title: '选择取消', icon: 'none' });
        }
      });
    },
    getWaveHeight(index) {
      return 20 + Math.random() * 15;
    },
    startListening() {
      if (this.isH5) {
        uni.showToast({ title: 'H5 环境请使用文字输入', icon: 'none' });
        return;
      }
      if (!recorderManager) {
        this.initRecorder();
      }
      if (this.isApp && !this.realtimeFrameSupported) {
        this.startAppSegmentRecognition();
        return;
      }
      if (this.realtimeFrameSupported) {
        this.startRealtimeAsr();
      } else {
        this.stopRealtimeAsr();
        this.realtimeFailed = true;
      }
      this.isListening = true;
      this.statusText = '准备录音...';
      recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3',
        frameSize: 4
      });
    },
    stopListening() {
      if (!this.isListening) return;
      if (this.appSegmentMode) {
        this.appSegmentStopRequested = true;
        this.statusText = '识别中...';
      }
      if (recorderManager) {
        recorderManager.stop();
      }
    },
    startAppSegmentRecognition() {
      this.stopRealtimeAsr();
      this.appSegmentMode = true;
      this.appSegmentStopRequested = false;
      this.appSegmentFiles = [];
      this.appSegmentTranscribing = false;
      this.appSegmentPendingTranscribe = false;
      this.appSegmentFinalizing = false;
      this.appSegmentBaseText = '';
      this.appSegmentCumulativeText = '';
      this.appSegmentWindowText = '';
      this.appSegmentWindowStartIndex = 0;
      this.realtimeFailed = true;
      this.realtimeText = '';
      this.textInput = '';
      this.isListening = true;
      this.statusText = '正在聆听...';
      this.startAppSegmentRecorder();
    },
    startAppSegmentRecorder() {
      if (!recorderManager || !this.appSegmentMode || this.appSegmentStopRequested) return;
      try {
        recorderManager.start({
          duration: this.appSegmentDuration,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3'
        });
      } catch (e) {
        this.appSegmentMode = false;
        this.isListening = false;
        this.statusText = '录音出错，请重试';
        console.error('[voice] app segment recorder start failed:', e);
      }
    },
    handleAppSegmentStop(res) {
      const filePath = res && res.tempFilePath;
      if (filePath) {
        this.appSegmentFiles.push(filePath);
        this.transcribeAppSegmentWindow(this.appSegmentStopRequested);
      }

      if (!this.appSegmentStopRequested) {
        setTimeout(() => this.startAppSegmentRecorder(), 80);
        return;
      }

      this.isListening = false;
      if (!filePath && !this.textInput.trim()) {
        this.appSegmentMode = false;
        this.statusText = '录音失败，请重试';
        uni.showToast({ title: '录音失败', icon: 'none' });
      }
    },
    async transcribeAppSegmentWindow(isFinal = false) {
      if (!this.appSegmentFiles.length) return;
      if (this.appSegmentTranscribing) {
        this.appSegmentPendingTranscribe = true;
        this.appSegmentFinalizing = this.appSegmentFinalizing || isFinal;
        return;
      }

      this.appSegmentTranscribing = true;
      this.appSegmentPendingTranscribe = false;
      this.appSegmentFinalizing = isFinal;
      const windowFiles = this.appSegmentFiles.slice(-this.appSegmentMaxWindow);
      const windowStartIndex = Math.max(0, this.appSegmentFiles.length - windowFiles.length);

      try {
        const res = await transcribeAudioSegments(windowFiles);
        const text = String((res && res.data && res.data.text) || '').trim();
        if (text) {
          const mergedText = this.mergeAppSegmentWindowText(text, windowStartIndex, isFinal);
          this.realtimeText = mergedText;
          this.textInput = mergedText;
          this.statusText = isFinal ? '识别完成' : '实时识别中...';
        }
      } catch (e) {
        console.warn('[voice] app segment transcribe failed:', e);
      } finally {
        this.appSegmentTranscribing = false;
        const shouldRunPending = this.appSegmentPendingTranscribe;
        const shouldFinalize = this.appSegmentFinalizing || (isFinal && this.appSegmentStopRequested);
        this.appSegmentPendingTranscribe = false;
        this.appSegmentFinalizing = false;

        if (shouldRunPending) {
          this.transcribeAppSegmentWindow(shouldFinalize);
          return;
        }

        if (shouldFinalize && this.appSegmentStopRequested) {
          this.appSegmentMode = false;
          const recognizedText = String(this.textInput || '').trim();
          if (recognizedText) {
            await this.applyRecognizedText(recognizedText);
          } else {
            this.statusText = '未识别到语音内容，请重试';
            uni.showToast({ title: '未识别到内容', icon: 'none' });
          }
        }
      }
    },
    mergeAppSegmentWindowText(windowText, windowStartIndex, isFinal = false) {
      const currentWindowText = String(windowText || '').trim();
      if (!currentWindowText) {
        return String(this.appSegmentCumulativeText || this.textInput || '').trim();
      }

      const previousWindowText = String(this.appSegmentWindowText || '').trim();
      const previousStartIndex = Number(this.appSegmentWindowStartIndex || 0);
      const previousFullText = String(this.appSegmentCumulativeText || this.textInput || '').trim();
      let nextWindowText = currentWindowText;

      if (previousWindowText) {
        if (windowStartIndex === previousStartIndex) {
          nextWindowText = this.mergeSameAppSegmentWindowText(previousWindowText, currentWindowText);
        }
      }

      this.appSegmentWindowStartIndex = windowStartIndex;
      this.appSegmentWindowText = nextWindowText;
      const mergedText = this.mergeAppSegmentCumulativeText(previousFullText, nextWindowText);
      this.appSegmentCumulativeText = mergedText;

      if (isFinal) {
        this.appSegmentBaseText = mergedText;
        this.appSegmentWindowText = '';
      }
      return mergedText;
    },
    mergeAppSegmentCumulativeText(previousText, windowText) {
      const prev = String(previousText || '').trim();
      const curr = String(windowText || '').trim();
      if (!prev) return curr;
      if (!curr) return prev;
      if (curr === prev || curr.includes(prev)) return curr;
      if (prev.includes(curr)) return prev;

      const maxExactOverlap = Math.min(prev.length, curr.length, 40);
      for (let len = maxExactOverlap; len >= 3; len--) {
        if (prev.slice(prev.length - len) === curr.slice(0, len)) {
          return this.joinAppSegmentText(prev, curr.slice(len));
        }
      }

      const maxReplaceTail = Math.min(prev.length, 24);
      const prevTail = prev.slice(prev.length - maxReplaceTail);
      const maxPieceLength = Math.min(prevTail.length, curr.length, 24);
      for (let len = maxPieceLength; len >= 5; len--) {
        for (let offset = 0; offset <= Math.min(8, curr.length - len); offset++) {
          const piece = curr.slice(offset, offset + len);
          const indexInTail = prevTail.lastIndexOf(piece);
          if (indexInTail < 0) continue;

          const indexInPrev = prev.length - maxReplaceTail + indexInTail;
          const candidate = this.joinAppSegmentText(prev.slice(0, indexInPrev), curr.slice(offset));
          if (candidate.length >= prev.length) {
            return candidate;
          }
        }
      }

      return this.joinAppSegmentText(prev, curr);
    },
    mergeSameAppSegmentWindowText(previousText, currentText) {
      const prev = String(previousText || '').trim();
      const curr = String(currentText || '').trim();
      if (!prev) return curr;
      if (!curr) return prev;
      if (curr === prev || curr.includes(prev)) return curr;
      if (prev.includes(curr)) return prev;

      const overlapped = this.joinAppSegmentText(prev, curr);
      if (overlapped !== prev + curr) return overlapped;

      return this.joinAppSegmentText(prev, curr);
    },
    getLeavingAppSegmentPrefix(previousText, currentText, shiftCount = 1) {
      const prev = String(previousText || '').trim();
      const curr = String(currentText || '').trim();
      if (!prev || !curr) return prev;

      const maxOverlap = Math.min(prev.length, curr.length);
      for (let len = maxOverlap; len >= 3; len--) {
        if (prev.slice(prev.length - len) === curr.slice(0, len)) {
          return prev.slice(0, prev.length - len).trim();
        }
      }

      const maxCurrentOffset = Math.min(10, Math.max(0, curr.length - 1));
      let best = null;
      for (let offset = 0; offset <= maxCurrentOffset; offset++) {
        for (let len = Math.min(prev.length, curr.length - offset); len >= 4; len--) {
          const piece = curr.slice(offset, offset + len);
          const index = prev.indexOf(piece);
          if (index > 0 && (!best || len > best.len)) {
            best = { index, len };
          }
        }
      }
      if (best) {
        return prev.slice(0, best.index).trim();
      }

      const ratio = Math.max(1, shiftCount) / Math.max(1, this.appSegmentMaxWindow);
      const estimatedLength = Math.max(0, Math.min(prev.length, Math.floor(prev.length * ratio)));
      return prev.slice(0, estimatedLength).trim();
    },
    joinTranscriptText(left, right) {
      const a = String(left || '').trim();
      const b = String(right || '').trim();
      if (!a) return b;
      if (!b) return a;
      const maxOverlap = Math.min(a.length, b.length, 24);
      for (let len = maxOverlap; len >= 2; len--) {
        if (a.slice(a.length - len) === b.slice(0, len)) {
          return a + b.slice(len);
        }
      }
      return a + b;
    },
    joinAppSegmentText(left, right) {
      const a = String(left || '').trim();
      const b = String(right || '').trim();
      if (!a) return b;
      if (!b) return a;

      const maxOverlap = Math.min(a.length, b.length, 24);
      for (let len = maxOverlap; len >= 2; len--) {
        if (a.slice(a.length - len) === b.slice(0, len)) {
          return a + b.slice(len);
        }
      }

      const normalizedLeft = a.replace(/[。！？!?；;，,、：:]$/, '');
      const normalizedRight = b.replace(/^[。！？!?；;，,、：:]+/, '');
      return normalizedLeft + normalizedRight;
    },
    getRealtimeWsUrl() {
      const token = uni.getStorageSync('token') || '';
      const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
      return `${wsBaseUrl}/ws/ai/asr?token=${encodeURIComponent(token)}&format=mp3&sampleRate=16000`;
    },
    startRealtimeAsr() {
      this.stopRealtimeAsr();
      this.realtimeReady = false;
      this.realtimeFailed = false;
      this.realtimeText = '';
      this.realtimeCommittedText = '';
      this.realtimeLiveText = '';
      this.realtimeFrameQueue = [];
      this.realtimeFinishSent = false;
      this.realtimeSocketState = 'connecting';

      try {
        const socketTask = uni.connectSocket({
          url: this.getRealtimeWsUrl(),
          complete: () => {}
        });
        this.realtimeSocket = socketTask;

        socketTask.onOpen(() => {
          if (this.realtimeSocket !== socketTask) return;
          this.realtimeSocketState = 'open';
          this.realtimeReady = false;
        });

        socketTask.onMessage((event) => {
          if (this.realtimeSocket !== socketTask) return;
          let payload = null;
          try {
            payload = typeof event.data === 'string' ? JSON.parse(event.data) : null;
          } catch (e) {
            payload = null;
          }
          if (!payload) return;
          if (payload.type === 'ready') {
            this.realtimeReady = true;
            this.flushRealtimeFrames();
          } else if (payload.type === 'partial' || payload.type === 'final') {
            const text = this.mergeRealtimeTranscript(payload);
            if (text) {
              this.realtimeText = text;
              this.textInput = text;
              this.statusText = payload.type === 'final' ? '识别完成' : '实时识别中...';
            }
          } else if (payload.type === 'done' && payload.text) {
            const text = this.mergeRealtimeTranscript({
              type: 'done',
              text: payload.text,
              fullText: payload.text
            });
            this.realtimeText = text;
            this.textInput = text;
          } else if (payload.type === 'error') {
            this.realtimeFailed = true;
            console.warn('[voice] realtime asr error:', payload);
          } else if (payload.type === 'closed') {
            this.realtimeReady = false;
            this.realtimeFailed = true;
          }
        });

        socketTask.onError((err) => {
          if (this.realtimeSocket !== socketTask) return;
          this.realtimeSocketState = 'closed';
          this.realtimeSocket = null;
          this.realtimeFailed = true;
          this.realtimeReady = false;
          console.warn('[voice] realtime socket error:', err);
        });

        socketTask.onClose(() => {
          if (this.realtimeSocket !== socketTask) return;
          this.realtimeSocketState = 'closed';
          this.realtimeSocket = null;
          this.realtimeReady = false;
        });
      } catch (e) {
        this.realtimeSocketState = 'closed';
        this.realtimeFailed = true;
        console.warn('[voice] start realtime asr failed:', e);
      }
    },
    isRealtimeTransportOpen(socketTask = this.realtimeSocket) {
      if (!socketTask || this.realtimeSocketState !== 'open') return false;
      const readyState = socketTask.readyState;
      return readyState === undefined || readyState === 1 || readyState === 'OPEN';
    },
    isRealtimeSocketOpen(socketTask = this.realtimeSocket) {
      return this.isRealtimeTransportOpen(socketTask) && this.realtimeReady;
    },
    markRealtimeSendFailed(err) {
      this.realtimeSocketState = 'closed';
      this.realtimeReady = false;
      this.realtimeFailed = true;
      this.realtimeFrameQueue = [];
      this.realtimeSocket = null;
      const message = String((err && (err.errMsg || err.message)) || '');
      return /not connected|readyState is not OPEN|task not found|未完成的操作/i.test(message);
    },
    safeSendRealtime(data, onFail) {
      const socketTask = this.realtimeSocket;
      if (!this.isRealtimeTransportOpen(socketTask)) return false;
      try {
        socketTask.send({
          data,
          fail: (err) => {
            const expectedDisconnect = this.markRealtimeSendFailed(err);
            if (onFail) onFail(err, expectedDisconnect);
          }
        });
        return true;
      } catch (err) {
        const expectedDisconnect = this.markRealtimeSendFailed(err);
        if (onFail) onFail(err, expectedDisconnect);
        return false;
      }
    },
    sendRealtimeAudioFrame(frameBuffer) {
      if (this.realtimeFailed || !frameBuffer) return;
      if (!this.isRealtimeSocketOpen()) {
        if (this.realtimeFrameQueue.length < 40) {
          this.realtimeFrameQueue.push(frameBuffer);
        }
        return;
      }
      this.safeSendRealtime(frameBuffer, (err, expectedDisconnect) => {
        if (!expectedDisconnect) {
          console.warn('[voice] send realtime frame failed:', err);
        }
      });
    },
    flushRealtimeFrames() {
      const queue = this.realtimeFrameQueue.splice(0);
      queue.forEach(frame => this.sendRealtimeAudioFrame(frame));
    },
    stopRealtimeAsr() {
      const socketTask = this.realtimeSocket;
      const socketState = this.realtimeSocketState;
      const shouldSendFinish = this.isRealtimeTransportOpen(socketTask) && !this.realtimeFinishSent;
      this.realtimeSocket = null;
      this.realtimeReady = false;
      this.realtimeFrameQueue = [];
      this.realtimeSocketState = 'closed';
      if (!socketTask) return;
      if (shouldSendFinish) {
        this.realtimeFinishSent = true;
        try {
          socketTask.send({
            data: JSON.stringify({ type: 'finish' }),
            fail: () => {}
          });
        } catch (e) {}
      }
      if (socketState === 'open' && socketTask) {
        setTimeout(() => {
          try { socketTask.close(); } catch (e) {}
        }, 800);
      }
    },
    finishRealtimeOrFallback(filePath) {
      if (!this.realtimeFinishSent && this.safeSendRealtime(JSON.stringify({ type: 'finish' }))) {
        this.realtimeFinishSent = true;
      }

      setTimeout(() => {
        const recognizedText = String(this.realtimeText || '').trim();
        this.stopRealtimeAsr();
        if (recognizedText) {
          this.applyRecognizedText(recognizedText);
          return;
        }
        this.statusText = '识别中...';
        this.doTranscribe(filePath);
      }, this.realtimeFailed ? 100 : 1200);
    },
    mergeRealtimeTranscript(payload) {
      const rawText = String((payload && payload.text) || '').trim();
      const fullText = String((payload && payload.fullText) || '').trim();
      const type = String((payload && payload.type) || '');
      const sentenceEnd = !!(payload && (payload.sentenceEnd || type === 'final' || type === 'done'));

      if (type === 'done') {
        const finalText = fullText || rawText || this.realtimeCommittedText || this.realtimeLiveText;
        this.realtimeCommittedText = finalText;
        this.realtimeLiveText = '';
        return finalText;
      }

      if (sentenceEnd) {
        const finalText = fullText || [this.realtimeCommittedText, rawText || this.realtimeLiveText].filter(Boolean).join('').trim();
        this.realtimeCommittedText = finalText;
        this.realtimeLiveText = '';
        return finalText;
      }

      const liveText = rawText || fullText;
      this.realtimeLiveText = liveText;
      if (fullText && this.realtimeCommittedText && fullText.startsWith(this.realtimeCommittedText)) {
        this.realtimeLiveText = fullText.slice(this.realtimeCommittedText.length);
        return fullText;
      }
      return [this.realtimeCommittedText, this.realtimeLiveText].filter(Boolean).join('').trim();
    },
    async applyRecognizedText(recognizedText) {
      const normalizedText = String(recognizedText || '').trim();
      if (!normalizedText) return;
      this.textInput = normalizedText;
      this.statusText = '识别完成';
      uni.showToast({ title: '识别成功', icon: 'success' });
      await this.classifyRecognizedText(normalizedText);
    },
    normalizeTextRecognitionResult(data, fallbackText = '') {
      const fallback = this.getFallbackTextResult(fallbackText);
      const payload = (data && data.data) || data || {};
      if (!payload || typeof payload !== 'object') return fallback;
      return {
        icon: payload.icon || fallback.icon,
        category: payload.category || fallback.category,
        description: payload.description || payload.advice || fallback.description,
        tags: Array.isArray(payload.tags) && payload.tags.length ? payload.tags.slice(0, 4) : fallback.tags,
        source: payload.source || 'ai'
      };
    },
    async classifyRecognizedText(text) {
      const fallback = this.getFallbackTextResult(text);
      this.currentResult = fallback;
      this.statusText = '正在判断垃圾分类...';
      try {
        const res = await recognizeByText(text);
        this.currentResult = this.normalizeTextRecognitionResult(res, text);
      } catch (e) {
        console.warn('[voice] text classify fallback:', e);
        this.currentResult = fallback;
      }
      this.addToHistory(text, this.currentResult);
      this.statusText = '识别完成';
    },
    async doTranscribe(filePath) {
      try {
        const res = await transcribeAudio(filePath);
        const data = (res && res.data) || {};
        const recognizedText = data.text || '';

        if (!recognizedText) {
          this.statusText = '未识别到语音内容，请重试';
          uni.showToast({ title: '未识别到内容', icon: 'none' });
          return;
        }

        await this.applyRecognizedText(recognizedText);
        this.statusText = '识别完成';
        uni.showToast({ title: '识别成功', icon: 'success' });
        return;
        // 自动提交识别结果
      } catch (e) {
        console.error('[voice] transcribe error:', e);
        this.statusText = '识别失败，请重试';
        uni.showToast({ title: (e && e.msg) || '语音识别失败', icon: 'none' });
      }
    },
    async submitText() {
      if (!this.textInput.trim()) {
        uni.showToast({ title: '请输入垃圾描述', icon: 'none' });
        return;
      }
      this.statusText = '识别中...';
      const normalizedText = this.textInput.trim();
      await this.applyRecognizedText(normalizedText);
      this.statusText = '识别完成';
      return;
    },
    getFallbackTextResult(text) {
      const raw = String(text || '').trim();
      const lower = raw.toLowerCase();
      const rules = [
        {
          icon: '♻️',
          category: '可回收垃圾',
          keywords: ['纸', '报纸', '纸箱', '纸盒', '塑料瓶', '饮料瓶', '矿泉水瓶', '玻璃瓶', '易拉罐', '金属', '铁罐', '衣服', '书', '快递盒', '包装盒', '牛奶盒'],
          description: '清空残留并尽量压扁，保持干燥后投放到可回收物桶。',
          tags: ['可回收', '清空残留', '保持干燥']
        },
        {
          icon: '⚠️',
          category: '有害垃圾',
          keywords: ['电池', '纽扣电池', '充电宝', '药', '过期药', '药瓶', '灯管', '荧光灯', '油漆', '杀虫剂', '温度计', '水银'],
          description: '请单独密封或包好，投放到有害垃圾收集点，避免破损泄漏。',
          tags: ['有害', '单独投放', '防破损']
        },
        {
          icon: '🍎',
          category: '厨余垃圾',
          keywords: ['剩饭', '剩菜', '果皮', '果核', '菜叶', '骨头', '鱼刺', '茶叶', '咖啡渣', '蛋壳', '食物', '饭', '菜', '苹果', '香蕉皮'],
          description: '沥干水分后投放到厨余垃圾桶，包装袋请另外分类。',
          tags: ['厨余', '沥干水分', '去包装']
        },
        {
          icon: '🗑️',
          category: '其他垃圾',
          keywords: ['纸巾', '湿巾', '口罩', '烟头', '陶瓷', '尘土', '污损纸', '尿不湿', '一次性餐具', '保鲜膜', '包装袋'],
          description: '这类通常难以再利用，请投放到其他垃圾桶。',
          tags: ['其他垃圾', '不易回收', '干垃圾']
        }
      ];
      const matchedRule = rules.find(rule => rule.keywords.some(keyword => lower.includes(keyword.toLowerCase())));
      if (matchedRule) {
        return {
          icon: matchedRule.icon,
          category: matchedRule.category,
          description: matchedRule.description,
          tags: matchedRule.tags,
          source: 'fallback'
        };
      }
      return {
        icon: '🔎',
        category: '其他垃圾',
        description: raw ? `暂未精确匹配“${raw}”，建议优先确认是否干净可回收；若无法清洁或材质不明，投放其他垃圾更稳妥。` : '请说出或输入具体物品名称，我会判断分类。',
        tags: ['规则回退', '需确认材质', '按当地标准'],
        source: 'fallback'
      };
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
  background:
    radial-gradient(circle at 18% 8%, rgba(56, 189, 248, 0.22) 0%, transparent 34%),
    radial-gradient(circle at 84% 16%, rgba(16, 185, 129, 0.18) 0%, transparent 32%),
    radial-gradient(circle at 58% 82%, rgba(168, 85, 247, 0.16) 0%, transparent 36%),
    linear-gradient(180deg, #07111f 0%, #0f172a 46%, #111827 100%);
}
.bg-effects { position: fixed; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.voice-page.dark-mode .bg-effects::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(90deg, transparent 0 24rpx, rgba(56, 189, 248, 0.035) 24rpx 26rpx),
    linear-gradient(rgba(148, 163, 184, 0.035) 1rpx, transparent 1rpx);
  background-size: 100% 100%, 64rpx 64rpx;
  -webkit-mask-image: radial-gradient(circle at 50% 22%, rgba(0,0,0,0.58), transparent 66%);
  mask-image: radial-gradient(circle at 50% 22%, rgba(0,0,0,0.58), transparent 66%);
}
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.08; transition: all 0.3s; }
.voice-page:not(.dark-mode) .bg-circle { background: #10b981; }
.voice-page.dark-mode .bg-circle { opacity: 0.18; filter: blur(10rpx); }
.voice-page.dark-mode .c1 { background: rgba(56, 189, 248, 0.48); }
.voice-page.dark-mode .c2 { background: rgba(16, 185, 129, 0.36); }
.voice-page.dark-mode .c3 { background: rgba(168, 85, 247, 0.28); }
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
