<template>
  <view class="home-bg" :class="[tabPageClass, { 'waste-guide-open': showGuideModal, 'onboarding-demo-reading': showAppOnboarding && onboardingDemoFinished }]">
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
    <view :animation="tabPageAnimation" class="home-container tab-page-motion">
      <!-- 顶部标题区域 -->
      <view class="header-section">
        <view class="main-title">
          <image class="title-icon" :src="getManifestIconPath('colorful_bin')" mode="aspectFill"></image>
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
                <ManifestIcon class="connection-icon" id="device_connect" />
                <text class="connection-title">智能设备在线</text>
              </view>
              <text class="connection-desc">{{ connectedDevice?.device_name || '环保分类设备' }}</text>
            </view>
          </view>
          <view class="connection-action">
            <ManifestIcon class="action-icon" id="settings" />
            <text class="action-text">管理</text>
          </view>
        </view>
        <view class="connection-scan-line"></view>
      </view>
      
      <!-- 上传区域 -->
      <view class="upload-section" :class="{ 'robot-returning-card': robotEntryReturning || robotAtEntry || robotEntryFlying }">
        
        <view class="upload-container onboarding-target-scan" @click="!isProcessing && onAddImage()" :class="{ 'processing': isProcessing, 'recognition-failed': failedPreviewPending }">
          <view class="upload-border">
            <view class="upload-inner">
              <SmartSortRecognitionVisual ref="recognitionVisual" entry-from=".smart-sort-entry-source" :show-robot="classificationUi === 'recognizing' || robotFeedbackActive || robotAtEntry || failedPreviewPending" :retain-failure="failedPreviewPending" return-to=".smart-sort-return-target" variant="dark" :state="robotState" :active="robotPageActive" :overlay-active="showAppOnboarding" @entering="robotEntryFlying = true" @entered="robotEntryFlying = false" @returning="onRobotReturning" @settled="onRobotFeedbackSettled">
                <view class="upload-icon">
                  <ManifestIcon v-if="!isProcessing" id="camera_scan" />
                  <view v-else class="loading-spinner">
                    <view class="spinner"></view>
                  </view>
                </view>
              </SmartSortRecognitionVisual>
              <text class="upload-text" v-if="!isProcessing">{{ failedPreviewPending ? failureCopy.title : robotFeedbackActive && robotState === 'success' ? '认出来啦，看看结果' : '点击上传图片' }}</text>
              <text class="upload-text processing" v-else>正在识别图片</text>
              <text class="upload-hint" v-if="!isProcessing">{{ failedPreviewPending ? failureCopy.description : robotFeedbackActive && robotState === 'success' ? '分类结果已在下方展示' : '支持JPG、PNG格式，自动压缩优化' }}</text>
              <text class="upload-hint processing" v-else>{{ processStatus }}</text>
              <view v-if="isProcessing" class="recognition-wait-actions" @click.stop>
                <text>已等待 {{ elapsedSeconds }} 秒</text>
                <text v-if="elapsedSeconds >= 8">{{ robotState === 'reviewing' ? '我正在整理建议，请稍候' : '我还在仔细看，请稍候' }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
      
      <OnboardingRecognitionDemo
        ref="onboardingDemoRef"
        :focus-inset="onboardingFocusInset"
        v-if="showAppOnboarding && onboardingDemoStage !== 'idle'"
        :stage="onboardingDemoStage"
        :ai-enabled="aiServiceEnabled"
        @tail-space="updateOnboardingTailSpace"
        :dark="true"
        :active="robotPageActive"
      />

      <!-- 识别结果区域 -->
      <view v-if="resultImage && !onboardingDemoVisible" class="result-section">
        <view class="result-card" :aria-busy="isProcessing">
          <view v-if="!failedPreviewPending && (classificationUi !== 'recognizing' || recognitionPreview)" class="result-header">
              <view class="result-title"><ManifestIcon id="accuracy_target" /> 识别结果</view>
            <view v-if="!isProcessing" class="confidence-badge">
              <text class="confidence-text">{{ resultConfidence }}</text>
            </view>
          </view>
          
          <view class="result-image-wrap" :class="{ 'recognition-photo-active': isProcessing }">
            <image :key="bboxImage.key" :data-bbox-key="bboxImage.key" :src="bboxImage.src" class="result-image" mode="aspectFit" @load="bboxImage.onLoad" @error="bboxImage.onError" />
            <view v-if="isProcessing" class="recognition-photo-scan"></view>
            <view v-if="classificationUi !== 'recognizing' && !failedPreviewPending && displayBboxes.length" class="recognition-bbox-layer">
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

          <view v-if="!isProcessing && retryImagePath && failedPreviewPending" class="recognition-retry-actions">
            <text>这张图片暂时没能识别，可直接重试</text>
            <button @click="retryLastImage">重试这张图片</button>
            <button @click="onAddImage">重新选图</button>
          </view>
          
          <view v-if="!failedPreviewPending && (classificationUi !== 'recognizing' || recognitionPreview)" class="result-details">
            <text class="recognition-preview-caption" role="status">{{ isProcessing ? '识别分析中 · 内容可能继续更新' : '识别完成' }}</text>
            <view v-if="displayResultCategory" class="category-row">
              <view :class="['category-display', getCategoryClass(displayResultCategory)]">
            <ManifestIcon class="category-icon" :id="getCategoryIcon(displayResultCategory)" />
              <view class="category-info">
                <text class="category-label">分类结果</text>
                <text class="category-name">{{ displayResultCategory }}</text>
              </view>
            </view>
            
              <view class="ai-helper-btn" v-if="!isProcessing && aiServiceEnabled && aiEnabled" @click="goAiChatFromResult">AI对话</view>
            </view>

            <view v-if="displayRecognizedItems.length" class="recognized-items-box">
              <text class="recognized-items-title">识别到的具体物品</text>
              <view class="recognized-items-list">
                <text
                  v-for="(item, index) in displayRecognizedItems"
                  :key="`recognized-${index}`"
                  class="recognized-item-chip"
                >{{ item }}</text>
              </view>
            </view>

            <NearbyDisposalCard
              v-if="resultImage && !onboardingDemoVisible && classificationUi !== 'recognizing' && !isProcessing && !failedPreviewPending && resultCategory && resultCategory !== '未识别到' && nearbyPoints.length"
              :point="nearbyPoints[0]"
              :dark="true"
              @open="goNearbyDisposal"
            />

            <view v-if="displayAdviceSections.length" class="upcycling-plan">
              <view
                v-for="(section, index) in displayAdviceSections"
                :key="section.renderKey"
                :class="['upcycling-plan-item', { 'is-warning': /提醒|风险|注意/.test(section.title) }]"
              >
                <text class="upcycling-plan-title">{{ section.title }}</text>
                <view class="upcycling-plan-content" v-html="formatSemicolonNewline(section.content)"></view>
              </view>
            </view>

            <!-- 变废为宝效果图 -->
              <view v-if="!isProcessing && aiServiceEnabled && aiEnabledUpcyclingImage && (upcyclingImageUrl || upcyclingTaskId)" class="upcycling-image-card">
              <view class="upcycling-image-header">
                <text class="upcycling-image-title">变废为宝效果图</text>
              </view>
              <view class="upcycling-image-wrapper">
                <image
                  v-if="upcyclingImageUrl"
                  :src="upcyclingImageUrl"
                  mode="aspectFit"
                  class="upcycling-image recognition-image-enter"
                  @load="onUpcyclingImageLoaded"
                  @click="previewUpcyclingImage"
                />
                <view v-if="!upcyclingImageUrl && upcyclingTaskId" class="upcycling-image-loading">
                  <view class="upcycling-loading-ring"></view>
                  <text class="upcycling-loading-text">AI 正在生成效果图...</text>
                </view>
              </view>
              <text v-if="upcyclingImageUrl" class="upcycling-image-hint">点击图片可全屏预览</text>
            </view>

            <view v-else-if="!isProcessing && resultDesc" class="description-panel">
              <view class="desc-label"><ManifestIcon id="eco_tip" /> 处理建议</view>
              <view class="desc-content" v-html="formatSemicolonNewline(resultDesc)"></view>
            </view>
          </view>
        </view>
      </view>
      
      <!-- 默认提示区域 -->
      <view v-if="classificationUi === 'initial' && !onboardingDemoVisible && !failedPreviewPending && (!retryImagePath || robotEntryReturning || robotAtEntry)" class="welcome-section">
        <view class="welcome-card" @click="onAddImage">
          <SmartSortRobot3D class="smart-sort-entry-source" v-if="!robotEntryReturning && !robotAtEntry" variant="dark" :state="robotState" :active="robotPageActive" :overlay-active="showAppOnboarding" />
          <view v-else class="smart-sort-return-target smart-sort-entry-source dark"></view>
          <text class="welcome-title">开始智能分类</text>
          <text class="welcome-desc">上传图片，AI将为您识别垃圾类型<br/>共同践行绿色环保理念</text>
        </view>
        
        <!-- 垃圾分类指南卡片 -->
        <view class="guide-cards">
          <view class="guide-card recyclable" @click="showGuideDetail('recyclable')">
            <ManifestIcon class="guide-icon" id="bin_recyclable" />
            <view class="guide-content">
              <text class="guide-title">可回收垃圾</text>
              <text class="guide-desc">塑料、纸类、金属等</text>
            </view>
            <ManifestIcon id="chevron_right" class="guide-arrow" :scale="1" />
          </view>
          
          <view class="guide-card harmful" @click="showGuideDetail('harmful')">
            <ManifestIcon class="guide-icon" id="bin_hazardous" />
            <view class="guide-content">
              <text class="guide-title">有害垃圾</text>
              <text class="guide-desc">电池、药品、化学品</text>
            </view>
            <ManifestIcon id="chevron_right" class="guide-arrow" :scale="1" />
          </view>
          
          <view class="guide-card kitchen" @click="showGuideDetail('kitchen')">
            <ManifestIcon class="guide-icon" id="bin_kitchen" />
            <view class="guide-content">
              <text class="guide-title">厨余垃圾</text>
              <text class="guide-desc">剩菜剩饭、果皮等</text>
            </view>
            <ManifestIcon id="chevron_right" class="guide-arrow" :scale="1" />
          </view>
          
          <view class="guide-card other" @click="showGuideDetail('other')">
            <ManifestIcon class="guide-icon" id="bin_other" />
            <view class="guide-content">
              <text class="guide-title">其他垃圾</text>
              <text class="guide-desc">难以回收的废弃物</text>
            </view>
            <ManifestIcon id="chevron_right" class="guide-arrow" :scale="1" />
          </view>
        </view>
      </view>
        
        <!-- 功能快捷入口 -->
      <view class="welcome-section">
        <view class="quick-actions">
          <view class="quick-actions-header">
            <text class="quick-actions-title">常用服务</text>
            <text class="quick-actions-subtitle">任务、活动与回收工具</text>
          </view>

          <view class="quick-actions-featured">
            <view class="action-item featured challenge-card" @click="goChallenge">
              <view class="action-icon-wrapper challenge">
                <ManifestIcon class="action-icon" id="challenge_trophy" />
              </view>
              <view class="action-copy">
                <text class="action-text">挑战赛</text>
                <text class="action-desc">答题赚积分</text>
              </view>
            </view>

            <view class="action-item featured lottery-card" @click="goLottery">
              <view class="action-icon-wrapper lottery">
                <ManifestIcon class="action-icon" id="lucky_wheel" />
              </view>
              <view class="action-copy">
                <text class="action-text">积分抽奖</text>
                <text class="action-desc">试试今日手气</text>
              </view>
            </view>
          </view>

          <view class="quick-actions-grid" :class="{ 'three-items': !showDeviceScan }">
            <view v-if="showDeviceScan" class="action-item compact onboarding-target-device" @click="scanDeviceQR">
              <view class="action-icon-wrapper device">
                <ManifestIcon class="action-icon" id="device_connect" />
              </view>
              <text class="action-text">连接设备</text>
            </view>

            <view class="action-item compact" @click="goCommunity">
              <view class="action-icon-wrapper community">
                <ManifestIcon class="action-icon" id="community_home" />
              </view>
              <text class="action-text">环保社区</text>
            </view>

            <view class="action-item compact onboarding-target-booking" @click="goBooking">
              <view class="action-icon-wrapper booking">
                <ManifestIcon class="action-icon" id="recycling_booking" :scale="2.2" />
              </view>
              <text class="action-text">预约回收</text>
            </view>

            <view class="action-item compact" @click="goVoiceScan">
              <view class="action-icon-wrapper voice">
                <ManifestIcon class="action-icon" id="voice_recognition" />
              </view>
              <text class="action-text">语音识别</text>
            </view>
          </view>
        </view>
      </view>
      <view v-if="showAppOnboarding && onboardingDemoVisible && onboardingTailSpace > 0" class="onboarding-layout-tail" :style="{ height: `${onboardingTailSpace}px` }" aria-hidden="true"></view>
    </view>
    
    <!-- 自定义分类指南弹窗-->
    <WasteCategoryModal :visible="showGuideModal" :category="currentGuide.type" dark @close="closeGuideModal" />

    <AchievementUnlockModal :visible="showAchievementModal" :items="achievementModalItems" dark @close="closeAchievementModal" />

    <AppOnboarding
      ref="onboardingGuideRef"
      :visible="showAppOnboarding"
      :initial-step="onboardingResumeStep"
      :ai-enabled="aiServiceEnabled"
      :active="robotPageActive"
      :target-rect="onboardingTargetRect"
      :focus-inset="onboardingFocusInset"
      :follow-target="onboardingDemoStage !== 'idle' || onboardingAutoScrolling"
      :include-device="!isH5Platform"
      dark
      @dismiss="completeAppOnboarding"
      @complete="completeAppOnboarding"
      @try-recognition="tryRecognitionFromOnboarding"
      @step-change="handleOnboardingStepChange"
      @demo-stage="handleOnboardingDemoStage"
      @goGuide="navigateTo('/pages-dark/guide/guide')"
    />

    <!-- 科技感底部导航栏 -->
    <view v-if="aiServiceEnabled" class="floating-agent" @click="goAiAssistant">
      <ManifestIcon class="floating-agent-main" id="ai_assistant" :scale="2.2" />
    </view>

    <view class="tabbar">
      <view class="tabbar-item active">
        <ManifestIcon class="tabbar-icon" id="home" />
        <text class="tabbar-label">首页</text>
      </view>
      <view class="tabbar-item onboarding-target-map" @click="goMap">
        <ManifestIcon class="tabbar-icon" id="map_location" />
        <text class="tabbar-label">地图</text>
      </view>
      <view class="tabbar-item onboarding-target-shop" @click="goShop">
        <ManifestIcon class="tabbar-icon" id="store" />
        <text class="tabbar-label">商城</text>
      </view>
      <view class="tabbar-item" @click="goProfile">
        <ManifestIcon class="tabbar-icon" id="user_profile" />
        <text class="tabbar-label">我的</text>
      </view>
    </view>
  </view>
</template>

<script setup>
// #ifdef MP-WEIXIN
import { handleRegistrationQrScan } from '@/utils/registration-relay.mjs'
// #endif
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch, getCurrentInstance } from 'vue'
import { trackOnboardingFocus, queryOnboardingRects, getOnboardingViewport, getOnboardingScrollTop } from '@/utils/onboarding-focus.mjs'
import { onPageScroll, onShow, onHide, onUnload, onResize } from '@dcloudio/uni-app'
import { recognizeImage } from '@/api/recognize'
import { useRecognitionBboxes } from '@/utils/use-recognition-bboxes'
import { getRecognitionCompressionDecision, getRecognitionImageSize, isSmallerRecognitionImage, shouldUseCompressedRecognitionImage } from '@/utils/recognition-image.mjs'
import { baseUrl } from '@/api/settings'
import { useDeviceConnection } from '@/utils/useDeviceConnection'
import { canShowDeviceScanEntry, isPhoneBrowser } from '@/utils/h5-scan-entry.mjs'
import { resolveDeviceScanTarget, saveMockDeviceConnection, getDeviceQrScanContent, scanDeviceQrCode } from '@/utils/device-qr'
import AppOnboarding from '@/components/AppOnboarding.vue'
import OnboardingRecognitionDemo from '@/components/OnboardingRecognitionDemo.vue'
import AchievementUnlockModal from '@/components/AchievementUnlockModal.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import WasteCategoryModal from '@/components/WasteCategoryModal.vue'
import { wasteCategoryGuides } from '@/utils/waste-category-guides'
import SmartSortRobot3D from '@/components/SmartSortRobot3D.vue'
import { playUiSound } from '@/utils/ui-sounds.js'
import { chooseRecognitionImage } from '@/utils/recognition-picker.js'
import { getRecognitionRobotState } from '@/utils/recognition-robot-state.mjs'
import SmartSortRecognitionVisual from '@/components/SmartSortRecognitionVisual.vue'
import NearbyDisposalCard from '@/components/NearbyDisposalCard.vue'
import { useNearbyDisposal } from '@/utils/use-nearby-disposal'
import { getManifestIconPath } from '@/utils/manifest-icons.js'
import { navigateBottomTab, useTabPageTransition } from '@/utils/tab-page-transition.js'
import { enqueueAchievementUnlocks, takeAchievementUnlocks } from '@/utils/achievements'
import {
  buildExpandedUpcyclingText,
  buildSeedFromRecognizeData,
  extractRecognizedItems,
  parseLabelBbox,
  saveSeed,
  splitUpcyclingSections
} from '@/utils/recognition-sync'
import {
  beginRecognitionTask,
  clearRecognitionTask,
  completeRecognitionTask,
  failRecognitionTask,
  getRecognitionTask,
  isRecognitionTaskCurrent,
  subscribeRecognitionTask,
  updateRecognitionTask,
  updateRecognitionPreview
} from '@/utils/recognition-task.mjs'
import { getRecognitionFailureCopy } from '@/utils/recognition-failure-copy.mjs'

