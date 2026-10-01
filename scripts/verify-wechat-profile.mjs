import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { consumeWechatProfileCompletion, markWechatProfileCompletion, nicknameError } from '../src/utils/wechat-profile.mjs'

const require = createRequire(import.meta.url)
const { parse, compileTemplate } = require('@vue/compiler-sfc')

let checks = 0

async function check(name, run) {
  await run()
  checks += 1
  console.log(`ok ${checks} - ${name}`)
}

function makeRuntime() {
  const values = new Map()
  return {
    values,
    getStorageSync(key) { return values.get(key) },
    setStorageSync(key, value) { values.set(key, value) },
    removeStorageSync(key) { values.delete(key) }
  }
}

async function readSource(relativePath) {
  return fs.readFile(new URL(relativePath, import.meta.url), 'utf8')
}

async function loadAvatarTools() {
  const avatarPath = fileURLToPath(new URL('../src/utils/avatar-handler.js', import.meta.url))
  let source = await fs.readFile(avatarPath, 'utf8')
  source = source.replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '')
  source += '\nglobalThis.__avatarTools = { compressImageToBase64, getAvatarType, getAvatarUrl, validateAvatarSize };\n'

  const calls = { canvas: [], export: [] }
  const componentContext = { id: 'form-instance' }
  const runtime = {
    getImageInfo(options) { options.success({ width: 1000, height: 500 }) },
    createCanvasContext(canvasId, context) {
      calls.canvas.push({ canvasId, context })
      return {
        clearRect(...args) { calls.clearRect = args },
        drawImage(...args) { calls.drawImage = args },
        draw(reserve, callback) { assert.equal(reserve, false); callback() }
      }
    },
    canvasToTempFilePath(options, context) {
      calls.export.push({ options, context })
      options.success({ tempFilePath: '/runtime/temp-avatar.png' })
    },
    getFileSystemManager() {
      return { readFile(options) { options.success({ data: 'AA==' }) } }
    }
  }
  const context = vm.createContext({ uni: runtime, console: { log() {}, warn() {}, error() {} } })
  vm.runInContext(source, context, { filename: avatarPath })
  return { tools: context.__avatarTools, calls, runtime, componentContext }
}

