<template>
  <view :class="['theme-wrapper', currentTheme === 'light' ? 'light-theme' : 'dark-theme']">
    <main class="wrap">

      <!-- 顶部导航栏 -->
      <section class="topbar">
        <div class="topbar-title-group">
          <view class="page-badge">Admin</view>
          <div class="title">AI 服务设置</div>
          <div class="sub">管理员可控制 AI 服务开关、识别模式（YOLO/AI）和模型参数</div>
        </div>
        <div class="topbar-actions">
          <button class="btn icon-btn" @click="goBack" type="button">
            <text class="btn-icon">‹</text> 返回
          </button>
          <button class="btn btn-refresh" @click="loadSettings" :disabled="loading" type="button">
            <text class="btn-icon" :class="{ spinning: loading }">↻</text> 读取
          </button>
          <button class="btn btn-chat" @click="goToAiChat" type="button">AI 聊天</button>
          <button class="btn btn-test" @click="goToTest" type="button">Test</button>
          <button class="btn btn-map" @click="goToTestMap" type="button">Test Map</button>
        </div>
      </section>

      <!-- 状态横幅 -->
      <view v-if="statusText" class="status-banner" :class="statusCls">
        <text class="status-icon">{{ statusCls === 'ok' ? '✓' : statusCls === 'err' ? '✕' : 'ℹ' }}</text>
        <text>{{ statusText }}</text>
      </view>

      <!-- 设置表单卡片 -->
      <section class="card">
        <div class="card-h">
          <view class="card-h-left">
            <text class="card-icon">⚙</text>
            <span>运行参数</span>
          </view>
          <view class="ai-badge" :class="form.aiEnabled ? 'badge-on' : 'badge-off'">
            {{ form.aiEnabled ? 'AI 运行中' : 'AI 已关闭' }}
          </view>
        </div>
        <div class="card-b">

          <!-- AI 服务开关 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">LLM 服务开关</div>
                <div class="desc">关闭后将禁用 AI 识别增强及 AI 对话流式接口</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.aiEnabled" @change="form.aiEnabled = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.aiEnabled ? 'sw-on' : 'sw-off'">{{ form.aiEnabled ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <view class="divider"></view>

          <!-- 识别模式 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-blue"></view>
              <div>
                <div class="label">识别模式</div>
                <div class="desc">yolo 优先本地 YOLO；ai 直接使用大模型图像识别</div>
              </div>
            </div>
            <picker :range="detectorModeOptions" :range-key="'label'" :value="detectorModeIndex" @change="onDetectorModeChange" class="picker-wrap">
              <view class="picker-display">
                <text>{{ detectorModeOptions[detectorModeIndex].label }}</text>
                <text class="picker-arrow">⌄</text>
              </view>
            </picker>
          </div>

          <!-- 模型名 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">模型名</div>
                <div class="desc">例如：qwen3-vl-flash</div>
              </div>
            </div>
            <input class="input" type="text" :value="form.model" @input="form.model = $event.detail.value" placeholder="qwen3-vl-flash" />
          </div>

          <!-- 推荐算法 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-orange"></view>
              <div>
                <div class="label">商城推荐算法</div>
                <div class="desc">切换默认推荐引擎：千问（qwen）或 deep（深度学习）</div>
              </div>
            </div>
            <picker :range="recommendOptions" :range-key="'label'" :value="recommendIndex" @change="onRecommendChange" class="picker-wrap">
              <view class="picker-display">
                <text>{{ recommendOptions[recommendIndex].label }}</text>
                <text class="picker-arrow">⌄</text>
              </view>
            </picker>
          </div>

          <view class="divider"></view>

          <!-- 3D 定位 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-cyan"></view>
              <div>
                <div class="label">3D 定位</div>
                <div class="desc">在识别结果中返回相对三维位置</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.include3d" @change="form.include3d = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.include3d ? 'sw-on' : 'sw-off'">{{ form.include3d ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- Thinking 模式 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">Thinking 模式</div>
                <div class="desc">开启后模型可能更慢，但推理更充分</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.enableThinking" @change="form.enableThinking = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.enableThinking ? 'sw-on' : 'sw-off'">{{ form.enableThinking ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- Thinking 预算 -->
          <div class="row" :class="{ 'row-muted': !form.enableThinking }">
            <div class="row-label-group">
              <view class="row-dot dot-purple"></view>
              <div>
                <div class="label">Thinking 预算 <text class="badge-range">256 – 81920</text></div>
                <div class="desc">仅在 Thinking 模式开启时生效</div>
              </div>
            </div>
            <input class="input" type="number" :value="form.thinkingBudget"
              @input="form.thinkingBudget = Number($event.detail.value) || 4096"
              :disabled="!form.enableThinking" />
          </div>

          <view class="divider"></view>

          <!-- 变废为宝效果图 -->
          <div class="row">
            <div class="row-label-group">
              <view class="row-dot dot-green"></view>
              <div>
                <div class="label">变废为宝效果图</div>
                <div class="desc">开启后，识别结果将生成效果图</div>
              </div>
            </div>
            <view class="switch-row">
              <switch :checked="form.enableUpcyclingImage" @change="form.enableUpcyclingImage = $event.detail.value" color="#17b27a" />
              <text class="switch-label" :class="form.enableUpcyclingImage ? 'sw-on' : 'sw-off'">{{ form.enableUpcyclingImage ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- 操作区 -->
          <div class="action-bar">
            <button class="btn btn-save" @click="saveSettings" :disabled="loading" type="button">
              {{ loading ? '保存中…' : '✓ 保存设置' }}
            </button>
            <button class="btn btn-reset" @click="resetForm" type="button">↩ 恢复默认</button>
          </div>

        </div>
      </section>

    </main>
  </view>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, computed } from 'vue'
import { applyStoredTheme, bindThemeStorageSync } from '@/utils/theme'
import { userinfo } from '@/api/user'
import { baseUrl } from '@/api/settings'

let unbindThemeWatcher = null

const currentTheme = ref('light')
const loading = ref(false)
const statusText = ref('')
const statusCls = ref('')

const DEFAULT_FORM = {
  aiEnabled: true,
  detectorMode: 'yolo',
  model: 'qwen3-vl-flash',
  recommendAlgorithm: 'qwen',
  include3d: true,
  enableThinking: false,
  thinkingBudget: 4096,
  enableUpcyclingImage: true
}

const form = reactive({ ...DEFAULT_FORM })

// picker 选项配置
const detectorModeOptions = [
  { label: 'yolo（默认）', value: 'yolo' },
  { label: 'ai（Qwen）', value: 'ai' }
]
const recommendOptions = [
  { label: 'qwen（千问）', value: 'qwen' },
  { label: 'deep（深度学习）', value: 'deep' },
  { label: 'deepseek', value: 'deepseek' }
]

const detectorModeIndex = computed(() => {
  const idx = detectorModeOptions.findIndex(o => o.value === form.detectorMode)
  return idx >= 0 ? idx : 0
})
const recommendIndex = computed(() => {
  const idx = recommendOptions.findIndex(o => o.value === form.recommendAlgorithm)
  return idx >= 0 ? idx : 0
})

function onDetectorModeChange(e) {
  form.detectorMode = detectorModeOptions[e.detail.value].value
}
function onRecommendChange(e) {
  form.recommendAlgorithm = recommendOptions[e.detail.value].value
}

function getStorage(key) {
  const result = uni.getStorageSync(key)
  return result || null
}

function setStatus(text, type) {
  statusText.value = text || ''
  statusCls.value = type || ''
}

function normalizeRecommendAlgorithm(input) {
  const value = String(input || '').trim().toLowerCase()
  if (value === 'deep' || value === 'deepseek') return value
  return 'qwen'
}

function applyData(data) {
  form.aiEnabled = !!data.aiEnabled
  form.detectorMode = data.detectorMode === 'ai' ? 'ai' : 'yolo'
  form.model = data.model || 'qwen3-vl-flash'
  form.recommendAlgorithm = normalizeRecommendAlgorithm(
    data.recommendAlgorithm !== undefined ? data.recommendAlgorithm : data.recommendAlgo
  )
  form.include3d = !!data.include3d
  form.enableThinking = !!data.enableThinking
  form.thinkingBudget = Number(data.thinkingBudget || 4096)
  form.enableUpcyclingImage = !!data.enableUpcyclingImage
}

function resetForm() {
  applyData(DEFAULT_FORM)
  setStatus('已重置为页面默认值（尚未保存）')
}

function authHeaders() {
  const token = getStorage('token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = token
  return headers
}

function loadSettings() {
  if (loading.value) return
  loading.value = true
  setStatus('读取中...')
  uni.request({
    url: baseUrl + '/api/admin/ai-settings',
    method: 'GET',
    header: authHeaders(),
    success(res) {
      const json = res.data
      if (!json || json.code !== 0 || !json.data) {
        setStatus('读取失败：' + ((json && json.msg) || ('HTTP ' + res.statusCode)), 'err')
        return
      }
      applyData(json.data)
      setStatus('读取成功', 'ok')
    },
    fail() {
      setStatus('读取失败：网络错误', 'err')
    },
    complete() {
      loading.value = false
    }
  })
}

function saveSettings() {
  if (loading.value) return
  loading.value = true
  setStatus('保存中...')
  const payload = {
    aiEnabled: form.aiEnabled,
    detectorMode: form.detectorMode,
    model: (form.model || '').trim() || 'qwen3-vl-flash',
    recommendAlgorithm: normalizeRecommendAlgorithm(form.recommendAlgorithm),
    include3d: form.include3d,
    enableThinking: form.enableThinking,
    thinkingBudget: Number(form.thinkingBudget || 4096),
    enableUpcyclingImage: form.enableUpcyclingImage
  }
  uni.request({
    url: baseUrl + '/api/admin/ai-settings',
    method: 'PUT',
    header: authHeaders(),
    data: payload,
    success(res) {
      const json = res.data
      if (!json || json.code !== 0 || !json.data) {
        setStatus('保存失败：' + ((json && json.msg) || ('HTTP ' + res.statusCode)), 'err')
        return
      }
      applyData(json.data)
      setStatus('保存成功', 'ok')
    },
    fail() {
      setStatus('保存失败：网络错误', 'err')
    },
    complete() {
      loading.value = false
    }
  })
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else if (currentTheme.value === 'light') {
    uni.reLaunch({ url: '/pages/home/home' })
  } else {
    uni.reLaunch({ url: '/pages-dark/home/home' })
  }
}
function goToAiChat() {
  uni.navigateTo({ url: '/pages-nonTheme/ai-chat' })
}
function goToTest() {
  uni.navigateTo({ url: '/pages-admin/test' })
}
function goToTestMap() {
  uni.navigateTo({ url: '/pages-admin/test-map' })
}
async function adminAuth(){
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.setStorageSync('autoLogin', false)
    uni.navigateTo({ url: '/pages/index/index' })
  }
  const localAdminFlag = uni.getStorageSync('isAdmin')
  if (!localAdminFlag) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    setTimeout(() => {
      goBack()
    }, 1000)
  }
  try {
    const response = await userinfo('false')
    console.log(response)
    if (response && response.data && response.data.isAdmin){
    
    } else {
      // 权限验证失败，清除本地伪造的 isAdmin 标记
      uni.removeStorageSync('isAdmin')
      uni.showToast({ title: '权限已过期或被撤销', icon: 'none' })
      goBack()
    }
  } catch (err) {
    console.error('权限验证失败:', err)
    uni.showToast({ title: '权限验证失败，请重新登录', icon: 'none' })
    setTimeout(() => {
      goBack()
    }, 1000)
  }
}

