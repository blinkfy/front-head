import { recordingConfiguration, recordingIdentity, recordingRow, readRecordingCatalog, recordingPlayable } from './call-recording-preference.mjs'
import { assertAsrCurrent } from './local-asr-core.mjs'
// #ifdef H5
import { listWebRecordings, readWebRecording, deleteWebRecording, renameWebRecording } from './web-recording-storage.mjs'
import { webRecordingSupported } from './web-call-recording.mjs'
import { transcribeWebCall } from './web-call-transcript.mjs'
// #endif
import { baseUrl } from '@/api/settings.js'
import { requestWebCallTicket } from './web-call-entry.mjs'
// #ifdef APP-PLUS
import { configureCallRecording, callRecordingOperation } from '@/uni_modules/ftx-voice-call'
import { localAsrAvailable, transcribeLocalAudio } from './local-asr.js'
import { callTranscriptPath, runCallTranscript } from './call-transcript.mjs'
// #endif


const changed = () => uni.$emit('call-recordings:changed')
let managerOpening = false
const transcriptKey = row => `chat:call-transcript:${row.owner}:${row.id}`
export function syncNativeRecordingConfiguration() {
  // #ifdef APP-PLUS
  try { configureCallRecording(JSON.stringify(recordingConfiguration())) } catch (_) {}
  // #endif
}
function nativeOperation(request) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try {
      syncNativeRecordingConfiguration()
      callRecordingOperation(JSON.stringify({ owner: recordingIdentity().owner, ...request }), json => {
        try { const result = JSON.parse(json); if (result.error) reject(new Error(result.error)); else resolve(result) }
        catch (error) { reject(error) }
      })
      return
    } catch (_) { reject(new Error('请更新包含通话录音模块的安装包')); return }
    // #endif
    reject(new Error('当前设备不支持此操作'))
  })
}
export function canRecordCalls() {
  if (!recordingIdentity().admin) return false
  // #ifdef H5
  return webRecordingSupported()
  // #endif
  // #ifdef APP-PLUS
  return typeof plus !== 'undefined' && plus.os.name === 'Android' && typeof configureCallRecording === 'function'
  // #endif
  // #ifdef MP-WEIXIN
  return true // The embedded call page performs the actual capability check.
  // #endif
  return false
}
export async function listCallRecordings() {
  const { owner, admin } = recordingIdentity()
  if (!admin) return []
  // #ifdef APP-PLUS
  return ((await nativeOperation({ action: 'list' })).rows || []).map(row => recordingRow(row, owner))
    .filter(Boolean).sort((a, b) => b.createdAt - a.createdAt)
  // #endif
  // #ifdef H5
  return listWebRecordings(owner)
  // #endif
  // #ifndef APP-PLUS || H5
  return readRecordingCatalog()
  // #endif
}
export async function recordingFileAction(action, row, name = '', notify = true) {
  const { owner, admin } = recordingIdentity()
  if (!admin || !recordingRow(row, owner)) throw new Error('录音不存在或不属于当前账号')
  // #ifdef APP-PLUS
  const result = await nativeOperation({ action, id: row.id, name, owner })
  if (action === 'delete') { try { uni.removeStorageSync(transcriptKey(row)) } catch (_) {} }
  if (notify && (action === 'rename' || action === 'delete')) changed()
  return result
  // #endif
  // #ifdef H5
  if (action === 'delete') { await deleteWebRecording(owner, row.id); if (notify) changed(); return { ok: true } }
  if (action === 'rename') { await renameWebRecording(owner, row.id, name); changed(); return { ok: true } }
  if (action === 'file' || action === 'export') {
    const blob = await readWebRecording(owner, row.id)
    const current = recordingIdentity()
    if (!current.admin || current.owner !== owner) throw new Error('登录账号已变更')
    const path = URL.createObjectURL(blob)
    if (action === 'file') return { path, revoke: () => URL.revokeObjectURL(path) }
    const extension = /mp4|aac/.test(row.mimeType) ? 'm4a' : /ogg/.test(row.mimeType) ? 'ogg' : 'webm'
    const link = document.createElement('a')
    link.href = path; link.download = `${row.name.replace(/[\\/:*?"<>|]/g, '_')}.${extension}`
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(path), 60000)
    return { ok: true, exported: true }
  }
  // #endif
  // #ifdef MP-WEIXIN
  await openWebRecordingManager(row.id); return { delegated: true }
  // #endif
  throw new Error('当前设备不支持此操作')
}

