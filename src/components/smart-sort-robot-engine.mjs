import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { refineIdleMotion } from './smart-sort-robot-idle.mjs'

const CLIPS = {
  idle: ['Return_Idle', 'Idle_Base'],
  tap: ['Tap_Response', 'Idle_Base'],
  uploading: ['Upload_Enter', 'Upload_Loop'],
  processing: ['Analyze_Enter', 'Analyze_Loop'],
  success: ['Resolve', 'Success'],
  fail: ['Resolve', 'Fail']
}
const LOOP_CLIPS = new Set(['Idle_Base', 'Upload_Loop', 'Analyze_Loop'])

// 只重采样 Success 的主体轨道，保留原模型的表情、嫩芽和成功特效。
export function refineSuccessMotion(clip) {
  if (!clip) return
  const trackFor = (node, property) => clip.tracks.find(track => {
    const binding = THREE.PropertyBinding.parseTrackName(track.name)
    return binding.nodeName === node && binding.propertyName === property
  })
  const position = trackFor('RobotRoot', 'position')
  const rotation = trackFor('RobotRoot', 'quaternion')
  const scale = trackFor('BodyRoot', 'scale')
  if (!position || !rotation || !scale) return

  const smooth = value => value * value * (3 - 2 * value)
  const curve = (time, keys) => {
    for (let index = 1; index < keys.length; index++) {
      if (time <= keys[index][0]) {
        const [start, from] = keys[index - 1]
        const [end, to] = keys[index]
        return from + (to - from) * smooth((time - start) / (end - start))
      }
    }
    return keys[keys.length - 1][1]
  }
  const times = [], positions = [], rotations = [], scales = []
  const basePosition = Array.from(position.values.slice(0, 3))
  const baseRotation = new THREE.Quaternion().fromArray(rotation.values)
  const baseScale = Array.from(scale.values.slice(0, 3))
  const yaw = new THREE.Quaternion(), lean = new THREE.Quaternion()
  const yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1)
  const samples = Math.ceil(clip.duration * 60)
  for (let index = 0; index <= samples; index++) {
    const time = clip.duration * index / samples
    const t = time * 1.7 / clip.duration
    const flight = THREE.MathUtils.clamp((t - 0.18) / 0.92, 0, 1)
    // 腾空使用抛物线：起跳快、顶点减速、落地加速；轻微横向弧线打破原地直上直下。
    const airborne = t >= 0.18 && t <= 1.10
    const height = airborne ? 4 * 0.27 * flight * (1 - flight)
      : curve(t, [[0, 0], [0.12, -0.04], [0.18, 0], [1.10, 0], [1.18, -0.035], [1.30, 0.035], [1.44, 0], [1.56, -0.003], [1.7, 0]])
    positions.push(basePosition[0] + (airborne ? 0.065 * Math.sin(Math.PI * flight) : 0), basePosition[1] + height, basePosition[2])
    // 转身在腾空阶段加速后减速，落地前朝向恢复，避免匀速机械转圈。
    const spin = THREE.MathUtils.clamp((t - 0.24) / 0.80, 0, 1)
    const spinEase = spin * spin * spin * (spin * (spin * 6 - 15) + 10)
    yaw.setFromAxisAngle(yAxis, Math.PI * 2 * spinEase)
    lean.setFromAxisAngle(zAxis, airborne ? 0.055 * Math.sin(Math.PI * 2 * flight) : 0)
    rotations.push(...baseRotation.clone().multiply(yaw).multiply(lean).toArray())
    const stretch = curve(t, [[0, 1], [0.12, 0.90], [0.18, 0.96], [0.27, 1.07], [0.55, 1], [1.10, 1], [1.18, 0.90], [1.30, 1.04], [1.44, 0.99], [1.7, 1]])
    const width = 1 / Math.sqrt(stretch)
    scales.push(baseScale[0] * width, baseScale[1] * stretch, baseScale[2] * width)
    times.push(time)
  }
  const replace = (original, Track, values) => {
    clip.tracks[clip.tracks.indexOf(original)] = new Track(original.name, times, values)
  }
  replace(position, THREE.VectorKeyframeTrack, positions)
  replace(rotation, THREE.QuaternionKeyframeTrack, rotations)
  replace(scale, THREE.VectorKeyframeTrack, scales)
}

