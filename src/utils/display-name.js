export function getDisplayName(user, fallback = '用户') {
  const nickname = typeof user?.nickname === 'string' ? user.nickname.trim() : ''
  const username = typeof user?.username === 'string' ? user.username.trim() : ''
  return nickname || username || fallback
}
