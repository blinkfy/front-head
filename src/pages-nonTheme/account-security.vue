<template>
  <view class="security-page" :class="{ 'dark-theme': isDarkTheme }">
    <view class="page-header">
      <view class="nav-bar">
        <view class="back-btn" role="button" aria-label="返回设置" @click="goBack">
          <ManifestIcon id="back" :scale="1" />
        </view>
        <view class="page-title"><ManifestIcon id="account_management" size="48rpx" /><text>账号与安全</text></view>
      </view>
    </view>

    <view class="page-content">
      <view class="account-card">
        <view class="account-icon">
          <image v-if="!avatarFailed" class="account-avatar" :src="avatarUrl" mode="aspectFill" @error="avatarFailed = true" />
          <ManifestIcon v-else id="profile_user" size="64rpx" />
        </view>
        <view class="account-info">
          <text class="account-label">当前登录账号</text>
          <text class="account-name">{{ username || (profileLoading ? '正在加载…' : '暂时无法获取账号') }}</text>
          <text class="account-hint">登录用户名与个人昵称可不同</text>
        </view>
        <button v-if="profileError" class="retry-btn" @click="loadProfile">重试</button>
      </view>

      <view class="settings-section">
        <text class="section-title">账号与密码</text>
        <view class="setting-item actionable" role="button" @click="goEditUsername">
          <ManifestIcon class="item-icon" id="edit_profile" size="44rpx" />
          <view class="item-info">
            <text class="item-title">修改登录用户名</text>
            <text class="item-desc">用于密码登录，与个人昵称分别设置</text>
          </view>
          <ManifestIcon class="item-arrow" id="chevron_right" size="28rpx" />
        </view>
        <view class="setting-item actionable" role="button" @click="goChangePassword">
          <ManifestIcon class="item-icon" id="password" size="44rpx" />
          <view class="item-info">
            <text class="item-title">修改密码</text>
            <text class="item-desc">验证当前密码后，设置新的登录密码</text>
          </view>
          <ManifestIcon class="item-arrow" id="chevron_right" size="28rpx" />
        </view>
      </view>

      <view class="settings-section">
        <text class="section-title">微信登录</text>
        <view class="setting-item">
          <ManifestIcon class="item-icon" id="wechat" size="44rpx" />
          <view class="item-info">
            <view class="item-heading">
              <text class="item-title">微信绑定</text>
              <text class="status-tag" :class="{ bound: wechatSettingsLoaded && wechatBound }">{{ wechatStatus }}</text>
            </view>
            <text class="item-desc">{{ wechatBindingDescription }}</text>
          </view>
          <button v-if="wechatSettingsError" class="retry-btn" @click="loadWechatSettings">重试</button>
        </view>

        <!-- #ifdef MP-WEIXIN -->
        <view class="setting-item">
          <ManifestIcon class="item-icon" id="account_management" size="44rpx" />
          <view class="item-info">
            <text class="item-title">允许其他微信登录</text>
            <text class="item-desc">{{ wechatSettingsDescription }}</text>
          </view>
          <switch class="login-switch" :checked="allowOtherWechatLogin" :disabled="wechatSettingsBusy || !wechatSettingsLoaded || !wechatCanManage" :color="isDarkTheme ? '#5B8DEE' : '#059669'" aria-label="允许其他微信登录" @change="toggleWechatSharing" />
        </view>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view v-if="wechatSettingsLoaded && wechatBound" class="section-note">微信登录权限请在分投侠小程序中，使用绑定的微信管理。</view>
        <!-- #endif -->
      </view>

      <view class="security-note">
        <text class="note-title">让账号始终由您掌握</text>
        <text class="note-text">请妥善保管登录密码，勿向他人透露。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { getUserProfile, getWechatLoginSettings } from '@/api/user'
import { ThemeManager } from '@/utils/theme.js'
import { getAvatarUrl } from '@/utils/avatar-handler.js'
import { getManifestIconPath } from '@/utils/manifest-icons.js'
import { baseUrl } from '@/api/settings.js'
// #ifdef MP-WEIXIN
import { updateWechatLoginSettings } from '@/api/user'
// #endif

const isDarkTheme = ref(ThemeManager.getTheme() === 'dark')

function readCachedProfile() {
  try {
    if (!uni.getStorageSync('token')) return {}
    const cached = uni.getStorageSync('userInfo')
    return cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : {}
  } catch (_) {
    return {}
  }
}

const profile = ref(readCachedProfile())
const username = computed(() => profile.value.username || '')
const avatarFailed = ref(false)
const avatarUrl = computed(() => typeof profile.value.avatar === 'string' && profile.value.avatar
  ? getAvatarUrl(profile.value.avatar, baseUrl)
  : getManifestIconPath('profile_user'))
