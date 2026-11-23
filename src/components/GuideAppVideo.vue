<template>
  <view :id="hostId" class="guide-app-video" :video-packet="videoPacket" :change:video-packet="hlsView.update" />
</template>

<script>
let instanceId = 0

export default {
  props: {
    src: { type: String, required: true },
    poster: { type: String, default: '' },
    objectFit: { type: String, default: 'contain' },
    controls: { type: Boolean, default: false },
    playTrigger: { type: Number, default: 0 }
  },
  emits: ['playing-change'],
  data() {
    return { hostId: `guide-video-${Date.now()}-${++instanceId}` }
  },
  computed: {
    videoPacket() {
      return {
        hostId: this.hostId, src: this.src, poster: this.poster,
        objectFit: this.objectFit, controls: this.controls, playTrigger: this.playTrigger
      }
    }
  },
  methods: {
    reportPlaying(playing) {
      this.$emit('playing-change', playing)
    }
  }
}
</script>

<script module="hlsView" lang="renderjs">
import Hls from 'hls.js'

const players = new Map()

function dispose(record) {
  if (players.get(record.id) !== record) return
  players.delete(record.id)
  record.observer.disconnect()
  window.removeEventListener('pagehide', record.onPageHide)
  const { video } = record
  video.onplay = video.onpause = video.onended = video.onerror = null
  record.hls?.destroy()
  video.pause()
  video.removeAttribute('src')
  video.load()
  video.remove()
}

function createPlayer(host, packet, owner) {
  const video = document.createElement('video')
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = packet.objectFit
  video.poster = packet.poster
  video.controls = packet.controls
  video.playsInline = true
  video.setAttribute('webkit-playsinline', '')

  const record = { id: packet.hostId, src: packet.src, video, hls: null, playTrigger: 0 }
  record.onPageHide = () => dispose(record)
  record.observer = new MutationObserver(() => {
    if (!host.isConnected) dispose(record)
  })
  record.report = playing => {
    if (players.get(record.id) === record) owner.callMethod('reportPlaying', playing)
  }
  record.fail = () => {
    record.report(false)
    dispose(record)
  }
  players.set(record.id, record)
  record.observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('pagehide', record.onPageHide)

  video.onplay = () => record.report(true)
  video.onpause = video.onended = () => record.report(false)
  video.onerror = record.fail
  host.appendChild(video)
  try {
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      record.hls = hls
      hls.on(Hls.Events.ERROR, (_event, error) => { if (error?.fatal) record.fail() })
      hls.loadSource(packet.src)
      hls.attachMedia(video)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = packet.src
    } else {
      record.fail()
    }
  } catch (_) {
    record.fail()
  }
  return record
}

export default {
  methods: {
    update(packet, _previous, owner) {
      if (!packet?.hostId || !packet.src) return
      const host = document.getElementById(packet.hostId)
      if (!host?.isConnected) {
        if (packet.playTrigger) owner.callMethod('reportPlaying', false)
        return
      }
      let record = players.get(packet.hostId)
      if (record && record.src !== packet.src) {
        dispose(record)
        record = null
      }
      record ||= createPlayer(host, packet, owner)
      if (players.get(record.id) !== record || !packet.playTrigger || packet.playTrigger === record.playTrigger) return

      record.playTrigger = packet.playTrigger
      try {
        record.video.play()?.catch?.(record.fail)
      } catch (_) {
        record.fail()
      }
    }
  }
}
</script>

<style scoped>
.guide-app-video { width: 100%; height: 100%; }
</style>
