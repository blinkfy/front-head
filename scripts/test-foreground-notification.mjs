import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse as parseJson } from 'jsonc-parser'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createForegroundNotifications, notificationAvatarUrl } from '../src/utils/foreground-notification.mjs'
import { notificationPagePaths, injectForegroundNotification } from './foreground-notification-plugin.mjs'

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

const source = fs.readFileSync(new URL('../src/utils/notification.js', import.meta.url), 'utf8')
const feedback = [], navigation = []
const context = { foregroundNotifications: notices, notificationAvatarUrl, baseUrl: 'https://api.test',
  receiveChatFeedback: async options => feedback.push(options),
  uni: { navigateTo: options => navigation.push(options.url) } }
vm.createContext(context)
vm.runInContext(source.replace(/^import .*$/gm, '').replace(/^export default[\s\S]*$/m, '').replace(/^export /gm, '') +
  '\nglobalThis.api = { notifyNewMessage }', context)
await context.api.notifyNewMessage({ senderName: '测试群', senderLabel: '小明', senderAvatar: '/static/avatars/a.webp', type: 'image', groupId: '2' })
assert.equal(notices.snapshot().title, '测试群')
assert.equal(notices.snapshot().content, '小明：[图片]')
assert.equal(notices.snapshot().avatar, 'https://api.test/static/avatars/a.webp')
notices.tap(notices.snapshot().id)
assert.match(navigation.at(-1), /groupId=2/)
await context.api.notifyNewMessage({ content: '当前会话' }, { showNotification: false, quiet: true, vibrate: false })
assert.equal(notices.snapshot(), null, 'the currently open conversation does not show a banner')
assert.equal(feedback.at(-1).quiet, true)
assert.equal(feedback.at(-1).vibrate, false)

const config = parseJson(fs.readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'))
const pages = notificationPagePaths(config)
assert.ok(pages.has('pages/home/home') && pages.has('pages-nonTheme/chat'))
for (const name of pages.keys()) {
  const path = new URL(`../src/${name}.vue`, import.meta.url)
  const original = fs.readFileSync(path, 'utf8')
  const injected = injectForegroundNotification(original, name, pages)
  const { descriptor, errors } = parse(injected)
  assert.deepEqual(errors, [], name)
  assert.equal((descriptor.template.content.match(/<ftx-notification-banner /g) || []).length, 1, name)
  assert.equal(injectForegroundNotification(injected, name, pages), null, 'injection is idempotent')
}
assert.equal(injectForegroundNotification('<template><view /></template>', 'components/Any', pages), null)
const banner = fs.readFileSync(new URL('../src/components/ForegroundNotificationBanner.vue', import.meta.url), 'utf8')
const { descriptor } = parse(banner)
compileScript(descriptor, { id: 'foreground-banner' })
assert.deepEqual(compileTemplate({ filename: 'ForegroundNotificationBanner.vue', id: 'foreground-banner', source: descriptor.template.content }).errors, [])
assert.doesNotMatch(banner, /from ['"][^'"]*pages-nonTheme/, 'the main-package host never imports subpackage avatar components')
console.log(`PASS foreground banners, avatars, group previews, account/timer safety and hosts on ${pages.size} registered pages`)
