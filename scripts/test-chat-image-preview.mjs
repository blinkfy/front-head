import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { ref, computed } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const viewerSource = fs.readFileSync(new URL('../src/pages-nonTheme/components/ChatImagePreview.vue', import.meta.url), 'utf8')
const { descriptor } = parse(viewerSource)
const cachedImage = parse(fs.readFileSync(new URL('../src/pages-nonTheme/components/ChatCachedImage.vue', import.meta.url), 'utf8')).descriptor
for (const flags of [{ APP_PLUS: true }, { H5: true }, { MP_WEIXIN: true }]) {
  const content = preprocess(descriptor.scriptSetup.content, flags, { type: 'js' })
  compileScript(parse('<script setup>' + content + '</script><template>' + descriptor.template.content + '</template>').descriptor, { id: 'chat-image-preview' })
  assert.deepEqual(compileTemplate({ filename: 'ChatImagePreview.vue', id: 'chat-image-preview', source: descriptor.template.content }).errors, [])
  const cachedSetup = preprocess(cachedImage.scriptSetup.content, flags, { type: 'js' })
  compileScript(parse('<script setup>' + cachedSetup + '</script><template>' + cachedImage.template.content + '</template>').descriptor, { id: 'chat-cached-image' })
  assert.deepEqual(compileTemplate({ filename: 'ChatCachedImage.vue', id: 'chat-cached-image', source: cachedImage.template.content }).errors, [])
}
{
  const events = [], lookups = [], props = { owner: '7', kind: 'preview', src: 'https://api.test/preview.jpg',
    originalSrc: 'https://api.test/original.jpg', conversationId: '42', messageId: 8 }
  let originalAvailable = true, unmount
  const context = { ref, defineOptions() {}, defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    getCurrentInstance: () => ({ proxy: {} }), onMounted() {}, onBeforeUnmount: fn => { unmount = fn }, watch() {},
    readChatImageMedia: async (...args) => {
      lookups.push(args)
      return originalAvailable ? { url: '/saved/hd.jpg', original: true } : { url: '/saved/preview.jpg' }
    },
    forgetChatOriginalMedia: async () => { originalAvailable = false },
    fetchChatMedia: () => { throw new Error('cached originals must not download a thumbnail') } }
  const setup = preprocess(cachedImage.scriptSetup.content, { APP_PLUS: true }, { type: 'js' }).replace(/^import .*$/gm, '')
  vm.runInNewContext(setup + '\nglobalThis.api = {load,displaySrc,onImageLoad,onImageError}', context)
  await context.api.load()
  assert.equal(context.api.displaySrc.value, '/saved/hd.jpg')
  assert.equal(events.length, 0, 'undecoded originals are not promoted to the page')
  context.api.onImageLoad({})
  assert.equal(events.at(-1)[0], 'original-cached', 'list and fullscreen notify the page to reuse its own original handle')
  assert.equal(lookups[0][2], props.originalSrc)
  assert.equal(lookups[0][3].join(','), '42,8')
  assert.equal(lookups[0][4].download, false, 'offscreen lookup does not start downloads')
  await context.api.onImageError({ currentTarget: { dataset: { sourceKey: 1 } } })
  assert.equal(originalAvailable, true, 'a late error from the old thumbnail cannot invalidate the original')
  await context.api.onImageError({})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(context.api.displaySrc.value, '/saved/preview.jpg', 'invalid original falls back to the local thumbnail')
  originalAvailable = true
  await context.api.load()
  unmount()
  await context.api.onImageError({})
  assert.equal(originalAvailable, true, 'closing the page cannot invalidate the original')
}
function fixture(index = 1) {
  let now = 1000, resize
  const events = [], props = { index, count: 3, messageId: 8 }
  const context = { ref, computed, defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    onResize: fn => { resize = fn }, onMounted() {}, onBeforeUnmount() {}, Date: { now: () => now },
    uni: { getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800 }) } }
  const source = preprocess(descriptor.scriptSetup.content, { APP_PLUS: true }, { type: 'js' }).replace(/^import .*$/gm, '')
  vm.runInNewContext(source + '\nglobalThis.api = {imageLoad,imageSize,imageStyle,zoomLevel,offsetX,offsetY,setZoom,resetZoom,zoomBy,touchStart,touchMove,touchEnd,cancelTouch,mouseDown,mouseMove,mouseUp,keydown,doubleClick,closeOnBackground}', context)
  return { api: context.api, props, events, resize: () => resize(), tick: () => { now += 100 }, wait: () => { now += 1000 } }
}
const landscape = fixture()
landscape.api.imageLoad({ detail: { width: 1600, height: 900 } })
assert.equal(landscape.api.imageSize.value.width, 400)
assert.equal(landscape.api.imageSize.value.height, 225, 'a landscape photo keeps its complete field of view')
landscape.api.setZoom(99)
assert.equal(landscape.api.zoomLevel.value, 3)
landscape.api.mouseDown({ button: 0, clientX: 200, clientY: 400 })
landscape.api.mouseMove({ clientX: 1400, clientY: 1400 })
assert.equal(landscape.api.offsetX.value, 400)
assert.equal(landscape.api.offsetY.value, 0, 'dragging cannot move a short image out of view')
landscape.api.mouseUp(); landscape.api.resetZoom()
assert.equal(landscape.api.offsetX.value, 0)
landscape.api.setZoom(0.01)
assert.equal(landscape.api.zoomLevel.value, .5)
const swipe = fixture()
swipe.api.touchStart({ touches: [{ clientX: 200, clientY: 400 }] })
swipe.api.touchMove({ touches: [{ clientX: 100, clientY: 410 }] })
swipe.api.touchEnd({ touches: [] })
assert.equal(swipe.events.at(-1)[0], 'next')
swipe.api.closeOnBackground()
assert.equal(swipe.events.at(-1)[0], 'next', 'the click following a swipe cannot close the viewer')
swipe.wait(); swipe.api.closeOnBackground()
assert.equal(swipe.events.at(-1)[0], 'close')
for (const index of [0, 2]) {
  const bounded = fixture(index)
  bounded.api.keydown({ key: index === 0 ? 'ArrowLeft' : 'ArrowRight' })
  assert.equal(bounded.events.length, 0, 'navigation stops at the first and last image')
}
const pinch = fixture()
pinch.api.imageLoad({ detail: { width: 400, height: 800 } })
pinch.api.touchStart({ touches: [{ clientX: 100, clientY: 400 }, { clientX: 300, clientY: 400 }] })
pinch.api.touchMove({ touches: [{ clientX: 0, clientY: 400 }, { clientX: 400, clientY: 400 }] })
assert.equal(pinch.api.zoomLevel.value, 2)
pinch.api.touchEnd({ touches: [{ clientX: 0, clientY: 400 }] })
pinch.api.touchMove({ touches: [{ clientX: 200, clientY: 400 }] })
pinch.api.touchEnd({ touches: [] })
assert.equal(pinch.events.filter(event => ['next', 'previous', 'close'].includes(event[0])).length, 0)
const taps = fixture()
for (let i = 0; i < 2; i++) { taps.api.touchStart({ touches: [{ clientX: 200, clientY: 400 }] }); taps.api.touchEnd({ touches: [] }); taps.tick() }
assert.equal(taps.api.zoomLevel.value, 2, 'double tap zooms the photo')
taps.api.doubleClick({ clientX: 200, clientY: 400 })
assert.equal(taps.api.zoomLevel.value, 2, 'a synthetic browser double click cannot undo a touch double tap')
taps.wait(); taps.api.doubleClick({ clientX: 200, clientY: 400 })
assert.equal(taps.api.zoomLevel.value, 1)
taps.api.keydown({ key: 'Escape' })
assert.equal(taps.events.at(-1)[0], 'close')

