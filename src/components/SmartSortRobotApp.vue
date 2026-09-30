<template>
  <view :id="hostId" class="app-robot-host" :robot-packet="renderPacket" :change:robot-packet="robotView.update" />
</template>

<script>
let instanceId = 0
export default {
  props: { state: { type: String, default: 'idle' }, active: { type: Boolean, default: true } },
  emits: ['ready', 'fallback', 'settled'],
  data() {
    const base = typeof plus !== 'undefined' ? plus.io.convertLocalFileSystemURL('_www/static/app/robot_3d/') : './static/app/robot_3d/'
    return { hostId: `smart-sort-app-${Date.now()}-${++instanceId}`, assetBase: base.endsWith('/') ? base : `${base}/` }
  },
  computed: {
    renderPacket() { return { hostId: this.hostId, state: this.state, active: this.active, assetBase: this.assetBase } }
  },
  methods: {
    handleReady() { this.$emit('ready') },
    handleFallback(message) { this.$emit('fallback', new Error(message || 'APP 3D unavailable')) },
    handleSettled() { this.$emit('settled') }
  }
}
</script>

<script module="robotView" lang="renderjs">
const instances = new Map()

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

function dispose(record) {
  if (record.disposed) return
  record.disposed = true
  cancelAnimationFrame(record.initFrame)
  record.observer?.disconnect()
  record.request?.abort()
  record.engine?.dispose()
  record.engine = null
  instances.delete(record.packet.hostId)
}

function fail(record, error) {
  if (record.disposed) return
  record.owner.callMethod('handleFallback', String(error?.message || error))
  dispose(record)
}

function readModel(record, url) {
  return new Promise((resolve, reject) => {
    const request = record.request = new XMLHttpRequest()
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
  })
}

async function start(record) {
  try {
    const host = document.getElementById(record.packet.hostId)
    if (!host?.isConnected) throw new Error('Robot render host unavailable')
    record.observer = new MutationObserver(() => { if (!host.isConnected) dispose(record) })
    record.observer.observe(document.body, { childList: true, subtree: true })
    const base = record.packet.assetBase
    const [runtime, modelBuffer] = await Promise.all([loadRuntime(`${base}smart-sort-robot-runtime.js`), readModel(record, `${base}smart_sort_robot_v34_animated.glb`)])
    if (record.disposed || !host.isConnected) return
    record.engine = runtime.mountSmartSortRobot(host, {
      modelBuffer, state: record.packet.state, active: record.packet.active,
      onFirstFrame: () => { if (!record.disposed) record.owner.callMethod('handleReady') },
      onSettled: () => { if (!record.disposed) record.owner.callMethod('handleSettled') },
      onError: error => fail(record, error)
    })
  } catch (error) { fail(record, error) }
}

export default {
  methods: {
    update(packet, previous, owner) {
      if (!packet?.hostId) return
      let record = instances.get(packet.hostId)
      if (!record) {
        record = { packet, owner, disposed: false, engine: null }
        instances.set(packet.hostId, record)
        record.initFrame = requestAnimationFrame(() => start(record))
      } else {
        record.packet = packet
        record.engine?.setState(packet.state)
        record.engine?.setActive(packet.active)
      }
    }
  }
}
</script>

<style scoped>
.app-robot-host { width: 100%; height: 100%; pointer-events: none; }
</style>
