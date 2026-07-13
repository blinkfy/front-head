<template>
  <view :class="['admin-screen-switcher', `admin-screen-switcher--${tone}`]" @tap.stop>
    <view
      :class="['admin-screen-switcher__trigger', menuOpen ? 'is-open' : '']"
      role="button"
      :aria-expanded="String(menuOpen)"
      aria-haspopup="menu"
      @tap="toggleMenu"
    >
      <text class="admin-screen-switcher__trigger-icon">▦</text>
      <text class="admin-screen-switcher__trigger-label">切换大屏</text>
      <text :class="['admin-screen-switcher__caret', menuOpen ? 'is-open' : '']">⌄</text>
    </view>

    <view v-if="menuOpen" class="admin-screen-switcher__menu" role="menu">
      <view
        v-for="screen in accessibleScreens"
        :key="screen.id || screen.key || screen.routeKey"
        :class="[
          'admin-screen-switcher__item',
          isCurrentScreen(screen) ? 'is-current' : '',
          isNavigating ? 'is-navigating' : ''
        ]"
        :role="isCurrentScreen(screen) ? 'menuitem' : 'button'"
        :aria-current="isCurrentScreen(screen) ? 'page' : undefined"
        :aria-disabled="String(isCurrentScreen(screen) || isNavigating)"
        @tap="selectScreen(screen)"
      >
        <text class="admin-screen-switcher__item-icon">{{ screen.icon || '▣' }}</text>
        <text class="admin-screen-switcher__item-label">{{ screen.shortTitle || screen.title }}</text>
        <text v-if="isCurrentScreen(screen)" class="admin-screen-switcher__current-mark">当前</text>
      </view>
      <view v-if="!accessibleScreens.length" class="admin-screen-switcher__empty">暂无可访问大屏</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
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

const menuOpen = ref(false)
const isNavigating = ref(false)
const accessRevision = ref(0)

const accessibleScreens = computed(() => {
  accessRevision.value
  return getAdminScreenList({ onlyAccessible: true })
})

function getScreenKey(screen) {
  return String(screen?.id || screen?.key || screen?.routeKey || '')
}

function isCurrentScreen(screen) {
  return getScreenKey(screen) === props.screenKey
}

function toggleMenu() {
  if (isNavigating.value) return
  // Server-verified login may update storage after this component first
  // renders. Refresh only the derived UI list; never grant permissions here.
  accessRevision.value += 1
  menuOpen.value = !menuOpen.value
}

async function selectScreen(screen) {
  if (isNavigating.value || isCurrentScreen(screen)) return

  const target = getScreenKey(screen)
  if (!target) return

  isNavigating.value = true
  menuOpen.value = false
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
  flex: 0 0 auto;
  min-width: 0;
  z-index: 1002;
}

.admin-screen-switcher__trigger {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 108px;
  height: var(--admin-screen-control-height, 36px);
  padding: 0 12px;
  border: 1px solid rgba(126, 221, 255, 0.34);
  border-radius: var(--admin-screen-control-radius, 8px);
  color: #e4f8ff;
  background: rgba(29, 80, 107, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  font-size: var(--admin-screen-control-font-size, 13px);
  font-weight: var(--admin-screen-control-font-weight, 650);
  line-height: 1;
  transition: border-color .18s ease, background .18s ease, transform .18s ease;
  white-space: nowrap;
}

.admin-screen-switcher__trigger:active,
.admin-screen-switcher__trigger.is-open {
  border-color: rgba(62, 201, 255, 0.88);
  background: rgba(26, 119, 156, 0.74);
}

.admin-screen-switcher__trigger-icon {
  color: #67dfff;
  font-size: 15px;
  line-height: 1;
}

.admin-screen-switcher__caret {
  margin-left: 1px;
  color: #9fd7e8;
  font-size: 16px;
  line-height: 10px;
  transform: translateY(-1px);
  transition: transform .18s ease;
}

.admin-screen-switcher__caret.is-open {
  transform: translateY(2px) rotate(180deg);
}

.admin-screen-switcher__menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  box-sizing: border-box;
  width: 176px;
  max-height: min(304px, calc(100vh - 96px));
  overflow-y: auto;
  padding: 6px;
  border: 1px solid rgba(104, 216, 255, 0.38);
  border-radius: 10px;
  background: rgba(5, 28, 43, 0.98);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.28);
  z-index: 1003;
}

.admin-screen-switcher__item {
  display: flex;
  align-items: center;
  min-height: 38px;
  gap: 8px;
  padding: 0 9px;
  border-radius: 6px;
  color: #c9e7f2;
  font-size: 13px;
  line-height: 1.2;
  transition: background .18s ease, color .18s ease;
}

.admin-screen-switcher__item:active:not(.is-current):not(.is-navigating) {
  color: #fff;
  background: rgba(46, 173, 218, 0.34);
}

.admin-screen-switcher__item-icon {
  width: 16px;
  color: #67dfff;
  font-size: 15px;
  line-height: 1;
  text-align: center;
}

.admin-screen-switcher__item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-screen-switcher__item.is-current {
  color: #fff;
  background: rgba(32, 160, 211, 0.38);
}

.admin-screen-switcher__item.is-navigating {
  opacity: .6;
}

.admin-screen-switcher__current-mark {
  flex: 0 0 auto;
  color: #82e6ff;
  font-size: 11px;
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

.admin-screen-switcher--light .admin-screen-switcher__trigger:active,
.admin-screen-switcher--light .admin-screen-switcher__trigger.is-open {
  border-color: #5594dc;
  color: #1c64bd;
  background: #eef6ff;
}

.admin-screen-switcher--light .admin-screen-switcher__trigger-icon,
.admin-screen-switcher--light .admin-screen-switcher__item-icon {
  color: #287ce0;
}

.admin-screen-switcher--light .admin-screen-switcher__caret {
  color: #5d7690;
}

.admin-screen-switcher--light .admin-screen-switcher__menu {
  border-color: #d8e5f2;
  background: #fff;
  box-shadow: 0 14px 30px rgba(35, 77, 121, 0.16);
}

.admin-screen-switcher--light .admin-screen-switcher__item {
  color: #385672;
}

.admin-screen-switcher--light .admin-screen-switcher__item:active:not(.is-current):not(.is-navigating) {
  color: #124b95;
  background: #eef6ff;
}

.admin-screen-switcher--light .admin-screen-switcher__item.is-current {
  color: #1c5ea9;
  background: #e4f1ff;
}

.admin-screen-switcher--light .admin-screen-switcher__current-mark {
  color: #287ce0;
}

.admin-screen-switcher--light .admin-screen-switcher__empty {
  color: #7a8ea4;
}

@media screen and (max-width: 600px) {
  .admin-screen-switcher,
  .admin-screen-switcher__trigger {
    width: 100%;
  }

  .admin-screen-switcher__menu {
    left: 0;
    right: auto;
    width: 100%;
  }
}
</style>
