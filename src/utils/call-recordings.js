import { recordingConfiguration, recordingIdentity, recordingRow, readRecordingCatalog } from './call-recording-preference.mjs'
// #ifdef H5
import { listWebRecordings, readWebRecording, deleteWebRecording, renameWebRecording } from './web-recording-storage.mjs'
import { webRecordingSupported } from './web-call-recording.mjs'
// #endif
import { baseUrl } from '@/api/settings.js'
import { requestWebCallTicket } from './web-call-entry.mjs'
// #ifdef APP-PLUS
import { configureCallRecording, callRecordingOperation } from '@/uni_modules/ftx-voice-call'
// #endif


const changed = () => uni.$emit('call-recordings:changed')
let managerOpening = false
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
      callRecordingOperation(JSON.stringify({ ...request, owner: recordingIdentity().owner }), json => {
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
export async function recordingFileAction(action, row, name = '') {
  const { owner, admin } = recordingIdentity()
  if (!admin || !recordingRow(row, owner)) throw new Error('录音不存在或不属于当前账号')
  // #ifdef APP-PLUS
  const result = await nativeOperation({ action, id: row.id, name })
  if (action !== 'file') changed()
  return result
  // #endif
  // #ifdef H5
  if (action === 'delete') { await deleteWebRecording(owner, row.id); changed(); return { ok: true } }
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
export function newRecordingBridge() {
  const { owner, admin, auto } = recordingConfiguration()
  return admin ? { owner, bridge: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`, recordingAuto: auto ? '1' : '0' } : null
}
export function appendRecordingBridge(url, bridge = newRecordingBridge()) {
  if (!bridge) return url
  return url + `&recordOwner=${bridge.owner}&recordBridge=${bridge.bridge}&recordingAuto=${bridge.recordingAuto}`
}
export async function openWebRecordingManager(id = '') {
  if (managerOpening) return
  const bridge = newRecordingBridge(), token = uni.getStorageSync('token') || ''
  if (!bridge) throw new Error('仅管理员可管理通话录音')
  managerOpening = true
  try {
    const ticket = await requestWebCallTicket(uni, baseUrl, token)
    if (token !== uni.getStorageSync('token')) return
    if (!ticket) throw new Error('暂时无法打开录音文件，请确认后端已更新并重试')
    const query = Object.entries({ selfId: bridge.owner, ticket, recordingId: id }).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
    const url = appendRecordingBridge(`${String(baseUrl).replace(/\/+$/, '')}/web/call/index.html#?view=recordings&${query}`, bridge)
    await new Promise((resolve, reject) => uni.navigateTo({
      url: `/pages-nonTheme/webview?url=${encodeURIComponent(url)}`,
      success: resolve, fail: () => reject(new Error('暂时无法打开录音文件页'))
    }))
  } finally { managerOpening = false }
}