onMounted(() => {
  currentTheme.value = applyStoredTheme()
  unbindThemeWatcher = bindThemeStorageSync()
  adminAuth()
  loadSettings()
})

onBeforeUnmount(() => {
  if (unbindThemeWatcher) unbindThemeWatcher()
})
</script>

<style scoped>
/* ───── 全局变量 ───── */
.theme-wrapper {
  --bg: #0f1824;
  --card: #121f2d;
  --line: #253d55;
  --text: #d5e4f1;
  --muted: #7a9ab0;
  --green: #17b27a;
  --blue: #4b84f4;
  --purple: #9b73f5;
  --orange: #f5a623;
  --cyan: #29c4d0;
  --warn: #ef6b6b;
  min-height: 100vh;
  background:
    radial-gradient(1000px 500px at 80% -5%, rgba(75, 132, 244, 0.18), transparent 58%),
    radial-gradient(900px 460px at -15% 20%, rgba(23, 178, 122, 0.14), transparent 56%),
    linear-gradient(160deg, #0d1620, #0f1c2c);
  color: var(--text);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 16px;
}

.theme-wrapper.light-theme {
  --bg: #f4fbf7;
  --card: #ffffff;
  --line: #d8eae3;
  --text: #15232d;
  --muted: #5e7d8c;
  --green: #0ea56b;
  --blue: #2d66ea;
  --purple: #7c50e8;
  --orange: #d4830a;
  --cyan: #1aabb8;
  --warn: #d94848;
  background:
    radial-gradient(1000px 500px at 80% -5%, rgba(45, 102, 234, 0.12), transparent 58%),
    radial-gradient(900px 460px at -15% 20%, rgba(14, 165, 107, 0.14), transparent 56%),
    linear-gradient(160deg, #f5fff8, #eaf5ff);
}

/* #ifdef H5 */
* { box-sizing: border-box; }
/* #endif */
/* #ifndef H5 */
page, view, text, scroll-view, swiper, button, form, input, textarea, label, navigator, image {
  box-sizing: border-box;
}
/* #endif */

/* ───── 页面容器 ───── */
.wrap {
  width: min(920px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 12px;
}

/* ───── 顶部栏 ───── */
.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.topbar-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(135deg, var(--blue), var(--purple));
  color: #fff;
  width: fit-content;
  margin-bottom: 2px;
}

.title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.3px;
}

.sub {
  color: var(--muted);
  font-size: 13px;
}

.topbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* ───── 按钮通用 ───── */
.btn {
  border: 0;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
  background: rgba(255,255,255,0.08);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.theme-wrapper.light-theme .btn {
  background: rgba(0,0,0,0.05);
  color: #233a50;
}

.btn:active { transform: scale(0.97); }

.btn-icon {
  font-size: 15px;
  font-weight: 400;
  line-height: 1;
}

.icon-btn { background: rgba(255,255,255,0.06); }

.btn-refresh {
  background: linear-gradient(135deg, #1a3a6a, #2354a8);
  color: #fff;
}
.theme-wrapper.light-theme .btn-refresh {
  background: linear-gradient(135deg, var(--blue), #5591ff);
}

.btn-chat {
  background: rgba(151, 115, 245, 0.18);
  color: var(--purple);
  border: 1px solid rgba(151,115,245,0.3);
}
.theme-wrapper.light-theme .btn-chat {
  background: rgba(124, 80, 232, 0.1);
  border-color: rgba(124,80,232,0.25);
}

.btn-test {
  background: rgba(245, 166, 35, 0.15);
  color: var(--orange);
  border: 1px solid rgba(245,166,35,0.28);
}
.theme-wrapper.light-theme .btn-test {
  background: rgba(212, 131, 10, 0.1);
  border-color: rgba(212,131,10,0.25);
}

.btn-map {
  background: rgba(41, 196, 208, 0.15);
  color: var(--cyan);
  border: 1px solid rgba(41,196,208,0.28);
}
.theme-wrapper.light-theme .btn-map {
  background: rgba(26, 171, 184, 0.1);
  border-color: rgba(26,171,184,0.25);
}

.btn-save {
  background: linear-gradient(135deg, var(--green), #1bcf8e);
  color: #fff;
  box-shadow: 0 6px 20px rgba(23,178,122,0.35);
  padding: 11px 22px;
  font-size: 14px;
}

.btn-reset {
  background: rgba(239,107,107,0.12);
  color: var(--warn);
  border: 1px solid rgba(239,107,107,0.25);
  padding: 11px 18px;
}
.theme-wrapper.light-theme .btn-reset {
  background: rgba(217,72,72,0.08);
  border-color: rgba(217,72,72,0.2);
}

/* ───── 状态横幅 ───── */
.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--muted);
  transition: .3s;
}
.theme-wrapper.light-theme .status-banner {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.08);
}
.status-banner.ok {
  background: rgba(23,178,122,0.12);
  border-color: rgba(23,178,122,0.3);
  color: var(--green);
}
.status-banner.err {
  background: rgba(239,107,107,0.12);
  border-color: rgba(239,107,107,0.3);
  color: var(--warn);
}
.status-icon { font-size: 15px; }

/* ───── 卡片 ───── */
.card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 16px 40px rgba(0,0,0,0.3);
  border-radius: 18px;
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.theme-wrapper.light-theme .card {
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(200,220,235,0.8);
  box-shadow: 0 8px 32px rgba(21,35,45,0.08);
}

.card-h {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  font-weight: 700;
  font-size: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.03);
}
.theme-wrapper.light-theme .card-h {
  background: rgba(0,0,0,0.02);
}

.card-h-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-icon { font-size: 17px; }

/* AI 状态徽章 */
.ai-badge {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-on {
  background: rgba(23,178,122,0.18);
  color: var(--green);
  border: 1px solid rgba(23,178,122,0.35);
}
.badge-off {
  background: rgba(239,107,107,0.12);
  color: var(--warn);
  border: 1px solid rgba(239,107,107,0.3);
}

.card-b {
  padding: 10px 20px 14px;
  display: grid;
  gap: 0;
}

/* ───── 行 ───── */
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  min-height: 44px;
  transition: opacity .2s;
}

.row-muted { opacity: 0.45; pointer-events: none; }

.row-label-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.row-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.dot-green  { background: var(--green);  box-shadow: 0 0 6px var(--green); }
.dot-blue   { background: var(--blue);   box-shadow: 0 0 6px var(--blue); }
.dot-purple { background: var(--purple); box-shadow: 0 0 6px var(--purple); }
.dot-orange { background: var(--orange); box-shadow: 0 0 6px var(--orange); }
.dot-cyan   { background: var(--cyan);   box-shadow: 0 0 6px var(--cyan); }

.label {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 7px;
}

.badge-range {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255,255,255,0.08);
  color: var(--muted);
}
.theme-wrapper.light-theme .badge-range {
  background: rgba(0,0,0,0.06);
}

