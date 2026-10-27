import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const filename = 'src/components/smart-sort-xr-native/index.js'
const source = readFileSync(filename, 'utf8')
let definition
const model = {
  src: '/robot.glb',
  center: [0, 0, 0],
  sequences: { idle: ['Idle_Base'], success: ['Success'] },
  loops: ['Idle_Base']
}
const context = {
  Component(value) { definition = value },
  require(id) {
    assert.equal(id, './model-meta')
    return model
  },
  wx: {
    getXrFrameSystem() {
      return {
        Camera: 'Camera',
        Animator: 'Animator',
        Matrix4: { orthographic: (...values) => values }
      }
    }
  },
  Set,
  Date,
  Math
}
vm.runInNewContext(source, context, { filename })
assert.ok(definition, 'native XR component definition is registered')

function makeInstance() {
  const emitted = []
  const dataCalls = []
  const instance = {
    properties: { robotState: 'idle', reducedMotion: false, width: 240, height: 218 },
    data: { assetsReady: false },
    emitted,
    dataCalls,
    triggerEvent(name, detail) { emitted.push({ name, detail }) },
    setData(data) { dataCalls.push(data); Object.assign(this.data, data) }
  }
  for (const [name, method] of Object.entries(definition.methods)) instance[name] = method.bind(instance)
  definition.lifetimes.attached.call(instance)
  return instance
}

function makeScene(counters, camera, animator) {
  return {
    getElementById(id) {
      counters.sceneLookup++
      if (id === 'robot-camera') return { getComponent: () => camera }
      if (id === 'robot') return { getComponent: () => animator }
      return null
    }
  }
}

function makeAnimator(counters) {
  return {
    el: { event: {
      add() { counters.listenerAdd++ },
      remove() { counters.listenerRemove++ }
    } },
    play() { counters.play++ },
    stop() { counters.stop++ },
    pauseToFrame() {}
  }
}

function assertLateEventsAreInert(instance, counters, expectedLookups) {
  const beforeEvents = instance.emitted.length
  const beforeData = instance.dataCalls.length
  const beforeLookups = counters.sceneLookup
  instance.handleReady({ detail: { value: makeScene(counters, {}, makeAnimator(counters)) } })
  instance.handleAssetsLoaded({ detail: { value: { errors: { asset: 'late error' } } } })
  instance.handleModelLoaded({ detail: { value: {} } })
  instance.handleTick()
  instance.updateCamera()
  assert.equal(instance.emitted.length, beforeEvents, 'late callbacks emit no component events')
  assert.equal(instance.dataCalls.length, beforeData, 'late callbacks do not update component data')
  assert.equal(counters.sceneLookup, beforeLookups, 'late callbacks do not look up scene objects')
  assert.equal(counters.sceneLookup, expectedLookups, 'scene lookup count remains at the pre-late-event value')
}

// A normally mounted renderer still accepts ready/assets/model callbacks and reaches modelready.
{
  const counters = { sceneLookup: 0, listenerAdd: 0, listenerRemove: 0, play: 0, stop: 0, projection: 0 }
  const camera = { changeProjectMatrix() { counters.projection++ } }
  const animator = makeAnimator(counters)
  const scene = makeScene(counters, camera, animator)
  const instance = makeInstance()
  instance.handleReady({ detail: { value: scene } })
  instance.handleAssetsLoaded({ detail: { value: {} } })
  instance.handleModelLoaded({ detail: { value: { target: { getComponent: () => animator } } } })
  assert.equal(instance.data.assetsReady, true, 'assets-loaded marks assets ready')
  assert.equal(instance.camera, camera, 'model-loaded initializes the camera')
  assert.equal(instance.animator, animator, 'model-loaded initializes the animator')
  assert.equal(counters.projection, 1, 'model-loaded updates camera projection')
  assert.equal(counters.play, 1, 'model-loaded starts the first animation')
  instance.handleTick()
  instance.handleTick()
  assert.ok(instance.emitted.some(event => event.name === 'modelready'), 'tick reports modelready after initialization')
  assert.ok(instance.emitted.some(event => event.name === 'modelprogress' && event.detail.stage === 'scene-ready'))

  const lookupsBeforeDetach = counters.sceneLookup
  definition.lifetimes.detached.call(instance)
  assert.equal(counters.stop, 0, 'detached does not call animator.stop on the released XR context')
  assert.equal(instance.framesUntilReady, 0, 'detached clears pending ready frames')
  assertLateEventsAreInert(instance, counters, lookupsBeforeDetach)
}

// A failed renderer ignores callbacks and observers that arrive after fallback.
{
  const counters = { sceneLookup: 0, listenerAdd: 0, listenerRemove: 0, play: 0, stop: 0, projection: 0 }
  const instance = makeInstance()
  instance.fallback(new Error('mock failure'))
  assert.equal(instance.failed, true, 'fallback marks the renderer failed')
  assert.equal(instance.emitted.filter(event => event.name === 'modelfallback').length, 1)
  assertLateEventsAreInert(instance, counters, 0)
}

console.log('native robot XR lifecycle guards passed')
