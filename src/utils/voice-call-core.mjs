export const VOICE_STUN_URLS = ['stun:stun.cloudflare.com:3478']
export const VOICE_END_LABELS = {
  unavailable: '对方暂不可接听，请确认双方已打开新版 App', forbidden: '当前无法呼叫，请检查联系人、免打扰及聊天开关',
  unsupported: '当前设备暂不支持该通话方式', video_unavailable: '对方暂不能接听视频，请确认双方已更新客户端并保持前台',
  camera_unavailable: '摄像头暂不可用，请关闭其它占用摄像头的应用后重试', busy: '对方正在忙', rejected: '通话已拒绝', cancelled: '通话已取消',
  timeout: '无人接听或通话超时', connect_failed: '无法直连，请尝试切换网络后重试', failed: '通话连接失败',
  disconnected: '连接已断开', background: '已离开前台，通话结束', permission_denied: '未获得通话所需的麦克风或摄像头权限',
  interrupted: '音频被其它应用占用', rate_limited: '呼叫过于频繁，请稍后再试', hangup: '通话已结束', invalid: '通话连接信息无效'
}

export function createVoiceCallController({ media, send, getOwner, getSelfId, changed = () => {}, isMediaBusy = () => false,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, createId = () => `call_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}` }) {
  let active = false, connected = false, serverVersion = 0, videoVersion = 0, ready = false, videoReady = false, call = null
  let view = { phase: 'idle', supported: false, videoSupported: false, mode: 'audio', peer: null, callId: '', muted: false, speaker: false,
    cameraEnabled: true, remoteCameraEnabled: true, facingMode: 'user', playbackBlocked: false, mediaError: '', startedAt: 0, endedAt: 0, reason: '' }
  const publish = patch => { view = { ...view, ...patch, supported: active && connected && ready && media.supported(),
    videoSupported: active && connected && ready && videoReady && videoVersion === 1 && !!media.supportsVideo?.() }; changed({ ...view }) }
  const valid = session => call === session && session.owner === getOwner() && active && connected
  function transmit(event) { try { return send(event) !== false } catch (_) { return false } }
  function finish(reason = 'hangup', signal = true) {
    const previous = call
    if (!previous) return
    call = null
    clearTimer(previous.timer); clearTimer(previous.disconnectTimer)
    if (signal && previous.owner === getOwner()) transmit({ type: 'voice.end', callId: previous.id, reason })
    try { previous.driver?.close(); media.cancel?.(previous.id) } catch (_) {}
    publish({ phase: 'ended', reason, endedAt: now() })
  }
  function timeout(session, duration, reason) {
    clearTimer(session.timer)
    session.timer = setTimer(() => { if (call === session) finish(reason) }, duration)
  }
  function begin(id, peer, offerer, mode = 'audio') {
    call = { id, peer, offerer, mode, owner: getOwner(), driver: null, opening: null, queue: [], reported: false }
    publish({ callId: id, peer, mode, phase: offerer ? 'calling' : 'incoming', muted: false, speaker: mode === 'video',
      cameraEnabled: true, remoteCameraEnabled: true, facingMode: 'user', playbackBlocked: false, mediaError: '', startedAt: 0, endedAt: 0, reason: '' })
    timeout(call, 35000, 'timeout')
    return call
  }
  function onMedia(session, event) {
    if (!valid(session)) return
    if (event.type === 'offer' || event.type === 'answer' || event.type === 'ice') {
      if (event.type === 'ice' && / typ relay(?: |$)/.test(event.candidate?.candidate || '')) return
      if (!transmit({ ...event, type: `voice.${event.type}`, callId: session.id })) finish('disconnected', false)
    } else if (event.type === 'control') applyControl(event)
    else if (event.type === 'hangup') finish('hangup')
    else if (event.type === 'playback') publish({ playbackBlocked: event.blocked === true })
    else if (event.type === 'camera') {
      publish({ facingMode: event.frontFacing === false ? 'environment' : 'user',
        ...(typeof event.cameraEnabled === 'boolean' ? { cameraEnabled: event.cameraEnabled } : {}) })
      if (typeof event.cameraEnabled === 'boolean') transmit({ type: 'voice.media', callId: session.id, cameraEnabled: event.cameraEnabled })
    }
    else if (event.type === 'control_error') {
      publish({ mediaError: '摄像头操作未完成，请检查设备后重试',
        ...(typeof event.cameraEnabled === 'boolean' ? { cameraEnabled: event.cameraEnabled } : {}) })
      if (session.mode === 'video') transmit({ type: 'voice.media', callId: session.id, cameraEnabled: view.cameraEnabled })
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
    session.opening = Promise.resolve().then(() => media.open({ callId: session.id, offerer: session.offerer, mode: session.mode, peerName: session.peer.name,
      stunUrls: VOICE_STUN_URLS.slice(), isCurrent: () => valid(session), onEvent: event => onMedia(session, event) }))
      .then(driver => {
        if (!valid(session)) { driver.close(); return }
        session.driver = driver
        driver.control({ muted: view.muted, speaker: view.speaker, cameraEnabled: view.cameraEnabled, remoteCameraEnabled: view.remoteCameraEnabled })
        for (const event of session.queue) driver.signal(event)
        session.queue.length = 0
      }).catch(error => { if (valid(session)) finish(['permission_denied', 'camera_unavailable'].includes(error?.code) ? error.code : 'connect_failed') })
  }
  function applyControl(options) {
    if (!call || !['connecting', 'connected'].includes(view.phase)) return
    const patch = { mediaError: '' }
    if (typeof options.muted === 'boolean') patch.muted = options.muted
    if (typeof options.speaker === 'boolean') patch.speaker = options.speaker
    if (call.mode === 'video' && typeof options.cameraEnabled === 'boolean') patch.cameraEnabled = options.cameraEnabled
    publish(patch)
    call.driver?.control({ ...patch, ...(call.mode === 'video' && options.switchCamera ? { switchCamera: true } : {}),
      ...(options.resumePlayback ? { resumePlayback: true } : {}) })
    if (Object.prototype.hasOwnProperty.call(patch, 'cameraEnabled')) transmit({ type: 'voice.media', callId: call.id, cameraEnabled: patch.cameraEnabled })
  }
  return {
    state: () => ({ ...view }),
    setActive(value) { active = !!value; if (!active) { finish('background'); ready = false }; publish({}) },
    connection(value, version = 0, video = 0) {
      connected = !!value; serverVersion = Number(version); videoVersion = Number(video); ready = false; videoReady = false
      if (!connected) finish('disconnected', false)
      else if (active && serverVersion === 1) transmit({ type: 'voice.capability', version: 1, available: media.supported(),
        ...(videoVersion === 1 ? { video: !!media.supportsVideo?.() } : {}) })
      publish({})
    },
    start(peer, mode = 'audio') {
      if (!view.supported) throw new Error('双方需要使用支持通话的新版客户端并保持前台连接')
      if (!['audio', 'video'].includes(mode) || (mode === 'video' && !view.videoSupported)) throw new Error('当前客户端暂不支持视频通话，请更新 App 后重试')
      if (call || isMediaBusy()) throw new Error('请先结束当前通话、录音或媒体播放')
      if (!/^[1-9]\d{0,9}$/.test(String(peer?.id || '')) || String(peer.id) === String(getSelfId())) throw new Error('当前联系人不可呼叫')
      const session = begin(createId(), { id: String(peer.id), name: String(peer.name || '联系人').slice(0, 80) }, true, mode)
      if (!transmit({ type: 'voice.invite', callId: session.id, peerId: session.peer.id, ...(mode === 'video' ? { mode } : {}) })) finish('disconnected', false)
    },
    async accept() {
      const session = call
      if (!session || view.phase !== 'incoming') return
      publish({ phase: 'connecting' })
      try {
        await media.permission(session.id, session.mode)
        if (!valid(session)) return
        if (!transmit({ type: 'voice.accept', callId: session.id })) finish('disconnected', false)
      } catch (error) { if (valid(session)) finish(error?.code === 'camera_unavailable' ? 'camera_unavailable' : 'permission_denied') }
    },
    end(reason = 'hangup') { finish(reason) },
    control: applyControl,
    handle(event) {
      if (event.type === 'voice.ready') { ready = active && connected && serverVersion === 1 && event.version === 1; videoReady = ready && event.video === true; publish({}); return }
      if (!active || !connected) return
      if (event.type === 'voice.incoming') {
        if ((event.mode && !['audio', 'video'].includes(event.mode)) || (event.mode === 'video' && !view.videoSupported)) {
          transmit({ type: 'voice.end', callId: event.callId, reason: 'failed' }); return
        }
        if (call || !ready || isMediaBusy() || String(event.peer?.id) === String(getSelfId())) {
          transmit({ type: 'voice.end', callId: event.callId, reason: 'busy' }); return
        }
        begin(event.callId, event.peer, false, event.mode || 'audio'); return
      }
      const session = call
      if (!session || event.callId !== session.id) return
      if (!valid(session)) { finish('disconnected', false); return }
      if (event.type === 'voice.local-control' && ['connecting', 'connected'].includes(view.phase)) {
        // The native video surface already applied these controls; only mirror UI.
        const patch = {}
        for (const key of ['muted', 'speaker', ...(session.mode === 'video' ? ['cameraEnabled'] : [])])
          if (typeof event[key] === 'boolean') patch[key] = event[key]
        publish(patch)
      } else if (event.type === 'voice.ended') finish(VOICE_END_LABELS[event.reason] ? event.reason : 'hangup', false)
      else if (event.type === 'voice.ringing' && session.offerer) publish({ peer: event.peer || session.peer })
      else if (event.type === 'voice.accepted' && ['calling', 'connecting'].includes(view.phase)) { publish({ phase: 'connecting' }); open(session) }
      else if (event.type === 'voice.connected') {
        clearTimer(session.timer)
        publish({ phase: 'connected', startedAt: view.startedAt || now() })
        session.driver?.control({ connected: true })
      } else if (event.type === 'voice.media' && session.mode === 'video' && typeof event.cameraEnabled === 'boolean') {
        publish({ remoteCameraEnabled: event.cameraEnabled })
        session.driver?.control({ remoteCameraEnabled: event.cameraEnabled })
      } else if (['voice.offer', 'voice.answer', 'voice.ice'].includes(event.type)) {
        const incoming = { ...event, type: event.type.slice(6) }
        if (session.driver) session.driver.signal(incoming)
        else if (session.queue.length < 66) session.queue.push(incoming)
        else finish('connect_failed')
      }
    }
  }
}
