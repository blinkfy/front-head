<template>
    <view :class="['settings-container', { 'dark-theme': isDarkTheme }]">
        <!-- 背景 -->
        <view class="bg-effects">
            <view class="bg-gradient"></view>
        </view>

        <!-- 返回按钮 -->
        <view class="back-btn" @click="goBack">
            <text class="back-icon">←</text>
        </view>

        <!-- 头部 -->
        <view class="settings-header">
            <view class="header-content">
                <text class="header-title">⚙️ 设置</text>
            </view>
        </view>

        <!-- 内容 -->
        <view class="settings-content">
            <!-- 用户资料 -->
            <view class="settings-section">
                <view class="section-title">账户管理</view>
                <view class="setting-item" @click="goEditProfile">
                    <view class="item-left">
                        <text class="item-icon">👤</text>
                        <view class="item-info">
                            <text class="item-title">编辑个人资料</text>
                            <text class="item-desc">修改姓名、头像等信息</text>
                        </view>
                    </view>
                    <text class="item-arrow">›</text>
                </view>

                <view class="setting-item" @click="goChangePassword">
                    <view class="item-left">
                        <text class="item-icon">🔐</text>
                        <view class="item-info">
                            <text class="item-title">修改密码</text>
                            <text class="item-desc">更改您的账户密码</text>
                        </view>
                    </view>
                    <text class="item-arrow">›</text>
                </view>
            </view>

            <!-- 显示设置 -->
            <view class="settings-section">
                <view class="section-title">显示设置</view>
                <view class="setting-item" @click="toggleTheme">
                    <view class="item-left">
                        <text class="item-icon">🌙</text>
                        <view class="item-info">
                            <text class="item-title">深色模式</text>
                            <text class="item-desc">{{ isDarkTheme ? '已启用' : '已禁用' }}</text>
                        </view>
                    </view>
                    <view class="toggle-switch" :class="{ active: isDarkTheme }">
                        <view class="toggle-dot"></view>
                    </view>
                </view>
            </view>

            <!-- 帮助与反馈 -->
            <view class="settings-section">
                <view class="section-title">帮助与反馈</view>
                <view class="setting-item" @click="openAppOnboarding">
                    <view class="item-left">
                        <text class="item-icon">🧭</text>
                        <view class="item-info">
                            <text class="item-title">App 使用指南</text>
                            <text class="item-desc">查看识别、地图和预约回收的基础用法</text>
                        </view>
                    </view>
                    <text class="item-arrow">›</text>
                </view>

                <view class="setting-item" @click="contactService">
                    <view class="item-left">
                        <text class="item-icon">💬</text>
                        <view class="item-info">
                            <text class="item-title">联系客服</text>
                            <text class="item-desc">获取技术支持和反馈</text>
                        </view>
                    </view>
                    <text class="item-arrow">›</text>
                </view>

                <view class="setting-item" @click="goAbout">
                    <view class="item-left">
                        <text class="item-icon">ℹ️</text>
                        <view class="item-info">
                            <text class="item-title">关于应用</text>
                            <text class="item-desc">查看应用信息和版本</text>
                        </view>
                    </view>
                    <text class="item-arrow">›</text>
                </view>
            </view>

            <!-- 数据管理 -->
            <view class="settings-section">
                <view class="section-title">数据管理</view>
                <view class="setting-item" @click="clearData">
                    <view class="item-left">
                        <text class="item-icon">🗑️</text>
                        <view class="item-info">
                            <text class="item-title">清除缓存</text>
                            <text class="item-desc">清除本地缓存和历史记录</text>
                        </view>
                    </view>
                    <text class="item-arrow">›</text>
                </view>
            </view>

            <!-- 退出登录 -->
            <view class="logout-section">
                <view class="logout-btn" @click="logout">
                    <text class="logout-icon">🚪</text>
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
import { ref, onMounted } from 'vue'
import { ThemeManager } from '../utils/theme.js'

const isDarkTheme = ref(false)
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

function goChangePassword() {
    if (isDarkTheme.value) {
        uni.navigateTo({
            url: '/pages-dark/change-password/change-password'
        })
    } else {
        uni.navigateTo({
            url: '/pages/change-password/change-password'
        })
    }
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
            uni.removeStorageSync('token')
            uni.removeStorageSync('isAdmin')
            uni.setStorageSync('autoLogin', false)
            uni.removeStorageSync('connection')
            uni.removeStorageSync('device')
            uni.removeStorageSync('userpoints')
            if (isDarkTheme.value) {
                uni.redirectTo({ url: '/pages-dark/index/index' })
            } else {
                uni.redirectTo({ url: '/pages/index/index' })
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
}

.header-title {
    font-size: 40rpx;
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
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border-radius: 12rpx;
    box-shadow: 0 4rpx 12rpx rgba(239, 68, 68, 0.2);
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
    color: #fff;
}

/* 返回按钮 */
.back-btn {
    position: fixed;
    top: 65rpx;
    left: 25rpx;
    width: 50rpx;
    height: 50rpx;
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
