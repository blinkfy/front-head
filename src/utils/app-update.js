import { baseUrl } from '@/api/settings'
import { appVersionGuard } from './app-version-guard.js'
import { appDownloadUrl, compareVersions, SKIPPED_APP_VERSION_KEY } from './app-update-core.mjs'

let checking = false

export async function checkAppUpdate({ manual = false } = {}) {
  if (checking) return
  checking = true
  try {
    const guard = appVersionGuard()
    const policy = await guard.refresh({ force: manual })
    if (guard.getState().blocked) {
      guard.handleUpgrade(guard.getState().blocked, { prompt: false })
      return
    }
    if (!await guard.ensure({ page: getCurrentPages().slice(-1)[0]?.route })) return
    const { version: current } = guard.getState()
    const version = policy.versionName
    const comparison = compareVersions(version, current)
    if (comparison === null) throw new Error('Invalid version')
    if (comparison <= 0) {
      if (manual) uni.showToast({ title: '已是最新版本', icon: 'none' })
      return
    }
    if (!manual && uni.getStorageSync(SKIPPED_APP_VERSION_KEY) === version) return
    const target = policy.downloads?.[String(uni.getSystemInfoSync().platform || '').toLowerCase()] ?? policy.url
    const download = target ? appDownloadUrl(baseUrl, target) : ''
    uni.showActionSheet({
      title: download ? `发现新版本 ${version}` : `发现新版本 ${version}，暂无适用的安装包`,
      itemList: download ? ['立即更新', '跳过此版本'] : ['跳过此版本'],
      success: ({ tapIndex }) => {
        if (download && tapIndex === 0) plus.runtime.openURL(download)
        else uni.setStorageSync(SKIPPED_APP_VERSION_KEY, version)
      }
    })
  } catch (error) {
    console.warn('App update check failed', error)
    if (manual) uni.showToast({ title: '检查失败，请稍后重试', icon: 'none' })
  } finally {
    checking = false
  }
}
