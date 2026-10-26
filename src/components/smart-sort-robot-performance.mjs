import * as THREE from 'three'

// Author joint motion once; the same clips are baked into the WeChat GLB.
export function refineRecognitionMotion(animations, model) {
  const analyze = animations.find(clip => clip.name === 'Analyze_Loop')?.clone()
  if (!analyze || !model) return
  const smooth = t => t * t * (3 - 2 * t)
  const curve = (time, keys) => {
    for (let i = 1; i < keys.length; i++) {
      if (time <= keys[i][0]) {
        const [start, from] = keys[i - 1], [end, to] = keys[i]
        return from + (to - from) * smooth(THREE.MathUtils.clamp((time - start) / (end - start), 0, 1))
      }
    }
    return keys[keys.length - 1][1]
  }
  const radians = THREE.MathUtils.degToRad
  const build = (name, duration, pose, source = null) => {
    // Use a bounded sample rate so the mini-program model stays compact.
    const samples = Math.ceil(duration * 30)
    const times = Array.from({ length: samples + 1 }, (_, i) => duration * i / samples)
    const tracks = new Map()
    if (source) {
      for (const track of source.tracks) {
        const interpolant = track.createInterpolant()
        const values = times.flatMap(time => {
          const sourceTime = source.name === 'Analyze_Enter'
            ? time / duration * source.duration : time === duration ? 0 : time % source.duration
          return Array.from(interpolant.evaluate(sourceTime))
        })
        tracks.set(track.name, new track.constructor(track.name, times, values))
      }
    }
    const add = (name, property, sample) => {
      const node = model.getObjectByName(name)
      if (!node) return
      const base = node[property].clone()
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
      tracks.set(`${name}.${property}`, new Track(`${name}.${property}`, times,
        times.flatMap(time => sample(time, base, node).toArray())))
    }
    const rotate = (name, sample) => add(name, 'quaternion', (time, base) => {
      const [pitch, yaw, roll] = sample(time)
      return base.clone().multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(radians(pitch), radians(yaw), radians(roll), 'YXZ')))
    })
    pose({ add, rotate })
    const clip = new THREE.AnimationClip(name, duration, [...tracks.values()]).optimize()
    const index = animations.findIndex(item => item.name === name)
    if (index < 0) animations.push(clip)
    else animations[index] = clip
  }
  const joints = (tools, gaze, duration, blinkAt = []) => {
    const { add, rotate } = tools
    rotate('HeadRoot', gaze)
    add('HeadRoot', 'position', (time, base) => base.clone())
    add('RobotRoot', 'position', (time, base) => base.clone().add(
      new THREE.Vector3(0, 0.009 * Math.sin(time * Math.PI * 2 / duration), 0)))
    add('BodyRoot', 'scale', (time, base) => base.clone().multiplyScalar(1 + 0.003 * Math.sin(time * Math.PI * 2 / duration)))
    rotate('SproutRoot', time => [0, 0, -gaze(Math.max(0, time - 0.10))[2] * 0.8])
    for (const [side, direction] of [['L', 1], ['R', -1]]) {
      add(`Ear${side}Root`, 'scale', (time, base) => base.clone().multiplyScalar(
        1 + 0.018 * Math.sin(Math.PI * time / duration) * direction))
      for (const suffix of ['', 'Highlight', 'Veins']) {
        rotate(`Leaf${side}${suffix}`, time => [0, 0, -gaze(Math.max(0, time - 0.16))[2] * 0.5])
      }
      for (const suffix of ['', 'Glow']) {
        const name = `Eye${side}${suffix}`
        const eye = model.getObjectByName(name)
        eye?.geometry?.computeBoundingBox()
        const center = eye?.geometry?.boundingBox?.getCenter(new THREE.Vector3()) || new THREE.Vector3()
        add(name, 'position', (time, base, node) => {
          const blink = Math.max(0, ...blinkAt.map(at => 1 - Math.abs(time - at) / 0.13))
          const [pitch, yaw] = gaze(time)
          return base.clone().add(new THREE.Vector3(yaw * 0.002, -pitch * 0.0015, 0))
            .add(center.clone().multiply(new THREE.Vector3(0, node.scale.y * 0.88 * blink, 0)))
        })
        add(name, 'scale', (time, base) => {
          const blink = Math.max(0, ...blinkAt.map(at => 1 - Math.abs(time - at) / 0.13))
          return base.clone().multiply(new THREE.Vector3(1, 1 - 0.88 * blink, 1))
        })
      }
    }
  }
  // Observe the photo, hold a thinking pose, briefly check in, then look back.
  const observing = time => [
    curve(time, [[0, 9], [2.8, 12], [4.3, 7], [6.8, 11], [8.5, 0], [9.8, 0], [11, 9], [12.8, 9]]),
    curve(time, [[0, 0], [1.3, -11], [2, -11], [3.4, 10], [4.1, 10], [5.2, -3], [7, -3], [8.5, 0], [10, 0], [11.5, 0], [12.8, 0]]),
    curve(time, [[0, 0], [3.8, 0], [5.2, 8], [6.5, 8], [8.5, 0], [12.8, 0]])
  ]
  build('Analyze_Enter', 0.65, tools => joints(tools, time => [9 * smooth(time / 0.65), 0, 0], 0.65),
    animations.find(clip => clip.name === 'Analyze_Enter'))
  build('Analyze_Loop', 12.8, tools => joints(tools, observing, 12.8, [3.8, 9.1]), analyze)
  build('Analyze_Confirm', 0.9, tools => joints(tools, time => [
    curve(time, [[0, 9], [0.24, 17], [0.48, 6], [0.7, 11], [0.9, 9]]), 0, 0
  ], 0.9), analyze)
  build('Analyze_Review_Loop', 10.8, tools => joints(tools, time => [
    curve(time, [[0, 9], [2.4, 10], [5.2, 8], [7.5, 0], [8.5, 0], [10, 9], [10.8, 9]]),
    curve(time, [[0, 0], [2, -5], [3.5, -5], [5.8, 5], [7.5, 0], [10.8, 0]]),
    curve(time, [[0, 0], [2.5, -6], [4, -6], [6.6, 0], [10.8, 0]])
  ], 10.8, [4.2, 8]), analyze)
  build('Result_Look', 0.85, tools => joints(tools, time => [
    curve(time, [[0, 0], [0.35, 12], [0.6, 7], [0.85, 9]]),
    curve(time, [[0, 0], [0.65, -5], [0.85, -5]]), 0
  ], 0.85))
  // Preserve the existing eye-opening welcome, with a small attentive head lift.
  const wake = animations.find(clip => clip.name === 'Wake')
  if (wake) {
    const head = model.getObjectByName('HeadRoot')
    if (head) {
      const times = [0, 0.22, 0.45, wake.duration]
      const values = [0, -5, -2, 0].flatMap(pitch => head.quaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), radians(pitch))).toArray())
      wake.tracks = wake.tracks.filter(track => track.name !== 'HeadRoot.quaternion')
      wake.tracks.push(new THREE.QuaternionKeyframeTrack('HeadRoot.quaternion', times, values))
    }
  }
  // A neutral pause separates failure gestures instead of shaking continuously.
  const fail = animations.find(clip => clip.name === 'Fail')
  if (fail) {
    fail.duration += 1.1
    fail.tracks = fail.tracks.map(track => new track.constructor(track.name,
      [...track.times, fail.duration], [...track.values, ...track.values.slice(-track.getValueSize())]))
  }
}