const { tabPageClass, tabPageAnimation } = useTabPageTransition('pages-dark/home/home')
const resultImage = ref('')
const resultCategory = ref('')
const resultConfidence = ref('')
const resultDesc = ref('')
const aiEnabled = ref(false)
const aiServiceEnabled = ref(false)
const isProcessing = ref(false)
const recognitionVisual = ref(null)
const robotState = ref('idle')
const classificationUi = ref('initial')
const { nearbyPoints, nearbyOrigin } = useNearbyDisposal(classificationUi)
const robotFeedbackActive = ref(false)
const robotPageActive = ref(true)
const robotEntryReturning = ref(false)
const robotEntryFlying = ref(false)
const robotAtEntry = ref(false)
const failedPreviewPending = ref(false)
const failureCopy = ref(getRecognitionFailureCopy())
const retryImagePath = ref('')
const retryImageFile = ref(null)
const recognitionPreview = ref(null)
const elapsedSeconds = ref(0)

function onRobotReturning() {
  // 保留本次原图以便重试，机器人仍返回入口位置。
  if (failedPreviewPending.value && !retryImagePath.value) {
    resultImage.value = ''
    failedPreviewPending.value = false
  }
  classificationUi.value = 'initial'
  robotEntryReturning.value = true
  robotAtEntry.value = false
  robotState.value = 'idle'
}

