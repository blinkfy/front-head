const pending = new Map()
export function beginMfaTransition(token) {
  if (!token) return () => {}
  pending.set(token, (pending.get(token) || 0) + 1)
  return () => {
    const count = (pending.get(token) || 1) - 1
    if (count) pending.set(token, count)
    else pending.delete(token)
  }
}
export const isMfaTransition = token => pending.has(token)
