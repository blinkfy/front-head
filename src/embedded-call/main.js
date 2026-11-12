import { showDialog, dialogOpen } from './dialog.js'
import { callAction } from './icons.js'
import { createRecordingPlayer } from './recording-player.js'
import { callAvatarUrl, createVoiceCallController, VOICE_END_LABELS, shouldReturnFromCall } from '../utils/voice-call-core.mjs'
import { voiceCallMedia } from '../utils/voice-call-media.js'
import { createChatEventsTransport } from '../utils/chat-events-transport.mjs'
import { stripWebCallTicket, webCallTarget, miniCallChatPath } from '../utils/web-call-entry.mjs'
import { listWebRecordings, readWebRecording, renameWebRecording, deleteWebRecording } from '../utils/web-recording-storage.mjs'
import { matchesRecording, validRecordingCallId, recordingPlayable } from '../utils/call-recording-preference.mjs'

const content = document.querySelector('#content')
const base = location.origin
let token = '', owner = '', isAdmin = false, controller, transport, state = {}, target = null
let recordBridge = '', recordOwner = '', disposed = false, managerRows = []
let callUi, callTimer, leaving = false, incomingRing = '', ringBlocked = false
let playingUrl = '', playbackRevision = 0, disposePlayback = null
let incomingCallId = '', incomingTimer
let nativeChatAvailable = false, openingNativeChat = false, nativeChatVisit = false
let nativeChatError = '', returningCallId = ''
let managerCallId = '', managerQuery = '', managerSelecting = false, managerDeleting = false
const managerSelection = new Set()
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
  const audio = content.querySelector('audio')
  audio?.closest('.row')?.classList.remove('has-player')
  disposePlayback?.(); disposePlayback = null
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
  const hint = params().get('view') === 'recordings' ? '请返回小程序重新打开，或检查网络后重试。' : '请返回小程序重试，也可以打开分投侠 App，在聊天中进行通话。'
  content.innerHTML = `<h1>${escapeHtml(title)}</h1><p class="error">${escapeHtml(error?.message || String(error))}</p><p>${hint}</p>`
}
function button(label, action, kind = 'secondary', disabled = false) {
  return `<button class="button ${kind}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`
}
let selfIsMain = false, videoControlsHidden = false
function setupCallUi() {
  document.body.classList.remove('entry-loading')
  document.body.classList.add('call-surface')
  content.classList.add('call-screen')
  content.innerHTML = `
    <div class="call-heading"><p class="screen-share-status" role="status" hidden>对方正在共享屏幕</p>
      <p class="card-title"></p><h1 class="peer"></h1><p class="status" aria-live="polite"></p>
      <p class="call-duration" hidden></p><p class="preview-badge" hidden>本机预览</p></div>
    <div class="call-avatar" aria-hidden="true"><span></span><img class="call-avatar-image" alt="" hidden></div>
    <div class="video-grid" hidden>
      <button class="video-pane" type="button" data-action="remote-video">
        <span class="video-feed" id="call-video-remote"></span>
      </button>
      <button class="video-pane" type="button" data-action="local-video">
        <span class="video-feed" id="call-video-local"></span>
      </button>
    </div>
    <div class="call-notices"><p class="recording" hidden></p><p class="error" role="status" hidden></p></div>
    <div class="call-footer"><div class="actions"></div><p class="card-copy call-note"></p>
      <button class="call-back" data-action="back">返回小程序</button></div>
  `
  callUi = Object.fromEntries(['card-title', 'peer', 'status', 'video-grid', 'call-duration', 'preview-badge', 'screen-share-status', 'recording', 'error', 'actions', 'call-note']
    .map(name => [name, content.querySelector('.' + name)]))
  callUi.remoteVideo = content.querySelector('[data-action="remote-video"]')
  callUi.localVideo = content.querySelector('[data-action="local-video"]')
  callUi.avatarInitial = content.querySelector('.call-avatar span')
  callUi.avatarImage = content.querySelector('.call-avatar-image')
  callUi.avatarImage.onload = () => { callUi.avatarImage.hidden = false; callUi.avatarInitial.hidden = true }
  callUi.avatarImage.onerror = () => { callUi.avatarImage.hidden = true; callUi.avatarInitial.hidden = false }
}
function isMainLocal() {
  return state.phase === 'calling' ? state.outgoingPreview === true : state.cameraEnabled && !state.remoteScreenSharing && (!state.remoteCameraEnabled || selfIsMain)
}
function renderVideo(visible) {
  if (!visible) { selfIsMain = false; videoControlsHidden = false }
  content.classList.toggle('video-call', visible)
  const outgoing = state.phase === 'calling'
  content.classList.toggle('video-waiting', visible && outgoing)
  content.classList.toggle('video-controls-hidden', visible && videoControlsHidden && !outgoing)
  callUi['preview-badge'].hidden = !visible || !outgoing
  callUi['video-grid'].hidden = !visible
  callUi['screen-share-status'].hidden = !visible || !state.remoteScreenSharing
  if (!visible) return
  const mainIsLocal = isMainLocal()
  const primaryLabel = videoControlsHidden ? '显示通话控件' : '隐藏通话控件'
  callUi.remoteVideo.hidden = outgoing || (!state.remoteCameraEnabled && !state.remoteScreenSharing)
  callUi.localVideo.hidden = outgoing ? !state.outgoingPreview : !state.cameraEnabled
  callUi.localVideo.tabIndex = outgoing ? -1 : 0
  callUi.remoteVideo.classList.toggle('video-preview', mainIsLocal)
  callUi.localVideo.classList.toggle('video-preview', !mainIsLocal)
  callUi.remoteVideo.setAttribute('aria-label', mainIsLocal ? '将对方画面放大' : primaryLabel)
  callUi.localVideo.setAttribute('aria-label', outgoing ? '本机摄像头预览' : mainIsLocal || state.remoteScreenSharing ? primaryLabel : '将自己画面放大')
}
function updateClock() {
  callUi['call-duration'].textContent = state.startedAt ? duration(Date.now() - state.startedAt) : ''
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
  const idleLabel = incomingCallId ? '正在接听来电…' : voiceCallMedia.supported() ? (state.supported ? '已连接，可以开始通话' : '正在连接通话服务…') : '当前浏览器不支持通话'
  const labels = { idle: idleLabel, calling: '等待对方接听…', incoming: '对方邀请你通话', connecting: '正在建立连接…',
    connected: '通话中', ended: VOICE_END_LABELS[state.reason] || '通话已结束' }
  let actions = ''
  if ((phase === 'idle' && !incomingCallId) || phase === 'ended') actions += target?.mode === 'video'
    ? callAction('发起视频通话', 'start-video', 'camera', { kind: 'accept', disabled: !state.videoSupported })
    : callAction('发起语音通话', 'start-audio', 'phone', { kind: 'accept', disabled: !state.supported }) +
      callAction('视频通话', 'start-video', 'camera', { disabled: !state.videoSupported })
  if (phase === 'incoming') {
    actions += callAction('拒绝', 'reject', 'hangup', { kind: 'danger' }) + callAction('接听', 'accept', 'phone', { kind: 'accept' })
    if (ringBlocked) actions += callAction('开启来电铃声', 'ring', 'speaker')
  }
  if (['calling', 'connecting', 'connected'].includes(phase)) {
    if (phase === 'connected') actions += callAction(state.muted ? '开启麦克风' : '静音', 'mute', 'mic', { off: state.muted, selected: state.muted })
    if (phase === 'connected' && state.playbackBlocked) actions += callAction('开启通话声音', 'resume', 'speaker')
    if (phase === 'connected' && state.cameraSupported) actions += callAction(state.cameraEnabled ? '关闭摄像头' : '开启摄像头', 'camera', 'camera', { off: !state.cameraEnabled, selected: state.cameraEnabled })
    if (phase === 'connected' && state.canSwitchCamera && state.cameraEnabled) actions += callAction('切换镜头', 'switch-camera', 'switch-camera')
    if (phase === 'connected' && state.recordingSupported) actions += callAction(state.recording ? '停止录音' : '开始录音', 'record', 'record', { selected: state.recording })
    if (phase === 'connected' && nativeChatAvailable) actions += callAction('打开聊天', 'open-chat', 'chat', { disabled: openingNativeChat })
    actions += callAction(phase === 'calling' ? '取消呼叫' : '挂断', 'hangup', 'hangup', { kind: 'danger end-call' })
  }
  const mode = phase === 'idle' ? target?.mode : state.mode
  const title = mode === 'video' ? '视频通话' : '语音通话'
  document.title = `${title} · ${peerName}`
  callUi['card-title'].textContent = title
  content.dataset.phase = phase
  callUi.peer.textContent = peerName
  callUi.avatarInitial.textContent = Array.from(peerName)[0] || '聊'
  const avatar = callAvatarUrl(state.peer?.avatar, base)
  if (avatar !== (callUi.avatarImage.getAttribute('src') || '')) {
    callUi.avatarImage.hidden = true
    callUi.avatarInitial.hidden = false
    if (avatar) callUi.avatarImage.src = avatar
    else callUi.avatarImage.removeAttribute('src')
  }
  callUi.status.textContent = labels[phase]
  renderVideo((phase === 'calling' && state.outgoingPreview === true) ||
    (['connecting', 'connected'].includes(phase) && !!(state.cameraEnabled || state.remoteCameraEnabled || state.remoteScreenSharing)))
  callUi['call-duration'].hidden = phase !== 'connected'
  callUi.recording.hidden = !state.recording
  callUi.error.textContent = state.recordingError || state.mediaError || (phase === 'connected' ? nativeChatError : '')
  callUi.error.hidden = !callUi.error.textContent
  callUi.actions.innerHTML = actions
  callUi['call-note'].textContent = state.supported ? '通话期间请保持页面打开。' : '如长时间无法连接，请检查网络后从小程序重新打开。'
  updateClock()
  if (state.callId) voiceCallMedia.mountVideo?.(state.callId)
  updateRingtone()
}
function duration(value) { const n = Math.max(0, Math.round((value || 0) / 1000)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` }
function setupManager() {
  document.body.classList.remove('entry-loading')
  document.title = '通话录音'
  document.body.classList.add('manager-surface')
  content.classList.add('manager-screen')
  content.innerHTML = `<h1 class="card-title">通话录音</h1><p class="card-copy">录音仅保存在此微信网页中。</p>
    <div class="manager-tools"><input type="search" class="manager-search" aria-label="搜索录音" placeholder="搜索录音名称或联系人">
      ${managerCallId ? button('查看全部', 'clear-filter') : ''}${button('选择', 'select-mode')}</div>
    <div class="manager-selection" hidden></div><p class="error" id="file-error" hidden></p>
    <div class="list"></div><div class="actions">${button('返回小程序', 'back')}</div>`
  content.querySelector('.manager-search').addEventListener('input', event => {
    managerQuery = event.target.value
    managerSelection.clear()
    renderManager()
  })
}
function visibleManagerRows() {
  return managerRows.filter(row => (!managerCallId || row.callId === managerCallId) && matchesRecording(row, managerQuery))
}
function renderManager(rows = managerRows) {
  stopPlayback()
  managerRows = rows
  const visible = visibleManagerRows()
  const eligible = visible.filter(row => row.status !== 'recording')
  const selected = eligible.filter(row => managerSelection.has(row.id)).length
  const cards = visible.map(row => {
    const id = row.id
    const status = { saved: '', recording: ' · 正在录制', interrupted: ' · 录制中断，已保留部分声音' }[row.status]
    const saved = recordingPlayable(row)
      ? `<div class="row-playback"><button class="row-play" aria-label="播放" data-action="play:${id}"><span class="play-triangle"></span></button><span class="row-duration">${duration(row.durationMs)}</span><span class="row-play-hint">点击播放</span></div><div id="audio-${id}"></div>` : ''
    const editable = row.status !== 'recording' && !managerSelecting ? `<details class="row-menu"><summary aria-label="更多操作 · ${escapeHtml(row.name)}"><span class="more-dots" aria-hidden="true"><span class="more-dot"></span><span class="more-dot"></span><span class="more-dot"></span></span></summary>
      <div class="row-menu-items">${button('重命名', `rename:${id}`)}${recordingPlayable(row) ? button('导出录音', `download:${id}`) : ''}
        ${button('选择录音', `select:${id}`)}${button('删除录音', `delete:${id}`, 'danger')}</div></details>` : ''
    const checkbox = managerSelecting && row.status !== 'recording'
      ? `<input type="checkbox" data-recording-id="${id}" ${managerSelection.has(id) ? 'checked' : ''} ${managerDeleting ? 'disabled' : ''}>` : ''
    return `<article class="row ${managerSelection.has(id) ? 'row-selected' : ''}" id="recording-${id}">
      <div class="row-heading"><label class="row-title">${checkbox}${escapeHtml(row.name)}</label>${editable}</div>
      <div class="row-meta">${escapeHtml(row.peerName)} · ${new Date(row.createdAt).toLocaleString()} · ${duration(row.durationMs)} · ${Math.ceil(row.size / 1024)} KB${status}</div>
      ${managerSelecting ? '' : saved}
    </article>`
  }).join('')
  content.querySelector('.list').innerHTML = cards || '<div class="empty">没有匹配的录音</div>'
  const select = content.querySelector('[data-action="select-mode"]')
  content.classList.toggle('manager-selecting', managerSelecting)
  select.textContent = managerSelecting ? '完成' : '选择'
  select.disabled = managerDeleting
  const bar = content.querySelector('.manager-selection')
  bar.hidden = !managerSelecting
  bar.innerHTML = managerSelecting ? button(selected && selected === eligible.length ? '取消全选' : '全选', 'select-all', 'secondary', !eligible.length || managerDeleting)
    + button(managerDeleting ? '正在删除…' : selected ? `删除（${selected}）` : '删除', 'delete-selected', 'danger', !selected || managerDeleting) : ''
}
function updateManagerSelection() {
  const eligible = visibleManagerRows().filter(row => row.status !== 'recording')
  const count = eligible.filter(row => managerSelection.has(row.id)).length
  content.querySelector('[data-action="select-all"]').textContent = count && count === eligible.length ? '取消全选' : '全选'
  const remove = content.querySelector('[data-action="delete-selected"]')
  remove.textContent = count ? `删除（${count}）` : '删除'; remove.disabled = !count
}
async function removeManagerRows(rows) {
  if (!rows.length || managerDeleting || dialogOpen()) return
  const confirmed = await showDialog({ title: '删除录音', message: rows.length === 1 ? `确定删除“${rows[0].name}”？删除后无法恢复。` : `确定删除选中的 ${rows.length} 条录音？删除后无法恢复。`, danger: true, confirmLabel: '删除' })
  if (!confirmed || disposed) return
  managerDeleting = true
  const errorText = content.querySelector('#file-error')
  errorText.hidden = true
  renderManager()
  const failures = []
  try {
    for (const row of rows) {
      try { await deleteWebRecording(owner, row.id); managerSelection.delete(row.id) }
      catch (error) { failures.push(error.message) }
    }
    managerRows = await refreshCatalog(true)
    if (failures.length) throw new Error(`${failures.length} 条录音删除失败 · ${failures[0]}`)
    managerSelecting = false
  } catch (error) { errorText.textContent = error.message; errorText.hidden = false }
  finally { managerDeleting = false; if (!disposed) renderManager() }
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
        const player = createRecordingPlayer(audio, slot, { durationMs: row.durationMs, onError: message => {
          if (!disposed && revision === playbackRevision) { errorText.textContent = message; errorText.hidden = false }
        } })
        disposePlayback = player.dispose
        slot.closest('.row').classList.add('has-player')
        void player.play()
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
      const name = await showDialog({ title: '重命名录音', value: row.name, confirmLabel: '保存' }); if (name == null || disposed) return
      await renameWebRecording(owner, row.id, name)
      renderManager(await refreshCatalog(true))
    } else if (action === 'delete') await removeManagerRows([row])
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
async function openNativeChat() {
  if (!nativeChatAvailable || openingNativeChat || leaving || disposed || state.phase !== 'connected') return
  const callId = state.callId
  const url = miniCallChatPath({ selfId: owner, peerId: state.peer?.id, name: state.peer?.name, mode: state.mode })
  if (!url) return
  openingNativeChat = true
  nativeChatError = ''
  renderCall()
  try {
    await miniSdk()
    if (disposed || leaving || state.phase !== 'connected' || state.callId !== callId) return
    const runtime = globalThis.wx?.miniProgram
    if (typeof runtime?.navigateTo !== 'function') throw new Error('当前微信无法打开原生聊天')
    nativeChatVisit = true
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('打开聊天超时，请重试')), 5000)
      const finish = callback => result => { clearTimeout(timer); callback(result) }
      const fail = finish(() => reject(new Error('暂时无法打开聊天，请重试')))
      try { runtime.navigateTo({ url, success: finish(resolve), fail }) }
      catch (_) { fail() }
    })
  } catch (error) {
    nativeChatVisit = false
    if (state.callId === callId) nativeChatError = error.message
  } finally {
    openingNativeChat = false
    if (!disposed) renderCall()
  }
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
    if (validRecordingCallId(p.get('callId'))) managerCallId = p.get('callId')
    setupManager()
    renderManager(await refreshCatalog(true))
    if (p.get('recordingId')) {
      document.getElementById('recording-' + p.get('recordingId'))?.scrollIntoView({ block: 'center' })
      const row = managerRows.find(item => item.id === p.get('recordingId'))
      if (row && ['play', 'rename', 'delete'].includes(p.get('action'))) void performManagerAction(p.get('action'), row)
    }
    content.addEventListener('change', event => {
      const id = event.target.dataset.recordingId
      if (!id || !managerSelecting || managerDeleting) return
      if (event.target.checked) managerSelection.add(id)
      else managerSelection.delete(id)
      event.target.closest('.row').classList.toggle('row-selected', event.target.checked)
      updateManagerSelection()
    })
    content.addEventListener('toggle', event => {
      if (event.target.matches('.row-menu[open]')) content.querySelectorAll('.row-menu[open]').forEach(menu => { if (menu !== event.target) menu.open = false })
    }, true)
    document.addEventListener('click', event => {
      const raw = event.target.closest('[data-action]')?.dataset.action
      if (!raw || managerDeleting || dialogOpen()) return
      content.querySelectorAll('.row-menu[open]').forEach(menu => { menu.open = false })
      if (raw === 'back') {
        if (leaving) return
        leaving = true
        stopPlayback()
        void syncCatalogBeforeReturn().then(returnToMini)
        return
      }
      if (raw === 'clear-filter') { managerCallId = ''; managerSelection.clear(); event.target.closest('[data-action]').remove(); renderManager(); return }
      if (raw === 'select-mode') { managerSelecting = !managerSelecting; managerSelection.clear(); renderManager(); return }
      if (raw === 'select-all') {
        const rows = visibleManagerRows().filter(row => row.status !== 'recording')
        const clear = rows.every(row => managerSelection.has(row.id))
        managerSelection.clear()
        if (!clear) rows.forEach(row => managerSelection.add(row.id))
        renderManager(); return
      }
      if (raw === 'delete-selected') { void removeManagerRows(visibleManagerRows().filter(row => managerSelection.has(row.id))); return }
      const split = raw.indexOf(':'), action = raw.slice(0, split), id = raw.slice(split + 1)
      const row = managerRows.find(item => item.id === id)
      if (row && action === 'select') { managerSelecting = true; managerSelection.clear(); managerSelection.add(id); renderManager(); return }
      if (row) void performManagerAction(action, row)
    })
    addEventListener('pagehide', () => { disposed = true; stopPlayback() }, { once: true })
    return
  }
  target = webCallTarget({ peerId: p.get('peerId'), selfId: owner, mode: p.get('mode'), name: p.get('name') })
  if (!target) throw new Error('通话链接信息无效')
  nativeChatAvailable = p.get('nativeChat') === '1'
  setupCallUi()
  callTimer = setInterval(updateClock, 1000)
  incomingCallId = /^[A-Za-z0-9_-]{12,80}$/.test(p.get('incomingCallId') || '') ? p.get('incomingCallId') : ''
  let initialCallPending = true
  if (incomingCallId) initialCallPending = false
  transport = voiceConnection(event => {
    controller.handle(event)
    if (incomingCallId && event.type === 'voice.incoming' && event.callId === incomingCallId &&
        String(event.peer?.id) === target.peerId && (event.mode || 'audio') === target.mode && state.phase === 'incoming' &&
        state.callId === incomingCallId) {
      const acceptedId = incomingCallId
      clearTimeout(incomingTimer)
      incomingCallId = ''
      void controller.accept(acceptedId)
      return
    }
    if (event.type !== 'voice.ready' || !state.supported || !initialCallPending) return
    initialCallPending = false
    if (state.phase === 'idle' && !event.pendingIncoming) {
      try { controller.start({ id: target.peerId, name: target.name }, target.mode) }
      catch (error) { callUi.error.textContent = error.message; callUi.error.hidden = false }
    }
  }, event => controller.connection(true, event.voiceCallVersion, event.videoCallVersion), () => controller.connection(false))
  controller = createVoiceCallController({ media: voiceCallMedia, send: event => transport.send(event), getOwner: () => token, getSelfId: () => owner,
    allowScreenShare: false,
    getClaimCallId: () => incomingCallId,
    changed(value) {
      state = value
      if (shouldReturnFromCall(state)) { updateRingtone(); void returnCompletedCall(); return }
      renderCall()
    },
    getRecording: () => ({ owner, admin: isAdmin, auto: recordOwner === owner && !!recordBridge && p.get('recordingAuto') === '1' }),
    onRecordingSaved: () => { void refreshCatalog(true).catch(() => {}) } })
  controller.setActive(true); transport.setActive(true)
  if (incomingCallId) incomingTimer = setTimeout(() => {
    if (!incomingCallId || disposed) return
    incomingCallId = ''
    controller.refreshCapability()
    if (state.phase === 'idle') state.mediaError = '来电已结束或未能接通，请返回小程序重试'
    renderCall()
  }, 12000)
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
      else if (action === 'open-chat') void openNativeChat()
      else if (action === 'ring') updateRingtone(true)
      else if (action === 'back') void leaveCall()
      else if (action === 'local-video' || action === 'remote-video') {
        if (state.phase === 'calling') return
        const local = action === 'local-video'
        const mainIsLocal = isMainLocal()
        if (local === mainIsLocal || state.remoteScreenSharing) videoControlsHidden = !videoControlsHidden
        else selfIsMain = local
        renderVideo(true)
      }
    } catch (error) { state.mediaError = error.message; renderCall() }
  })
  addEventListener('pagehide', event => {
    // A cached document can resume. A real unload still releases the call.
    if (event.persisted && nativeChatVisit && !leaving) return
    if (disposed) return
    disposed = true
    clearInterval(callTimer); clearTimeout(incomingTimer)
    controller.end('background')
    controller.setActive(false)
    transport.setActive(false)
  })
  addEventListener('pageshow', event => {
    if (event.persisted && disposed) showError('请返回小程序重新打开通话')
    nativeChatVisit = false
    void returnCompletedCall()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { nativeChatVisit = false; void returnCompletedCall() }
  })
}
function returnToMini() {
  if (globalThis.wx?.miniProgram?.navigateBack) globalThis.wx.miniProgram.navigateBack({ delta: 1 })
  else history.back()
}
async function returnCompletedCall() {
  // Do not pop the native chat stacked above this hidden web-view.
  if (disposed || leaving || returningCallId || document.hidden || nativeChatVisit || !shouldReturnFromCall(state)) return
  const callId = returningCallId = state.callId
  try {
    await controller.waitForRecordingSave()
    await syncCatalogBeforeReturn()
    await miniSdk().catch(() => {})
    if (disposed || leaving || document.hidden || nativeChatVisit || state.callId !== callId || !shouldReturnFromCall(state)) return
    leaving = true
    controller.setActive(false)
    transport.setActive(false)
    returnToMini()
  } finally {
    returningCallId = ''
    if (state.callId !== callId) void returnCompletedCall()
  }
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