function onRobotFeedbackSettled(feedback) {
  robotEntryReturning.value = false
  robotAtEntry.value = !!feedback?.returned
  robotFeedbackActive.value = false
}

watch(robotState, state => {
  if (['uploading', 'processing', 'reviewing', 'success', 'fail'].includes(state)) {
    robotEntryReturning.value = false
    robotAtEntry.value = false
  }
})

const processStatus = ref('处理中...')
const showGuideModal = ref(false)
const currentGuide = ref({})
const recognizedItems = ref([])
const upcyclingSections = ref([])
// Partial snapshots and final data update the same keyed blocks in place.
const displayResultCategory = computed(() => isProcessing.value
  ? String(recognitionPreview.value?.labels?.[0]?.name || '').trim() : resultCategory.value)
const displayRecognizedItems = computed(() => isProcessing.value
  ? extractRecognizedItems(recognitionPreview.value) : recognizedItems.value)
const displayAdviceSections = computed(() => {
  const text = isProcessing.value ? buildExpandedUpcyclingText(recognitionPreview.value) : ''
  const sections = isProcessing.value ? (text ? splitUpcyclingSections(text) : []) : upcyclingSections.value
  const occurrences = Object.create(null)
  return sections.map(section => {
    const occurrence = occurrences[section.title] || 0
    occurrences[section.title] = occurrence + 1
    return { ...section, renderKey: `${section.title}:${occurrence}` }
  })
})
const upcyclingImageUrl = ref('')
let pendingUpcyclingSound = ''
function onUpcyclingImageLoaded() {
  if (!pendingUpcyclingSound) return
  const key = pendingUpcyclingSound
  pendingUpcyclingSound = ''
  if (pageVisible && aiServiceEnabled.value && aiEnabledUpcyclingImage.value) playUiSound('upcyclingComplete', { key, page: 'pages-dark/home/home' })
}
const upcyclingTaskId = ref('')
let upcyclingPollTimer = 0
const imageLoading = ref(false)
const aiEnabledUpcyclingImage = ref(false)
const rawBboxes = ref([])
const recognizeBBoxSpace = ref('')
const { bboxImage, displayBboxes, queueRefreshDisplayBboxes } = useRecognitionBboxes(resultImage, rawBboxes, recognizeBBoxSpace)
onResize(queueRefreshDisplayBboxes)
let activeRecognitionTaskId = ''
let recognitionTaskUnsubscribe = null
let pageVisible = true
// #ifdef MP-WEIXIN
let pendingCameraImage = null
// #endif
let elapsedTimer = null

async function refreshAiServiceState() {
  try {
    const response = await new Promise((resolve, reject) => {
      uni.request({ url: `${baseUrl}/api/ai/settings`, success: resolve, fail: reject })
    })
    const payload = response?.data
    aiServiceEnabled.value = !!(payload?.code === 0 && payload.data?.aiEnabled === true)
  } catch (error) {
    console.warn('[home-dark] check AI settings failed:', error)
    aiServiceEnabled.value = false
  }
}

// 检测是否为 H5 平台
const isH5Platform = ref(false)
const showDeviceScan = ref(canShowDeviceScanEntry())

// 成就解锁弹窗相关
const showAchievementModal = ref(false)
const achievementModalItems = ref([])
const shownAchievementKeys = new Set()
const ONBOARDING_STORAGE_KEY = 'app_onboarding_completed_v1'
const ONBOARDING_FORCE_KEY = 'app_onboarding_force_open'
const showAppOnboarding = ref(false)
const onboardingResumeStep = ref(0)
const onboardingTrialState = ref('idle')
let onboardingTrialTimer = null
const onboardingDemoStage = ref('idle')
const onboardingDemoFinished = computed(() => onboardingDemoStage.value === 'upcycling' || (!aiServiceEnabled.value && onboardingDemoStage.value === 'classified'))
const onboardingDemoVisible = computed(() => !['idle', 'intro'].includes(onboardingDemoStage.value))
const onboardingTargetRect = ref(null)
const onboardingFocusInset = ref(0)
const onboardingDemoRef = ref(null)
const onboardingGuideRef = ref(null)
const onboardingPageScope = getCurrentInstance()?.proxy
const onboardingTailSpace = ref(0)
let onboardingTailRequestId = 0
function updateOnboardingTailSpace(requiredSpace) {
  const requestId = ++onboardingTailRequestId
  if (!showAppOnboarding.value || !onboardingDemoVisible.value || requiredSpace <= 0) {
    onboardingTailSpace.value = 0
    return
  }
  // Services already provide real scrollable content below the example.
  nextTick(() => measureOnboardingTargets(['.quick-actions'], ([services]) => {
    if (requestId !== onboardingTailRequestId || !showAppOnboarding.value || !onboardingDemoVisible.value) return
    onboardingTailSpace.value = Math.max(0, requiredSpace - (services?.height || 0))
  }))
}
let onboardingFocusTracker = null
let onboardingStepRequestId = 0
const pageScrollTop = ref(0)
const onboardingAutoScrolling = ref(false)
let onboardingScrollLockSnapshot = null

// 将遇到英文或中文分号且后面还有内容的地方替换为换行展示
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatSemicolonNewline(text) {
  if (!text) return ''
  // 先在原文中整理换行，再逐行转义，避免破坏 HTML 实体。
  return String(text).replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);|([；;])\s*(?=\S)/gi,
    (match, separator) => separator ? separator + '\n' : match)
    .split(/\r\n?|\n/).map(escapeHtml).join('<br/>')
}

// 使用设备连接状态管理
const { hasConnection, connectedDevice, goToDeviceConnection, checkDeviceConnection, points } = useDeviceConnection()

function maybeShowAppOnboarding() {
  try {
    const forceOpen = uni.getStorageSync(ONBOARDING_FORCE_KEY)
    if (forceOpen) {
      uni.removeStorageSync(ONBOARDING_FORCE_KEY)
    } else if (uni.getStorageSync(ONBOARDING_STORAGE_KEY)) {
      return
    }
    setTimeout(() => {
      showAppOnboarding.value = true
    }, 500)
  } catch (e) {
    showAppOnboarding.value = true
  }
}

function tryRecognitionFromOnboarding() {
  if (isProcessing.value || onboardingTrialState.value !== 'idle') return
  hideAppOnboarding()
  onboardingResumeStep.value = 1
  onboardingTrialState.value = 'picking'
  nextTick(() => {
    if (pageVisible && !isProcessing.value) onAddImage()
    else onboardingTrialState.value = 'cancelled'
  })
}

// A trial pauses the tour; only dismissing or finishing the remaining steps completes it.
watch([isProcessing, robotPageActive, onboardingTrialState], ([processing, active, state]) => {
  clearTimeout(onboardingTrialTimer)
  onboardingTrialTimer = null
  if (state === 'idle') return
  if (processing) {
    if (state === 'picking') onboardingTrialState.value = 'recognizing'
    return
  }
  if (state === 'recognizing') {
    onboardingTrialState.value = 'finished'
    return
  }
  if (!active || !['finished', 'cancelled'].includes(state)) return
  onboardingTrialTimer = setTimeout(() => {
    onboardingTrialTimer = null
    if (!pageVisible || isProcessing.value || onboardingTrialState.value !== state) return
    if (state === 'cancelled') onboardingResumeStep.value = 0
    onboardingTrialState.value = 'idle'
    showAppOnboarding.value = true
  }, state === 'finished' ? 1800 : 0)
})

function completeAppOnboarding() {
  clearTimeout(onboardingTrialTimer)
  onboardingTrialState.value = 'idle'
  hideAppOnboarding()
  try {
    uni.setStorageSync(ONBOARDING_STORAGE_KEY, true)
  } catch (e) {}
}

function hideAppOnboarding() {
  onboardingFocusTracker?.stop()
  onboardingFocusTracker = null
  onboardingStepRequestId++
  onboardingAutoScrolling.value = false
  onboardingDemoStage.value = 'idle'
  showAppOnboarding.value = false
  onboardingTargetRect.value = null
}

