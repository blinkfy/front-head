import { onScopeDispose, ref } from 'vue'
import { enqueueAchievementUnlocks, takeAchievementUnlocks } from '../achievements.js'
import { getRecognitionFailureCopy } from './recognition-failure-copy.mjs'
import { getRecognitionRobotState } from './recognition-robot-state.mjs'
import {
  buildExpandedUpcyclingText,
  buildSeedFromRecognizeData,
  extractRecognizedItems,
  parseLabelBbox,
  saveSeed,
  splitUpcyclingSections
} from './recognition-sync.js'
import { clearRecognitionTask, getRecognitionTask } from './recognition-task.mjs'
import { useRecognitionBboxes } from './use-recognition-bboxes.js'
import { useUpcyclingImage } from './use-upcycling-image.js'

export function useHomeRecognition({ dark = false, isPageVisible, onAchievementUnlock }) {
  const resultImage = ref('')
  const resultCollapsed = ref(false)
  const resultCategory = ref('')
  const resultConfidence = ref('')
  const resultDesc = ref('')
  const aiEnabled = ref(false)
  const isProcessing = ref(false)
  const robotState = ref('idle')
  const classificationUi = ref('initial')
  const robotFeedbackActive = ref(false)
  const failedPreviewPending = ref(false)
  const failureCopy = ref(getRecognitionFailureCopy())
  const retryImagePath = ref('')
  const retryImageFile = ref(null)
  const recognitionPreview = ref(null)
  const elapsedSeconds = ref(0)
  const processStatus = ref('处理中...')
  const recognizedItems = ref([])
  const upcyclingSections = ref([])
  const aiEnabledUpcyclingImage = ref(false)
  const rawBboxes = ref([])
  const recognizeBBoxSpace = ref('')
  const { bboxImage, displayBboxes, queueRefreshDisplayBboxes } = useRecognitionBboxes(resultImage, rawBboxes, recognizeBBoxSpace)
  const { upcyclingImageUrl, upcyclingTaskId, imageLoading, setUpcyclingImage,
    startUpcyclingPoll, stopUpcyclingPoll, takeUpcyclingSound } = useUpcyclingImage(isPageVisible)
  let elapsedTimer = null
  let confidenceTimer = null

  function stopElapsedClock() {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }

  function startElapsedClock(startedAt) {
    stopElapsedClock()
    const update = () => { elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) }
    update()
    if (isPageVisible()) elapsedTimer = setInterval(update, 1000)
  }

  function animateConfidence(target) {
    // Timers also work in WeChat, where requestAnimationFrame may be unavailable.
    confidenceTimer = setTimeout(() => {
      const startTime = Date.now()
      function update() {
        const progress = Math.min((Date.now() - startTime) / 800, 1)
        resultConfidence.value = Math.round(target * (1 - Math.pow(1 - progress, 4))) + '%'
        confidenceTimer = progress < 1 ? setTimeout(update, 16) : null
      }
      confidenceTimer = setTimeout(update, 16)
    }, 300)
  }

  function resetEnhancedRecognition() {
    clearTimeout(confidenceTimer)
    recognizedItems.value = []
    upcyclingSections.value = []
    setUpcyclingImage(null)
    rawBboxes.value = []
    displayBboxes.value = []
    recognizeBBoxSpace.value = ''
    aiEnabled.value = false
  }

  function applyEnhancedRecognitionData(result, restored, resultId) {
    if (result.aiSettings?.detectorMode === 'ai' && result.labels?.length) resultDesc.value = ''
    recognizedItems.value = extractRecognizedItems(result)
    const upcyclingText = buildExpandedUpcyclingText(result)
    upcyclingSections.value = upcyclingText ? splitUpcyclingSections(upcyclingText) : []
    setUpcyclingImage(result, resultId)
    if (typeof result.aiSettings?.enableUpcyclingImage === 'boolean') {
      aiEnabledUpcyclingImage.value = result.aiSettings.enableUpcyclingImage
    }

    recognizeBBoxSpace.value = String(result.bbox_space || '')
    const labels = Array.isArray(result.labels) ? result.labels : []
    // Older YOLO servers return painted images. Avoid drawing a second set of frames.
    const serverRendered = result.bbox_rendered === true ||
      (result.bbox_rendered !== false && result.aiSettings?.detectorMode === 'yolo')
    rawBboxes.value = (serverRendered ? [] : labels)
      .map((label, index) => ({ index, label, bbox: parseLabelBbox(label) }))
      .filter(item => Array.isArray(item.bbox) && item.bbox.length >= 4)

    if (!restored) {
      const unlocks = result.achievementInfo?.newlyUnlocked
      const newUnlocks = Array.isArray(unlocks) ? unlocks : []
      enqueueAchievementUnlocks(newUnlocks)
      if (newUnlocks.length) onAchievementUnlock(takeAchievementUnlocks())
    }
    const seed = buildSeedFromRecognizeData(result)
    if (seed) saveSeed(seed)
    queueRefreshDisplayBboxes()
  }

  function applyRecognitionResult(result, showSuccessToast = false, restored = false, resultId = '') {
    clearTimeout(confidenceTimer)
    const label = Array.isArray(result?.labels) ? result.labels[0] : null
    const rawImage = String(result?.result_img_base64 || '')
    resultImage.value = /^data:image\//i.test(rawImage) ? rawImage : `data:image/jpeg;base64,${rawImage}`
    resultCategory.value = label ? label.name || '未知类别' : '未识别到'
    resultDesc.value = label ? label.describe : '未检测到任何标签信息'
    if (dark) {
      resultConfidence.value = !label ? 'NA'
        : label.confidence ? (label.confidence * 100).toFixed(2) + '%' : '未知置信度'
    } else if (label) {
      const confidence = label.confidence ? Math.round(label.confidence * 100) : 0
      resultConfidence.value = restored ? confidence + '%' : '0%'
      if (!restored) animateConfidence(confidence)
    } else {
      resultConfidence.value = ''
    }

    if (result && typeof result === 'object') applyEnhancedRecognitionData(result, restored, resultId)
    else resetEnhancedRecognition()
    aiEnabled.value = result?.aiSettings?.aiEnabled === true
    const message = dark ? '识别完成' : '识别完成！'
    processStatus.value = message
    if (showSuccessToast) uni.showToast({ title: message, icon: 'success' })
  }

  function restoreRecognitionTask(task = getRecognitionTask()) {
    if (!task) return
    retryImagePath.value = task.source?.filePath || ''
    retryImageFile.value = task.source?.selectedFile || null
    recognitionPreview.value = task.preview && Object.keys(task.preview).length ? task.preview : null
    if (task.status === 'pending') {
      resultCollapsed.value = false
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
      applyRecognitionResult(task.result, false, false, task.id)
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

  onScopeDispose(() => {
    clearTimeout(confidenceTimer)
    stopElapsedClock()
    stopUpcyclingPoll()
  })

  return {
    resultImage, resultCollapsed, resultCategory, resultConfidence, resultDesc, aiEnabled,
    isProcessing, robotState, classificationUi, robotFeedbackActive, failedPreviewPending,
    failureCopy, retryImagePath, retryImageFile, recognitionPreview, elapsedSeconds, processStatus,
    recognizedItems, upcyclingSections, aiEnabledUpcyclingImage, upcyclingImageUrl, upcyclingTaskId, imageLoading,
    rawBboxes, recognizeBBoxSpace, bboxImage, displayBboxes, queueRefreshDisplayBboxes,
    startElapsedClock, stopElapsedClock, resetEnhancedRecognition,
    restoreRecognitionTask, applyRecognitionResult, startUpcyclingPoll, stopUpcyclingPoll, takeUpcyclingSound
  }
}