.desc {
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
  line-height: 1.5;
}

.divider {
  height: 1px;
  background: var(--line);
  opacity: 0.5;
  margin: 1px 0;
}

/* ───── Switch ───── */
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 12px;
  font-weight: 600;
  min-width: 28px;
  text-align: right;
}
.sw-on  { color: var(--green); }
.sw-off { color: var(--muted); }

/* ───── Input ───── */
.input {
  display: block;
  width: 200px;
  height: 38px;
  line-height: 38px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  background: rgba(255,255,255,0.06);
  outline: none;
  color: var(--text);
}

.theme-wrapper.light-theme .input {
  border: 1px solid #c8dce8;
  background: #f7fbfe;
  color: var(--text);
}

/* ───── Picker ───── */
.picker-wrap { width: 200px; }

.picker-display {
  width: 100%;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  background: rgba(255,255,255,0.06);
  color: var(--text);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.theme-wrapper.light-theme .picker-display {
  border: 1px solid #c8dce8;
  background: #f7fbfe;
}

.picker-arrow {
  color: var(--muted);
  font-size: 16px;
}

/* ───── 操作区 ───── */
.action-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--line);
}

/* ───── 响应式 ───── */
@media (max-width: 760px) {
  .theme-wrapper { padding: 10px; }

  /* topbar：标题行 + 按钮行，两行布局 */
  .topbar { flex-direction: column; align-items: flex-start; gap: 8px; }
  .topbar-title-group { gap: 2px; }
  .title { font-size: 18px; }
  .sub { display: none; }
  .page-badge { display: none; }
  .topbar-actions { gap: 6px; flex-wrap: nowrap; width: 100%; overflow-x: auto; }
  .btn { padding: 7px 10px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }

  /* 行：保持横向，标签左控件右；隐藏 desc */
  .row { padding: 7px 0; min-height: 36px; gap: 8px; }
  .desc { display: none; }
  .row-dot { margin-top: 4px; }
  .label { font-size: 13px; }

  /* 控件宽度适配 */
  .input { width: 130px; height: 34px; font-size: 13px; }
  .picker-wrap { width: 130px; }
  .picker-display { padding: 7px 10px; font-size: 12px; }

  /* 卡片内边距 */
  .card-b { padding: 8px 14px 10px; }
  .card-h { padding: 10px 14px; font-size: 14px; }

  .wrap { gap: 8px; }
  .action-bar { padding-top: 6px; }
  .btn-save, .btn-reset { padding: 9px 14px; font-size: 13px; }
}
</style>
