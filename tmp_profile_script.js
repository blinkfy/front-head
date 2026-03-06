
import { ref, computed, onMounted } from 'vue'
import { userinfo } from '@/api/user'
import { useDeviceConnection } from '@/composables/useDeviceConnection'
import { baseUrl } from '../../api/settings'
import { getAvatarUrl } from '@/utils/avatar-handler.js'

const username = ref('')
const userInfo = ref({})
const loading = ref(false)
const showInfoModal = ref(false)
const showCarbonModal = ref(false)
const isAdmin = ref(false)

const calculateCarbonReduction = (points) => {
  if (!points || points <= 0) return '0g'
  
  const CARBON_FACTORS = {
    recyclable: 0.036,
    kitchen: 0.019,
    hazardous: 0.57,
    other: 0.0075,
    base_classification: 0
  }
  
  const distribution = {
    recyclable: 0.40,
    kitchen: 0.30,
    other: 0.22,
    hazardous: 0.08
  }
  
  let totalReduction = 0
  totalReduction += points * CARBON_FACTORS.base_classification
  totalReduction += points * distribution.recyclable * CARBON_FACTORS.recyclable
  totalReduction += points * distribution.kitchen * CARBON_FACTORS.kitchen
  totalReduction += points * distribution.other * CARBON_FACTORS.other
  totalReduction += points * distribution.hazardous * CARBON_FACTORS.hazardous
  
  if (totalReduction < 0.01) return '0g'
  else if (totalReduction < 1) return `${Math.round(totalReduction * 1000)}g`
  else if (totalReduction < 1000) return `${Math.round(totalReduction * 100) / 100}kg`
  else return `${Math.round(totalReduction / 10) / 100}t`
}

const getCarbonEquivalents = (points) => {
  const carbonText = calculateCarbonReduction(points)
  let carbonKg = 0
  
  if (carbonText.includes('kg')) carbonKg = parseFloat(carbonText)
  else if (carbonText.includes('g')) carbonKg = parseFloat(carbonText) / 1000
  else if (carbonText.includes('t')) carbonKg = parseFloat(carbonText) * 1000
  
  return {
    trees: Math.round((carbonKg / 22) * 10) / 10,
    carKm: Math.round(carbonKg / 0.2),
    electricity: Math.round(carbonKg / 0.85)
  }
}

const { hasConnection, connectedDevice, goToDeviceConnection, points } = useDeviceConnection()

const connectionDuration = computed(() => {
  const connectionTime = uni.getStorageSync('connection')
  if (!connectionTime) return '0鍒嗛挓'
  
  const now = Date.now()
  const diffMinutes = Math.floor((now - connectionTime) / (1000 * 60))
  
  if (diffMinutes < 1) return '鍒氬垰杩炴帴'
  if (diffMinutes < 60) return `${diffMinutes}鍒嗛挓`
  
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  return minutes > 0 ? `${hours}灏忔椂${minutes}鍒嗛挓` : `${hours}灏忔椂`
})