const methodsSource = fs.readFileSync(new URL('../src/pages-nonTheme/chat/image-methods.js', import.meta.url), 'utf8')
const cacheMethodsSource = fs.readFileSync(new URL('../src/pages-nonTheme/chat/cache-methods.js', import.meta.url), 'utf8')
for (const flags of [{ APP_PLUS: true }, { H5: true }]) {
  const restored = { id: 8, type: 'image', content: 'https://api.test/original.jpg' }
  const context = { restoreCachedChatOriginalImages: async () => ({ 8: '/saved/hd.jpg' }) }
  const script = preprocess(cacheMethodsSource, flags, { type: 'js' }).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  vm.runInNewContext(script + '\nglobalThis.restore = historyCacheMethods.restoreCachedOriginalImages', context)
  const state = { messages: [restored], chatId: '42', getCurrentUserId: () => 7, saveMessagesToStorage() {},
    getChatMediaSource: async (_kind, _url, options) => { assert.equal(options, undefined, 'restoring cached HD cannot download'); return 'blob:hd-cache' },
    getCurrentImageMessage: () => restored, setLoadedOriginalImage: (_id, url) => { state.path = url } }
  await context.restore.call(state)
  assert.equal(restored.originalLoaded, true, 'cache lookup does not require the old originalLoaded message flag')
  assert.equal(state.path, flags.H5 ? 'blob:hd-cache' : '/saved/hd.jpg')
  state.path = ''
  state.getCurrentImageMessage = () => null
  await context.restore.call(state)
  assert.equal(state.path, '', 'a replaced/deleted message cannot receive an outdated cached original')
}
const methodsContext = { baseUrl: 'https://api.test', console: { log() {}, warn() {}, error() {} },
  loadChatOriginalImage: async () => ({ url: '/temp/already-downloaded.jpg', persistent: false }) }
