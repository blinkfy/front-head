<template>
  <view class="shop-flow" :class="{ 'shop-dark': dark }">
    <view class="shop-flow-header">
      <button class="shop-back" aria-label="返回" @click="emit('back')"><ManifestIcon id="back" :scale="1" /></button>
      <text>{{ title }}</text><view class="shop-header-decoration"></view>
    </view>
    <view class="shop-flow-content"><slot /></view>
    <slot name="fixed" /><slot name="overlay" :dark="dark" />
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ManifestIcon from '@/components/ManifestIcon.vue'
defineProps({ title: { type: String, required: true } })
const emit = defineEmits(['back'])
const dark = ref(uni.getStorageSync('app_theme') === 'dark')
onShow(() => { dark.value = uni.getStorageSync('app_theme') === 'dark' })
</script>
<style src="@/styles/shop-flow.css"></style>
