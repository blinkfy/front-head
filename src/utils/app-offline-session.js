import { reactive } from 'vue'

export const appOfflineSession = reactive({ unavailable: false })
let disconnected = false
let networkRevision = 0
let networkQuery
let startupAttempted = false
let cachedSession = null
let reconnecting
let checkSession
let requireLogin

function accountId(user) {
  return String(user?.id ?? user?.userId ?? '')
}

function tokenAccount(token) {
  try {
    const [header, body, signature, extra] = token.split('.')
    if (!header || !body || !signature || extra !== undefined) return ''
    const payload = body.replace(/-/g, '+').replace(/_/g, '/')
    const base64 = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const bytes = new Uint8Array(uni.base64ToArrayBuffer(base64))
    const data = JSON.parse(String.fromCharCode(...bytes))
    return accountId({ id: data.userId ?? data.id })
  } catch (_) { return '' }
}

export function getAppSessionAccountId() {
  return tokenAccount(String(uni.getStorageSync('token') || ''))
}

export function getAppCachedProfile() {
  const user = uni.getStorageSync('userInfo')
  const id = accountId(user)
  return id && id === getAppSessionAccountId() ? user : null
}

function rememberedSession() {
  if (uni.getStorageSync('autoLogin') !== true || uni.getStorageSync('guestMode')) return null
  const token = String(uni.getStorageSync('token') || '')
  const userId = accountId(getAppCachedProfile())
  if (!/^[1-9]\d*$/.test(userId)) return null
  return { token, userId }
}

function isCurrent(session) {
  const current = rememberedSession()
  return current?.token === session.token && current.userId === session.userId
}

function updateAvailability() {
  appOfflineSession.unavailable = disconnected || !!cachedSession
}

function networkChanged(offline) {
  networkRevision++
  disconnected = offline
  updateAvailability()
}

function readNetwork() {
  if (networkQuery) return networkQuery
  const revision = networkRevision
  networkQuery = new Promise(resolve => {
    const finish = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(finish, 400)
    try {
      uni.getNetworkType({ success: ({ networkType }) => {
        if (revision === networkRevision && networkType && networkType !== 'unknown') networkChanged(networkType === 'none')
        finish()
      }, fail: finish })
    } catch (_) { finish() }
  }).finally(() => { networkQuery = null })
  return networkQuery
}

export function installAppOfflineSession(verify, onInvalid) {
  checkSession = verify
  requireLogin = onInvalid
  uni.onNetworkStatusChange?.(event => {
    networkChanged(event.isConnected === false || event.networkType === 'none')
    void retryAppOfflineSession()
  })
}

export async function refreshAppOfflineNetwork() {
  await readNetwork()
  void retryAppOfflineSession()
}

export function appChatConnectionRestored() {
  networkChanged(false)
  void retryAppOfflineSession()
}

export function clearAppOfflineSession() {
  cachedSession = null
  updateAvailability()
}

async function verifySession(session) {
  try {
    const response = await checkSession()
    if (accountId(response.data) !== session.userId) return 'invalid'
    if (!isCurrent(session)) return 'changed'
    uni.setStorageSync('userInfo', { ...uni.getStorageSync('userInfo'), ...response.data })
    if (response.data.isAdmin === true) uni.setStorageSync('isAdmin', true)
    else uni.removeStorageSync('isAdmin')
    return 'valid'
  } catch (error) {
    return error?.code === 401 || error?.statusCode === 401 || error?.error === 'Unauthorized' ? 'invalid' : 'unavailable'
  }
}

export async function resumeRememberedAppSession({ options, isActive, setLoading, navigate }) {
  if (startupAttempted) return false
  startupAttempted = true
  const session = rememberedSession()
  if (!session || String(options?.manualLogin || '') === '1' || options?.username || !checkSession) return false
  setLoading(true)
  await readNetwork()
  if (!isActive() || !isCurrent(session)) { setLoading(false); return true }
  const networkAtStart = networkRevision
  const result = disconnected ? 'unavailable' : await verifySession(session)
  if (!isActive() || !isCurrent(session)) { setLoading(false); return true }
  if (result === 'invalid') { requireLogin(session.token); return true }
  if (result !== 'valid' || disconnected) {
    cachedSession = session
    updateAvailability()
    if (networkRevision !== networkAtStart) void retryAppOfflineSession()
  }
  if (await navigate(appOfflineSession.unavailable) === false) clearAppOfflineSession()
  return true
}

export function retryAppOfflineSession() {
  if (reconnecting || disconnected || !cachedSession) return reconnecting
  const session = cachedSession
  if (!isCurrent(session)) { clearAppOfflineSession(); return }
  const networkAtStart = networkRevision
  reconnecting = verifySession(session).then(result => {
    if (cachedSession !== session || !isCurrent(session)) return
    if (result === 'invalid') {
      requireLogin(session.token)
      clearAppOfflineSession()
    } else if (result === 'valid' && !disconnected) clearAppOfflineSession()
  }).finally(() => {
    reconnecting = null
    if (networkRevision !== networkAtStart) void retryAppOfflineSession()
  })
  return reconnecting
}
