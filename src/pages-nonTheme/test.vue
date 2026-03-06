<template>
  <view class="test-page">
    <view class="header">
      <view class="test-title">☁ API 测试中心</view>
      <view class="token-info">Token: {{ tokenStatus }}</view>
    </view>

    <!-- API 分类 -->
    <view class="categories-container">
      <view class="categories">
        <view 
          v-for="cat in categories" 
          :key="cat.key"
          class="category-item"
          :class="{ active: currentCategory === cat.key }"
          @click="currentCategory = cat.key"
        >
          <text>{{ cat.icon }} {{ cat.name }}</text>
        </view>
      </view>
    </view>

    <!-- API 按钮列表 -->
    <scroll-view class="apis-scroll" scroll-y>
      <view class="api-grid">
        <view class="api-group" v-for="api in filteredApis" :key="api.name">
          <view class="api-name">{{ api.name }}</view>
          <view class="api-desc">{{ api.desc }}</view>
          <button @click="testApi(api)" class="test-btn" :disabled="loading">
            {{ loading ? '测试中...' : '测试' }}
          </button>
        </view>
      </view>
    </scroll-view>

    <!-- 测试结果 -->
    <view class="test-result">
      <view class="result-header">
        <text class="result-title">测试结果</text>
        <button @click="clearResult" class="clear-btn">清空</button>
      </view>
      <scroll-view class="result-content" scroll-y>
        <text>{{ testResult || '暂无测试结果' }}</text>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { checkHealth ,checkDB } from '@/api/health'
import { login, register, userinfo, logout } from '@/api/user'
import { connectDevice, getDeviceStatus, getConnectedDevices } from '@/api/device'
import { getRecognitionHistory, deleteHistoryRecord } from '@/api/history'
import { recognizeImage } from '@/api/recognize'
import { getRanking } from '@/api/ranking'
import { searchPlaces, reverseGeocoder, searchNearby } from '@/api/map'
import { 
  sendTextMessage, getChatHistory, getChatUserList, deleteMessage, recallMessage, markAsRead
} from '@/api/chat'
import { 
  getUsersList, createUser, updateUser, deleteUser,
  getBinsList, createBin, updateBin, deleteBin,
  getUserDevicesList, createUserDevice, updateUserDevice, deleteUserDevice,
  getHistoryList, createHistory, updateHistory, deleteHistory,
  getMessagesList, createMessage, updateMessage, deleteMessage as deleteMessageFromDB,
  getChatList, createChat, updateChat, deleteChat,
  getDatabaseStats
} from '@/api/database'

const testResult = ref('')
const loading = ref(false)
const currentCategory = ref('health')
const tokenStatus = ref('未登录')

// 分类定义
const categories = [
  { key: 'health', name: '健康', icon: '❤️' },
  { key: 'user', name: '用户', icon: '👤' },
  { key: 'device', name: '设备', icon: '📱' },
  { key: 'history', name: '历史', icon: '📝' },
  { key: 'recognize', name: '识别', icon: '🔍' },
  { key: 'ranking', name: '排行', icon: '🏆' },
  { key: 'map', name: '地图', icon: '🗺️' },
  { key: 'chat', name: '聊天', icon: '💬' },
  { key: 'database', name: '数据库', icon: '💾' }
]

