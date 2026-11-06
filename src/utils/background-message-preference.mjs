export const BACKGROUND_MESSAGES_KEY = 'chat:background-messages'

export function readBackgroundMessagesEnabled() {
  // Enable by default; keep an explicit user choice to disable it.
  return uni.getStorageSync(BACKGROUND_MESSAGES_KEY) !== false
}

export function writeBackgroundMessagesEnabled(enabled) {
  const value = enabled === true
  uni.setStorageSync(BACKGROUND_MESSAGES_KEY, value)
  uni.$emit('chat:background-messages-changed', value)
}