function setOnboardingScrollLock(locked) {
  if (isH5Platform.value) return
  if (typeof document === 'undefined') return
  const html = document.documentElement
  const body = document.body
  if (!html || !body) return

  if (locked) {
    if (!onboardingScrollLockSnapshot) {
      onboardingScrollLockSnapshot = {
        htmlOverflow: html.style.overflow,
        htmlHeight: html.style.height,
        bodyOverflow: body.style.overflow,
        bodyHeight: body.style.height
      }
    }
    html.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.overflow = 'hidden'
    body.style.height = '100%'
    return
  }

  if (!onboardingScrollLockSnapshot) return
  html.style.overflow = onboardingScrollLockSnapshot.htmlOverflow || ''
  html.style.height = onboardingScrollLockSnapshot.htmlHeight || ''
  body.style.overflow = onboardingScrollLockSnapshot.bodyOverflow || ''
  body.style.height = onboardingScrollLockSnapshot.bodyHeight || ''
  onboardingScrollLockSnapshot = null
}

function handleOnboardingDemoStage(stage) {
  if (onboardingAutoScrolling.value) {
    // Stop an in-flight scroll before exiting, hiding, or replaying the demo.
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' })
      } else {
        uni.pageScrollTo({ scrollTop: pageScrollTop.value, duration: 0, fail: () => {} })
      }
    } catch (_) {}
  }
  onboardingDemoStage.value = stage
  if (stage === 'idle' || stage === 'exiting' || !showAppOnboarding.value || !robotPageActive.value) {
    onboardingStepRequestId++
    onboardingFocusTracker?.stop()
    onboardingFocusTracker = null
    onboardingAutoScrolling.value = false
    return
  }
  const selector = {
    intro: '.onboarding-target-scan',
    scan: '.onboarding-demo-photo',
    classified: '.onboarding-demo-summary',
    advice: '.onboarding-demo-advice',
    upcycling: '.onboarding-demo-upcycling'
  }[stage]
  if (!selector) return
  nextTick(() => {
    if (onboardingDemoStage.value !== stage || !showAppOnboarding.value || !robotPageActive.value) return
    handleOnboardingStepChange({ selector, shouldScroll: true })
  })
}

function measureOnboardingTargets(selectors, callback) {
  queryOnboardingRects({
    pageScope: onboardingPageScope,
    demoComponent: onboardingDemoRef.value,
    guideComponent: onboardingGuideRef.value
  }, selectors, callback)
}

function handleOnboardingStepChange(step) {
  if (!step || !step.selector || !showAppOnboarding.value || !robotPageActive.value) return
  const requestId = ++onboardingStepRequestId

  onboardingFocusTracker?.stop()
  onboardingAutoScrolling.value = !!step.shouldScroll
  let firstScrollPending = !!step.shouldScroll
  let requestedScrollTop = null
  const currentScrollTop = () => typeof window !== 'undefined' && typeof document !== 'undefined' ? window.scrollY : pageScrollTop.value
  const applyScroll = (rect, scrollTop) => {
    if (requestId !== onboardingStepRequestId || !showAppOnboarding.value || !robotPageActive.value) return
    const viewport = getOnboardingViewport()
    let targetTop = getOnboardingScrollTop(rect, scrollTop, viewport, onboardingFocusInset.value, step.selector.startsWith('.onboarding-demo-'))
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const scrollRoot = document.scrollingElement || document.documentElement
      if (scrollRoot?.scrollHeight > 0 && window.innerHeight > 0) targetTop = Math.min(targetTop, Math.max(0, scrollRoot.scrollHeight - window.innerHeight))
    }
    if (Math.abs(targetTop - scrollTop) > 1 && (requestedScrollTop === null || Math.abs(targetTop - requestedScrollTop) > 1)) {
      requestedScrollTop = targetTop
      if (typeof window !== 'undefined' && typeof document !== 'undefined') window.scrollTo({ top: targetTop, behavior: 'smooth' })
      else uni.pageScrollTo({ scrollTop: targetTop, duration: 260, fail: () => {} })
    }
  }
  const scrollTarget = () => {
    if (requestId !== onboardingStepRequestId || !showAppOnboarding.value || !robotPageActive.value) return
    try {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const element = document.querySelector('.home-bg ' + step.selector)
        if (element) { applyScroll(element.getBoundingClientRect(), window.scrollY); return }
      }
      measureOnboardingTargets([step.selector], ([rect]) => applyScroll(rect, pageScrollTop.value))
    } catch (_) {}
  }
  onboardingFocusTracker = trackOnboardingFocus({
    selector: step.selector,
    measureRects: measureOnboardingTargets,
    rootSelector: '.home-bg',
    isCurrent: () => requestId === onboardingStepRequestId && showAppOnboarding.value && robotPageActive.value,
    isBrowsing: () => onboardingDemoFinished.value && !onboardingAutoScrolling.value,
    onRect: rect => {
      if (firstScrollPending && rect?.height > 0) {
        firstScrollPending = false
        // The first photo reserves its own space at scrollTop zero. Other
        // targets begin scrolling in the same callback that moves the spotlight.
        if (step.selector !== '.onboarding-demo-photo' || currentScrollTop() > 1) applyScroll(rect, currentScrollTop())
      }
      onboardingTargetRect.value = rect
    },
    onInset: inset => { onboardingFocusInset.value = inset }
  })

  if (!step.shouldScroll) return
  // Correct once after guide layout settles, without delaying the initial handoff.
  if (step.selector.startsWith('.onboarding-demo-')) setTimeout(() => {
    scrollTarget()
    if (requestId === onboardingStepRequestId) onboardingFocusTracker?.refresh(1000)
  }, 550)
  setTimeout(() => {
    if (requestId !== onboardingStepRequestId) return
    onboardingAutoScrolling.value = false
  }, 1100)
}

onPageScroll((event) => {
  pageScrollTop.value = event.scrollTop || 0
  onboardingFocusTracker?.refresh()
})

watch([showAppOnboarding, robotPageActive], ([visible, active]) => {
  if (visible && active) return
  onboardingFocusTracker?.stop()
  onboardingFocusTracker = null
})

watch([showAppOnboarding, onboardingAutoScrolling, onboardingDemoFinished], ([visible, autoScrolling, finished]) => {
  setOnboardingScrollLock(visible && !autoScrolling && !finished)
}, { immediate: true })

// 图片压缩配置
const compressionConfig = {
  h5: {
    quality: 0.82,        // H5压缩质量 (0-1)
    maxWidth: 800,      // 最大宽度
    maxHeight: 800      // 最大高度
  },
  miniProgram: {
    quality: 80,         // 小程序压缩质量(0-100)
    maxSize: 800,        // 最长边尺寸 (px)
  }
}

// 检测平台类型
onMounted(() => {
  recognitionTaskUnsubscribe = subscribeRecognitionTask((task, reason) => {
    if (reason === 'owner-changed') {
      clearOtherOwnerRecognition()
      return
    }
    if (!pageVisible || !task || task.id === activeRecognitionTaskId) return
    restoreRecognitionTask(task)
  })
  refreshAiServiceState()
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
  maybeShowAppOnboarding()

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', queueRefreshDisplayBboxes)
  }
})

onShow(() => {
  pageVisible = true
  robotPageActive.value = true
  refreshAiServiceState()
  restoreRecognitionTask()
  queueRefreshDisplayBboxes()
  // #ifdef MP-WEIXIN
  if (pendingCameraImage) {
    const image = pendingCameraImage
    pendingCameraImage = null
    acceptRecognitionImage(image)
  }
  // #endif
})

onHide(() => {
  pageVisible = false
  robotPageActive.value = false
  stopElapsedClock()
})

onUnload(() => {
  clearTimeout(onboardingTrialTimer)
  onboardingTrialState.value = 'idle'
  pageVisible = false
  robotPageActive.value = false
  stopElapsedClock()
  recognitionTaskUnsubscribe?.()
  recognitionTaskUnsubscribe = null
})

onBeforeUnmount(() => {
  clearTimeout(onboardingTrialTimer)
  onboardingTrialState.value = 'idle'
  onboardingFocusTracker?.stop()
  onboardingFocusTracker = null
  pageVisible = false
  robotPageActive.value = false
  stopElapsedClock()
  recognitionTaskUnsubscribe?.()
  recognitionTaskUnsubscribe = null
  setOnboardingScrollLock(false)
  stopUpcyclingPoll()
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
  if (cls === 'recyclable') return 'bin_recyclable'
  if (cls === 'harmful') return 'bin_hazardous'
  if (cls === 'kitchen') return 'bin_kitchen'
  return 'bin_other'
}

function resetEnhancedRecognition() {
  recognizedItems.value = []
  upcyclingSections.value = []
  pendingUpcyclingSound = ''
  upcyclingImageUrl.value = ''
  upcyclingTaskId.value = ''
  stopUpcyclingPoll()
  imageLoading.value = false
  rawBboxes.value = []
  displayBboxes.value = []
  recognizeBBoxSpace.value = ''
  aiEnabled.value = false
}

function stopElapsedClock() {
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = null
}

function clearOtherOwnerRecognition() {
  stopElapsedClock()
  activeRecognitionTaskId = ''
  isProcessing.value = false
  failedPreviewPending.value = false
  retryImagePath.value = ''
  retryImageFile.value = null
  recognitionPreview.value = null
  resultImage.value = ''
  resultCategory.value = ''
  resultConfidence.value = ''
  resultDesc.value = ''
  processStatus.value = '处理中...'
  classificationUi.value = 'initial'
  robotFeedbackActive.value = false
  robotState.value = 'idle'
  resetEnhancedRecognition()
}

function startElapsedClock(startedAt) {
  stopElapsedClock()
  const update = () => { elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) }
  update()
  if (pageVisible) elapsedTimer = setInterval(update, 1000)
}


