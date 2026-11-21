import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const { preprocess } = createRequire(import.meta.url)('@dcloudio/uni-cli-shared/lib/preprocess')
import { parse as parseJson } from 'jsonc-parser'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createForegroundNotifications, notificationAvatarUrl } from '../../src/utils/foreground-notification.mjs'
import { rememberChatEntryAvatar, readChatEntryAvatar } from '../../src/utils/chat-entry-avatar.mjs'
import { notificationPagePaths, injectForegroundNotification } from '../build/foreground-notification-plugin.mjs'

let owner = 'account-a', clock = 1000, sequence = 0, tapped = 0
const timers = new Map(), updates = []
const notices = createForegroundNotifications({ getOwner: () => owner, now: () => clock,
  setTimer: (fn, duration) => { timers.set(++sequence, { fn, duration }); return sequence }, clearTimer: id => timers.delete(id) })
const unsubscribe = notices.subscribe(value => updates.push(value))
const first = notices.show({ title: '小明', content: '第一条', duration: 1234, onTap: () => tapped++ })
assert.equal(timers.get(sequence).duration, 1234)
const oldExpiry = timers.get(sequence).fn
const second = notices.show({ title: '群聊', content: '小红：[图片]', avatar: 'https://cdn.test/avatar.png', onTap: () => tapped++ })
assert.equal(timers.size, 1, 'rapid messages replace the previous timer instead of building a queue')
oldExpiry()
assert.equal(notices.snapshot().id, second, 'an old timeout cannot dismiss the replacement')
notices.tap(first)
assert.equal(tapped, 0, 'a stale rendered banner cannot open a newer conversation')
assert.equal(notices.snapshot().avatar, 'https://cdn.test/avatar.png')
assert.equal('onTap' in notices.snapshot(), false, 'callbacks are not serialized into mini-program view data')
assert.equal('owner' in notices.snapshot(), false, 'account tokens are not serialized into view data')
notices.tap(second); notices.tap(second)
assert.equal(tapped, 1)
assert.equal(notices.snapshot(), null)
const stale = notices.show({ title: '旧账号', onTap: () => tapped++ })
owner = 'account-b'
notices.tap(stale)
assert.equal(tapped, 1, 'switching accounts invalidates old notification actions')
assert.equal(updates.at(-1), null)
notices.show({ title: '恢复前台' }); clock += 10001; notices.refresh()
assert.equal(updates.at(-1), null, 'expired banners do not reappear when timers were suspended')
notices.show({ title: '后台清理' }); notices.clear()
assert.equal(timers.size, 0)
assert.equal(updates.at(-1), null)
unsubscribe()

for (const empty of ['', null, '/static/person.webp.png', 'https://cdn.test/default-avatar.png', 'https://ui-avatars.com/api/?name=A', 'javascript:alert(1)']) {
  assert.equal(notificationAvatarUrl(empty, 'https://api.test'), '')
}
assert.equal(notificationAvatarUrl('/static/avatars/a.webp', 'https://api.test/'), 'https://api.test/static/avatars/a.webp')
assert.equal(notificationAvatarUrl('chat/groups/avatars/a.webp', 'https://api.test'), 'https://api.test/files/download/chat/groups/avatars/a.webp')
assert.equal(notificationAvatarUrl('https://cdn.test/a.webp'), 'https://cdn.test/a.webp')

const source = fs.readFileSync(new URL('../../src/utils/notification.js', import.meta.url), 'utf8')
const feedback = [], navigation = []
const context = { foregroundNotifications: notices, notificationAvatarUrl, rememberChatEntryAvatar, baseUrl: 'https://api.test',
  receiveChatFeedback: async options => feedback.push(options),
  uni: { getStorageSync: () => owner, navigateTo: options => navigation.push(options.url) } }
vm.createContext(context)
vm.runInContext(source.replace(/^import .*$/gm, '').replace(/^export default[\s\S]*$/m, '').replace(/^export /gm, '') +
  '\nglobalThis.api = { notifyNewMessage }', context)
await context.api.notifyNewMessage({ senderName: '测试群', senderLabel: '小明', senderAvatar: '/static/avatars/a.webp', type: 'image', groupId: '2' })
assert.equal(notices.snapshot().title, '测试群')
assert.equal(notices.snapshot().content, '小明：[图片]')
assert.equal(notices.snapshot().avatar, 'https://api.test/static/avatars/a.webp')
notices.tap(notices.snapshot().id)
assert.match(navigation.at(-1), /groupId=2/)
const realAvatar = 'data:image/webp;base64,aGVsbG8='
await context.api.notifyNewMessage({ senderName: '联系人', senderAvatar: realAvatar, content: '从提示进入', otherId: 42 })
notices.tap(notices.snapshot().id)
assert.deepEqual(readChatEntryAvatar(owner, 42), { avatar: realAvatar }, 'direct notification hands its avatar to the chat entry')
assert.doesNotMatch(navigation.at(-1), /avatar=|base64/, 'image bytes never expand the route URL')
assert.equal(readChatEntryAvatar('another-account', 42), null, 'account changes discard old entry avatars')
await context.api.notifyNewMessage({ content: '当前会话' }, { showNotification: false, quiet: true, vibrate: false })
assert.equal(notices.snapshot(), null, 'the currently open conversation does not show a banner')
assert.equal(feedback.at(-1).quiet, true)
assert.equal(feedback.at(-1).vibrate, false)

