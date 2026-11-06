<template>
  <view class="call-icon" :class="kind">
    <view class="shape"></view><view class="detail"></view>
    <view v-if="off" class="slash"></view>
  </view>
</template>
<script>
export default { props: { kind: { type: String, default: 'phone' }, off: Boolean } }
</script>
<style scoped>
.call-icon { position: relative; width: 30px; height: 30px; color: inherit; }
.phone .shape, .hangup .shape { position: absolute; left: 4px; top: 8px; width: 22px; height: 13px; border: 3px solid currentColor; border-top: 0; border-radius: 0 0 14px 14px; transform: rotate(-40deg); box-sizing: border-box; }
.phone .shape::before, .phone .shape::after, .hangup .shape::before, .hangup .shape::after { content: ''; position: absolute; top: -4px; width: 5px; height: 9px; background: currentColor; border-radius: 2px; }
.phone .shape::before, .hangup .shape::before { left: -3px; }
.phone .shape::after, .hangup .shape::after { right: -3px; }
.hangup .shape { transform: rotate(180deg); }
.mic .shape { position: absolute; left: 10px; top: 2px; width: 10px; height: 17px; border: 2px solid currentColor; border-radius: 8px; box-sizing: border-box; }
.mic .detail { position: absolute; left: 6px; top: 10px; width: 18px; height: 14px; border: 2px solid currentColor; border-top: 0; border-radius: 0 0 12px 12px; box-sizing: border-box; }
.mic .detail::after { content: ''; position: absolute; left: 6px; top: 12px; height: 4px; border-left: 2px solid currentColor; }
.speaker .shape { position: absolute; left: 4px; top: 10px; width: 7px; height: 10px; background: currentColor; border-radius: 1px; }
.speaker .shape::after { content: ''; position: absolute; left: 4px; top: -5px; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-right: 9px solid currentColor; }
.speaker .detail { position: absolute; left: 17px; top: 5px; width: 9px; height: 20px; border-right: 2px solid currentColor; border-radius: 50%; }
.slash { position: absolute; left: 14px; top: 0; height: 31px; border-left: 2px solid currentColor; transform: rotate(-42deg); }
</style>
