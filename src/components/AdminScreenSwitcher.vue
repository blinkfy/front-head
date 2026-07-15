<template>
  <view
    ref="switcherRoot"
    :class="[
      'admin-screen-switcher',
      `admin-screen-switcher--${tone}`,
      menuOpen ? 'is-open' : '',
      isNavigating ? 'is-navigating' : ''
    ]"
  >
    <!-- #ifdef H5 -->
    <button
      class="admin-screen-switcher__dialog-trigger"
      type="button"
      aria-label="切换大屏"
      aria-haspopup="menu"
      :aria-expanded="String(menuOpen)"
      :disabled="isNavigating"
      @click.stop="toggleMenu"
      @pointerdown.stop
      @mousedown.stop
      @touchstart.stop
    />

    <dialog
      ref="menuDialog"
      :class="['admin-screen-switcher__dialog', `admin-screen-switcher__dialog--${tone}`]"
      @cancel.prevent="closeMenu"
      @close="menuOpen = false"
      @click.self="closeMenu"
    >
      <view class="admin-screen-switcher__menu" role="menu" @click.stop>
        <button
          v-for="screen in accessibleScreens"
          :key="getScreenKey(screen)"
          :class="[
            'admin-screen-switcher__item',
            isCurrentScreen(screen) ? 'is-current' : ''
          ]"
          type="button"
          role="menuitem"
          :aria-current="isCurrentScreen(screen) ? 'page' : undefined"
          :disabled="isNavigating"
          @click.stop="selectScreen(getScreenKey(screen))"
        >
          <text class="admin-screen-switcher__item-icon">{{ screen.icon || '▣' }}</text>
          <text class="admin-screen-switcher__item-label">{{ screen.shortTitle || screen.title }}</text>
          <text class="admin-screen-switcher__current-mark">{{ isCurrentScreen(screen) ? '当前' : '' }}</text>
        </button>
        <view v-if="!accessibleScreens.length" class="admin-screen-switcher__empty">暂无可访问大屏</view>
      </view>
    </dialog>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <picker
      class="admin-screen-switcher__picker"
      mode="selector"
      :range="accessibleScreens"
      range-key="shortTitle"
      :disabled="isNavigating"
      @change="onPickerChange"
    >
      <view class="admin-screen-switcher__picker-hitbox" />
    </picker>
    <!-- #endif -->

    <view class="admin-screen-switcher__trigger" aria-hidden="true">
      <text class="admin-screen-switcher__trigger-icon">▦</text>
      <text class="admin-screen-switcher__trigger-label">切换大屏</text>
      <text class="admin-screen-switcher__caret">⌄</text>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getAdminScreenList, navigateAdminScreen } from '@/utils/admin-page-nav.js'

const props = defineProps({
  screenKey: {
    type: String,
    required: true
  },
  tone: {
    type: String,
    default: 'dark',
    validator: (value) => ['dark', 'light'].includes(value)
  }
})

const switcherRoot = ref(null)
const menuDialog = ref(null)
const menuOpen = ref(false)
const isNavigating = ref(false)
const accessRevision = ref(0)

const accessibleScreens = computed(() => {
  accessRevision.value
  return getAdminScreenList({ onlyAccessible: true })
})

onMounted(() => {
  accessRevision.value += 1
})

onBeforeUnmount(() => {
  closeMenu()
})

function getScreenKey(screen) {
  return String(screen?.id || screen?.key || screen?.routeKey || '')
}

function isCurrentScreen(screen) {
  return getScreenKey(screen) === props.screenKey
}

function getElement(target) {
  return target?.$el || target || null
}

function positionDialog() {
  const root = getElement(switcherRoot.value)
  const dialog = getElement(menuDialog.value)
  if (!root || !dialog || typeof window === 'undefined') return

  const rect = root.getBoundingClientRect()
  const menuWidth = 190
  const viewportPadding = 8
  const left = Math.min(
    Math.max(viewportPadding, rect.right - menuWidth),
    window.innerWidth - menuWidth - viewportPadding
  )

  dialog.style.setProperty('--admin-screen-menu-left', `${left}px`)
  dialog.style.setProperty('--admin-screen-menu-top', `${rect.bottom + 6}px`)
}

async function toggleMenu() {
  if (isNavigating.value) return
  if (menuOpen.value) {
    closeMenu()
    return
  }

  accessRevision.value += 1
  await nextTick()

  const dialog = getElement(menuDialog.value)
  if (!dialog || typeof dialog.showModal !== 'function') return

  positionDialog()
  dialog.showModal()
  menuOpen.value = true
}

function closeMenu() {
  const dialog = getElement(menuDialog.value)
  if (dialog?.open) dialog.close()
  menuOpen.value = false
}

function onPickerChange(event) {
  const index = Number(event?.detail?.value)
  const screen = accessibleScreens.value[index]
  selectScreen(getScreenKey(screen))
}

async function selectScreen(target) {
  closeMenu()
  if (!target || isNavigating.value || target === props.screenKey) return

  isNavigating.value = true
  try {
    await navigateAdminScreen(target, {
      from: props.screenKey,
      mode: 'navigate'
    })
  } finally {
    isNavigating.value = false
  }
}
</script>

<style scoped>
.admin-screen-switcher {
  position: relative;
  z-index: 1002;
  flex: 0 0 auto;
  width: 112px;
  height: var(--admin-screen-control-height, 36px);
  min-width: 112px;
}

