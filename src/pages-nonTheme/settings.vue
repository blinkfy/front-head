<template>
    <view :class="['settings-container', { 'dark-theme': isDarkTheme }]">
        <!-- 背景 -->
        <view class="bg-effects">
            <view class="bg-gradient"></view>
        </view>

        <!-- 返回按钮 -->
        <view class="back-btn" @click="goBack">
            <ManifestIcon class="back-icon" id="back" :scale="1" />
        </view>

        <!-- 头部 -->
        <view class="settings-header">
            <view class="header-content">
                <view class="header-title"><ManifestIcon id="settings" size="48rpx" /><text>设置</text></view>
            </view>
        </view>

        <!-- 内容 -->
        <view class="settings-content">
            <!-- 用户资料 -->
            <view class="settings-section">
                <view class="section-title">账户管理</view>
                <view class="setting-item" @click="goEditProfile">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="edit_profile" />
                        <view class="item-info">
                            <text class="item-title">编辑个人资料</text>
                            <text class="item-desc">修改姓名、头像等信息</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>

                <view class="setting-item" @click="goAccountSecurity">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="account_management" />
                        <view class="item-info">
                            <text class="item-title">账号与安全</text>
                            <text class="item-desc">管理登录账号、密码与微信登录权限</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>
            </view>

            <!-- 显示与声音 -->
            <view class="settings-section">
                <view class="section-title">显示与声音</view>
                <view class="setting-item" @click="toggleTheme" role="switch" tabindex="0" aria-label="深色模式" :aria-checked="isDarkTheme" @keydown.enter.prevent="toggleTheme" @keydown.space.prevent="toggleTheme">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="dark_mode" />
                        <view class="item-info">
                            <text class="item-title">深色模式</text>
                            <text class="item-desc">{{ isDarkTheme ? '已启用' : '已禁用' }}</text>
                        </view>
                    </view>
                    <view class="toggle-switch" :class="{ active: isDarkTheme }">
                        <view class="toggle-dot"></view>
                    </view>
                </view>
                <view class="setting-item" @click="toggleUiSounds" role="switch" tabindex="0" aria-label="交互音效" :aria-checked="soundEnabled" @keydown.enter.prevent="toggleUiSounds" @keydown.space.prevent="toggleUiSounds" data-ui-sound-toggle>
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="sound_toggle" />
                        <view class="item-info">
                            <text class="item-title">交互音效</text>
                            <text class="item-desc">{{ soundEnabled ? '已开启，含聊天提示音，聊天跟随系统模式' : '已关闭提示音，聊天振动跟随系统模式' }}</text>
                        </view>
                    </view>
                    <view class="toggle-switch" :class="{ active: soundEnabled }"><view class="toggle-dot"></view></view>
                </view>
                <view v-if="isAndroid" class="setting-item" @click="setupCallPermissions" role="button" tabindex="0" :aria-busy="permissionSetupPending" @keydown.enter.prevent="setupCallPermissions" @keydown.space.prevent="setupCallPermissions">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="notification" />
                        <view class="item-info">
                            <text class="item-title">消息与来电授权</text>
                            <text class="item-desc">{{ permissionSetupDescription }}</text>
                        </view>
                    </view>
                </view>
                <view v-if="isAndroid && backgroundMessagesAdmin" class="setting-item" @click="toggleBackgroundMessages" role="switch" tabindex="0" aria-label="后台消息接收" :aria-checked="backgroundMessagesEnabled" @keydown.enter.prevent="toggleBackgroundMessages" @keydown.space.prevent="toggleBackgroundMessages">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="notification" />
                        <view class="item-info">
                            <text class="item-title">后台消息接收</text>
                            <text class="item-desc">{{ backgroundMessagesEnabled ? '在后台接收通知信息，常驻通知显示接收状态' : '已关闭，开启后可在后台接收通知信息' }}</text>
                        </view>
                    </view>
                    <view class="toggle-switch" :class="{ active: backgroundMessagesEnabled }"><view class="toggle-dot"></view></view>
                </view>
            </view>

            <!-- 帮助与反馈 -->
            <view class="settings-section">
                <view class="section-title">帮助与反馈</view>
                <view class="setting-item" @click="openAppOnboarding">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="user_guide" />
                        <view class="item-info">
                            <text class="item-title">新用户引导</text>
                            <text class="item-desc">查看识别、地图和预约回收的基础用法</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>

                <view class="setting-item" @click="contactService">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="customer_service" />
                        <view class="item-info">
                            <text class="item-title">{{ communityChatEnabled ? '消息与聊天' : '联系客服' }}</text>
                            <text class="item-desc">{{ communityChatEnabled ? '查看会话、联系人和群聊' : '获取技术支持和反馈' }}</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>

                <view class="setting-item" @click="goAbout">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="about_app" />
                        <view class="item-info">
                            <text class="item-title">关于应用</text>
                            <text class="item-desc">查看应用信息和版本</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>
            </view>

            <!-- 数据管理 -->
            <view class="settings-section">
                <view class="section-title">数据管理</view>
                <view v-if="backgroundMessagesAdmin" class="setting-item" @click="goCallRecordings">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="call_recordings" />
                        <view class="item-info">
                            <text class="item-title">通话录音</text>
                            <text class="item-desc">自动录音设置和本地文件</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>
                <view class="setting-item" @click="clearData">
                    <view class="item-left">
                        <ManifestIcon class="item-icon" id="clear_cache" />
                        <view class="item-info">
                            <text class="item-title">清除缓存</text>
                            <text class="item-desc">清除本地缓存和历史记录</text>
                        </view>
                    </view>
                    <ManifestIcon class="item-arrow" id="chevron_right" :scale="1" />
                </view>
            </view>

            <!-- 退出登录 -->
            <view class="logout-section">
                <view class="logout-btn" @click="logout">
                    <ManifestIcon class="logout-icon" id="logout" />
                    <text class="logout-text">退出登录</text>
                </view>
            </view>
        </view>

        <!-- 确认弹窗 -->
        <view v-if="showConfirmModal" class="modal-overlay" @click="showConfirmModal = false">
            <view class="confirm-modal" @click.stop>
                <view class="modal-header">
                    <text class="modal-title">{{ confirmTitle }}</text>
                </view>
                <view class="modal-body">
                    <text class="modal-text">{{ confirmMessage }}</text>
                </view>
                <view class="modal-footer">
                    <view class="modal-btn cancel" @click="showConfirmModal = false">取消</view>
                    <view class="modal-btn confirm" @click="handleConfirm">确认</view>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup>
