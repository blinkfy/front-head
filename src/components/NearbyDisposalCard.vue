<template>
  <view class="disposal-card" :class="{ dark }" @click="$emit('open')">
    <ManifestIcon id="map_location" class="disposal-pin" :scale="1.65" />
    <view class="disposal-copy">
      <text class="disposal-title">找附近的投放点</text>
      <text class="disposal-nearest">{{ point.name }} · {{ point.distance }}</text>
    </view>
    <ManifestIcon id="chevron_right" class="disposal-arrow" />
  </view>
</template>

<script setup>
import ManifestIcon from './ManifestIcon.vue'
defineProps({ point: { type: Object, required: true }, dark: Boolean })
defineEmits(['open'])
</script>

<style scoped>
.disposal-card { display: flex; align-items: center; gap: 12px; margin: 12px 0 16px; padding: 10px 12px; border: 1px solid #2cbd92; border-radius: 12px; background: linear-gradient(115deg, #f1fcf8, #e9faf3); box-shadow: 0 3px 12px rgba(16, 185, 129, .08); cursor: pointer; }
.disposal-pin { flex-shrink: 0; color: #089eb5; }
.disposal-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.disposal-title { color: #18353c; font-size: 16px; font-weight: 700; line-height: 21px; }
.disposal-nearest { color: #287b68; font-size: 13px; line-height: 19px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.disposal-arrow { flex-shrink: 0; color: #389b87; }
.dark { background: linear-gradient(115deg, #12372f, #142e35); border-color: #237d69; }
.dark .disposal-title { color: #e3f9f0; }
.dark .disposal-nearest { color: #70dab8; }
</style>
