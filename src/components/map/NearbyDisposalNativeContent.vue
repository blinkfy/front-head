<template>
  <view class="native-root" :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
    <view v-if="collapsed" class="reopen" :style="{ backgroundColor: dark ? 'rgba(22,43,49,0.82)' : 'rgba(252,254,254,0.82)' }" @click="send('open')">
      <text class="reopen-text" :class="{ 'light-text': dark }">附近投放点 · {{ points.length }}</text>
    </view>
    <view v-else class="sheet" :class="{ dark }" :style="{ height: layout.height + 'px' }">
      <view v-if="!layout.wide" class="grip" @touchstart="startResize" @touchmove="moveResize" @touchend="endResize" @touchcancel="endResize">
        <view class="handle" />
      </view>
      <view class="heading">
        <text class="title" :class="{ 'light-text': dark }">附近投放点</text>
        <text class="sort">距离优先 · 5 km 内</text>
        <view class="close" @click="send('collapse')"><text class="close-text">×</text></view>
      </view>
      <scroll-view class="list" scroll-y :style="{ height: Math.max(0, layout.height - 76) + 'px' }">
        <view v-for="point in points" :key="point.id" class="row" :class="{ 'dark-row': dark }" @click="send('select', point.id)">
          <image class="photo" :src="point.image || fallbackImage" mode="aspectFill" @error="imageFailed(point)" />
          <view class="details">
            <text class="name" :class="{ 'light-text': dark }" lines="1">{{ point.name }}</text>
            <text class="address" lines="2">{{ point.distance }} · {{ point.address || point.description || '暂无详细地址' }}</text>
            <text class="type">{{ point.type === 'smart' ? '智能分类投放点' : '生活垃圾投放点' }}</text>
          </view>
          <view class="navigate" @click.stop="send('navigate', point.id)">
            <image class="nav-icon" :src="navigationImage" />
            <text class="nav-text">导航</text>
          </view>
        </view>
      </scroll-view>
      <view v-if="layout.wide" class="grip" @touchstart="startResize" @touchmove="moveResize" @touchend="endResize" @touchcancel="endResize">
        <view class="handle" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getManifestIconPath } from '@/utils/manifest-icons.js'

const props = defineProps({ panelId: { type: String, required: true } })
const topic = `nearby-disposal:${props.panelId}`
const points = ref([])
const dark = ref(false)
const collapsed = ref(false)
const layout = ref({ width: 1, height: 1, top: 0, wide: false })
const fallbackImage = getManifestIconPath('colorful_bin')
const navigationImage = getManifestIconPath('dark_navigation')
let drag

function send(type, id, height) { uni.$emit(`${topic}:action`, { type, id, height }) }
const failedPhotoSources = new Set()
function imageFailed(point) {
  const key = `${point.id}:${point.image || ''}`
  if (!point.id || failedPhotoSources.has(key)) return
  failedPhotoSources.add(key)
  if (point.image !== fallbackImage) send('imageerror', point.id)
}
function update(data) {
  if (data.points) {
    points.value = data.points
    const activeKeys = new Set(data.points.map(point => `${point.id}:${point.image || ''}`))
    for (const key of failedPhotoSources) if (!activeKeys.has(key)) failedPhotoSources.delete(key)
  }
  if (data.layout) layout.value = data.layout
  dark.value = data.dark
  collapsed.value = data.collapsed
  if (collapsed.value) drag = null
}
function touchY(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  // A moving native window changes local clientY; screenY remains stable during resizing.
  return touch?.screenY ?? (Number.isFinite(touch?.clientY) ? touch.clientY + layout.value.top : touch?.pageY)
}
function startResize(event) {
  const y = touchY(event)
  if (Number.isFinite(y)) drag = { y, height: layout.value.height }
}
function moveResize(event) {
  if (!drag) return
  const y = touchY(event)
  if (!Number.isFinite(y)) return
  send('resize', undefined, drag.height + (y - drag.y) * (layout.value.wide ? 1 : -1))
}
function endResize() { drag = null }
uni.$on(`${topic}:state`, update)
onMounted(() => send('ready'))
onBeforeUnmount(() => uni.$off(`${topic}:state`, update))
</script>

<style scoped>
.native-root { background-color: transparent; }
.sheet { background-color: #fcfefe; border-top-left-radius: 24px; border-top-right-radius: 24px; padding-left: 16px; padding-right: 16px; overflow: hidden; }
.dark { background-color: #162b31; }
.grip { height: 30px; align-items: center; justify-content: center; }
.handle { width: 38px; height: 5px; border-radius: 6px; background-color: #c5cfd3; }
.heading { height: 34px; margin-bottom: 12px; flex-direction: row; align-items: center; }
.title { font-size: 20px; font-weight: bold; color: #142f3b; flex: 1; }
.sort { font-size: 12px; color: #839098; margin-right: 8px; }
.close { width: 28px; height: 28px; border-radius: 14px; background-color: #edf3f1; align-items: center; justify-content: center; }
.close-text { font-size: 24px; line-height: 26px; color: #617b77; }
.row { height: 108px; margin-bottom: 12px; padding: 10px; border-radius: 16px; background-color: #f3f8f7; flex-direction: row; align-items: center; }
.dark-row { background-color: #1c373c; }
.photo { width: 64px; height: 84px; border-radius: 12px; margin-right: 10px; }
.details { flex: 1; margin-right: 8px; }
.name { font-size: 15px; line-height: 20px; font-weight: bold; color: #18343f; text-overflow: ellipsis; }
.address { font-size: 12px; line-height: 18px; color: #839098; margin-top: 6px; text-overflow: ellipsis; }
.type { font-size: 11px; line-height: 17px; color: #179c77; margin-top: 6px; }
.navigate { width: 44px; height: 72px; border-radius: 22px; background-color: #e0f7ef; align-items: center; justify-content: center; }
.nav-icon { width: 22px; height: 22px; margin-bottom: 6px; }
.nav-text { color: #079f7c; font-size: 13px; }
.reopen { height: 48px; border-radius: 24px; background-color: #fcfefe; align-items: center; justify-content: center; }
.reopen-text { font-size: 14px; color: #168b70; font-weight: bold; }
.light-text { color: #e3f5ef; }
</style>
