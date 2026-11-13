import { createIdentityActionSequence } from './identity-action-sequence.mjs'
import { identityFaceFrame, createIdentityFramingGuard, shuffledIdentityLights, identityLightResponse } from './identity-camera-checks.mjs'

// Shared by native adapters. This assists capture; only the server may verify identity.
export function createIdentityNativeFlow(actions) {
  actions = Array.isArray(actions) && actions.length === 2 && new Set(actions).size === 2 && actions.every(a => ['blink', 'mouth'].includes(a)) ? actions.slice() : ['blink', 'mouth']
  let sequence = createIdentityActionSequence(actions), guard = createIdentityFramingGuard()
  let phase = 'actions', aligned = false, light = true, baseline = [], stages = [], stage = 0, started = 0, settled = 0, progress = 0, feedback = 'not_run'
  const white = () => light ? '#ffffff' : '#edf1f3'
  const settle = time => { phase = 'settle'; started = time; settled = 0 }
  const reset = () => { sequence = createIdentityActionSequence(actions); phase = 'actions'; aligned = false; baseline = []; stages = []; progress = 0; feedback = 'not_run' }
  return {
    toggleLight(time) {
      light = !light
      if (phase === 'light' || phase === 'settle') { feedback = 'not_run'; settle(time) }
      return { fill: white(), light }
    },
    update(frame, time) {
      const framing = frame.count === 1 ? identityFaceFrame(frame.points, frame.video, frame.viewport, { tracking: aligned && phase === 'actions' })
        : { ready: false, hint: frame.count > 1 ? '请本人独自入镜' : '请将脸部放入框内' }
      const tracking = guard.update(frame.count, framing.ready, time)
      if (tracking.paused) {
        sequence.pause()
        if (tracking.reset) reset()
        if (phase === 'light') { stages[stage].samples = []; started = time }
        if (phase === 'settle') { started = time; settled = 0 }
        return { title: framing.hint, detail: tracking.reset ? '调整后重新开始动作' : '请缓慢调整，保持脸部完整清晰', progress, ready: false, fill: phase === 'light' ? stages[stage].color.fill : white(), light }
      }
      aligned = true
      if (tracking.resumed && phase !== 'actions') { started = time; settled = 0; if (phase === 'light') stages[stage].samples = [] }
      const blink = frame.blink, mouth = frame.mouth
      if (!Number.isFinite(blink) || !Number.isFinite(mouth)) throw new Error('无法检测动作，请重新拍摄')
      const result = { ready: true, light, fill: white(), progress: 2, title: '请保持不动', detail: '恢复自然表情，马上为你拍摄' }
      if (phase === 'actions') {
        if (light && frame.color && blink < .25 && mouth < .25) { baseline.push(frame.color); if (baseline.length > 6) baseline.shift() }
        const state = sequence.update(blink, mouth, time)
        progress = state.index; result.progress = progress
        result.title = state.neutral === false ? '请正对镜头' : state.index < actions.length ? actions[state.index] === 'blink' ? '请缓慢眨眼' : '请张开嘴巴' : '动作已完成'
        result.detail = state.neutral === false ? '睁开双眼，闭上嘴巴，准备开始' : actions[state.index] === 'blink' ? '闭上双眼，再缓缓睁开' : '张开嘴巴，再自然闭合'
        if (state.done) {
          if (light) { phase = 'light'; stages = shuffledIdentityLights().map(color => ({ color, samples: [] })); stage = 0; started = time }
          else settle(time)
        }
      } else if (phase === 'light') {
        if (frame.color && time - started >= 300 && stages[stage].samples.length < 8) stages[stage].samples.push(frame.color)
        if (time - started >= 800) {
          stage++
          if (stage < stages.length) started = time
          else { feedback = identityLightResponse(baseline, stages).status; settle(time) }
        }
      } else if (phase === 'settle') {
        settled = time - started >= 900 && blink < .25 && mouth < .25 ? settled + 1 : 0
        if (settled >= 3) { result.capture = true; result.lightFeedback = feedback }
      }
      if (phase === 'light') { result.fill = stages[stage].color.fill; result.title = '请保持不动'; result.detail = '柔光调整中，请继续正对镜头' }
      return result
    }
  }
}