import { mfaRequest } from '@/api/mfa'
import { clearChatPush } from '@/utils/chat-push.js'
import { communitySocialEnabled } from '@/pages-nonTheme/utils/community-social.js'
import { ensureFeaturePermission, openFeaturePermissionSettings } from '@/utils/feature-permission.js'
import { syncChatPush } from '@/utils/chat-push.js'
import { androidIncomingCallPresentation, openAndroidIncomingCallSettings, androidUnlockedIncomingCallAllowed,
    openAndroidUnlockedIncomingCallSettings, androidBackgroundPopupPermission, openAndroidBackgroundPopupSettings, syncAndroidMessagingPreference } from '@/utils/android-realtime.js'
import { recentRecognition } from '@/utils/recent-recognition.js'
import { clearRecognitionTask } from '@/utils/recognition-task.mjs'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { ThemeManager } from '../utils/theme.js'
import ManifestIcon from '@/components/ManifestIcon.vue'
import { areUiSoundsEnabled, setUiSoundsEnabled, primeUiSounds, playUiSound } from '@/utils/ui-sounds.js'
import { canConfigureBackgroundMessages, readBackgroundMessagesEnabled, writeBackgroundMessagesEnabled } from '@/utils/background-message-preference.mjs'

const communityChatEnabled = ref(false)
onShow(async () => { communityChatEnabled.value = await communitySocialEnabled() })

