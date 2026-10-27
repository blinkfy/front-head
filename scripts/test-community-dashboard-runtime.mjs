import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createCanvas2DChartContext } from '../src/utils/canvas-chart-context.mjs'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptsDir, '..')
const dashboardPath = path.join(frontendDir, 'src/pages-admin/community-dashboard.vue')
const require = createRequire(path.join(frontendDir, 'package.json'))
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const { parse: parseJs } = require('@babel/parser')
const { initPreContext, preHtml, preJs } = require('@dcloudio/uni-cli-shared')

function testCanvasAdapter() {
  const calls = []
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key]
      if (typeof key === 'string') return (...args) => calls.push([key, ...args])
    },
    set(target, key, value) {
      target[key] = value
      calls.push(['set', key, value])
      return true
    }
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      assert.equal(type, '2d')
      return context
    }
  }
  const selected = []
  const scope = { scoped: true }
  const runtime = {
    createSelectorQuery() {
      return {
        in(value) {
          assert.equal(value, scope)
          return this
        },
        select(selector) {
          selected.push(selector)
          return {
            fields(options) {
              assert.deepEqual(options, { node: true, size: true })
              return this
            },
            exec(callback) { callback([{ node: canvas }]) }
          }
        }
      }
    },
    getWindowInfo: () => ({ pixelRatio: 2.5 })
  }

  return createCanvas2DChartContext(runtime, 'trendCanvas', 321, 200, scope).then(chart => {
    assert.equal(canvas.width, 803)
    assert.equal(canvas.height, 500)
    assert.deepEqual(selected, ['#trendCanvas'])
    assert.deepEqual(calls.filter(([name]) => name === 'scale'), [['scale', 2.5, 2.5]])

    chart.setFillStyle('#123456')
    chart.setStrokeStyle('#abcdef')
    chart.setLineWidth(3)
    chart.setFontSize(12)
    chart.setTextAlign('center')
    chart.setTextBaseline('middle')
    chart.fillText('社区', 1, 2)
    chart.beginPath()
    chart.stroke()
    chart.draw()
    assert.equal(context.fillStyle, '#123456')
    assert.equal(context.strokeStyle, '#abcdef')
    assert.equal(context.font, '12px sans-serif')
    for (const expected of [['fillText', '社区', 1, 2], ['beginPath'], ['stroke']]) {
      assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(expected)), `missing context call: ${expected[0]}`)
    }
    assert.equal(calls.filter(([name]) => name === 'scale').length, 1)

    return createCanvas2DChartContext(runtime, 'trendCanvas', 321, 200, scope).then(() => {
      assert.equal(canvas.width, 803)
      assert.equal(canvas.height, 500)
      assert.equal(calls.filter(([name]) => name === 'scale').length, 2, 'one DPR scale per newly initialized 2D context')
    })
  }).then(async () => {
    const missingRuntime = {
      createSelectorQuery: () => ({
        select: () => ({ fields() { return this }, exec(callback) { callback([{}]) } })
      }),
      getWindowInfo: () => ({ pixelRatio: 2 })
    }
    await assert.rejects(
      createCanvas2DChartContext(missingRuntime, 'missingCanvas', 20, 20),
      /图表画布未就绪/
    )
  })
}

