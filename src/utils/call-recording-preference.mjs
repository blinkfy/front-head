const numericId = value => /^[1-9]\d{0,9}$/.test(String(value || '')) ? String(value) : ''
export const validRecordingCallId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{12,80}$/.test(value)
export const recordingPlayable = row => row?.status === 'saved' || (row?.status === 'interrupted' && row.size > 0)
export const recordingPreferenceKey = owner => `chat:call-recording:auto:${owner}`
export const recordingCatalogKey = owner => `chat:call-recording:catalog:${owner}`
export function recordingIdentity(runtime = uni) {
  try {
    if (!runtime.getStorageSync('token')) return { owner: '', admin: false }
    let user = runtime.getStorageSync('userInfo') || {}
    if (typeof user === 'string') user = JSON.parse(user)
    const owner = numericId(user.id || user.userId || user.user?.id || user.data?.id)
    const admin = !!owner && (user.isAdmin === true || (user.isAdmin !== false && [true, 1, '1', 'true'].includes(runtime.getStorageSync('isAdmin'))))
    return { owner, admin }
  } catch (_) { return { owner: '', admin: false } }
}
export function readRecordingAuto(runtime = uni) {
  const { owner, admin } = recordingIdentity(runtime)
  return admin && runtime.getStorageSync(recordingPreferenceKey(owner)) === true
}
export function writeRecordingAuto(enabled, runtime = uni) {
  const { owner, admin } = recordingIdentity(runtime)
  if (!admin) return false
  runtime.setStorageSync(recordingPreferenceKey(owner), enabled === true)
  return enabled === true
}
export function recordingConfiguration(runtime = uni) {
  return { ...recordingIdentity(runtime), auto: readRecordingAuto(runtime) }
}
export function recordingRow(value, owner) {
  if (!value || String(value.owner) !== owner || !/^[A-Za-z0-9_-]{12,100}$/.test(value.id || '') ||
      !Number.isFinite(value.createdAt) || value.createdAt <= 0 || !Number.isFinite(value.size) || value.size < 0 ||
      !Number.isFinite(value.durationMs) || value.durationMs < 0 || !['saved', 'recording', 'interrupted'].includes(value.status)) return null
  return { id: value.id, owner, name: String(value.name || '通话录音').slice(0, 80), peerName: String(value.peerName || '联系人').slice(0, 80),
    mode: value.mode === 'video' ? 'video' : 'audio', createdAt: value.createdAt, size: value.size,
    ...(validRecordingCallId(value.callId) ? { callId: value.callId } : {}),
    durationMs: value.durationMs, status: value.status, mimeType: String(value.mimeType || 'audio/webm').slice(0, 80) }
}
export function matchesRecording(row, query) {
  const needle = query.trim().toLowerCase()
  return !needle || [row.name, row.peerName, row.mode === 'video' ? '视频通话' : '语音通话'].some(text => String(text || '').toLowerCase().includes(needle))
}
export function readRecordingCatalog(runtime = uni) {
  const { owner, admin } = recordingIdentity(runtime)
  if (!admin) return []
  const rows = runtime.getStorageSync(recordingCatalogKey(owner))
  return (Array.isArray(rows) ? rows : []).map(row => recordingRow(row, owner)).filter(Boolean).slice(0, 500)
}
export function acceptRecordingCatalog(message, expected, runtime = uni) {
  const { owner, admin } = recordingIdentity(runtime)
  if (!admin || !expected || expected.owner !== owner || message?.kind !== 'call-recordings' ||
      message.owner !== owner || message.bridge !== expected.bridge || !/^[A-Za-z0-9_-]{16,80}$/.test(expected.bridge || '') ||
      !Array.isArray(message.rows) || message.rows.length > 500) return false
  runtime.setStorageSync(recordingCatalogKey(owner), message.rows.map(row => recordingRow(row, owner)).filter(Boolean))
  runtime.$emit?.('call-recordings:changed')
  return true
}