const compiled = preprocess(methodsSource, { APP_PLUS: true }, { type: 'js' }).replace(/^import .*$/gm, '').replace(/^export /gm, '')
vm.runInNewContext(compiled + '\nglobalThis.api = { imagePreviewMethods, imageLoadingMethods, imageRetryMethods, imageErrorMethods }', methodsContext)
const message = { id: 8, type: 'image', content: 'https://api.test/photo.jpg', fileSize: 2000000 }
let fallback = 0, saved = 0
const page = { chatId: '42', getCurrentUserId: () => 7, getCurrentImageMessage: () => message,
  setLoadedOriginalImage: (_id, path) => { page.path = path }, saveMessagesToStorage: () => { saved++ },
  finishOriginalImageLoading() {}, preloadOriginalImageFromNetwork: () => { fallback++ } }
await methodsContext.api.imageLoadingMethods.loadAndPersistOriginalImage.call(page, message)
assert.equal(page.path, '/temp/already-downloaded.jpg')
assert.equal(message.originalLoaded, false, 'temporary fallback is never recorded as a persistent original')
assert.equal(fallback, 0, 'a persistence failure reuses the completed download instead of fetching the URL again')
assert.equal(saved, 1)
{
  const toasts = []
  methodsContext.uni = {
    getImageInfo() { throw new Error('offline fallback must not request a remote original') },
    showToast: toast => toasts.push(toast.title)
  }
  methodsContext.isChatImageOffline = async () => true
  await methodsContext.api.imageLoadingMethods.preloadOriginalImageFromNetwork.call(page, message, true)
  assert.deepEqual(toasts, [], 'automatic offline upgrade does not interrupt thumbnail viewing')
  await methodsContext.api.imageLoadingMethods.preloadOriginalImageFromNetwork.call(page, message, false)
  assert.deepEqual(toasts, ['当前离线，原图未缓存'])
}
{
  let completeImageInfo
  const rendered = { ...message }
  const state = { ...page, getCurrentImageMessage: () => rendered, saveMessagesToStorage() {},
    setLoadedOriginalImage: (_id, url) => { state.path = url } }
  methodsContext.isChatImageOffline = async () => false
  methodsContext.uni = { getImageInfo: options => { completeImageInfo = options.success } }
  methodsContext.saveDownloadedChatOriginal = async (owner, url, path, scope) => {
    assert.equal(owner, 7)
    assert.equal(url, message.content)
    assert.equal(path, '/temp/preloaded.jpg')
    assert.equal(scope.join(','), '42,8')
    return { url: '/saved/preloaded.jpg', persistent: true }
  }
  await methodsContext.api.imageLoadingMethods.preloadOriginalImageFromNetwork.call(state, rendered, false)
  await completeImageInfo({ path: '/temp/preloaded.jpg' })
  assert.equal(state.path, '/saved/preloaded.jpg', 'the native fallback saves its downloaded file instead of using the remote URL')
  assert.equal(rendered.originalLoaded, true)
  await methodsContext.api.imageErrorMethods.onImageError.call({ isChatPageDestroyed: true }, rendered, {})
}
for (const rejects of [false, true]) {
  let release
  methodsContext.loadChatOriginalImage = () => new Promise((resolve, reject) => { release = () => rejects ? reject(new Error('download failed')) : resolve(null) })
  const request = methodsContext.api.imageLoadingMethods.loadAndPersistOriginalImage.call(page, message)
  page.chatId = 'another-chat'
  release()
  await request
  assert.equal(fallback, 0, 'leaving the conversation during download cannot start an old image request')
  assert.equal(saved, 1)
  page.chatId = '42'
}
const navigation = { previewImageList: [message, { ...message, id: 9 }], previewCurrentIndex: 1 }
methodsContext.api.imagePreviewMethods.nextPreviewImage.call(navigation)
assert.equal(navigation.previewCurrentIndex, 1)
navigation.previewCurrentIndex = 0
methodsContext.api.imagePreviewMethods.prevPreviewImage.call(navigation)
assert.equal(navigation.previewCurrentIndex, 0)
{
  let stored = true, pruned = 0
  methodsContext.readChatOriginalMedia = async () => stored ? { url: '/saved/hd.jpg' } : null
  methodsContext.removeChatImagePreviews = async (_owner, urls) => { assert.equal(urls[0], 'https://api.test/preview.jpg'); pruned++ }
  const current = { ...message, originalLoaded: true, thumbnail: 'https://api.test/preview.jpg' }
  const state = { chatId: '42', getCurrentUserId: () => '7', loadedOriginalImageTokens: { 8: 'hd-token' },
    loadedOriginalImages: { 8: '/saved/hd.jpg' }, getThumbnail: () => current.thumbnail,
    imageRetryNonces: {}, imageRetryLoadingIds: {}, mediaLoadErrors: {} }
  const event = { currentTarget: { dataset: { messageId: 8, originalToken: 'hd-token' } } }
  methodsContext.api.imageRetryMethods.onImageLoad.call(state, current, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pruned, 1, 'rendered persistent originals remove their preview')
  stored = false
  methodsContext.api.imageRetryMethods.onImageLoad.call(state, current, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pruned, 1, 'a failed persistent write keeps the thumbnail even when an original renders')
  stored = true
  event.currentTarget.dataset.originalToken = 'old-preview-token'
  methodsContext.api.imageRetryMethods.onImageLoad.call(state, current, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pruned, 1, 'a late thumbnail load cannot delete the preview before the original renders')
}
console.log('PASS chat image preview: contain/zoom/pan/pinch/swipe/keyboard, gesture safety, bounded navigation, temporary-download reuse and three-platform compilation')

