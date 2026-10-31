<template>
  <view class="binding-reminder-overlay" :class="{ 'reminder-dark': dark }">
    <view class="binding-reminder-dialog" role="dialog" aria-modal="true" aria-label="微信绑定提醒">
      <button class="reminder-close" aria-label="关闭提醒" @click="emit('close')">×</button>
      <view class="reminder-heading"><ManifestIcon id="wechat" :scale="2.4" /><text>微信绑定提醒</text></view>
      <text class="reminder-description">当前账号尚未绑定微信。请尽快在“分投侠”小程序中使用当前账号密码登录，并按提示完成微信绑定。</text>
      <view class="reminder-qr">
        <image v-if="!qrFailed" class="reminder-qr-image qr-saveable-target" :src="qrSource" mode="aspectFit" @load="qrReady = true" @error="qrFailed = true" @longpress="openQrMenu" @contextmenu="suppressQrContextMenu" />
        <text v-if="!qrReady && !qrFailed" class="qr-placeholder">正在加载小程序码…</text>
        <text v-if="qrFailed" class="qr-fallback">小程序码暂不可用，请在微信中搜索“分投侠”</text>
      </view>
      <text class="reminder-note">使用微信扫码或识别相册中的二维码进入小程序，点击“已有账号？立即登录”完成绑定。</text>
      <button class="reminder-confirm" @click="emit('close')">我知道了</button>
    </view>
  </view>
  <WechatQrDownloadMenu :menu="qrMenu" :dark="dark" @close="closeQrMenu" @download="downloadQr" />
</template>

<script setup>
import ManifestIcon from '@/components/ManifestIcon.vue'
import { useWechatQrSave } from '@/utils/use-wechat-qr-save.js'
// #ifdef APP-PLUS || H5
import { useGeneratedRoundCode } from '@/utils/use-generated-roundcode.js'
// #endif
import WechatQrDownloadMenu from '@/components/WechatQrDownloadMenu.vue'
import { ref } from 'vue'
import { baseUrl } from '@/api/settings.js'
const qrSource = ref(String(baseUrl).replace(/\/$/, '') + '/api/registration/wechat-qrcode')
const qrReady = ref(false), qrFailed = ref(false)
const { qrMenu, openQrMenu, closeQrMenu, downloadQr, suppressQrContextMenu } = useWechatQrSave(qrSource, () => !qrReady.value || qrFailed.value)
// #ifdef APP-PLUS || H5
useGeneratedRoundCode(qrSource, () => qrReady.value && !qrFailed.value)
// #endif
defineProps({ dark: Boolean })
const emit = defineEmits(['close'])
</script>

<style scoped>
.binding-reminder-overlay { position: fixed; inset: 0; z-index: 10030; display: flex; justify-content: center; align-items: center; padding: 24px; box-sizing: border-box; background: rgba(13, 43, 35, .48); }
.binding-reminder-dialog { position: relative; width: 100%; max-width: 390px; max-height: 85vh; overflow-y: auto; padding: 28px 24px 22px; border-radius: 24px; box-sizing: border-box; background: #fff; color: #213b33; box-shadow: 0 18px 55px #0a332a30; }
.reminder-close { position: absolute; top: 8px; right: 10px; padding: 0; margin: 0; width: 30px; height: 30px; line-height: 30px; font-size: 25px; background: transparent; color: #81958d; border: 0; }
.reminder-close::after, .reminder-confirm::after { border: 0; }
.reminder-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; font-size: 21px; font-weight: 600; }
.reminder-description { display: block; font-size: 14px; line-height: 1.8; }
.reminder-qr { position: relative; width: 180px; height: 180px; margin: 20px auto 12px; background: #fff; border-radius: 12px; overflow: hidden; }
.reminder-qr-image { width: 100%; height: 100%; }
.qr-placeholder, .qr-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 14px; box-sizing: border-box; text-align: center; color: #738b80; font-size: 13px; line-height: 1.7; background: #f0faf5; }
.reminder-note { display: block; font-size: 12px; line-height: 1.7; color: #7b9186; margin-top: 12px; }
.reminder-confirm { width: 100%; margin-top: 20px; background: #08ad80; border-radius: 999px; color: #fff; font-size: 16px; line-height: 44px; }
.reminder-dark .binding-reminder-dialog { background: #182e2b; color: #edf8f2; }
.reminder-dark .reminder-note { color: #a3b9ac; }
</style>