async function loadPrepareAvatarFunction() {
  const source = await readSource('../src/components/WechatProfileForm.vue')
  const match = source.match(/async function prepareAvatar\(path\) \{([\s\S]*?)\n\}\nfunction chooseAvatar\(/)
  assert.ok(match, 'expected a standalone prepareAvatar function in the form component')

  const state = {
    busy: { value: false },
    processing: { value: false },
    error: { value: '' },
    draftAvatar: { value: 'existing-avatar' },
    context: { id: 'form-instance' },
    active: true,
    compressed: null,
    validation: null
  }
  const context = vm.createContext({
    ...state,
    compressImageToBase64: async () => state.compressed,
    validateAvatarSize: () => state.validation
  })
  const prepare = vm.runInContext(`(async function(path) { ${match[1]}\n})`, context, { filename: 'WechatProfileForm.vue#prepareAvatar' })
  return { prepare, state }
}

async function run() {
  await check('registration intent is single use, expires after 24 hours, and cannot transfer to another account', async () => {
    const runtime = makeRuntime()
    markWechatProfileCompletion(runtime, 'account-a')
    assert.equal(consumeWechatProfileCompletion(runtime, { id: 2, username: 'account-b' }), false)
    assert.ok(runtime.getStorageSync('wechatProfileCompletionPending'), 'mismatched account must not consume the pending intent')
    assert.equal(consumeWechatProfileCompletion(runtime, { id: 1, username: 'account-a' }), true)
    assert.equal(runtime.getStorageSync('wechatProfileCompletionPending'), undefined)

    markWechatProfileCompletion(runtime, 'account-a')
    const pending = runtime.getStorageSync('wechatProfileCompletionPending')
    assert.equal(consumeWechatProfileCompletion(runtime, { id: 1, username: 'account-a' }, pending.createdAt + 24 * 60 * 60 * 1000 + 1), false)
    assert.equal(runtime.getStorageSync('wechatProfileCompletionPending'), undefined)
    markWechatProfileCompletion(runtime, 'account-a')
    assert.equal(consumeWechatProfileCompletion(runtime, { username: 'account-a' }), false)

    for (const createdAt of [Number.NaN, Number.POSITIVE_INFINITY, Date.now() + 1]) {
      runtime.setStorageSync('wechatProfileCompletionPending', { username: 'account-a', createdAt })
      assert.equal(consumeWechatProfileCompletion(runtime, { id: 1, username: 'account-a' }), false)
      assert.equal(runtime.getStorageSync('wechatProfileCompletionPending'), undefined)
    }
  })

  await check('nickname validation counts Unicode code points and rejects invalid/control input', async () => {
    assert.equal(nicknameError('  猫'.repeat(1).trim()), '')
    assert.equal(nicknameError('猫'.repeat(32)), '')
    assert.notEqual(nicknameError('猫'.repeat(33)), '')
    assert.notEqual(nicknameError('bad\u0001name'), '')
    assert.notEqual(nicknameError('bad\u007fname'), '')
    assert.notEqual(nicknameError('bad\u0085name'), '')
    assert.equal(nicknameError(undefined), '昵称最多32个字符，且不能包含控制字符')
  })

  await check('mini-program avatar processing binds the component canvas, compresses to 128 by 128, and returns Base64', async () => {
    const { tools, calls, componentContext } = await loadAvatarTools()
    const result = await tools.compressImageToBase64('/wx/avatar-temp.png', 128, 128, 0.8, {
      canvasId: 'wechat-profile-avatar',
      context: componentContext
    })
    assert.equal(result, 'data:image/png;base64,AA==')
    assert.deepEqual(calls.canvas, [{ canvasId: 'wechat-profile-avatar', context: componentContext }])
    assert.deepEqual(calls.drawImage, ['/wx/avatar-temp.png', 0, 32, 128, 64])
    assert.equal(calls.export.length, 1)
    assert.equal(calls.export[0].options.canvasId, 'wechat-profile-avatar')
    assert.equal(calls.export[0].options.width, 128)
    assert.equal(calls.export[0].options.height, 128)
    assert.equal(calls.export[0].options.destWidth, 128)
    assert.equal(calls.export[0].options.destHeight, 128)
    assert.equal(calls.export[0].options.fileType, 'png')
    assert.equal(calls.export[0].context, componentContext)
    assert.equal(tools.validateAvatarSize(result).isValid, true)
  })

  await check('form never promotes a temporary file path to the saved avatar when Base64 processing fails', async () => {
    const { prepare, state } = await loadPrepareAvatarFunction()
    state.compressed = '/wx/runtime/temp-avatar.png'
    state.validation = { isValid: false, message: '无效的头像格式' }
    await prepare('/wx/avatar-temp.png')
    assert.equal(state.draftAvatar.value, 'existing-avatar')
    assert.equal(state.error.value, '无效的头像格式')
    assert.equal(state.processing.value, false)

    state.compressed = 'data:image/png;base64,AA=='
    state.validation = { isValid: true }
    await prepare('/wx/avatar-temp.png')
    assert.equal(state.draftAvatar.value, 'data:image/png;base64,AA==')
    assert.equal(state.error.value, '')
    assert.equal(state.processing.value, false)
  })

  await check('both mini-program login themes require a matching owned user, suppress shared-account completion, and release wait on unload', async () => {
    for (const file of ['../src/pages/index/index.vue', '../src/pages-dark/index/index.vue']) {
      const source = await readSource(file)
      const completeStart = source.indexOf('async function completeLogin(')
      const loginStart = source.indexOf('function onLogin(', completeStart)
      const completeLogin = source.slice(completeStart, loginStart)
      assert.ok(completeStart >= 0 && loginStart > completeStart)
      assert.match(source, /res\.wechatLoginMode !== 'shared' && consumeWechatProfileCompletion\(uni, registeredUser\)/)
      assert.ok(completeLogin.indexOf('loggedInUser = userInfoRes.data') < completeLogin.indexOf('const registeredUser = loggedInUser'))
      assert.match(completeLogin, /const userInfoRes = await userinfo\("false"\)/)
      assert.match(source, /await new Promise\(resolve => \{ resolveProfileCompletion = resolve \}\)/)
      assert.match(source, /onUnload\(\(\) => \{[^}]*finishProfileCompletion\(\)/)
      assert.match(source, /const registeredUser = loggedInUser/)
      assert.match(source, /if \(isLoading\.value \|\| profileCompletionVisible\.value\) return/)
    }
  })

  await check('registration stores the username-bound completion intent only after registration succeeds', async () => {
    const source = await readSource('../src/pages/register/register.vue')
    assert.match(source, /markWechatProfileCompletion\(uni,\s*username\.value\)/)
    assert.match(source, /import \{ markWechatProfileCompletion \} from '@\/utils\/wechat-profile\.mjs'/)
  })

  await check('H5 edit-profile sends nickname while the personal page displays nickname with username fallback', async () => {
    const editSource = await readSource('../src/pages-nonTheme/edit-profile.vue')
    const profileFiles = ['../src/pages/profile/profile.vue', '../src/pages-dark/profile/profile.vue']
    assert.match(editSource, /payload\.nickname\s*=\s*formData\.nickname\.trim\(\)/)
    assert.match(editSource, /userApi\.updateUserProfile\(payload\)/)
    for (const file of profileFiles) {
      const source = await readSource(file)
      assert.match(source, /userInfo\.nickname\s*\|\|\s*\(userInfo\.username\s*\|\|\s*username\)\.toUpperCase\(\)/)
      const { descriptor, errors: parseErrors } = parse(source, { filename: file })
      assert.deepEqual(parseErrors, [], `${file} SFC parse errors`)
      const templateResult = compileTemplate({
        source: descriptor.template.content,
        filename: file,
        id: `wechat-profile-${profileFiles.indexOf(file)}`
      })
      assert.deepEqual(templateResult.errors, [], `${file} template compile errors`)
    }
  })

  await check('profile API sends only defined fields so a nickname or avatar save cannot overwrite account/community fields', async () => {
    const source = await readSource('../src/api/user.js')
    const match = source.match(/export function updateUserProfile\(data\) \{([\s\S]*?)\n\}/)
    assert.ok(match, 'expected updateUserProfile in src/api/user.js')
    let captured
    const updateUserProfile = vm.runInNewContext(`(function(data) { ${match[1]}\n})`, {
      uni: { getStorageSync: key => key === 'token' ? 'test-token' : undefined },
      request: options => { captured = options; return options }
    })
    updateUserProfile({ nickname: 'new nickname', avatar: 'data:image/png;base64,AA==' })
    assert.equal(captured.url, '/api/profile')
    assert.equal(captured.method, 'PUT')
    assert.deepEqual(JSON.parse(JSON.stringify(captured.data)), {
      nickname: 'new nickname', avatar: 'data:image/png;base64,AA=='
    })
  })

  console.log(`1..${checks}`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
