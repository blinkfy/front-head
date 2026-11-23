import { ref } from 'vue'
import { userinfo } from '@/api/user'
// #ifdef APP-PLUS
import { watch } from 'vue'
import { getAppCurrentPages } from '../app-tab-context.js'
import { onShow } from '../app-tab-lifecycle.js'
import { appOfflineSession, getAppCachedProfile } from '../app-offline-session.js'
// #endif

export function useProfileAccount(points, route, {
  networkError = '网络错误',
  permissionExpired = '权限已过期',
  permissionError = '权限验证失败'
} = {}) {
  const username = ref('')
  const userInfo = ref({})
  const loading = ref(false)
  const isAdmin = ref(false)
  // #ifdef APP-PLUS
  let usedOfflineProfile = false
  // #endif

  function clearAdmin() {
    isAdmin.value = false
    uni.removeStorageSync('isAdmin')
  }

  async function fetchUserInfo() {
    try {
      loading.value = true
      const token = uni.getStorageSync('token')
      if (!token) {
        username.value = '游客'
        clearAdmin()
        return false
      }
      // #ifdef APP-PLUS
      if (appOfflineSession.unavailable) {
        const cached = getAppCachedProfile()
        userInfo.value = cached || {}
        username.value = cached?.username || '用户'
        points.value = cached?.points || 0
        isAdmin.value = false
        usedOfflineProfile = true
        return false
      }
      usedOfflineProfile = false
      // #endif
      const response = await userinfo()
      if (token !== uni.getStorageSync('token')) return false
      if (response?.code !== 0 || !response.data) {
        uni.showToast({ title: response?.data?.msg || '获取用户信息失败', icon: 'none' })
        return false
      }
      userInfo.value = response.data
      points.value = response.data.points || 0
      if (response.data.username) username.value = response.data.username
      try {
        if (response.data.isAdmin === true) {
          isAdmin.value = true
          uni.setStorageSync('isAdmin', true)
        } else {
          clearAdmin()
        }
        return true
      } catch (_) {
        return false
      }
    } catch (error) {
      uni.showToast({ title: error?.msg || networkError, icon: 'none' })
      return false
    } finally {
      loading.value = false
    }
  }

  // #ifdef APP-PLUS
  function refreshProfileAfterReconnect() {
    if (usedOfflineProfile && !appOfflineSession.unavailable && uni.getStorageSync('token') &&
        getAppCurrentPages().slice(-1)[0]?.route === route) void fetchUserInfo()
  }
  watch(() => appOfflineSession.unavailable, refreshProfileAfterReconnect)
  onShow(refreshProfileAfterReconnect)
  // #endif

  async function loadInitialProfile() {
    const token = uni.getStorageSync('token')
    const savedUser = uni.getStorageSync('savedUser')?.username
    if (savedUser && uni.getStorageSync('autoLogin')) username.value = savedUser
    await fetchUserInfo()
    if (token === uni.getStorageSync('token') && uni.getStorageSync('isAdmin') && !isAdmin.value) clearAdmin()
  }

  async function handleRefresh() {
    // #ifdef APP-PLUS
    if (appOfflineSession.unavailable) {
      usedOfflineProfile = true
      uni.showToast({ title: '当前离线，联网后可刷新', icon: 'none' })
      return
    }
    // #endif
    if (await fetchUserInfo()) uni.showToast({ title: '刷新成功', icon: 'success' })
  }

  async function verifyAdminPermission() {
    const token = uni.getStorageSync('token')
    if (!token || !uni.getStorageSync('isAdmin')) {
      uni.showToast({ title: '无权限访问', icon: 'none' })
      return false
    }
    try {
      const response = await userinfo()
      if (token !== uni.getStorageSync('token')) return false
      if (response?.code === 0 && response.data?.isAdmin === true) return true
      clearAdmin()
      uni.showToast({ title: permissionExpired, icon: 'none' })
      return false
    } catch (_) {
      uni.showToast({ title: permissionError, icon: 'none' })
      return false
    }
  }

  return { username, userInfo, loading, isAdmin, loadInitialProfile, handleRefresh, verifyAdminPermission }
}
