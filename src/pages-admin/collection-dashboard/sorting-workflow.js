import { ref, computed, nextTick, watch } from 'vue'
import { CENTER_WORKFLOW_MASTER_VIDEO } from '../config/center-workflow-video.js'
import { clamp } from './format.js'

export function useSortingWorkflow({ monitor }) {
  const sortingVisualState = computed(() => {
    const stage = String(monitor.sortingStageText || '')
    if (stage.includes('清洗') || stage.includes('烘干')) {
      return { key: 'washing', label: '清洗消毒运行' }
    }
    if (stage.includes('充电') || stage.includes('电量') || stage.includes('检测') || stage.includes('投放') || monitor.sortingProgress >= 70) {
      return { key: 'inspection', label: '电检质检运行' }
    }
    return { key: 'intake', label: '入站称重运行' }
  })
  const SORTING_WORKFLOW_TOTAL_MS = Math.round(CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds * 1000)
  const masterCueMs = key => Math.round((CENTER_WORKFLOW_MASTER_VIDEO.cuePoints[key]?.startSeconds || 0) * 1000)
  const SORTING_OPERATION_STEPS = [
    { key: 'arrive', label: '抵达分拣中心', at: masterCueMs('arrive'), nextAt: masterCueMs('weigh'), x: 18, y: 57 },
    { key: 'weigh', label: '倾倒称重', at: masterCueMs('weigh'), nextAt: masterCueMs('wash'), x: 24, y: 55 },
    { key: 'wash', label: '内壁清洗', at: masterCueMs('wash'), nextAt: masterCueMs('dry'), x: 43, y: 52 },
    { key: 'dry', label: '消毒烘干', at: masterCueMs('dry'), nextAt: masterCueMs('battery'), x: 56, y: 61 },
    { key: 'battery', label: '状态检测', at: masterCueMs('battery'), nextAt: masterCueMs('charge'), x: 68, y: 60 },
    { key: 'charge', label: '补能充电', at: masterCueMs('charge'), nextAt: masterCueMs('ready'), x: 76, y: 63 },
    { key: 'ready', label: '可再次投放', at: masterCueMs('ready'), nextAt: SORTING_WORKFLOW_TOTAL_MS, x: 82, y: 66 }
  ]
  const sortingOperation = computed(() => {
    const elapsed = clamp(monitor.sortingProgress / 100 * SORTING_WORKFLOW_TOTAL_MS, 0, SORTING_WORKFLOW_TOTAL_MS)
    let current = SORTING_OPERATION_STEPS[0]
    SORTING_OPERATION_STEPS.forEach(step => {
      if (elapsed >= step.at) current = step
    })
    const duration = Math.max(1, current.nextAt - current.at)
    return {
      ...current,
      progress: current.key === 'ready' ? 100 : clamp((elapsed - current.at) / duration * 100, 0, 100)
    }
  })
  const sortingWorkpieceStyle = computed(() => ({
    left: `${sortingOperation.value.x}%`,
    top: `${sortingOperation.value.y}%`
  }))
  const sortingMasterVideoRef = ref(null)
  const sortingMasterVideoReady = ref(false)
  const sortingMasterVideoFailed = ref(false)
  const sortingManualPlaybackActive = ref(false)
  const sortingAutomaticPlaybackActive = ref(false)
  const sortingMasterTimelineSeconds = computed(() => clamp(
    monitor.sortingProgress / 100 * CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds,
    0,
    CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds
  ))
  const sortingWorkflowStarted = computed(() => Boolean(
    sortingAutomaticPlaybackActive.value || sortingManualPlaybackActive.value
  ))
  const sortingStageVideoActive = computed(() => Boolean(
    monitor.active && monitor.scene === 'sorting' && sortingWorkflowStarted.value && sortingMasterVideoReady.value && !sortingMasterVideoFailed.value
  ))
  const sortingDeviceStatus = computed(() => ({
    weigh: '卸料称重中', wash: '清洗消毒中', charge: '补能连接中', battery: '状态检测中'
  }[sortingOperation.value.key] || monitor.sortingStatus))

  function sortingMasterVideoElement() {
    const target = sortingMasterVideoRef.value
    if (!target) return null
    if (typeof target.play === 'function') return target
    const root = target.$el || target
    if (typeof root?.play === 'function') return root
    return root?.querySelector?.('video') || null
  }

  function pauseSortingMasterVideo(resetTime = false) {
    const media = sortingMasterVideoElement()
    if (!media) return
    try { media.pause?.() } catch (_) {}
    if (resetTime) {
      try { media.currentTime = 0 } catch (_) {}
    }
  }

  function seekSortingMasterVideo(seconds) {
    const media = sortingMasterVideoElement()
    if (!media) return
    const target = clamp(seconds, 0, Math.max(0, CENTER_WORKFLOW_MASTER_VIDEO.durationSeconds - 0.04))
    try {
      if (typeof media.fastSeek === 'function') media.fastSeek(target)
      else media.currentTime = target
    } catch (_) {}
  }

  async function playSortingMasterVideo() {
    if (!sortingStageVideoActive.value) return
    await nextTick()
    const media = sortingMasterVideoElement()
    if (!media) return
    try { media.playbackRate = CENTER_WORKFLOW_MASTER_VIDEO.playbackRate } catch (_) {}
    try {
      const promise = media.play?.()
      if (promise?.catch) promise.catch(() => {})
    } catch (_) {}
  }

  function syncSortingMasterVideo(forceSeek = false) {
    if (!monitor.active || monitor.scene !== 'sorting' || !sortingMasterVideoReady.value || sortingMasterVideoFailed.value) return
    if (!sortingWorkflowStarted.value) {
      pauseSortingMasterVideo(true)
      return
    }
    const desiredTime = sortingMasterTimelineSeconds.value
    // The video is positioned once when a stage starts, then left to Chromium's
    // media clock. Repeated currentTime/playbackRate writes cause visible frame
    // drops during the high-motion first half of the master video.
    if (forceSeek) seekSortingMasterVideo(desiredTime)
    playSortingMasterVideo()
  }

  function handleSortingMasterVideoReady() {
    const firstReady = !sortingMasterVideoReady.value
    sortingMasterVideoReady.value = true
    sortingMasterVideoFailed.value = false
    if (firstReady) syncSortingMasterVideo(true)
  }

  function handleSortingMasterVideoEnded() {
    pauseSortingMasterVideo()
  }

  function handleSortingMasterVideoError() {
    sortingMasterVideoFailed.value = true
    pauseSortingMasterVideo()
  }

  watch(sortingWorkflowStarted, started => {
    if (started) {
      nextTick(() => syncSortingMasterVideo(true))
      return
    }
    pauseSortingMasterVideo(true)
  }, { flush: 'post' })

  watch(() => [monitor.active, monitor.scene], ([active, scene]) => {
    if (active && scene === 'sorting') {
      nextTick(() => syncSortingMasterVideo(true))
      return
    }
    pauseSortingMasterVideo(true)
    if (!active) {
      sortingMasterVideoReady.value = false
      sortingMasterVideoFailed.value = false
    }
  }, { flush: 'post' })


  return {
    sortingVisualState,
    SORTING_WORKFLOW_TOTAL_MS,
    masterCueMs,
    SORTING_OPERATION_STEPS,
    sortingOperation,
    sortingWorkpieceStyle,
    sortingMasterVideoRef,
    sortingMasterVideoReady,
    sortingMasterVideoFailed,
    sortingManualPlaybackActive,
    sortingAutomaticPlaybackActive,
    sortingMasterTimelineSeconds,
    sortingWorkflowStarted,
    sortingStageVideoActive,
    sortingDeviceStatus,
    sortingMasterVideoElement,
    pauseSortingMasterVideo,
    seekSortingMasterVideo,
    playSortingMasterVideo,
    syncSortingMasterVideo,
    handleSortingMasterVideoReady,
    handleSortingMasterVideoEnded,
    handleSortingMasterVideoError,
  }
}
