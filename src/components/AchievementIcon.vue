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

// H5 SVG：金色纹章风格，颜色通过 currentColor 从父级继承
const ICON_SVG_H5 = {
  first_sort: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px">
    <!-- 神圣分类徽记：中央盾形 + 橄榄枝环绕 -->
    <path d="M12 3L4 7v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V7l-8-4z"/>
    <path d="M12 8v5M9.5 10.5l2.5 2.5 2.5-2.5"/>
    <path d="M4 7c1.5-1 3-1.5 4.5-1.5" opacity="0.6"/>
    <path d="M20 7c-1.5-1-3-1.5-4.5-1.5" opacity="0.6"/>
    <path d="M4 9c1.5 0.5 3 0.8 4.5 1" opacity="0.5"/>
    <path d="M20 9c-1.5 0.5-3 0.8-4.5 1" opacity="0.5"/>
  </svg>`,
  online_novice: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px">
    <!-- 真理之眼纹章：中央慧眼 + 光芒射线 -->
    <ellipse cx="12" cy="12" rx="9" ry="5.5"/>
    <circle cx="12" cy="12" r="3.5"/>
    <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
    <path d="M12 6.5V3" opacity="0.7"/>
    <path d="M12 21v-3.5" opacity="0.7"/>
    <path d="M7 8.5L4.5 6.5" opacity="0.6"/>
    <path d="M17 8.5L19.5 6.5" opacity="0.6"/>
    <path d="M7 15.5L4.5 17.5" opacity="0.6"/>
    <path d="M17 15.5L19.5 17.5" opacity="0.6"/>
  </svg>`,
  device_novice: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px">
    <!-- 盾形分类纹章：盾徽 + 内部分类符号 -->
    <path d="M12 2L3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6L12 2z"/>
    <path d="M8 10h2v2H8zM14 10h2v2h-2zM11 14h2v3h-2z"/>
    <path d="M8 10h2M14 10h2" opacity="0.5"/>
  </svg>`,
  category_collector: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px">
    <!-- 完美对称钻石徽记：八芒星 + 中央宝石 -->
    <polygon points="12,2 15,9 22,9 17,14 19,22 12,18 5,22 7,14 2,9 9,9"/>
    <polygon points="12,7 13.5,11 18,11 14.5,14 16,18 12,15.5 8,18 9.5,14 6,11 10.5,11"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.8"/>
  </svg>`,
  streak_3_days: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px">
    <!-- 连续三星徽章：三日连星 + 缎带底座 -->
    <circle cx="6" cy="9" r="2.5"/>
    <circle cx="12" cy="7" r="2.5"/>
    <circle cx="18" cy="9" r="2.5"/>
    <path d="M6 9l1.5 1.5L9 9" opacity="0.7"/>
    <path d="M12 7l1.5 1.5L15 7" opacity="0.7"/>
    <path d="M3 14h18" opacity="0.5"/>
    <path d="M5 14l-1 5h16l-1-5" opacity="0.7"/>
    <path d="M7 17h10" opacity="0.4"/>
  </svg>`,
  points_100: (sz) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:${sz}px;height:${sz}px">
    <!-- 光芒万丈太阳纹章：中央太阳 + 八道光芒 + 圆环 -->
    <circle cx="12" cy="12" r="4"/>
    <circle cx="12" cy="12" r="6.5" opacity="0.4"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
    <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1"/>
    <path d="M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
    <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
  </svg>`
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
