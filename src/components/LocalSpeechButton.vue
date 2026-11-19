<template>
  <button v-if="localSpeechAvailable && spokenText && !disabled" class="local-speech-button"
    :class="{ 'local-speech-dark': dark, 'speech-icon-button': iconOnly, 'speech-icon-playing': iconOnly && playing }"
    :aria-label="playing ? '停止播报' : label" :title="iconOnly ? (playing ? '停止播报' : label) : undefined" @tap.stop="toggle">
    <view v-if="iconOnly" class="speech-icon" aria-hidden="true">
      <view v-if="playing" class="speech-stop-icon"></view>
      <template v-else><view class="speech-speaker"></view><view class="speech-wave"></view></template>
    </view>
    <text v-else>{{ playing ? '停止播报' : label }}</text>
  </button>
</template>

<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { localSpeechAvailable, localSpeechOwner, playLocalSpeech, stopLocalSpeech } from '@/utils/local-tts.js'

const props = defineProps({
  text: { type: String, default: '' },
  label: { type: String, default: '播报' },
  dark: Boolean,
  iconOnly: Boolean,
  disabled: Boolean
})
const owner = Symbol('local speech button')
const playing = computed(() => localSpeechOwner.value === owner)
const spokenText = computed(() => props.text.trim())
const stop = () => stopLocalSpeech(owner)
function play() {
  if (!props.disabled) playLocalSpeech(owner, spokenText.value)
}
function toggle() {
  if (playing.value) stop()
  else play()
}

onBeforeUnmount(stop)
watch([spokenText, () => props.disabled], stop, { flush: 'sync' })
defineExpose({ play })
</script>

<style scoped>
.local-speech-button {
  display: inline-flex;
  align-items: center;
  width: auto;
  min-height: 34px;
  margin: 4px 0;
  padding: 0 10px;
  border: 1px solid currentColor;
  border-radius: 8px;
  background: transparent;
  color: #087052;
  font: inherit;
  font-size: 13px;
  line-height: 1.3;
}
.local-speech-button::after { border: 0; }
.local-speech-dark { color: #79e3bc; }
.speech-icon-button {
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  min-height: 36px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
}
.speech-icon-button:active, .speech-icon-playing { color: var(--accent, #4d6bfe); background: rgba(110, 125, 155, .12); }
.speech-icon { position: relative; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; }
.speech-speaker {
  position: absolute;
  left: 1px;
  width: 9px;
  height: 14px;
  background: currentColor;
  clip-path: polygon(0 35%, 35% 35%, 87% 4%, 100% 12%, 100% 88%, 87% 96%, 35% 65%, 0 65%);
}
.speech-wave { position: absolute; left: 10px; width: 6px; height: 13px; border-right: 1.5px solid currentColor; border-radius: 0 100% 100% 0; }
.speech-wave::after { content: ''; position: absolute; top: 3px; right: 2px; width: 3px; height: 7px; border-right: 1.5px solid currentColor; border-radius: 0 100% 100% 0; }
.speech-stop-icon { box-sizing: border-box; width: 12px; height: 12px; border: 1.5px solid currentColor; border-radius: 3px; }
@media (hover: hover) {
  .speech-icon-button:hover { background: rgba(110, 125, 155, .12); }
}
</style>
