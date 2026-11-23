import { onMounted, ref } from 'vue'
import { getRanking } from '@/api/ranking'
import { createPageReferrerNavigation } from './page-referrer-navigation.js'

export function useRanking(themeRoot) {
  const { onLoad, setupPageReferrer, goBack } = createPageReferrerNavigation(themeRoot, 'rankingReferrer')
  const rankingData = ref(null)
  const loading = ref(false)
  const currentUsername = ref('')

  onMounted(async () => {
    setupPageReferrer()
    currentUsername.value = uni.getStorageSync('savedUser')?.username || ''
    await loadRanking()
  })

  async function loadRanking() {
    loading.value = true
    try {
      const response = await getRanking()
      if (response.code === 0) {
        rankingData.value = response.data
        return true
      }
      uni.showToast({ title: response.msg || '获取排行榜失败', icon: 'none' })
      return false
    } catch (error) {
      console.error('加载排行榜失败:', error)
      uni.showToast({ title: error?.msg || '网络错误，请稍后重试', icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  async function refreshRanking() {
    if (await loadRanking()) uni.showToast({ title: '刷新成功', icon: 'success' })
  }

  function isCurrentUser(username) {
    return username === currentUsername.value
  }

  return { onLoad, goBack, rankingData, loading, refreshRanking, isCurrentUser }
}

export function getMedalIcon(rank) {
  return ({ 1: 'challenge_champion', 2: 'rank_week', 3: 'rank_month' })[rank] || ''
}

export function formatDate(dateString) {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString || ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatUpdateTime(dateString) {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString || ''
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
