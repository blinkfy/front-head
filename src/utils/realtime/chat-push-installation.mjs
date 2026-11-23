// Identifies this app installation, not the handset or the signed-in account.
// Keep it across logout and ordinary cache clearing; never use it as a credential.
export const PUSH_INSTALLATION_KEY = 'chat:huawei-push-installation-id'
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value)

export function getOrCreatePushInstallationId(read, write) {
  const existing = read(PUSH_INSTALLATION_KEY)
  if (validId(existing)) return existing
  const id = globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const value = Math.floor(Math.random() * 16)
    return (ch === 'x' ? value : (value & 3) | 8).toString(16)
  })
  write(PUSH_INSTALLATION_KEY, id)
  if (read(PUSH_INSTALLATION_KEY) !== id) throw new Error('Push installation storage unavailable')
  return id
}