const soundEnabled = ref(areUiSoundsEnabled())
const isAndroid = ref(false)
const incomingCallStatus = ref('')
const unlockedIncomingAllowed = ref(false)
const backgroundPopupStatus = ref('unknown')
const permissionSetupPending = ref(false)
let permissionSetup = null
const permissionSetupDescription = computed(() => {
    if (permissionSetupPending.value) return '正在引导授权，完成系统设置后返回即可继续'
    const missing = []
    if (incomingCallStatus.value === 'notifications_disabled') missing.push('消息通知')
    if (incomingCallStatus.value === 'channel_low') missing.push('来电横幅')
    if (incomingCallStatus.value === 'full_screen_denied') missing.push('锁屏全屏来电')
    if (!unlockedIncomingAllowed.value) missing.push('亮屏全屏来电')
    if (backgroundPopupStatus.value === 'denied') missing.push('后台弹窗未开启')
    else if (backgroundPopupStatus.value === 'unknown') missing.push('后台弹窗待确认')
    const status = missing.length ? '点此自动检查并授权' + missing.join('、') : '通知与全屏来电已授权'
    return status + (incomingCallStatus.value === 'dnd' ? '，当前遵循系统勿扰' : '')
})
const refreshIncomingCallStatus = () => {
    incomingCallStatus.value = androidIncomingCallPresentation()
    unlockedIncomingAllowed.value = androidUnlockedIncomingCallAllowed()
    backgroundPopupStatus.value = androidBackgroundPopupPermission()
}
onHide(() => { if (permissionSetup) permissionSetup.away = true })
onShow(() => {
    refreshIncomingCallStatus()
    if (permissionSetup) {
        permissionSetup.away = false
        if (!permissionSetup.busy) void advanceCallPermissions()
    }
})
const backgroundMessagesAdmin = ref(canConfigureBackgroundMessages())
const backgroundMessagesEnabled = ref(readBackgroundMessagesEnabled())
const refreshBackgroundMessages = () => {
    backgroundMessagesAdmin.value = canConfigureBackgroundMessages()
    backgroundMessagesEnabled.value = readBackgroundMessagesEnabled()
}
onShow(refreshBackgroundMessages)
uni.$on('chat:background-messages-changed', refreshBackgroundMessages)
uni.$on('chat:background-messages-state', refreshBackgroundMessages)
onUnmounted(() => {
    finishCallPermissionSetup()
    uni.$off('chat:background-messages-changed', refreshBackgroundMessages)
    uni.$off('chat:background-messages-state', refreshBackgroundMessages)
})
function toggleUiSounds() {
    soundEnabled.value = !soundEnabled.value
    setUiSoundsEnabled(soundEnabled.value)
    syncAndroidMessagingPreference()
    refreshIncomingCallStatus()
    if (soundEnabled.value) { primeUiSounds(); playUiSound('confirm', { page: 'pages-nonTheme/settings' }) }
}
function setBackgroundMessagesEnabled(enabled) {
    backgroundMessagesEnabled.value = writeBackgroundMessagesEnabled(enabled)
}
const notificationPermissionPending = ref(false)
async function requestNotifications() {
    const owner = uni.getStorageSync('token') || ''
    const page = getCurrentPages().slice(-1)[0]
    const isCurrent = () => getCurrentPages().slice(-1)[0] === page && owner === (uni.getStorageSync('token') || '')
    const granted = await ensureFeaturePermission('notification', { isCurrent })
    if (!granted || !isCurrent()) return false
    // Android < 13 also has an app-level notification switch.
    // #ifdef APP-PLUS
    try {
        const activity = plus.android.runtimeMainActivity()
        const manager = activity.getSystemService('notification')
        if (Number(plus.android.importClass('android.os.Build$VERSION').SDK_INT) >= 24 && !plus.android.invoke(manager, 'areNotificationsEnabled')) {
            await openFeaturePermissionSettings('notification', { isCurrent }); return false
        }
    } catch (_) {}
    // #endif
    syncChatPush(owner, true)
    syncAndroidMessagingPreference()
    return true
}
function finishCallPermissionSetup() {
    permissionSetup = null
    permissionSetupPending.value = false
}
async function setupCallPermissions() {
    if (permissionSetupPending.value || notificationPermissionPending.value) return
    refreshIncomingCallStatus()
    if (['ready', 'dnd'].includes(incomingCallStatus.value) && unlockedIncomingAllowed.value &&
        ['allowed', 'not_required'].includes(backgroundPopupStatus.value)) {
        uni.showToast({ title: incomingCallStatus.value === 'dnd' ? '授权已完成，当前遵循系统勿扰' : '通知与全屏来电已授权', icon: 'none' })
        return
    }
    finishCallPermissionSetup()
    permissionSetupPending.value = true
    const owner = uni.getStorageSync('token') || ''
    const page = getCurrentPages().slice(-1)[0]
    const answer = await new Promise(resolve => uni.showModal({
        title: '消息与来电授权',
        content: '将自动跳过已允许的项目，依次检查通知、全屏来电和后台弹窗。系统设置中的开关需要你确认，返回后会继续检查。',
        confirmText: '开始授权', success: resolve, fail: () => resolve(null)
    }))
    if (!answer?.confirm || page !== getCurrentPages().slice(-1)[0] || owner !== (uni.getStorageSync('token') || '')) {
        finishCallPermissionSetup()
        return
    }
    permissionSetup = { owner, page, attempted: new Set(), busy: false, away: false }
    await advanceCallPermissions()
}
async function advanceCallPermissions() {
    const flow = permissionSetup
    if (!flow || flow.busy || flow.away) return
    if (flow.page !== getCurrentPages().slice(-1)[0] || flow.owner !== (uni.getStorageSync('token') || '')) {
        finishCallPermissionSetup()
        return
    }
    refreshIncomingCallStatus()
    const status = incomingCallStatus.value
    const step = ['notifications_disabled', 'channel_low', 'full_screen_denied'].includes(status)
        ? status : (!unlockedIncomingAllowed.value ? 'overlay'
            : (['allowed', 'not_required'].includes(backgroundPopupStatus.value) ? '' : 'background_popup'))
    if (!status || !step || flow.attempted.has(step)) {
        finishCallPermissionSetup()
        if (status) uni.showToast({
            title: step === 'background_popup'
                ? (backgroundPopupStatus.value === 'denied' ? '后台弹窗仍未开启，来电将使用通知提醒' : '后台弹窗需在系统设置中确认')
                : (step ? '尚有权限未开启，可稍后重新授权' : (status === 'dnd' ? '授权已完成，当前遵循系统勿扰' : '消息与来电授权已完成')),
            icon: 'none'
        })
        return
    }
    flow.attempted.add(step)
    permissionSetupPending.value = true
    if (step === 'notifications_disabled') {
        flow.busy = true
        notificationPermissionPending.value = true
        try {
            const granted = await requestNotifications()
            if (permissionSetup !== flow) return
            flow.busy = false
            refreshIncomingCallStatus()
            if (!flow.away && (granted || incomingCallStatus.value !== step)) {
                await advanceCallPermissions()
            } else {
                // A settings page may still be opening. Resume only on page show.
                permissionSetupPending.value = false
            }
        } catch (_) {
            if (permissionSetup === flow) {
                finishCallPermissionSetup()
                uni.showToast({ title: '授权检查失败，请稍后重试', icon: 'none' })
            }
        } finally {
            notificationPermissionPending.value = false
        }
        return
    }
    if (step === 'background_popup') {
        flow.busy = true
        const answer = await new Promise(resolve => uni.showModal({
            title: backgroundPopupStatus.value === 'denied' ? '后台弹窗未开启' : '请确认后台弹窗权限',
            content: '后台弹窗（Background pop-ups）与悬浮窗是独立权限。请在系统权限管理中选择分投侠，将“后台弹窗”设为允许；也可从应用详情的“权限／其他权限”进入。返回后会重新检查。',
            confirmText: '去设置', cancelText: '稍后', success: resolve, fail: () => resolve(null)
        }))
        if (permissionSetup !== flow) return
        flow.busy = false
        if (!answer?.confirm || flow.page !== getCurrentPages().slice(-1)[0] || flow.owner !== (uni.getStorageSync('token') || '')) {
            finishCallPermissionSetup()
            return
        }
    }
    const opened = step === 'overlay' ? openAndroidUnlockedIncomingCallSettings()
        : (step === 'background_popup' ? openAndroidBackgroundPopupSettings() : openAndroidIncomingCallSettings())
    if (!opened) {
        finishCallPermissionSetup()
        uni.showToast({ title: '系统设置打开失败，请稍后重试', icon: 'none' })
    }
}
async function toggleBackgroundMessages() {
    if (!canConfigureBackgroundMessages() || notificationPermissionPending.value) return
    if (backgroundMessagesEnabled.value) { setBackgroundMessagesEnabled(false); return }
    notificationPermissionPending.value = true
    try {
        if (await requestNotifications() && canConfigureBackgroundMessages()) setBackgroundMessagesEnabled(true)
    } finally { notificationPermissionPending.value = false }
}
const isDarkTheme = ref(ThemeManager.getTheme() === 'dark')
const showConfirmModal = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref(null)
const ONBOARDING_FORCE_KEY = 'app_onboarding_force_open'