const profileLoading = ref(false)
const profileError = ref(false)
const wechatBound = ref(false)
const allowOtherWechatLogin = ref(false)
const wechatCanManage = ref(false)
const wechatSettingsLoaded = ref(false)
const wechatSettingsBusy = ref(false)
const wechatSettingsError = ref(false)
const wechatStatus = computed(() => {
  if (!wechatSettingsLoaded.value) return wechatSettingsError.value ? '获取失败' : '正在加载'
  return wechatBound.value ? '已绑定' : '未绑定'
})
const wechatBindingDescription = computed(() => {
  if (!wechatSettingsLoaded.value) return wechatSettingsError.value ? '暂时无法获取绑定状态，请重试' : '正在获取微信绑定状态…'
  return wechatBound.value ? '已关联微信，可在小程序中登录此账号' : '可在分投侠小程序登录此账号，按提示完成绑定'
})
const wechatSettingsDescription = computed(() => {
  if (wechatSettingsBusy.value) return '正在同步登录权限…'
  if (!wechatSettingsLoaded.value) return '获取微信登录设置后可查看'
  if (!wechatBound.value) return '绑定微信后，可管理其他微信的登录权限'
  if (!wechatCanManage.value) return '仅绑定的微信可修改，请使用绑定的微信登录'
  return allowOtherWechatLogin.value ? '已开启；其他微信可使用密码登录，每次登录发送官方提醒' : '已关闭；其他微信无法登录此账号'
})

async function loadProfile() {
  if (profileLoading.value) return
  const token = uni.getStorageSync('token')
  profileLoading.value = true
  profileError.value = false
  try {
    const result = await getUserProfile()
    if (token !== uni.getStorageSync('token')) return
    if (result.code !== 0 || !result.data?.username) throw new Error('账号获取失败')
    profile.value = result.data
    avatarFailed.value = false
    try {
      const cached = readCachedProfile()
      const sameAccount = !cached.id || cached.id === result.data.id
      uni.setStorageSync('userInfo', {
        ...(sameAccount ? cached : {}),
        id: result.data.id,
        username: result.data.username,
        avatar: result.data.avatar || ''
      })
    } catch (_) {}
  } catch (_) {
    profileError.value = true
  } finally {
    profileLoading.value = false
  }
}

async function loadWechatSettings() {
  if (wechatSettingsBusy.value) return
  wechatSettingsBusy.value = true
  wechatSettingsError.value = false
  wechatSettingsLoaded.value = false
  try {
    const result = await getWechatLoginSettings()
    if (result.code !== 0 || typeof result.data?.bound !== 'boolean') throw new Error('绑定状态获取失败')
    wechatBound.value = result.data.bound
    allowOtherWechatLogin.value = result.data.allowOtherWechatLogin === true
    wechatCanManage.value = result.data.canManage === true
    wechatSettingsLoaded.value = true
  } catch (_) {
    wechatSettingsError.value = true
  } finally {
    wechatSettingsBusy.value = false
  }
}

// #ifdef MP-WEIXIN
async function toggleWechatSharing(event) {
  if (wechatSettingsBusy.value || !wechatSettingsLoaded.value || !wechatCanManage.value) return
  const previousValue = allowOtherWechatLogin.value
  allowOtherWechatLogin.value = event.detail.value
  wechatSettingsBusy.value = true
  try {
    const result = await updateWechatLoginSettings(event.detail.value)
    if (result.code !== 0 || typeof result.data?.allowOtherWechatLogin !== 'boolean') throw new Error(result.msg || '更新失败，请重试')
    allowOtherWechatLogin.value = result.data.allowOtherWechatLogin
    uni.showToast({ title: '登录权限已更新', icon: 'success' })
  } catch (error) {
    allowOtherWechatLogin.value = previousValue
    uni.showToast({ title: error.msg || error.message || '更新失败，请重试', icon: 'none' })
  } finally {
    wechatSettingsBusy.value = false
  }
}
// #endif

function goChangePassword() {
  uni.navigateTo({ url: isDarkTheme.value ? '/pages-dark/change-password/change-password' : '/pages/change-password/change-password' })
}

function goEditUsername() {
  uni.navigateTo({ url: '/pages-nonTheme/edit-profile' })
}

function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.redirectTo({ url: '/pages-nonTheme/settings' })
}

onShow(() => {
  isDarkTheme.value = ThemeManager.getTheme() === 'dark'
  profile.value = readCachedProfile()
  avatarFailed.value = false
  loadProfile()
  loadWechatSettings()
})
</script>