const config = parseJson(fs.readFileSync(new URL('../../src/pages.json', import.meta.url), 'utf8'))
const pages = notificationPagePaths(config)
assert.ok(pages.has('pages/home/home') && pages.has('pages-nonTheme/chat'))
for (const name of pages.keys()) {
  const path = new URL(`../../src/${name}.vue`, import.meta.url)
  const original = fs.readFileSync(path, 'utf8')
  const injected = injectForegroundNotification(original, name, pages)
  const { descriptor, errors } = parse(injected)
  assert.deepEqual(errors, [], name)
  assert.equal((descriptor.template.content.match(/<ftx-notification-banner /g) || []).length, 1, name)
  assert.equal(injectForegroundNotification(injected, name, pages), null, 'injection is idempotent')
}
assert.equal(injectForegroundNotification('<template><view /></template>', 'components/Any', pages), null)
const banner = fs.readFileSync(new URL('../../src/components/ForegroundNotificationBanner.vue', import.meta.url), 'utf8')
const { descriptor } = parse(banner)
compileScript(descriptor, { id: 'foreground-banner' })
assert.deepEqual(compileTemplate({ filename: 'ForegroundNotificationBanner.vue', id: 'foreground-banner', source: descriptor.template.content }).errors, [])
assert.doesNotMatch(banner, /from ['"][^'"]*pages-nonTheme/, 'the main-package host never imports subpackage avatar components')
for (const file of ['components/ForegroundNotificationBanner.vue', 'pages-nonTheme/components/ChatCachedImage.vue']) {
  const code = fs.readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8')
  const { descriptor: component } = parse(code)
  for (const flags of [{ APP_PLUS: true }, { H5: true }, { MP_WEIXIN: true }]) {
    const script = preprocess(component.scriptSetup.content, flags, { type: 'js' })
    compileScript({ ...component, scriptSetup: { ...component.scriptSetup, content: script } }, { id: file })
    const result = compileTemplate({ filename: file, id: file, source: preprocess(component.template.content, flags, { type: 'html' }) })
    assert.deepEqual(result.errors, [], `${file} compiles with ${JSON.stringify(flags)}`)
  }
}

// Exercise the actual page host: App avatars resolve to the shared persistent cache.
function bannerFixture(platform) {
  let account = 'account-a', listener, unmount, pending = new Map()
  const reads = [], invalidated = []
  const state = { ref: value => ({ value }), defineProps: () => ({ pagePath: '', nativeNavigation: false }),
    onMounted: fn => fn(), onBeforeUnmount: fn => { unmount = fn },
    ThemeManager: { getTheme: () => 'light' },
    foregroundNotifications: { subscribe: fn => { listener = fn; return () => {} }, snapshot: () => state.host.notice.value },
    getCachedChatAvatar: (owner, url) => url === 'https://cdn.test/hit.webp' ? '/saved/avatar.webp' : '',
    loadChatAvatar: (owner, url) => { reads.push([owner, url]); return new Promise(resolve => pending.set(url, resolve)) },
    forgetMissingChatAvatar: (...args) => invalidated.push(args),
    uni: { getStorageSync: key => key === 'token' ? account : { id: 7 }, getSystemInfoSync: () => ({ statusBarHeight: 24 }) } }
  const compiled = preprocess(descriptor.scriptSetup.content.replace(/^import .*$/gm, ''), platform === 'app' ? { APP_PLUS: true } : { H5: true }, { type: 'js' })
  vm.runInNewContext(compiled + '\nglobalThis.host = { notice, avatarSrc, avatarFailed, failAvatar }', state)
  return { state, reads, invalidated, emit: value => listener(value), resolve: (url, path) => pending.get(url)(path),
    switchAccount: () => { account = 'account-b' }, dispose: () => unmount() }
}
const appBanner = bannerFixture('app')
appBanner.emit({ id: 1, avatar: 'https://cdn.test/hit.webp' })
assert.equal(appBanner.state.host.avatarSrc.value, '/saved/avatar.webp')
assert.equal(appBanner.reads.length, 0, 'warm notification avatars need no network request')
appBanner.emit({ id: 2, avatar: 'data:image/webp;base64,AAAA' })
appBanner.resolve('data:image/webp;base64,AAAA', '/saved/inline.png')
await new Promise(resolve => setImmediate(resolve))
assert.equal(appBanner.state.host.avatarSrc.value, '/saved/inline.png', 'App Base64 avatars display through local files')
appBanner.state.host.failAvatar({ currentTarget: { dataset: { noticeId: 2 } } })
assert.equal(appBanner.invalidated.length, 1, 'a missing local file is invalidated before retry')
appBanner.emit({ id: 3, avatar: 'https://cdn.test/new.webp' })
appBanner.resolve('data:image/webp;base64,AAAA', '/saved/stale.png')
await new Promise(resolve => setImmediate(resolve))
assert.notEqual(appBanner.state.host.avatarSrc.value, '/saved/stale.png', 'an old avatar cannot replace a newer banner')
appBanner.switchAccount(); appBanner.resolve('https://cdn.test/new.webp', '/saved/other-account.png')
await new Promise(resolve => setImmediate(resolve))
assert.notEqual(appBanner.state.host.avatarSrc.value, '/saved/other-account.png', 'changing accounts cancels the pending avatar display')
appBanner.dispose()
const webBanner = bannerFixture('web')
webBanner.emit({ id: 1, avatar: 'https://cdn.test/web.webp' })
assert.equal(webBanner.state.host.avatarSrc.value, 'https://cdn.test/web.webp')
assert.equal(webBanner.reads.length, 0, 'web rendering retains its existing image behavior')
webBanner.dispose()
console.log(`PASS foreground banners, persistent App avatars, stale/account safety and hosts on ${pages.size} registered pages`)