function testPlatformCompilation(source) {
  const targets = [
    { name: 'H5', platform: 'h5', flags: ['H5'] },
    { name: 'APP', platform: 'app-plus', flags: ['APP-PLUS'] },
    { name: 'MP-WEIXIN', platform: 'mp-weixin', flags: ['MP-WEIXIN'] }
  ]
  const transformed = new Map()
  for (const target of targets) {
    initPreContext(target.platform)
    const parsed = parse(source, { filename: dashboardPath })
    assert.equal(parsed.errors.length, 0, `${target.name} SFC parse`)
    const { descriptor } = parsed
    const js = preJs(descriptor.scriptSetup.content, dashboardPath)
    parseJs(js, { sourceType: 'module', plugins: ['importAttributes'] })
    const template = preHtml(descriptor.template.content, dashboardPath)
    const compiled = compileTemplate({
      source: template,
      filename: dashboardPath,
      id: `community-dashboard-${target.name.toLowerCase()}`
    })
    assert.equal(compiled.errors.length, 0, `${target.name} template compilation: ${compiled.errors.join('; ')}`)
    compileScript(descriptor, { id: `community-dashboard-${target.name.toLowerCase()}` })
    transformed.set(target.name, { js, template })
  }

  const h5 = transformed.get('H5')
  const app = transformed.get('APP')
  const mp = transformed.get('MP-WEIXIN')
  assert.match(mp.template, /<canvas\b[^>]*\btype="2d"/)
  for (const id of ['donutCanvas', 'trendCanvas', 'radarCanvas']) {
    assert.match(mp.template, new RegExp(`<canvas\\b(?=[^>]*\\btype="2d")(?=[^>]*\\bid="${id}")[^>]*>`), `MP-WEIXIN ${id} must use Canvas 2D`)
  }
  assert.doesNotMatch(mp.js, /createCanvasContext\s*\(/, 'MP-WEIXIN script must not use legacy createCanvasContext')
  assert.match(app.js, /createCanvasContext\s*\(/, 'APP must retain its legacy canvas adapter')
  assert.match(h5.template, /categoryDonutSvg/)
  assert.doesNotMatch(h5.template, /donutCanvas|trendCanvas|radarCanvas/)
  assert.match(mp.js, /createCanvas2DChartContext/)
  assert.match(app.js, /uni\.createCanvasContext/)
}

function extractFunction(script, name) {
  const ast = parseJs(script, { sourceType: 'module' })
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === name)
  assert.ok(declaration, `function ${name} was not found in the parsed dashboard script`)
  return script.slice(declaration.start, declaration.end)
}

async function testRefreshAndApi(source) {
  initPreContext('h5')
  const { descriptor, errors } = parse(source, { filename: dashboardPath })
  assert.equal(errors.length, 0)
  const script = preJs(descriptor.scriptSetup.content, dashboardPath)
  const apiSource = extractFunction(script, 'api')
  const refreshSource = extractFunction(script, 'refreshDashboard')
  const state = {
    loading: false,
    lastOverview: { version: 'old' },
    lastUpdatedAt: '12:34:56'
  }
  const status = { text: '', cls: '' }
  let requestOptions
  let accessDenied
  const common = {
    _state: state,
    statusText: { value: '' },
    statusCls: { value: '' },
    setStatus(text, cls) { status.text = text; status.cls = cls },
    console: { error() {} }
  }
  const api = vm.runInNewContext(`(${apiSource})`, {
    request: async options => { requestOptions = options; return { data: { ok: true } } },
    redirectIfAccessDenied: (...args) => { accessDenied = args }
  })
  assert.deepEqual(await api('/api/admin/community/overview'), { ok: true })
  assert.equal(requestOptions.needAuth, true)
  assert.equal(requestOptions.silent, true)

  const successRefresh = vm.runInNewContext(`(${refreshSource})`, {
    ...common,
    loadDashboardData: async () => {
      state.lastOverview = { version: 'new', sync: { rebuilt: false } }
      state.lastUpdatedAt = '13:00:00'
      return state.lastOverview
    }
  })
  await successRefresh()
  assert.equal(state.lastUpdatedAt, '13:00:00')
  assert.equal(status.cls, 'ok')
  assert.match(status.text, /更新完成/)

  state.lastOverview = { version: 'retained' }
  state.lastUpdatedAt = '13:00:00'
  const failureRefresh = vm.runInNewContext(`(${refreshSource})`, {
    ...common,
    loadDashboardData: async () => { throw { statusCode: 403, message: '暂无权限' } }
  })
  await failureRefresh()
  assert.equal(state.lastOverview.version, 'retained')
  assert.equal(state.lastUpdatedAt, '13:00:00')
  assert.equal(status.cls, 'err')
  assert.match(status.text, /暂无权限.*当前显示 13:00:00 的旧数据/)

  const deniedApi = vm.runInNewContext(`(${apiSource})`, {
    request: async () => { throw { statusCode: 403, data: { message: '暂无权限' } } },
    redirectIfAccessDenied: (...args) => { accessDenied = args }
  })
  await assert.rejects(deniedApi('/api/admin/community/overview'), error => {
    assert.equal(error.statusCode, 403)
    assert.equal(error.data.message, '暂无权限')
    return true
  })
  assert.equal(accessDenied[0].message, '暂无权限')
  assert.equal(accessDenied[1].status, 403)
}

const source = fs.readFileSync(dashboardPath, 'utf8')
await testCanvasAdapter()
testPlatformCompilation(source)
await testRefreshAndApi(source)
console.log('community dashboard runtime checks passed')
