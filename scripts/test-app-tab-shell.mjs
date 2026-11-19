import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { initPreContext, preHtml, preJs } from '@dcloudio/uni-cli-shared/dist/preprocess/index.js'
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const strip = code => code.replace(/^import .*$/gm, '').replace(/^export /gm, '')
const routeContext = vm.createContext({ getCurrentInstance: () => null, Symbol })
vm.runInContext(strip(read('src/utils/app-tab-context.js')), routeContext)
const { parseAppTabUrl } = routeContext
assert.equal(parseAppTabUrl('/pages/map/map?mode=select'), null)
assert.equal(parseAppTabUrl('/pages-dark/map/map?mode=view'), null)
assert.equal(parseAppTabUrl('/pages/shop/shop?from=home').tab, 'shop')

const shellSource = read('src/pages/app-tabs/index.vue')
const shellCode = strip(parse(shellSource).descriptor.scriptSetup.content)
function harness() {
  const hooks = {}, calls = [], timers = new Map(), queries = [], page = { route: 'pages/app-tabs/index' }
  let timerId = 0, shell, pendingTask = false, allowed = true
  const context = vm.createContext({
    ref: value => ({ value }), shallowReactive: value => value, markRaw: value => value, nextTick: async () => {},
    ...Object.fromEntries(['Home', 'MapPage', 'Shop', 'Profile', 'DarkHome', 'DarkMap', 'DarkShop', 'DarkProfile'].map(name => [name, { name }])),
    ...Object.fromEntries(['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload', 'onResize', 'onBackPress', 'onBeforeUnmount'].map(name => [name, fn => { hooks[name] = fn }])),
    registerAppTabShell: value => { shell = value; return () => { shell = null } }, parseAppTabUrl,
    emitAppTabHook: (ctx, name) => { if (ctx) calls.push([ctx.logicalPage.route, name]) },
    getRecognitionTask: () => pendingTask ? { status: 'pending' } : null,
    appVersionGuard: () => ({ ensure: async ({ useCached }) => { assert.equal(useCached, true); return allowed }, allowsPage: () => allowed }),
    getCurrentPages: () => [page],
    uni: { getStorageSync: () => 'light', onMemoryWarning() {}, offMemoryWarning() {},
      createSelectorQuery: () => ({ in() { return this }, select() { return this }, boundingClientRect() { return this }, exec(fn) { queries.push(fn) } }) },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId }, clearTimeout: id => timers.delete(id)
  })
  vm.runInContext(shellCode, context)
  const run = code => vm.runInContext(code, context)
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const ready = async () => { run('paneReady(current().context)'); await flush(); while (queries.length) queries.shift()(); await flush() }
  return { context, hooks, calls, timers, queries, run, ready, flush,
    task(value) { pendingTask = value }, allow(value) { allowed = value },
    get shell() { return shell },
    async open(url='/pages/home/home') { hooks.onLoad({ target: encodeURIComponent(url) }); hooks.onShow(); await ready() },
    async go(tab, prefix='pages') { await context.switchTo(parseAppTabUrl(`/${prefix}/${tab}/${tab}`)); await ready(); context.finishSwitch() }
  }
}
{
  const h = harness(); await h.open('pages/map/map?from=home')
  assert.equal(h.run('activeTab.value'), 'map', 'native encoded target is decoded')
  const mapContext = h.run('current().context')
  await h.go('home'); await h.go('shop'); await h.go('profile'); await h.go('map')
  assert.equal(h.run('panes.length'), 4)
  assert.equal(h.run('current().context'), mapContext, 'map instance is retained')
  assert.equal(h.run('frameStyle(current()).transform'), 'none', 'resting frames do not trap modal stacking')
  const hides = h.calls.filter(([route, name]) => route === 'pages/map/map' && name === 'onHide')
  assert.equal(hides.length, 1)
  h.task(true); h.context.memoryWarning()
  assert.equal(h.run('panes.map(p => p.tab).join(",")'), 'map,home', 'pending recognition and active map survive pressure')
  h.task(false); h.context.memoryWarning(); assert.equal(h.run('panes.length'), 1)
  h.allow(false); await h.context.switchTo(parseAppTabUrl('/pages/shop/shop'))
  assert.equal(h.run('activeTab.value'), 'map', 'version gate blocks logical tab')
  assert.equal(h.run('selectedTab.value'), 'map')
}
{
  const h = harness(); await h.open(); await h.go('map')
  await h.context.switchTo(parseAppTabUrl('/pages/home/home')); await h.flush()
  assert.ok(h.queries.length > 0)
  h.hooks.onHide(); while (h.queries.length) h.queries.shift()()
  assert.equal(h.run('sliding.value'), false, 'late layout callbacks cannot restart a hidden transition')
  assert.equal(h.run('current().context.foreground.value'), false)
  h.hooks.onShow(); assert.equal(h.run('current().context.foreground.value'), true)
  await h.go('profile', 'pages-dark'); assert.equal(h.run('panes.length'), 1, 'theme change disposes old-theme instances')
  assert.equal(h.run('current().component.name'), 'DarkProfile')
  h.hooks.onUnload(); assert.equal(h.timers.size, 0); assert.equal(h.shell, null)
}
{
  const h = harness(); await h.open()
  await h.context.switchTo(parseAppTabUrl('/pages/map/map')); await h.ready()
  await h.context.switchTo(parseAppTabUrl('/pages/shop/shop'))
  await h.context.switchTo(parseAppTabUrl('/pages/profile/profile'))
  h.context.finishSwitch(); await h.ready(); h.context.finishSwitch()
  assert.equal(h.run('activeTab.value'), 'profile', 'rapid taps settle on the latest tab')
  assert.equal(h.run('panes.length'), 3, 'intermediate queued tab is not mounted')
  const idle = [...h.timers.values()].filter(t => t.delay === 300000)
  idle.forEach(t => t.fn()); assert.equal(h.run('panes.length'), 1, 'inactive tabs expire')
}
{
  const h = harness(); await h.open()
  await h.context.switchTo(parseAppTabUrl('/pages/map/map')); await h.ready()
  await h.context.switchTo(parseAppTabUrl('/pages/shop/shop'))
  h.allow(false); h.context.finishSwitch()
  assert.equal(h.run('activeTab.value'), 'map', 'a queued tab uses the latest upgrade policy before being mounted')
  assert.equal(h.run('selectedTab.value'), 'map')
}
{
  const calls = [], shellPage = {}, detail = {}, shell = { page: shellPage, switchTo: async target => { calls.push(['switch', target.tab]); return true }, scrollTo: opts => calls.push(['scroll', opts.scrollTop]) }
  let pages = [shellPage], activeShell = shell
  const uni = Object.fromEntries(['navigateTo', 'redirectTo', 'reLaunch', 'navigateBack', 'pageScrollTo'].map(method => [method, opts => calls.push([method, opts.url || opts.delta])]))
  const context = vm.createContext({ uni, getAppTabShell: () => activeShell, getCurrentPages: () => pages, parseAppTabUrl, appVersionGuard: () => ({ ensure: async () => true }) })
  vm.runInContext(strip(read('src/utils/app-tab-navigation.js')), context); context.installAppTabNavigation()
  await uni.navigateTo({ url: '/pages/map/map' }); assert.equal(calls.at(-1)[0], 'switch')
  pages = [shellPage, detail]; await uni.navigateTo({ url: '/pages/shop/shop' }); assert.deepEqual(calls.at(-1), ['navigateBack', 1])
  await uni.navigateTo({ url: '/pages/map/map?mode=select' }); assert.deepEqual(calls.at(-1), ['navigateTo', '/pages/map/map?mode=select'])
  await uni.reLaunch({ url: '/pages/home/home' }); assert.match(calls.at(-1)[1], /^\/pages\/app-tabs\/index\?target=/)
  activeShell = null; await uni.redirectTo({ url: '/pages-dark/profile/profile' }); assert.match(calls.at(-1)[1], /^\/pages\/app-tabs\/index\?target=/)
}
for (const path of ['src/pages/app-tabs/index.vue', 'src/components/AppTabPane.vue', ...['pages','pages-dark'].flatMap(prefix => ['home','map','shop','profile'].map(tab => `src/${prefix}/${tab}/${tab}.vue`))]) {
  for (const platform of path.includes('app-tabs') || path.includes('AppTabPane') ? ['app'] : ['app','h5','mp-weixin']) {
    initPreContext(platform)
    const { descriptor, errors } = parse(read(path), { filename: path }); assert.equal(errors.length, 0)
    descriptor.scriptSetup.content = preJs(descriptor.scriptSetup.content, path)
    compileScript(descriptor, { id: path })
    const output = compileTemplate({ source: preHtml(descriptor.template.content, path), filename: path, id: path })
    assert.equal(output.errors.length, 0, platform + ': ' + path)
  }
}
console.log('APP tab shell: routing, lifecycle, retention, rapid taps, theme, memory pressure and platform compilation passed')
