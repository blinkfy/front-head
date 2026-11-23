import { computed, ref } from 'vue'
import { getRecognitionHistory, deleteHistoryRecord, batchDeleteHistoryRecords } from '@/api/history'

export function useHistoryRecords(showPageModal) {
  const historyList = ref([])
  const loading = ref(false)
  const activeFilter = ref('all')
  const selectMode = ref(false)
  const selectedItems = ref([])
  const page = ref(1)
  const totalPages = ref(0)
  let latestRequest = 0

  const hasMore = computed(() => page.value < totalPages.value)
  const isAllSelected = computed(() =>
    historyList.value.length > 0 && selectedItems.value.length === historyList.value.length)

  async function loadHistoryData(isLoadMore = false) {
    if (isLoadMore && loading.value) return
    const requestId = ++latestRequest
    const nextPage = isLoadMore ? page.value + 1 : 1
    loading.value = true
    try {
      const response = await getRecognitionHistory({
        page: nextPage,
        pageSize: 20,
        source: activeFilter.value === 'all' ? undefined : activeFilter.value
      })
      if (requestId !== latestRequest || !response) return
      const { data, pagination } = response
      historyList.value = isLoadMore ? [...historyList.value, ...data] : data
      page.value = isLoadMore ? nextPage : pagination.page
      totalPages.value = pagination.totalPages
    } catch (error) {
      if (requestId !== latestRequest) return
      console.error('加载历史记录失败:', error)
      uni.showToast({ title: error?.msg || '加载失败', icon: 'none' })
    } finally {
      if (requestId === latestRequest) loading.value = false
    }
  }

  function setFilter(filter) {
    if (activeFilter.value === filter) return
    activeFilter.value = filter
    page.value = 1
    totalPages.value = 0
    historyList.value = []
    selectedItems.value = []
    selectMode.value = false
    return loadHistoryData()
  }

  function loadMore() {
    if (hasMore.value && !loading.value) return loadHistoryData(true)
  }

  function toggleSelectMode() {
    selectMode.value = !selectMode.value
    selectedItems.value = []
  }

  function toggleSelect(id) {
    const index = selectedItems.value.indexOf(id)
    if (index > -1) selectedItems.value.splice(index, 1)
    else selectedItems.value.push(id)
  }

  function toggleSelectAll() {
    selectedItems.value = isAllSelected.value ? [] : historyList.value.map(item => item.id)
  }

  function confirmDelete(content, request, onDeleted) {
    return showPageModal({
      title: '确认删除',
      content,
      success: async ({ confirm }) => {
        if (!confirm) return
        uni.showLoading({ title: '删除中...' })
        let toast
        try {
          const response = await request()
          if (response?.code === 0) {
            onDeleted()
            toast = { title: '删除成功', icon: 'success' }
          } else {
            toast = { title: response?.msg || '删除失败', icon: 'none' }
          }
        } catch (error) {
          console.error('删除历史记录失败:', error)
          toast = { title: error?.msg || '删除失败', icon: 'none' }
        } finally {
          uni.hideLoading()
        }
        uni.showToast(toast)
      }
    })
  }

  function batchDelete() {
    const ids = [...selectedItems.value]
    if (ids.length === 0) return
    return confirmDelete(`确定要删除选中的 ${ids.length} 条记录吗？`,
      () => batchDeleteHistoryRecords(ids), () => {
        historyList.value = historyList.value.filter(item => !ids.includes(item.id))
        selectedItems.value = []
        selectMode.value = false
      })
  }

  function deleteItem(id) {
    return confirmDelete('确定要删除这条记录吗？', () => deleteHistoryRecord(id), () => {
      historyList.value = historyList.value.filter(item => item.id !== id)
    })
  }

  return {
    historyList, loading, activeFilter, selectMode, selectedItems, hasMore, isAllSelected,
    loadHistoryData, setFilter, loadMore, toggleSelectMode, toggleSelect, toggleSelectAll, batchDelete, deleteItem
  }
}

// 获取来源标签
export function getSourceLabel(source) {
  const labels = {
    'online': '在线识别',
    'device': '设备识别'
  }
  return labels[source] || '未知来源'
}

// 格式化时间
export function formatTime(timeString) {
  const date = new Date(timeString)
  const now = new Date()
  const diff = now - date

  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚'
  }

  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes}分钟前`
  }

  // 小于1天
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours}小时前`
  }

  // 小于7天
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days}天前`
  }

  // 格式化为日期
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${d} ${hh}:${mm}`
}