if (process.argv.includes('--fixture')) {
  const fixtureTemplate = descriptor.template.content.replace(/(<\/?)(view|text)(?=[\s>])/g, (_all, opening, tag) => opening + (tag === 'view' ? 'div' : 'span'))
  const setup = preprocess(descriptor.scriptSetup.content, { H5: true }, { type: 'js' }).replace(/^import .*from ['"](?:@dcloudio\/uni-app|\.\/ChatCachedImage\.vue)['"].*$/gm, '')
  let component = compileScript(parse('<script setup>' + setup + '</script><template>' + fixtureTemplate + '</template>').descriptor, { id: 'preview-fixture', inlineTemplate: true }).content
  component = component.replace(/import\s*\{([^}]+)\}\s*from\s*['"]vue['"];?/g, (_all, names) => `const {${names.replace(/\bas\b/g, ':')}} = Vue;`).replace('export default', 'const Preview =')
  const runtime = fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'), 'utf8')
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#19745b"/><rect x="12" y="12" width="1576" height="876" fill="none" stroke="#d6f4e4" stroke-width="24"/><path d="M0 450H1600M800 0V900" stroke="#a1d8c1" stroke-width="8"/><text x="800" y="420" text-anchor="middle" fill="white" font-size="96">1600 × 900</text><text x="800" y="570" text-anchor="middle" fill="white" font-size="54">完整画面 · 双击或滚轮缩放</text></svg>')
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;font-family:Arial,sans-serif}button{font-family:inherit;cursor:pointer} ${descriptor.styles[0].content}</style><div id="app"></div><script>${runtime}</script><script>const uni={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight})};const onResize=fn=>addEventListener('resize',fn);${component};const app=Vue.createApp({data:()=>({index:0,closed:false,src:${JSON.stringify(image)}}),template:'<Preview v-if="!closed" :key="index" :src="src" :index="index" :count="3" :message-id="index" file-size="2 MB" @next="index++" @previous="index--" @close="closed=true"/><p v-else>预览已关闭</p>',components:{Preview}});app.component('ChatCachedImage',{inheritAttrs:false,props:['src','messageId'],emits:['load','error'],setup(p,{attrs,emit}){return()=>Vue.h('img',{...attrs,src:p.src,draggable:false,onLoad:e=>emit('load',{detail:{width:e.target.naturalWidth,height:e.target.naturalHeight}}),onError:e=>emit('error',e)})}});app.mount('#app');</script>`
  fs.mkdirSync(new URL('../output/playwright/', import.meta.url), { recursive: true })
  fs.writeFileSync(new URL('../output/playwright/chat-image-preview.html', import.meta.url), html)
}