// API 定义
const apis = [
  // 健康检查
  { category: 'health', name: '健康检查', desc: 'GET /health', handler: testHealth },
  { category: 'health', name: '数据库检查', desc: 'GET api/_db_state', handler: testDB },
  
  // 用户相关
  { category: 'user', name: '用户注册', desc: 'POST /api/register', handler: testRegister },
  { category: 'user', name: '用户登录', desc: 'POST /api/login', handler: testLogin },
  { category: 'user', name: '获取用户信息', desc: 'GET /api/userinfo', handler: testGetUserInfo },
  { category: 'user', name: '用户登出', desc: 'POST /api/logout', handler: testLogout },
  { category: 'user', name: '修改密码', desc: 'POST /api/change_password', handler: testChangePassword },
  
  // 设备相关
  { category: 'device', name: '连接设备', desc: 'POST /api/device/connect', handler: testConnectDevice },
  { category: 'device', name: '获取设备状态', desc: 'GET /api/device/status', handler: testGetDeviceStatus },
  { category: 'device', name: '获取已连接设备', desc: 'GET /api/user/connected-devices', handler: testGetConnectedDevices },
  
  // 历史记录
  { category: 'history', name: '获取识别历史', desc: 'GET /api/recognition_history', handler: testGetHistory },
  { category: 'history', name: '删除历史记录', desc: 'DELETE /api/delete_history/:id', handler: testDeleteHistory },
  
  // 识别相关
  { category: 'recognize', name: '图片识别', desc: 'POST /api/recognize', handler: testRecognize },
  
  // 排行榜
  { category: 'ranking', name: '获取排行榜', desc: 'GET /api/ranking', handler: testGetRanking },
  
  // 地图相关
  { category: 'map', name: '搜索地点', desc: '腾讯地图 API', handler: testSearchPlaces },
  { category: 'map', name: '逆地址解析', desc: '腾讯地图 API', handler: testReverseGeocoder },
  { category: 'map', name: '附近搜索', desc: '腾讯地图 API', handler: testSearchNearby },
  
  // 聊天相关
  { category: 'chat', name: '发送文本消息', desc: 'POST /api/chat/send/text', handler: testSendTextMessage },
  { category: 'chat', name: '获取聊天记录', desc: 'GET /api/chat/history', handler: testGetChatHistory },
  { category: 'chat', name: '获取聊天用户列表', desc: 'GET /api/chat/chatlist', handler: testGetChatUserList },
  { category: 'chat', name: '删除消息', desc: 'DELETE /api/chat/message/:id', handler: testDeleteMessage },
  { category: 'chat', name: '撤回消息', desc: 'POST /api/chat/recall/:id', handler: testRecallMessage },
  { category: 'chat', name: '标记已读', desc: 'POST /api/chat/read/:id', handler: testMarkAsRead },
  
  // 数据库管理 - Users
  { category: 'database', name: '[Users] 获取列表', desc: 'GET /api/admin/users', handler: testGetUsersList },
  { category: 'database', name: '[Users] 创建用户', desc: 'POST /api/admin/users', handler: testCreateUser },
  { category: 'database', name: '[Users] 更新用户', desc: 'PUT /api/admin/users/:id', handler: testUpdateUser },
  { category: 'database', name: '[Users] 删除用户', desc: 'DELETE /api/admin/users/:id', handler: testDeleteUser },
  
  // 数据库管理 - Bin
  { category: 'database', name: '[Bin] 获取列表', desc: 'GET /api/admin/bins', handler: testGetBinsList },
  { category: 'database', name: '[Bin] 创建垃圾桶', desc: 'POST /api/admin/bins', handler: testCreateBin },
  { category: 'database', name: '[Bin] 更新垃圾桶', desc: 'PUT /api/admin/bins/:id', handler: testUpdateBin },
  { category: 'database', name: '[Bin] 删除垃圾桶', desc: 'DELETE /api/admin/bins/:id', handler: testDeleteBin },
  
  // 数据库管理 - UserDevice
  { category: 'database', name: '[UserDevice] 获取列表', desc: 'GET /api/admin/user-devices', handler: testGetUserDevicesList },
  { category: 'database', name: '[UserDevice] 创建关联', desc: 'POST /api/admin/user-devices', handler: testCreateUserDevice },
  { category: 'database', name: '[UserDevice] 更新关联', desc: 'PUT /api/admin/user-devices/:userId/:deviceId', handler: testUpdateUserDevice },
  { category: 'database', name: '[UserDevice] 删除关联', desc: 'DELETE /api/admin/user-devices/:userId/:deviceId', handler: testDeleteUserDevice },
  
  // 数据库管理 - History
  { category: 'database', name: '[History] 获取列表', desc: 'GET /api/admin/history', handler: testGetHistoryList },
  { category: 'database', name: '[History] 创建记录', desc: 'POST /api/admin/history', handler: testCreateHistory },
  { category: 'database', name: '[History] 更新记录', desc: 'PUT /api/admin/history/:id', handler: testUpdateHistory },
  { category: 'database', name: '[History] 删除记录', desc: 'DELETE /api/admin/history/:id', handler: testDeleteHistory2 },
  
  // 数据库管理 - Messages
  { category: 'database', name: '[Messages] 获取列表', desc: 'GET /api/admin/messages', handler: testGetMessagesList },
  { category: 'database', name: '[Messages] 创建消息', desc: 'POST /api/admin/messages', handler: testCreateMessage },
  { category: 'database', name: '[Messages] 更新消息', desc: 'PUT /api/admin/messages/:id', handler: testUpdateMessage },
  { category: 'database', name: '[Messages] 删除消息', desc: 'DELETE /api/admin/messages/:id', handler: testDeleteMessageFromDB },
  
  // 数据库管理 - Chat
  { category: 'database', name: '[Chat] 获取列表', desc: 'GET /api/admin/chats', handler: testGetChatList },
  { category: 'database', name: '[Chat] 创建聊天', desc: 'POST /api/admin/chats', handler: testCreateChat },
  { category: 'database', name: '[Chat] 更新聊天', desc: 'PUT /api/admin/chats/:userId/:otherId', handler: testUpdateChat },
  { category: 'database', name: '[Chat] 删除聊天', desc: 'DELETE /api/admin/chats/:userId/:otherId', handler: testDeleteChat },
  
  // 数据库管理 - 统计
  { category: 'database', name: '获取数据库统计', desc: 'GET /api/admin/stats', handler: testGetDatabaseStats }
]

