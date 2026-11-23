import { assertAsrCurrent } from '../local-asr-core.mjs'

export const callTranscriptPath = '/api/admin/call-recordings/transcribe'
const localOverlapMs = 2000
// A low-energy interval can also be a quiet speaker. Keep a little context there too.
const pauseOverlapMs = 800
const pauseSearchMs = 2500
export const transcriptEnergyFrameMs = 20
const minimumPauseFrames = 16

export function findTranscriptPause(levels, fromMs, targetMs) {
  const observed = levels.filter(level => Number.isFinite(level) && level >= 0).sort((a, b) => a - b)
  if (observed.length < minimumPauseFrames) return null
  const percentile = ratio => observed[Math.floor((observed.length - 1) * ratio)]
  // Relative thresholds distinguish a pause from consistently soft speech.
  const threshold = Math.min(.025, Math.max(.0025, percentile(.25) * 2.2), percentile(.85) * .35)
  let quietStart = -1, best = null
  for (let index = 0; index <= levels.length; index++) {
    const level = levels[index]
    if (Number.isFinite(level) && level >= 0 && level <= threshold) {
      if (quietStart < 0) quietStart = index
      continue
    }
    if (quietStart >= 0 && index - quietStart >= minimumPauseFrames) {
      const start = fromMs + quietStart * transcriptEnergyFrameMs
      const end = fromMs + index * transcriptEnergyFrameMs
      // Stay in the interior of a pause, away from the adjacent speech.
      const candidate = Math.max(start + 160, Math.min(end - 160, targetMs))
      if (best == null || Math.abs(candidate - targetMs) < Math.abs(best - targetMs)) best = candidate
    }
    quietStart = -1
  }
  return best
}

export function activeTranscriptIndex(segments, positionMs) {
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index]
    if (positionMs >= segment.startMs && positionMs < segment.endMs) return index
  }
  return -1
}

export function activeTranscriptIndices(segments, positionMs) {
  if (!segments[0]?.speaker) return [activeTranscriptIndex(segments, positionMs)].filter(index => index >= 0)
  const indices = [], seen = new Set()
  for (let i = segments.length - 1; i >= 0 && seen.size < 2; i--) {
    const { speaker, startMs, endMs } = segments[i]
    if (startMs <= positionMs && endMs > positionMs && !seen.has(speaker)) {
      seen.add(speaker)
      indices.push(i)
    }
  }
  return indices
}

function clipTranscript(result, clip, source) {
  const text = String(result?.text || '').trim()
  if (!text) return []
  const length = clip.endMs - clip.startMs
  const timed = (Array.isArray(result.segments) ? result.segments : []).flatMap(item => {
    if (!Number.isFinite(item?.startMs) || !Number.isFinite(item.endMs) || item.startMs < 0 ||
        item.endMs <= item.startMs || item.startMs >= length || typeof item.text !== 'string' || !item.text.trim()) return []
    return [{ startMs: clip.startMs + Math.round(item.startMs), endMs: clip.startMs + Math.min(length, Math.round(item.endMs)),
      text: item.text.trim(), timing: 'sentence', source }]
  }).sort((a, b) => a.startMs - b.startMs)
  const compact = value => value.replace(/[\p{P}\s]+/gu, '')
  if (timed.length && compact(timed.map(item => item.text).join('')) === compact(text)) return timed
  return [{ startMs: clip.startMs, endMs: clip.endMs, text, timing: 'clip', source }]
}

