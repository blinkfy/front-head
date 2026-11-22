<template>
  <view class="trend">
    <view class="totals">
      <view v-for="(user, index) in data.users" :key="user.id" class="total">
        <text class="legend" :class="{ compare: index === 1 }">{{ user.username || '账号' }} #{{ user.id }}</text>
        <text class="count">{{ totals[index] }}</text><text class="note"> 条行为 · {{ activeDays[index] }} 个有记录的日期</text>
      </view>
    </view>
    <scroll-view class="chart-scroll" scroll-x>
      <view class="days">
        <button v-for="item in data.days" :key="item.day" class="day" :class="{ active: item.day === day?.day }"
          :aria-label="item.day + '，' + item.counts.join(' / ') + ' 条行为'" :aria-pressed="item.day === day?.day" @click="$emit('day', item.day)">
          <view v-for="(count, index) in item.counts" :key="index" class="bar" :class="{ compare: index === 1, zero: count === 0 }"
            :style="{ height: Math.max(3, count / maximum * 100) + '%' }" />
        </button>
      </view>
    </scroll-view>
    <view class="axis"><text>{{ data.days[0]?.day }}</text><text>{{ data.days[data.days.length - 1]?.day }}</text></view>
    <text class="note">按 UTC 日期分组，起止日按所选时段截取。</text>
    <view v-if="day" class="detail">
      <text>{{ day.day }}</text>
      <button v-for="(user, index) in data.users" :key="user.id" :disabled="!day.counts[index]"
        @click="$emit('inspect', { id: user.id, name: user.username, day: day.day })">{{ user.username || ('#' + user.id) }} · {{ day.counts[index] }} 条{{ day.counts[index] ? ' ›' : '' }}</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ data: { type: Object, required: true }, selected: String })
defineEmits(['day', 'inspect'])
const day = computed(() => props.data.days.find(item => item.day === props.selected))
const totals = computed(() => props.data.users.map((_, i) => props.data.days.reduce((total, item) => total + item.counts[i], 0)))
const activeDays = computed(() => props.data.users.map((_, i) => props.data.days.filter(item => item.counts[i] > 0).length))
const maximum = computed(() => Math.max(1, ...props.data.days.flatMap(item => item.counts)))
</script>

<style scoped>
.trend { display:grid; gap:8px; }
.totals,.detail,.axis { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.total { flex:1; min-width:130px; padding:8px; border-radius:8px; background:#829d941a; }
.legend { display:block; font-size:12px; color:inherit; }
.legend::before { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px; content:''; background:#319a82; }
.legend.compare::before,.bar.compare { background:#687ec4; }
.count { font-size:20px; font-weight:650; }.note,.axis,.detail { font-size:12px; }.note,.axis { opacity:.77; }
.chart-scroll { width:100%; white-space:nowrap; }
.days { display:inline-flex; min-width:100%; height:116px; box-sizing:border-box; padding-top:6px; border-bottom:1px solid #829d944f; }
.days .day { height:100%; margin:0; flex:1; min-width:10px; padding:0 1px; display:flex; align-items:flex-end; gap:1px; background:transparent; border:0; border-radius:3px; }
.days .day::after,.detail button::after { border:0; }.days .day.active { background:#829d9440; }
.bar { min-width:1px; flex:1; background:#319a82; border-radius:2px 2px 0 0; }.bar.zero { opacity:.25; }
.axis { justify-content:space-between; }.detail button { margin:0; padding:3px 8px; color:inherit; background:#829d941a; font-size:12px; }.detail button[disabled] { opacity:.5; }
</style>
