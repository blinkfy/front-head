import { baseUrl } from '@/api/settings'
import { createTimedResource } from './timed-resource.mjs'

const settings = createTimedResource(30_000)
let serverRevision = 0

export const getCachedAppHomeAiEnabled = () => settings.peek()?.aiEnabled

export function invalidateAppHomeAiSettings(updatedAt) {
  if (updatedAt) {
    const revision = Date.parse(updatedAt)
    if (!(revision > serverRevision)) return
    serverRevision = revision
    const cached = settings.peek()
    if (!cached || Date.parse(cached.settingsUpdatedAt) >= revision) return
  }
  settings.invalidate()
}

export function readAppHomeAiSettings() {
  return settings.read(() => new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}/api/ai/settings`,
      timeout: 10_000,
      success(response) {
        const payload = response?.data
        if (response.statusCode === 200 && payload?.code === 0 && typeof payload.data?.aiEnabled === 'boolean') {
          const revision = Date.parse(payload.data.settingsUpdatedAt)
          if (revision && revision < serverRevision) {
            reject(new Error('AI 设置尚未同步'))
            return
          }
          serverRevision = Math.max(serverRevision, revision || 0)
          resolve({ aiEnabled: payload.data.aiEnabled, settingsUpdatedAt: payload.data.settingsUpdatedAt })
        } else {
          reject(new Error(payload?.msg || 'AI 设置暂不可用'))
        }
      },
      fail: reject
    })
  }))
}