export async function deleteCallRecordings(rows) {
  const failures = []
  for (const row of rows) {
    try { await recordingFileAction('delete', row, '', false) }
    catch (error) { failures.push(error.message) }
  }
  if (failures.length < rows.length) changed()
  return failures
}

export function createRecordingPlayer(row, onState, onError, startMs = 0) {
  const { owner, admin } = recordingIdentity()
  if (!admin || !recordingRow(row, owner) || !recordingPlayable(row)) throw new Error('录音不可播放')
  let closed = false
  const valid = () => {
    const current = recordingIdentity()
    return !closed && current.admin && current.owner === owner
  }
  // #ifdef APP-PLUS
  const session = `p_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const request = (action, data = {}) => nativeOperation({ action: 'playback-' + action, owner, id: row.id, session, ...data })
  let timer, pending = false, playRequested = true
  const update = async (action, data) => {
    if (!valid()) { stop(); return }
    if (action === 'status' && pending) return
    pending = true
    clearTimeout(timer)
    try {
      const state = await request(action, data)
      if (!valid()) { stop(); return }
      onState(state)
      clearTimeout(timer)
      if (!state.ended && playRequested) timer = setTimeout(() => void update('status'), 350)
    } catch (error) {
      if (valid()) onError(error)
      stop()
    } finally { pending = false }
  }
  function stop() {
    if (closed) return
    closed = true
    clearTimeout(timer)
    void request('stop').catch(() => {})
  }
  void update('start', { positionMs: startMs })
  return { stop, pause: () => { playRequested = false; return update('pause') },
    resume: () => { playRequested = true; return update('resume') }, seek: positionMs => update('seek', { positionMs }) }
  // #endif
  // #ifdef H5
  const audio = new Audio()
  let releaseUrl
  const report = () => {
    if (!valid()) { close(); return }
    onState({ playing: !audio.paused && !audio.ended, positionMs: Math.round(audio.currentTime * 1000),
      durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : row.durationMs, ended: audio.ended })
  }
  const fail = error => { if (valid()) onError(error); close() }
  for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'ended', 'seeked']) audio.addEventListener(event, report)
  audio.addEventListener('error', () => fail(new Error('浏览器无法解码这段录音')))
  function close() {
    if (closed) return
    closed = true
    audio.pause(); audio.removeAttribute('src')
    releaseUrl?.()
  }
  const resume = () => audio.play().catch(error => { if (error.name !== 'AbortError') fail(error) })
  void recordingFileAction('file', row).then(file => {
    if (!valid()) { file.revoke?.(); close(); return }
    releaseUrl = file.revoke
    audio.src = file.path
    if (startMs > 0) audio.currentTime = startMs / 1000
    return resume()
  }).catch(fail)
  return { stop: close, pause: () => audio.pause(), resume, seek: positionMs => { audio.currentTime = positionMs / 1000 } }
  // #endif
  throw new Error('请在录音文件页播放')
}

// #ifdef APP-PLUS
function uploadCallClip(clip, options) {
  assertAsrCurrent(options)
  return new Promise((resolve, reject) => {
    const cancel = () => upload.abort()
    const done = handler => value => { options.signal?.removeEventListener('abort', cancel); handler(value) }
    const upload = uni.uploadFile({ url: `${baseUrl.replace(/\/$/, '')}${callTranscriptPath}`, filePath: clip.path,
      name: 'audio', header: { Authorization: `Bearer ${options.token}` }, timeout: 100000,
      success: done(response => {
        let body
        try { body = JSON.parse(response.data) } catch (_) {}
        if (response.statusCode === 200 && body?.code === 0) resolve(body.data)
        else reject(new Error(body?.msg || '云端转写暂不可用，请重试'))
      }), fail: done(() => reject(new Error('云端转写请求失败，请重试'))) })
    options.signal?.addEventListener('abort', cancel, { once: true })
  })
}
// #endif

export async function transcribeCallRecording(row, options) {
  const { owner, admin } = recordingIdentity()
  if (!admin || !recordingRow(row, owner) || !recordingPlayable(row)) throw new Error('录音不可转写')
  assertAsrCurrent(options)
  // #ifdef H5
  return transcribeWebCall(row, { ...options, baseUrl })
  // #endif
  // #ifdef APP-PLUS
  const saved = uni.getStorageSync(transcriptKey(row))
  const cached = saved?.size === row.size && saved.createdAt === row.createdAt ? saved.result : null
  if (Array.isArray(cached?.segments) && !cached.partial) return cached
  const completedClips = cached?.completedClips || {}
  const result = await runCallTranscript({ localAvailable: localAsrAvailable,
    prepare: () => ({ durationMs: row.durationMs, splitTracks: row.splitTracks,
      async energyFrames(startMs, endMs, speaker) {
        return (await nativeOperation({ action: 'audio-energy', owner, id: row.id, startMs, endMs, speaker })).levels
      }, async slice(startMs, endMs, speaker) {
      const clip = await nativeOperation({ action: 'clip', owner, id: row.id, startMs, endMs, speaker }).catch(error => {
        if (error.message === '操作无效') throw new Error('请更新包含通话转写模块的安装包')
        throw error
      })
      if (!clip.path) return null
      return { ...clip, release: () => nativeOperation({ action: 'release-clip', owner, id: row.id, clip: clip.clip }).catch(() => {}) }
    } }), local: (clip, current) => transcribeLocalAudio([clip.path], { ...current, includeFailureReason: true }),
    cloud: clip => uploadCallClip(clip, options),
    allowCloud: options.allowCloud, onProgress: options.onProgress }, { ...options, completedClips })
  assertAsrCurrent(options)
  if (row.splitTracks || (!result.partial && result.segments.length)) {
    const snapshot = result.partial ? { ...result, completedClips } : result
    try { uni.setStorageSync(transcriptKey(row), { size: row.size, createdAt: row.createdAt, result: snapshot }) } catch (_) {}
  }
  return result
  // #endif
  throw new Error('请在录音文件页转写')
}
export function newRecordingBridge() {
  const { owner, admin, auto } = recordingConfiguration()
  return admin ? { owner, bridge: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`, recordingAuto: auto ? '1' : '0' } : null
}
export function appendRecordingBridge(url, bridge = newRecordingBridge()) {
  if (!bridge) return url
  return url + `&recordOwner=${bridge.owner}&recordBridge=${bridge.bridge}&recordingAuto=${bridge.recordingAuto}`
}
export async function openWebRecordingManager(id = '', callId = '', action = '') {
  if (managerOpening) return
  const bridge = newRecordingBridge(), token = uni.getStorageSync('token') || ''
  if (!bridge) throw new Error('仅管理员可管理通话录音')
  managerOpening = true
  try {
    const ticket = await requestWebCallTicket(uni, baseUrl, token)
    if (token !== uni.getStorageSync('token')) return
    if (!ticket) throw new Error('暂时无法打开录音文件，请确认后端已更新并重试')
    const query = Object.entries({ selfId: bridge.owner, ticket, recordingId: id, callId, action: ['play', 'rename', 'delete', 'transcribe'].includes(action) ? action : '' }).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
    const url = appendRecordingBridge(`${String(baseUrl).replace(/\/+$/, '')}/web/call/index.html#?view=recordings&${query}`, bridge)
    await new Promise((resolve, reject) => uni.navigateTo({
      url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}`,
      success: resolve, fail: () => reject(new Error('暂时无法打开录音文件页'))
    }))
  } finally { managerOpening = false }
}
