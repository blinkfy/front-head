<template>
  <view class="history-dismiss-bridge" :bridge-ready="bridgeReady" :change:bridge-ready="historyDismiss.install" />
</template>

<script>
export default {
  emits: ['dismiss'],
  data() { return { bridgeReady: 1 } },
  methods: { dismiss() { this.$emit('dismiss') } }
}
</script>

<script module="historyDismiss" lang="renderjs">
export default {
  mounted() {
    this.install()
  },
  methods: {
    install() {
      if (this.installed) return
      this.installed = true
      const renderContext = this
      let start = null
      let lastTouch = null
      const targetFor = target => {
        if (!target || !target.closest) return null
        const modal = target.closest('.detail-modal')
        if (!modal) return null
        return target.closest('.detail-close') || target === modal ? modal : null
      }
      const onStart = event => {
        const modal = targetFor(event.target)
        if (!modal) lastTouch = null
        const touch = event.touches && event.touches.length === 1 && event.touches[0]
        start = modal && touch ? { modal, x: touch.clientX, y: touch.clientY } : null
      }
      const onEnd = event => {
        const touch = event.changedTouches && event.changedTouches[0]
        const gesture = start
        start = null
        if (!gesture || !touch || targetFor(event.target) !== gesture.modal ||
            Math.abs(touch.clientX - gesture.x) > 12 || Math.abs(touch.clientY - gesture.y) > 12) return
        lastTouch = { time: Date.now(), x: touch.clientX, y: touch.clientY }
        dismiss(gesture.modal)
      }
      const dismiss = modal => {
        // Notify the logic layer before hiding, so reopening creates a fresh dialog.
        const owner = renderContext.$ownerInstance
        if (!owner || typeof owner.callMethod !== 'function') return
        owner.callMethod('dismiss')
        requestAnimationFrame(() => {
          if (!modal.isConnected) return
          const oldDisplay = modal.style.display
          modal.style.display = 'none'
          // Recover if the logic-layer close event is lost for any reason.
          setTimeout(() => {
            if (modal.isConnected && modal.style.display === 'none') {
              modal.style.display = oldDisplay
            }
          }, 15000)
        })
      }
      const onCancel = () => { start = null }
      const onClick = event => {
        // A click synthesized from the closing touch must not reach the list underneath.
        if (lastTouch && Date.now() - lastTouch.time < 700 &&
            Math.abs(event.clientX - lastTouch.x) < 25 && Math.abs(event.clientY - lastTouch.y) < 25) {
          event.preventDefault()
          event.stopImmediatePropagation()
          lastTouch = null
          return
        }
        const modal = targetFor(event.target)
        if (modal) dismiss(modal)
      }
      document.addEventListener('touchstart', onStart, true)
      document.addEventListener('touchend', onEnd, true)
      document.addEventListener('touchcancel', onCancel, true)
      document.addEventListener('click', onClick, true)
      let hostWasConnected = !!document.querySelector('.history-dismiss-bridge')
      const observer = new MutationObserver(() => {
        if (document.querySelector('.history-dismiss-bridge')) {
          hostWasConnected = true
        } else if (hostWasConnected) {
          document.removeEventListener('touchstart', onStart, true)
          document.removeEventListener('touchend', onEnd, true)
          document.removeEventListener('touchcancel', onCancel, true)
          document.removeEventListener('click', onClick, true)
          observer.disconnect()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }
  }
}
</script>

<style scoped>
.history-dismiss-bridge { display: none; }
</style>
