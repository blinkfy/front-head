import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { refineRecognitionMotion } from '../src/components/smart-sort-robot-performance.mjs'
import { getRecognitionRobotState, ROBOT_LOOP_CLIPS, ROBOT_SEQUENCES } from '../src/utils/recognition-robot-state.mjs'
import { bakeRobotModel, smartSortRobotAssetsPlugin } from './smart-sort-robot-assets.mjs'

const modelPath = new URL('../src/static/web/robot_3d/smart_sort_robot_v34_animated.glb', import.meta.url)
const source = await readFile(modelPath)
const gltf = await new GLTFLoader().parseAsync(
  source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  ''
)

const model = gltf.scene
const failBeforeDuration = gltf.animations.find(clip => clip.name === 'Fail')?.duration
assert.ok(Number.isFinite(failBeforeDuration), 'source GLB should include the Fail animation')
refineRecognitionMotion(gltf.animations, model)
const byName = new Map(gltf.animations.map(clip => [clip.name, clip]))
const requiredDurations = new Map([
  ['Wake', [0.5, 1.2]],
  ['Analyze_Enter', [0.5, 1.6]],
  ['Analyze_Loop', [11.5, 14.2]],
  ['Analyze_Confirm', [0.75, 1.1]],
  ['Analyze_Review_Loop', [9.5, 12.2]],
  ['Result_Look', [0.7, 1.05]]
])

function trackValue(track, key) {
  const stride = track.getValueSize()
  const values = key === 'first' ? track.values.slice(0, stride) : track.values.slice(-stride)
  return Array.from(values)
}

for (const [name, [minDuration, maxDuration]] of requiredDurations) {
  const clip = byName.get(name)
  assert.ok(clip, `expected animation ${name}`)
  assert.ok(clip.duration >= minDuration && clip.duration <= maxDuration,
    `${name} duration ${clip.duration.toFixed(2)}s should be in ${minDuration}-${maxDuration}s`)
  assert.ok(clip.tracks.length > 0, `${name} should contain animation tracks`)
  for (const track of clip.tracks) {
    assert.ok(track.times.length > 1, `${name}/${track.name} should have multiple keyframes`)
    assert.equal(track.times[0], 0, `${name}/${track.name} should begin at time zero`)
    assert.ok(Math.abs(track.times[track.times.length - 1] - clip.duration) < 1e-3,
      `${name}/${track.name} should end at the clip duration`)
    assert.ok([...track.times, ...track.values].every(Number.isFinite),
      `${name}/${track.name} should have finite keyframe data`)
  }
}

for (const name of ['Analyze_Loop', 'Analyze_Review_Loop']) {
  const clip = byName.get(name)
  for (const track of clip.tracks) {
    if (!/^(HeadRoot|RobotRoot|BodyRoot|SproutRoot|Ear[LR]Root|Leaf[LR]|Eye[LR])\./.test(track.name)) continue
    const first = trackValue(track, 'first')
    const last = trackValue(track, 'last')
    const gap = Math.max(...first.map((value, index) => Math.abs(value - last[index])))
    assert.ok(gap < 0.035, `${name}/${track.name} should loop without a visible endpoint pop (gap ${gap})`)
  }
  assert.ok(ROBOT_LOOP_CLIPS.includes(name), `${name} should be recognized as a looping clip`)
}

assert.deepEqual(ROBOT_SEQUENCES.reviewing, ['Analyze_Confirm', 'Analyze_Review_Loop'])
assert.deepEqual(ROBOT_SEQUENCES.success, ['Resolve', 'Success', 'Result_Look'])
assert.deepEqual(ROBOT_SEQUENCES.processing, ['Analyze_Enter', 'Analyze_Loop'])
assert.deepEqual(ROBOT_SEQUENCES.uploading, ['Upload_Enter', 'Upload_Loop'])
assert.ok(Math.abs(byName.get('Fail').duration - failBeforeDuration - 1.1) < 0.02,
  'Fail should end with the requested 1.1 second rest')
assert.equal(getRecognitionRobotState({ phase: 'advising', preview: { labels: [{ name: '纸盒' }] } }), 'reviewing')
assert.equal(getRecognitionRobotState({ phase: 'finalizing', preview: { labels: [{ name: '纸盒' }] } }), 'reviewing')
for (const snapshot of [
  null,
  {},
  { phase: 'advising', preview: { labels: [] } },
  { phase: 'recognizing', preview: { labels: [{ name: '纸盒' }] } },
  { phase: 'succeeded', preview: { labels: [{ name: '纸盒' }] } },
  { phase: 'advising', preview: { labels: '纸盒' } }
]) {
  assert.equal(getRecognitionRobotState(snapshot), 'processing',
    'reviewing should require labels and an advising/finalizing phase')
}

const xrSource = await readFile(new URL('../src/components/smart-sort-xr-native/index.js', import.meta.url), 'utf8')
assert.match(xrSource, /ROBOT_SEQUENCES|sequences/,
  'mini-program animation player should use the shared robot sequences')
assert.match(xrSource, /ROBOT_LOOP_CLIPS|loops/,
  'mini-program animation player should use the shared loop clip list')

const baked = await bakeRobotModel()
assert.ok(baked.buffer.length < 2 * 1024 * 1024 - 16 * 1024,
  `baked mini-program GLB should leave metadata budget (got ${baked.buffer.length} bytes)`)