<style scoped>
.security-page {
  --accent: #059669;
  --text: #1f2937;
  --muted: #6b7280;
  --card: rgba(255, 255, 255, 0.92);
  --line: rgba(5, 150, 105, 0.09);
  --tint: rgba(5, 150, 105, 0.07);
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 38%, #f0f9ff 100%);
  color: var(--text);
}
.security-page.dark-theme {
  --accent: #8ab0ff;
  --text: #e0e0ee;
  --muted: #a0a0c0;
  --card: rgba(30, 30, 50, 0.9);
  --line: rgba(139, 170, 235, 0.14);
  --tint: rgba(91, 141, 238, 0.12);
  background: linear-gradient(135deg, #1a1a3e 0%, #15213a 30%, #1e2a5f 70%, #2d1b4e 100%);
}
.page-header { position: relative; z-index: 10; padding: 40rpx 30rpx 30rpx; margin-bottom: 20rpx; background: linear-gradient(135deg, #059669, #047857); color: #fff; box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1); }
.dark-theme .page-header { background: linear-gradient(135deg, #1a1a3e, #16213e); }
.nav-bar { display: flex; align-items: center; justify-content: center; min-height: 72rpx; margin-top: 20rpx; }
.back-btn { position: fixed; top: 65rpx; left: 25rpx; z-index: 100; width: 80rpx; height: 80rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1); }
.back-btn:active { transform: scale(0.9); }
.dark-theme .back-btn { background: rgba(137, 136, 136, 0.503); border: 2px solid rgba(255, 255, 255, 0.156); }
.page-title { display: flex; align-items: center; gap: 12rpx; font-size: 40rpx; line-height: 1.4; font-weight: 700; }
.dark-theme .page-title { color: #e0e0e0; }
.page-content { max-width: 900rpx; margin: 0 auto; padding: 32rpx 24rpx calc(48rpx + env(safe-area-inset-bottom)); }
.account-card, .settings-section { background: var(--card); border: 1rpx solid var(--line); border-radius: 20rpx; box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04); margin-bottom: 28rpx; overflow: hidden; }
.account-card { display: flex; align-items: center; padding: 32rpx 24rpx; }
.account-icon { display: flex; align-items: center; justify-content: center; width: 104rpx; height: 104rpx; border-radius: 50%; overflow: hidden; background: var(--tint); margin-right: 24rpx; flex-shrink: 0; }
.account-avatar { display: block; width: 100%; height: 100%; }
.account-info, .item-info { flex: 1; min-width: 0; }
.account-label { display: block; color: var(--muted); font-size: 24rpx; }
.account-name { display: block; font-size: 34rpx; font-weight: 700; margin: 8rpx 0; overflow-wrap: anywhere; word-break: break-all; }
.account-hint { display: block; color: var(--muted); font-size: 22rpx; line-height: 1.6; }
.section-title { display: block; padding: 22rpx 24rpx 18rpx; color: var(--accent); font-size: 26rpx; font-weight: 600; border-bottom: 1rpx solid var(--line); }
.setting-item { display: flex; align-items: center; padding: 28rpx 24rpx; border-bottom: 1rpx solid var(--line); }
.setting-item:last-child { border-bottom: 0; }
.actionable:active { background: var(--tint); }
.item-icon { margin-right: 20rpx; flex-shrink: 0; }
.item-title { display: block; font-size: 28rpx; font-weight: 500; line-height: 1.5; }
.item-desc { display: block; margin-top: 8rpx; font-size: 24rpx; line-height: 1.65; color: var(--muted); }
.item-arrow { margin-left: 16rpx; opacity: 0.6; flex-shrink: 0; }
.item-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12rpx; }
.status-tag { padding: 2rpx 12rpx; border-radius: 8rpx; background: var(--tint); color: var(--muted); font-size: 22rpx; line-height: 1.6; }
.status-tag.bound { color: var(--accent); }
.retry-btn { flex-shrink: 0; margin: 0 0 0 16rpx; padding: 0 20rpx; background: var(--tint); color: var(--accent); font-size: 24rpx; line-height: 2.5; border-radius: 12rpx; }
.retry-btn::after { border: 0; }
.login-switch { flex-shrink: 0; margin-left: 16rpx; transform: scale(0.8); transform-origin: right center; }
.section-note { padding: 20rpx 24rpx; font-size: 23rpx; color: var(--muted); line-height: 1.7; background: var(--tint); }
.security-note { padding: 12rpx 24rpx; text-align: center; }
.note-title { display: block; font-size: 24rpx; color: var(--muted); }
.note-text { display: block; margin-top: 10rpx; font-size: 22rpx; color: var(--muted); line-height: 1.7; }
</style>
