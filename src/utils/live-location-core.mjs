export const LOCATION_END_LABELS = {
  left: '已退出位置共享', disconnected: '连接已断开，已停止共享我的位置', background: '已离开前台，已停止共享我的位置',
  forbidden: '当前无法共享，请检查联系人、免打扰和聊天开关', ended: '这次位置共享已结束',
  busy: '已有位置共享正在进行，请先退出后重试', existing: '双方已有共享，请从聊天顶部的入口加入',
  rate_limited: '操作过于频繁，请稍后重试', invalid: '位置共享信息无效',
  permission_denied: '未获得定位权限，未共享位置', unavailable: '暂时无法定位，请检查定位服务后重试',
  timeout: '位置共享已超时，请重新发起', unsupported: '当前环境不支持实时位置共享'
}
export const validLocationPoint = point => point?.coordinateSystem === 'wgs84' &&
  typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
  typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 &&
  typeof point.accuracy === 'number' && Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= 100000

export function locationDistance(a, b) {
  const rad = value => value * Math.PI / 180
  const lat = rad(b.latitude - a.latitude), lng = rad(b.longitude - a.longitude)
  const n = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(n), Math.sqrt(Math.max(0, 1 - n)))
}

export function createLiveLocationController({ send, tracker, getOwner, getSelfId, changed = () => {}, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, createId = () => `loc_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}` }) {
  let active = false, connected = false, version = 0, ready = false, session = null
  let view = { supported: false, phase: 'idle', sessionId: '', peer: null, selfPoint: null, peerPoint: null, peerJoined: false,
    offers: {}, reason: '', locating: false }
  const publish = patch => { view = { ...view, ...patch, supported: active && connected && ready && tracker.supported() }; changed({ ...view }) }
  const transmit = event => { try { return send(event) !== false } catch (_) { return false } }
  const current = item => item === session && item.owner === getOwner() && active && connected
  const ensureCurrent = item => {
    if (current(item)) return true
    if (item === session) end('disconnected', false)
    return false
  }
  function end(reason = 'left', signal = true) {
    const previous = session
    session = null
    if (!previous) return
    clearTimer(previous.timer); clearTimer(previous.flushTimer)
    previous.pending = null; previous.last = null
    try { previous.stop?.() } catch (_) {}
    if (signal && previous.owner === getOwner()) transmit({ type: 'location.leave', sessionId: previous.id })
    publish({ phase: 'ended', reason, locating: false, selfPoint: null, peerPoint: null, peerJoined: false })
  }
  function flush(item) {
    item.flushTimer = null
    if (!ensureCurrent(item) || !item.pending) return
    const point = item.pending
    if (item.last && locationDistance(item.last, point) < 10 && now() - item.lastAt < 30000) return
    item.pending = null
    if (!transmit({ type: 'location.point', sessionId: item.id, sequence: ++item.sequence, point })) return end('disconnected', false)
    item.last = point; item.lastAt = now()
  }
  function locate(item) {
    if (item.tracking) return
    item.tracking = true; publish({ locating: true })
    if (!tracker.managesTimeout?.()) item.timer = setTimer(() => { if (current(item) && !view.selfPoint) end('unavailable') }, 20000)
    try {
      const stop = tracker.watch(point => {
        if (!ensureCurrent(item) || !validLocationPoint(point)) return
        clearTimer(item.timer)
        publish({ selfPoint: { ...point, updatedAt: now() }, locating: false })
        item.pending = { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, coordinateSystem: 'wgs84' }
        const delay = item.lastAt === null ? 0 : Math.max(0, 5000 - (now() - item.lastAt))
        if (!delay) flush(item)
        else if (!item.flushTimer) item.flushTimer = setTimer(() => flush(item), delay)
      }, error => { if (ensureCurrent(item)) end(error?.code === 1 || error?.code === 'permission_denied' ? 'permission_denied' : 'unavailable') })
      if (current(item)) item.stop = stop
      else stop?.()
    } catch (_) { if (current(item)) end('unavailable') }
  }
  return {
    state: () => ({ ...view }),
    setActive(value) {
      active = !!value
      if (!active) { end('background'); ready = false; publish({ offers: {} }) }
      publish({})
    },
    connection(value, serverVersion = 0) {
      connected = !!value; version = Number(serverVersion); ready = false
      if (!connected) { end('disconnected', false); publish({ offers: {} }) }
      else if (active && version === 1) transmit({ type: 'location.capability', version: 1, available: tracker.supported() })
      publish({})
    },
    enter(peer, sessionId = '') {
      if (!view.supported) throw new Error('请确认已登录、定位可用且聊天连接正常')
      if (session) throw new Error('已有实时位置共享，请先结束')
      if (!/^[1-9]\d{0,9}$/.test(String(peer?.id || '')) || String(peer.id) === String(getSelfId())) throw new Error('当前联系人不可共享位置')
      if (sessionId && !/^[A-Za-z0-9_-]{12,80}$/.test(sessionId)) throw new Error('共享入口无效')
      const item = { id: sessionId || createId(), owner: getOwner(), peer, sequence: 0, lastAt: null, pending: null, stop: null }
      session = item
      publish({ phase: 'joining', sessionId: item.id, peer, reason: '', selfPoint: null, peerPoint: null, peerJoined: false })
      item.timer = setTimer(() => { if (current(item)) end('timeout') }, 10000)
      if (!transmit({ type: sessionId ? 'location.join' : 'location.start', sessionId: item.id, ...(sessionId ? {} : { peerId: String(peer.id) }) })) end('disconnected', false)
    },
    end,
    handle(event) {
      if (event.type === 'location.ready') { ready = active && connected && version === 1 && event.version === 1; publish({}); return }
      if (!active || !connected) return
      if (event.type === 'location.offer') {
        if (String(event.to?.id) !== String(getSelfId()) || !/^[A-Za-z0-9_-]{12,80}$/.test(event.sessionId || '')) return
        const offers = { ...view.offers, [String(event.from.id)]: { sessionId: event.sessionId, peer: event.from } }
        publish({ offers: Object.fromEntries(Object.entries(offers).slice(-128)) }); return
      }
      if (event.type === 'location.ended') {
        publish({ offers: Object.fromEntries(Object.entries(view.offers).filter(([, offer]) => offer.sessionId !== event.sessionId)) })
        if (session?.id === event.sessionId) end(LOCATION_END_LABELS[event.reason] ? event.reason : 'ended', false)
        return
      }
      const item = session
      if (!item || event.sessionId !== item.id) return
      if (!current(item)) { end('disconnected', false); return }
      if (event.type === 'location.joined') {
        if (!item.tracking) clearTimer(item.timer)
        const people = Array.isArray(event.people) ? event.people : []
        const peer = people.find(person => String(person.userId) === String(item.peer.id))
        publish({ phase: 'sharing', peerJoined: !!peer, peerPoint: validLocationPoint(peer?.point) ? peer.point : null })
        locate(item)
      } else if (event.type === 'location.point' && String(event.userId) === String(item.peer.id) && validLocationPoint(event.point)) {
        publish({ peerPoint: event.point, peerJoined: true })
      }
    }
  }
}
