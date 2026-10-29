import { isPhoneBrowser } from './h5-scan-entry.mjs'
import { vibrateScan } from './haptics.mjs'
import { playUiSound, primeUiSounds } from './ui-sounds.js'
import { createScanDebugAccess } from './scan-debug.mjs'
import { cameraFrame, sharpenQrImage } from './h5-camera-frame.mjs'
import { detectRoundCodeCandidate, detectQrCandidate } from './h5-roundcode-candidate.mjs'
import { videoConstraints, candidateFrame, selectSharpFrame, sharpFrameMatches, PhotoGate, ScanAutoZoom, reprojectCandidate } from './h5-scan-quality.mjs'
import { preparePhotoCapture } from './h5-photo-capture.mjs'
import { createNativeQrReader } from './h5-native-qr.mjs'
import './h5-qr-scanner.css'

let activeScan = null
let decoderPromise
const loadDecoder = () => decoderPromise || (decoderPromise = import('jsqr')
  .then(module => module.default)
  .catch(error => { decoderPromise = null; throw error }))

// Ordinary QR stays local. Stable circle-code candidates trigger at most one
// bounded still-image request at a time; no video stream is uploaded.
export function scanWithH5Camera(options = {}) {
  if (activeScan) return
  if (!isPhoneBrowser()) {
    const error = { errMsg: 'scanCode:fail 仅手机网页支持相机扫码' }
    options.fail?.(error)
    options.complete?.(error)
    return
  }
  primeUiSounds()
  const debugAccess = createScanDebugAccess(typeof uni === 'undefined' ? null : uni)
  const adminAtOpen = debugAccess()
  const root = document.createElement('section')
  root.className = 'ftx-web-scanner'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '扫一扫，连接设备或确认登录')
  root.innerHTML = `
    <header class="ftx-web-scanner-header">
      <button class="ftx-web-scanner-button ftx-web-scanner-back" type="button" data-action="close" aria-label="关闭扫码">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
      <h2 class="ftx-web-scanner-title">扫一扫</h2>
      <p class="ftx-web-scanner-subtitle">连接设备 / 登录确认 / 扫描小程序码</p>
    </header>
    <div class="ftx-web-scanner-stage" aria-hidden="true">
      <div class="ftx-web-scanner-preview"><video class="ftx-web-scanner-video" autoplay muted playsinline webkit-playsinline data-ui-sound-camera-preview></video></div>
      <div class="ftx-web-scanner-guide">
      <i class="ftx-web-scanner-corner"></i><i class="ftx-web-scanner-corner"></i><i class="ftx-web-scanner-corner"></i><i class="ftx-web-scanner-corner"></i><span class="ftx-web-scanner-line"></span>
    </div></div>
    <div class="ftx-web-scanner-controls">
      <p class="ftx-web-scanner-hint">将二维码完整放入框内</p>
      <p class="ftx-web-scanner-supported">支持普通二维码与微信小程序码</p>
      <div class="ftx-web-scanner-zoom" role="group" aria-label="相机倍率">
        <button class="ftx-web-scanner-button" type="button" data-action="zoom-out" aria-label="缩小画面" disabled>−</button>
        <output class="ftx-web-scanner-zoom-value" role="button" tabindex="0" aria-label="当前倍率，点击恢复自动">1×</output>
        <button class="ftx-web-scanner-button" type="button" data-action="zoom-in" aria-label="放大画面" disabled>+</button>
      </div>
      <p class="ftx-web-scanner-status" role="status" aria-live="polite">正在打开后置相机…</p>
      ${adminAtOpen ? `<section class="ftx-web-scanner-debug" aria-label="管理员实时解析">
        <p class="ftx-web-scanner-debug-title">实时解析 · 仅管理员可见</p>
        <pre class="ftx-web-scanner-debug-text" data-debug-text>等待识别二维码…</pre>
        <button class="ftx-web-scanner-button" type="button" data-action="use-decoded" disabled>使用此结果</button>
      </section>` : ''}
      <div class="ftx-web-scanner-actions">
        <button class="ftx-web-scanner-button" type="button" data-action="album">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-6 4 4 4-5 5 6"/></svg>相册选图</button>
        <button class="ftx-web-scanner-button" type="button" data-action="torch" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10v5l-3 4v11h-4V11L7 7ZM7 6h10m-5 8v3"/></svg><span data-label="torch">打开补光</span></button>
      </div>
      <div class="ftx-web-scanner-secondary">
        <button class="ftx-web-scanner-button" type="button" data-action="retry" disabled>重新开启相机</button>
        <button class="ftx-web-scanner-button" type="button" data-action="manual">手动输入 ›</button>
      </div>
      <form class="ftx-web-scanner-form" hidden><label class="ftx-web-scanner-label" for="ftx-web-device-id">设备 ID 或设备二维码内容</label>
        <div class="ftx-web-scanner-input-row"><input class="ftx-web-scanner-input" id="ftx-web-device-id" autocomplete="off" maxlength="4096" placeholder="请输入设备 ID">
        <button class="ftx-web-scanner-button" type="submit">连接</button></div></form>
      <p class="ftx-web-scanner-note">普通码本地识别 · 微信圆码自动联网识别</p>
    </div><input type="file" accept="image/*" hidden>`
  const debugPanel = adminAtOpen ? root.querySelector('.ftx-web-scanner-debug') : null
  const debugText = adminAtOpen ? root.querySelector('[data-debug-text]') : null
  const useDecoded = adminAtOpen ? root.querySelector('[data-action="use-decoded"]') : null
  let acceptDecoded = null, acceptingDecoded = false
  const video = root.querySelector('video')
  const status = root.querySelector('[role="status"]')
  const retry = root.querySelector('[data-action="retry"]')
  const zoomIn = root.querySelector('[data-action="zoom-in"]')
  const zoomOut = root.querySelector('[data-action="zoom-out"]')
  const zoomValue = root.querySelector('output')
  const torch = root.querySelector('[data-action="torch"]')
  const torchLabel = root.querySelector('[data-label="torch"]')
  const fileInput = root.querySelector('input[type="file"]')
  const form = root.querySelector('form')
  const input = form.querySelector('input')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let stream, timer, cameraTimeout, closed = false, generation = 0, imageJob = 0
  let previousCode = '', previousAt = 0, matching = 0
  let roundImage = '', roundBusy = false, roundSupported = true, roundModule = null
  let roundRequest = null, roundAuthorizing = false, nativeReader = null
  let roundCandidate = null, roundStable = 0, lastRoundCheck = 0, nextRoundAt = 0, roundFailures = 0
  let resumeFrameScan = null
  let hardwareZoom = false
  let zoomRange = null, currentZoom = 1, torchSupported = false, torchOn = false, cameraControlBusy = false
  let candidateKind = '', candidateSince = 0, candidateAt = 0, bestPixels = null
  let photoSource = null, photoBusy = false, lastZoomAt = -Infinity
  const autoZoom = new ScanAutoZoom()
  const feedbackKeys = new Set()
  const photoGate = new PhotoGate(), pendingWork = new Set()
  function within(promise, milliseconds) {
    return new Promise((resolve, reject) => {
      let settled = false
      const end = (error, value) => {
        if (settled) { value?.close?.(); return }
        settled = true; clearTimeout(timeout); pendingWork.delete(cancelWork)
        if (error) reject(error); else resolve(value)
      }
      const cancelWork = () => end(Object.assign(new Error('SCAN_CANCELLED'), { name: 'AbortError' }))
      const timeout = setTimeout(() => end(new Error('SCAN_WORK_TIMEOUT')), milliseconds)
      pendingWork.add(cancelWork)
      Promise.resolve(promise).then(value => end(null, value), error => end(error))
    })
  }
  function clearCandidate() {
    roundCandidate = null; roundStable = 0; candidateKind = ''; candidateSince = 0; candidateAt = 0; bestPixels = null
  }
  function scheduleScan(delay = 200) {
    clearTimeout(timer)
    if (!closed && stream && !document.hidden && !photoBusy) timer = setTimeout(() => resumeFrameScan?.(), delay)
  }
  const oldFocus = document.activeElement
  const oldOverflow = document.body.style.overflow

  function updateCameraControls() {
    zoomIn.disabled = cameraControlBusy || photoBusy || !zoomRange || currentZoom >= zoomRange.max - 0.01
    zoomOut.disabled = cameraControlBusy || photoBusy || !zoomRange || currentZoom <= zoomRange.min + 0.01
    zoomValue.textContent = `${zoomRange ? autoZoom.isManual() ? '手动 ' : '自动 ' : ''}${Number(currentZoom.toFixed(1))}×`
    zoomValue.title = zoomRange ? '点击回到 1×并恢复自动；' + (hardwareZoom ? '相机变焦' : '数字放大，识别图像同步裁剪') : '相机尚未开启'
    video.style.transform = `scale(${hardwareZoom ? 1 : currentZoom})`
    torch.disabled = cameraControlBusy || photoBusy || !torchSupported
    torchLabel.textContent = torchOn ? '关闭补光' : '打开补光'
    torch.setAttribute('aria-pressed', String(torchOn))
  }
  async function adjustCamera(kind, value, manual = true) {
    const track = stream?.getVideoTracks()[0]
    if (!stream || cameraControlBusy || photoBusy || (kind === 'zoom' ? !zoomRange : !torchSupported)) return
    if (kind === 'zoom' && manual) autoZoom.manual()
    cameraControlBusy = true; updateCameraControls()
    try {
      let next = !torchOn
      if (kind === 'zoom') {
        const cap = manual ? zoomRange.max : Math.min(3, zoomRange.max)
        const steps = Math.max(0, Math.floor((cap - zoomRange.min) / zoomRange.step + 1e-8))
        const index = Math.max(0, Math.min(steps, Math.round((value - zoomRange.min) / zoomRange.step)))
        next = zoomRange.min + index * zoomRange.step
      }
      if (kind !== 'zoom' || hardwareZoom) await within(track.applyConstraints({ advanced: [{ [kind]: next }] }), 2000)
      if (closed || stream?.getVideoTracks()[0] !== track) return
      if (kind === 'zoom') {
        const before = currentZoom
        currentZoom = hardwareZoom ? track.getSettings?.()?.zoom ?? next : next
        previousCode = ''; matching = 0; bestPixels = null; lastZoomAt = Date.now(); lastRoundCheck = -Infinity
        if (!manual && !hardwareZoom && roundCandidate) {
          roundCandidate = reprojectCandidate(roundCandidate, before, currentZoom)
          if (!roundCandidate) clearCandidate()
        } else clearCandidate()
      } else torchOn = track.getSettings?.()?.torch ?? next
    } catch (_) {
      if (!closed && stream?.getVideoTracks()[0] === track) {
        if (kind === 'zoom') autoZoom.manual()
        status.textContent = '浏览器暂时无法调整相机，请保持稳定继续扫码'
      }
    } finally {
      if (stream?.getVideoTracks()[0] === track) { cameraControlBusy = false; updateCameraControls() }
    }
  }
  function releaseCamera() {
    generation++; imageJob++; roundBusy = false
    if (roundRequest) roundRequest.valid = false
    roundRequest = null; roundAuthorizing = false
    nativeReader?.close(); nativeReader = null
    for (const cancelWork of [...pendingWork]) cancelWork()
    photoSource = null; photoBusy = false; clearCandidate(); autoZoom.reset(Date.now()); lastZoomAt = -Infinity
    resumeFrameScan = null
    clearTimeout(timer)
    clearTimeout(cameraTimeout)
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    video.pause()
    video.srcObject = null
    previousCode = ''; matching = 0
    if (debugPanel) {
      debugPanel.hidden = !debugAccess(); debugText.textContent = debugPanel.hidden ? '' : '等待识别二维码…'
      acceptDecoded = null; useDecoded.disabled = true
    }
    retry.disabled = false
    hardwareZoom = false; zoomRange = null; currentZoom = 1; torchSupported = false; torchOn = false; cameraControlBusy = false
    updateCameraControls()
  }
  function finish(result) {
    if (closed) return
    closed = true
    imageJob++
    releaseCamera()
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('pagehide', cancel)
    window.removeEventListener('popstate', cancel)
    window.removeEventListener('hashchange', cancel)
    root.remove()
    document.body.style.overflow = oldOverflow
    if (oldFocus?.isConnected) oldFocus.focus?.({ preventScroll: true })
    activeScan = null
    try {
      if (result) {
        if (result.errMsg !== 'scanCode:cancel' && !feedbackKeys.size) scanFeedback('completed')
        if (!result.handled) options.success?.(result)
      } else options.fail?.({ errMsg: 'scanCode:fail cancel' })
    } finally { options.complete?.(result || { errMsg: 'scanCode:fail cancel' }) }
  }
  function scanFeedback(key) {
    if (document.hidden || feedbackKeys.has(key)) return
    feedbackKeys.add(key)
    // Keep the first accepted diagnostic result latched without repeated beeps.
    if (feedbackKeys.size > 32) feedbackKeys.delete(feedbackKeys.values().next().value)
    void vibrateScan()
    playUiSound('scanDetected')
  }
  function cancel() { finish(null) }
  function onKey(event) {
    if (event.key === 'Escape') cancel()
    if (event.key !== 'Tab') return
    const focusable = [...root.querySelectorAll('button:not(:disabled), input:not([type="file"]), output[tabindex="0"]')]
      .filter(element => element.getClientRects().length)
    const next = event.shiftKey ? focusable[focusable.length - 1] : focusable[0]
    if (document.activeElement === (event.shiftKey ? focusable[0] : focusable[focusable.length - 1])) {
      event.preventDefault(); next?.focus()
    }
  }
  function onVisibility() {
    if (document.hidden) {
      imageJob++
      releaseCamera()
      status.textContent = '相机已暂停，返回后可重新开启'
    }
  }
  function showError(error) {
    releaseCamera()
    const messages = {
      NotAllowedError: '未获得相机权限，请在浏览器设置中允许，或使用相册识码',
      NotFoundError: '未找到可用相机，请使用相册识码或手动输入',
      NotReadableError: '相机被占用，请关闭其他相机应用后重试',
      SecurityError: '浏览器限制了相机访问，请使用相册识码或手动输入'
    }
    status.textContent = messages[error?.name] || '相机或扫码组件暂不可用，请重试、选择相册或手动输入'
  }
  function visibleFrame(image, width, height) {
    return image === video ? cameraFrame(width, height, video.clientWidth, video.clientHeight, hardwareZoom ? 1 : currentZoom)
      : { left: 0, top: 0, width, height }
  }
  function readCode(image, width, height, decoder, maxEdge, center = false, detail = false, sharpen = false) {
    if (!context || !width || !height || typeof decoder !== 'function') return ''
    const frame = visibleFrame(image, width, height)
    const cropWidth = center ? Math.min(frame.width, frame.height) * (detail ? 0.65 : 0.8) : frame.width
    const cropHeight = center ? cropWidth : frame.height
    const scale = Math.min(detail ? 2 : 1, maxEdge / Math.max(cropWidth, cropHeight))
    canvas.width = Math.max(1, Math.round(cropWidth * scale))
    canvas.height = Math.max(1, Math.round(cropHeight * scale))
    context.imageSmoothingEnabled = !detail
    context.drawImage(image, frame.left + (frame.width - cropWidth) / 2, frame.top + (frame.height - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    if (sharpen) sharpenQrImage(pixels)
    return decoder(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data || ''
  }
  function pixelsIn(image, frame, maxEdge = 1536) {
    const scale = Math.min(1, maxEdge / Math.max(frame.width, frame.height))
    canvas.width = Math.max(1, Math.round(frame.width * scale))
    canvas.height = Math.max(1, Math.round(frame.height * scale))
    context.imageSmoothingEnabled = true
    context.drawImage(image, frame.left, frame.top, frame.width, frame.height, 0, 0, canvas.width, canvas.height)
    return context.getImageData(0, 0, canvas.width, canvas.height)
  }
  async function readNative(image, width, height, isActive) {
    const reader = nativeReader
    if (!context || !reader?.available || !width || !height) return null
    const pixels = pixelsIn(image, visibleFrame(image, width, height), 1280)
    return reader.read(pixels, () => nativeReader === reader && isActive())
  }
  function locateCandidate(image, width, height) {
    const pixels = pixelsIn(image, visibleFrame(image, width, height), 1920)
    const qr = detectQrCandidate(pixels)
    if (qr) return { kind: 'qr', value: qr }
    const round = roundSupported && detectRoundCodeCandidate(pixels)
    return round ? { kind: 'round', value: round } : null
  }
  function observeCandidate(image, width, height, now) {
    const located = locateCandidate(image, width, height), candidate = located?.value
    const stable = candidate && candidateKind === located.kind && roundCandidate
      && Math.hypot(candidate.x - roundCandidate.x, candidate.y - roundCandidate.y) < 0.04
      && Math.abs(candidate.size - roundCandidate.size) <= roundCandidate.size * 0.2
    if (!stable) { candidateSince = now; bestPixels = null }
    roundStable = candidate ? stable ? roundStable + 1 : 1 : 0
    candidateKind = located?.kind || ''; roundCandidate = candidate; candidateAt = now
  }
  function candidatePixels(image, width, height, candidate, remember) {
    const frame = candidateFrame(visibleFrame(image, width, height), candidate)
    if (!frame) return null
    const pixels = pixelsIn(image, frame)
    if (!remember) return pixels
    bestPixels = selectSharpFrame(bestPixels, pixels, frame, Date.now())
    return bestPixels?.pixels || pixels
  }
  function readCandidate(image, width, height, candidate, decoder, remember = false) {
    if (typeof decoder !== 'function') return ''
    const selected = candidatePixels(image, width, height, candidate, remember)
    if (!selected) return ''
    let text = decoder(selected.data, selected.width, selected.height, { inversionAttempts: 'attemptBoth' })?.data || ''
    if (!text) {
      // Never sharpen the retained original frame in place.
      const enhanced = { width: selected.width, height: selected.height, data: new Uint8ClampedArray(selected.data) }
      sharpenQrImage(enhanced)
      text = decoder(enhanced.data, enhanced.width, enhanced.height, { inversionAttempts: 'attemptBoth' })?.data || ''
    }
    return text
  }
  function showDecoded(text, accept) {
    if (!debugPanel) return false
    if (!debugAccess()) {
      debugPanel.hidden = true; debugText.textContent = ''; acceptDecoded = null; useDecoded.disabled = true
      return false
    }
    // Do not discard a confirmed result for a transient/one-frame candidate.
    if (!accept && acceptDecoded) return true;
    // textContent keeps arbitrary QR text literal; never interpret it as markup.
    if (accept) scanFeedback(text)
    debugText.textContent = text.slice(0, 4096)
    acceptDecoded = accept || null; useDecoded.disabled = !acceptDecoded || acceptingDecoded
    return true
  }
  function found(text) {
    if (!text || text.length > 4096) return
    supersedeRound()
    scanFeedback(text)
    const result = { errMsg: 'scanCode:ok', result: text, scanType: 'QR_CODE', charSet: 'UTF-8' }
    if (!showDecoded(text, () => finish(result))) finish(result)
  }
  function supersedeRound() {
    // Keep the actual request single-flight until it settles, while preventing
    // its late response from showing a dialog or overwriting a selected QR.
    if (roundRequest && !roundAuthorizing) roundRequest.valid = false
  }
  function makeRoundImage(image, width, height, candidate = null) {
    if (!width || !height) throw new Error('画面还未准备好，请先开启相机或从相册选图')
    const photo = document.createElement('canvas')
    const visible = visibleFrame(image, width, height)
    const frame = candidateFrame(visible, candidate) || visible
    const scale = Math.min(1, 1280 / Math.max(frame.width, frame.height))
    photo.width = Math.max(1, Math.round(frame.width * scale))
    photo.height = Math.max(1, Math.round(frame.height * scale))
    const ctx = photo.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法读取图片，请使用微信扫码')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, photo.width, photo.height)
    if (image === video && sharpFrameMatches(bestPixels, frame, Date.now())) {
      const retained = document.createElement('canvas')
      retained.width = bestPixels.pixels.width; retained.height = bestPixels.pixels.height
      const retainedContext = retained.getContext('2d')
      if (retainedContext) {
        retainedContext.putImageData(bestPixels.pixels, 0, 0)
        ctx.drawImage(retained, 0, 0, retained.width, retained.height, 0, 0, photo.width, photo.height)
      } else ctx.drawImage(image, frame.left, frame.top, frame.width, frame.height, 0, 0, photo.width, photo.height)
    } else ctx.drawImage(image, frame.left, frame.top, frame.width, frame.height, 0, 0, photo.width, photo.height)
    let result = photo.toDataURL('image/jpeg', 0.82)
    if (result.length > 1398127) result = photo.toDataURL('image/jpeg', 0.65)
    if (result.length > 1398127) throw new Error('图片过大，请让圆码靠近并减少背景后重试')
    return result
  }
  async function recognizeRoundCode(imageOverride = null) {
    if (closed || roundBusy || !roundSupported) return
    let image
    try { image = imageOverride || roundImage || makeRoundImage(video, video.videoWidth, video.videoHeight, candidateKind === 'round' ? roundCandidate : null) }
    catch (error) { status.textContent = error.message; return }
    roundBusy = true
    clearTimeout(timer)
    // The uploaded frame is immutable. Ordinary QR decoding may supersede the
    // read-only resolution phase; zoom/photo/another upload remain paused.
    scheduleScan(350)
    const requestGeneration = generation
    const job = ++imageJob
    const request = { valid: true }
    roundRequest = request
    let succeeded = false
    const isActive = () => request.valid && !closed && job === imageJob && requestGeneration === generation && !document.hidden
    const previewActive = () => request.valid && !closed && requestGeneration === generation && !document.hidden
    status.textContent = '正在联网识别圆码，也可继续扫描普通二维码…'
    try {
      const module = roundModule || await within(import('./h5-roundcode.js'), 6000)
      if (!isActive()) return
      // Resolve first without login/connection side effects. Ordinary QR may win
      // during this bounded network phase, but not during explicit authorization.
      const preview = await within(module.previewWebRoundCode(image, previewActive), 14000)
      if (!isActive() || acceptingDecoded) return
      if (debugAccess()) {
        if (preview) {
          roundFailures = 0; succeeded = true
          showDecoded(preview.text, async () => {
            if (!debugAccess()) return
            const result = await preview.accept()
            if (!closed && requestGeneration === generation && debugAccess() && result) finish(result)
          })
        }
        return
      }
      if (!preview) { roundSupported = false; status.textContent = '识别已取消或账号已变化，请重新开启相机后重试'; return }
      roundAuthorizing = true
      const result = await preview.accept()
      if (!isActive()) return
      if (result) { roundFailures = 0; succeeded = true; finish(result) }
      else { roundSupported = false; status.textContent = '识别已取消或账号已变化，请重新开启相机后重试' }
    } catch (error) {
      if (!isActive()) return
      const code = error?.statusCode || error?.httpStatus || error?.code
      if ([401, 403, 404, 405, 429, 501, 503].includes(code)) roundSupported = false
      status.textContent = [404, 405, 501].includes(code)
        ? '当前服务尚未支持网页圆码，请使用普通二维码或微信扫码'
        : error?.message === 'SCAN_WORK_TIMEOUT' ? '圆码识别超时，可继续扫描普通二维码或稍后重试'
          : error?.msg || error?.message || '圆码暂未识别成功，请换清晰图片或使用普通二维码'
    } finally {
      const countFailure = isActive() && !succeeded
      if (!succeeded) request.valid = false
      if (roundRequest === request) {
        roundRequest = null; roundBusy = false; roundAuthorizing = false
        nextRoundAt = Date.now() + (debugAccess() ? 15000 : 2500)
        // Repeated failures require an explicit retry; no video upload loop.
        if (!closed && requestGeneration === generation && !roundImage && stream) {
          if (countFailure && ++roundFailures >= 3) roundSupported = false
          scheduleScan()
        }
      }
    }
  }
  async function prepareRoundCode() {
    try {
      const module = await import('./h5-roundcode.js')
      if (closed) return
      roundModule = module
      await module.prepareWebRoundCode()
    } catch (_) { /* Older servers keep local QR scanning available. */ }
  }
  async function startCamera(resetRound = true) {
    if (closed) return
    imageJob++
    roundImage = ''
    roundCandidate = null; roundStable = 0; lastRoundCheck = 0
    if (resetRound) { roundSupported = true; roundFailures = 0 }
    releaseCamera()
    form.hidden = true
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = '相机需要 HTTPS 和支持相机的浏览器，可先使用相册识码或手动输入'
      return
    }
    const attempt = generation
    retry.disabled = true
    status.textContent = '正在打开后置相机，请允许浏览器使用相机…'
    cameraTimeout = setTimeout(() => {
      if (closed || attempt !== generation) return
      releaseCamera()
      status.textContent = '相机开启超时，请确认权限后重试，或使用相册识码'
    }, 15000)
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }
      } })
      if (closed || attempt !== generation) { acquired.getTracks().forEach(track => track.stop()); return }
      stream = acquired
      const track = acquired.getVideoTracks()[0]
      const isCurrent = () => !closed && attempt === generation && !document.hidden && stream?.getVideoTracks()[0] === track
      zoomRange = { min: 1, max: 3, step: 0.1 }; currentZoom = 1.5
      try {
        const profile = videoConstraints(track?.getCapabilities?.() || {}, navigator)
        const actual = track?.getSettings?.() || {}
        if (profile && track?.applyConstraints && profile.width.ideal * profile.height.ideal > (actual.width || 1920) * (actual.height || 1080)) {
          await within(track.applyConstraints(profile), 3000)
        }
      } catch (_) { /* Optional HD rejection leaves the original camera stream available. */ }
      if (!isCurrent()) return
      try {
        if (track?.getCapabilities?.()?.focusMode?.includes('continuous') && track?.applyConstraints) {
          await within(track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }), 1000)
        }
      } catch (_) { /* Keep the browser's default focus mode if control is unavailable. */ }
      if (!isCurrent()) return
      try {
        const capabilities = track?.getCapabilities?.() || {}
        const zoom = capabilities.zoom
        if (track?.applyConstraints && zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) {
          const desired = Math.max(zoom.min, Math.min(zoom.max, 1.5))
          await track.applyConstraints({ advanced: [{ zoom: desired }] })
          if (closed || attempt !== generation) return
          hardwareZoom = true
          zoomRange = { min: zoom.min, max: zoom.max, step: zoom.step > 0 ? zoom.step : 0.1 }
          currentZoom = track.getSettings?.()?.zoom ?? desired
        }
        torchSupported = Boolean(capabilities.torch && track?.applyConstraints)
        torchOn = Boolean(track?.getSettings?.()?.torch)
      } catch (_) { /* Digital zoom is available even when the optional hardware constraint fails. */ }
      if (closed || attempt !== generation) return
      updateCameraControls()
      video.srcObject = acquired
      acquired.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (!closed && attempt === generation) showError({ name: 'NotReadableError' })
      }, { once: true })
      await video.play()
      const decoder = await loadDecoder().catch(() => null)
      if (closed || attempt !== generation) return
      nativeReader = createNativeQrReader({ BarcodeDetector: window.BarcodeDetector, within })
      clearTimeout(cameraTimeout)
      retry.disabled = false
      status.textContent = '小码请靠近，或尝试调整倍率'
      const cameraStarted = Date.now()
      let scanIdentity
      const identity = () => { try { return typeof uni === 'undefined' ? '' : uni.getStorageSync('token') || '' } catch (_) { return '' } }
      scanIdentity = identity()
      const activeIdentity = () => isCurrent() && scanIdentity === identity()
      // No ImageCapture polyfill: unsupported browsers keep the normal live pipeline.
      void preparePhotoCapture(track, { ImageCapture: window.ImageCapture, createImageBitmap: window.createImageBitmap?.bind(window) },
        within, activeIdentity).then(source => { if (activeIdentity()) photoSource = source }).catch(() => {})
      async function captureCandidate() {
        if (!photoSource || photoBusy || roundBusy || cameraControlBusy || !activeIdentity() || !photoGate.start(Date.now())) return
        photoBusy = true; clearTimeout(timer); updateCameraControls()
        let bitmap
        try {
          bitmap = await photoSource.capture()
          if (!bitmap || !activeIdentity()) return
          const native = nativeReader?.available ? await readNative(bitmap, bitmap.width, bitmap.height, activeIdentity) : null
          if (!activeIdentity()) return
          if (native?.multiple) { status.textContent = '画面中有多个二维码，请一次对准一个'; return }
          const candidate = locateCandidate(bitmap, bitmap.width, bitmap.height)
          const text = native?.text || candidate && readCandidate(bitmap, bitmap.width, bitmap.height, candidate.value, decoder)
            || readCode(bitmap, bitmap.width, bitmap.height, decoder, 1920)
          if (!activeIdentity()) return
          if (text) found(text)
          else if (candidate?.kind === 'round' && roundSupported && Date.now() >= nextRoundAt) {
            await recognizeRoundCode(makeRoundImage(bitmap, bitmap.width, bitmap.height, candidate.value))
          }
        } catch (error) {
          // Cancellation belongs to the old camera; do not disable a new one.
          if (isCurrent() && error?.name !== 'AbortError') { photoGate.disable(); photoSource = null }
        } finally {
          bitmap?.close?.(); photoGate.finish()
          if (isCurrent()) { photoBusy = false; updateCameraControls(); scheduleScan() }
        }
      }
      let frames = 0, preferredDetail = -1, detailCursor = 0, detailMisses = 0
      let slowFrames = 0, downgraded = false, frameLayout = '', liveBusy = false
      async function scanFrame() {
        if (closed || attempt !== generation || document.hidden || photoBusy || liveBusy) return
        if (!activeIdentity()) { releaseCamera(); status.textContent = '账号已变化，请重新开启相机'; return }
        if (cameraControlBusy || roundAuthorizing || acceptingDecoded) { scheduleScan(); return }
        liveBusy = true
        const started = Date.now()
        if (debugPanel && !debugAccess()) showDecoded('', null)
        try {
          if (video.readyState >= 2) {
            const layout = `${video.videoWidth}:${video.videoHeight}:${video.clientWidth}:${video.clientHeight}`
            if (layout !== frameLayout) { frameLayout = layout; clearCandidate() }
            const sampledZoom = currentZoom
            const frameCurrent = () => activeIdentity() && !roundAuthorizing && !acceptingDecoded && sampledZoom === currentZoom
              && layout === `${video.videoWidth}:${video.videoHeight}:${video.clientWidth}:${video.clientHeight}`
            const native = nativeReader?.available ? await readNative(video, video.videoWidth, video.videoHeight, frameCurrent) : null
            if (!frameCurrent()) return
            if (native?.multiple) {
              previousCode = ''; matching = 0
              status.textContent = '画面中有多个二维码，请一次对准一个'
              return
            }
            let text = native?.text || readCode(video, video.videoWidth, video.videoHeight, decoder, 960)
            const now = Date.now()
            let observed = false
            if (!text && !cameraControlBusy && now - lastRoundCheck >= 350) {
              lastRoundCheck = now; observed = true
              observeCandidate(video, video.videoWidth, video.videoHeight, now)
            }
            if (!text && roundCandidate && now - candidateAt <= 900) {
              text = readCandidate(video, video.videoWidth, video.videoHeight, roundCandidate, decoder, true)
            }
            // Keep full-frame scanning first, followed by bounded native-pixel
            // and center retries when either ordinary-QR engine misses.
            if (!text && (++frames % 3 === 0 || preferredDetail >= 0)) {
              const mode = preferredDetail >= 0 ? preferredDetail : detailCursor++ % 2
              text = readCode(video, video.videoWidth, video.videoHeight, decoder, 1280, true, true, mode === 1)
              if (text) { preferredDetail = mode; detailMisses = 0 }
              else if (++detailMisses >= 3) { preferredDetail = -1; detailMisses = 0 }
            }
            if (text) {
              autoZoom.next(now, zoomRange?.max || 1, currentZoom, null, true)
              matching = text === previousCode && now - previousAt < 1500 ? matching + 1 : 1
              previousCode = text; previousAt = now
              const result = { errMsg: 'scanCode:ok', result: text, scanType: 'QR_CODE', charSet: 'UTF-8' }
              const promote = matching >= 2 || !acceptDecoded
              if (text.length <= 4096 && promote && debugAccess()) supersedeRound()
              const inspecting = text.length <= 4096 && showDecoded(text, promote ? () => finish(result) : null)
              if (!inspecting && matching >= 2) { found(text); return }
            } else if (roundCandidate && now - candidateAt <= 900 && !roundBusy) {
              const targetZoom = observed ? autoZoom.next(now, zoomRange?.max || 1, currentZoom, roundCandidate) : NaN
              if (Number.isFinite(targetZoom)) { void adjustCamera('zoom', targetZoom, false); return }
              const canPhoto = photoSource && roundStable >= 3 && now - candidateSince >= 1200 && now - cameraStarted >= 2400 && now - lastZoomAt >= 650
                && (candidateKind === 'qr' || roundSupported && roundFailures > 0 && now >= nextRoundAt)
              if (canPhoto && !photoGate.busy() && photoGate.enabled && photoGate.attempts < 3 && now >= photoGate.nextAt) {
                void captureCandidate(); return
              }
              if (candidateKind === 'round' && roundStable >= 2 && roundSupported && now >= nextRoundAt) {
                void recognizeRoundCode(); return
              }
            }
          }
          // A sustained slow HD pipeline falls back once, without restarting the camera.
          slowFrames = Date.now() - started > 450 ? slowFrames + 1 : 0
          const actual = track?.getSettings?.() || {}
          if (!roundBusy && !downgraded && slowFrames >= 3 && actual.width * actual.height > 1920 * 1080 && track?.applyConstraints) {
            downgraded = true; bestPixels = null
            void within(track.applyConstraints({ width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 } }), 3000).catch(() => {})
          }
        } catch (error) { if (activeIdentity()) showError(error) }
        finally {
          liveBusy = false
          if (!closed && attempt === generation) scheduleScan(roundBusy ? 350 : 200)
        }
      }
      resumeFrameScan = scanFrame
      scanFrame()
    } catch (error) { if (!closed && attempt === generation) showError(error) }
  }
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file || closed) return
    releaseCamera()
    const job = ++imageJob
    if (file.size > 16 * 1024 * 1024) { status.textContent = '图片超过 16MB，请选择较小的图片'; return }
    status.textContent = '正在识别图片中的普通二维码…'
    const url = URL.createObjectURL(file)
    const image = new Image()
    try {
      const ready = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject })
      image.src = url
      await ready
      if (closed || job !== imageJob) return
      const decoder = await loadDecoder().catch(() => null)
      if (closed || job !== imageJob) return
      nativeReader = createNativeQrReader({ BarcodeDetector: window.BarcodeDetector, within })
      const imageActive = () => !closed && job === imageJob && !document.hidden
      const native = nativeReader.available ? await readNative(image, image.naturalWidth, image.naturalHeight, imageActive) : null
      if (!imageActive()) return
      if (native?.multiple) { status.textContent = '图片中有多个二维码，请选择只包含一个码的图片'; return }
      let text = native?.text || readCode(image, image.naturalWidth, image.naturalHeight, decoder, 1600)
        || readCode(image, image.naturalWidth, image.naturalHeight, decoder, 2400)
      const candidate = !text && locateCandidate(image, image.naturalWidth, image.naturalHeight)
      if (!text && candidate?.kind === 'qr') text = readCandidate(image, image.naturalWidth, image.naturalHeight, candidate.value, decoder)
      if (text) found(text)
      else if (candidate?.kind === 'round') {
        roundImage = makeRoundImage(image, image.naturalWidth, image.naturalHeight, candidate.value)
        await recognizeRoundCode()
      } else status.textContent = '未检测到完整二维码，请选择更清晰且包含整个码的图片'
    } catch (_) {
      if (!closed && job === imageJob) status.textContent = '图片暂时无法识别，请换一张图片或手动输入'
    } finally { URL.revokeObjectURL(url); image.src = '' }
  })
  if (useDecoded) useDecoded.onclick = async () => {
    if (!debugAccess() || !acceptDecoded || acceptingDecoded || closed) return
    const accept = acceptDecoded
    acceptingDecoded = true; useDecoded.disabled = true
    try { await accept() }
    catch (error) { if (!closed) status.textContent = error?.msg || error?.message || '扫码处理未完成，请重新识别' }
    finally { acceptingDecoded = false; if (!closed) useDecoded.disabled = !acceptDecoded || !debugAccess() }
  }
  root.querySelector('[data-action="close"]').onclick = cancel
  root.querySelector('[data-action="album"]').onclick = () => {
    imageJob++
    roundImage = ''
    releaseCamera()
    status.textContent = '请选择二维码图片，取消选图后可重新开启相机'
    fileInput.click()
  }
  zoomValue.onclick = () => {
    if (!stream || cameraControlBusy || photoBusy) return
    autoZoom.reset(Date.now()); void adjustCamera('zoom', 1, false)
  }
  zoomValue.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); zoomValue.onclick() } }
  zoomIn.onclick = () => { void adjustCamera('zoom', currentZoom * 1.2) }
  zoomOut.onclick = () => { void adjustCamera('zoom', currentZoom / 1.2) }
  torch.onclick = () => { void adjustCamera('torch') }
  retry.onclick = () => { void prepareRoundCode(); void startCamera() }
  root.querySelector('[data-action="manual"]').onclick = () => {
    imageJob++
    releaseCamera()
    form.hidden = !form.hidden
    if (!form.hidden) input.focus()
  }
  form.onsubmit = event => { event.preventDefault(); found(input.value.trim()) }
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', cancel)
  window.addEventListener('popstate', cancel)
  window.addEventListener('hashchange', cancel)
  document.body.append(root)
  document.body.style.overflow = 'hidden'
  root.querySelector('[data-action="close"]').focus()
  activeScan = cancel
  void prepareRoundCode()
  void startCamera()
}
