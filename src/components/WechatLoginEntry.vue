<template>
  <view class="wechat-entry" :class="{ 'wechat-entry-dark': dark }">
    <view v-if="pending" class="wechat-bind-note">
      <text class="wechat-bind-title">登录并绑定微信</text>
      <text class="wechat-bind-description">使用原账号密码登录，确认后绑定为当前微信主账号；也可登录已允许其他微信登录的账号。新用户注册时自动绑定。</text>
    </view>
    <template v-else>
      <view class="wechat-divider"><text>或使用微信登录</text></view>
      <button class="wechat-login-button" :disabled="loading" :loading="loading" @tap="$emit('login')">微信登录</button>
      <text class="wechat-hint">首次绑定需确认；其他微信的账号需开启共享登录，勾选“记住我”可自动登录上次账号</text>
    </template>
  </view>
</template>

<script setup>
defineProps({
  pending: Boolean,
  loading: Boolean,
  dark: Boolean
})
defineEmits(['login'])
</script>

<style scoped>
.wechat-entry { margin-top: 28rpx; }
.wechat-divider { display: flex; align-items: center; gap: 20rpx; margin-bottom: 20rpx; color: #84918e; font-size: 24rpx; }
.wechat-divider::before, .wechat-divider::after { content: ''; flex: 1; height: 1rpx; background: #e4ece8; }
.wechat-login-button { background: #eefaf3; color: #198657; border: 1rpx solid #c8e8d7; border-radius: 20rpx; font-size: 30rpx; font-weight: 600; }
.wechat-login-button::after { border: none; }
.wechat-hint { display: block; text-align: center; margin-top: 12rpx; color: #84918e; font-size: 22rpx; }
.wechat-bind-note { padding: 24rpx; border-radius: 20rpx; background: #eefaf3; }
.wechat-bind-title { display: block; color: #198657; font-size: 28rpx; font-weight: 600; }
.wechat-bind-description { display: block; margin-top: 10rpx; color: #61726b; font-size: 25rpx; line-height: 1.6; }
.wechat-entry-dark .wechat-divider, .wechat-entry-dark .wechat-hint { color: #94a3b8; }
.wechat-entry-dark .wechat-divider::before, .wechat-entry-dark .wechat-divider::after { background: #334155; }
.wechat-entry-dark .wechat-login-button, .wechat-entry-dark .wechat-bind-note { background: rgba(52, 211, 153, 0.09); border-color: rgba(52, 211, 153, 0.25); }
.wechat-entry-dark .wechat-login-button, .wechat-entry-dark .wechat-bind-title { color: #6ee7b7; }
.wechat-entry-dark .wechat-bind-description { color: #b5c4c0; }
</style>
