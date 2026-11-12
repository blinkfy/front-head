import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
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
assert.match(source, /v-if="isAndroid"[^>]*@click="setupCallPermissions"/)
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
function permissionPage(initialStatus = 'channel_low', overlayAllowed = false, popupStatus = 'not_required') {
  const shown = [], hidden = [], disposed = [], opened = [], toasts = []
  const page = {}
  let status = initialStatus, overlay = overlayAllowed, popup = popupStatus, owner = 'permission-account'
  let grantNotification = async () => { status = 'channel_low'; return true }
  const context = vm.createContext({
    ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }),
    onShow: callback => shown.push(callback), onHide: callback => hidden.push(callback),
    onMounted() {}, onUnmounted: callback => disposed.push(callback),
    getCurrentPages: () => [page], ThemeManager: { getTheme: () => 'light' },
    areUiSoundsEnabled: () => true, canConfigureBackgroundMessages: () => false,
    readBackgroundMessagesEnabled: () => true, communitySocialEnabled: async () => true,
    androidIncomingCallPresentation: () => status, androidUnlockedIncomingCallAllowed: () => overlay,
    androidBackgroundPopupPermission: () => popup,
    openAndroidBackgroundPopupSettings: () => { opened.push('background_popup'); return true },
    openAndroidIncomingCallSettings: () => { opened.push(status); return true },
    openAndroidUnlockedIncomingCallSettings: () => { opened.push('overlay'); return true },
    ensureFeaturePermission: async () => grantNotification(), syncChatPush() {}, syncAndroidMessagingPreference() {},
    uni: { $on() {}, $off() {}, getStorageSync: () => owner, showToast: value => toasts.push(value.title),
      showModal: value => value.success({ confirm: true }) }
  })
  const script = preprocess(descriptor.scriptSetup.content, { APP_PLUS: true }, 'js')
    .replace(/^import\s[\s\S]*?\sfrom\s+['"][^'"]+['"]\s*$/gm, '')
  const api = vm.runInContext(`${script}\n;({ start: setupCallPermissions, get pending() { return permissionSetupPending.value }, get description() { return permissionSetupDescription.value } })`, context)
  return {
    api, opened, toasts,
    status(value) { status = value }, overlay(value) { overlay = value }, popup(value) { popup = value }, owner(value) { owner = value },
    request(value) { grantNotification = value },
    hide() { hidden.forEach(callback => callback()) },
    async show() { for (const callback of shown) await callback(); await Promise.resolve() },
    dispose() { disposed.forEach(callback => callback()) }
  }
}

const guided = permissionPage('notifications_disabled')
await guided.api.start()
assert.deepEqual(guided.opened, ['channel_low'])
guided.hide(); guided.status('full_screen_denied'); await guided.show()
assert.deepEqual(guided.opened, ['channel_low', 'full_screen_denied'])
guided.hide(); guided.status('ready'); await guided.show()
assert.equal(guided.opened.at(-1), 'overlay')
guided.hide(); guided.overlay(true); await guided.show()
assert.equal(guided.api.pending, false)

const declined = permissionPage()
await declined.api.start()
declined.hide(); await declined.show(); await declined.show()
assert.deepEqual(declined.opened, ['channel_low'], 'declining a settings permission does not reopen it')
assert.equal(declined.api.pending, false)

const notificationDenied = permissionPage('notifications_disabled')
let notificationRequests = 0
notificationDenied.request(async () => { notificationRequests++; return false })
await notificationDenied.api.start()
await notificationDenied.show()
assert.equal(notificationRequests, 1, 'denying the runtime permission does not cause repeated prompts')
assert.equal(notificationDenied.api.pending, false)

const notificationSettings = permissionPage('notifications_disabled')
notificationSettings.request(async () => false)
await notificationSettings.api.start()
notificationSettings.hide(); notificationSettings.status('ready'); await notificationSettings.show()
assert.deepEqual(notificationSettings.opened, ['overlay'], 'granting notifications in system settings resumes the next step')

const interrupted = permissionPage()
await interrupted.api.start()
interrupted.hide(); interrupted.owner('another-account'); interrupted.status('ready'); await interrupted.show()
assert.deepEqual(interrupted.opened, ['channel_low'], 'an account change cancels the next permission step')
assert.equal(interrupted.api.pending, false)

const closed = permissionPage()
await closed.api.start()
closed.hide(); closed.dispose(); closed.status('ready'); await closed.show()
assert.deepEqual(closed.opened, ['channel_low'], 'leaving the settings page cancels permission continuation')

const quiet = permissionPage('dnd', true)
await quiet.api.start()
assert.deepEqual(quiet.opened, [], 'do-not-disturb does not open sound settings during permission setup')
assert.match(quiet.toasts.at(-1), /勿扰/)

// A granted overlay must not hide a denied or unreadable Huawei background-popup permission.
const popupDenied = permissionPage('ready', true, 'denied')
await popupDenied.api.start()
assert.deepEqual(popupDenied.opened, ['background_popup'])
assert.match(popupDenied.api.description, /引导/)
popupDenied.hide(); await popupDenied.show(); await popupDenied.show()
assert.equal(popupDenied.api.pending, false)
assert.deepEqual(popupDenied.opened, ['background_popup'], 'denial does not cause repeated settings launches')
assert.match(popupDenied.api.description, /后台弹窗未开启/)
assert.match(popupDenied.toasts.at(-1), /仍未开启/)
assert.doesNotMatch(popupDenied.toasts.at(-1), /已完成|已授权/)

const popupGranted = permissionPage('ready', true, 'denied')
await popupGranted.api.start()
popupGranted.hide(); popupGranted.popup('allowed'); await popupGranted.show()
assert.equal(popupGranted.api.pending, false)
assert.match(popupGranted.toasts.at(-1), /已完成/)
assert.match(popupGranted.api.description, /已授权/)

const popupUnknown = permissionPage('ready', true, 'unknown')
await popupUnknown.api.start()
assert.deepEqual(popupUnknown.opened, ['background_popup'])
popupUnknown.hide(); await popupUnknown.show()
assert.match(popupUnknown.api.description, /后台弹窗待确认/)
assert.match(popupUnknown.toasts.at(-1), /需在系统设置中确认/)
assert.doesNotMatch(popupUnknown.api.description, /已授权/)

const popupAfterOverlay = permissionPage('ready', false, 'denied')
await popupAfterOverlay.api.start()
assert.deepEqual(popupAfterOverlay.opened, ['overlay'])
popupAfterOverlay.hide(); popupAfterOverlay.overlay(true); await popupAfterOverlay.show()
assert.deepEqual(popupAfterOverlay.opened, ['overlay', 'background_popup'])

console.log('PASS background preferences, settings compilation and guided call permissions including denial, account switching and DND')
