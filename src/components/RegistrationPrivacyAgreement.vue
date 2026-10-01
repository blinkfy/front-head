<template>
  <view class="privacy-agreement" :class="{ 'privacy-agreement-dark': dark, 'privacy-agreement-modal-host': modalOnly }">
    <view v-if="!modalOnly" class="privacy-consent-row" @tap="toggleConsent">
      <view class="privacy-checkbox" :class="{ checked: modelValue }" aria-label="同意用户协议与隐私保护指引">
        <ManifestIcon v-if="modelValue" class="privacy-checkmark" id="confirm" :scale="1" />
      </view>
      <view class="privacy-consent-copy">
        <text class="privacy-consent-text">我已阅读并同意</text>
        <text class="privacy-link" @tap.stop="openDetails">《用户协议与隐私保护指引》</text>
      </view>
    </view>

    <view v-if="visible" class="privacy-modal-mask" @tap="closeDetails">
      <view class="privacy-modal" @tap.stop>
        <view class="privacy-modal-header">
          <text class="privacy-modal-title">用户协议与隐私说明</text>
          <view class="privacy-modal-close-hit" @tap="closeDetails">
            <image class="privacy-modal-close" src="/static/icons/close_32.webp.png" mode="aspectFit" />
          </view>
        </view>

        <scroll-view class="privacy-modal-content" scroll-y>
          <text class="privacy-intro">
            欢迎使用分投侠。我们重视你的信息安全，只会为提供你主动选择的功能处理必要信息。
          </text>

          <view class="privacy-section privacy-section-safe">
            <text class="privacy-section-title">注册账号</text>
            <text class="privacy-section-text">
              注册时填写的用户名和密码，仅用于创建账号、登录和身份验证。
              <!-- #ifdef MP-WEIXIN -->
              在微信小程序中，注册会自动绑定当前微信，已有账号首次绑定需确认。账号可自行开启允许其他微信通过密码登录，此类登录会发送官方消息提醒；勾选“记住我”后可自动登录上次账号，主动退出后停止自动登录。
              <!-- #endif -->
            </text>
          </view>

          <view class="privacy-section">
            <text class="privacy-section-title">功能权限</text>
            <text class="privacy-section-text">
              当你主动使用图片识别、附近点位或语音反馈时，系统才会申请相机或相册、位置、麦克风等对应权限；不使用相关功能时不会调用。
            </text>
          </view>

          <view class="privacy-section">
            <text class="privacy-section-title">由你选择</text>
            <text class="privacy-section-text">
              你可以拒绝或在系统设置中关闭相关权限。关闭后只会影响对应功能，不影响其他可用功能。
            </text>
          </view>

          <view class="privacy-section">
            <text class="privacy-section-title">使用范围</text>
            <text class="privacy-section-text">
              我们不会因注册而自动读取通讯录、短信等与服务无关的信息，也不会将个人信息用于与本服务无关的用途。
            </text>
          </view>

          <text class="privacy-footer-note">
            勾选并创建账号，即表示你已阅读并同意以上说明。
          </text>
        </scroll-view>

        <view class="privacy-modal-action" @tap="closeDetails">我知道了</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import ManifestIcon from './ManifestIcon.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  dark: {
    type: Boolean,
    default: false
  },
  modalOnly: {
    type: Boolean,
    default: false
  },
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'open', 'close'])

function toggleConsent() {
  emit('update:modelValue', !props.modelValue)
}

function openDetails() {
  emit('open')
}

function closeDetails() {
  emit('close')
}
</script>

<style scoped>
.privacy-agreement {
  margin: 4rpx 0 22rpx;
}

.privacy-consent-row {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 8rpx 2rpx;
}

.privacy-checkbox {
  flex: 0 0 auto;
  width: 34rpx;
  height: 34rpx;
  margin-top: 1rpx;
  border: 2rpx solid #a7b4ad;
  border-radius: 8rpx;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.privacy-checkbox.checked {
  border-color: #10b981;
  background: #10b981;
}

.privacy-checkmark {
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
}

.privacy-consent-copy {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  line-height: 1.6;
}

.privacy-consent-text {
  color: #66736c;
  font-size: 24rpx;
}

.privacy-link {
  color: #059669;
  font-size: 24rpx;
  font-weight: 600;
}

.privacy-agreement-modal-host {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 12000;
  margin: 0;
}

.privacy-modal-mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  padding: 32rpx;
  background: rgba(15, 23, 42, 0.46);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.privacy-modal {
  width: 100%;
  max-width: 680rpx;
  max-height: calc(100vh - 64rpx);
  padding: 24rpx;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 24rpx 72rpx rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.privacy-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.privacy-modal-title {
  flex: 1;
  min-width: 0;
  color: #1f2937;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 1.35;
}

.privacy-modal-close-hit {
  flex: 0 0 64rpx;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.privacy-modal-close {
  width: 34rpx;
  height: 34rpx;
}

.privacy-modal-content {
  flex: 1;
  min-height: 0;
  max-height: 58vh;
}

.privacy-intro,
.privacy-footer-note,
.privacy-section-title,
.privacy-section-text {
  display: block;
}

.privacy-intro {
  color: #52605a;
  font-size: 25rpx;
  line-height: 1.75;
  margin-bottom: 20rpx;
}

.privacy-section {
  margin-bottom: 14rpx;
  padding: 18rpx;
  border: 1rpx solid #e5ece8;
  border-radius: 18rpx;
  background: #f8fbf9;
}

.privacy-section-safe {
  border-color: #d1fae5;
  background: #ecfdf5;
}

.privacy-section-title {
  color: #166534;
  font-size: 25rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.privacy-section-text {
  color: #596660;
  font-size: 24rpx;
  line-height: 1.75;
}

.privacy-footer-note {
  color: #7c8982;
  font-size: 22rpx;
  line-height: 1.65;
  padding: 4rpx 4rpx 16rpx;
}

.privacy-modal-action {
  flex: 0 0 auto;
  margin-top: 16rpx;
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #34d399, #059669);
  color: #ffffff;
  font-size: 27rpx;
  font-weight: 700;
  text-align: center;
}

.privacy-agreement-dark .privacy-checkbox {
  border-color: rgba(125, 211, 252, 0.58);
  background: rgba(15, 23, 42, 0.72);
}

.privacy-agreement-dark .privacy-checkbox.checked {
  border-color: #40e0ff;
  background: #1ba9bd;
}

.privacy-agreement-dark .privacy-consent-text {
  color: rgba(255, 255, 255, 0.68);
}

.privacy-agreement-dark .privacy-link {
  color: #67e8f9;
}
</style>