function checkTheme() {
    const theme = uni.getStorageSync('app_theme')
    isDarkTheme.value = theme === 'dark'
}

function toggleTheme() {
    ThemeManager.toggleTheme()
    checkTheme()
}

function goBack() {
    if (isDarkTheme.value) {
        uni.reLaunch({ url: '/pages-dark/profile/profile' })
    } else {
        uni.reLaunch({ url: '/pages/profile/profile' })
    }
}

function goEditProfile() {
    uni.navigateTo({
        url: '/pages-nonTheme/edit-profile'
    })
}

function goAccountSecurity() {
    uni.navigateTo({ url: '/pages-nonTheme/account-security' })
}

function goCallRecordings() {
    uni.navigateTo({ url: '/pages-nonTheme/call-recordings' })
}

function goAbout() {
    uni.navigateTo({
        url: '/pages-nonTheme/about'
    })
}

function contactService() {
    // 可以跳转到客服页面或者打开客服对话
    uni.navigateTo({
        url: '/pages-nonTheme/chatlist'
    })
}

function openAppOnboarding() {
    try {
        uni.setStorageSync(ONBOARDING_FORCE_KEY, true)
    } catch (e) {}
    uni.reLaunch({
        url: isDarkTheme.value ? '/pages-dark/home/home' : '/pages/home/home'
    })
}