const filteredApis = computed(() => {
  return apis.filter(api => api.category === currentCategory.value)
})

// 通用测试函数
async function testApi(api) {
  loading.value = true
  testResult.value = `正在测试: ${api.name}...\n`
  try {
    await api.handler()
  } catch (err) {
    testResult.value += `\n❌ 错误: ${err.message || JSON.stringify(err)}`
  } finally {
    loading.value = false
  }
}

function clearResult() {
  testResult.value = ''
}

function checkToken() {
  const token = uni.getStorageSync('token')
  tokenStatus.value = token ? '已登录 ✅' : '未登录 ❌'
  if (!token) {
    uni.setStorageSync('autoLogin', false)
    uni.navigateTo({ url: '/pages/index/index' })
  }
}

// ==================== 测试函数实现 ====================

async function testHealth() {
  const res = await checkHealth()
  testResult.value += `\n✅ 成功:\n${JSON.stringify(res, null, 2)}`
}
async function testDB() {
  const res = await checkDB()
  testResult.value += `\n✅ 成功:\n${JSON.stringify(res, null, 2)}`
}

async function testRegister() {
  const username = `test_api_${Date.now()}`
  const res = await register({ username, password: 'test123456' })
  testResult.value += `\n✅ 注册成功 (测试账号: ${username}):\n${JSON.stringify(res, null, 2)}`
}

async function testLogin() {
  const res = await login({ username: 'admin', password: '123456' })
  testResult.value += `\n✅ 登录成功:\n${JSON.stringify(res, null, 2)}`
  checkToken()
}

async function testGetUserInfo() {
  const res = await userinfo()
  testResult.value += `\n✅ 用户信息:\n${JSON.stringify(res, null, 2)}`
}

async function testLogout() {
  const res = await logout()
  testResult.value += `\n✅ 登出成功:\n${JSON.stringify(res, null, 2)}`
  checkToken()
}

async function testChangePassword() {
  testResult.value += `\n⚠️ 修改密码测试已禁用，请在实际页面手动测试以避免影响真实账号`
}

async function testConnectDevice() {
  const testDeviceId = `test_device_${Date.now()}`
  const res = await connectDevice(testDeviceId, 'test_token_123', uni.getStorageSync('token'))
  testResult.value += `\n✅ 连接设备 (测试设备: ${testDeviceId}):\n${JSON.stringify(res, null, 2)}`
}

async function testGetDeviceStatus() {
  const res = await getDeviceStatus('test_device_nonexist')
  testResult.value += `\n✅ 设备状态 (不存在的测试设备):\n${JSON.stringify(res, null, 2)}`
}

