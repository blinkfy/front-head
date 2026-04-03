<template>
  <view :class="['theme-wrapper', currentTheme === 'light' ? 'light-theme' : 'dark-theme']">
    <main class="wrap">
      <section class="topbar">
        <div>
          <div class="title">AI 服务设置</div>
          <div class="sub">管理员可控制 AI 服务开关、识别模式（YOLO/AI）和模型参数。</div>
        </div>
        <div class="btns">
          <button class="btn" @click="goBack" type="button">返回</button>
          <button class="btn blue" @click="loadSettings" :disabled="loading" type="button">重新读取</button>
        </div>
      </section>

      <section class="card">
        <div class="card-h">
          <span>运行参数</span>
          <span class="status" :class="statusCls">{{ statusText }}</span>
        </div>
        <div class="card-b">

          <!-- AI 服务开关 -->
          <div class="row">
            <div>
              <div class="label">LLM 服务开关</div>
              <div class="desc">关闭后将禁用 AI 识别增强及 AI 对话流式接口。</div>
            </div>
            <view class="switch-row">
              <switch :checked="form.aiEnabled" @change="form.aiEnabled = $event.detail.value" color="#17b27a" />
              <text class="switch-label">{{ form.aiEnabled ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- 识别模式 -->
          <div class="row">
            <div>
              <div class="label">识别模式</div>
              <div class="desc">yolo 优先本地 YOLO；ai 直接使用大模型图像识别。</div>
            </div>
            <picker :range="detectorModeOptions" :range-key="'label'" :value="detectorModeIndex" @change="onDetectorModeChange" class="picker-wrap">
              <view class="picker-display">{{ detectorModeOptions[detectorModeIndex].label }}</view>
            </picker>
          </div>

          <!-- 模型名 -->
          <div class="row">
            <div>
              <div class="label">模型名</div>
              <div class="desc">例如：qwen3-vl-flash。</div>
            </div>
            <input class="input" type="text" :value="form.model" @input="form.model = $event.detail.value" placeholder="qwen3-vl-flash" />
          </div>

          <!-- 推荐算法 -->
          <div class="row">
            <div>
              <div class="label">商城推荐算法</div>
              <div class="desc">切换默认推荐引擎：千问（qwen）或 deep（深度学习）。</div>
            </div>
            <picker :range="recommendOptions" :range-key="'label'" :value="recommendIndex" @change="onRecommendChange" class="picker-wrap">
              <view class="picker-display">{{ recommendOptions[recommendIndex].label }}</view>
            </picker>
          </div>

          <!-- 3D 定位 -->
          <div class="row">
            <div>
              <div class="label">3D 定位</div>
              <div class="desc">在识别结果中返回相对三维位置。</div>
            </div>
            <view class="switch-row">
              <switch :checked="form.include3d" @change="form.include3d = $event.detail.value" color="#17b27a" />
              <text class="switch-label">{{ form.include3d ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- Thinking 模式 -->
          <div class="row">
            <div>
              <div class="label">Thinking 模式</div>
              <div class="desc">开启后模型可能更慢，但推理更充分。</div>
            </div>
            <view class="switch-row">
              <switch :checked="form.enableThinking" @change="form.enableThinking = $event.detail.value" color="#17b27a" />
              <text class="switch-label">{{ form.enableThinking ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <!-- Thinking 预算 -->
          <div class="row">
            <div>
              <div class="label">Thinking 预算</div>
              <div class="desc">范围 256 - 81920。</div>
            </div>
            <input class="input" type="number" :value="form.thinkingBudget" @input="form.thinkingBudget = Number($event.detail.value) || 4096" />
          </div>

          <!-- 变废为宝效果图 -->
          <div class="row">
            <div>
              <div class="label">变废为宝效果图</div>
              <div class="desc">开启后，识别结果将生成效果图。</div>
            </div>
            <view class="switch-row">
              <switch :checked="form.enableUpcyclingImage" @change="form.enableUpcyclingImage = $event.detail.value" color="#17b27a" />
              <text class="switch-label">{{ form.enableUpcyclingImage ? '启用' : '关闭' }}</text>
            </view>
          </div>

          <div class="btns">
            <button class="btn primary" @click="saveSettings" :disabled="loading" type="button">保存设置</button>
            <button class="btn warn" @click="resetForm" type="button">恢复页面默认</button>
          </div>
          <div class="status" :class="statusCls">{{ statusText }}</div>
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
  { label: 'deep（深度学习）', value: 'deep' }
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
  return value === 'deep' ? 'deep' : 'qwen'
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
.theme-wrapper {
  --bg: #0f1824;
  --card: #121f2d;
  --line: #355068;
  --text: #d5e4f1;
  --muted: #9bb1c3;
  --green: #17b27a;
  --blue: #4b84f4;
  --warn: #ef6b6b;
  min-height: 100vh;
  background:
    radial-gradient(1000px 500px at 80% -5%, rgba(75, 132, 244, 0.16), transparent 58%),
    radial-gradient(900px 460px at -15% 20%, rgba(23, 178, 122, 0.14), transparent 56%),
    linear-gradient(160deg, #0f1824, #101c2a);
  color: var(--text);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 24px;
}

.theme-wrapper.light-theme {
  --bg: #f4fbf7;
  --card: #ffffff;
  --line: #dcebe1;
  --text: #15232d;
  --muted: #64808f;
  --green: #0ea56b;
  --blue: #2d66ea;
  --warn: #d94848;
  background:
    radial-gradient(1000px 500px at 80% -5%, rgba(45, 102, 234, 0.14), transparent 58%),
    radial-gradient(900px 460px at -15% 20%, rgba(14, 165, 107, 0.16), transparent 56%),
    linear-gradient(160deg, #f7fff9, #edf7ff);
}

/* #ifdef H5 */
* { box-sizing: border-box; }
/* #endif */
/* #ifndef H5 */
page, view, text, scroll-view, swiper, button, form, input, textarea, label, navigator, image, div, span, p, h1, h2, h3, h4, h5, h6, ul, li, article, section, nav, main, header, footer {
  box-sizing: border-box;
}
/* #endif */

.wrap {
  width: min(900px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 14px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

.card {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 38px rgba(21, 35, 45, 0.08);
  border-radius: 16px;
  backdrop-filter: blur(8px);
  overflow: hidden;
}

.theme-wrapper.dark-theme .card {
  background: rgba(18, 31, 45, 0.86);
  border: 1px solid rgba(67, 95, 120, 0.42);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.36);
}

.card-h {
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.card-b {
  padding: 16px 18px;
  display: grid;
  gap: 14px;
}

.row {
  display: grid;
  grid-template-columns: 180px 1fr;
  align-items: center;
  gap: 10px;
  min-height: 40px;
}

.row .label {
  font-size: 14px;
  font-weight: 600;
}

.desc {
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
}

.input,
.select {
  display: block;
  width: 100%;
  height: 40px;
  line-height: 40px;
  border: 1px solid #cfe0eb;
  border-radius: 10px;
  padding: 0 11px;
  font-size: 14px;
  background: #fcfeff;
  outline: none;
  color: var(--text);
  box-sizing: border-box;
}

.theme-wrapper.dark-theme .input,
.theme-wrapper.dark-theme .select {
  border: 1px solid #3c5d78;
  background: #132435;
  color: #d5e4f1;
}

.input:focus,
.select:focus {
  border-color: #87b5ff;
  box-shadow: 0 0 0 3px rgba(79, 136, 241, 0.13);
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.switch input {
  width: 18px;
  height: 18px;
  accent-color: var(--green);
}

.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  border: 0;
  border-radius: 10px;
  padding: 10px 13px;
  font-size: 13px;
  cursor: pointer;
  transition: .2s;
  background: #eef4fb;
  color: #2b4660;
}

.theme-wrapper.dark-theme .btn {
  background: #1b2d3f;
  color: #c2d8ec;
}

.btn:hover { transform: translateY(-1px); }

.btn.primary {
  background: linear-gradient(135deg, var(--green), #25ba7f);
  color: #fff;
  box-shadow: 0 10px 24px rgba(14, 165, 107, 0.25);
}

.btn.blue {
  background: linear-gradient(135deg, var(--blue), #4f84f4);
  color: #fff;
  box-shadow: 0 10px 24px rgba(45, 102, 234, 0.24);
}

.btn.warn {
  background: linear-gradient(135deg, #cf3e3e, #e35d5d);
  color: #fff;
  box-shadow: 0 10px 24px rgba(217, 72, 72, 0.24);
}

.status {
  font-size: 12px;
  color: var(--muted);
  min-height: 16px;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 13px;
  color: var(--muted);
}

.picker-wrap {
  width: 100%;
}

.picker-display {
  width: 100%;
  border: 1px solid #cfe0eb;
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 14px;
  background: #fcfeff;
  color: var(--text);
}

.theme-wrapper.dark-theme .picker-display {
  border: 1px solid #3c5d78;
  background: #132435;
  color: #d5e4f1;
}

.status.ok { color: #198754; }
.status.err { color: var(--warn); }

@media (max-width: 760px) {
  .theme-wrapper { padding: 14px; }
  .row { grid-template-columns: 1fr; }
}
</style>
