<template>
  <view class="app-tabs-shell" :class="{ 'app-tabs-dark': dark }">
    <view v-for="pane in panes" :key="pane.key" class="app-tab-frame"
      :class="{ 'app-tab-visible': pane.tab === activeTab || pane.tab === outgoingTab, 'app-tab-sliding': sliding }"
      :style="frameStyle(pane)" :aria-hidden="pane.tab !== activeTab">
      <AppTabPane :context="pane.context" :page-component="pane.component" @ready="paneReady" />
    </view>
    <view class="app-tabs-bar">
      <view v-for="tab in tabs" :key="tab.id" class="app-tabs-item" :class="[{ active: selectedTab === tab.id }, 'onboarding-target-' + tab.id]"
        @click="selectTab(tab.id)">
        <ManifestIcon :id="tab.icon" class="app-tabs-icon" />
        <text class="app-tabs-label">{{ tab.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { markRaw, nextTick, onBeforeUnmount, ref, shallowReactive } from 'vue'
import { onBackPress, onHide, onLoad, onResize, onShow, onUnload } from '@dcloudio/uni-app'
import AppTabPane from '@/components/AppTabPane.vue'
import ManifestIcon from '@/components/ManifestIcon.vue'
import Home from '@/pages/home/home.vue'
import MapPage from '@/pages/map/map.vue'
import Shop from '@/pages/shop/shop.vue'
import Profile from '@/pages/profile/profile.vue'
import DarkHome from '@/pages-dark/home/home.vue'
import DarkMap from '@/pages-dark/map/map.vue'
import DarkShop from '@/pages-dark/shop/shop.vue'
import DarkProfile from '@/pages-dark/profile/profile.vue'
import { registerAppTabShell, parseAppTabUrl } from '@/utils/app-tab-context.js'
import { emitAppTabHook } from '@/utils/app-tab-lifecycle.js'
import { appVersionGuard } from '@/utils/app-version-guard.js'
import { getRecognitionTask } from '@/utils/recognition/recognition-task.mjs'

const tabs = [
  { id: 'home', icon: 'home', label: '首页' }, { id: 'map', icon: 'map_location', label: '地图' },
  { id: 'shop', icon: 'store', label: '商城' }, { id: 'profile', icon: 'user_profile', label: '我的' }
]
const components = { light: { home: Home, map: MapPage, shop: Shop, profile: Profile },
  dark: { home: DarkHome, map: DarkMap, shop: DarkShop, profile: DarkProfile } }
const panes = shallowReactive([])
const dark = ref(false), activeTab = ref('home'), selectedTab = ref('home'), outgoingTab = ref('')
const sliding = ref(false), started = ref(false)
let transitionRevision = 0
let page, unregister, visible = false, disposed = false, serial = 0, transitionTimer, queued = null
const expiryTimers = new Map()
const duration = 220
const find = tab => panes.find(pane => pane.tab === tab)
const current = () => find(activeTab.value)
function showPane(pane) {
  if (!pane || pane.context.shown) return
  pane.context.shown = true
  emitAppTabHook(pane.context, 'onShow')
}
function hidePane(pane) {
  if (!pane) return
  pane.context.foreground.value = false
  if (!pane.context.shown) return
  pane.context.shown = false
  emitAppTabHook(pane.context, 'onHide')
}

function frameStyle(pane) {
  if (!outgoingTab.value) return pane.tab === activeTab.value
    ? { transform: 'none', zIndex: 'auto' }
    : { transform: 'translateX(110%)', zIndex: 1 }
  const order = tabs.findIndex(tab => tab.id === activeTab.value) - tabs.findIndex(tab => tab.id === outgoingTab.value)
  const sign = order > 0 ? 1 : -1
  let x = 0
  if (outgoingTab.value) {
    if (pane.tab === activeTab.value) x = started.value ? 0 : sign * 100
    if (pane.tab === outgoingTab.value) x = started.value ? -sign * 100 : 0
  }
  return { transform: `translateX(${x}%)`, zIndex: pane.tab === activeTab.value ? 2 : 1 }
}

function release(tab) {
  clearTimeout(expiryTimers.get(tab)); expiryTimers.delete(tab)
  const index = panes.findIndex(pane => pane.tab === tab)
  if (index >= 0) panes.splice(index, 1)
}
function scheduleRelease(tab) {
  clearTimeout(expiryTimers.get(tab))
  expiryTimers.set(tab, setTimeout(() => {
    if (tab === activeTab.value || tab === outgoingTab.value) return
    if (tab === 'home' && getRecognitionTask()?.status === 'pending') { scheduleRelease(tab); return }
    release(tab)
  }, 5 * 60 * 1000))
}
function ensure(target) {
  let pane = find(target.tab)
  const explicitMap = target.tab === 'map' && Object.keys(target.options).some(key => key !== 'from')
  if (pane && explicitMap) { release('map'); pane = null }
  if (pane) return pane
  const context = {
    options: target.options, hooks: {}, foreground: ref(false), ready: false,
    logicalPage: { route: target.route, options: target.options, $getAppWebview: () => page?.$getAppWebview?.() }
  }
  pane = { tab: target.tab, key: ++serial, context, component: markRaw(components[dark.value ? 'dark' : 'light'][target.tab]) }
  panes.push(pane)
  return pane
}
function finishSwitch() {
  clearTimeout(transitionTimer)
  const previous = outgoingTab.value
  outgoingTab.value = ''
  sliding.value = false
  started.value = false
  if (previous) scheduleRelease(previous)
  if (visible && current()?.context.ready) current().context.foreground.value = true
  if (queued) {
    const target = queued
    queued = null
    if (appVersionGuard().allowsPage({ page: target.route })) commitSwitch(target)
    else selectedTab.value = activeTab.value
  }
}
async function enter(pane) {
  const revision = transitionRevision
  const valid = () => !disposed && visible && revision === transitionRevision && pane === current()
  if (!valid() || !pane.context.ready) return
  showPane(pane)
  if (!outgoingTab.value) { pane.context.foreground.value = true; return }
  await nextTick()
  if (!valid()) return
  // Both frames receive one render-layer update after their initial positions exist.
  uni.createSelectorQuery().in(page).select('.app-tab-frame.app-tab-visible').boundingClientRect().exec(() => {
    if (!valid()) return
    sliding.value = true
    started.value = true
    transitionTimer = setTimeout(finishSwitch, duration + 60)
  })
}
let navigationRevision = 0
async function switchTo(target) {
  const revision = ++navigationRevision
  selectedTab.value = target.tab
  const allowed = await appVersionGuard().ensure({ page: target.route, useCached: true })
  if (disposed || revision !== navigationRevision) return false
  if (!allowed) { selectedTab.value = activeTab.value; return false }
  commitSwitch(target)
  return true
}
function commitSwitch(target) {
  if (outgoingTab.value) { queued = target; return }
  if (target.dark !== dark.value) {
    hidePane(current())
    for (const pane of [...panes]) release(pane.tab)
    dark.value = target.dark
  }
  const previous = current()
  if (previous?.tab === target.tab && !Object.keys(target.options).some(key => key !== 'from')) return
  if (previous) {
    hidePane(previous)
    if (previous.tab !== target.tab && visible) outgoingTab.value = previous.tab
    else if (previous.tab !== target.tab) scheduleRelease(previous.tab)
  }
  transitionRevision++
  activeTab.value = target.tab
  clearTimeout(expiryTimers.get(target.tab)); expiryTimers.delete(target.tab)
  const pane = ensure(target)
  if (pane.context.ready) void enter(pane)
}
function selectTab(tab) {
  const prefix = dark.value ? 'pages-dark' : 'pages'
  switchTo(parseAppTabUrl(`/${prefix}/${tab}/${tab}?from=${activeTab.value}`))
}
function paneReady(context) {
  context.ready = true
  const pane = panes.find(item => item.context === context)
  if (pane && pane.tab === activeTab.value && visible) void enter(pane)
}
function memoryWarning() {
  for (const pane of [...panes]) {
    if (pane.tab === activeTab.value || pane.tab === outgoingTab.value) continue
    if (pane.tab === 'home' && getRecognitionTask()?.status === 'pending') continue
    release(pane.tab)
  }
}
onLoad(options => {
  page = getCurrentPages().slice(-1)[0]
  let target = parseAppTabUrl(options?.target)
  if (!target) { try { target = parseAppTabUrl(decodeURIComponent(options?.target || '')) } catch (_) {} }
  target ||= parseAppTabUrl(`/${uni.getStorageSync('app_theme') === 'dark' ? 'pages-dark' : 'pages'}/home/home`)
  dark.value = target.dark
  activeTab.value = selectedTab.value = target.tab
  ensure(target)
  unregister = registerAppTabShell({ page, switchTo, logicalPage: () => current()?.context.logicalPage || page,
    scrollTo: options => current()?.context.scrollTo?.(options) })
  uni.onMemoryWarning?.(memoryWarning)
})
onShow(() => {
  visible = true
  const theme = uni.getStorageSync('app_theme') === 'dark'
  if (theme !== dark.value) { switchTo(parseAppTabUrl(`/${theme ? 'pages-dark' : 'pages'}/${activeTab.value}/${activeTab.value}`)); return }
  if (current()?.context.ready) {
    current().context.foreground.value = true
    showPane(current())
  }
})
onHide(() => {
  visible = false
  navigationRevision++
  transitionRevision++
  queued = null
  finishSwitch()
  hidePane(current())
})
onResize(event => emitAppTabHook(current()?.context, 'onResize', event))
onBackPress(event => {
  if (emitAppTabHook(current()?.context, 'onBackPress', event)) return true
  if (activeTab.value !== 'home') { selectTab('home'); return true }
  return false
})
function dispose() {
  if (disposed) return
  disposed = true
  unregister?.()
  clearTimeout(transitionTimer)
  for (const timer of expiryTimers.values()) clearTimeout(timer)
  expiryTimers.clear()
  uni.offMemoryWarning?.(memoryWarning)
}
onUnload(dispose)
onBeforeUnmount(dispose)
</script>

<style scoped>
.app-tabs-shell { position: fixed; inset: 0; overflow: hidden; background: #f2fcf8; }
.app-tabs-dark { background: #0a0a1e; }
.app-tab-frame { position: absolute; inset: 0; visibility: hidden; pointer-events: none; background: inherit; }
.app-tab-visible { visibility: visible; pointer-events: auto; }
.app-tab-sliding { transition: transform 220ms cubic-bezier(.25,.65,.3,1); pointer-events: none; }
.app-tab-frame:not(.app-tab-visible) :deep(*) { animation-play-state: paused !important; }
.app-tab-frame :deep(.tabbar), .app-tab-frame :deep(.tech-tabbar) { display: none !important; }
.app-tabs-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 120rpx; padding-bottom: env(safe-area-inset-bottom); display: flex; align-items: center; justify-content: space-around; background: rgba(255,255,255,.95); border-top: 2rpx solid #f3f4f6; z-index: 100; }
.app-tabs-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #9ca3af; }
.app-tabs-icon { font-size: 40rpx; margin-bottom: 8rpx; opacity: .6; filter: grayscale(30%); }
.app-tabs-label { font-size: 20rpx; }
.app-tabs-item.active { color: #10b981; font-weight: 600; }
.app-tabs-item.active .app-tabs-icon { opacity: 1; filter: none; transform: scale(1.15) translateY(-4rpx); }
.app-tabs-item:active { opacity: .72; }
.app-tabs-dark .app-tabs-bar { background: rgba(15,15,35,.95); border-color: rgba(64,224,255,.3); box-shadow: 0 -8rpx 24rpx rgba(0,0,0,.3); }
.app-tabs-dark .app-tabs-item.active { color: #40e0ff; }
.app-tabs-dark .app-tabs-item.active .app-tabs-icon { filter: drop-shadow(0 0 8px rgba(64,224,255,.5)); }
</style>