function retryLastImage() {
  if (isProcessing.value || !retryImagePath.value) return
  recognitionVisual.value?.prepareEntry()
  void processImage(retryImagePath.value, retryImageFile.value)
}

function handleRecognitionProgress(taskId, snapshot) {
  updateRecognitionPreview(taskId, snapshot)
  if (!isRecognitionTaskCurrent(taskId)) return
  if (!pageVisible || activeRecognitionTaskId !== taskId) return
  recognitionPreview.value = snapshot?.preview && Object.keys(snapshot.preview).length ? snapshot.preview : null
  robotState.value = getRecognitionRobotState(snapshot)
  const message = {
    recognizing: '正在识别图片...',
    advising: '正在整理投放与改造建议...',
    finalizing: '正在整理识别结果...'
  }[snapshot?.phase]
  if (message) {
    processStatus.value = message
    updateRecognitionTask(taskId, message)
  }
}

function applyRecognitionResult(res, showSuccessToast = false) {
  const label = Array.isArray(res && res.labels) ? res.labels[0] : null
  const rawImage = String((res && res.result_img_base64) || '')
  resultImage.value = /^data:image\//i.test(rawImage)
    ? rawImage
    : `data:image/jpeg;base64,${rawImage}`
  if (label) {
    resultCategory.value = label.name || '未知类别'
    resultConfidence.value = label.confidence ? (label.confidence * 100).toFixed(2) + '%' : '未知置信度'
    resultDesc.value = label.describe
  } else {
    resultCategory.value = '未识别到'
    resultConfidence.value = 'NA'
    resultDesc.value = '未检测到任何标签信息'
  }
  applyEnhancedRecognitionData(res)
  aiEnabled.value = !!(res && res.aiSettings && res.aiSettings.aiEnabled === true)
  processStatus.value = '识别完成'
  if (showSuccessToast) uni.showToast({ title: '识别完成', icon: 'success' })
}

function restoreRecognitionTask(task = getRecognitionTask()) {
  if (!task) return
  retryImagePath.value = task.source?.filePath || ''
  retryImageFile.value = task.source?.selectedFile || null
  recognitionPreview.value = task.preview && Object.keys(task.preview).length ? task.preview : null
  if (task.status === 'pending') {
    startElapsedClock(task.startedAt || Date.now())
    if (retryImagePath.value && !resultImage.value) resultImage.value = retryImagePath.value
    failedPreviewPending.value = false
    classificationUi.value = 'recognizing'
    robotFeedbackActive.value = true
    robotState.value = getRecognitionRobotState(task)
    isProcessing.value = true
    processStatus.value = task.message || '识别中...'
    return
  }
  if (task.status === 'succeeded' && task.result) {
    stopElapsedClock()
    recognitionPreview.value = null
    retryImagePath.value = ''
    retryImageFile.value = null
    failedPreviewPending.value = false
    classificationUi.value = 'complete'
    robotFeedbackActive.value = true
    robotState.value = task.result.labels?.length ? 'success' : 'fail'
    applyRecognitionResult(task.result)
    isProcessing.value = false
    clearRecognitionTask(task.id)
    return
  }
  if (task.status === 'failed') {
    failureCopy.value = getRecognitionFailureCopy(task.id, task.error)
    stopElapsedClock()
    recognitionPreview.value = null
    if (retryImagePath.value && !resultImage.value) resultImage.value = retryImagePath.value
    failedPreviewPending.value = true
    classificationUi.value = 'complete'
    robotFeedbackActive.value = true
    robotState.value = 'fail'
    isProcessing.value = false
    processStatus.value = '处理中...'
  }
}

function applyEnhancedRecognitionData(recognizeData) {
  if (!recognizeData || typeof recognizeData !== 'object') {
    resetEnhancedRecognition()
    return
  }

  // 大模型的具体建议由下方结构化内容展示，不重复分类预设文案。
  if (recognizeData.aiSettings?.detectorMode === 'ai' && recognizeData.labels?.length) {
    resultDesc.value = ''
  }

  recognizedItems.value = extractRecognizedItems(recognizeData)
  const upcyclingText = buildExpandedUpcyclingText(recognizeData)
  upcyclingSections.value = upcyclingText ? splitUpcyclingSections(upcyclingText) : []

  if (recognizeData.upcyclingImageUrl) {
    upcyclingImageUrl.value = recognizeData.upcyclingImageUrl
    imageLoading.value = false
  } else if (recognizeData.upcyclingTaskId) {
    upcyclingTaskId.value = recognizeData.upcyclingTaskId
    imageLoading.value = true
    startUpcyclingPoll()
  } else {
    pendingUpcyclingSound = ''
    upcyclingImageUrl.value = ''
    upcyclingTaskId.value = ''
  }

  if (recognizeData.aiSettings && typeof recognizeData.aiSettings.enableUpcyclingImage === 'boolean') {
    aiEnabledUpcyclingImage.value = recognizeData.aiSettings.enableUpcyclingImage
  }

  recognizeBBoxSpace.value = String(recognizeData.bbox_space || '')
  const labels = Array.isArray(recognizeData.labels) ? recognizeData.labels : []
  // Older YOLO servers return painted images; avoid a second set of frames.
  const serverRendered = recognizeData.bbox_rendered === true ||
    (recognizeData.bbox_rendered !== false && recognizeData.aiSettings?.detectorMode === 'yolo')
  rawBboxes.value = (serverRendered ? [] : labels)
    .map((label, index) => ({ index, label, bbox: parseLabelBbox(label) }))
    .filter((item) => Array.isArray(item.bbox) && item.bbox.length >= 4)

  const unlocks = Array.isArray(
    recognizeData &&
    recognizeData.achievementInfo &&
    recognizeData.achievementInfo.newlyUnlocked
  ) ? recognizeData.achievementInfo.newlyUnlocked : []
  enqueueAchievementUnlocks(unlocks)
  if (unlocks.length) {
    showAchievementUnlockModal(takeAchievementUnlocks())
  }

  const seed = buildSeedFromRecognizeData(recognizeData)
  if (seed) {
    saveSeed(seed)
  }

  queueRefreshDisplayBboxes()
}

function goAiChatFromResult() {
  if (!aiServiceEnabled.value || !resultImage.value) return
  // seed 已由 applyEnhancedRecognitionData → saveSeed 正确写入，
  // 只需清除"已消费"标记，确保 ai-chat 能重新加载本次识别结果
  // #ifndef H5
  try { uni.removeStorageSync('ai_chat_seed_consumed_at') } catch (e) {}
  // #endif
  // #ifdef H5
  try { localStorage.removeItem('ai_chat_seed_consumed_at') } catch (e) {}
  // #endif
  uni.navigateTo({ url: '/pages-nonTheme/ai-chat' })
}

function goAiAssistant() {
  if (!aiServiceEnabled.value) return
  uni.navigateTo({ url: '/pages-nonTheme/ai-chat' })
}

function previewUpcyclingImage() {
  if (!upcyclingImageUrl.value) return
  uni.previewImage({
    urls: [upcyclingImageUrl.value],
    current: 0,
    fail: () => uni.showToast({ title: '预览失败', icon: 'none' })
  })
}

function stopUpcyclingPoll() {
  if (upcyclingPollTimer) {
    clearTimeout(upcyclingPollTimer)
    upcyclingPollTimer = 0
  }
}

async function startUpcyclingPoll() {
  stopUpcyclingPoll()
  const taskId = upcyclingTaskId.value
  if (!taskId) return

  const maxRetries = 30
  let retries = 0

  const poll = async () => {
    if (retries >= maxRetries) {
      console.warn('[upcycling poll] 轮询超时')
      upcyclingTaskId.value = ''
      imageLoading.value = false
      return
    }
    retries++

    try {
      const base = getBaseUrl()
      const token = uni.getStorageSync('token') || ''
      const res = await new Promise((resolve, reject) => {
        uni.request({
          url: `${base}/api/upcycling-image/${taskId}`,
          method: 'GET',
          header: { Authorization: token },
          success: (r) => resolve(r.data),
          fail: reject
        })
      })

      if (res && res.code === 0 && res.data) {
        if (res.data.status === 'done' && res.data.url) {
          pendingUpcyclingSound = pageVisible ? taskId : ''
          upcyclingImageUrl.value = res.data.url
          upcyclingTaskId.value = ''
          imageLoading.value = false
          return
        } else if (res.data.status === 'failed') {
          upcyclingTaskId.value = ''
          imageLoading.value = false
          return
        }
      }
    } catch (e) {
      console.warn('[upcycling poll] 请求失败:', e)
    }

    upcyclingPollTimer = setTimeout(poll, 2000)
  }

  poll()
}