async function testGetConnectedDevices() {
  const res = await getConnectedDevices()
  testResult.value += `\n✅ 已连接设备:\n${JSON.stringify(res, null, 2)}`
}

async function testGetHistory() {
  const res = await getRecognitionHistory({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 识别历史:\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteHistory() {
  const res = await deleteHistoryRecord(-999999)
  testResult.value += `\n✅ 删除历史 (测试ID: -999999，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testRecognize() {
  testResult.value += `\n📷 选择图片中...`
  try {
    const chooseRes = await new Promise((resolve, reject) => {
      uni.chooseImage({ count: 1, sourceType: ['album','camera'], success: resolve, fail: reject })
    })
    const filePath = chooseRes.tempFilePaths ? chooseRes.tempFilePaths[0] : (chooseRes.tempFilePath || '')
    if (!filePath) {
      testResult.value += `\n❌ 未选择图片`
      return
    }

    testResult.value += `\n✅ 已选择: ${filePath}`

    // 压缩/准备上传
    let uploadFile = filePath
    try {
      // 优先调用全局压缩方法（如果在 home.vue 中定义则可以复用）
      // 这里尝试使用 window 中可能存在的 compressImage 函数（H5）或使用 uni.compressImage（小程序）
      if (typeof window !== 'undefined' && typeof window.compressImage === 'function') {
        const blob = await window.compressImage(filePath, 0.8, 1024)
        // 将 blob תΪ File（H5 环境）
        const timestamp = Date.now()
        uploadFile = new File([blob], `test_${timestamp}.jpg`, { type: 'image/jpeg' })
      } else if (typeof uni.compressImage === 'function') {
        // 小程序环境使用 uni.compressImage
        const comp = await new Promise((resolve, reject) => {
          uni.compressImage({ src: filePath, quality: 80, success: resolve, fail: reject })
        })
        uploadFile = comp.tempFilePath || filePath
      }
    } catch (compressErr) {
      console.warn('图片压缩失败，使用原图上传:', compressErr)
      uploadFile = filePath
    }

    testResult.value += `\n⬆️ 上传并识别中...`
    const res = await recognizeImage(uploadFile)
    testResult.value += `\n✅ 识别结果:\n${JSON.stringify(res, null, 2)}`
  } catch (err) {
    testResult.value += `\n❌ 图片识别失败: ${err && err.errMsg ? err.errMsg : (err.message || JSON.stringify(err))}`
  }
}

async function testGetRanking() {
  const res = await getRanking()
  testResult.value += `\n✅ 排行榜:\n${JSON.stringify(res, null, 2)}`
}

async function testSearchPlaces() {
  const res = await searchPlaces('垃圾桶', 39.908823, 116.397470, 1000)
  testResult.value += `\n✅ 搜索地点:\n${JSON.stringify(res, null, 2)}`
}

async function testReverseGeocoder() {
  const res = await reverseGeocoder(39.908823, 116.397470)
  testResult.value += `\n✅ 逆地址解析:\n${JSON.stringify(res, null, 2)}`
}

async function testSearchNearby() {
  const res = await searchNearby('垃圾桶', 39.908823, 116.397470, 1000)
  testResult.value += `\n✅ 附近搜索:\n${JSON.stringify(res, null, 2)}`
}

// 聊天相关测试
async function testSendTextMessage() {
  const res = await sendTextMessage({ 
    chatId: 'test_chat_' + Date.now(),
    targetUserId: -1,
    content: 'API测试文本消息: ' + new Date().toLocaleTimeString()
  })
  testResult.value += `\n✅ 发送文本消息:\n${JSON.stringify(res, null, 2)}`
}

async function testGetChatHistory() {
  const res = await getChatHistory({ 
    chatId: 'test_chat_nonexist',
    page: 1,
    pageSize: 10
  })
  testResult.value += `\n✅ 获取聊天记录:\n${JSON.stringify(res, null, 2)}`
}

async function testGetChatUserList() {
  const res = await getChatUserList({ 
    page: 1,
    pageSize: 10
  })
  testResult.value += `\n✅ 获取聊天用户列表:\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteMessage() {
  const res = await deleteMessage('test_msg_id_' + Date.now())
  testResult.value += `\n✅ 删除消息 (测试消息ID):\n${JSON.stringify(res, null, 2)}`
}

async function testRecallMessage() {
  const res = await recallMessage('test_msg_id_' + Date.now())
  testResult.value += `\n✅ 撤回消息 (测试消息ID):\n${JSON.stringify(res, null, 2)}`
}

async function testMarkAsRead() {
  const res = await markAsRead('test_chat_' + Date.now())
  testResult.value += `\n✅ 标记已读:\n${JSON.stringify(res, null, 2)}`
}

// 数据库管理测试 - 使用测试数据避免影响真实数据
async function testGetUsersList() {
  const res = await getUsersList({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 用户列表 (只读操作):\n${JSON.stringify(res, null, 2)}`
}

async function testCreateUser() {
  const username = `test_api_user_${Date.now()}`
  const res = await createUser({ 
    username, 
    password: 'test123456', 
    points: 0 
  })
  testResult.value += `\n✅ 创建用户 (测试用户: ${username}):\n${JSON.stringify(res, null, 2)}`
}

async function testUpdateUser() {
  const res = await updateUser(-1, { points: 100 })
  testResult.value += `\n✅ 更新用户 (测试ID: -1，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteUser() {
  const res = await deleteUser(-999999)
  testResult.value += `\n✅ 删除用户 (测试ID: -999999，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testGetBinsList() {
  const res = await getBinsList({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 垃圾桶列表 (只读操作):\n${JSON.stringify(res, null, 2)}`
}

async function testCreateBin() {
  const binName = `TEST_BIN_${Date.now()}`
  const res = await createBin({ 
    name: binName, 
    type: 'normal',
    status: 'offline',
    review: false,
    latitude: 0,
    longitude: 0
  })
  testResult.value += `\n✅ 创建垃圾桶 (测试垃圾桶: ${binName}):\n${JSON.stringify(res, null, 2)}`
}

async function testUpdateBin() {
  const res = await updateBin(-1, { status: 'online' })
  testResult.value += `\n✅ 更新垃圾桶 (测试ID: -1，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteBin() {
  const res = await deleteBin(-2)
  testResult.value += `\n✅ 删除垃圾桶 (测试ID: -2，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testGetUserDevicesList() {
  const res = await getUserDevicesList({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 用户设备列表 (只读操作):\n${JSON.stringify(res, null, 2)}`
}

async function testCreateUserDevice() {
  const res = await createUserDevice({ userId: -1, deviceId: -1 })
  testResult.value += `\n✅ 创建用户设备 (测试ID: userId=-1, deviceId=-1，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testUpdateUserDevice() {
  const res = await updateUserDevice(-1, -1, {})
  testResult.value += `\n✅ 更新用户设备 (测试ID: userId=-1, deviceId=-1，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteUserDevice() {
  const res = await deleteUserDevice(-2, -2)
  testResult.value += `\n✅ 删除用户设备 (测试ID: userId=-2, deviceId=-2，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testGetHistoryList() {
  const res = await getHistoryList({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 历史记录列表 (只读操作):\n${JSON.stringify(res, null, 2)}`
}

async function testCreateHistory() {
  const res = await createHistory({ 
    userId: -1, 
    category: 'TEST_API_测试分类',
    source: 'online',
    confidence: 99,
    image_url: 'test_api_image.jpg'
  })
  testResult.value += `\n✅ 创建历史记录 (测试数据: userId=-1):\n${JSON.stringify(res, null, 2)}`
}

async function testUpdateHistory() {
  const res = await updateHistory(-1, { confidence: 98 })
  testResult.value += `\n✅ 更新历史记录 (测试ID: -1，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteHistory2() {
  const res = await deleteHistory(-999999)
  testResult.value += `\n✅ 删除历史记录 (测试ID: -999999，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testGetMessagesList() {
  const res = await getMessagesList({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 消息列表 (只读操作):\n${JSON.stringify(res, null, 2)}`
}

async function testCreateMessage() {
  const res = await createMessage({ 
    senderId: -1,
    receiverId: -2,
    type: 'text',
    content: 'API测试消息: ' + new Date().toLocaleTimeString()
  })
  testResult.value += `\n✅ 创建消息 (测试数据: senderId=-1, receiverId=-2):\n${JSON.stringify(res, null, 2)}`
}

async function testUpdateMessage() {
  const res = await updateMessage(-1, { isRead: true })
  testResult.value += `\n✅ 更新消息 (测试ID: -1，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteMessageFromDB() {
  const res = await deleteMessageFromDB(-999999)
  testResult.value += `\n✅ 删除消息 (测试ID: -999999，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testGetChatList() {
  const res = await getChatList({ page: 1, pageSize: 10 })
  testResult.value += `\n✅ 聊天列表 (只读操作):\n${JSON.stringify(res, null, 2)}`
}

async function testCreateChat() {
  const res = await createChat({ 
    userId: -1,
    otherId: -2,
    relationship: 'friend',
    note: 'API测试聊天'
  })
  testResult.value += `\n✅ 创建聊天 (测试数据: userId=-1, otherId=-2):\n${JSON.stringify(res, null, 2)}`
}

async function testUpdateChat() {
  const res = await updateChat(-1, -2, { mute: false, top: false })
  testResult.value += `\n✅ 更新聊天 (测试ID: userId=-1, otherId=-2，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testDeleteChat() {
  const res = await deleteChat(-999999, -999998)
  testResult.value += `\n✅ 删除聊天 (测试ID: userId=-999999, otherId=-999998，不存在):\n${JSON.stringify(res, null, 2)}`
}

async function testGetDatabaseStats() {
  const res = await getDatabaseStats()
  testResult.value += `\n✅ 数据库统计:\n${JSON.stringify(res, null, 2)}`
}
function goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
        uni.navigateBack()
    } else {
        uni.reLaunch({
            url: '/pages/index/index'
        })
    }
}
onMounted(async () => {
  checkToken()
  const localAdminFlag = uni.getStorageSync('isAdmin')
  if (!localAdminFlag) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    setTimeout(() => {
      goBack()
    }, 1000)
  }
  // 2. 向后端验证权限
  try {
    const response = await userinfo()
    if (response && response.data && response.data.isAdmin){
    
    } else {
      // 权限验证失败，清除本地伪造的 isAdmin 标记
      uni.removeStorageSync('isAdmin')
      uni.showToast({ title: '权限已过期或被撤销', icon: 'none' })
      setTimeout(() => {
        goBack()
      }, 1000)
    }
  } catch (err) {
    console.error('权限验证失败:', err)
    uni.showToast({ title: '权限验证失败，请重新登录', icon: 'none' })
    setTimeout(() => {
      goBack()
    }, 1000)
  }
})
</script>

<style scoped>
/* 基准与字体保持与其它页面一致（较大可读字体） */
page, .test-page {
  font-family: 'PingFang SC', 'SF Pro Text', 'Inter', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #222;
}

/* 背景与容器 - 与其它页面保持相近紫色渐变 */
.test-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: linear-gradient(135deg,   #667eea 0%, #764ba2 100%);
  overflow: hidden;
  padding: 24rpx;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12rpx;
  padding: 32rpx;
  background: rgba(255,255,255,0.06);
  border-radius: 18rpx;
  box-shadow: 0 8rpx 30rpx rgba(0,0,0,0.12);
  flex-shrink: 0;
}

.test-title {
  font-size: 44rpx; /* 保持与其它页面一致 */
  font-weight: 700;
  color: #fff;
  margin: 0;
  text-shadow: 0 4rpx 18rpx rgba(0,0,0,0.25);
}

.token-info {
  font-size: 24rpx;
  color: rgba(255,255,255,0.95);
  padding: 8rpx 16rpx;
  background: rgba(0,0,0,0.18);
  border-radius: 12rpx;
  border: 1rpx solid rgba(255,255,255,0.06);
}

/* 分类：响应式网格，保持较大字号 */
.categories-container {
  margin-top: 18rpx;
  padding: 12rpx 6rpx;
}

.categories {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220rpx, 1fr));
  gap: 12rpx;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx 20rpx;
  background: rgba(255,255,255,0.08);
  border-radius: 16rpx;
  font-size: 28rpx; /* 字体不变小 */
  color: #fff;
  box-shadow: 0 6rpx 18rpx rgba(0,0,0,0.12);
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  white-space: nowrap;
}

.category-item:hover { transform: translateY(-4rpx); }

.category-item.active {
  background: rgba(255,255,255,0.98);
  color: #0d1b3a;
  font-weight: 700;
  box-shadow: 0 14rpx 36rpx rgba(0,0,0,0.18);
  transform: translateY(-6rpx);
  border: 1rpx solid rgba(64,224,255,0.12);
}

/* 中间滚动区域：卡片排列，字体保持较大 */
.apis-scroll {
  flex: 1;
  height: 0;
  width: 100%;
  padding: 18rpx 6rpx 18rpx 6rpx;
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.api-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
}

@media (max-width: 700px) {
  .api-grid { grid-template-columns: 1fr; }
}

.api-group {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 180rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: rgba(255,255,255,0.98);
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.12);
  border: 1rpx solid rgba(64,224,255,0.06);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.api-group:hover { transform: translateY(-6rpx); box-shadow: 0 20rpx 40rpx rgba(0,0,0,0.16); }

.api-name {
  font-size: 30rpx; /* 恢复更大尺寸 */
  font-weight: 800;
  color: #0d1b3a;
  margin-bottom: 10rpx;
}

.api-desc {
  font-size: 24rpx; /* 恢复原先较大描述 */
  color: #56607a;
  margin-bottom: 16rpx;
  font-family: 'SF Mono', 'Courier New', monospace;
  padding: 10rpx;
  border-radius: 10rpx;
  background: rgba(102,126,234,0.06);
}

/* 主按钮样式 - 保持大且可点击 */
.test-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  height: 80rpx; /* 保持大按钮 */
  border-radius: 14rpx;
  font-size: 28rpx; /* 恢复按钮字体 */
  font-weight: 800;
  color: #fff;
  background: linear-gradient(90deg,#7b61ff 0%, #4ecdc4 100%);
  border: none;
  box-shadow: 0 10rpx 30rpx rgba(78,205,196,0.18);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
}

.test-btn:active { transform: translateY(2rpx) scale(0.995); }
.test-btn[disabled] { opacity: 0.6; box-shadow: none; background: linear-gradient(90deg,#999 0%, #666 100%); }

/* 测试结果面板 - 与其它页面视觉更接近 */
.test-result {
  height: 380rpx; /* 保持较大可读区域 */
  margin-top: 12rpx;
  border-radius: 14rpx;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(6,10,28,0.92) 0%, rgba(10,12,32,0.96) 100%);
  box-shadow: 0 20rpx 50rpx rgba(4,8,24,0.6);
  flex-shrink: 0;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 100rpx 12rpx 18rpx;
  border-bottom: 1rpx solid rgba(255,255,255,0.03);
}

.result-title { font-size: 26rpx; color: #e6f9e6; font-weight: 800; }
.clear-btn { font-size: 24rpx; padding: 0rpx 16rpx; border-radius: 10rpx;background-color: #ffffffcb;}

.result-content {
  padding: 18rpx;
  font-size: 24rpx; /* 保持大字号 */
  color: #a6f0b8;
  font-family: 'SF Mono','Consolas','Courier New', monospace;
  height: calc(380rpx - 64rpx);
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.7;
}

.result-content:empty::before { content: '💡 点击上方API按钮开始测试...'; color: rgba(166,240,184,0.5); font-size: 20rpx; }

/* 小细节 */
.api-meta { font-size: 16rpx; color: rgba(13,27,58,0.45); margin-top: 8rpx; }

/* 滚动条样式（桌面） */
.apis-scroll::-webkit-scrollbar, .result-content::-webkit-scrollbar { width: 10px; }
.apis-scroll::-webkit-scrollbar-thumb, .result-content::-webkit-scrollbar-thumb { background: rgba(100,120,220,0.28); border-radius: 8px; }

</style>