export const VOICE_STUN_URLS = ['stun:stun.cloudflare.com:3478']
export function callAvatarUrl(value, baseUrl) {
  const avatar = typeof value === 'string' ? value.trim() : ''
  if (/(?:^|\/)(?:person\.webp\.png|default-avatar[^/?#]*)(?:[?#]|$)/i.test(avatar) || /^https?:\/\/ui-avatars\.com(?:[/:?#]|$)/i.test(avatar)) return ''
  if (/^https?:\/\/|^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(avatar)) return avatar
  if (/^\/(?:static|images)\//.test(avatar)) return String(baseUrl || '').replace(/\/+$/, '') + avatar
  return ''
}
export const VOICE_END_LABELS = {
  answered_elsewhere: '已在其它设备接听',
  unavailable: '对方暂不可接听，请确认双方已打开新版 App', forbidden: '当前无法呼叫，请检查联系人、免打扰及聊天开关',
  unsupported: '当前设备暂不支持该通话方式', video_unavailable: '对方暂不能接听视频，请确认双方已更新客户端并保持前台',
  camera_unavailable: '摄像头暂不可用，请关闭其它占用摄像头的应用后重试', busy: '对方正在忙', rejected: '通话已拒绝', cancelled: '通话已取消',
  timeout: '无人接听或通话超时', connect_failed: '无法直连，请尝试切换网络后重试', failed: '通话连接失败',
  disconnected: '连接已断开', background: '已离开前台，通话结束', permission_denied: '未获得通话所需的麦克风或摄像头权限',
  interrupted: '音频被其它应用占用', rate_limited: '呼叫过于频繁，请稍后再试', hangup: '通话已结束', invalid: '通话连接信息无效'
}

export function shouldReturnFromCall(state) {
  return state?.phase === 'ended' && ['hangup', 'cancelled', 'rejected', 'answered_elsewhere'].includes(state.reason)
}

export function createVoiceCallController({ media, send, getOwner, getSelfId, changed = () => {}, isMediaBusy = () => false,
  getRecording = () => null, onRecordingSaved = () => {}, getClaimCallId = () => '', allowScreenShare = true,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, createId = () => `call_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}` }) {
  let active = false, connected = false, serverVersion = 0, videoVersion = 0, ready = false, videoReady = false, call = null
  let pendingSave = null
  let view = { phase: 'idle', supported: false, videoSupported: false, mode: 'audio', peer: null, callId: '', muted: false, speaker: false,
    outgoingPreview: false,
    cameraSupported: false, canSwitchCamera: false, cameraEnabled: false, remoteCameraEnabled: false, facingMode: 'user', playbackBlocked: false, mediaError: '', startedAt: 0, endedAt: 0, reason: '',
    screenShareSupported: false, screenSharing: false, screenAudioSharing: false, screenSharePending: false, remoteScreenSharing: false,
    recordingSupported: false, recording: false, recordingStartedAt: 0, recordingError: '' }
  const publish = patch => { view = { ...view, ...patch, supported: active && connected && ready && media.supported(),
    videoSupported: active && connected && ready && videoReady && videoVersion === 1 && !!media.supportsVideo?.() }; changed({ ...view }) }
  const valid = session => call === session && session.owner === getOwner() && active && connected
  function transmit(event) { try { return send(event) !== false } catch (_) { return false } }
  function announceCapability() {
    const claimCallId = getClaimCallId()
    const video = videoVersion === 1 && !!media.supportsVideo?.()
    const screenShareReceive = video && (media.supportsScreenShareReceive?.() ?? true)
    transmit({ type: 'voice.capability', version: 1, available: media.supported(),
      ...(videoVersion === 1 ? { video, cameraToggle: video, screenShareReceive, voiceScreenShareReceive: screenShareReceive } : {}),
      ...(/^[A-Za-z0-9_-]{12,80}$/.test(claimCallId) ? { claimCallId } : {}) })
  }
  function finish(reason = 'hangup', signal = true) {
    const previous = call
    if (!previous) return
    call = null
    clearTimer(previous.timer); clearTimer(previous.disconnectTimer)
    if (signal && previous.owner === getOwner()) transmit({ type: 'voice.end', callId: previous.id, reason })
    let saving
    try { saving = previous.driver?.close() } catch (_) {}
    try { media.cancel?.(previous.id) } catch (_) {}
    if (saving?.then) {
      const pending = Promise.allSettled([pendingSave, saving]).finally(() => { if (pendingSave === pending) pendingSave = null })
      pendingSave = pending
    }
    publish({ phase: 'ended', reason, endedAt: now(), outgoingPreview: false, recording: false, recordingStartedAt: 0,
      screenShareSupported: false, screenSharing: false, screenAudioSharing: false, screenSharePending: false, remoteScreenSharing: false })
    return saving
  }
  function timeout(session, duration, reason) {
    clearTimer(session.timer)
    session.timer = setTimer(() => { if (call === session) finish(reason) }, duration)
  }
  function begin(id, peer, offerer, mode = 'audio', cameraToggle = false) {
    const session = { id, peer, offerer, mode, video: mode === 'video' || cameraToggle, owner: getOwner(), recording: getRecording(),
      driver: null, opening: null, queue: [], reported: false, invited: false }
    call = session
    timeout(session, 35000, 'timeout')
    publish({ callId: id, peer, mode, phase: offerer ? 'calling' : 'incoming', outgoingPreview: false, muted: false, speaker: mode === 'video',
      cameraSupported: session.video, canSwitchCamera: false, cameraEnabled: mode === 'video', remoteCameraEnabled: mode === 'video', facingMode: 'user', playbackBlocked: false, mediaError: '', startedAt: 0, endedAt: 0, reason: '',
      screenShareSupported: false, screenSharing: false, screenAudioSharing: false, screenSharePending: false, remoteScreenSharing: false,
      recordingSupported: false, recording: false, recordingStartedAt: 0, recordingError: '' })
    return session
  }
  function onMedia(session, event) {
    if (event.type === 'recording') {
      if (session.owner !== getOwner()) return
      if (event.saved) onRecordingSaved(event)
      if (view.callId === session.id) publish({
        recordingSupported: event.recordingSupported === true,
        recording: valid(session) && event.recording === true,
        recordingStartedAt: Number(event.recordingStartedAt) || 0,
        recordingError: event.recordingError || ''
      })
      return
    }
    if (!valid(session)) return
    if (event.type === 'offer' || event.type === 'answer' || event.type === 'ice') {
      if (event.type === 'ice' && / typ relay(?: |$)/.test(event.candidate?.candidate || '')) return
      if (!transmit({ ...event, type: `voice.${event.type}`, callId: session.id })) finish('disconnected', false)
    } else if (event.type === 'control') applyControl(event)
    else if (event.type === 'hangup') finish('hangup')
    else if (event.type === 'playback') publish({ playbackBlocked: event.blocked === true })
    else if (event.type === 'screen_pending') publish({ screenSharePending: event.screenSharingPending === true })
    else if (event.type === 'screen_error') {
      publish({ screenSharePending: false, mediaError: event.reason === 'screen_cancelled' ? '' : '无法共享屏幕，请检查系统权限后重试' })
    }
    else if (event.type === 'screen_audio' && view.screenSharing) {
      publish({ screenAudioSharing: event.screenAudioSharing === true })
    }
    else if (event.type === 'screen' && session.screenShare && typeof event.screenSharing === 'boolean') {
      publish({ screenSharing: event.screenSharing, screenSharePending: false, ...(!event.screenSharing ? { screenAudioSharing: false } : {}) })
      transmit({ type: 'voice.media', callId: session.id, screenSharing: event.screenSharing })
    }
    else if (event.type === 'camera') {
      publish({ ...(typeof event.frontFacing === 'boolean' ? { facingMode: event.frontFacing ? 'user' : 'environment' } : {}),
        ...(typeof event.cameraEnabled === 'boolean' ? { cameraEnabled: event.cameraEnabled } : {}),
        ...(typeof event.canSwitchCamera === 'boolean' ? { canSwitchCamera: event.canSwitchCamera } : {}) })
      if (typeof event.cameraEnabled === 'boolean') transmit({ type: 'voice.media', callId: session.id, cameraEnabled: event.cameraEnabled })
    }
    else if (event.type === 'control_error') {
      publish({ mediaError: event.reason === 'camera_unavailable' ? '摄像头暂不可用，已保留语音，可稍后重试开启摄像头' : '摄像头操作未完成，请检查设备后重试',
        ...(typeof event.cameraEnabled === 'boolean' ? { cameraEnabled: event.cameraEnabled } : {}) })
      if (session.video) transmit({ type: 'voice.media', callId: session.id, cameraEnabled: view.cameraEnabled })
    } else if (event.type === 'error') finish(VOICE_END_LABELS[event.reason] ? event.reason : 'failed')
    else if (event.type === 'state') {
      if (event.state === 'connected') {
        clearTimer(session.disconnectTimer)
        if (!session.reported) { session.reported = true; transmit({ type: 'voice.connected', callId: session.id }) }
      } else if (event.state === 'failed') finish('connect_failed')
      else if (event.state === 'disconnected') {
        clearTimer(session.disconnectTimer)
        if (!media.managesConnectionTimeout?.()) session.disconnectTimer = setTimer(() => { if (call === session) finish('disconnected') }, 8000)
      }
    }
  }
  function open(session) {
    if (session.opening) return
    if (media.managesConnectionTimeout?.()) { clearTimer(session.timer); session.timer = null }
    else timeout(session, 32000, 'connect_failed')
    session.opening = Promise.resolve().then(() => valid(session) ? media.open({ callId: session.id, offerer: session.offerer, mode: session.video ? 'video' : 'audio', cameraEnabled: session.mode === 'video', peerName: session.peer.name, peerAvatar: session.peer.avatar,
      recording: session.recording, entryMode: session.mode, screenShareSupported: view.screenShareSupported,
      stunUrls: VOICE_STUN_URLS.slice(), isCurrent: () => valid(session), onEvent: event => onMedia(session, event) }) : null)
      .then(driver => {
        if (!driver) return
        if (!valid(session)) { driver.close(); return }
        session.driver = driver
        driver.control({ muted: view.muted, speaker: view.speaker, cameraEnabled: view.cameraEnabled, remoteCameraEnabled: view.remoteCameraEnabled,
          ...(view.screenShareSupported ? { screenShareSupported: true } : {}),
          ...(view.remoteScreenSharing ? { remoteScreenSharing: true } : {}),
          ...(view.phase === 'connected' ? { connected: true } : {}) })
        for (const event of session.queue) driver.signal(event)
        session.queue.length = 0
      }).catch(error => {
        if (!valid(session)) return
        console.warn('[voice-call-media]', { stage: 'open-media', mode: session.mode, offerer: session.offerer,
          error: error?.name || '', message: String(error?.message || '').slice(0, 360) })
        finish(['permission_denied', 'camera_unavailable'].includes(error?.code) ? error.code : 'connect_failed')
      })
  }
  function applyControl(options) {
    if (!call || !['connecting', 'connected'].includes(view.phase)) return
    if (typeof options.screenSharing === 'boolean') {
      if (view.phase === 'connected' && view.screenShareSupported && call.driver && !view.screenSharePending) {
        publish({ mediaError: '' })
        call.driver.control({ screenSharing: options.screenSharing })
      }
      return
    }
    const patch = { mediaError: '' }
    const canControlCamera = call.video && !view.screenSharing && !view.screenSharePending
    if (typeof options.muted === 'boolean') patch.muted = options.muted
    if (typeof options.speaker === 'boolean') patch.speaker = options.speaker
    if (canControlCamera && typeof options.cameraEnabled === 'boolean') patch.cameraEnabled = options.cameraEnabled
    publish(patch)
    call.driver?.control({ ...patch, ...(canControlCamera && options.switchCamera ? { switchCamera: true } : {}),
      ...(view.phase === 'connected' && view.recordingSupported && typeof options.recordingEnabled === 'boolean' ? { recordingEnabled: options.recordingEnabled } : {}),
      ...(options.resumePlayback ? { resumePlayback: true } : {}) })
    if (Object.prototype.hasOwnProperty.call(patch, 'cameraEnabled')) transmit({ type: 'voice.media', callId: call.id, cameraEnabled: patch.cameraEnabled })
  }
  return {
    state: () => ({ ...view }),
    waitForRecordingSave: () => pendingSave || Promise.resolve(),
    refreshCapability() { if (active && connected && serverVersion === 1) announceCapability() },
    setActive(value) {
      const resumed = !!value && !active
      active = !!value
      if (!active) { finish('background'); ready = false }
      else if (resumed && connected && serverVersion === 1) announceCapability()
      publish({})
    },
    connection(value, version = 0, video = 0) {
      connected = !!value; serverVersion = Number(version); videoVersion = Number(video); ready = false; videoReady = false
      if (!connected) finish('disconnected', false)
      else if (active && serverVersion === 1) announceCapability()
      publish({})
    },
    start(peer, mode = 'audio') {
      if (!view.supported) throw new Error('双方需要使用支持通话的新版客户端并保持前台连接')
      if (!['audio', 'video'].includes(mode) || (mode === 'video' && !view.videoSupported)) throw new Error('当前客户端暂不支持视频通话，请更新 App 后重试')
      if (call || isMediaBusy()) throw new Error('请先结束当前通话、录音或媒体播放')
      if (!/^[1-9]\d{0,9}$/.test(String(peer?.id || '')) || String(peer.id) === String(getSelfId())) throw new Error('当前联系人不可呼叫')
      const session = begin(createId(), { id: String(peer.id), name: String(peer.name || '联系人').slice(0, 80), avatar: peer.avatar }, true, mode)
      const invite = () => {
        if (!valid(session)) return
        timeout(session, 35000, 'timeout')
        session.invited = true
        if (!transmit({ type: 'voice.invite', callId: session.id, peerId: session.peer.id, ...(mode === 'video' ? { mode } : {}) })) {
          finish('disconnected', false)
          return
        }
        if (mode === 'video' && media.prepareOutgoingPreview) {
          const isCurrent = () => valid(session) && view.phase === 'calling'
          void Promise.resolve().then(() => isCurrent() && media.prepareOutgoingPreview(session.id, session.peer, {
            isCurrent, onCancel: () => { if (isCurrent()) finish('cancelled') },
            onUnavailable: () => { if (isCurrent()) publish({ outgoingPreview: false }) }
          })).then(available => {
            if (available && isCurrent()) publish({ outgoingPreview: true })
          }).catch(() => { /* The call can proceed without a preview. */ })
        }
      }
      if (media.prepareOutgoing) {
        clearTimer(session.timer)
        media.primeRecording?.(session.id, session.recording)
        Promise.resolve().then(() => valid(session) ? media.prepareOutgoing(session.id, mode) : null).then(invite)
          .catch(() => { if (valid(session)) finish('permission_denied') })
      } else invite()
    },
    async accept(expectedCallId) {
      const session = call
      if (!session || !valid(session) || view.phase !== 'incoming' || (expectedCallId && expectedCallId !== session.id)) return
      publish({ phase: 'connecting' })
      clearTimer(session.timer)
      media.primeRecording?.(session.id, session.recording)
      try {
        await media.permission(session.id, session.mode)
        if (!valid(session)) return
        if (!transmit({ type: 'voice.accept', callId: session.id })) finish('disconnected', false)
      } catch (error) { if (valid(session)) finish(error?.code === 'camera_unavailable' ? 'camera_unavailable' : 'permission_denied') }
    },
    end(reason = 'hangup') { return finish(reason) },
    control: applyControl,
    handle(event) {
      if (event.type === 'voice.ready') { ready = active && connected && serverVersion === 1 && event.version === 1; videoReady = ready && event.video === true; publish({}); return }
      if (!active || !connected) return
      if (event.type === 'voice.incoming') {
        if (!event.callId || call?.id === event.callId || !/^[1-9]\d{0,9}$/.test(String(event.peer?.id || ''))) return
        if ((event.mode && !['audio', 'video'].includes(event.mode)) || (event.mode === 'video' && !view.videoSupported)) {
          transmit({ type: 'voice.end', callId: event.callId, reason: 'failed' }); return
        }
        const pendingOutgoing = call?.offerer && !call.invited && view.phase === 'calling'
        if ((call && !pendingOutgoing) || !ready || isMediaBusy() || String(event.peer.id) === String(getSelfId())) {
          transmit({ type: 'voice.end', callId: event.callId, reason: 'busy' }); return
        }
        if (pendingOutgoing) finish('cancelled', false)
        begin(event.callId, event.peer, false, event.mode || 'audio', event.cameraToggle === true); return
      }
      const session = call
      if (!session || event.callId !== session.id) return
      if (!valid(session)) { finish('disconnected', false); return }
      if (event.type === 'voice.local-recording') { onMedia(session, { ...event, type: 'recording' }); return }
      if (event.type === 'voice.local-screen' && session.screenShare && typeof event.screenSharing === 'boolean') {
        publish({ screenSharing: event.screenSharing, screenSharePending: false })
        return
      }
      if (event.type === 'voice.local-screen-error') { onMedia(session, { ...event, type: 'screen_error' }); return }
      if (event.type === 'voice.local-screen-pending') { onMedia(session, { ...event, type: 'screen_pending' }); return }
      if (event.type === 'voice.local-control' && ['connecting', 'connected'].includes(view.phase)) {
        // The native video surface already applied these controls; only mirror UI.
        const patch = {}
        for (const key of ['muted', 'speaker', ...(session.video ? ['cameraEnabled'] : [])])
          if (typeof event[key] === 'boolean') patch[key] = event[key]
        publish(patch)
      } else if (event.type === 'voice.ended') finish(VOICE_END_LABELS[event.reason] ? event.reason : 'hangup', false)
      else if (event.type === 'voice.ringing' && session.offerer && String(event.peer?.id) === session.peer.id) {
        session.peer = { ...session.peer, ...event.peer, id: session.peer.id, avatar: event.peer.avatar ?? session.peer.avatar }
        publish({ peer: session.peer })
      }
      else if (event.type === 'voice.accepted' && ['calling', 'connecting'].includes(view.phase)) {
        session.video = session.mode === 'video' || event.cameraToggle === true
        session.screenShare = session.video && event.screenShareSupported === true
        publish({ phase: 'connecting', cameraSupported: session.video, outgoingPreview: false,
          screenShareSupported: session.screenShare && allowScreenShare && !!media.supportsScreenShare?.() })
        open(session)
      }
      else if (event.type === 'voice.connected') {
        clearTimer(session.timer)
        publish({ phase: 'connected', startedAt: view.startedAt || now() })
        session.driver?.control({ connected: true })
      } else if (event.type === 'voice.media' && session.video) {
        const patch = {}
        if (typeof event.cameraEnabled === 'boolean') patch.remoteCameraEnabled = event.cameraEnabled
        if (session.screenShare && typeof event.screenSharing === 'boolean') patch.remoteScreenSharing = event.screenSharing
        if (Object.keys(patch).length) {
          publish(patch)
          session.driver?.control(patch)
        }
      } else if (['voice.offer', 'voice.answer', 'voice.ice'].includes(event.type)) {
        const incoming = { ...event, type: event.type.slice(6) }
        if (session.driver) session.driver.signal(incoming)
        else if (session.queue.length < 66) session.queue.push(incoming)
        else finish('connect_failed')
      }
    }
  }
}
