<template>
  <view :id="hostId" class="app-robot-host" :robot-packet="renderPacket" :change:robot-packet="robotView.update" />
</template>

<script>
let instanceId = 0
export default {
  props: { state: { type: String, default: 'idle' }, active: { type: Boolean, default: true } },
  emits: ['ready', 'recovering', 'suspended', 'fallback', 'settled'],
  data() {
    const base = typeof plus !== 'undefined' ? plus.io.convertLocalFileSystemURL('_www/static/app/robot_3d/') : './static/app/robot_3d/'
    return { appVisible: true, resumeVersion: 0, hostId: `smart-sort-app-${Date.now()}-${++instanceId}`, assetBase: base.endsWith('/') ? base : `${base}/` }
  },
  computed: {
    renderPacket() { return { hostId: this.hostId, state: this.state, active: this.active && this.appVisible, resumeVersion: this.resumeVersion, assetBase: this.assetBase } }
  },
  created() {
    this.appVisibilityListener = visible => {
      this.appVisible = visible
      if (visible) this.resumeVersion++
      else this.$emit('suspended')
    }
    uni.$on('smart-sort-robot:visibility', this.appVisibilityListener)
  },
  beforeUnmount() { uni.$off('smart-sort-robot:visibility', this.appVisibilityListener) },
  methods: {
    handleRecovering() { if (this.active && this.appVisible) this.$emit('recovering') },
    handleReady() { this.$emit('ready') },
    handleFallback(message) { this.$emit('fallback', new Error(message || 'APP 3D unavailable')) },
    handleSettled() { this.$emit('settled') }
  }
}
</script>

<script module="robotView" lang="renderjs">
const instances = new Map()
let modelCache = null
let listening = false

function loadRuntime(url) {
  if (window.SmartSortRobotRuntime) return Promise.resolve(window.SmartSortRobotRuntime)
  if (window.__smartSortRuntimePromise) return window.__smartSortRuntimePromise
  window.__smartSortRuntimePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => finish(new Error('Robot runtime loading timed out')), 10000)
    function finish(error) {
      clearTimeout(timer)
      script.onload = script.onerror = null
      script.remove()
      if (error) { window.__smartSortRuntimePromise = null; reject(error) }
      else resolve(window.SmartSortRobotRuntime)
    }
    script.onload = () => finish(window.SmartSortRobotRuntime ? null : new Error('Robot runtime missing'))
    script.onerror = () => finish(new Error('Robot runtime load failed'))
    script.src = url
    document.head.appendChild(script)
  })
  return window.__smartSortRuntimePromise
}

// One immutable GLB buffer per WebView, shared by entry/recognition and recovery.
// Removing a robot must not abort another robot's shared read.
function readModel(url) {
  if (modelCache?.url === url) return modelCache.promise
  const entry = { url }
  entry.promise = new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url, true)
    request.responseType = 'arraybuffer'
    request.timeout = 10000
    request.onload = () => {
      if ((request.status === 0 || request.status >= 200 && request.status < 300) && request.response?.byteLength) resolve(request.response)
      else reject(new Error('Robot model read failed'))
    }
    request.onerror = request.ontimeout = () => reject(new Error('Robot model load failed or timed out'))
    request.onabort = () => reject(new Error('Robot model loading cancelled'))
    request.send()
  }).catch(error => {
    if (modelCache === entry) modelCache = null
    throw error
  })
  modelCache = entry
  return entry.promise
}

