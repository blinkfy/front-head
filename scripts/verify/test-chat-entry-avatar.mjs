import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { parse, compileScript } from '@vue/compiler-sfc'
import { rememberChatEntryAvatar, readChatEntryAvatar } from '../../src/utils/realtime/chat-entry-avatar.mjs'
const { preprocess } = createRequire(import.meta.url)('@dcloudio/uni-cli-shared/lib/preprocess')
const source = fs.readFileSync(new URL('../../src/pages-nonTheme/chat.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const avatar = 'data:image/webp;base64,aGVsbG8='
let scenario = 0
for (const flags of [{ APP_PLUS: true }, { H5: true }, { MP_WEIXIN: true }]) {
  const script = preprocess(descriptor.script.content, flags, { type: 'js' })
  compileScript({ ...descriptor, script: { ...descriptor.script, content: script } }, { id: 'chat-entry' })
  const start = script.indexOf('    onLoad(options) {')
  const end = script.indexOf('    onShow() {', start)
  assert.ok(start >= 0 && end > start)
  const account = `session-${++scenario}`, peerId = '42'
  let cachedList
  const context = { readChatEntryAvatar, console: { log() {} }, miniCallChatReturnMode: () => false,
    getCurrentPages: () => [], realtimeRouteName: decodeURIComponent,
    uni: { getStorageSync: key => key === 'token' ? account : cachedList } }
  vm.runInNewContext('globalThis.load = ({' + script.slice(start, end) + '}).onLoad', context)
  const fixture = () => {
    const page = { conversationType: 'direct', otherAvatar: '', otherUserId: '', chatId: '', getCurrentUserId: () => 7,
      checkTheme() {}, initSystemInfo() {}, initRecorder() {}, initAudioPlayer() {}, loadUserInfo() {},
      restoreChatDraft() {}, initializeMessages() {}, loadLocalFileCache() {}, loadContactSettings() {}, loadGroupDetail() {} }
    Object.defineProperty(page, 'isGroupChat', { get: () => page.conversationType === 'group' })
    return page
  }
  rememberChatEntryAvatar(account, peerId, avatar)
  let page = fixture()
  context.load.call(page, { chatId: peerId, userId: peerId, title: '测试联系人' })
  assert.equal(page.otherAvatar, avatar, 'notification entry restores the real avatar on every platform')
  page = fixture()
  context.load.call(page, { chatId: peerId, userId: peerId, avatar: '' })
  assert.equal(page.otherAvatar, '', 'an explicit removed avatar overrides the old navigation hint')
  page = fixture()
  context.load.call(page, { chatId: 'group:42', conversationType: 'group', groupId: peerId })
  assert.equal(page.otherAvatar, '', 'group entry never uses a direct sender avatar as the group picture')
  readChatEntryAvatar('another-session', peerId)
  cachedList = JSON.stringify({ userList: [{ otherId: peerId, avatar: 'https://cdn.test/cached.webp' }] })
  page = fixture()
  context.load.call(page, { chatId: peerId, userId: peerId })
  assert.equal(page.otherAvatar, 'https://cdn.test/cached.webp', 'legacy notification entry reuses the account chat-list cache')
}
assert.equal(readChatEntryAvatar('', 42, { userList: [{ otherId: 42, avatar }] }), null)
assert.equal(readChatEntryAvatar('session-safe', 42, '{invalid-json'), null)
console.log('PASS notification-to-chat avatar handoff, account/cache isolation, explicit removal, group safety and three-platform chat compilation')
