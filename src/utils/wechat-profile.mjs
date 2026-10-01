const COMPLETION_KEY = 'wechatProfileCompletionPending'

export function markWechatProfileCompletion(runtime, username) {
  runtime.setStorageSync(COMPLETION_KEY, { username, createdAt: Date.now() })
}

export function consumeWechatProfileCompletion(runtime, user, now = Date.now()) {
  const pending = runtime.getStorageSync(COMPLETION_KEY)
  if (!pending) return false
  if (!Number.isFinite(pending.createdAt) || pending.createdAt > now || now - pending.createdAt > 24 * 60 * 60 * 1000) {
    runtime.removeStorageSync(COMPLETION_KEY)
    return false
  }
  // A shared account login must never inherit another account's registration prompt.
  if (!user?.id || pending.username !== user.username) return false
  runtime.removeStorageSync(COMPLETION_KEY)
  return true
}

export function nicknameError(value) {
  if (typeof value !== 'string' || Array.from(value.trim()).length > 32 || /[\x00-\x1f\x7f-\x9f]/.test(value)) {
    return '昵称最多32个字符，且不能包含控制字符'
  }
  return ''
}