function clearWatchdog(record) {
  clearTimeout(record.watchdog)
  record.watchdog = null
}
function markRecovering(record) {
  record.ready = false
  record.owner.callMethod('handleRecovering')
}
function setLifecycleListeners(enabled) {
  if (listening === enabled) return
  listening = enabled
  const method = enabled ? 'addEventListener' : 'removeEventListener'
  document[method]('visibilitychange', onVisibilityChange)
  document[method]('pause', onVisibilityChange)
  document[method]('resume', onVisibilityChange)
  window[method]('pageshow', onVisibilityChange)
}
function dispose(record) {
  if (record.disposed) return
  record.disposed = true
  record.generation++
  cancelAnimationFrame(record.initFrame)
  clearWatchdog(record)
  record.observer?.disconnect()
  record.engine?.dispose()
  record.engine = null
  instances.delete(record.packet.hostId)
  if (!instances.size) setLifecycleListeners(false)
}
function fail(record, error) {
  if (record.disposed) return
  record.owner.callMethod('handleFallback', String(error?.message || error))
  dispose(record)
}
function scheduleStart(record) {
  cancelAnimationFrame(record.initFrame)
  record.initFrame = requestAnimationFrame(() => { record.initFrame = null; start(record) })
}
function recover(record, error) {
  if (record.disposed) return
  record.generation++
  record.starting = false
  clearWatchdog(record)
  record.engine?.dispose()
  record.engine = null
  markRecovering(record)
  if (!record.packet.active || document.hidden) return
  if (record.retries >= 2) { fail(record, error); return }
  record.retries++
  scheduleStart(record)
}
function armWatchdog(record) {
  clearWatchdog(record)
  if (!record.packet.active || document.hidden || record.disposed || record.ready) return
  record.watchdog = setTimeout(() => {
    record.watchdog = null
    if (!record.disposed && record.packet.active && !document.hidden && !record.ready) {
      recover(record, new Error('Robot did not render after resume'))
    }
  }, 2000)
}
function resume(record) {
  if (record.disposed) return
  clearWatchdog(record)
  if (!record.packet.active || document.hidden) { record.engine?.setActive(false); return }
  if (!record.engine) { if (!record.starting) scheduleStart(record); return }
  markRecovering(record)
  record.engine.setState(record.packet.state)
  record.engine.setActive(true)
  armWatchdog(record)
}
function onVisibilityChange(event) {
  const hidden = document.hidden || event?.type === 'pause'
  for (const record of instances.values()) {
    if (hidden) { clearWatchdog(record); record.engine?.setActive(false) }
    else { record.retries = 0; resume(record) }
  }
}

async function start(record) {
  if (record.disposed || record.starting || record.engine || !record.packet.active || document.hidden) return
  const version = ++record.generation
  record.starting = true
  try {
    const host = document.getElementById(record.packet.hostId)
    if (!host?.isConnected) throw new Error('Robot render host unavailable')
    if (!record.observer) {
      record.observer = new MutationObserver(() => { if (!host.isConnected) dispose(record) })
      record.observer.observe(document.body, { childList: true, subtree: true })
    }
    const base = record.packet.assetBase
    const [runtime, modelBuffer] = await Promise.all([loadRuntime(`${base}smart-sort-robot-runtime.js`), readModel(`${base}smart_sort_robot_v34_animated.glb`)])
    if (record.disposed || version !== record.generation || !host.isConnected || !record.packet.active || document.hidden) return
    record.engine = runtime.mountSmartSortRobot(host, {
      modelBuffer, state: record.packet.state, active: record.packet.active,
      onFirstFrame: () => {
        if (record.disposed || version !== record.generation) return
        record.ready = true
        clearWatchdog(record)
        record.owner.callMethod('handleReady')
      },
      onUnavailable: () => {
        if (record.disposed || version !== record.generation) return
        markRecovering(record)
        armWatchdog(record)
      },
      onSettled: () => { if (!record.disposed && version === record.generation) record.owner.callMethod('handleSettled') },
      onError: error => { if (!record.disposed && version === record.generation) recover(record, error) }
    })
    armWatchdog(record)
  } catch (error) {
    if (!record.disposed && version === record.generation) recover(record, error)
  } finally {
    if (version === record.generation) record.starting = false
  }
}

export default {
  methods: {
    update(packet, previous, owner) {
      if (!packet?.hostId) return
      let record = instances.get(packet.hostId)
      if (!record) {
        record = { packet, owner, disposed: false, engine: null, generation: 0, retries: 0, starting: false, ready: false }
        instances.set(packet.hostId, record)
        setLifecycleListeners(true)
        scheduleStart(record)
      } else {
        const resumed = packet.active && (!record.packet.active || packet.resumeVersion !== record.packet.resumeVersion)
        record.packet = packet
        if (resumed) { record.retries = 0; resume(record) }
        else if (!packet.active) { clearWatchdog(record); record.engine?.setActive(false) }
        else if (!record.engine) { if (!record.starting) scheduleStart(record) }
        else record.engine.setState(packet.state)
      }
    }
  }
}
</script>

<style scoped>
.app-robot-host { width: 100%; height: 100%; pointer-events: none; }
</style>