const bakedGltf = await new GLTFLoader().parseAsync(
  baked.buffer.buffer.slice(baked.buffer.byteOffset, baked.buffer.byteOffset + baked.buffer.byteLength),
  ''
)
const bakedByName = new Map(bakedGltf.animations.map(clip => [clip.name, clip]))
for (const name of ['Wake', 'Analyze_Enter', 'Analyze_Loop', 'Analyze_Confirm', 'Analyze_Review_Loop', 'Result_Look']) {
  assert.ok(bakedByName.has(name), `baked mini-program GLB should contain ${name}`)
}
assert.ok(Math.abs(bakedByName.get('Analyze_Loop').duration - 12.8) < 0.1)
assert.ok(Math.abs(bakedByName.get('Analyze_Review_Loop').duration - 10.8) < 0.1)
assert.ok(Math.abs(bakedByName.get('Fail').duration - byName.get('Fail').duration) < 0.03,
  'baked mini-program GLB should preserve the Fail rest')

const previousPlatform = process.env.UNI_PLATFORM
let generatedAssets
try {
  process.env.UNI_PLATFORM = 'mp-weixin'
  const plugin = smartSortRobotAssetsPlugin()
  await plugin.configResolved({})
  generatedAssets = []
  plugin.generateBundle.call({ emitFile: asset => generatedAssets.push(asset) })
} finally {
  if (previousPlatform === undefined) delete process.env.UNI_PLATFORM
  else process.env.UNI_PLATFORM = previousPlatform
}
const metaAsset = generatedAssets.find(asset => asset.fileName.endsWith('/model-meta.js'))
assert.ok(metaAsset, 'mini-program packaging should emit model metadata')
const generatedMeta = JSON.parse(metaAsset.source.replace(/^module\.exports = /, ''))
assert.deepEqual(generatedMeta.sequences, ROBOT_SEQUENCES,
  'mini-program metadata should serialize the shared robot sequences')
assert.deepEqual(generatedMeta.loops, ROBOT_LOOP_CLIPS,
  'mini-program metadata should serialize the shared looping clips')

function loadNativePlayer() {
  let component
  const meta = {
    center: baked.center,
    src: '/static/robot.glb',
    sequences: ROBOT_SEQUENCES,
    loops: ROBOT_LOOP_CLIPS
  }
  runInNewContext(xrSource, {
    require: () => meta,
    Component: definition => { component = definition }
  })
  assert.ok(component, 'mini-program XR component should register')
  return component
}

function createNativeInstance(component, state, reducedMotion = false) {
  const instance = {
    ...component.methods,
    properties: { robotState: state, reducedMotion, width: 240, height: 218 },
    dead: false,
    failed: false,
    version: 0,
    camera: null,
    played: [],
    paused: [],
    events: [],
    triggerEvent(name) { this.events.push(name) },
    setData() {},
    animator: null
  }
  let stopListener = null
  instance.animator = {
    el: { event: {
      add(_name, listener) { stopListener = listener },
      remove(_name, listener) { if (stopListener === listener) stopListener = null }
    } },
    play(name) { instance.played.push(name) },
    stop() {},
    pauseToFrame(name, frame) { instance.paused.push([name, frame]) }
  }
  instance.emitStop = name => {
    assert.ok(stopListener, `expected an anim-stop listener for ${name}`)
    const listener = stopListener
    listener({ name })
  }
  return instance
}

const native = loadNativePlayer()
const reviewPlayer = createNativeInstance(native, 'reviewing')
reviewPlayer.updateState()
assert.deepEqual(reviewPlayer.played, ['Analyze_Confirm'])
reviewPlayer.emitStop('Analyze_Confirm')
assert.deepEqual(reviewPlayer.played, ['Analyze_Confirm', 'Analyze_Review_Loop'])
reviewPlayer.emitStop('Analyze_Review_Loop')
assert.equal(reviewPlayer.played.at(-1), 'Analyze_Review_Loop', 'reviewing should keep looping')
assert.equal(reviewPlayer.events.includes('settled'), false, 'reviewing loop should never settle')

const successPlayer = createNativeInstance(native, 'success')
successPlayer.updateState()
for (const clip of ['Resolve', 'Success', 'Result_Look']) successPlayer.emitStop(clip)
assert.deepEqual(successPlayer.played, ['Resolve', 'Success', 'Result_Look'])
assert.deepEqual(successPlayer.paused, [['Result_Look', 1]], 'success should hold the final look pose')
assert.equal(successPlayer.events.includes('settled'), false, 'settled waits for the next frame')
successPlayer.handleTick()
assert.equal(successPlayer.events.filter(event => event === 'settled').length, 1,
  'success settles after Result_Look and the following frame')

const failLoopPlayer = createNativeInstance(native, 'fail-loop')
failLoopPlayer.updateState()
failLoopPlayer.emitStop('Resolve')
failLoopPlayer.emitStop('Fail')
assert.deepEqual(failLoopPlayer.played, ['Resolve', 'Fail', 'Fail'], 'fail-loop should repeat Fail')
assert.equal(failLoopPlayer.events.includes('settled'), false)

const reducedPlayer = createNativeInstance(native, 'success', true)
reducedPlayer.updateState()
assert.deepEqual(reducedPlayer.played, ['Idle_Reduced'], 'reduced motion should skip animated sequences')
reducedPlayer.handleTick()
assert.equal(reducedPlayer.events.filter(event => event === 'settled').length, 1,
  'reduced-motion terminal states should still settle')

console.log('smart-sort robot performance checks passed')