function getBaseUrl() {
  // 所有平台都需要完整 URL（小程序/App 不支持相对路径）
  // 使用顶部静态导入的 baseUrl，避免 require 在小程序中无法解析 @ 别名
  return baseUrl || ''
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
        
        if (Math.max(width, height) > maxWidth) {
          const scale = maxWidth / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
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

async function processImage(filePath, selectedFile = null) {
  failedPreviewPending.value = false
  const taskId = beginRecognitionTask('正在准备图片...', { filePath, selectedFile })
  playUiSound('recognitionStart', { key: taskId, page: 'pages-dark/home/home' })
  activeRecognitionTaskId = taskId
  retryImagePath.value = filePath
  retryImageFile.value = selectedFile
  recognitionPreview.value = null
  startElapsedClock(getRecognitionTask()?.startedAt || Date.now())
  classificationUi.value = 'recognizing'
  robotFeedbackActive.value = true
  robotState.value = 'uploading'
  resultImage.value = filePath
  try {
    isProcessing.value = true
    resetEnhancedRecognition()
    processStatus.value = '正在准备图片...'
    
    // 第一步：图片压缩
    const originalSize = await getRecognitionImageSize(filePath, selectedFile?.size)
    const originalFile = isH5Platform.value && typeof File !== 'undefined' && selectedFile instanceof File
      ? selectedFile : filePath
    const { shouldCompress, needsJpegConversion } = await getRecognitionCompressionDecision(
      filePath, originalSize, isH5Platform.value && typeof originalFile !== 'string' ? originalFile.type : ''
    )
    let compressedFile = originalFile
    let compressedBlob = null
    try {
      if (isH5Platform.value && (shouldCompress || needsJpegConversion)) {
        // H5环境使用canvas压缩
        processStatus.value = '正在压缩图片...'
        updateRecognitionTask(taskId, processStatus.value)
        console.log('H5环境：开始图片压缩...')
        const { quality, maxWidth } = compressionConfig.h5
        const candidate = await compressImage(filePath, quality, maxWidth)
        if (shouldUseCompressedRecognitionImage(originalSize, candidate.size, needsJpegConversion)) {
          compressedBlob = candidate
          // 创建File对象用于API上传，使用时间戳+随机数生成唯一文件名
          const timestamp = Date.now()
          const randomId = Math.random().toString(36).substring(2, 8)
          const uniqueFileName = `compressed_${timestamp}_${randomId}.jpg`
          compressedFile = new File([candidate], uniqueFileName, { type: 'image/jpeg' })
          console.log('H5图片压缩完成，文件大小:', (compressedFile.size / 1024 / 1024).toFixed(2) + 'MB')
        }
      } else if (shouldCompress) {
        // 小程序环境使用uni.compressImage
        processStatus.value = '正在优化图片...'
        updateRecognitionTask(taskId, processStatus.value)
        console.log('小程序环境：开始图片压缩...')
        const { quality, maxSize } = compressionConfig.miniProgram
        const candidate = await compressImageMiniProgram(filePath, quality, maxSize)
        const candidateSize = candidate === filePath ? 0 : await getRecognitionImageSize(candidate)
        if (isSmallerRecognitionImage(originalSize, candidateSize)) compressedFile = candidate
      }
      
      console.log('图片压缩成功')
    } catch (compressError) {
      console.warn('图片压缩失败，使用原图', compressError)
      compressedFile = originalFile
      compressedBlob = null
    }
    
    // 第二步：显示压缩后的图片预览
    if (!isRecognitionTaskCurrent(taskId)) return
    if (isH5Platform.value && compressedBlob) {
      // H5环境显示压缩后的预览
      resultImage.value = URL.createObjectURL(compressedBlob)
    } else {
      // 小程序环境显示压缩后的路径
      resultImage.value = typeof compressedFile === 'string' ? compressedFile : filePath
    }
    
    // 第三步：调用识别API
    processStatus.value = '正在上传并分析图片...'
    updateRecognitionTask(taskId, processStatus.value)
    const recognitionRequest = recognizeImage(compressedFile, {
      bboxRenderer: 'client',
      onProgress: snapshot => handleRecognitionProgress(taskId, snapshot)
    })
    robotState.value = 'processing'
    const res = await recognitionRequest
    if (!isRecognitionTaskCurrent(taskId)) return
    completeRecognitionTask(taskId, res)
    // 同步广播可能被其它首页消费并清理；当前页仍须展示已确认属于自己的结果。
    if (activeRecognitionTaskId !== taskId || !pageVisible) return
    recognitionPreview.value = null
    retryImagePath.value = ''
    retryImageFile.value = null
    robotState.value = res.labels?.length ? 'success' : 'fail'
    playUiSound(res.labels?.length ? 'recognitionSuccess' : 'recognitionFail', { key: taskId, page: 'pages-dark/home/home' })
    classificationUi.value = 'complete'
    // console.log('后端返回数据:', res) // 调试日志

    // 第四步：处理识别结果
    processStatus.value = '处理识别结果...'
    
    // 确保后端返回的数据结构正确
    if (res.labels && res.labels.length > 0) {
      const label = res.labels[0]
      resultCategory.value = label.name || '未知类别'
      resultConfidence.value = label.confidence ? (label.confidence * 100).toFixed(2) + '%' : '未知置信度'
      // 检查并避免重复添加前缀
      resultImage.value = /^data:image\//i.test(res.result_img_base64)
        ? res.result_img_base64
        : 'data:image/jpeg;base64,' + res.result_img_base64
      resultDesc.value = label.describe
    } else {
      resultCategory.value = '未识别到'
      resultConfidence.value = 'NA'
      resultDesc.value = '未检测到任何标签信息'
      resultImage.value = /^data:image\//i.test(res.result_img_base64)
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
    clearRecognitionTask(taskId)
    
  } catch (err) {
    failRecognitionTask(taskId, err)
    if (!isRecognitionTaskCurrent(taskId) || !pageVisible) return
    failureCopy.value = getRecognitionFailureCopy(taskId, err)
    playUiSound('recognitionFail', { key: taskId, page: 'pages-dark/home/home' })
    recognitionPreview.value = null
    robotState.value = 'fail'
    classificationUi.value = 'complete'
    resetEnhancedRecognition()
    failedPreviewPending.value = true
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
    if (activeRecognitionTaskId === taskId) {
      stopElapsedClock()
      isProcessing.value = false
      processStatus.value = '处理中...' // 重置状态
      activeRecognitionTaskId = ''
    }
  }
}

function acceptRecognitionImage(chooseRes) {
  // The embedded camera emits before navigateBack; start only after home is visible.
  // #ifdef MP-WEIXIN
  if (chooseRes.fromEmbeddedCamera && !pageVisible) {
    pendingCameraImage = chooseRes
    return
  }
  // #endif
  const filePath = chooseRes.tempFilePaths[0]
  isProcessing.value = true
  processImage(filePath, chooseRes.tempFiles?.[0]).catch(() => { isProcessing.value = false })
}

function onAddImage() {
  if (isProcessing.value) {
    uni.showToast({ title: '正在处理中...', icon: 'none' })
    return
  }

  recognitionVisual.value?.prepareEntry()
  const keepFailureFeedback = robotFeedbackActive.value && robotState.value === 'fail'
  if (!keepFailureFeedback) robotState.value = 'tap'
  chooseRecognitionImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: acceptRecognitionImage,
    fail: () => {
      if (onboardingTrialState.value === 'picking') onboardingTrialState.value = 'cancelled'
      if (!keepFailureFeedback) robotState.value = 'idle'
      uni.showToast({ title: '选择取消', icon: 'none' })
    }
  })
}

function navigateTo(url) {
  uni.navigateTo({ url })
}
function goHistory() {
  uni.navigateTo({ url: '/pages-dark/history/history?from=home' })
}

function goShop() {
  navigateBottomTab('home', 'shop', '/pages-dark/shop/shop?from=home', 'navigateTo')
}

function goProfile() {
  navigateBottomTab('home', 'profile', '/pages-dark/profile/profile')
}

function goNearbyDisposal() {
  if (!nearbyOrigin.value) return
  const { latitude, longitude } = nearbyOrigin.value
  navigateBottomTab('home', 'map', '/pages-dark/map/map?from=home&mode=nearby&lat=' + latitude + '&lng=' + longitude, 'navigateTo')
}

function goMap() {
  navigateBottomTab('home', 'map', '/pages-dark/map/map?from=home', 'navigateTo')
}

function goGuide() {
  uni.navigateTo({ url: '/pages-dark/guide/guide?from=home' })
}

function goRanking() {
  uni.navigateTo({ url: '/pages-dark/ranking/ranking?from=home' })
}

function goChallenge() {
  uni.navigateTo({ url: '/pages-nonTheme/challenge' })
}

function goLottery() {
  uni.navigateTo({ url: '/pages-nonTheme/lottery' })
}

function goCommunity() {
  uni.navigateTo({ url: '/pages-nonTheme/community' })
}

function goBooking() {
  uni.navigateTo({ url: '/pages-nonTheme/booking' })
}

function goVoiceScan() {
  uni.navigateTo({ url: '/pages-nonTheme/voice-scan' })
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
  
  if (isH5 && isPhoneBrowser()) {
    scanDeviceQrCode({
      success: res => connectDevice(getDeviceQrScanContent(res)),
      fail: () => {}
    })
  } else if (isH5) {
    // 桌面网页保留手动输入
    uni.showModal({
      title: '连接设备',
      content: '请输入设备ID',
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
    scanDeviceQrCode({
      // #ifndef MP-WEIXIN
      scanType: ['qrCode'],
      // #endif
      success: function(res) {
        // #ifdef MP-WEIXIN
        if (handleRegistrationQrScan(res, {
          navigateTo: options => uni.navigateTo(options),
          showToast: options => uni.showToast(options)
        })) return
        // #endif
        connectDevice(getDeviceQrScanContent(res))
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

function connectDevice(rawContent) {
  const target = resolveDeviceScanTarget(rawContent, '/pages-nonTheme/scan')
  if (!target.url) {
    uni.showToast({
      title: target.invalidScene ? '二维码已过期或异常，请重新扫码' : '设备ID不能为空',
      icon: 'none'
    })
    return
  }
  if (target.isMock) {
    saveMockDeviceConnection({
      device_id: target.deviceId,
      device_name: target.deviceName,
      device_mode: target.deviceMode
    })
    checkDeviceConnection()
  }
  console.log('Connecting to device route:', target.url.split('?')[0])
  uni.navigateTo({ url: target.url })
}

function showGuideDetail(type) {
  const guide = wasteCategoryGuides[type]
  if (!guide) return
  currentGuide.value = { type }
  showGuideModal.value = true
}

function closeGuideModal() {
  showGuideModal.value = false
  currentGuide.value = {}
}

function showAchievementUnlockModal(items) {
  if (!Array.isArray(items) || !items.length) return
  const newItems = items.filter(item => item && item.key && !shownAchievementKeys.has(item.key))
  if (!newItems.length) return
  newItems.forEach(item => shownAchievementKeys.add(item.key))
  achievementModalItems.value = newItems
  showAchievementModal.value = true
}

function closeAchievementModal() {
  showAchievementModal.value = false
  setTimeout(() => { achievementModalItems.value = [] }, 300)
}

</script>

<style scoped>
.recognition-preview-caption { display: block; color: #a2bccd; font-size: 24rpx; line-height: 1.5; margin-bottom: 16rpx; }
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
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 24rpx;
  flex-wrap: nowrap;
}

.ai-helper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: 999rpx;
  padding: 14rpx 36rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #031521;
  background: linear-gradient(135deg, #40e0ff, #58e8d4);
  box-shadow: 0 8rpx 20rpx rgba(64, 224, 255, 0.3);
  flex-shrink: 0;
}

.category-display {
  display: flex;
  align-items: center;
  background: rgba(64, 224, 255, 0.1);
  padding: 18rpx 20rpx;
  border-radius: 16rpx;
  border-left: 6rpx solid #40e0ff;
  flex: 1 1 auto;
  min-width: 0;
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
  animation: recognition-section-enter .24s ease-out both;
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

/* 变废为宝效果图卡片 — 暗色主题直接适配 */
.upcycling-image-card {
  margin-top: 24rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.88));
  border: 1rpx solid rgba(76, 175, 80, 0.25);
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.4);
}

.upcycling-image-header {
  padding: 20rpx 24rpx 0;
}

.upcycling-image-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #34d399;
}

.upcycling-image-wrapper {
  position: relative;
  margin-top: 16rpx;
  width: 100%;
  min-height: 300rpx;
  background: #1e293b;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upcycling-image {
  display: block;
  width: 100%;
  min-height: 400rpx;
  max-height: 600rpx;
  object-fit: contain;
  background: #1e293b;
}

.upcycling-image-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 60rpx 24rpx;
}

.upcycling-loading-ring {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid rgba(52, 211, 153, 0.2);
  border-top-color: #34d399;
  border-radius: 50%;
  animation: upcycling-spin 0.8s linear infinite;
}

.upcycling-loading-text {
  font-size: 24rpx;
  color: #34d399;
}

@keyframes upcycling-spin {
  to { transform: rotate(360deg); }
}

.upcycling-image-hint {
  display: block;
  padding: 12rpx 24rpx 20rpx;
  font-size: 22rpx;
  color: #64748b;
  text-align: center;
}

.recognition-bbox-layer {
  position: absolute;
  inset: 0;
  z-index: 18;
  pointer-events: none;
}

.recognition-bbox-item {
  box-sizing: border-box;
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
  padding: 20rpx 40rpx;
  border-radius: 24rpx;
  border: 1px solid rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(20px);
  width: 100%;
  max-width: 600rpx;
}

.welcome-icon {
  font-size: 88rpx;
  display: block;
  margin-left: auto;
  margin-right: auto;
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
  flex-direction: column;
  gap: 20rpx;
  width: 100%;
  max-width: 650rpx;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(17, 24, 39, 0.86) 52%, rgba(15, 23, 42, 0.92) 100%);
  border-radius: 20rpx;
  padding: 26rpx;
  border: 1px solid rgba(64, 224, 255, 0.2);
  backdrop-filter: blur(15px);
  box-sizing: border-box;
}

.quick-actions-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16rpx;
}

.quick-actions-title {
  color: #f8fafc;
  font-size: 30rpx;
  font-weight: 800;
}

.quick-actions-subtitle {
  color: rgba(203, 213, 225, 0.72);
  font-size: 22rpx;
  font-weight: 500;
}

.quick-actions-featured {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14rpx;
}

.quick-actions-grid.three-items {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.action-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(64, 224, 255, 0.2);
  transition: all 0.3s ease;
  cursor: pointer;
  box-sizing: border-box;
  min-height: 92rpx;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.action-item.featured {
  min-height: 136rpx;
  justify-content: flex-start;
  padding: 24rpx;
  border-color: rgba(64, 224, 255, 0.24);
}

.action-item.challenge-card {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.16) 0%, rgba(15, 23, 42, 0.8) 48%, rgba(16, 185, 129, 0.12) 100%);
}

.action-item.lottery-card {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.18) 0%, rgba(15, 23, 42, 0.8) 48%, rgba(16, 185, 129, 0.12) 100%);
}