function clearData() {
    confirmTitle.value = '清除用户数据'
    confirmMessage.value = '确定要清除所有本地缓存和历史记录吗？此操作无法撤销。'
    confirmAction.value = 'clearData'
    showConfirmModal.value = true
}

function logout() {
    confirmTitle.value = '退出登录'
    confirmMessage.value = '确定要退出登录吗？'
    confirmAction.value = 'logout'
    showConfirmModal.value = true
}

function handleConfirm() {
    if (confirmAction.value === 'clearData') {
        // 清除数据
        try {
            const allKeys = uni.getStorageInfoSync().keys
            allKeys.forEach(key => {
                if (key.startsWith('chat_messages_')||key.startsWith('chatlist_')) {
                    uni.removeStorageSync(key)
                }
            })
            uni.showToast({
                title: '清除成功',
                icon: 'success'
            })
        } catch (e) {
            uni.showToast({
                title: '清除失败',
                icon: 'none'
            })
        }
    } else if (confirmAction.value === 'logout') {
        // 退出登录
        try {
            const exitingToken = uni.getStorageSync('token')
            if (exitingToken) void mfaRequest('logout', {}, exitingToken).catch(() => {})
            clearRecognitionTask()
            recentRecognition.clear('logout')
            clearChatPush()
            uni.removeStorageSync('token')
            uni.removeStorageSync('isAdmin')
            uni.setStorageSync('autoLogin', false)
            // #ifdef MP-WEIXIN
            uni.removeStorageSync('wechat_shared_session')
            uni.removeStorageSync('wechat_last_login')
            // #endif
            uni.removeStorageSync('connection')
            uni.removeStorageSync('device')
            uni.removeStorageSync('userpoints')
            if (isDarkTheme.value) {
                uni.redirectTo({ url: '/pages-dark/index/index?manualLogin=1' })
            } else {
                uni.redirectTo({ url: '/pages/index/index?manualLogin=1' })
            }
        } catch (e) {
            uni.showToast({
                title: '退出失败',
                icon: 'none'
            })
        }
    }
    showConfirmModal.value = false
}

