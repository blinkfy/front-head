import { isPhoneBrowser } from './h5-scan-entry.mjs'
import { vibrateScan } from './haptics.mjs'
import { detectRoundCodeCandidate } from './h5-roundcode-candidate.mjs'
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
  const root = document.createElement('section')
  root.className = 'ftx-web-scanner'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '连接设备扫码')
  root.innerHTML = `
    <header class="ftx-web-scanner-header"><button class="ftx-web-scanner-button ftx-web-scanner-back" type="button" data-action="close" aria-label="关闭扫码">‹</button>
      <div><h2 class="ftx-web-scanner-title">扫一扫</h2><p class="ftx-web-scanner-subtitle">分投侠 · 连接设备</p></div><span class="ftx-web-scanner-platform">手机网页版</span></header>
    <div class="ftx-web-scanner-preview"><video class="ftx-web-scanner-video" autoplay muted playsinline webkit-playsinline></video>
      <div class="ftx-web-scanner-guide" aria-hidden="true"></div>
      <p class="ftx-web-scanner-hint">对准完整二维码，保持画面稳定</p></div>
    <div class="ftx-web-scanner-controls">
      <p class="ftx-web-scanner-status" role="status" aria-live="polite">正在打开后置相机…</p>
      <div class="ftx-web-scanner-actions">
        <button class="ftx-web-scanner-button" type="button" data-action="album">相册识码</button>
        <button class="ftx-web-scanner-button" type="button" data-action="retry" disabled>重新开启相机</button>
        <button class="ftx-web-scanner-button" type="button" data-action="manual">手动输入</button>
      </div>
      <form class="ftx-web-scanner-form" hidden><label class="ftx-web-scanner-label" for="ftx-web-device-id">设备 ID 或设备二维码内容</label>
        <div class="ftx-web-scanner-input-row"><input class="ftx-web-scanner-input" id="ftx-web-device-id" autocomplete="off" maxlength="4096" placeholder="请输入设备 ID">
        <button class="ftx-web-scanner-button" type="submit">连接</button></div></form>
      <p class="ftx-web-scanner-note">普通码本地识别；检测到微信圆码后自动联网识别</p>
    </div><input type="file" accept="image/*" hidden>`
  const video = root.querySelector('video')
  const status = root.querySelector('[role="status"]')
  const retry = root.querySelector('[data-action="retry"]')
  const fileInput = root.querySelector('input[type="file"]')
  const form = root.querySelector('form')
  const input = form.querySelector('input')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let stream, timer, cameraTimeout, closed = false, generation = 0, imageJob = 0
  let previousCode = '', previousAt = 0, matching = 0
  let roundImage = '', roundBusy = false, roundSupported = true, roundModule = null
  let roundCandidate = null, roundStable = 0, lastRoundCheck = 0, nextRoundAt = 0, roundFailures = 0
  let resumeFrameScan = null
  const oldFocus = document.activeElement
  const oldOverflow = document.body.style.overflow

  function releaseCamera() {
    generation++
    clearTimeout(timer)
    clearTimeout(cameraTimeout)
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    video.pause()
    video.srcObject = null
    previousCode = ''; matching = 0
    retry.disabled = false
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
        if (result.errMsg !== 'scanCode:cancel') void vibrateScan()
        if (!result.handled) options.success?.(result)
      } else options.fail?.({ errMsg: 'scanCode:fail cancel' })
    } finally { options.complete?.(result || { errMsg: 'scanCode:fail cancel' }) }
  }
  function cancel() { finish(null) }
  function onKey(event) {
    if (event.key === 'Escape') cancel()
    if (event.key !== 'Tab') return
    const focusable = [...root.querySelectorAll('button:not(:disabled), input:not([type="file"])')]
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
  function readCode(image, width, height, decoder, maxEdge, center = false) {
    if (!context || !width || !height) return ''
    const cropWidth = center ? Math.min(width, height) * 0.8 : width
    const cropHeight = center ? cropWidth : height
    const scale = Math.min(1, maxEdge / Math.max(cropWidth, cropHeight))
    canvas.width = Math.max(1, Math.round(cropWidth * scale))
    canvas.height = Math.max(1, Math.round(cropHeight * scale))
    context.drawImage(image, (width - cropWidth) / 2, (height - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
    return decoder(context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data || ''
  }
  function found(text) {
    if (text && text.length <= 4096) finish({ errMsg: 'scanCode:ok', result: text, scanType: 'QR_CODE', charSet: 'UTF-8' })
  }
  function makeRoundImage(image, width, height) {
    if (!width || !height) throw new Error('画面还未准备好，请先开启相机或从相册选图')
    const photo = document.createElement('canvas')
    const scale = Math.min(1, 1280 / Math.max(width, height))
    photo.width = Math.max(1, Math.round(width * scale))
    photo.height = Math.max(1, Math.round(height * scale))
    const ctx = photo.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法读取图片，请使用微信扫码')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, photo.width, photo.height)
    ctx.drawImage(image, 0, 0, photo.width, photo.height)
    let result = photo.toDataURL('image/jpeg', 0.82)
    if (result.length > 1398127) result = photo.toDataURL('image/jpeg', 0.65)
    if (result.length > 1398127) throw new Error('图片过大，请让圆码靠近并减少背景后重试')
    return result
  }
  async function recognizeRoundCode() {
    if (closed || roundBusy || !roundSupported) return
    let image
    try { image = roundImage || makeRoundImage(video, video.videoWidth, video.videoHeight) }
    catch (error) { status.textContent = error.message; return }
    roundBusy = true
    clearTimeout(timer)
    const job = ++imageJob
    const isActive = () => !closed && job === imageJob && !document.hidden
    status.textContent = '正在联网识别这一张圆码图片，请稍候…'
    try {
      const { resolveWebRoundCode } = roundModule || await import('./h5-roundcode.js')
      if (!isActive()) return
      const result = await resolveWebRoundCode(image, isActive)
      if (!isActive()) return
      if (result) { roundFailures = 0; finish(result) }
      else { roundSupported = false; status.textContent = '识别已取消或账号已变化，请重新开启相机后重试' }
    } catch (error) {
      if (!isActive()) return
      const code = error?.statusCode || error?.httpStatus || error?.code
      if ([401, 403, 404, 405, 429, 501, 503].includes(code)) roundSupported = false
      status.textContent = [404, 405, 501].includes(code)
        ? '当前服务尚未支持网页圆码，请使用普通二维码或微信扫码'
        : error?.msg || error?.message || '圆码暂未识别成功，请换清晰图片或使用普通二维码'
    } finally {
      roundBusy = false
      nextRoundAt = Date.now() + 2500
      // Retry only while the page is current and a fresh candidate is seen.
      // Repeated failures require an explicit camera retry rather than a loop.
      if (isActive() && !closed && !roundImage && stream) {
        if (++roundFailures >= 3) roundSupported = false
        timer = setTimeout(() => resumeFrameScan?.(), 200)
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
      try {
        const zoom = track?.getCapabilities?.()?.zoom
        if (zoom && zoom.max >= 1.5 && zoom.min <= 1.5 && track.applyConstraints) {
          await track.applyConstraints({ advanced: [{ zoom: 1.5 }] })
        }
      } catch (_) { /* Optional zoom cannot prevent opening a usable camera. */ }
      if (closed || attempt !== generation) return
      video.srcObject = acquired
      acquired.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (!closed && attempt === generation) showError({ name: 'NotReadableError' })
      }, { once: true })
      await video.play()
      const decoder = await loadDecoder()
      if (closed || attempt !== generation) return
      clearTimeout(cameraTimeout)
      retry.disabled = false
      status.textContent = '将二维码完整放入画面，微信圆码会自动联网识别'
      let frames = 0
      function scanFrame() {
        if (closed || attempt !== generation || document.hidden) return
        try {
          if (video.readyState >= 2) {
            let text = readCode(video, video.videoWidth, video.videoHeight, decoder, 960)
            // Occasionally inspect the center at a higher effective resolution
            // for small codes. Full-frame scanning remains the primary path.
            if (!text && ++frames % 3 === 0) {
              text = readCode(video, video.videoWidth, video.videoHeight, decoder, 960, true)
            }
            if (text) {
              const now = Date.now()
              matching = text === previousCode && now - previousAt < 1500 ? matching + 1 : 1
              previousCode = text; previousAt = now
              if (matching >= 2) { found(text); return }
            } else if (roundSupported && !roundBusy && Date.now() >= nextRoundAt && Date.now() - lastRoundCheck >= 600) {
              lastRoundCheck = Date.now()
              canvas.width = Math.min(1920, video.videoWidth)
              canvas.height = Math.max(1, Math.round(video.videoHeight * canvas.width / video.videoWidth))
              if (canvas.height > 1920) { canvas.width = Math.round(canvas.width * 1920 / canvas.height); canvas.height = 1920 }
              context.drawImage(video, 0, 0, canvas.width, canvas.height)
              const candidate = detectRoundCodeCandidate(context.getImageData(0, 0, canvas.width, canvas.height))
              const stable = candidate && roundCandidate && Math.hypot(candidate.x - roundCandidate.x, candidate.y - roundCandidate.y) < 0.08
                && Math.abs(candidate.size - roundCandidate.size) <= roundCandidate.size * 0.4
              roundStable = candidate ? stable ? roundStable + 1 : 1 : 0
              roundCandidate = candidate
              if (roundStable >= 2) { void recognizeRoundCode(); return }
            }
          }
        } catch (error) { showError(error); return }
        timer = setTimeout(scanFrame, 200)
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
      const decoder = await loadDecoder()
      if (closed || job !== imageJob) return
      const text = readCode(image, image.naturalWidth, image.naturalHeight, decoder, 1600)
        || readCode(image, image.naturalWidth, image.naturalHeight, decoder, 2400)
      if (text) found(text)
      else {
        const factor = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight))
        canvas.width = Math.max(1, Math.round(image.naturalWidth * factor))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * factor))
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        if (!detectRoundCodeCandidate(context.getImageData(0, 0, canvas.width, canvas.height))) {
          status.textContent = '未检测到完整二维码，请选择更清晰且包含整个码的图片'
          return
        }
        roundImage = makeRoundImage(image, image.naturalWidth, image.naturalHeight)
        await recognizeRoundCode()
      }
    } catch (_) {
      if (!closed && job === imageJob) status.textContent = '图片暂时无法识别，请换一张图片或手动输入'
    } finally { URL.revokeObjectURL(url); image.src = '' }
  })
  root.querySelector('[data-action="close"]').onclick = cancel
  root.querySelector('[data-action="album"]').onclick = () => {
    imageJob++
    roundImage = ''
    releaseCamera()
    status.textContent = '请选择二维码图片，取消选图后可重新开启相机'
    fileInput.click()
  }
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
