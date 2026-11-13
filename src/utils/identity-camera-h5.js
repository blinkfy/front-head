import { baseUrl } from '@/api/settings.js'
import { createIdentityActionSequence } from './identity-action-sequence.mjs'
import { identityFaceFrame, createIdentityFramingGuard, identityCheekColor, identityLightResponse, shuffledIdentityLights } from './identity-camera-checks.mjs'
import './identity-camera-h5.css'

export function captureIdentityWebPhoto({ actions = [] } = {}) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('无法使用摄像头，请使用系统浏览器打开安全网页，并允许相机权限'))
  }
  return new Promise((resolve, reject) => {
    const actionsToRun = actions.length === 2 && new Set(actions).size === 2 && actions.every(item => ['blink', 'mouth'].includes(item)) ? actions : ['blink', 'mouth']
    const root = document.createElement('section')
    root.className = 'identity-camera'
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '实名认证拍摄')
    const chevron = '<svg class="identity-camera-icon identity-camera-back-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>'
    const sun = '<svg class="identity-camera-icon identity-camera-light-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2 2m11.6 11.6 2 2M4.2 19.8l2-2M17.8 6.2l2-2"/></svg>'
    const actionIcon = action => action === 'blink'
      ? '<svg class="identity-camera-icon identity-camera-action-icon" viewBox="0 0 120 34" aria-hidden="true"><path d="M3 18q17-22 34 0-17 22-34 0Z"/><circle cx="20" cy="18" r="5"/><path d="M49 18h18m-5-5 5 5-5 5M80 14q17 18 34 0m-30 6-4 6m15-2v7m13-11 4 6"/></svg>'
      : '<svg class="identity-camera-icon identity-camera-action-icon" viewBox="0 0 120 34" aria-hidden="true"><path d="M4 18c5-1 9-7 13-5q4 4 8 0c4-2 8 4 13 5-5 5-10 8-17 8S9 23 4 18Z"/><path d="M4 18q9 3 17 0 8 3 17 0M49 18h18m-5-5 5 5-5 5"/><path d="M82 16c5-2 7-10 12-7q4 4 8 0c5-3 7 5 12 7-1 10-7 16-16 16s-15-6-16-16Z"/><path d="M86 17q12-7 24 0c-1 7-5 11-12 11s-11-4-12-11Z" fill="currentColor" fill-opacity=".12"/><path d="m88 17 1 4q9-3 18 0l1-4M92 26q6-5 12 0"/></svg>'
    root.innerHTML = `<header class="identity-camera-header"><button class="identity-camera-button" type="button" data-close aria-label="返回">${chevron}</button><strong>实名认证</strong><button class="identity-camera-button" type="button" data-exit>退出</button></header>
      <div class="identity-camera-content">
        <ol class="identity-camera-progress" aria-label="拍摄进度"><li data-stage="prepare" aria-current="step"><i>1</i><span>准备</span></li><li data-stage="actions"><i>2</i><span>动作检测</span></li><li data-stage="capture"><i>3</i><span>完成检测</span></li></ol>
        <div class="identity-camera-instruction" role="status" aria-live="polite" aria-atomic="true"><h2 data-title>准备开始拍摄</h2><p data-instruction>请允许使用前置摄像头</p></div>
        <div class="identity-camera-frame" data-frame><div class="identity-camera-viewport"><video class="identity-camera-video" autoplay muted playsinline></video><div class="identity-camera-placeholder" data-placeholder><svg class="identity-camera-icon identity-camera-placeholder-icon" viewBox="0 0 100 120" aria-hidden="true"><ellipse cx="50" cy="38" rx="23" ry="28"/><path d="M12 114q0-42 38-42t38 42"/></svg><span>正在准备相机…</span></div></div><span class="identity-camera-corner tl"></span><span class="identity-camera-corner tr"></span><span class="identity-camera-corner bl"></span><span class="identity-camera-corner br"></span></div>
        <p class="identity-camera-face-status" data-face-status>请本人独自入镜</p>
        <ol class="identity-camera-actions" aria-label="需完成的动作">${actionsToRun.map((action, index) => `<li data-action-step="${index}"><div><i>${index + 1}</i><span>${action === 'blink' ? '眨眼' : '张嘴'}</span></div>${actionIcon(action)}</li>`).join('')}</ol>
        <footer class="identity-camera-footer"><button class="identity-camera-button identity-camera-light" type="button" data-light aria-pressed="true">${sun}<span data-light-label>柔光补光已开启</span></button><p data-footer-hint>保持手机平稳 · 完成动作后自动拍摄</p><small>如画面偏暗，可调高屏幕亮度，避免逆光</small></footer>
      </div>`
    const video = root.querySelector('video'), title = root.querySelector('[data-title]'), instruction = root.querySelector('[data-instruction]')
    const frame = root.querySelector('[data-frame]'), faceStatus = root.querySelector('[data-face-status]'), placeholder = root.querySelector('[data-placeholder]')
    const lightButton = root.querySelector('[data-light]'), footerHint = root.querySelector('[data-footer-hint]')
    const steps = [...root.querySelectorAll('[data-action-step]')], stages = [...root.querySelectorAll('[data-stage]')]
    const sampleCanvas = document.createElement('canvas'), sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
    let stream, detector, interval, timeout, closed = false, taking = false, previousFrame = -1
    let sequence = createIdentityActionSequence(actionsToRun), phase = 'actions', lightEnabled = true, lightFeedback = 'not_run'
    const framingGuard = createIdentityFramingGuard()
    let trackingReady = false
    let baseline = [], lightStages = [], lightIndex = 0, stageStarted = 0, settleStarted = 0, settledFrames = 0
    const oldOverflow = document.body.style.overflow, previousFocus = document.activeElement
    const text = (element, value) => { if (element.textContent !== value) element.textContent = value }
    const showInstruction = (heading, detail) => { text(title, heading); text(instruction, detail) }
    const setStage = name => stages.forEach((element, index) => {
      const current = stages.findIndex(item => item.dataset.stage === name)
      element.classList.toggle('is-complete', index < current)
      element.classList.toggle('is-current', index === current)
      if (index === current) element.setAttribute('aria-current', 'step'); else element.removeAttribute('aria-current')
    })
    const updateSteps = (index, active = true) => steps.forEach((element, n) => {
      element.classList.toggle('is-complete', n < index)
      element.classList.toggle('is-current', active && n === index)
      if (active && n === index) element.setAttribute('aria-current', 'step'); else element.removeAttribute('aria-current')
    })
    const paint = fill => root.style.setProperty('--identity-light', fill)
    const restoreLight = () => paint(lightEnabled ? '#ffffff' : '#edf1f3')
    const finish = (result, error) => {
      if (closed) return
      closed = true
      clearInterval(interval); clearTimeout(timeout)
      stream?.getTracks().forEach(track => track.stop())
      try { detector?.close() } catch { /* Continue releasing the camera UI even after a WASM teardown error. */ }
      video.srcObject = null; root.remove(); document.body.style.overflow = oldOverflow
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('hashchange', cancel); window.removeEventListener('pagehide', cancel); document.removeEventListener('keydown', keyboard)
      try { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) } catch { /* A stale focus target must not interrupt cleanup. */ }
      error ? reject(error) : resolve(result)
    }
    const cancel = () => finish(null, Object.assign(new Error('已取消拍摄'), { cancelled: true }))
    const hidden = () => { if (document.hidden) cancel() }
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); cancel() }
      if (event.key === 'Tab') {
        const buttons = [...root.querySelectorAll('button:not(:disabled)')]
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus() }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus() }
      }
    }
    const beginSettle = timestamp => {
      phase = 'settle'; settleStarted = timestamp; settledFrames = 0; restoreLight(); setStage('capture')
      showInstruction('请保持不动', '恢复自然表情，马上为你拍摄')
      text(faceStatus, lightFeedback === 'observed' ? '画面状态良好' : '请保持正对镜头')
    }
    const reset = hint => {
      sequence = createIdentityActionSequence(actionsToRun); phase = 'actions'; baseline = []; lightStages = []; lightFeedback = 'not_run'
      trackingReady = false
      restoreLight(); updateSteps(0, false); frame.classList.remove('is-ready'); setStage('actions')
      showInstruction(hint, '请本人独自入镜，保持脸部完整清晰'); text(faceStatus, '调整后将重新开始动作')
    }
    root.querySelector('[data-close]').onclick = cancel; root.querySelector('[data-exit]').onclick = cancel
    lightButton.onclick = () => {
      lightEnabled = !lightEnabled; lightButton.setAttribute('aria-pressed', String(lightEnabled))
      text(root.querySelector('[data-light-label]'), lightEnabled ? '柔光补光已开启' : '柔光补光已关闭')
      if (phase === 'light' && !lightEnabled) { lightFeedback = 'not_run'; beginSettle(performance.now()) }
      else if (phase === 'settle') beginSettle(performance.now())
      else restoreLight()
    }
    async function capture() {
      if (taking || closed || !video.videoWidth) return
      taking = true; showInstruction('正在拍摄', '请稍候，即将完成'); text(footerHint, '拍摄完成后将返回确认照片')
      try {
        const canvas = document.createElement('canvas'), scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale)
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        const file = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.9))
        if (!file) throw new Error('拍摄失败，请重新打开相机')
        finish({ file, assist: 'client_actions', lightFeedback })
      } catch { taking = false; finish(null, new Error('拍摄失败，请重新打开相机')) }
    }
    const sampleColor = points => {
      if (!sampleContext) return null
      try {
        const height = Math.max(1, Math.round(96 * video.videoHeight / video.videoWidth))
        if (sampleCanvas.width !== 96 || sampleCanvas.height !== height) { sampleCanvas.width = 96; sampleCanvas.height = height }
        sampleContext.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height)
        return identityCheekColor(sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height), points)
      } catch { return null }
    }
    setStage('prepare'); updateSteps(0, false)
    document.body.appendChild(root); document.body.style.overflow = 'hidden'; root.querySelector('[data-close]').focus({ preventScroll: true })
    document.addEventListener('visibilitychange', hidden); window.addEventListener('hashchange', cancel); window.addEventListener('pagehide', cancel); document.addEventListener('keydown', keyboard)
    timeout = setTimeout(() => finish(null, new Error('拍摄超时，请重新开始')), 90000)
    ;(async () => {
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } } })
        if (closed) { acquired.getTracks().forEach(track => track.stop()); return }
        stream = acquired; video.srcObject = stream; await video.play()
        stream.getVideoTracks()[0]?.addEventListener('ended', () => finish(null, new Error('摄像头已断开，请重新开始拍摄')), { once: true })
        if (closed) return
        placeholder.hidden = true; showInstruction('正在准备检测', '首次打开可能需要稍等片刻')
        const assetRoot = `${baseUrl}/identity-assets/0.10.21`
        const vision = await import(/* @vite-ignore */ `${assetRoot}/vision_bundle.mjs`)
        if (closed) return
        const files = await vision.FilesetResolver.forVisionTasks(`${assetRoot}/wasm`)
        if (closed) return
        const loaded = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${assetRoot}/face_landmarker.task`, delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.65, minFacePresenceConfidence: 0.65 })
        if (closed) { loaded.close(); return }
        detector = loaded; setStage('actions')
        interval = setInterval(() => {
          if (closed || taking || video.readyState < 2 || previousFrame === video.currentTime) return
          previousFrame = video.currentTime
          try {
            const timestamp = performance.now(), result = detector.detectForVideo(video, timestamp)
            const faceCount = result.faceLandmarks.length, points = result.faceLandmarks[0], viewport = frame.getBoundingClientRect()
            const framing = faceCount === 1
              ? identityFaceFrame(points, { width: video.videoWidth, height: video.videoHeight }, viewport, { tracking: trackingReady && phase === 'actions' })
              : { ready: false, hint: faceCount > 1 ? '请本人独自入镜' : '请将脸部放入框内' }
            const tracking = framingGuard.update(faceCount, framing.ready, timestamp)
            if (tracking.paused) {
              if (tracking.reset) reset(framing.hint)
              else {
                sequence.pause(); frame.classList.remove('is-ready')
                showInstruction(framing.hint, '请缓慢调整，保持脸部完整清晰'); text(faceStatus, '调整好后继续')
              }
              // Interrupted color and final-photo frames are never carried into a capture.
              if (phase === 'light') { lightStages[lightIndex].samples = []; stageStarted = timestamp }
              if (phase === 'settle') { settleStarted = timestamp; settledFrames = 0 }
              return
            }
            trackingReady = true
            if (tracking.resumed) {
              if (phase === 'light') {
                stageStarted = timestamp; lightStages[lightIndex].samples = []
                showInstruction('请保持不动', '柔光调整中，请继续正对镜头')
              } else if (phase === 'settle') beginSettle(timestamp)
            }
            frame.classList.add('is-ready')
            const scores = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map(item => [item.categoryName, item.score]))
            const blink = Math.min(scores.eyeBlinkLeft || 0, scores.eyeBlinkRight || 0), mouth = scores.jawOpen || 0
            const color = lightEnabled ? sampleColor(points) : null
            if (phase === 'actions') {
              if (color && blink < .25 && mouth < .25) { baseline.push(color); if (baseline.length > 6) baseline.shift() }
              const state = sequence.update(blink, mouth, timestamp)
              updateSteps(state.index, state.neutral !== false)
              text(faceStatus, '已识别到一张人脸')
              if (state.neutral === false) showInstruction('请正对镜头', '睁开双眼，闭上嘴巴，准备开始')
              else if (state.index < actionsToRun.length) showInstruction(actionsToRun[state.index] === 'blink' ? '请缓慢眨眼' : '请张开嘴巴', actionsToRun[state.index] === 'blink' ? '闭上双眼，再缓缓睁开' : '张开嘴巴，再自然闭合')
              else showInstruction('动作已完成', '请恢复自然表情，保持手机平稳')
              if (state.done) {
                updateSteps(actionsToRun.length, false)
                if (lightEnabled) {
                  phase = 'light'; lightStages = shuffledIdentityLights().map(color => ({ color, samples: [] })); lightIndex = 0; stageStarted = timestamp
                  paint(lightStages[0].color.fill); showInstruction('请保持不动', '柔光调整中，请继续正对镜头')
                } else beginSettle(timestamp)
              }
            } else if (phase === 'light') {
              const stage = lightStages[lightIndex], elapsed = timestamp - stageStarted
              if (color && elapsed >= 300 && stage.samples.length < 8) stage.samples.push(color)
              if (elapsed >= 800) {
                lightIndex++
                if (lightIndex < lightStages.length) { stageStarted = timestamp; paint(lightStages[lightIndex].color.fill) }
                else { lightFeedback = identityLightResponse(baseline, lightStages).status; beginSettle(timestamp) }
              }
            } else if (phase === 'settle') {
              if (timestamp - settleStarted < 900) { settledFrames = 0; return }
              settledFrames = blink < .25 && mouth < .25 ? settledFrames + 1 : 0
              if (settledFrames >= 3) capture()
            }
          } catch { finish(null, new Error('动作检测未完成，请使用系统浏览器重新尝试')) }
        }, 120)
      } catch (error) {
        const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
        finish(null, new Error(denied ? '请在浏览器设置中允许相机权限，再重新拍摄' : '无法准备拍摄，请检查网络与相机，或使用系统浏览器重试'))
      }
    })()
  })
}
