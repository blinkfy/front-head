export const BACKGROUND_MESSAGES_KEY = 'chat:background-messages'

export function canConfigureBackgroundMessages() {
  try {
    if (!uni.getStorageSync('token')) return false
    let user = uni.getStorageSync('userInfo')
    if (typeof user === 'string') user = JSON.parse(user)
    if (user?.isAdmin === false) return false
    if (user?.isAdmin === true) return true
    return [true, 1, '1', 'true'].includes(uni.getStorageSync('isAdmin'))
  } catch (_) { return false }
}

export function readBackgroundMessagesEnabled() {
  // Ordinary accounts always opt in, regardless of a previous administrator's choice.
  return !canConfigureBackgroundMessages() || uni.getStorageSync(BACKGROUND_MESSAGES_KEY) !== false
}

export function writeBackgroundMessagesEnabled(enabled) {
  const configurable = canConfigureBackgroundMessages()
  const value = !configurable || enabled === true
  // Keep the administrator's device preference when switching to an ordinary account.
  if (configurable) uni.setStorageSync(BACKGROUND_MESSAGES_KEY, value)
  uni.$emit('chat:background-messages-changed', value)
  return value
}
