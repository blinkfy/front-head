import { requestRealtimePermissions } from './realtime-permissions.js'

const features = {
  microphone: { label: '麦克风', scope: 'scope.record', app: 'microphoneAuthorized', android: ['RECORD_AUDIO'] },
  camera: { label: '相机', scope: 'scope.camera', app: 'cameraAuthorized', android: ['CAMERA'] },
  location: { label: '定位', scope: 'scope.userLocation', app: 'locationAuthorized', android: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'], any: true },
  notification: { label: '通知', app: 'notificationAuthorized', android: ['POST_NOTIFICATIONS'], minSdk: 33 },
  album: { label: '相册', scope: 'scope.writePhotosAlbum', app: 'albumAuthorized', android: ['WRITE_EXTERNAL_STORAGE'], maxSdk: 28 }
}
const invoke = (name, options = {}) => new Promise((resolve, reject) => {
  try { uni[name]({ ...options, success: resolve, fail: reject }) } catch (error) { reject(error) }
})
let settingsPrompt = null

export function isPermissionDenied(error) {
  return /permission|authorize|auth deny|auth denied|notallowed|权限|授权/i.test(String(error?.name || '') + ' ' + String(error?.errMsg || error?.message || error || '')) || error?.code === 'permission_denied'
}

// Only explicit feature actions may offer Settings. Returning from App settings
// never resumes a stale capture; the user taps the feature again after granting.
export async function openFeaturePermissionSettings(kind, { isCurrent = () => true } = {}) {
  const feature = features[kind]
  if (!feature || !isCurrent() || settingsPrompt) return false
  const task = (async () => {
    // #ifdef H5
    await invoke('showModal', { title: '浏览器权限设置', content: `请打开浏览器地址栏的站点设置，允许${feature.label}权限后重试。`, showCancel: false }).catch(() => null)
    return false
    // #endif
    const answer = await invoke('showModal', { title: `需要${feature.label}权限`,
      content: `请在设置中允许${feature.label}权限，授权后返回重试。`, confirmText: '去设置', cancelText: '取消' }).catch(() => null)
    if (!answer?.confirm || !isCurrent()) return false
    // #ifdef APP-PLUS
    try {
      await invoke('openAppAuthorizeSetting')
    } catch (_) {
      if (typeof plus !== 'undefined' && plus.os.name === 'Android') {
        const Intent = plus.android.importClass('android.content.Intent')
        const Uri = plus.android.importClass('android.net.Uri')
        const activity = plus.android.runtimeMainActivity()
        activity.startActivity(new Intent('android.settings.APPLICATION_DETAILS_SETTINGS', Uri.parse(`package:${activity.getPackageName()}`)))
      }
    }
    return false
    // #endif
    // #ifdef MP
    if (!feature.scope) return false
    const result = await invoke('openSetting').catch(() => null)
    return isCurrent() && result?.authSetting?.[feature.scope] === true
    // #endif
    return false
  })()
  settingsPrompt = task
  try { return await task } catch (_) { return false } finally { if (settingsPrompt === task) settingsPrompt = null }
}

export async function ensureFeaturePermission(kind, { interactive = true, isCurrent = () => true } = {}) {
  const feature = features[kind]
  if (!feature || !isCurrent()) return false
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.os.name === 'Android') {
    try {
      const sdk = Number(plus.android.importClass('android.os.Build$VERSION').SDK_INT)
      if (sdk < (feature.minSdk || 23) || sdk > (feature.maxSdk || Infinity)) return true
      const permissions = feature.android.map(name => `android.permission.${name}`)
      const activity = plus.android.runtimeMainActivity()
      plus.android.importClass(activity)
      const allowed = list => feature.any ? list.length > 0 : list.length === permissions.length
      const granted = permissions.filter(name => activity.checkSelfPermission(name) === 0)
      if (allowed(granted)) return true
      if (!interactive || !isCurrent()) return false
      const result = await requestRealtimePermissions(permissions)
      if (!isCurrent()) return false
      if (allowed(permissions.filter(name => result.granted?.includes(name)))) return true
      if (result.deniedAlways?.length) await openFeaturePermissionSettings(kind, { isCurrent })
      return false
    } catch (_) { return false }
  }
  // iOS owns the first prompt; a previously denied permission needs Settings.
  try {
    if (uni.getAppAuthorizeSetting?.()[feature.app] === 'denied') {
      if (interactive) await openFeaturePermissionSettings(kind, { isCurrent })
      return false
    }
  } catch (_) {}
  // #endif
  // #ifdef MP
  if (feature.scope) {
    const setting = await invoke('getSetting').catch(() => null)
    if (!isCurrent()) return false
    if (setting?.authSetting?.[feature.scope] === true) return true
    if (!interactive) return false
    if (setting?.authSetting?.[feature.scope] === false) return openFeaturePermissionSettings(kind, { isCurrent })
    try { await invoke('authorize', { scope: feature.scope }); return isCurrent() } catch (_) { return false }
  }
  // #endif
  // H5 must request through getUserMedia/geolocation on every explicit retry.
  return isCurrent()
}

// Native choosers manage their own album grants (including Android's scoped
// photo picker). Do not ask for broad storage access just to select one image.
export async function chooseImageWithPermission(options) {
  const page = typeof getCurrentPages === 'function' ? getCurrentPages().slice(-1)[0] : null
  const isCurrent = () => !page || getCurrentPages().slice(-1)[0] === page
  const fail = error => { options.fail?.(error); options.complete?.(error) }
  if (options.sourceType?.length === 1 && options.sourceType[0] === 'camera' &&
      !await ensureFeaturePermission('camera', { isCurrent })) {
    fail({ errMsg: 'chooseImage:fail camera permission denied' }); return
  }
  if (!isCurrent()) { fail({ errMsg: 'chooseImage:fail cancel' }); return }
  try { uni.chooseImage({ ...options, fail: error => {
    if (isCurrent() && isPermissionDenied(error)) void openFeaturePermissionSettings(options.sourceType?.[0] === 'camera' ? 'camera' : 'album', { isCurrent })
    options.fail?.(error)
  } }) } catch (error) { fail(error) }
}