function appendLocalTranscript(segments, next) {
  const previous = segments.at(-1), first = next[0]
  if (previous?.source === 'local' && previous.timing === 'clip' && first?.timing === 'clip' &&
      previous.endMs > first.startMs) {
    // CJK characters and whole Latin words are matched without their punctuation.
    // Move the confirmed shared text to the later clip, which heard the continuation.
    const tokens = text => [...text.matchAll(/[a-z0-9]+(?:['’-][a-z0-9]+)*|[\p{L}\p{N}]/giu)]
    const before = tokens(previous.text), after = tokens(first.text)
    const limit = Math.min(before.length, after.length, 16)
    for (let length = limit; length >= 2; length--) {
      const tail = before.slice(-length)
      if (tail.map(item => item[0]).join('').length < 4 || !tail.every((item, index) => item[0].toLowerCase() === after[index][0].toLowerCase())) continue
      const prefix = previous.text.slice(0, tail[0].index).trimEnd()
      if (prefix && length < before.length) segments[segments.length - 1] = { ...previous, text: prefix }
      break
    }
  }
  segments.push(...next)
}

const inTimeOrder = segments => segments.slice().sort((a, b) => a.startMs - b.startMs)

export const transcriptSpeakerLabel = speaker => speaker === 'self' ? '我方' : speaker === 'peer' ? '对方' : ''

export function cloudTranscriptConsentMessage(reason) {
  const descriptions = {
    BROWSER_UNSUPPORTED: '当前浏览器不支持在本机识别录音文件。',
    LANGUAGE_PACK_REQUIRED: '浏览器的离线中文语音包尚未就绪。',
    AVAILABILITY_CHECK_FAILED: '检查本地离线识别能力时失败或超时。',
    UNAVAILABLE: '当前设备未能启用离线中文识别，可能不支持此能力，或离线中文语音包尚未就绪。',
    LANGUAGE_UNAVAILABLE: '当前环境的离线中文语音识别不可用。',
    NOT_AUTHORIZED: '设备未授予本地语音识别权限。',
    TIMEOUT: '本地识别这段录音时超时。',
    BUSY: '设备的本地语音识别服务正在忙。',
    FILE_MODE_UNSUPPORTED: '设备的本地语音识别服务不支持录音文件。',
    AUDIO_UNSUPPORTED: '本地语音识别服务无法读取这段音频。',
    RECOGNITION_FAILED: '本地语音识别服务处理这段录音时失败。',
    NO_RESULT: '本地语音识别没有从这段录音返回可用文字。'
  }
  const explanation = Object.prototype.hasOwnProperty.call(descriptions, reason) ? descriptions[reason] : descriptions.RECOGNITION_FAILED
  return explanation + '同意后，仅上传无法在本机完成转写的片段至阿里云进行识别。'
}

async function recognizeLocalClip(local, clip, options) {
  let result
  try { result = await local(clip, options) }
  catch (error) {
    if (error?.name === 'AbortError') throw error
    result = { reason: 'RECOGNITION_FAILED' }
  }
  assertAsrCurrent(options)
  return result || { reason: 'NO_RESULT' }
}

// Only discard sustained, near-digital silence. Unknown frames are kept.
function speechSpans(levels, start, end) {
  if (!Array.isArray(levels) || !levels.length) return [[start, end]]
  let first = null, last = null
  const spans = []
  const close = () => {
    if (first != null) spans.push([Math.max(start, first - 200), Math.min(end, last + 200)])
    first = last = null
  }
  for (let time = start, i = 0; time < end; time += transcriptEnergyFrameMs, i++) {
    const level = levels[i]
    if (Number.isFinite(level) && level >= 0 && level <= .00008) {
      if (last != null && time - last >= 700) close()
    } else {
      first ??= time
      last = Math.min(end, time + transcriptEnergyFrameMs)
    }
  }
  close()
  return spans
}

async function transcribeSides(audio, localStatus, deps, options) {
  const canUseLocal = localStatus.available
  const speakers = ['self', 'peer'], bySpeaker = { self: [], peer: [] }
  const ordered = () => inTimeOrder([...bySpeaker.self, ...bySpeaker.peer])
  // A partial retry reuses completed spans, including already billed cloud results.
  const completedClips = options?.completedClips || {}
  const append = (speaker, key, lines) => {
    completedClips[key] = lines
    if (lines[0]?.source === 'local') appendLocalTranscript(bySpeaker[speaker], lines)
    else bySpeaker[speaker].push(...lines)
  }
  const windows = duration => Math.max(1, Math.ceil((duration - pauseSearchMs) / 20000))
  let consent, partial = false, cloudError = '', completed = 0
  for (const speaker of speakers) {
    assertAsrCurrent(options)
    const track = audio.openSide ? await audio.openSide(speaker) : audio
    if (!(track.durationMs > 0 && track.durationMs <= 3_600_000)) throw new Error('通话音轨时长无效')
    const total = windows(track.durationMs)
    const overall = completed + total + (speaker === 'self' ? windows(audio.durationMs) : 0)
    let start = 0, overlap = 0
    for (let index = 0; index < total; index++) {
      assertAsrCurrent(options)
      deps.onProgress(completed++, overall, ordered())
      const target = (index + 1) * 20000
      const final = index + 1 === total
      const until = final ? track.durationMs : Math.min(target + pauseSearchMs, track.durationMs - pauseSearchMs)
      // Energy and slice both use the common playback clock. Analyse each track separately.
      let levels
      try { levels = await track.energyFrames(start, until, speaker) }
      catch (error) { if (error?.name === 'AbortError') throw error }
      assertAsrCurrent(options)
      const fromFrame = Math.max(0, Math.floor((target - pauseSearchMs - start) / transcriptEnergyFrameMs))
      const pause = !final && Array.isArray(levels) ? findTranscriptPause(levels.slice(fromFrame),
        start + fromFrame * transcriptEnergyFrameMs, target) : null
      const end = final ? track.durationMs : pause ?? target
      for (const [begin, finish] of speechSpans(levels, start, end)) {
        const key = `${speaker}:${begin}:${finish}`
        if (Array.isArray(completedClips[key])) {
          append(speaker, key, completedClips[key])
          continue
        }
        if (!canUseLocal) {
          if (consent === undefined) consent = !!(await deps.allowCloud(localStatus.reason))
          assertAsrCurrent(options)
          if (!consent) {
            if (!Object.keys(completedClips).length) return { segments: [], partial: true }
            partial = true
            continue
          }
        }
        const localStart = canUseLocal && begin === start ? Math.max(0, begin - overlap) : begin
        let clip = await track.slice(localStart, finish, speaker)
        try {
          assertAsrCurrent(options)
          if (!clip) throw new Error('无法读取通话音轨片段')
          const result = canUseLocal ? await recognizeLocalClip(deps.local, clip, options) : localStatus
          if (String(result?.text || '').trim()) {
            append(speaker, key, clipTranscript(result, clip, 'local').map(seg => ({ ...seg, speaker })))
            continue
          }
          if (consent === undefined) consent = !!(await deps.allowCloud(result.reason || 'NO_RESULT'))
          assertAsrCurrent(options)
          if (!consent) { partial = true; continue }
          if (localStart < begin) {
            await clip.release?.()
            clip = null
            assertAsrCurrent(options)
            clip = await track.slice(begin, finish, speaker)
            assertAsrCurrent(options)
            if (!clip) throw new Error('无法读取通话音轨片段')
          }
          let response
          try { response = await deps.cloud(clip, options) }
          catch (error) {
            assertAsrCurrent(options)
            if (error?.name === 'AbortError') throw error
            cloudError = error?.message || '部分片段云端转写失败'
            partial = true
            continue
          }
          assertAsrCurrent(options)
          append(speaker, key, clipTranscript(response, clip, 'cloud').map(seg => ({ ...seg, speaker })))
        } finally { await clip?.release?.() }
      }
      overlap = pause != null ? pauseOverlapMs : localOverlapMs
      start = end
    }
  }
  assertAsrCurrent(options)
  return { segments: ordered(), partial, ...(cloudError ? { error: cloudError } : {}) }
}

export async function runCallTranscript({ prepare, localAvailable, local, cloud, allowCloud, onProgress = () => {} }, options) {
  assertAsrCurrent(options)
  let localStatus = { available: false, reason: 'UNAVAILABLE' }
  try {
    const status = await localAvailable(options)
    if (status === true) localStatus = { available: true }
    else if (status && typeof status === 'object') localStatus = status
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    localStatus.reason = 'AVAILABILITY_CHECK_FAILED'
  }
  assertAsrCurrent(options)
  const canUseLocal = localStatus.available
  const audio = await prepare(options)
  assertAsrCurrent(options)
  const duration = audio.durationMs
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取录音时长')
  if (duration > 3_600_000) throw new Error('目前支持转写 1 小时以内的通话录音')
  if (audio.splitTracks) return transcribeSides(audio, localStatus, { local, cloud, allowCloud, onProgress }, options)
  const windowMs = canUseLocal ? 20_000 : 90_000
  const total = Math.max(1, Math.ceil((duration - (canUseLocal ? pauseSearchMs : 0)) / windowMs)), segments = []
  let confirmed = false, previousEnd = 0, nextOverlapMs = 0
  for (let index = 0; index < total; index++) {
    assertAsrCurrent(options)
    onProgress(index, total, inTimeOrder(segments))
    const startMs = previousEnd
    const targetMs = index + 1 === total ? duration : (index + 1) * windowMs
    let pause = null
    if (canUseLocal && index + 1 < total && audio.energyFrames) {
      // Leave enough audio in the final clip even when the best pause is late.
      const fromMs = targetMs - pauseSearchMs, toMs = Math.min(targetMs + pauseSearchMs, duration - pauseSearchMs)
      try {
        const levels = await audio.energyFrames(fromMs, toMs)
        if (Array.isArray(levels)) pause = findTranscriptPause(levels, fromMs, targetMs)
      } catch (error) { if (error?.name === 'AbortError') throw error }
      assertAsrCurrent(options)
    }
    const endMs = pause ?? targetMs
    const localStartMs = Math.max(0, startMs - nextOverlapMs)
    previousEnd = endMs
    if (canUseLocal) nextOverlapMs = pause != null ? pauseOverlapMs : localOverlapMs
    let clip = await audio.slice(localStartMs, endMs)
    try {
      assertAsrCurrent(options)
      if (!clip) continue
      const localResult = canUseLocal ? await recognizeLocalClip(local, clip, options) : localStatus
      if (String(localResult?.text || '').trim()) {
        appendLocalTranscript(segments, clipTranscript(localResult, clip, 'local'))
        continue
      }
      if (!confirmed) {
        confirmed = await allowCloud(localResult.reason || 'NO_RESULT')
        assertAsrCurrent(options)
        if (!confirmed) return { segments: inTimeOrder(segments), partial: true }
      }
      if (localStartMs !== startMs) {
        // The extra boundary audio is for on-device recognition only.
        await clip.release?.()
        clip = null
        assertAsrCurrent(options)
        clip = await audio.slice(startMs, endMs)
        assertAsrCurrent(options)
        if (!clip) continue
      }
      const result = await cloud(clip, options)
      assertAsrCurrent(options)
      segments.push(...clipTranscript(result, clip, 'cloud'))
    } finally { await clip?.release?.() }
  }
  assertAsrCurrent(options)
  return { segments: inTimeOrder(segments), partial: false }
}