onMounted(() => {
    checkTheme()
    // #ifdef APP-PLUS
    isAndroid.value = typeof plus !== 'undefined' && plus.os?.name === 'Android'
    refreshIncomingCallStatus()
    // #endif
})
</script>

<style scoped>
.settings-container {
    min-height: 100vh;
    background: linear-gradient(180deg, #f0fdf4 0%, #f5f7fa 30%, #f0f9ff 70%, #f5f7fa 100%);
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
}

.settings-container.dark-theme {
    background: linear-gradient(135deg, #1a1a3e 0%, #15213a 30%, #1e2a5f 70%, #2d1b4e 100%);
}

.bg-effects {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
}

.bg-gradient {
    width: 100%;
    height: 100%;
    background: inherit;
}

/* 头部 */
.settings-header {
    position: relative;
    z-index: 10;
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    padding: 40rpx 30rpx 30rpx;
    margin-bottom: 20rpx;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
}

.settings-container.dark-theme .settings-header {
    background: linear-gradient(135deg, #1a1a3e 0%, #16213e 100%);
}

.header-content {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 20rpx;
    min-height: 72rpx;
}

.header-title {
    display: flex;
    align-items: center;
    gap: 12rpx;
    font-size: 40rpx;
    line-height: 1.4;
    font-weight: 700;
    color: #fff;
}

.settings-container.dark-theme .header-title {
    color: #e0e0e0;
}

/* 内容 */
.settings-content {
    position: relative;
    z-index: 10;
    padding: 0 20rpx 100rpx;
}

/* 设置分组 */
.settings-section {
    margin-bottom: 30rpx;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 15rpx;
    overflow: hidden;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
    transition: all 0.3s ease;
}

.settings-container.dark-theme .settings-section {
    background: rgba(30, 30, 50, 0.85);
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.3);
}

.section-title {
    padding: 20rpx 25rpx 15rpx;
    font-size: 28rpx;
    font-weight: 600;
    color: #059669;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);
}

.settings-container.dark-theme .section-title {
    color: #5B8DEE;
    border-bottom-color: rgba(91, 141, 238, 0.15);
}

/* 设置项 */
.setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20rpx 25rpx;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.03);
    transition: all 0.3s ease;
}

.setting-item:last-child {
    border-bottom: none;
}

.setting-item:active {
    background: rgba(5, 150, 105, 0.05);
}

.settings-container.dark-theme .setting-item:active {
    background: rgba(91, 141, 238, 0.1);
}

.item-left {
    display: flex;
    align-items: center;
    flex: 1;
}

.item-icon {
    font-size: 36rpx;
    margin-right: 20rpx;
    flex-shrink: 0;
}

.item-info {
    display: flex;
    flex-direction: column;
}

.item-title {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
    color: #1f2937;
    margin-bottom: 4rpx;
}

.settings-container.dark-theme .item-title {
    color: #e0e0e0;
}

.item-desc {
    display: block;
    font-size: 24rpx;
    color: #9ca3af;
}

.settings-container.dark-theme .item-desc {
    color: #a0a0c0;
}

.item-arrow {
    font-size: 32rpx;
    color: #d1d5db;
    margin-left: 20rpx;
    flex-shrink: 0;
    opacity: 0.62;
    filter: saturate(0.7);
}

.settings-container.dark-theme .item-arrow {
    color: #4a5568;
}

