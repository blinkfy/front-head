<template>
  <view :class="['compact-metric-card', `tone-${tone}`, { 'is-gauge': hasGauge }]">
    <view class="compact-metric-icon" aria-hidden="true">{{ icon }}</view>
    <view class="compact-metric-copy">
      <text class="compact-metric-label">{{ label }}</text>
      <view v-if="!hasGauge" class="compact-metric-value-row">
        <text class="compact-metric-value">{{ value }}</text>
        <text
          v-if="trend"
          :class="['compact-metric-trend', trend.cls || 'flat']"
          :aria-label="trend.ariaLabel || ''"
        >
          <text class="compact-metric-trend-symbol">{{ trend.symbol || '•' }}</text>
          <text>{{ trend.value || '' }}</text>
        </text>
      </view>
      <view v-else-if="trend" class="compact-metric-gauge-trend">
        <text
          :class="['compact-metric-trend', trend.cls || 'flat']"
          :aria-label="trend.ariaLabel || ''"
        >
          <text class="compact-metric-trend-symbol">{{ trend.symbol || '•' }}</text>
          <text>{{ trend.value || '' }}</text>
        </text>
      </view>
    </view>
    <view
      v-if="hasGauge"
      class="compact-metric-gauge"
      :style="{
        '--compact-gauge-angle': `${normalizedGauge * 2.7}deg`,
        '--compact-gauge-color': gaugeColor
      }"
      role="img"
      :aria-label="`${label} ${value}`"
    >
      <view class="compact-metric-gauge-core">
        <text>{{ value }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  icon: {
    type: String,
    default: '•'
  },
  label: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    default: '--'
  },
  trend: {
    type: Object,
    default: null
  },
  gaugeValue: {
    type: [Number, String],
    default: null
  },
  tone: {
    type: String,
    default: 'light',
    validator: value => ['light', 'dark'].includes(value)
  }
})

const hasGauge = computed(() => props.gaugeValue !== null && props.gaugeValue !== '')
const normalizedGauge = computed(() => {
  const value = Number(props.gaugeValue)
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
})
const gaugeColor = computed(() => {
  if (normalizedGauge.value >= 90) return '#d95058'
  if (normalizedGauge.value >= 80) return '#ed7b45'
  if (normalizedGauge.value >= 65) return '#d5a13c'
  return '#2d9a7b'
})
</script>

<style scoped>
.compact-metric-card {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 78px;
  flex: 1 1 0;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 11px;
  overflow: hidden;
  border: 1px solid #d8e5df;
  border-radius: 14px;
  color: #17382f;
  background: linear-gradient(135deg, #ffffff, #f4faf7);
}

.compact-metric-card.tone-dark {
  border-color: rgba(126, 205, 232, .24);
  color: #e7f8ff;
  background: linear-gradient(150deg, rgba(16, 50, 69, .88), rgba(8, 29, 43, .94));
}

.compact-metric-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #25745e;
  background: #edf3f0;
  font-size: 18px;
  font-weight: 760;
}

.tone-dark .compact-metric-icon {
  color: #7fe3ff;
  background: rgba(127, 202, 224, .12);
}

.compact-metric-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.compact-metric-label {
  overflow: hidden;
  color: #71857e;
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tone-dark .compact-metric-label {
  color: #9bc3d2;
}

.compact-metric-value-row {
  min-width: 0;
  margin-top: 5px;
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.compact-metric-value {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-family: "Rajdhani", "DIN Alternate", Inter, sans-serif;
  font-size: clamp(22px, 1.75vw, 30px);
  font-weight: 720;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-metric-trend {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #789088;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
}

.compact-metric-trend-symbol {
  font-size: 9px;
}

.compact-metric-trend.up {
  color: #2d9a7b;
}

.compact-metric-trend.down {
  color: #d95058;
}

.tone-dark .compact-metric-trend {
  color: #a9c9d5;
}

.tone-dark .compact-metric-trend.up {
  color: #75e0bd;
}

.tone-dark .compact-metric-trend.down {
  color: #ff8f96;
}

.compact-metric-card.is-gauge {
  padding-right: 10px;
}

.compact-metric-card.is-gauge .compact-metric-icon {
  display: none;
}

.compact-metric-gauge-trend {
  margin-top: 8px;
}

.compact-metric-gauge {
  --compact-gauge-angle: 0deg;
  --compact-gauge-color: #2d9a7b;
  width: 68px;
  height: 68px;
  flex: 0 0 68px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background:
    conic-gradient(
      from 225deg,
      var(--compact-gauge-color) 0 var(--compact-gauge-angle),
      #e3ede8 var(--compact-gauge-angle) 270deg,
      transparent 270deg
    );
}

.tone-dark .compact-metric-gauge {
  background:
    conic-gradient(
      from 225deg,
      var(--compact-gauge-color) 0 var(--compact-gauge-angle),
      rgba(127, 190, 208, .16) var(--compact-gauge-angle) 270deg,
      transparent 270deg
    );
}

.compact-metric-gauge::after {
  content: "";
  position: absolute;
  inset: 7px;
  border-radius: 50%;
  background: #fff;
}

.tone-dark .compact-metric-gauge::after {
  background: #0d2b3d;
}

.compact-metric-gauge-core {
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.compact-metric-gauge-core text {
  color: inherit;
  font-family: "Rajdhani", "DIN Alternate", Inter, sans-serif;
  font-size: 17px;
  font-weight: 760;
}

@media screen and (max-width: 900px) {
  .compact-metric-card {
    min-height: 72px;
    padding: 9px 10px;
    gap: 8px;
  }

  .compact-metric-icon {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
    font-size: 15px;
  }

  .compact-metric-value {
    font-size: 20px;
  }

  .compact-metric-gauge {
    width: 58px;
    height: 58px;
    flex-basis: 58px;
  }

  .compact-metric-gauge-core text {
    font-size: 15px;
  }
}
</style>
