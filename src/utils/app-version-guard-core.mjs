import { appDownloadUrl, compareVersions } from './app-update-core.mjs'

export const APP_UPGRADE_CODE = 'APP_UPGRADE_REQUIRED'
export const APP_UPGRADE_PAGE = '/pages-nonTheme/app-upgrade-required'

function pathname(value) { return String(value || '').split(/[?#]/)[0].replace(/^\//, '') }
function parseData(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch (_) { return null }
}

// All version thresholds, feature mappings and download destinations come from
// the server. The packaged version only identifies this installed client.
export function createAppVersionGuard({ runtime, baseUrl, version, platform, openURL }) {
  const base = String(baseUrl).replace(/\/+$/, '')
  const rawRequest = runtime.request.bind(runtime)
  const rawReLaunch = runtime.reLaunch.bind(runtime)
  let currentVersion = version, policy = null, fetchedAt = 0, pending = null
  let blocked = null, modalActive = false, installed = false, openingGlobalPage = false
  const listeners = new Set()

  function metadata() {
    return { 'X-FTX-Client': 'app', 'X-FTX-Version': currentVersion, 'X-FTX-OS': platform }
  }
  function backendPath(url) {
    // Avoid attaching application metadata to third party upload/map URLs.
    const target = String(url || '').replace(/^ws/, 'http')
    if (!target.startsWith(base + '/')) return ''
    return target.slice(base.length).split(/[?#]/)[0]
  }
  function socketUrl(url) {
    if (!backendPath(url)) return url
    const [target, hash] = String(url).split('#')
    const clean = target.replace(/([?&])ftx(?:Client|Version|OS)=[^&]*/g, '$1').replace(/\?&/, '?').replace(/&&/g, '&').replace(/[?&]$/, '')
    return clean + (clean.includes('?') ? '&' : '?') + `ftxClient=app&ftxVersion=${encodeURIComponent(currentVersion)}&ftxOS=${encodeURIComponent(platform)}` + (hash ? '#' + hash : '')
  }
  function downloadUrl(detail = blocked?.data) {
    const target = detail?.url ?? policy?.downloads?.[platform] ?? policy?.url
    // An empty iOS destination must never fall back to the Android APK.
    return target ? appDownloadUrl(base, target) : ''
  }
  function download(detail) {
    const url = downloadUrl(detail)
    if (url) openURL(url)
    else runtime.showToast({ title: '暂无适用的安装包，请联系管理员', icon: 'none' })
  }
  function getState() { return { policy, blocked, version: currentVersion, downloadUrl: downloadUrl() } }
  function changed() { for (const listener of listeners) listener(getState()) }
  function showGlobalPage() {
    const route = runtime.currentRoute?.() || ''
    if (openingGlobalPage || pathname(route) === pathname(APP_UPGRADE_PAGE)) return
    openingGlobalPage = true
    rawReLaunch({ url: APP_UPGRADE_PAGE, complete: () => { openingGlobalPage = false } })
  }
  function handleUpgrade(response, { prompt = true } = {}) {
    const outer = parseData(response)
    const body = outer?.code === APP_UPGRADE_CODE ? outer : parseData(outer?.data)
    if (body?.code !== APP_UPGRADE_CODE) return false
    if (body.data?.scope === 'global') {
      blocked = body
      changed()
      showGlobalPage()
    }
    if (prompt && !modalActive) {
      modalActive = true
      const global = body.data?.scope === 'global'
      const available = !!downloadUrl(body.data)
      runtime.showModal({
        title: global ? '请升级应用' : '该功能需要升级',
        content: (body.msg || body.message || '请更新应用后继续使用') + (available ? '' : '\n暂无适用的安装包，请联系管理员。'),
        showCancel: !global && available,
        cancelText: '返回',
        confirmText: available ? '立即升级' : '知道了',
        success: result => { if (result.confirm && available) download(body.data) },
        complete: () => { modalActive = false }
      })
    }
    return true
  }
  function upgradeFor(featureId) {
    if (!policy) return null
    const feature = policy.features?.[featureId]
    let scope = 'global', minimum = policy.minSupportedVersion
    const below = value => value && (compareVersions(currentVersion, value) === null || compareVersions(currentVersion, value) < 0)
    if (!below(minimum)) {
      if (!feature || !below(feature.minVersion)) return null
      scope = 'feature'; minimum = feature.minVersion
    }
    return { code: APP_UPGRADE_CODE,
      msg: scope === 'global' ? policy.message : (feature.message || `${feature.name}已升级，请更新应用后使用`),
      data: { scope, feature: featureId || '', minVersion: minimum, versionName: policy.versionName,
        platform, url: policy.downloads?.[platform] ?? policy.url ?? '' } }
  }
  async function refresh({ force = false } = {}) {
    if (pending) return pending
    if (!force && policy && Date.now() - fetchedAt < (policy.checkIntervalMs || 60000)) return policy
    pending = new Promise((resolve, reject) => rawRequest({
      url: base + '/api/version', method: 'GET', header: metadata(), timeout: 8000,
      success: response => {
        const body = parseData(response.data)
        const next = body?.code === 0 ? body.data : null
        if (response.statusCode !== 200 || !next || compareVersions(next.versionName, next.versionName) !== 0) {
          reject(new Error('版本配置暂不可用')); return
        }
        policy = next
        fetchedAt = Date.now()
        blocked = upgradeFor() // A policy rollback releases the global gate.
        changed()
        resolve(policy)
      },
      fail: reject
    })).finally(() => { pending = null })
    return pending
  }
  async function ensure({ page, feature, force = false, prompt = true } = {}) {
    try { await refresh({ force }) } catch (_) { /* No policy is not evidence of incompatibility; the server still checks requests. */ }
    if (page && pathname(page) === pathname(APP_UPGRADE_PAGE)) return true
    // A server rejection is authoritative even while the cached policy is stale.
    if (blocked) { handleUpgrade(blocked, { prompt }); return false }
    const featureId = feature || Object.keys(policy?.features || {}).find(id =>
      policy.features[id].pages?.some(pattern => new RegExp(pattern).test(pathname(page))))
    const upgrade = upgradeFor(featureId)
    if (upgrade) { handleUpgrade(upgrade, { prompt }); return false }
    return true
  }
  async function checkCurrentPage({ force = false } = {}) {
    const page = runtime.currentRoute?.() || ''
    if (!page || pathname(page) === pathname(APP_UPGRADE_PAGE)) return
    if (!await ensure({ page, force }) && !blocked) {
      // Deep links and native notifications can bypass uni navigation methods.
      if ((runtime.pageCount?.() || 0) > 1) runtime.navigateBack({ delta: 1 })
      else rawReLaunch({ url: runtime.homeUrl() })
    }
  }
  function install() {
    if (installed) return
    installed = true
    for (const api of ['request', 'uploadFile']) runtime.addInterceptor(api, {
      invoke(options) { if (backendPath(options.url)) options.header = { ...options.header, ...metadata() } },
      success(response, options) { if (backendPath(options?.url)) handleUpgrade(response) }
    })
    runtime.addInterceptor('connectSocket', { invoke(options) { options.url = socketUrl(options.url) } })
    // Wrap socket message registration without changing SocketTask or its abort/
    // send/event contracts. Native Android uses the same handler explicitly.
    const connectSocket = runtime.connectSocket.bind(runtime)
    runtime.connectSocket = function (options = {}) {
      const socket = connectSocket(options)
      if (socket?.onMessage && backendPath(options.url)) {
        const onMessage = socket.onMessage.bind(socket)
        socket.onMessage = handler => onMessage(event => { handleUpgrade(parseData(event.data)); handler(event) })
      }
      return socket
    }
    for (const api of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab']) {
      const navigate = runtime[api].bind(runtime)
      runtime[api] = async function (options = {}) {
        if (await ensure({ page: options.url })) return navigate(options)
        const error = { code: APP_UPGRADE_CODE, errMsg: `${api}:fail app upgrade required` }
        options.fail?.(error)
        options.complete?.(error)
        // Callback users receive fail/complete; promise users receive rejection.
        if (!options.fail && !options.complete && !options.success) throw error
      }
    }
  }
  return { install, metadata, socketUrl, handleUpgrade, refresh, ensure, checkCurrentPage, download, getState,
    setVersion(value) { if (compareVersions(value, value) === 0) currentVersion = value },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) } }
}