.admin-screen-switcher__dialog-trigger,
.admin-screen-switcher__picker {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.admin-screen-switcher__dialog-trigger {
  padding: 0;
  border: 0;
  border-radius: var(--admin-screen-control-radius, 8px);
  background: transparent;
  appearance: none;
  touch-action: manipulation;
}

.admin-screen-switcher__dialog-trigger:focus-visible {
  outline: 2px solid rgba(63, 177, 239, .72);
  outline-offset: 2px;
}

.admin-screen-switcher__picker-hitbox {
  width: 100%;
  height: 100%;
}

.admin-screen-switcher__trigger {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 0 10px;
  border: 1px solid rgba(126, 221, 255, 0.34);
  border-radius: var(--admin-screen-control-radius, 8px);
  color: #e4f8ff;
  background: rgba(29, 80, 107, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  font-size: var(--admin-screen-control-font-size, 13px);
  font-weight: var(--admin-screen-control-font-weight, 650);
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  transition: border-color .18s ease, background .18s ease, opacity .18s ease;
}

.admin-screen-switcher.is-open .admin-screen-switcher__trigger,
.admin-screen-switcher:active .admin-screen-switcher__trigger {
  border-color: rgba(62, 201, 255, 0.88);
  background: rgba(26, 119, 156, 0.74);
}

.admin-screen-switcher.is-navigating .admin-screen-switcher__trigger {
  opacity: .58;
}

.admin-screen-switcher__trigger-icon {
  color: #67dfff;
  font-size: 15px;
  line-height: 1;
}

.admin-screen-switcher__trigger-label {
  flex: 0 0 auto;
}

.admin-screen-switcher__caret {
  margin-left: 1px;
  color: #9fd7e8;
  font-size: 16px;
  line-height: 10px;
  transform: translateY(-1px);
  transition: transform .18s ease;
}

.admin-screen-switcher.is-open .admin-screen-switcher__caret {
  transform: translateY(1px) rotate(180deg);
}

.admin-screen-switcher__dialog {
  position: fixed;
  z-index: 2147483647;
  top: var(--admin-screen-menu-top, 56px);
  left: var(--admin-screen-menu-left, 8px);
  width: 190px;
  max-width: calc(100vw - 16px);
  margin: 0;
  padding: 0;
  overflow: visible;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  box-shadow: none;
}

.admin-screen-switcher__dialog::backdrop {
  background: transparent;
}

.admin-screen-switcher__menu {
  box-sizing: border-box;
  display: grid;
  width: 190px;
  max-width: calc(100vw - 16px);
  padding: 5px;
  overflow: hidden;
  border: 1px solid rgba(104, 216, 255, 0.38);
  border-radius: 8px;
  background: rgba(5, 28, 43, 0.98);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.28);
}

.admin-screen-switcher__item {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  margin: 0;
  padding: 0 9px;
  border: 0;
  border-radius: 5px;
  color: #c9e7f2;
  background: transparent;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, color .16s ease;
}

.admin-screen-switcher__item:hover:not(.is-current),
.admin-screen-switcher__item:focus-visible:not(.is-current) {
  color: #fff;
  background: rgba(46, 173, 218, 0.24);
  outline: none;
}

.admin-screen-switcher__item.is-current {
  color: #fff;
  background: rgba(32, 160, 211, 0.38);
}

.admin-screen-switcher__item-icon {
  display: block;
  width: 18px;
  color: #67dfff;
  font-size: 15px;
  line-height: 1;
  text-align: center;
}

.admin-screen-switcher__item-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-screen-switcher__current-mark {
  display: block;
  width: 32px;
  color: #82e6ff;
  font-size: 11px;
  line-height: 1;
  text-align: right;
}

.admin-screen-switcher__empty {
  padding: 10px 8px;
  color: #8baab5;
  font-size: 12px;
  text-align: center;
}

.admin-screen-switcher--light .admin-screen-switcher__trigger {
  border-color: #c6d8eb;
  color: #31516e;
  background: #fff;
  box-shadow: 0 4px 12px rgba(37, 84, 126, 0.08);
}

.admin-screen-switcher--light.is-open .admin-screen-switcher__trigger,
.admin-screen-switcher--light:active .admin-screen-switcher__trigger {
  border-color: #5594dc;
  color: #1c64bd;
  background: #eef6ff;
}

.admin-screen-switcher--light .admin-screen-switcher__trigger-icon,
.admin-screen-switcher__dialog--light .admin-screen-switcher__item-icon {
  color: #287ce0;
}

.admin-screen-switcher--light .admin-screen-switcher__caret {
  color: #5d7690;
}

.admin-screen-switcher__dialog--light .admin-screen-switcher__menu {
  border-color: #d8e5f2;
  background: #fff;
  box-shadow: 0 14px 30px rgba(35, 77, 121, 0.16);
}

.admin-screen-switcher__dialog--light .admin-screen-switcher__item {
  color: #385672;
}

.admin-screen-switcher__dialog--light .admin-screen-switcher__item:hover:not(.is-current),
.admin-screen-switcher__dialog--light .admin-screen-switcher__item:focus-visible:not(.is-current) {
  color: #124b95;
  background: #eef6ff;
}

.admin-screen-switcher__dialog--light .admin-screen-switcher__item.is-current {
  color: #1c5ea9;
  background: #e4f1ff;
}

.admin-screen-switcher__dialog--light .admin-screen-switcher__current-mark {
  color: #287ce0;
}

.admin-screen-switcher__dialog--light .admin-screen-switcher__empty {
  color: #7a8ea4;
}

@media screen and (max-width: 600px) {
  .admin-screen-switcher {
    flex: 1 1 112px;
    width: auto;
  }
}
</style>