// 失败以清晰的低头、摇头反馈；面部缩放围绕几何中心，避免眼睛和嘴漂移。
export function refineFailMotion(clip, model) {
  if (!clip || !model) return
  model.updateMatrixWorld(true)
  const nodes = new Map()
  model.traverse(node => { if (node.name) nodes.set(node.name, node) })
  const head = nodes.get('HeadRoot'), mouth = nodes.get('Mouth'), frown = nodes.get('FX_FailMouth')
  if (!head || !mouth || !frown) return
  // 问号在首页只占几个像素：使用独立的高对比材质，避免发光把白色符号融进黄底。
  for (const [name, color] of [['FX_FailBadge', 0xeea91f], ['FX_FailQuestion', 0x4b2e08]]) {
    nodes.get(name)?.traverse(node => {
      if (!node.isMesh) return
      const readable = original => {
        const material = original.clone()
        material.color.setHex(color)
        material.emissive.setHex(0x000000)
        material.metalness = 0
        material.roughness = 1
        material.opacity = 1
        material.transparent = false
        return material
      }
      node.material = Array.isArray(node.material) ? node.material.map(readable) : readable(node.material)
    })
  }
  const smooth = value => value * value * (3 - 2 * value)
  const curve = (t, keys) => {
    for (let index = 1; index < keys.length; index++) {
      if (t <= keys[index][0]) {
        const [start, from] = keys[index - 1], [end, to] = keys[index]
        return from + (to - from) * smooth(THREE.MathUtils.clamp((t - start) / (end - start), 0, 1))
      }
    }
    return keys[keys.length - 1][1]
  }
  const centers = new Map()
  const geometryCenter = node => {
    if (!centers.has(node)) {
      node.geometry?.computeBoundingBox()
      centers.set(node, node.geometry?.boundingBox?.getCenter(new THREE.Vector3()) || new THREE.Vector3())
    }
    return centers.get(node).clone()
  }
  const samples = Math.ceil(clip.duration * 60)
  const times = Array.from({ length: samples + 1 }, (_, index) => clip.duration * index / samples)
  const tracks = new Map()
  const append = (node, property, value) => {
    const name = `${node.name}.${property}`
    if (!tracks.has(name)) tracks.set(name, [])
    tracks.get(name).push(...value.toArray())
  }
  const scaledAtCenter = (node, factor) => {
    const scale = node.scale.clone().multiply(factor)
    const position = node.position.clone().add(geometryCenter(node).multiply(node.scale.clone().sub(scale)))
    append(node, 'scale', scale)
    append(node, 'position', position)
  }
  // 嘴角沿 HeadRoot 的变换运动，即使 FXRoot 与 HeadRoot 不在同一层级也能贴合脸部。
  const parentToFx = new THREE.Matrix4().copy(frown.parent.matrixWorld).invert().multiply(head.parent.matrixWorld)
  const restHeadToFx = new THREE.Matrix4().copy(frown.parent.matrixWorld).invert().multiply(head.matrixWorld)
  const mouthWorldCenter = geometryCenter(mouth).applyMatrix4(mouth.matrixWorld)
  const frownPosition = frown.position.clone()
  frownPosition.y = mouthWorldCenter.applyMatrix4(frown.parent.matrixWorld.clone().invert()).y
  const frownInHead = frownPosition.clone().applyMatrix4(restHeadToFx.clone().invert())
  const restRotationInverse = new THREE.Quaternion().setFromRotationMatrix(restHeadToFx.clone().extractRotation(restHeadToFx)).invert()
  const radians = THREE.MathUtils.degToRad
  for (const time of times) {
    const t = time / clip.duration
    const expression = curve(t, [[0, 0], [0.20, 1], [0.70, 1], [1, 0]])
    const yaw = curve(t, [[0, 0], [0.22, -12], [0.43, 12], [0.62, -8], [0.78, 3], [1, 0]])
    const headRotation = head.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(radians(6.5 * expression), radians(yaw), radians(yaw * 0.22 - 0.8 * expression), 'YXZ')
    ))
    const headPosition = head.position.clone().add(new THREE.Vector3(0, -0.025 * expression, 0))
    append(head, 'quaternion', headRotation)
    append(head, 'position', headPosition)
    for (const name of ['RobotRoot', 'BodyRoot']) {
      const node = nodes.get(name)
      if (!node) continue
      if (name === 'RobotRoot') append(node, 'position', node.position.clone().add(new THREE.Vector3(0, -0.012 * expression, 0)))
      else append(node, 'quaternion', node.quaternion)
    }
    for (const name of ['EyeL', 'EyeR', 'EyeLGlow', 'EyeRGlow']) {
      const node = nodes.get(name)
      if (!node) continue
      scaledAtCenter(node, new THREE.Vector3(1, 1 - 0.35 * expression, 1))
      append(node, 'quaternion', node.quaternion)
    }
    for (const name of ['Mouth', 'MouthGlow']) {
      const node = nodes.get(name)
      if (node) scaledAtCenter(node, new THREE.Vector3().setScalar(1 - 0.98 * expression))
    }
    const headToFx = parentToFx.clone().multiply(new THREE.Matrix4().compose(headPosition, headRotation, head.scale))
    append(frown, 'position', frownInHead.clone().applyMatrix4(headToFx))
    append(frown, 'quaternion', new THREE.Quaternion().setFromRotationMatrix(headToFx.clone().extractRotation(headToFx))
      .multiply(restRotationInverse).multiply(frown.quaternion))
    append(frown, 'scale', frown.scale.clone().setScalar(Math.max(0.001, 1.1 * expression)))
    for (const [name, size, depth] of [['FX_FailBadge', 1.6, 0.79], ['FX_FailQuestion', 1.7, 0.86]]) {
      const node = nodes.get(name)
      if (!node) continue
      append(node, 'position', new THREE.Vector3(1.36, 1.22, depth))
      append(node, 'scale', new THREE.Vector3().setScalar(Math.max(0.001, size * expression)))
    }
    for (const [name, angle] of [['SproutRoot', 12], ['LeafL', 8], ['LeafLHighlight', 8], ['LeafLVeins', 8], ['LeafR', -10], ['LeafRHighlight', -10], ['LeafRVeins', -10]]) {
      const node = nodes.get(name)
      if (!node) continue
      const lagged = curve(Math.max(0, t - 0.05), [[0, 0], [0.20, 1], [0.60, -0.4], [0.95, 0]])
      append(node, 'quaternion', node.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), radians(angle * lagged))))
    }
  }
  const replaced = new Set(tracks.keys())
  clip.tracks = clip.tracks.filter(track => !replaced.has(track.name))
  for (const [name, values] of tracks) {
    const Track = name.endsWith('.quaternion') ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
    clip.tracks.push(new Track(name, times, values))
  }
}

