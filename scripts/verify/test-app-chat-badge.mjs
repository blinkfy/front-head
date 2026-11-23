import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const file = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')
const source = file('src/utils/realtime/app-chat-badge.js').replace(/^import .*$/gm, '').replace(/export function/g, 'function')
const directShare = file('src/utils/realtime/app-direct-share.js').replace(/^import .*$/gm, '').replace(/export function/g, 'function')
let account = { token: 'one', userInfo: { id: 1 } }
const updates = []
const shortcuts = []
const context = { plus: { os: { name: 'Android' } }, uni: { getStorageSync: key => account[key] },
  updateChatBadge: value => updates.push(JSON.parse(value)),
  syncShareTargets: (owner, value) => shortcuts.push([owner, value && JSON.parse(value)]), Date }
vm.createContext(context)
vm.runInContext(`${directShare}\n${source}\nglobalThis.badge = { syncChatBadgeAccount, clearChatBadge, beginChatBadgeSnapshot, finishChatBadgeSnapshot }`, context)
const badge = context.badge
badge.syncChatBadgeAccount()
assert.deepEqual(updates.pop(), { owner: '1' })
const start = badge.beginChatBadgeSnapshot()
badge.finishChatBadgeSnapshot(start, { code: 0, data: { badgeUnreadCounts: { '2': { count: 3, through: '20' } } } }, {})
assert.equal(updates[0].counts['2'].count, 3)
assert.equal('token' in updates[0], false, 'native state never receives/stores the JWT')
updates.length = 0
badge.finishChatBadgeSnapshot(start, { code: 0, data: {} }, {})
badge.finishChatBadgeSnapshot(start, { code: 0, data: { badgeUnreadCounts: {} } }, { keyword: 'name' })
assert.equal(updates.length, 0, 'older backends and searches cannot clear global unread')
const ago = seconds => new Date(Date.now() - seconds * 1000).toISOString()
const rows = [
  { otherId: '2', nickname: '联系人', latestContent: { sendTime: ago(15) } },
  { groupId: '6', conversationType: 'group', username: '群聊', latestContent: { sendTime: ago(10) } },
  { otherId: '3', nickname: '旧会话', latestContent: { sendTime: ago(31 * 24 * 60 * 60) } }
]
badge.finishChatBadgeSnapshot(start, { code: 0, data: { list: rows } }, { page: 1 })
assert.deepEqual(shortcuts.at(-1), ['1', [{ kind: 'group', id: '6', label: '群聊' }, { kind: 'direct', id: '2', label: '联系人' }]])
const previousPublished = shortcuts.length
account = { token: 'two', userInfo: { id: 2 } }
badge.finishChatBadgeSnapshot(start, { code: 0, data: { badgeUnreadCounts: {}, list: rows } }, {})
assert.equal(updates.length, 0, 'late account-one HTTP response cannot change account two')
assert.equal(shortcuts.length, previousPublished, 'late responses cannot republish the previous account')
badge.clearChatBadge()
assert.deepEqual(shortcuts.at(-1), ['', ''], 'logout clears system share recommendations')
assert.deepEqual(updates.pop(), { owner: '', operation: 'clear' })
const native = file('src/uni_modules/ftx-voice-call/utssdk/app-android/RealtimeBridge.kt')
assert.ok(native.includes('AppChatBadge.event(it, selfId, event)'), 'native sees events before app background delivery may be dropped')
assert.ok(file('src/uni_modules/ftx-voice-call/utssdk/app-android/AndroidManifest.xml').includes('com.huawei.android.launcher.permission.CHANGE_BADGE'))
assert.ok(file('src/utils/realtime/chat-push.js').includes('clearChatBadge()'))
assert.ok(file('src/pages-nonTheme/api/chat.js').includes('finishChatBadgeSnapshot(badgeSnapshot, result, params)'))
console.log('PASS app badge adapter: account isolation, existing-response reuse, search/old-backend safety and logout wiring')
