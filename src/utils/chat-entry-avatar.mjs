// Carry avatar data across navigation without putting Base64 in the route URL.
// Keep only the current account's bounded, in-memory hints; image files remain
// in the existing persistent avatar cache.
let owner = ''
const hints = new Map()
function useOwner(account) {
  if (account !== owner) { hints.clear(); owner = account }
  return typeof account === 'string' && !!account
}
export function rememberChatEntryAvatar(account, peerId, avatar) {
  if (!useOwner(account) || !peerId || typeof avatar !== 'string') return
  const key = String(peerId)
  hints.delete(key)
  hints.set(key, { avatar })
  if (hints.size > 32) hints.delete(hints.keys().next().value)
}
export function readChatEntryAvatar(account, peerId, cachedList) {
  if (!useOwner(account) || !peerId) return null
  const hint = hints.get(String(peerId))
  if (hint) return hint
  try {
    const cached = typeof cachedList === 'string' ? JSON.parse(cachedList) : cachedList
    const contact = cached?.userList?.find(user => String(user.otherId) === String(peerId))
    return contact ? { avatar: typeof contact.avatar === 'string' ? contact.avatar : '' } : null
  } catch (_) { return null }
}
