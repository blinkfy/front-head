import { callTranscriptPath, runCallTranscript, transcriptEnergyFrameMs } from './call-transcript.mjs'
import { encodePcmWav } from './web-asr-audio.mjs'
import { webLocalAsrStatus, transcribeWebLocalFiles } from './web-local-asr.mjs'
import { readWebRecording, readWebRecordingTranscript, saveWebRecordingTranscript } from './web-recording-storage.mjs'
import { assertAsrCurrent } from './local-asr-core.mjs'

async function prepareWebAudio(row, options) {
  if (row.size > 64 * 1024 * 1024) throw new Error('录音超过 64 MB，无法转写')
  const Decoder = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext
  if (!Decoder) throw new Error('当前浏览器不能读取这段录音，请在支持的浏览器打开录音页')
  const rate = 16000
  async function decode(speaker) {
    const blob = await readWebRecording(row.owner, row.id, speaker)
    assertAsrCurrent(options)
    let audio
    try { audio = await new Decoder(1, 1, rate).decodeAudioData(await blob.arrayBuffer()) }
    catch (_) { throw new Error('无法解码录音，请确认文件可以播放') }
    assertAsrCurrent(options)
    return pcmAudio(audio, row.trackOffsets?.[speaker] || 0)
  }
  if (!row.splitTracks) return decode()
  // Keep only one decoded participant in memory, especially in mobile WebViews.
  return { splitTracks: true, durationMs: row.durationMs, openSide: decode }
}

function pcmAudio(audio, offset) {
  const sampleRate = audio.sampleRate
  const durationMs = offset + Math.ceil(audio.length * 1000 / sampleRate)
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index))
  function energyFrames(fromMs, toMs) {
    const frames = Math.ceil((toMs - fromMs) / transcriptEnergyFrameMs)
    return Array.from({ length: frames }, (_, frame) => {
      const start = Math.max(0, Math.round((fromMs - offset + frame * transcriptEnergyFrameMs) * sampleRate / 1000))
      const end = Math.min(audio.length, Math.round((Math.min(toMs, fromMs + (frame + 1) * transcriptEnergyFrameMs) - offset) * sampleRate / 1000))
      if (end <= start) return 0
      let sum = 0
      for (const channel of channels) for (let index = start; index < end; index++) sum += channel[index] ** 2
      return Math.sqrt(sum / ((end - start) * channels.length))
    })
  }
  return { durationMs, energyFrames, slice(startMs, endMs) {
    startMs = Math.max(startMs, offset)
    endMs = Math.min(endMs, durationMs)
    const start = Math.round((startMs - offset) * sampleRate / 1000), end = Math.min(audio.length, Math.round((endMs - offset) * sampleRate / 1000))
    if (end <= start) return null
    const pcm = new ArrayBuffer((end - start) * 2), view = new DataView(pcm)
    for (let index = start; index < end; index++) {
      let sample = 0
      for (const channel of channels) sample += channel[index]
      sample = Math.max(-1, Math.min(1, sample / channels.length))
      view.setInt16((index - start) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
    }
    return { startMs, endMs, blob: new Blob([encodePcmWav([pcm], sampleRate)], { type: 'audio/wav' }) }
  } }
}

async function cloudAudio(blob, { baseUrl, token, signal }) {
  const form = new FormData()
  form.append('audio', blob, 'call-clip.wav')
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${callTranscriptPath}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.code !== 0) throw new Error(body?.msg || '云端转写暂不可用，请重试')
  return body.data
}

export async function transcribeWebCall(row, options) {
  assertAsrCurrent(options)
  const saved = await readWebRecordingTranscript(row.owner, row.id)
  assertAsrCurrent(options)
  if (saved && !saved.partial) return saved
  const completedClips = saved?.completedClips || {}
  const result = await runCallTranscript({ prepare: () => prepareWebAudio(row, options),
    localAvailable: () => webLocalAsrStatus(), local: clip => transcribeWebLocalFiles([clip.blob], options),
    cloud: clip => cloudAudio(clip.blob, options), allowCloud: options.allowCloud, onProgress: options.onProgress }, { ...options, completedClips })
  assertAsrCurrent(options)
  if (row.splitTracks || (!result.partial && result.segments.length)) {
    const snapshot = result.partial ? { ...result, completedClips } : result
    await saveWebRecordingTranscript(row.owner, row.id, snapshot, options.isCurrent).catch(() => {})
  }
  assertAsrCurrent(options)
  return result
}