/* 切换开关 */
.toggle-switch {
    width: 52rpx;
    height: 32rpx;
    background: #d1d5db;
    border-radius: 16rpx;
    position: relative;
    margin-left: 20rpx;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 2rpx;
    transition: all 0.3s ease;
}

.toggle-switch.active {
    background: #059669;
    justify-content: flex-end;
}

.settings-container.dark-theme .toggle-switch.active {
    background: #5B8DEE;
}

.toggle-dot {
    width: 28rpx;
    height: 28rpx;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
}

/* 退出登录按钮 */
.logout-section {
    margin-top: 40rpx;
    margin-bottom: 20rpx;
}

.logout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15rpx;
    padding: 20rpx 30rpx;
    background: linear-gradient(135deg, #fff0ed 0%, #ffe4e1 100%);
    border: 1rpx solid #f9d2ce;
    border-radius: 12rpx;
    box-shadow: 0 4rpx 12rpx rgba(193, 92, 91, 0.1);
    transition: all 0.3s ease;
}

.logout-btn:active {
    transform: scale(0.98);
    box-shadow: 0 2rpx 6rpx rgba(239, 68, 68, 0.15);
}

.logout-icon {
    font-size: 32rpx;
}

.logout-text {
    font-size: 28rpx;
    font-weight: 600;
    color: #b95658;
}

/* 返回按钮 */
.back-btn {
    position: fixed;
    top: 65rpx;
    left: 25rpx;
    width: 80rpx;
    height: 80rpx;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
}

.back-btn:active {
    transform: scale(0.9);
    background: rgba(255, 255, 255, 0.95);
}

.settings-container.dark-theme .back-btn {
    background: rgba(137, 136, 136, 0.503);
    border: 2px solid rgba(255, 255, 255, 0.156);
}

.back-btn text {
    font-size: 36rpx;
    font-weight: bold;
    color: #059669;
}

.settings-container.dark-theme .back-btn text {
    color: #5B8DEE;
}

.back-icon {
    font-size: 32rpx;
    font-weight: bold;
    transition: color 0.3s ease;
}

/* 确认弹窗 */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.confirm-modal {
    background: rgba(255, 255, 255, 0.98);
    border-radius: 20rpx;
    width: 80%;
    max-width: 600rpx;
    overflow: hidden;
    box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
}

.settings-container.dark-theme .confirm-modal {
    background: rgba(30, 30, 50, 0.95);
}

@keyframes slideUp {
    from {
        transform: translateY(100rpx);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.modal-header {
    padding: 30rpx 25rpx 20rpx;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);
}

.settings-container.dark-theme .modal-header {
    border-bottom-color: rgba(91, 141, 238, 0.15);
}

.modal-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #1f2937;
}

.settings-container.dark-theme .modal-title {
    color: #e0e0e0;
}

.modal-body {
    padding: 25rpx;
}

.modal-text {
    font-size: 28rpx;
    color: #6b7280;
    line-height: 1.6;
}

.settings-container.dark-theme .modal-text {
    color: #b0b0d0;
}

.modal-footer {
    display: flex;
    gap: 15rpx;
    padding: 20rpx 25rpx;
    border-top: 1rpx solid rgba(0, 0, 0, 0.05);
}

.settings-container.dark-theme .modal-footer {
    border-top-color: rgba(91, 141, 238, 0.15);
}

.modal-btn {
    flex: 1;
    padding: 15rpx 20rpx;
    border-radius: 10rpx;
    text-align: center;
    font-size: 28rpx;
    font-weight: 600;
    transition: all 0.3s ease;
}

.modal-btn.cancel {
    background: rgba(0, 0, 0, 0.05);
    color: #6b7280;
}

.settings-container.dark-theme .modal-btn.cancel {
    background: rgba(91, 141, 238, 0.1);
    color: #b0b0d0;
}

.modal-btn.confirm {
    background: #059669;
    color: #fff;
}

.settings-container.dark-theme .modal-btn.confirm {
    background: #5B8DEE;
}

.modal-btn:active {
    transform: scale(0.95);
}
</style>
