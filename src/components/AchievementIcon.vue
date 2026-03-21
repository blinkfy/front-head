<template>
  <!-- #ifndef H5 -->
  <!-- 小程序：不支持 <svg>，用 base64 导入的 SVG 作为 <image> 标签 -->
  <!-- size prop 控制显示尺寸 -->
  <image :src="iconSrc" :style="imgStyle" class="icon-img" mode="aspectFit" />
  <!-- #endif -->
  <!-- #ifdef H5 -->
  <!-- H5：直接渲染 SVG，颜色跟随父元素 currentColor -->
  <span class="icon-wrap-h5" :style="wrapStyle" v-html="iconHtml"></span>
  <!-- #endif -->
</template>

<script setup>
import { computed } from 'vue'
import firstSortIcon from '@/static/achievement-icons/first_sort.svg'
import onlineNoviceIcon from '@/static/achievement-icons/online_novice.svg'
import deviceNoviceIcon from '@/static/achievement-icons/device_novice.svg'
import categoryCollectorIcon from '@/static/achievement-icons/category_collector.svg'
import streak3DaysIcon from '@/static/achievement-icons/streak_3_days.svg'
import points100Icon from '@/static/achievement-icons/points_100.svg'

const props = defineProps({
  iconKey: {
    type: String,
    default: ''
  },
  /**
   * 图标尺寸：small(28px) | medium(40px) | large(56px) | xlarge(72px)
   * 默认为 medium，保持向后兼容
   */
  size: {
    type: String,
    default: 'medium',
    validator: (v) => ['small', 'medium', 'large', 'xlarge'].includes(v)
  }
})

const SIZE_MAP = {
  small: 28,
  medium: 40,
  large: 56,
  xlarge: 72
}

const ICON_MP = {
  first_sort: firstSortIcon,
  online_novice: onlineNoviceIcon,
  device_novice: deviceNoviceIcon,
  category_collector: categoryCollectorIcon,
  streak_3_days: streak3DaysIcon,
  points_100: points100Icon
}

// H5 SVG：颜色通过 currentColor 从父级继承（支持 CSS 变量 --achievement-icon-color）
const ICON_SVG_H5 = {
  first_sort: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px"><path d="M12 20c0-5 2-8 7-10-1 5-4 7-9 8"/><path d="M5 14c2-4 5-6 9-7-1 4-3 7-7 9"/><path d="M12 20v-5"/></svg>`,
  online_novice: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7l1.5-2h5L16 7"/><circle cx="12" cy="13" r="3"/></svg>`,
  device_novice: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px"><path d="M9 5h6"/><path d="M5 7h14"/><path d="M7 7l1 12h8l1-12"/><path d="M10 11v5M14 11v5"/></svg>`,
  category_collector: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>`,
  streak_3_days: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>`,
  points_100: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px"><circle cx="12" cy="12" r="9"/><path d="m12 7 1.5 3 3.5.5-2.5 2.4.6 3.6L12 15l-3.1 1.5.6-3.6L7 10.5l3.5-.5z"/></svg>`
}

const iconPx = computed(() => SIZE_MAP[props.size] || SIZE_MAP.medium)

const iconSrc = computed(() => ICON_MP[props.iconKey] || ICON_MP.points_100)
const iconHtml = computed(() => {
  const fn = ICON_SVG_H5[props.iconKey] || ICON_SVG_H5.points_100
  return fn(iconPx.value)
})

const imgStyle = computed(() => ({
  width: iconPx.value + 'px',
  height: iconPx.value + 'px'
}))

const wrapStyle = computed(() => ({
  width: iconPx.value + 'px',
  height: iconPx.value + 'px',
  color: 'var(--achievement-icon-color, #D3BC8E)'
}))
</script>

<style scoped>
.icon-img {
  display: block;
  /* 默认透明，小程序无法用 currentColor */
}

.icon-wrap-h5 {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--achievement-icon-color, #D3BC8E);
  transition: color 0.3s ease;
}
</style>
