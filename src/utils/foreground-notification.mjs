const text = (value, limit) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '').replace(/\s+/g, ' ').trim().slice(0, limit)

export function notificationAvatarUrl(value, base = '') {
  const avatar = typeof value === 'string' ? value.trim() : ''
  if (!avatar || /(?:^|\/)(?:person\.webp\.png|default-avatar[^/?#]*)(?:[?#]|$)/i.test(avatar) || /^https?:\/\/ui-avatars\.com(?:[/:?#]|$)/i.test(avatar)) return ''
  if (/^https?:\/\/|^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(avatar)) return avatar
  const origin = String(base).replace(/\/+$/, '')
  if (avatar.startsWith('/static/') || avatar.startsWith('/images/')) return origin + avatar
  if (avatar.startsWith('chat/groups/avatars/')) return `${origin}/files/download/${avatar}`
  return ''
}

export function createForegroundNotifications({ getOwner = () => '', now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null, timer = null, sequence = 0
  const listeners = new Set()
  const valid = () => current && current.owner === getOwner() && current.expiresAt > now()
  const snapshot = () => valid() ? { id: current.id, title: current.title, content: current.content, icon: current.icon, avatar: current.avatar } : null
  const publish = () => { const value = snapshot(); for (const listener of listeners) listener(value) }
  function clear() {
    if (timer !== null) clearTimer(timer)
    timer = null; current = null; publish()
  }
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
    show(options = {}) {
      if (timer !== null) clearTimer(timer)
      const duration = Math.min(10000, Math.max(1000, Number(options.duration) || 3000))
      const id = ++sequence
      current = { id, title: text(options.title, 100) || '新消息', content: text(options.content, 200),
        icon: text(options.icon, 8) || '💬', avatar: options.avatar || '', owner: getOwner(), expiresAt: now() + duration, onTap: options.onTap }
      timer = setTimer(() => { if (current?.id === id) clear() }, duration)
      publish()
      return id
    },
    refresh() { if (current && !valid()) clear(); else publish() },
    dismiss(id) { if (current?.id === id) clear() },
    tap(id) {
      if (!valid()) { clear(); return }
      if (current.id !== id) return
      const onTap = current.onTap
      clear()
      if (typeof onTap === 'function') onTap()
    },
    clear
  }
}

export const foregroundNotifications = createForegroundNotifications({
  getOwner: () => typeof uni === 'undefined' ? '' : (uni.getStorageSync('token') || '')
})
