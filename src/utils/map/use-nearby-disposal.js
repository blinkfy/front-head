import { ref, watch, onBeforeUnmount } from 'vue'
import { getTrashBinList } from '@/api/map'
import { getUserLocationOnce } from '@/utils/location'
import { nearbyDisposalPoints, NEARBY_DISPOSAL_RADIUS } from './nearby-disposal.mjs'

// 在识别开始时并行定位和查点，查询不阻塞图片识别。
export function useNearbyDisposal(classificationUi) {
  const nearbyPoints = ref([])
  const nearbyOrigin = ref(null)
  let revision = 0
  let requested = false
  watch(classificationUi, async state => {
    if (state !== 'recognizing' && (state !== 'complete' || requested)) return
    const current = ++revision
    requested = true
    nearbyPoints.value = []
    nearbyOrigin.value = null
    try {
      const origin = await getUserLocationOnce('gcj02')
      if (current !== revision) return
      const result = await getTrashBinList({ ...origin, radius: NEARBY_DISPOSAL_RADIUS, pageSize: 100 })
      if (current !== revision) return
      nearbyOrigin.value = origin
      nearbyPoints.value = result?.code === 0 && Array.isArray(result.data)
        ? nearbyDisposalPoints(result.data, origin) : []
    } catch (_) {
      // 定位不可用、查询失败或无点位时保持隐藏。
    }
  }, { immediate: true })
  onBeforeUnmount(() => { revision++ })
  return { nearbyPoints, nearbyOrigin }
}
