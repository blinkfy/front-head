import * as THREE from 'three'

// 调整模型内部的待机轨道，不给页面或整只机器人叠加晃动效果。
export function refineIdleMotion(animations, model, { reducedMotion = false } = {}) {
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y
  const yAxis = new THREE.Vector3(0, 1, 0)
  const zAxis = new THREE.Vector3(0, 0, 1)
  const degrees = THREE.MathUtils.degToRad
  const smooth = value => value * value * (3 - 2 * value)
  const wave = (time, delay, duration) => Math.sin((time - delay) * Math.PI * 2 / duration)
  const leafNodes = side => [`Leaf${side}`, `Leaf${side}Highlight`, `Leaf${side}Veins`]

  function build(clip, duration, describe) {
    if (!clip) return
    const times = []
    const count = Math.ceil(duration * 60)
    for (let index = 0; index <= count; index++) times.push(duration * index / count)
    const tracks = []
    const add = (name, property, sample) => {
      const node = model.getObjectByName(name)
      if (!node) return
      const base = node[property].clone()
      const values = times.flatMap(time => sample(time, base).toArray())
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
      tracks.push(new Track(`${node.name}.${property}`, times, values))
    }
    const rotate = (name, sample) => add(name, 'quaternion', (time, base) => {
      const [turn, tilt] = sample(time)
      return base.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, degrees(turn)))
        .multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, degrees(tilt)))
    })
    const scale = (name, sample) => add(name, 'scale', (time, base) => {
      const factor = sample(time)
      return base.clone().multiply(new THREE.Vector3(...factor))
    })
    describe({ add, rotate, scale })
    clip.tracks = tracks
    clip.duration = duration
  }

  const idle = animations.find(clip => clip.name === 'Idle_Base')
  const duration = idle?.duration || 3.2
  build(idle, duration, ({ add, rotate, scale }) => {
    // 整体仅 ±0.4% 模型高度；明显的反馈来自局部关节。
    add('RobotRoot', 'position', (time, base) => base.clone().add(new THREE.Vector3(0,
      reducedMotion ? 0 : height * 0.004 * wave(time, 0, duration), 0)))
    scale('BodyRoot', time => {
      const breath = (reducedMotion ? 0.003 : 0.004) * (1 + wave(time, 0, duration))
      return [1 + breath * 0.5, 1 + breath, 1 + breath * 0.5]
    })
    rotate('HeadRoot', time => reducedMotion ? [0, 0]
      : [2 * wave(time, 0.08, duration), 2.25 * wave(time, 0.04, duration)])
    rotate('SproutRoot', time => [0, reducedMotion ? 0 : 5.5 * wave(time, 0.10, duration)])
    for (const [side, angle, delay] of [['L', 8, 0.14], ['R', 11, 0.16]]) {
      for (const name of leafNodes(side)) rotate(name, time => [0, reducedMotion ? 0 : angle * wave(time, delay, duration)])
    }
    for (const [name, direction] of [['EarLRoot', 1], ['EarRRoot', -1]]) {
      scale(name, time => {
        const ear = reducedMotion ? 1 : 1 + 0.0125 * (1 + direction * wave(time, 0.08, duration))
        return [ear, ear, ear]
      })
    }
  })

  // 40–160ms 局部延迟，头部到位后停顿 350ms，再平滑回正。
  const curious = (time, delay) => {
    const t = time - delay
    if (t <= 0 || t >= 1.16) return 0
    if (t < 0.28) return smooth(t / 0.28)
    if (t <= 0.63) return 1
    return 1 - smooth((t - 0.63) / 0.53)
  }
  build(animations.find(clip => clip.name === 'Idle_Curious'), 1.4, ({ add, rotate, scale }) => {
    add('RobotRoot', 'position', (time, base) => base.clone())
    scale('BodyRoot', () => [1, 1, 1])
    add('HeadRoot', 'position', (time, base) => base.clone())
    rotate('HeadRoot', time => [3 * curious(time, 0.04), 4 * curious(time, 0.04)])
    rotate('SproutRoot', time => [0, -9 * curious(time, 0.10)])
    for (const [side, angle, delay] of [['L', 3, 0.14], ['R', 4, 0.16]]) {
      for (const name of leafNodes(side)) rotate(name, time => [0, angle * curious(time, delay)])
    }
    for (const [name, delay] of [['EarLRoot', 0.05], ['EarRRoot', 0.11]]) {
      scale(name, time => {
        const progress = THREE.MathUtils.clamp((time - delay) / 0.28, 0, 1)
        const ear = 1 + 0.025 * Math.sin(Math.PI * progress)
        return [ear, ear, ear]
      })
    }
    for (const name of ['EyeL', 'EyeR', 'EyeLGlow', 'EyeRGlow']) {
      add(name, 'position', (time, base) => base.clone().add(new THREE.Vector3(-0.015 * curious(time, 0.08), 0, 0)))
    }
  })
}
