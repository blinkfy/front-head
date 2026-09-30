const model = require('./model-meta')
const sequences = {
  idle: ['Return_Idle', 'Idle_Base'], tap: ['Tap_Response', 'Idle_Base'],
  uploading: ['Upload_Enter', 'Upload_Loop'], processing: ['Analyze_Enter', 'Analyze_Loop'],
  success: ['Resolve', 'Success'], fail: ['Resolve', 'Fail']
}
const loops = new Set(['Idle_Base', 'Idle_Reduced', 'Upload_Loop', 'Analyze_Loop'])

Component({
  properties: {
    robotState: { type: String, value: 'idle', observer: 'updateState' },
    reducedMotion: { type: Boolean, value: false, observer: 'updateState' },
    width: { type: Number, observer: 'updateCamera' }, height: { type: Number, observer: 'updateCamera' }
  },
  data: { assetsReady: false, modelSrc: model.src, modelOffset: model.center.map(value => -value).join(' ') },
  lifetimes: {
    attached() {
      this.dead = false
      this.version = 0
      this.framesUntilReady = 0
    },
    detached() {
      this.dead = true
      this.version++
      this.removeStopListener()
      try { this.animator?.stop() } catch (_) {}
      this.animator = this.camera = this.scene = null
      this.queue = []
    }
  },
  methods: {
    fallback(error) {
      if (this.dead || this.failed) return
      this.failed = true
      this.removeStopListener()
      try { this.animator?.stop() } catch (_) {}
      this.triggerEvent('modelfallback', { message: String(error?.message || error) })
    },
    updateCamera() {
      const halfHeight = this.properties.robotState === 'success' && !this.properties.reducedMotion ? 3 : 2.38
      if (!this.camera) return
      const halfWidth = halfHeight * (this.properties.width || 240) / (this.properties.height || 218)
      // 使用公开投影 API，精确复用 H5 的上下左右边界，避免 orthSize 半宽/全宽差异。
      try {
        const projection = wx.getXrFrameSystem().Matrix4.orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight, 0.1, 100)
        this.camera.changeProjectMatrix(true, projection)
      } catch (error) { this.fallback(error) }
    },
    handleReady({ detail }) {
      this.scene = detail.value
      this.triggerEvent('modelprogress', { stage: 'scene-ready' })
    },
    handleAssetsLoaded({ detail }) {
      this.triggerEvent('modelprogress', { stage: 'assets-loaded' })
      const errors = detail?.value?.errors
      if (errors && Object.keys(errors).length) return this.fallback(new Error('XR robot model loading failed'))
      if (!this.dead && !this.failed) this.setData({ assetsReady: true })
    },
    handleModelLoaded({ detail }) {
      if (this.dead || this.failed) return
      try {
        this.triggerEvent('modelprogress', { stage: 'model-loaded' })
        const system = wx.getXrFrameSystem()
        const node = detail?.value?.target || this.scene?.getElementById('robot')
        this.camera = this.scene?.getElementById('robot-camera')?.getComponent(system.Camera)
        if (!this.camera) throw new Error('XR robot Camera unavailable')
        this.animator = node?.getComponent(system.Animator)
        if (!this.animator) throw new Error('XR robot Animator unavailable')
        this.state = this.properties.robotState
        this.queue = this.properties.reducedMotion ? ['Idle_Reduced'] : this.state === 'idle' ? ['Wake', 'Idle_Base'] : [...(sequences[this.state] || sequences.idle)]
        this.updateCamera()
        this.playNext()
        this.framesUntilReady = 2
      } catch (error) { this.fallback(error) }
    },
    removeStopListener() {
      try {
        if (this.stopListener && this.animator) this.animator.el.event.remove('anim-stop', this.stopListener)
      } catch (_) {}
      this.stopListener = null
    },
    updateState() {
      if (!this.animator || this.dead || this.failed) return
      try {
        this.version++
        this.removeStopListener()
        this.animator.stop()
        this.state = this.properties.robotState
        this.terminalSettled = false
        this.queue = this.properties.reducedMotion ? ['Idle_Reduced'] : [...(sequences[this.state] || sequences.idle)]
        this.updateCamera()
        this.playNext()
      } catch (error) { this.fallback(error) }
    },
    playNext() {
      const clip = this.queue.shift()
      if (!clip || this.dead || this.failed) return
      this.removeStopListener()
      this.clip = clip
      const version = this.version
      this.stopListener = event => {
        // Blink 独立播放，只有当前主片段的真实结束事件才能推进队列。
        if (this.dead || this.failed || version !== this.version || event?.name !== clip) return
        this.removeStopListener()
        if (!this.queue.length && ['success', 'fail'].includes(this.state)) {
          this.animator.pauseToFrame(clip, 1)
          this.settleAfterFrame = true
        } else {
          if (!this.queue.length && loops.has(clip)) this.queue = [clip]
          this.playNext()
        }
      }
      // loop:0 与官方一次播放示例一致；循环由真实 anim-stop 接续。
      this.animator.el.event.add('anim-stop', this.stopListener)
      this.animator.play(clip, { loop: 0, speed: this.properties.reducedMotion ? 0.35 : 1 })
      if (clip === 'Idle_Base' || clip === 'Idle_Reduced') {
        if (this.state === 'tap') this.state = 'idle'
        if (!this.nextBlink) this.nextBlink = Date.now() + 3000 + Math.random() * 2500
        if (!this.nextCurious) this.nextCurious = Date.now() + 8000 + Math.random() * 6000
        if (this.properties.reducedMotion && ['success', 'fail'].includes(this.state)) this.settleAfterFrame = true
      }
    },
    handleTick() {
      if (this.dead || this.failed || !this.animator) return
      try {
        if (this.framesUntilReady && --this.framesUntilReady === 0) this.triggerEvent('modelready')
        if (this.settleAfterFrame && !this.terminalSettled) {
          this.settleAfterFrame = false
          this.terminalSettled = true
          this.triggerEvent('settled')
        }
        if (this.properties.reducedMotion || this.state !== 'idle') return
        const time = Date.now()
        if (time >= this.nextBlink) {
          this.animator.play('Idle_Blink', { loop: 0 })
          this.nextBlink = time + 3000 + Math.random() * 2500
        }
        if (time >= this.nextCurious && this.clip === 'Idle_Base') {
          this.version++
          this.removeStopListener()
          this.animator.stop()
          this.queue = ['Idle_Curious', 'Idle_Base']
          this.nextCurious = time + 8000 + Math.random() * 6000
          this.playNext()
        }
      } catch (error) { this.fallback(error) }
    }
  }
})