function disposeModel(root) {
  const materials = new Set()
  const textures = new Set()
  root?.traverse(object => {
    object.geometry?.dispose()
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    objectMaterials.forEach(material => {
      if (!material || materials.has(material)) return
      materials.add(material)
      Object.values(material).forEach(value => {
        if (value?.isTexture) textures.add(value)
      })
    })
  })
  textures.forEach(texture => texture.dispose())
  materials.forEach(material => material.dispose())
}

export function mountSmartSortRobot(host, { modelUrl, modelBuffer, state, active, onFirstFrame, onSettled, onError }) {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;width:100%;height:100%;pointer-events:none'
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true })
  if (!context) throw new Error('WebGL2 unavailable')

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'low-power' })
  } catch (error) {
    context.getExtension('WEBGL_lose_context')?.loseContext()
    throw error
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.setClearColor(0x000000, 0)
  host.appendChild(canvas)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x94bfb2, 1.25))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(3, 5, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x9deaff, 0.8)
  fill.position.set(-4, 2, 3)
  scene.add(fill)
  const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.25, -2.25, 0.1, 100)
  camera.position.set(0, 0, 8)
  camera.lookAt(0, 0, 0)

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false
  let model = null
  let mixer = null
  let actions = new Map()
  let currentAction = null
  let queue = []
  let currentState = state
  let frame = 0
  let previousFrame = 0
  let disposed = false
  let firstFrame = false
  let isActive = active
  let nextBlinkMoment = 0
  let nextCuriousMoment = 0
  let settledAfterRender = false

  const resize = () => {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    const halfHeight = currentState === 'success' && !reducedMotion ? 3.0 : 2.38
    // 成功动画扩大画布与镜头视野的比例一致，保留跳跃空间且不缩小主体。
    const viewportScale = halfHeight / 2.38
    renderer.setSize(width * viewportScale, height * viewportScale, false)
    canvas.style.width = `${viewportScale * 100}%`
    canvas.style.height = `${viewportScale * 100}%`
    camera.left = -halfHeight * width / height
    camera.right = halfHeight * width / height
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
  }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  resizeObserver?.observe(host)
  if (!resizeObserver) window.addEventListener('resize', resize)
  resize()

  const playNext = () => {
    const name = queue.shift()
    if (!name) return
    const next = actions.get(name)
    if (!next) return playNext()
    if (currentAction && currentAction !== next) currentAction.fadeOut(0.1)
    if (currentAction === next) currentAction.stop()
    next.reset()
    next.enabled = true
    const loop = LOOP_CLIPS.has(name)
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = !loop
    next.setEffectiveTimeScale(reducedMotion ? 0.35 : 1)
    next.fadeIn(0.1).play()
    currentAction = next
    if (name === 'Idle_Base') {
      if (!nextBlinkMoment) nextBlinkMoment = performance.now() + 3000 + Math.random() * 2500
      if (!nextCuriousMoment) nextCuriousMoment = performance.now() + 8000 + Math.random() * 6000
      if (currentState === 'success' || currentState === 'fail') settledAfterRender = true
      if (currentState === 'tap') {
        currentState = 'idle'
        resize()
      }
    }
  }
  const finished = event => {
    if (event.action !== currentAction) return
    if (!queue.length && (currentState === 'success' || currentState === 'fail')) settledAfterRender = true
    else playNext()
  }
  const setState = nextState => {
    if (disposed) return
    if (!CLIPS[nextState] || nextState === currentState && currentAction) return
    currentState = nextState
    settledAfterRender = false
    if (!mixer) return
    actions.get('Idle_Blink')?.stop()
    actions.get('Idle_Curious')?.stop()
    queue = reducedMotion
      ? ['Idle_Base']
      : [...CLIPS[nextState]]
    resize()
    playNext()
  }
  const render = timestamp => {
    frame = 0
    if (disposed || !isActive || document.hidden || !model) return
    const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.05) : 0
    previousFrame = timestamp
    mixer.update(delta)
    if (!reducedMotion && currentState === 'idle' &&
      (currentAction === actions.get('Idle_Base') || currentAction === actions.get('Idle_Curious'))) {
      if (timestamp >= nextBlinkMoment) {
        actions.get('Idle_Blink')?.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play()
        nextBlinkMoment = timestamp + 3000 + Math.random() * 2500
      }
      if (currentAction === actions.get('Idle_Base') && timestamp >= nextCuriousMoment) {
        nextCuriousMoment = timestamp + 8000 + Math.random() * 6000
        queue = ['Idle_Curious', 'Idle_Base']
        playNext()
      }
    }
    try {
      renderer.render(scene, camera)
      if (!firstFrame) {
        firstFrame = true
        onFirstFrame?.()
      }
      if (settledAfterRender) {
        settledAfterRender = false
        onSettled?.()
      }
      frame = requestAnimationFrame(render)
    } catch (error) {
      onRenderError(error)
    }
  }
  let onRenderError = error => {
    dispose()
    onError?.(error)
  }
  const onContextLost = event => {
    event.preventDefault()
    onRenderError(new Error('WebGL context lost'))
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  const setActive = value => {
    if (disposed) return
    isActive = value
    if (!isActive || document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
      previousFrame = 0
    } else if (!frame && model) {
      frame = requestAnimationFrame(render)
    }
  }
  const onVisibilityChange = () => setActive(isActive)
  document.addEventListener('visibilitychange', onVisibilityChange)
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    resizeObserver?.disconnect()
    if (!resizeObserver) window.removeEventListener('resize', resize)
    mixer?.removeEventListener('finished', finished)
    mixer?.stopAllAction()
    if (model) {
      mixer?.uncacheRoot(model)
      disposeModel(model)
    }
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }

  const loader = new GLTFLoader()
  const modelRequest = modelBuffer ? loader.parseAsync(modelBuffer, '') : loader.loadAsync(modelUrl)
  modelRequest.then(gltf => {
    if (disposed) {
      disposeModel(gltf.scene)
      return
    }
    model = gltf.scene
    const bounds = new THREE.Box3().setFromObject(model)
    const center = bounds.getCenter(new THREE.Vector3())
    const holder = new THREE.Group()
    holder.position.copy(center).multiplyScalar(-1)
    holder.add(model)
    scene.add(holder)
    refineIdleMotion(gltf.animations, model, { reducedMotion })
    refineSuccessMotion(gltf.animations.find(clip => clip.name === 'Success'))
    refineFailMotion(gltf.animations.find(clip => clip.name === 'Fail'), model)
    mixer = new THREE.AnimationMixer(model)
    actions = new Map(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]))
    mixer.addEventListener('finished', finished)
    if (currentState === 'idle' && !reducedMotion) {
      queue = ['Wake', 'Idle_Base']
      playNext()
    } else {
      const initialState = currentState
      currentState = ''
      setState(initialState)
    }
    if (isActive && !document.hidden) frame = requestAnimationFrame(render)
  }).catch(onRenderError)
  return { setState, setActive, dispose }
}