const fetchUserInfo = async () => {
  try {
    loading.value = true
    const token = uni.getStorageSync('token')
    if (!token) {
      username.value = '娓稿'
      isAdmin.value = false
      uni.removeStorageSync('isAdmin')
      return false
    }
    const response = await userinfo()
    if (response.code === 0) {
      userInfo.value = response.data
      points.value = response.data.points || 0
      if (response.data.username) username.value = response.data.username
      const isAdminFromServer = !!(response.data && response.data.isAdmin === true)
      isAdmin.value = isAdminFromServer && uni.getStorageSync('isAdmin')
      try {
        if (isAdminFromServer) uni.setStorageSync('isAdmin', true)
        else uni.removeStorageSync('isAdmin')
        return true
      } catch (e) { return false }
    } else {
      uni.showToast({ title: response.data.msg || '鑾峰彇鐢ㄦ埛淇℃伅澶辫触', icon: 'none' })
      return false
    }
  } catch (error) {
    uni.showToast({ title: error?.msg || '缃戠粶閿欒', icon: 'none' })
    return false
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const savedUser = uni.getStorageSync('savedUser')?.username
  if (savedUser && uni.getStorageSync('autoLogin')) username.value = savedUser
  await fetchUserInfo()
  if (uni.getStorageSync('isAdmin') && !isAdmin.value) uni.removeStorageSync('isAdmin')
  
  // 娣诲姞缁熻椤归紶鏍囪拷韪晥鏋?  if (typeof document !== 'undefined') {
    const statItems = document.querySelectorAll('.stat-item')
    statItems.forEach(item => {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
      
      item.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = item.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
    })
    
    // 娣诲姞鑿滃崟椤归紶鏍囪拷韪晥鏋?
    const menuItems = document.querySelectorAll('.menu-item')
    menuItems.forEach(item => {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
      
      item.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = item.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        item.style.setProperty('--mouse-x', x + '%')
        item.style.setProperty('--mouse-y', y + '%')
      })
    })
    
    // 娣诲姞鐢ㄦ埛鍗＄墖榧犳爣杩借釜鏁堟灉
    const userCard = document.querySelector('.user-card')
    if (userCard) {
      userCard.addEventListener('mousemove', (e) => {
        const rect = userCard.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        userCard.style.setProperty('--mouse-x', x + '%')
        userCard.style.setProperty('--mouse-y', y + '%')
      })
      
      userCard.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = userCard.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        userCard.style.setProperty('--mouse-x', x + '%')
        userCard.style.setProperty('--mouse-y', y + '%')
      })
    }
    
    // 娣诲姞缁熻鍗＄墖榧犳爣杩借釜鏁堟灉
    const statsCard = document.querySelector('.stats-card')
    if (statsCard) {
      statsCard.addEventListener('mousemove', (e) => {
        const rect = statsCard.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        statsCard.style.setProperty('--mouse-x', x + '%')
        statsCard.style.setProperty('--mouse-y', y + '%')
      })
      
      statsCard.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = statsCard.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        statsCard.style.setProperty('--mouse-x', x + '%')
        statsCard.style.setProperty('--mouse-y', y + '%')
      })
    }
    
    // 娣诲姞閫€鍑烘寜閽紶鏍囪拷韪晥鏋?
    const logoutBtn = document.querySelector('.logout-btn')
    if (logoutBtn) {
      logoutBtn.addEventListener('mousemove', (e) => {
        const rect = logoutBtn.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        logoutBtn.style.setProperty('--mouse-x', x + '%')
        logoutBtn.style.setProperty('--mouse-y', y + '%')
      })
      
      logoutBtn.addEventListener('touchmove', (e) => {
        const touch = e.touches[0]
        const rect = logoutBtn.getBoundingClientRect()
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100
        logoutBtn.style.setProperty('--mouse-x', x + '%')
        logoutBtn.style.setProperty('--mouse-y', y + '%')
      })
    }
  }
})

const handleRefresh = async () => {
  if (await fetchUserInfo()) uni.showToast({ title: '鍒锋柊鎴愬姛', icon: 'success' })
}

const showPointsInfo = () => { showInfoModal.value = true }
const closePointsInfo = () => { showInfoModal.value = false }
const showCarbonInfo = () => { showCarbonModal.value = true }
const closeCarbonInfo = () => { showCarbonModal.value = false }
const goToShop = () => { closePointsInfo(); uni.redirectTo({ url: '/pages/shop/shop' }) }

function goHistory() { uni.navigateTo({ url: '/pages/history/history' }) }
function goRanking() { uni.navigateTo({ url: '/pages/ranking/ranking' }) }
function goSettings() { uni.navigateTo({ url: '/pages-nonTheme/settings' }) }
function goAbout() { uni.navigateTo({ url: '/pages-nonTheme/about' }) }
function goGuide() { uni.navigateTo({ url: '/pages/guide/guide' }) }
function goAchievements() {
  const isH5Page = (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    !window.wx &&
    !window.my
  )
  if (isH5Page) {
    window.location.href = '/achievements'
    return
  }
  uni.navigateTo({ url: '/pages-nonTheme/achievements' })
}

async function verifyAdminPermission() {
  const localAdminFlag = uni.getStorageSync('isAdmin')
  if (!localAdminFlag) {
    uni.showToast({ title: '鏃犳潈闄愯闂?, icon: 'none' })
    return false
  }
  try {
    const response = await userinfo()
    if (response && response.data && response.data.isAdmin) return true
    else {
      uni.removeStorageSync('isAdmin')
      isAdmin.value = false
      uni.showToast({ title: '鏉冮檺宸茶繃鏈?, icon: 'none' })
      return false
    }
  } catch (err) {
    uni.showToast({ title: '鏉冮檺楠岃瘉澶辫触', icon: 'none' })
    return false
  }
}

function goFileManagement() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      const target = encodeURIComponent(baseUrl + '/files')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    }
  })
}

function goDbMonitor() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) uni.navigateTo({ url: '/pages-nonTheme/database' })
  })
}

function goAPITest() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) uni.navigateTo({ url: '/pages-nonTheme/test' })
  })
}

function go2048() {
  verifyAdminPermission().then(hasPermission => {
    if (hasPermission) {
      const target = encodeURIComponent(baseUrl + '/2048/console')
      uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
    } else {
      uni.showToast({ title: '浠呰闂敤鎴风晫闈?, icon: 'none' })
      setTimeout(() => {
        const target = encodeURIComponent(baseUrl + '/2048')
        uni.navigateTo({ url: `/pages-nonTheme/webview?url=${target}` })
      }, 1000)
    }
  })
}

function goHome() { uni.redirectTo({ url: '/pages/home/home' }) }
function goMap() { uni.navigateTo({ url: '/pages/map/map' }) }
function goShop() { uni.redirectTo({ url: '/pages/shop/shop' }) }

