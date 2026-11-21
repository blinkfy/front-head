import { ref } from 'vue'

export function useMapPointReport({ sendReport, onSubmitted, onError }) {
  const showReportModal = ref(false)
  const reportTarget = ref(null)
  const reportReason = ref('')
  const reportSubmitting = ref(false)
  const reportPhotos = ref([])
  const reportPhotoProcessing = ref(false)

  function reportErrorMarker(point, reason = '') {
    if (!point) return
    reportTarget.value = point
    reportReason.value = typeof reason === 'string' ? reason.trim().slice(0, 200) : ''
    reportPhotos.value = []
    reportPhotoProcessing.value = false
    showReportModal.value = true
  }

  function resetReport() {
    showReportModal.value = false
    reportTarget.value = null
    reportReason.value = ''
    reportPhotos.value = []
    reportPhotoProcessing.value = false
  }

  function closeReportModal() {
    if (!reportSubmitting.value) resetReport()
  }

  async function submitReport() {
    const reason = reportReason.value.trim()
    const point = reportTarget.value
    if (!reason || !point || reportSubmitting.value || reportPhotoProcessing.value) return
    reportSubmitting.value = true
    try {
      const deviceId = point.deviceId || point.id || `${point.latitude},${point.longitude}`
      const result = await sendReport(deviceId, reason, reportPhotos.value)
      uni.showToast({ title: result?.msg || '反馈已收到，感谢反馈', icon: 'none' })
      onSubmitted()
      resetReport()
    } catch (error) {
      onError?.(error)
      uni.showToast({ title: error?.msg || error?.message || '上报失败', icon: 'none' })
    } finally {
      reportSubmitting.value = false
    }
  }

  return { showReportModal, reportTarget, reportReason, reportSubmitting, reportPhotos, reportPhotoProcessing,
    reportErrorMarker, resetReport, closeReportModal, submitReport }
}
