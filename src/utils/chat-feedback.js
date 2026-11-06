import { baseUrl } from '@/api/settings.js'
import { androidChatAlertPolicy, createChatFeedback } from './chat-feedback-core.mjs'
import { areUiSoundsEnabled } from './ui-sounds.js'

const files = { received: '07-message-received.mp3', sent: '08-message-sent.mp3' }
function soundUrl(file) {
  // #ifdef APP-PLUS
  return `/static/app/sounds/${file}`
  // #endif
  // #ifndef APP-PLUS
  return `${baseUrl.replace(/\/+$/, '')}/audio/ui-sounds/${file}`
  // #endif
}
const android = () => typeof plus !== 'undefined' && plus.os?.name === 'Android'
const quiet = { sound: false, vibrate: false }

function systemPolicy() {
  // Keep recognition/recording pages and existing media playback undisturbed.
  try {
    const pages = getCurrentPages()
    if (pages[pages.length - 1]?.route === 'pages-nonTheme/voice-scan') return quiet
  } catch (_) {}
  // #ifdef H5
  if (typeof document !== 'undefined' && (document.hidden ||
    [...document.querySelectorAll('audio, video')].some(media => !media.paused && !media.ended && !media.muted &&
      !Object.values(files).some(file => {
        const src = String(media.currentSrc || media.src || '').split(/[?#]/)[0]
        return src.endsWith(`/static/app/sounds/${file}`) || src.endsWith(`/audio/ui-sounds/${file}`)
      })))) return quiet
  // #endif
  // #ifdef APP-PLUS
  if (android()) {
    try {
      const activity = plus.android.runtimeMainActivity()
      const audio = activity.getSystemService('audio')
      const notifications = activity.getSystemService('notification')
      plus.android.importClass(audio); plus.android.importClass(notifications)
      const Version = plus.android.importClass('android.os.Build$VERSION')
      const sdk = Number(Version.SDK_INT)
      // Unknown/priority/alarms-only DND states stay quiet. No DND access permission.
      return androidChatAlertPolicy({
        ringerMode: Number(audio.getRingerMode()), notificationVolume: Number(audio.getStreamVolume(5)),
        notificationsEnabled: sdk < 24 || notifications.areNotificationsEnabled() === true,
        interruptionFilter: sdk < 23 ? 1 : Number(notifications.getCurrentInterruptionFilter()),
        // Legacy read is conservative for the optional "also vibrate" setting.
        vibrateWhenRinging: audio.shouldVibrate(1) === true
      })
    } catch (_) { return quiet } // Never fall back to media audio or unconditional vibration.
  }
  return quiet // Other native platforms cannot reliably expose the system DND policy.
  // #endif
  // #ifndef APP-PLUS
  return { sound: true, vibrate: false } // Browser/mini-program audio remains subject to platform mute rules.
  // #endif
}

// Native MediaPlayer uses the NOTIFICATION stream, not the media/music stream.
// Two tiny bundled files are copied once to private storage; no server requests.
function createDriver() {
  const entries = new Map()
  let playing = null
  function stop() {
    if (!playing) return
    try { if (playing.isPlaying()) playing.pause(); playing.seekTo(0) } catch (_) {}
    playing = null
  }
  function nativeEntry(kind) {
    if (entries.has(kind)) return entries.get(kind)
    const promise = new Promise((resolve, reject) => {
      const prepare = entry => {
        let player
        try {
          const Player = plus.android.importClass('android.media.MediaPlayer')
          player = new Player()
          player.setAudioStreamType(5) // STREAM_NOTIFICATION; do not change stream volume.
          player.setDataSource(plus.io.convertLocalFileSystemURL(entry.toLocalURL()))
          player.setLooping(false)
          player.prepare()
          resolve(player)
        } catch (error) { try { player?.release() } catch (_) {}; reject(error) }
      }
      plus.io.resolveLocalFileSystemURL('_doc/', root => {
        root.getDirectory('chat-feedback-v1', { create: true }, directory => {
          directory.getFile(files[kind], { create: false }, prepare, () => {
            plus.io.resolveLocalFileSystemURL(`_www/static/app/sounds/${files[kind]}`,
              source => source.copyTo(directory, files[kind], prepare, reject), reject)
          })
        }, reject)
      }, reject)
    }).catch(error => { entries.delete(kind); throw error })
    entries.set(kind, promise)
    return promise
  }
  function webEntry(kind) {
    if (!entries.has(kind)) {
      const context = uni.createInnerAudioContext()
      const entry = { context, canStart: () => false }
      context.autoplay = false; context.loop = false
      context.obeyMuteSwitch = true
      context.onPlay(() => { if (!entry.canStart()) context.stop() })
      context.onError(() => {}) // Autoplay restrictions/resource failures stay quiet.
      context.src = soundUrl(files[kind])
      entries.set(kind, entry)
    }
    return entries.get(kind)
  }
  return {
    warm() {
      // #ifdef APP-PLUS
      if (android()) for (const kind of Object.keys(files)) void nativeEntry(kind).catch(() => {})
      // #endif
    },
    async play(kind, volume, canStart) {
      // #ifdef APP-PLUS
      if (!android()) return false
      const player = await nativeEntry(kind)
      if (!canStart()) return false
      stop(); player.seekTo(0); player.setVolume(volume, volume); playing = player; player.start()
      return true
      // #endif
      // #ifndef APP-PLUS
      const entry = webEntry(kind), context = entry.context
      if (!canStart()) return false
      stop()
      context.volume = volume
      // In contrast to the native player these contexts expose stop(), not pause/seekTo.
      playing = { isPlaying: () => true, pause: () => context.stop(), seekTo: () => {} }
      entry.canStart = canStart
      context.play()
      return true
      // #endif
    },
    stop
  }
}

const feedback = createChatFeedback({
  policy: systemPolicy, enabled: areUiSoundsEnabled, driver: createDriver(),
  getOwner: () => uni.getStorageSync('token') || '',
  vibrate: () => {
    // #ifdef APP-PLUS
    if (android()) plus.device.vibrate(70)
    // #endif
  }
})
export const receiveChatFeedback = options => feedback.receive(options)
export const sentChatFeedback = key => feedback.sent(key)
export const setChatFeedbackActive = value => feedback.setActive(value)
export const setChatFeedbackBlocked = (reason, value) => feedback.setBlocked(reason, value)
