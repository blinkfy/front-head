<template>
  <view class="region-control">
    <view v-if="manual" class="region-manual">
      <input v-for="(label, index) in labels" :key="label" class="region-input" :value="modelValue[index] || ''" :placeholder="label" :disabled="disabled" maxlength="30" @input="setManual(index, $event.detail.value)" />
    </view>
    <picker v-else class="region-picker" mode="multiSelector" :range="columns" :value="draft" :disabled="disabled" @tap="reset" @columnchange="changeColumn" @change="confirm" @cancel="reset">
      <view :class="['region-value', { 'region-placeholder': !complete }]">{{ complete ? modelValue.join(' / ') : '请选择省 / 市 / 区' }}<text class="region-chevron">›</text></view>
    </picker>
    <button class="region-switch" :disabled="disabled" @click="toggle">{{ manual ? '使用地区选择' : '未找到地区？手动填写' }}</button>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import regions from '../utils/shop-regions.js'

const props = defineProps({ modelValue: { type: Array, default: () => ['', '', ''] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const labels = ['省 / 自治区', '市 / 自治州', '区 / 县']
const manual = ref(false)
const draft = ref([0, 0, 0])
const complete = computed(() => props.modelValue.length === 3 && props.modelValue.every(name => String(name || '').trim()))
const cities = computed(() => regions[draft.value[0]]?.children || [])
const districts = computed(() => cities.value[draft.value[1]]?.children || [])
const columns = computed(() => [regions.map(item => item.name), cities.value.map(item => item.name), districts.value.map(item => item.name)])
function findIndices() {
  const province = regions.findIndex(item => item.name === props.modelValue[0])
  const city = regions[province]?.children?.findIndex(item => item.name === props.modelValue[1]) ?? -1
  const district = regions[province]?.children?.[city]?.children?.findIndex(item => item.name === props.modelValue[2]) ?? -1
  return [province, city, district]
}
function reset() { draft.value = findIndices().map(index => Math.max(0, index)) }
watch(() => props.modelValue, () => {
  reset()
  if (props.modelValue.some(Boolean) && findIndices().some(index => index < 0)) manual.value = true
}, { immediate: true, deep: true })
function changeColumn(event) {
  if (props.disabled) return
  const { column, value } = event.detail
  const next = [...draft.value]
  next[column] = Number(value)
  for (let index = Number(column) + 1; index < 3; index++) next[index] = 0
  draft.value = next
}
function confirm(event) {
  if (props.disabled) return
  const indices = event.detail.value.map(Number)
  const province = regions[indices[0]]
  const city = province?.children?.[indices[1]]
  const district = city?.children?.[indices[2]]
  if (province && city && district) emit('update:modelValue', [province.name, city.name, district.name])
}
function setManual(index, name) {
  if (props.disabled) return
  const next = [...props.modelValue]
  next[index] = name
  emit('update:modelValue', next)
}
function toggle() { if (!props.disabled) { manual.value = !manual.value; reset() } }
</script>

<style scoped>
.region-control { width: 100%; min-width: 0; }
.region-picker { display: block; }
.region-value { display: flex; align-items: center; justify-content: space-between; gap: 10rpx; min-height: 72rpx; line-height: 1.6; font-size: 27rpx; color: var(--shop-text); }
.region-placeholder { color: var(--shop-muted); }
.region-chevron { flex-shrink: 0; color: var(--shop-muted); font-size: 36rpx; }
.region-switch { display: inline-block; margin: 0; padding: 8rpx 0; line-height: 1.5; font-size: 22rpx; color: var(--shop-green); background: transparent; }
.region-switch::after { border: 0; }
.region-switch[disabled] { opacity: .5; }
.region-manual { display: flex; flex-direction: column; gap: 12rpx; }
.region-input { width: 100%; height: 72rpx; min-height: 72rpx; padding: 0 16rpx; box-sizing: border-box; border: 1rpx solid var(--shop-line); border-radius: 12rpx; color: var(--shop-text); font-size: 26rpx; }
</style>
