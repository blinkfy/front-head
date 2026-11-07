<template>
  <view v-if="current" class="app-dialog-overlay" :class="{ 'app-dialog-dark': dark }" @touchmove.stop @tap.stop>
    <view class="app-dialog" role="dialog" aria-modal="true" :aria-label="current.title || '提示'" @tap.stop>
      <view class="app-dialog-accent" :class="{ 'app-dialog-accent-danger': danger }"></view>
      <view class="app-dialog-heading">
        <view class="app-dialog-symbol" :class="{ 'app-dialog-symbol-danger': danger }">{{ danger ? '!' : '✦' }}</view>
        <text class="app-dialog-title">{{ current.title || '提示' }}</text>
      </view>
      <scroll-view v-if="!current.editable && current.content" class="app-dialog-content" scroll-y>
        <text selectable>{{ current.content }}</text>
      </scroll-view>
      <view v-if="current.editable" class="app-dialog-input-wrap">
        <input class="app-dialog-input" v-model="inputValue" :placeholder="current.placeholderText || '请输入'" :maxlength="-1" confirm-type="done" />
      </view>
      <view class="app-dialog-actions">
        <button v-if="current.showCancel !== false" class="app-dialog-cancel" :style="current.cancelColor ? { color: current.cancelColor } : {}" @tap.stop="settle(false)">{{ current.cancelText || '取消' }}</button>
        <button class="app-dialog-confirm" :class="{ 'app-dialog-confirm-danger': danger }" :style="confirmStyle" @tap.stop="settle(true)">{{ current.confirmText || '确定' }}</button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() { return { current: null, activeItem: null, queue: [], inputValue: '', dark: false, cancelling: false } },
  computed: {
    danger() { return !!this.current && (this.current.confirmColor === '#ef4444' || /删除|解散|注销|清空|永久/.test(this.current.title || '') || /不可恢复|无法恢复/.test(this.current.content || '')) },
    confirmStyle() {
      const color = this.current?.confirmColor
      return color && !this.danger ? { background: color } : {}
    }
  },
  beforeUnmount() { this.cancelAll() },
  methods: {
    open(options = {}) {
      return new Promise(resolve => {
        const item = { options, resolve }
        if (this.cancelling) { this.finish(item, false, ''); return }
        this.queue.push(item)
        this.advance()
      })
    },
    advance() {
      if (this.current || !this.queue.length) return
      const item = this.queue.shift()
      this.current = item.options
      this.activeItem = item
      this.inputValue = item.options.editable ? String(item.options.content || '') : ''
      try { this.dark = uni.getStorageSync('app_theme') === 'dark' } catch (_) { this.dark = false }
    },
    finish(item, confirm, content) {
      if (!item) return
      const result = { confirm, cancel: !confirm, errMsg: 'showModal:ok' }
      if (item.options.editable && confirm) result.content = content
      item.resolve(result)
      try { item.options.success?.(result) } finally { item.options.complete?.(result) }
    },
    settle(confirm) {
      const item = this.activeItem
      const content = this.inputValue
      this.current = null
      this.activeItem = null
      try { this.finish(item, confirm, content) } finally { this.advance() }
    },
    cancelAll() {
      const items = this.activeItem ? [this.activeItem, ...this.queue] : [...this.queue]
      this.current = null
      this.activeItem = null
      this.queue = []
      this.cancelling = true
      try {
        for (const item of items) {
          try { this.finish(item, false, '') } catch (error) { console.error('弹窗回调执行失败', error) }
        }
      } finally { this.cancelling = false }
    }
  }
}
</script>

<style scoped>
.app-dialog-overlay { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 24px; background: rgba(11, 24, 19, .55); }
.app-dialog { position: relative; overflow: hidden; width: 100%; max-width: 340px; max-height: 80vh; box-sizing: border-box; padding: 24px 22px 20px; border: 1px solid rgba(255, 255, 255, .7); border-radius: 20px; background: #fff; box-shadow: 0 16px 48px rgba(0, 25, 15, .22); }
.app-dialog-accent { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #10b981, #6ee7b7); }
.app-dialog-accent-danger { background: linear-gradient(90deg, #ef4444, #fca5a5); }
.app-dialog-heading { display: flex; align-items: center; gap: 12px; }
.app-dialog-symbol { flex: none; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #e4f8ee; color: #059669; font-size: 20px; font-weight: 700; }
.app-dialog-symbol-danger { background: #fef0ee; color: #dc4740; }
.app-dialog-title { min-width: 0; font-size: 17px; font-weight: 700; line-height: 1.4; color: #1f3029; overflow-wrap: anywhere; }
.app-dialog-content { box-sizing: border-box; max-height: 36vh; margin-top: 16px; font-size: 14px; line-height: 1.7; color: #607168; white-space: pre-wrap; overflow-wrap: anywhere; }
.app-dialog-input-wrap { margin-top: 16px; padding: 0 12px; border: 1px solid #d9e9e0; border-radius: 10px; background: #f7faf8; }
.app-dialog-input { height: 44px; font-size: 15px; color: #253b30; }
.app-dialog-actions { display: flex; gap: 10px; margin-top: 22px; }
.app-dialog-actions button { flex: 1; min-width: 0; margin: 0; padding: 0 10px; border: 0; border-radius: 10px; font-size: 15px; font-weight: 600; line-height: 44px; }
.app-dialog-actions button::after { border: 0; }
.app-dialog-cancel { color: #5f7268; background: #eef3f0; }
.app-dialog-confirm { color: #fff; background: #0aaf76; }
.app-dialog-confirm-danger { background: #df4b45; }
.app-dialog-dark .app-dialog { border-color: #344555; background: #1b2835; box-shadow: 0 16px 48px rgba(0, 0, 0, .45); }
.app-dialog-dark .app-dialog-title { color: #f0f7f4; }
.app-dialog-dark .app-dialog-content { color: #bdcbc5; }
.app-dialog-dark .app-dialog-symbol { background: #20463d; color: #6ee7b7; }
.app-dialog-dark .app-dialog-symbol-danger { background: #522f35; color: #ffaca4; }
.app-dialog-dark .app-dialog-input-wrap { border-color: #3c554e; background: #14221e; }
.app-dialog-dark .app-dialog-input { color: #f0f7f4; }
.app-dialog-dark .app-dialog-cancel { color: #d3e0da; background: #34463f; }
</style>
