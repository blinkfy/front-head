import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { BACKGROUND_MESSAGES_KEY, canConfigureBackgroundMessages, readBackgroundMessagesEnabled, writeBackgroundMessagesEnabled } from '../src/utils/background-message-preference.mjs'

const values = new Map(), events = []
globalThis.uni = { getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, value), $emit: (...args) => events.push(args) }
values.set('token', 'test-session')
values.set('userInfo', { id: 1, isAdmin: true })
assert.equal(canConfigureBackgroundMessages(), true)
assert.equal(readBackgroundMessagesEnabled(), true)
assert.equal(writeBackgroundMessagesEnabled(false), false)
assert.equal(readBackgroundMessagesEnabled(), false)
values.set('userInfo', { id: 2, isAdmin: false })
values.set('isAdmin', true)
assert.equal(canConfigureBackgroundMessages(), false, 'ordinary profile overrides a stale administrator flag')
assert.equal(readBackgroundMessagesEnabled(), true, 'administrator disable does not disable ordinary accounts')
assert.equal(writeBackgroundMessagesEnabled(false), true, 'ordinary accounts cannot disable reception')
assert.equal(values.get(BACKGROUND_MESSAGES_KEY), false, 'ordinary accounts do not overwrite the administrator preference')
assert.deepEqual(events.at(-1), ['chat:background-messages-changed', true])
values.set('userInfo', JSON.stringify({ id: 1, isAdmin: true }))
assert.equal(readBackgroundMessagesEnabled(), false, 'switching back restores administrator choice')
values.delete('token')
assert.equal(canConfigureBackgroundMessages(), false)
assert.equal(readBackgroundMessagesEnabled(), true)

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const source = readFileSync(new URL('../src/pages-nonTheme/settings.vue', import.meta.url), 'utf8')
assert.match(source, /v-if="isAndroid"[^>]*@click="retryNotificationPermission"/)
assert.match(source, /async function requestNotifications\(\)/)
assert.match(source, /ensureFeaturePermission\('notification', \{ isCurrent \}\)/,
  'notification retry uses the shared interactive permission check')
assert.match(source, /async function toggleBackgroundMessages\(\)\s*\{\s*if \(!canConfigureBackgroundMessages\(\) \|\| notificationPermissionPending\.value\) return/)
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
for (const platform of ['H5', 'APP_PLUS', 'MP_WEIXIN']) {
  const flags = { H5: platform === 'H5', APP_PLUS: platform === 'APP_PLUS', MP_WEIXIN: platform === 'MP_WEIXIN' }
  compileScript({ ...descriptor, scriptSetup: { ...descriptor.scriptSetup, content: preprocess(descriptor.scriptSetup.content, flags, 'js') } }, { id: platform })
  assert.deepEqual(compileTemplate({ source: preprocess(descriptor.template.content, flags, 'html'), filename: 'settings.vue', id: platform }).errors, [])
}
console.log('PASS administrator switch, ordinary-account forced enable, account switching, and settings platform compilation')