.action-item.compact {
  flex-direction: column;
  gap: 10rpx;
  min-height: 132rpx;
  padding: 16rpx 8rpx;
}

.action-item:active {
  transform: scale(0.95);
  background: rgba(64, 224, 255, 0.15);
  box-shadow: 0 4rpx 12rpx rgba(64, 224, 255, 0.2);
}

.action-icon-wrapper {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8rpx 22rpx rgba(0, 0, 0, 0.24), inset 0 1rpx 1rpx rgba(255, 255, 255, 0.18);
  overflow: hidden;
  position: relative;
}

.action-icon-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, transparent 56%);
  pointer-events: none;
}

.action-item.featured .action-icon-wrapper {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
}

.action-icon-wrapper.device {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.26) 0%, rgba(14, 165, 233, 0.16) 100%);
}

.action-icon-wrapper.challenge {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.28) 0%, rgba(251, 191, 36, 0.14) 100%);
}

.action-icon-wrapper.lottery {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.26) 0%, rgba(99, 102, 241, 0.14) 100%);
}

.action-icon-wrapper.community {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.26) 0%, rgba(45, 212, 191, 0.13) 100%);
}

.action-icon-wrapper.booking {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.24) 0%, rgba(244, 63, 94, 0.13) 100%);
}

.action-icon-wrapper.voice {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.26) 0%, rgba(56, 189, 248, 0.14) 100%);
}

.action-icon {
  position: relative;
  z-index: 1;
  font-size: 32rpx;
  filter: drop-shadow(0 2rpx 8rpx rgba(0, 0, 0, 0.26));
}

.action-item.featured .action-icon {
  font-size: 38rpx;
}

.action-text {
  display: block;
  font-size: 23rpx;
  color: #dbeafe;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
}

.action-copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.action-copy .action-text {
  text-align: left;
  color: #f8fafc;
  font-size: 28rpx;
}

.action-desc {
  color: rgba(203, 213, 225, 0.72);
  font-size: 22rpx;
  line-height: 1.3;
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
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 60rpx;
  box-sizing: border-box;
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
    padding: 14rpx 32rpx;
    font-size: 28rpx;
    width: 100%;
    text-align: center;
    justify-content: center;
  }

  .category-row {
    align-items: center;
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

  .upcycling-image-title {
    font-size: 26rpx;
  }

  .upcycling-image {
    min-height: 320rpx;
    max-height: 500rpx;
  }

  .recognition-bbox-label {
    max-width: 180rpx;
    font-size: 18rpx;
  }
}

