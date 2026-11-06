<template>
  <view class="recycle-page" :class="{ 'recycle-dark': dark }" :style="{ '--recycle-nav-height': (statusBarHeight + 48) + 'px' }">
    <view class="recycle-nav" :style="{ paddingTop: statusBarHeight + 'px' }"><view class="recycle-nav-row"><button class="recycle-back" aria-label="返回" @click="back">‹</button><text>{{ title }}</text><view class="recycle-nav-spacer" /></view></view>
    <view class="recycle-body"><slot /></view>
  </view>
</template>
<script>
import { recycleBack } from '../api/recycling.js'
export default {
  props: { title: { type: String, default: '预约回收' }, dark: Boolean },
  data: () => ({ statusBarHeight: 20 }),
  mounted() { this.statusBarHeight = (uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()).statusBarHeight || 0 },
  methods: { back: recycleBack }
}
</script>
<style>
@import '../styles/recycling.css';
</style>
