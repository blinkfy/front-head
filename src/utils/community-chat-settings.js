import { reactive } from 'vue'
import request from '@/api/index.js'

// Only public entry visibility lives here. This never terminates an admitted
// call/share, rejects an invitation, or changes device capabilities.
export const communityChatSettings = reactive({ enabled: false, known: false })
let pending = null, until = 0, revision = 0, updatedAt = 0

export function applyCommunityChatSettings(settings) {
  if (typeof settings?.communityChatEnabled !== 'boolean') return
  const timestamp = Date.parse(settings.settingsUpdatedAt || settings.updatedAt || '') || 0
  if (updatedAt && (!timestamp || timestamp < updatedAt)) return
  updatedAt = Math.max(updatedAt, timestamp)
  revision++
  communityChatSettings.enabled = settings.communityChatEnabled
  communityChatSettings.known = true
  until = Date.now() + 5000
}

export function connectCommunityChatSettings(settings) {
  // A reconnect establishes a new server epoch. Old deployments do not send a
  // settings revision, so permit their explicit HTTP fallback again, without
  // allowing a request from the previous connection to overwrite the result.
  revision++
  pending = null
  until = 0
  if (!settings?.settingsUpdatedAt) updatedAt = 0
  applyCommunityChatSettings(settings)
  if (typeof settings?.communityChatEnabled !== 'boolean') void readCommunityChatEnabled(true)
}

export function readCommunityChatEnabled(force = false) {
  if (pending) return pending
  if (!force && Date.now() < until) return Promise.resolve(communityChatSettings.enabled)
  const version = revision
  until = Date.now() + 5000
  const work = request({ url: '/api/ai/settings', method: 'GET', silent: true }).then(result => {
    // A newer socket event wins over an HTTP response already in flight.
    if (version === revision && result?.code === 0 && result.data) applyCommunityChatSettings({
      ...result.data, communityChatEnabled: result.data.communityChatEnabled !== false
    })
    return communityChatSettings.enabled
  }).catch(() => communityChatSettings.enabled).finally(() => { if (pending === work) pending = null })
  pending = work
  return work
}
