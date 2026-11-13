<template>
  <view class="recycle-page" :class="{ 'recycle-dark': dark, 'recycle-workbench': variant === 'workbench' }" :style="{ '--recycle-nav-height': (navInset + (variant === 'workbench' ? 68 : 48)) + 'px' }">
    <view class="recycle-nav" :style="{ paddingTop: navInset + 'px' }"><view class="recycle-nav-row"><button class="recycle-back" aria-label="返回" @click="back"><ManifestIcon v-if="variant === 'workbench'" id="back" :scale="1" /><template v-else>‹</template></button><view v-if="variant === 'workbench'" class="recycle-nav-title"><view class="recycle-nav-icon"><ManifestIcon id="recycling_booking" /></view><text>{{ title }}</text></view><text v-else>{{ title }}</text><view class="recycle-nav-spacer" /></view></view>
    <view class="recycle-body"><slot /></view>
  </view>
</template>
<script>
import { recycleBack } from '../api/recycling.js'
import ManifestIcon from '@/components/ManifestIcon.vue'
export default {
  components: { ManifestIcon },
  props: { title: { type: String, default: '预约回收' }, dark: Boolean, variant: { type: String, default: '' } },
  data: () => ({ statusBarHeight: 20 }),
  computed: { navInset() { return this.variant === 'workbench' ? Math.max(this.statusBarHeight, 22) : this.statusBarHeight } },
  mounted() { this.statusBarHeight = (uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 0 },
  methods: { back: recycleBack }
}
</script>
