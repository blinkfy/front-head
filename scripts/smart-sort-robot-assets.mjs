import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ROBOT_MP_PACKAGE_NAME } from '../src/components/smart-sort-robot-mp.mjs'
import { refineIdleMotion } from '../src/components/smart-sort-robot-idle.mjs'
import { refineSuccessMotion, refineFailMotion } from '../src/components/smart-sort-robot-engine.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = path.join(root, 'src/static/web/robot_3d/smart_sort_robot_v34_animated.glb')
const xrRoot = `${ROBOT_MP_PACKAGE_NAME}/static/robot_3d`
const xrComponentRoot = 'components/smart-sort-xr'
let bakedPromise

// 保留原 GLB 几何；同步已调好的动画与失败问号的独立材质。
export async function bakeRobotModel() {
  const source = await fs.readFile(modelPath)
  let json, bin
  for (let offset = 12; offset < source.length;) {
    const length = source.readUInt32LE(offset)
    const type = source.readUInt32LE(offset + 4)
    const chunk = source.subarray(offset + 8, offset + 8 + length)
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
    if (type === 0x004e4942) bin = chunk
    offset += length + 8
  }
  if (!json || !bin) throw new Error('Smart sort robot GLB chunks missing')
  const gltf = await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '')
  const center = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3()).toArray()
  refineIdleMotion(gltf.animations, gltf.scene)
  refineSuccessMotion(gltf.animations.find(clip => clip.name === 'Success'))
  refineFailMotion(gltf.animations.find(clip => clip.name === 'Fail'), gltf.scene)
  // 原符号材质被其它特效共用，只为这两个节点追加材质/mesh引用，保留其它效果。
  for (const name of ['FX_FailBadge', 'FX_FailQuestion']) {
    const node = json.nodes.find(item => item.name === name)
    const material = gltf.scene.getObjectByName(name)?.material
    if (node?.mesh === undefined || !material) throw new Error(`Robot badge material missing: ${name}`)
    const mesh = json.meshes[node.mesh]
    const primitives = mesh.primitives.map((primitive, index) => {
      const styled = Array.isArray(material) ? material[index] : material
      const sourceMaterial = json.materials[primitive.material]
      const next = {
        ...sourceMaterial,
        name: `${name}_Readable`,
        pbrMetallicRoughness: {
          ...sourceMaterial.pbrMetallicRoughness,
          baseColorFactor: [...styled.color.toArray(), styled.opacity],
          metallicFactor: styled.metalness,
          roughnessFactor: styled.roughness
        },
        emissiveFactor: styled.emissive.toArray(),
        alphaMode: 'OPAQUE'
      }
      json.materials.push(next)
      return { ...primitive, material: json.materials.length - 1 }
    })
    json.meshes.push({ ...mesh, primitives })
    node.mesh = json.meshes.length - 1
  }
  const reduced = gltf.animations.map(clip => clip.clone())
  refineIdleMotion(reduced, gltf.scene, { reducedMotion: true })
  const reducedIdle = reduced.find(clip => clip.name === 'Idle_Base')
  reducedIdle.name = 'Idle_Reduced'
  gltf.animations.push(reducedIdle)
  const parts = [bin]
  let length = bin.length
  const accessor = (values, type, withBounds = false) => {
    if (length % 4) { const pad = Buffer.alloc(4 - length % 4); parts.push(pad); length += pad.length }
    const raw = Buffer.from(values.buffer, values.byteOffset, values.byteLength)
    const view = json.bufferViews.length
    json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: raw.length })
    parts.push(raw)
    length += raw.length
    const item = { bufferView: view, componentType: 5126, count: values.length / (type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : 1), type }
    if (withBounds) { item.min = [values[0]]; item.max = [values[values.length - 1]] }
    json.accessors.push(item)
    return json.accessors.length - 1
  }
  for (const name of ['Idle_Base', 'Idle_Curious', 'Success', 'Fail', 'Idle_Reduced']) {
    const clip = gltf.animations.find(animation => animation.name === name)
    if (!clip) throw new Error(`Robot animation missing: ${name}`)
    const animation = { name, samplers: [], channels: [] }
    for (const track of clip.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name)
      const node = json.nodes.findIndex(item => item.name === binding.nodeName)
      if (node < 0) throw new Error(`Robot node missing: ${binding.nodeName}`)
      const property = { position: 'translation', quaternion: 'rotation', scale: 'scale' }[binding.propertyName]
      if (!property) throw new Error(`Unsupported robot track: ${track.name}`)
      animation.channels.push({ sampler: animation.samplers.length, target: { node, path: property } })
      animation.samplers.push({ input: accessor(track.times, 'SCALAR', true), output: accessor(track.values, property === 'rotation' ? 'VEC4' : 'VEC3'), interpolation: 'LINEAR' })
    }
    const index = json.animations.findIndex(item => item.name === name)
    if (index < 0) json.animations.push(animation)
    else json.animations[index] = animation
  }
  json.buffers[0].byteLength = length
  let jsonChunk = Buffer.from(JSON.stringify(json))
  if (jsonChunk.length % 4) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(4 - jsonChunk.length % 4, 0x20)])
  let binChunk = Buffer.concat(parts)
  if (binChunk.length % 4) binChunk = Buffer.concat([binChunk, Buffer.alloc(4 - binChunk.length % 4)])
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  binHeader.writeUInt32LE(binChunk.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  return { buffer: Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]), center }
}