@media (max-width: 420px) {
  .quick-actions {
    gap: 14rpx;
    padding: 20rpx 16rpx;
  }

  .quick-actions-header {
    align-items: flex-end;
    flex-direction: row;
    gap: 12rpx;
  }

  .quick-actions-subtitle {
    font-size: 20rpx;
    white-space: nowrap;
  }

  .quick-actions-featured {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12rpx;
  }

  .quick-actions-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10rpx;
  }

  .quick-actions-grid.three-items {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .action-item.featured {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12rpx;
    min-height: 104rpx;
    padding: 16rpx 12rpx;
  }

  .action-item.featured .action-icon-wrapper {
    width: 68rpx;
    height: 68rpx;
    border-radius: 18rpx;
  }

  .action-item.featured .action-icon {
    font-size: 30rpx;
  }

  .action-copy {
    align-items: flex-start;
    gap: 4rpx;
  }

  .action-copy .action-text {
    text-align: left;
    font-size: 24rpx;
  }

  .action-desc {
    font-size: 20rpx;
    text-align: left;
  }

  .action-item.compact {
    min-height: 116rpx;
    padding: 14rpx 4rpx;
  }

  .action-item.compact .action-icon-wrapper {
    width: 64rpx;
    height: 64rpx;
    border-radius: 18rpx;
  }

  .action-item.compact .action-icon {
    font-size: 28rpx;
  }

  .action-item.compact .action-text {
    font-size: 21rpx;
  }

  .result-card {
    padding: 22rpx 20rpx;
  }

  .ai-helper-btn {
    width: 100%;
    padding: 16rpx 36rpx;
    font-size: 30rpx;
  }

  .desc-content {
    font-size: 22rpx;
  }
}

@media (max-width: 340px) {
  .quick-actions-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4rpx;
  }

  .quick-actions-featured,
  .quick-actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quick-actions-grid.three-items {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .action-item.featured {
    flex-direction: column;
    justify-content: center;
    min-height: 140rpx;
  }

  .action-copy,
  .action-copy .action-text,
  .action-desc {
    align-items: center;
    text-align: center;
  }
}

@keyframes ai-float-idle-dark {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}

.floating-agent {
  position: fixed;
  right: 32rpx;
  bottom: calc(148rpx + env(safe-area-inset-bottom));
  width: 92rpx;
  height: 92rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  animation: ai-float-idle-dark 3.5s ease-in-out infinite;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}

.floating-agent:hover {
  transform: translateY(-8px) scale(1.1);
}

.floating-agent:hover .floating-agent-main {
  transform: scale(1.1);
}

.floating-agent:active {
  transform: scale(0.93) translateY(0);
  animation: none;
}

.floating-agent-main {
  font-size: 40rpx;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  font-size: 40rpx;
  margin-bottom: 8rpx;
  opacity: 0.6;
  filter: saturate(0.7) drop-shadow(0 0 8px rgba(64, 224, 255, 0.3));
}

.tabbar-item.active .tabbar-icon {
  opacity: 1;
  filter: saturate(1) drop-shadow(0 0 12px rgba(64, 224, 255, 0.8));
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

/* 成就解锁弹窗 */
.achievement-unlock-modal {
  position: relative;
  width: 90%;
  max-width: 600rpx;
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  border-radius: 32rpx;
  overflow: hidden;
  animation: achievementModalSlide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes achievementModalSlide {
  0% { opacity: 0; transform: translateY(60rpx) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.achievement-unlock-bg {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 200rpx;
  background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%);
  z-index: 0;
}
.achievement-unlock-header {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 32rpx 24rpx;
}
.achievement-unlock-emoji {
  font-size: 64rpx;
  margin-bottom: 8rpx;
  animation: achievementBounce 0.6s ease 0.2s both;
}
@keyframes achievementBounce {
  0% { transform: scale(0) rotate(-20deg); }
  60% { transform: scale(1.3) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); }
}
.achievement-unlock-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 2rpx 8rpx rgba(0,0,0,0.2);
}
.achievement-unlock-subtitle {
  font-size: 24rpx;
  color: rgba(255,255,255,0.85);
  margin-top: 6rpx;
}
.achievement-unlock-list {
  position: relative;
  z-index: 1;
  padding: 0 24rpx 16rpx;
  max-height: 400rpx;
  overflow-y: auto;
}
.achievement-unlock-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: rgba(30, 41, 59, 0.9);
  border-radius: 20rpx;
  padding: 20rpx;
  margin-bottom: 12rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.3);
  border: 1rpx solid rgba(148, 163, 184, 0.2);
}
.achievement-unlock-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 36rpx;
}
.achievement-unlock-icon-wrap.common { background: rgba(75,85,99,0.4); }
.achievement-unlock-icon-wrap.rare { background: rgba(30,64,175,0.4); }
.achievement-unlock-icon-wrap.epic { background: rgba(109,40,217,0.4); }
.achievement-unlock-icon-wrap.legendary { background: rgba(161,98,7,0.4); }
.achievement-unlock-info {
  flex: 1;
  min-width: 0;
}
.achievement-unlock-name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #f3f4f6;
}
.achievement-unlock-desc {
  display: block;
  font-size: 22rpx;
  color: #9ca3af;
  margin-top: 4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.achievement-unlock-badge {
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
  font-weight: 600;
  flex-shrink: 0;
}
.achievement-unlock-badge.common { background: rgba(75,85,99,0.4); color: #d1d5db; }
.achievement-unlock-badge.rare { background: rgba(30,64,175,0.4); color: #93c5fd; }
.achievement-unlock-badge.epic { background: rgba(109,40,217,0.4); color: #c4b5fd; }
.achievement-unlock-badge.legendary { background: rgba(161,98,7,0.4); color: #fcd34d; }
.achievement-unlock-footer {
  position: relative;
  z-index: 1;
  padding: 8rpx 24rpx 28rpx;
}
.achievement-unlock-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  font-size: 30rpx;
  border: none;
  border-radius: 44rpx;
  box-shadow: 0 8rpx 24rpx rgba(16,185,129,0.35);
}

/* 失败反馈回到入口时保留落点尺寸，机器人只在顶部组件中维护一份。 */
.smart-sort-return-target { width: 160rpx; height: 142rpx; margin: 0 auto 16rpx; }
.smart-sort-return-target.dark { width: 170rpx; height: 170rpx; margin-bottom: 24rpx; }
.upload-section.robot-returning-card { position: relative; z-index: 3; }
.upload-section.robot-returning-card .upload-border { transform: none; }

.waste-guide-open .header-bg,
.waste-guide-open .content,
.waste-guide-open .main-content,
.waste-guide-open .home-container,
.waste-guide-open .tabbar,
.waste-guide-open .floating-agent,
.waste-guide-open .bg-decoration,
.waste-guide-open .tech-bg { filter: blur(5px); pointer-events: none; }
/* 识别等待：沿用首页卡片，保留状态与计时反馈。 */
.recognition-wait-actions {
  display: flex; flex-direction: column; align-items: center; gap: 8rpx;
  margin-top: 14rpx; color: #d5eeee; font-size: 22rpx; text-align: center;
}
.recognition-photo-active { overflow: hidden; border-radius: 16rpx; }
.recognition-photo-scan {
  position: absolute; top: 0; left: 7%; width: 86%; height: 4rpx;
  background: linear-gradient(90deg, transparent, #40e0ff, transparent);
  box-shadow: 0 0 18rpx #40e0ff; pointer-events: none;
  animation: recognition-photo-sweep 2.7s ease-in-out infinite;
}
.recognition-retry-actions {
  display: flex; flex-direction: column; align-items: stretch; gap: 12rpx;
  color: #d5eeee; font-size: 24rpx; text-align: center;
}
.recognition-retry-actions button {
  width: 100%; border-radius: 14rpx; color: #40e0ff;
  background: rgba(20, 50, 63, .85); font-size: 25rpx;
}
.recognition-image-enter { animation: recognition-image-enter .35s ease both; }
@keyframes recognition-photo-sweep { 0% { top: 0; opacity: 0; } 12% { opacity: .8; } 88% { opacity: .8; } 100% { top: 98%; opacity: 0; } }
@keyframes recognition-image-enter { from { opacity: 0; transform: translateY(10rpx); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .recognition-photo-scan, .recognition-image-enter { animation: none; }
}
.upload-container.processing , .upload-container.recognition-failed { height: auto; min-height: 300rpx; }
.upload-container.processing .upload-border , .upload-container.recognition-failed .upload-border { height: auto; min-height: 300rpx; }
.upload-container.processing .upload-inner , .upload-container.recognition-failed .upload-inner { height: auto; min-height: 296rpx; padding: 24rpx 14rpx; box-sizing: border-box; }
.recognition-failed .upload-text, .recognition-failed .upload-hint { max-width: 100%; text-align: center; }
.recognition-failed .upload-hint { line-height: 1.6; }

.onboarding-demo-reading .home-container,
.onboarding-demo-reading .tabbar,
.onboarding-demo-reading .floating-agent { pointer-events: none; }
@keyframes recognition-section-enter { from { opacity: .75; transform: translateY(6rpx); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .upcycling-plan-item { animation: none; } }
</style>
