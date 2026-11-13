import { identityImageQualityIssue, identityImageQualityHint } from './identity-image-quality.mjs'
import { createIdentityBlinkTracker } from './identity-blink.mjs'
import { createIdentityActionSequence } from './identity-action-sequence.mjs'
import { identityFaceFrame, createIdentityFramingGuard, shuffledIdentityLights, identityLightResponse } from './identity-camera-checks.mjs'

// Shared by native adapters. This assists capture; only the server may verify identity.
export function createIdentityNativeFlow(actions) {
  actions = Array.isArray(actions) && actions.length === 2 && new Set(actions).size === 2 && actions.every(a => ['blink', 'mouth'].includes(a)) ? actions.slice() : ['blink', 'mouth']
  const eyes = createIdentityBlinkTracker()
  let sequence = createIdentityActionSequence(actions), guard = createIdentityFramingGuard()
  let phase = 'actions', aligned = false, light = true, baseline = [], stages = [], stage = 0, started = 0, settled = 0, progress = 0, feedback = 'not_run'
  const white = () => light ? '#ffffff' : '#edf1f3'
  const settle = time => { phase = 'settle'; started = time; settled = 0 }
  const reset = () => { eyes.reset(); sequence = createIdentityActionSequence(actions); phase = 'actions'; aligned = false; baseline = []; stages = []; progress = 0; feedback = 'not_run' }
  return {
    retryImage(time) { settle(time) },
    toggleLight(time) {
      light = !light
      if (phase === 'light' || phase === 'settle') { feedback = 'not_run'; settle(time) }
      return { fill: white(), light }
    },
    update(frame, time) {
      const blink = Number.isFinite(frame.blinkLeft) && Number.isFinite(frame.blinkRight)
        ? frame.count === 1 ? eyes.update(frame.blinkLeft, frame.blinkRight) : NaN : frame.blink
      const mouth = frame.mouth
      const neutralFace = blink < .25 && mouth < .25
      const framing = frame.count === 1 ? identityFaceFrame(frame.points, frame.video, frame.viewport, { tracking: aligned && (phase !== 'settle' || !neutralFace) })
        : { ready: false, hint: frame.count > 1 ? '请本人独自入镜' : '请将脸部放入框内' }
      const qualityIssue = phase === 'light' ? null : identityImageQualityIssue(frame.quality, { checkSharpness: false })
      const tracking = guard.update(frame.count, framing.ready, time)
      if (tracking.paused) {
        sequence.pause()
        if (tracking.reset) reset()
        if (phase === 'light') { stages[stage].samples = []; started = time }
        if (phase === 'settle') { started = time; settled = 0 }
        const hint = frame.count < 2 && qualityIssue && qualityIssue !== 'unavailable' ? identityImageQualityHint(qualityIssue) : {}
        return { ...hint, title: hint.title || framing.hint, detail: hint.detail || (tracking.reset ? '调整后重新开始动作' : '请缓慢调整，保持脸部完整清晰'), progress, ready: false, fill: phase === 'light' ? stages[stage].color.fill : white(), light }
      }
      aligned = true
      if (tracking.resumed && phase !== 'actions') { started = time; settled = 0; if (phase === 'light') stages[stage].samples = [] }
      if (!Number.isFinite(blink) || !Number.isFinite(mouth)) throw new Error('无法检测动作，请重新认证')
      const result = { ready: true, light, fill: white(), progress: 2, title: neutralFace ? '请保持不动' : '请恢复自然表情', detail: neutralFace ? '恢复自然表情，马上为你认证' : '自然闭嘴、睁开双眼后继续认证' }
      if (phase === 'actions' && qualityIssue) {
        sequence.pause()
        return { ...result, ...identityImageQualityHint(qualityIssue), progress, ready: false }
      }
      if (phase === 'actions') {
        if (light && frame.color && blink < .25 && mouth < .25) { baseline.push(frame.color); if (baseline.length > 6) baseline.shift() }
        const state = sequence.update(blink, mouth, time)
        progress = state.index; result.progress = progress
        result.title = state.neutral === false ? '请正对镜头' : state.index < actions.length ? actions[state.index] === 'blink' ? '请缓慢眨眼' : '请张开嘴巴' : '动作已完成'
        result.detail = state.neutral === false ? '睁开双眼，闭上嘴巴，准备开始' : actions[state.index] === 'blink' ? '闭上双眼，再缓缓睁开' : '张开嘴巴，识别后自动进入下一步'
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
        const issue = time - started >= 900 ? identityImageQualityIssue(frame.quality) : null
        if (issue) { settled = 0; return { ...result, ...identityImageQualityHint(issue), ready: false } }
        settled = time - started >= 900 && blink < .25 && mouth < .25 ? settled + 1 : 0
        if (settled >= 3) { result.capture = true; result.lightFeedback = feedback }
      }
      if (phase === 'light') { result.fill = stages[stage].color.fill; result.title = '请保持不动'; result.detail = '柔光调整中，请继续正对镜头' }
      return result
    }
  }
}