export function smartSortRobotAssetsPlugin() {
  let platform, assets = []
  return {
    name: 'smart-sort-robot-platform-assets',
    enforce: 'post',
    async configResolved() {
      platform = process.env.UNI_PLATFORM
      if (platform === 'app' || platform === 'app-plus') {
        const runtime = await build({ entryPoints: [path.join(root, 'src/components/smart-sort-robot-engine.mjs')], bundle: true, write: false, minify: true, format: 'iife', globalName: 'SmartSortRobotRuntime', platform: 'browser', target: 'es2020' })
        assets = [
          { fileName: 'static/app/robot_3d/smart-sort-robot-runtime.js', source: runtime.outputFiles[0].contents },
          { fileName: 'static/app/robot_3d/smart_sort_robot_v34_animated.glb', source: await fs.readFile(modelPath) }
        ]
      } else if (platform === 'mp-weixin') {
        const baked = await (bakedPromise ||= bakeRobotModel())
        assets = [
          { fileName: `${xrRoot}/smart_sort_robot_v34_animated.glb`, source: baked.buffer },
          { fileName: `${xrRoot}/package-ready.js`, source: 'module.exports = { ready: true }' }
        ]
        for (const extension of ['js', 'json', 'wxml', 'wxss']) {
          assets.push({ fileName: `${xrComponentRoot}/index.${extension}`, source: await fs.readFile(path.join(root, `src/components/smart-sort-xr-native/index.${extension}`)) })
        }
        assets.push({ fileName: `${xrComponentRoot}/model-meta.js`, source: `module.exports = ${JSON.stringify({ center: baked.center, src: `/${xrRoot}/smart_sort_robot_v34_animated.glb` })}` })
      }
    },
    generateBundle() {
      for (const asset of assets) this.emitFile({ type: 'asset', ...asset })
    },
    async writeBundle(options) {
      if (platform !== 'mp-weixin') return
      // XR 组件同步注册在主包，引擎不依赖跨分包异步组件上下文；GLB 在分包加载成功后读取。
      const file = path.resolve(options.dir || process.env.UNI_OUTPUT_DIR, 'components/SmartSortRobot3D.json')
      const config = JSON.parse(await fs.readFile(file, 'utf8'))
      config.usingComponents = { ...config.usingComponents, 'smart-sort-xr': `/${xrComponentRoot}/index` }
      if (config.componentPlaceholder) {
        delete config.componentPlaceholder['smart-sort-xr']
        if (!Object.keys(config.componentPlaceholder).length) delete config.componentPlaceholder
      }
      await fs.writeFile(file, JSON.stringify(config), 'utf8')
    }
  }
}
