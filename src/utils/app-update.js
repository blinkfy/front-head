import request from '@/api/index'
import { baseUrl } from '@/api/settings'
import manifest from '@/manifest.json'
import { appDownloadUrl, compareVersions, parseVersionResponse, SKIPPED_APP_VERSION_KEY } from './app-update-core.mjs'

let checking = false

function installedVersion() {
  return new Promise(resolve => {
    if (typeof plus === 'undefined' || !plus.runtime?.getProperty) return resolve(manifest.versionName)
    plus.runtime.getProperty(plus.runtime.appid, info => resolve(info?.version || manifest.versionName))
  })
}

export async function checkAppUpdate({ manual = false } = {}) {
  if (checking) return
  checking = true
  try {
    const [response, current] = await Promise.all([
      request({ url: '/api/version', method: 'GET', silent: true }),
      installedVersion()
    ])
    const { version, url } = parseVersionResponse(response)
    const comparison = compareVersions(version, current)
    if (comparison === null) throw new Error('Invalid version')
    if (comparison <= 0) {
      if (manual) uni.showToast({ title: '已是最新版本', icon: 'none' })
      return
    }
    if (!manual && uni.getStorageSync(SKIPPED_APP_VERSION_KEY) === version) return
    const download = appDownloadUrl(baseUrl, url)
    const isIOS = String(uni.getSystemInfoSync().platform || '').toLowerCase() === 'ios'
    const canDownload = !isIOS && !!download
    uni.showActionSheet({
      title: canDownload ? `发现新版本 ${version}` : `发现新版本 ${version}，暂无适用的安装包`,
      itemList: canDownload ? ['立即更新', '跳过此版本'] : ['跳过此版本'],
      success: ({ tapIndex }) => {
        if (canDownload && tapIndex === 0) {
          plus.runtime.openURL(download)
        } else {
          uni.setStorageSync(SKIPPED_APP_VERSION_KEY, version)
        }
      }
    })
  } catch (error) {
    console.warn('App update check failed', error)
    if (manual) uni.showToast({ title: '检查失败，请稍后重试', icon: 'none' })
  } finally {
    checking = false
  }
}
