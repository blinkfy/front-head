import { createVoiceCallController, VOICE_END_LABELS } from '../utils/voice-call-core.mjs'
import { voiceCallMedia } from '../utils/voice-call-media.js'
import { createChatEventsTransport } from '../utils/chat-events-transport.mjs'
import { stripWebCallTicket, webCallTarget } from '../utils/web-call-entry.mjs'
import { listWebRecordings, readWebRecording, renameWebRecording, deleteWebRecording } from '../utils/web-recording-storage.mjs'

const content = document.querySelector('#content')
const base = location.origin
let token = '', owner = '', isAdmin = false, controller, transport, state = {}, target = null
let recordBridge = '', recordOwner = '', disposed = false, managerRows = []
let callUi, callTimer, leaving = false, incomingRing = '', ringBlocked = false
let playingUrl = '', playbackRevision = 0
const ringtone = new Audio('./ringtone.mp3')
ringtone.loop = true
ringtone.preload = 'none'
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const params = () => {
  const fragment = location.hash.replace(/^#/, '')
  const query = fragment.startsWith('?') ? fragment.slice(1) : fragment.split('?')[1] || ''
  return new URLSearchParams(query)
}
const endpoint = path => `${base}/api/web-call/${path}`

function stopPlayback() {
  playbackRevision++
  content.querySelector('audio')?.remove()
  if (playingUrl) URL.revokeObjectURL(playingUrl)
  playingUrl = ''
}
async function sendMiniCatalog(rows) {
  if (!recordBridge || !isAdmin || owner !== recordOwner) return
  try { await miniSdk() } catch (_) { return }
  let safeRows = rows.slice(0, 100)
  while (safeRows.length && JSON.stringify(safeRows).length > 100_000) safeRows = safeRows.slice(0, Math.floor(safeRows.length / 2))
  globalThis.wx?.miniProgram?.postMessage({ data: { kind: 'call-recordings', owner, bridge: recordBridge, rows: safeRows } })
}
async function refreshCatalog(notify = false) {
  const rows = await listWebRecordings(owner)
  if (notify) void sendMiniCatalog(rows).catch(() => {})
  return rows
}
async function syncCatalogBeforeReturn() {
  if (!recordBridge || !isAdmin || owner !== recordOwner) return
  let timer
  try {
    await Promise.race([
      listWebRecordings(owner).then(sendMiniCatalog),
      new Promise(resolve => { timer = setTimeout(resolve, 1500) })
    ])
  } catch (_) {} finally { clearTimeout(timer) }
}
function voiceConnection(onEvent, onConnected, onDisconnected) {
  return createChatEventsTransport({ getToken: () => token, getBaseUrl: () => base,
    connectSocket({ url }) {
      const socket = new WebSocket(url), message = new Set(), close = new Set(), error = new Set()
      socket.addEventListener('message', data => message.forEach(fn => fn({ data: data.data })))
      socket.addEventListener('close', data => close.forEach(fn => fn(data)))
      socket.addEventListener('error', data => error.forEach(fn => fn(data)))
      return { send: value => socket.send(value.data), close: value => socket.close(value?.code || 1000, value?.reason),
        isSuspended: () => false,
        onMessage: fn => message.add(fn), onClose: fn => close.add(fn), onError: fn => error.add(fn) }
    }, onEvent, onConnected, onDisconnected })
}
function showError(error, title = '暂时无法打开通话') {
  content.innerHTML = `<h1>${escapeHtml(title)}</h1><p class="error">${escapeHtml(error?.message || String(error))}</p><p>请返回小程序重新打开，或检查网络后重试。</p>`
}
function button(label, action, kind = 'secondary', disabled = false) {
  return `<button class="button ${kind}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`
}
function setupCallUi() {
  content.innerHTML = `
    <h1 class="card-title"></h1><p class="peer"></p><p class="status"></p>
    <div class="video-grid" hidden>
      <div class="video-pane" id="call-video-remote"></div>
      <div class="video-pane" id="call-video-local"></div>
    </div>
    <p class="call-duration card-copy" hidden></p><p class="recording" hidden></p>
    <p class="error" hidden></p><div class="actions"></div><p class="card-copy call-note"></p>
    ${button('返回小程序', 'back')}
  `
  callUi = Object.fromEntries(['card-title', 'peer', 'status', 'video-grid', 'call-duration', 'recording', 'error', 'actions', 'call-note']
    .map(name => [name, content.querySelector('.' + name)]))
}
function updateClock() {
  callUi['call-duration'].textContent = state.startedAt ? '通话时长 ' + duration(Date.now() - state.startedAt) : ''
  callUi.recording.textContent = state.recordingStartedAt ? '● 正在录音 ' + duration(Date.now() - state.recordingStartedAt) : ''
}
function updateRingtone(retry = false) {
  if (state.phase !== 'incoming') {
    if (incomingRing) { ringtone.pause(); ringtone.currentTime = 0 }
    incomingRing = ''
    ringBlocked = false
    return
  }
  if (!retry && incomingRing === state.callId) return
  const id = incomingRing = state.callId
  void ringtone.play().then(() => {
    if (incomingRing === id && ringBlocked) { ringBlocked = false; renderCall() }
  }).catch(() => {
    if (incomingRing === id && !ringBlocked) { ringBlocked = true; renderCall() }
  })
}
function renderCall() {
  const phase = state.phase || 'idle', peerName = state.peer?.name || target?.name || '联系人'
  const idleLabel = voiceCallMedia.supported() ? (state.supported ? '已连接，可以开始通话' : '正在连接通话服务…') : '当前浏览器不支持通话'
  const labels = { idle: idleLabel, calling: '正在呼叫…', incoming: '对方邀请你通话', connecting: '正在建立连接…',
    connected: '通话中', ended: VOICE_END_LABELS[state.reason] || '通话已结束' }
  let actions = ''
  if (phase === 'idle' || phase === 'ended') actions += target?.mode === 'video'
    ? button('发起视频通话', 'start-video', 'primary', !state.videoSupported)
    : button('发起语音通话', 'start-audio', 'primary', !state.supported) + button('视频通话', 'start-video', 'secondary', !state.videoSupported)
  if (phase === 'incoming') {
    actions += button('接听', 'accept', 'primary') + button('拒绝', 'reject', 'danger')
    if (ringBlocked) actions += button('开启来电铃声', 'ring')
  }
  if (['calling', 'connecting', 'connected'].includes(phase)) {
    if (phase === 'connected') actions += button(state.muted ? '开启麦克风' : '静音', 'mute')
    if (phase === 'connected' && state.playbackBlocked) actions += button('开启通话声音', 'resume')
    if (phase === 'connected' && state.cameraSupported) actions += button(state.cameraEnabled ? '关闭摄像头' : '开启摄像头', 'camera')
    if (phase === 'connected' && state.canSwitchCamera) actions += button('切换镜头', 'switch-camera')
    actions += button(phase === 'calling' ? '取消呼叫' : '挂断', 'hangup', 'danger')
  }
  if (phase === 'connected' && state.recordingSupported) actions += button(state.recording ? '停止录音' : '开始录音', 'record', state.recording ? 'danger' : 'secondary')
  const mode = phase === 'idle' ? target?.mode : state.mode
  const title = mode === 'video' ? '视频通话' : '语音通话'
  document.title = `${title} · ${peerName} · 分投侠`
  callUi['card-title'].textContent = title
  callUi.peer.textContent = peerName
  callUi.status.textContent = labels[phase]
  callUi['video-grid'].hidden = !['connecting', 'connected'].includes(phase) || !(state.cameraEnabled || state.remoteCameraEnabled)
  callUi['call-duration'].hidden = phase !== 'connected'
  callUi.recording.hidden = !state.recording
  callUi.error.textContent = state.recordingError || state.mediaError || ''
  callUi.error.hidden = !callUi.error.textContent
  callUi.actions.innerHTML = actions
  callUi['call-note'].textContent = state.supported ? '通话期间请保持页面打开。' : '如长时间无法连接，请检查网络后从小程序重新打开。'
  updateClock()
  if (state.callId) voiceCallMedia.mountVideo?.(state.callId)
  updateRingtone()
}
function duration(value) { const n = Math.max(0, Math.round((value || 0) / 1000)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` }
function renderManager(rows) {
  stopPlayback()
  managerRows = rows
  const selectedId = params().get('recordingId')
  const cards = rows.map(row => {
    const id = row.id
    const status = { saved: '', recording: ' · 正在录制', interrupted: ' · 录制中断' }[row.status]
    const saved = row.status === 'saved' ? button('播放', `play:${id}`) + button('导出', `download:${id}`) : ''
    const editable = row.status !== 'recording' ? button('重命名', `rename:${id}`) + button('删除', `delete:${id}`, 'danger') : ''
    return `<article class="row" id="recording-${id}">
      <div class="row-title">${escapeHtml(row.name)}</div>
      <div class="row-meta">${new Date(row.createdAt).toLocaleString()} · ${duration(row.durationMs)} · ${Math.ceil(row.size / 1024)} KB${status}</div>
      <div class="row-actions">${saved}${editable}</div><div id="audio-${id}"></div>
    </article>`
  }).join('')
  content.innerHTML = `<h1 class="card-title">通话录音</h1><p class="card-copy">录音仅保存在此微信网页中。</p>
    <p class="error" id="file-error" hidden></p>
    ${cards ? `<div class="list">${cards}</div>` : '<div class="empty">暂无录音</div>'}
    <div class="actions">${button('返回小程序', 'back')}</div>`
  if (selectedId) document.getElementById('recording-' + selectedId)?.scrollIntoView({ block: 'center' })
}
async function performManagerAction(action, row) {
  const errorText = document.querySelector('#file-error')
  errorText.hidden = true
  try {
    if (action === 'play' || action === 'download') {
      if (action === 'play') stopPlayback()
      const revision = playbackRevision
      const blob = await readWebRecording(owner, row.id)
      if (disposed) return
      if (action === 'play') {
        if (revision !== playbackRevision) return
        const slot = document.getElementById('audio-' + row.id)
        if (!slot) return
        playingUrl = URL.createObjectURL(blob)
        const audio = new Audio(playingUrl)
        audio.controls = true
        slot.append(audio)
        void audio.play().catch(() => {})
      } else {
        const extension = /mp4|aac/.test(row.mimeType) ? 'm4a' : /ogg/.test(row.mimeType) ? 'ogg' : 'webm'
        const name = row.name.replace(/[\\/:*?"<>|]/g, '_') + '.' + extension
        const file = new File([blob], name, { type: blob.type })
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file] }); return } catch (error) { if (error.name === 'AbortError') return }
        }
        const url = URL.createObjectURL(blob), link = document.createElement('a')
        link.href = url
        link.download = name
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
    } else if (action === 'rename') {
      const name = prompt('录音名称', row.name); if (name == null) return
      await renameWebRecording(owner, row.id, name)
      renderManager(await refreshCatalog(true))
    } else if (action === 'delete' && confirm(`删除“${row.name}”？`)) {
      await deleteWebRecording(owner, row.id)
      renderManager(await refreshCatalog(true))
    }
  } catch (error) {
    errorText.textContent = error.message || '录音操作失败'
    errorText.hidden = false
  }
}
let miniSdkPromise
function miniSdk() {
  if (globalThis.wx?.miniProgram) return Promise.resolve()
  if (miniSdkPromise) return miniSdkPromise
  miniSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('微信通信未就绪')) }
    const timer = setTimeout(fail, 8000)
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = fail
    document.head.appendChild(script)
  }).catch(error => { miniSdkPromise = null; throw error })
  return miniSdkPromise
}
async function boot() {
  const p = params(), manager = p.get('view') === 'recordings'
  const ticket = p.get('ticket') || ''
  if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) throw new Error('通话链接已失效，请从小程序重新打开')
  const expectedOwner = p.get('selfId') || ''
  history.replaceState(history.state, '', stripWebCallTicket(location.href))
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000)
  let response
  let result
  try {
    response = await fetch(endpoint('login'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, selfId: expectedOwner }), signal: abort.signal })
    result = await response.json()
  } catch (_) { throw new Error('登录请求未完成，请检查网络') }
  finally { clearTimeout(timer) }
  if (!response.ok || result.code !== 0 || !result.token || String(result.userInfo?.id) !== expectedOwner) throw new Error('通话链接验证失败，请返回小程序重试')
  owner = expectedOwner; token = result.token; isAdmin = result.userInfo?.isAdmin === true
  recordOwner = p.get('recordOwner') || ''; recordBridge = p.get('recordBridge') || ''
  if (manager) {
    if (!isAdmin || recordOwner !== owner || !/^[A-Za-z0-9_-]{16,80}$/.test(recordBridge)) throw new Error('此录音管理链接无效或权限不足')
    void miniSdk().catch(() => {})
    renderManager(await refreshCatalog(true))
    document.addEventListener('click', event => {
      const raw = event.target.closest('[data-action]')?.dataset.action
      if (!raw) return
      if (raw === 'back') {
        if (leaving) return
        leaving = true
        stopPlayback()
        void syncCatalogBeforeReturn().then(returnToMini)
        return
      }
      const split = raw.indexOf(':'), action = raw.slice(0, split), id = raw.slice(split + 1)
      const row = managerRows.find(item => item.id === id)
      if (row) void performManagerAction(action, row)
    })
    addEventListener('pagehide', () => { disposed = true; stopPlayback() }, { once: true })
    return
  }
  target = webCallTarget({ peerId: p.get('peerId'), selfId: owner, mode: p.get('mode'), name: p.get('name') })
  if (!target) throw new Error('通话链接信息无效')
  setupCallUi()
  callTimer = setInterval(updateClock, 1000)
  transport = voiceConnection(event => controller.handle(event), event => controller.connection(true, event.voiceCallVersion, event.videoCallVersion), () => controller.connection(false))
  controller = createVoiceCallController({ media: voiceCallMedia, send: event => transport.send(event), getOwner: () => token, getSelfId: () => owner,
    changed(value) { state = value; renderCall() },
    getRecording: () => ({ owner, admin: isAdmin, auto: recordOwner === owner && !!recordBridge && p.get('recordingAuto') === '1' }),
    onRecordingSaved: () => { void refreshCatalog(true).catch(() => {}) } })
  controller.setActive(true); transport.setActive(true)
  void miniSdk().catch(() => {})
  renderCall()
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (!action) return
    try {
      if (action === 'start-audio') controller.start({ id: target.peerId, name: target.name }, 'audio')
      else if (action === 'start-video') controller.start({ id: target.peerId, name: target.name }, 'video')
      else if (action === 'accept') void controller.accept()
      else if (action === 'reject') controller.end('rejected')
      else if (action === 'hangup') void finishCall()
      else if (action === 'mute') controller.control({ muted: !state.muted })
      else if (action === 'camera') controller.control({ cameraEnabled: !state.cameraEnabled })
      else if (action === 'switch-camera') controller.control({ switchCamera: true })
      else if (action === 'record') controller.control({ recordingEnabled: !state.recording })
      else if (action === 'resume') controller.control({ resumePlayback: true })
      else if (action === 'ring') updateRingtone(true)
      else if (action === 'back') void leaveCall()
    } catch (error) { state.mediaError = error.message; renderCall() }
  })
  addEventListener('pagehide', () => {
    disposed = true
    clearInterval(callTimer)
    controller.end('background')
    controller.setActive(false)
    transport.setActive(false)
  }, { once: true })
  addEventListener('pageshow', event => { if (event.persisted) showError('请返回小程序重新打开通话') })
}
function returnToMini() {
  if (globalThis.wx?.miniProgram?.navigateBack) globalThis.wx.miniProgram.navigateBack({ delta: 1 })
  else history.back()
}
async function leaveCall() {
  if (leaving) return
  leaving = true
  await finishCall()
  await syncCatalogBeforeReturn()
  controller.setActive(false)
  transport.setActive(false)
  returnToMini()
}
async function finishCall() {
  const reasons = { calling: 'cancelled', incoming: 'rejected' }
  controller.end(reasons[state.phase] || 'hangup')
  await controller.waitForRecordingSave()
}
boot().catch(showError)

