<template>
  <view class="native-root" :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
    <view v-if="selectMode" class="select-content">
      <view class="toolbar">
        <view class="locate-button" :class="dark ? 'dark-control' : 'light-control'" @tap="send('locate')">
          <text class="locate-text" :class="dark ? 'dark-ink' : 'light-ink'">定位</text>
        </view>
        <view class="toolbar-space" />
        <view class="basemap-switch" :class="dark ? 'dark-glass' : 'light-glass'">
          <view class="basemap-options">
            <view class="basemap-option" :class="[!satellite ? 'active-option' : '', satellite ? (dark ? 'dark-option' : 'light-option') : '']" @tap="send('basemap', false)">
              <text class="option-text" :class="!satellite ? 'active-ink' : (dark ? 'dark-ink' : 'light-ink')">普通</text>
            </view>
            <view class="basemap-option" :class="[satellite ? 'active-option' : '', !satellite ? (dark ? 'dark-option' : 'light-option') : '']" @tap="send('basemap', true)">
              <text class="option-text" :class="satellite ? 'active-ink' : (dark ? 'dark-ink' : 'light-ink')">{{ loading ? '加载中' : '卫星' }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="selection-card" :class="dark ? 'dark-card' : 'light-card'">
        <view class="card-content">
          <text class="title" :class="dark ? 'dark-ink' : 'light-ink'">地图选点</text>
          <text class="subtitle" :class="dark ? 'dark-muted' : 'light-muted'">移动地图调整位置</text>
          <text class="coordinates" :class="dark ? 'dark-muted' : 'light-muted'">{{ coordinateText }}</text>
          <view class="card-space" />
          <view class="actions">
            <view class="action-button secondary-button" :class="dark ? 'dark-control' : 'light-control'" @tap="send('cancel')">
              <text class="button-text" :class="dark ? 'dark-ink' : 'light-ink'">取消</text>
            </view>
            <view class="action-button secondary-button center-button" :class="dark ? 'dark-control' : 'light-control'" @tap="send('center')">
              <text class="button-text" :class="dark ? 'dark-ink' : 'light-ink'">选取中心</text>
            </view>
            <view class="action-button confirm-button" :class="coordinatesValid ? 'accent-button' : 'disabled-button'" @tap="confirm">
              <text class="button-text confirm-text">确认</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="basemap-switch normal-switch" :class="dark ? 'dark-glass' : 'light-glass'">
      <view class="basemap-options">
        <view class="basemap-option" :class="[!satellite ? 'active-option' : '', satellite ? (dark ? 'dark-option' : 'light-option') : '']" @tap="send('basemap', false)">
          <text class="option-text" :class="!satellite ? 'active-ink' : (dark ? 'dark-ink' : 'light-ink')">普通</text>
        </view>
        <view class="basemap-option" :class="[satellite ? 'active-option' : '', !satellite ? (dark ? 'dark-option' : 'light-option') : '']" @tap="send('basemap', true)">
          <text class="option-text" :class="satellite ? 'active-ink' : (dark ? 'dark-ink' : 'light-ink')">{{ loading ? '加载中' : '卫星' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { hasValidMapCoordinates } from '@/utils/app-map-controls.mjs'

const props = defineProps({ controlId: { type: String, required: true } })
const topic = `app-map-controls:${props.controlId}`
const selectMode = ref(false)
const dark = ref(false)
const satellite = ref(false)
const loading = ref(false)
const latitude = ref(null)
const longitude = ref(null)
const layout = ref({ width: 132, height: 44 })
const coordinatesValid = computed(() => hasValidMapCoordinates(latitude.value, longitude.value))
const coordinateText = computed(() => coordinatesValid.value
  ? `${Number(latitude.value).toFixed(6)}, ${Number(longitude.value).toFixed(6)}`
  : '等待地图中心坐标…')

function update(state = {}) {
  selectMode.value = !!state.selectMode
  dark.value = !!state.dark
  satellite.value = !!state.satellite
  loading.value = !!state.loading
  latitude.value = state.latitude ?? null
  longitude.value = state.longitude ?? null
  if (state.layout) layout.value = state.layout
}
function send(type, value) {
  const action = { type }
  if (type === 'basemap') action.value = value
  uni.$emit(`${topic}:action`, action)
}
function confirm() {
  if (coordinatesValid.value) send('confirm')
}
uni.$on(`${topic}:state`, update)
onMounted(() => {
  send('ready')
})
onBeforeUnmount(() => {
  uni.$off(`${topic}:state`, update)
})
</script>

<style scoped>
.native-root { background-color: transparent; }
.select-content { flex: 1; }
.toolbar { height: 44px; flex-direction: row; align-items: center; }
.toolbar-space { flex: 1; }
.locate-button { width: 44px; height: 44px; border-radius: 14px; align-items: center; justify-content: center; }
.locate-text { font-size: 14px; }
.basemap-switch { width: 132px; height: 44px; border-radius: 14px; align-items: center; justify-content: center; }
.normal-switch { width: 132px; height: 44px; }
.basemap-options { width: 126px; height: 38px; flex-direction: row; }
.basemap-option { flex: 1; height: 38px; border-radius: 11px; align-items: center; justify-content: center; }
.option-text { font-size: 14px; }
.active-option { background-color: #079b76; }
.light-glass { background-color: rgba(250,253,252,0.88); }
.dark-glass { background-color: rgba(22,43,49,0.9); }
.light-option { background-color: rgba(237,243,241,0.78); }
.dark-option { background-color: rgba(57,75,80,0.9); }
.selection-card { height: 166px; margin-top: 8px; border-radius: 16px; }
.card-content { height: 146px; margin-left: 14px; margin-right: 14px; margin-top: 10px; margin-bottom: 10px; }
.light-card { background-color: rgba(252,254,254,0.94); }
.dark-card { background-color: rgba(22,43,49,0.94); }
.title { height: 23px; font-size: 18px; line-height: 23px; font-weight: bold; }
.subtitle { height: 20px; margin-top: 1px; font-size: 14px; line-height: 20px; }
.coordinates { height: 22px; margin-top: 3px; font-size: 14px; line-height: 22px; }
.card-space { flex: 1; }
.actions { height: 40px; flex-direction: row; align-items: center; }
.action-button { height: 40px; flex: 1; border-radius: 10px; align-items: center; justify-content: center; }
.center-button { margin-left: 8px; margin-right: 8px; }
.secondary-button { background-color: rgba(235,242,240,0.92); }
.dark-control { background-color: rgba(57,75,80,0.94); }
.light-control { background-color: rgba(235,242,240,0.92); }
.button-text { font-size: 15px; }
.accent-button { background-color: #079b76; }
.disabled-button { background-color: #8b9995; }
.confirm-text { color: #ffffff; }
.light-ink { color: #18343f; }
.dark-ink { color: #e3f5ef; }
.active-ink { color: #ffffff; }
.light-muted { color: #77858a; }
.dark-muted { color: #b6c8c8; }
</style>
