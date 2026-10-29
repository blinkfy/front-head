import './recognition-camera-h5.css'

export function captureRecognitionPhoto({ recognition = true } = {}) {
  return new Promise((resolve, reject) => {
    const root = document.createElement('section')
    root.className = 'recognition-camera'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', '拍照识别')
    root.innerHTML = `
      <header class="recognition-camera-header">
        <button type="button" class="recognition-camera-icon" data-action="close" aria-label="返回"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button>
        <span>拍照识别</span>
      </header>
      <div class="recognition-camera-stage">
        <video class="recognition-camera-video" autoplay muted playsinline webkit-playsinline></video>
        <div class="recognition-camera-message" role="status"><p class="recognition-camera-status" data-status>正在打开相机，请允许浏览器使用摄像头…</p><button type="button" data-action="retry" hidden>重试</button><button type="button" data-action="album" hidden>从相册选择</button></div>
      </div>
      <footer class="recognition-camera-footer">
        <p class="recognition-camera-hint">拍照后自动识别</p>
        <div class="recognition-camera-controls">
          <button type="button" class="recognition-camera-icon" data-action="torch" aria-label="补光灯" hidden disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h6l-1 8 9-13h-7Z"/></svg><span class="recognition-camera-icon-label" data-torch-label>补光</span></button>
          <button type="button" class="recognition-camera-shutter" data-action="capture" aria-label="拍照并识别" disabled><span class="recognition-camera-shutter-core"></span></button>
          <button type="button" class="recognition-camera-icon" data-action="flip" aria-label="切换摄像头" hidden disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><path d="M9 13a3 3 0 0 1 5-1m1 3a3 3 0 0 1-5 1m4-6v3h-3m-1 5v-3h3"/></svg><span class="recognition-camera-icon-label">翻转</span></button>
        </div>
        <p class="recognition-camera-mode">拍照</p>
      </footer>`
    if (!recognition) {
      root.setAttribute('aria-label', '拍照')
      root.querySelector('.recognition-camera-header span').textContent = '拍照'
      root.querySelector('.recognition-camera-hint').textContent = '拍摄后使用这张照片'
      root.querySelector('[data-action="capture"]').setAttribute('aria-label', '拍照')
    }
    const video = root.querySelector('video')
    const message = root.querySelector('.recognition-camera-message')
    const status = root.querySelector('[data-status]')
    const button = name => root.querySelector(`[data-action="${name}"]`)
    const shutter = button('capture'), flip = button('flip'), torch = button('torch')
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    let stream = null, closed = false, generation = 0, timeout = null
    let cameraDevices = [], selectedDeviceId = '', torchOn = false, takingPhoto = false

    function releaseStream() {
      video.onloadeddata = null
      stream?.getTracks().forEach(track => track.stop())
      stream = null
      video.srcObject = null
    }
    function finish(result, error) {
      if (closed) return
      closed = true
      generation++
      clearTimeout(timeout)
      releaseStream()
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', cancel)
      window.removeEventListener('hashchange', cancel)
      root.remove()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true })
      error ? reject(error) : resolve(result)
    }
    function cancel() { finish(null, { errMsg: 'chooseImage:fail cancel' }) }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); cancel() }
      if (event.key === 'Tab') {
        const buttons = [...root.querySelectorAll('button')].filter(item => !item.disabled && !item.hidden)
        const index = buttons.indexOf(document.activeElement)
        if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)?.focus() }
        else if (!event.shiftKey && index === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus() }
      }
    }
    function onVisibility() { if (document.hidden) cancel() }
    function showError(error) {
      if (closed) return
      generation++
      takingPhoto = false
      if (['NotFoundError', 'OverconstrainedError'].includes(error?.name)) selectedDeviceId = ''
      clearTimeout(timeout)
      releaseStream()
      shutter.disabled = true
      flip.disabled = true
      torch.disabled = true
      flip.hidden = true
      torch.hidden = true
      status.textContent = ['NotAllowedError', 'SecurityError'].includes(error?.name)
        ? '无法使用相机，请检查浏览器的摄像头权限，或从相册选择图片。'
        : error?.name === 'NotFoundError'
          ? '未找到可用摄像头，可以从相册选择图片。'
          : '相机暂时无法使用，请重试或从相册选择图片。'
      message.hidden = false
      button('retry').hidden = false
      button('album').hidden = false
    }
    async function startCamera() {
      const attempt = ++generation
      clearTimeout(timeout)
      releaseStream()
      shutter.disabled = true
      flip.disabled = true
      torch.disabled = true
      flip.hidden = true
      torch.hidden = true
      torchOn = false
      root.querySelector('[data-torch-label]').textContent = '补光'
      message.hidden = false
      status.textContent = '正在打开相机，请允许浏览器使用摄像头…'
      button('retry').hidden = true
      button('album').hidden = true
      timeout = setTimeout(() => {
        if (closed || attempt !== generation) return
        generation++
        showError({ name: 'TimeoutError' })
      }, 12000)
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: { ideal: 'environment' } }),
          width: { ideal: 1600 }, height: { ideal: 1200 }
        } })
        if (closed || attempt !== generation) { acquired.getTracks().forEach(track => track.stop()); return }
        stream = acquired
        video.srcObject = acquired
        await video.play()
        if (closed || attempt !== generation) return
        clearTimeout(timeout)
        const track = acquired.getVideoTracks()[0]
        track?.addEventListener('ended', () => { if (!closed && attempt === generation) showError() }, { once: true })
        let capabilities = {}
        try { capabilities = track?.getCapabilities?.() || {} } catch (_) {}
        torch.disabled = !(capabilities.torch && typeof track?.applyConstraints === 'function')
        torch.hidden = torch.disabled
        message.hidden = true
        shutter.disabled = !(video.videoWidth && video.videoHeight)
        // Frame metadata can arrive after play() resolves on mobile browsers.
        video.onloadeddata = () => { if (!closed && attempt === generation) shutter.disabled = false }
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (!closed && attempt === generation) {
            cameraDevices = [...new Map(devices.filter(device => device.kind === 'videoinput' && device.deviceId)
              .map(device => [device.deviceId, device])).values()]
            selectedDeviceId = track?.getSettings?.()?.deviceId || selectedDeviceId
            flip.disabled = cameraDevices.length < 2 || !cameraDevices.some(device => device.deviceId === selectedDeviceId)
            flip.hidden = flip.disabled
          }
        } catch (_) { /* Capturing still works when device enumeration is unavailable. */ }
      } catch (error) { if (!closed && attempt === generation) showError(error) }
    }
    button('close').onclick = cancel
    button('album').onclick = () => finish({ useAlbum: true })
    button('retry').onclick = () => { void startCamera() }
    flip.onclick = () => {
      if (takingPhoto || cameraDevices.length < 2) return
      const index = cameraDevices.findIndex(device => device.deviceId === selectedDeviceId)
      selectedDeviceId = cameraDevices[(index + 1) % cameraDevices.length].deviceId
      void startCamera()
    }
    torch.onclick = async () => {
      const attempt = generation
      const track = stream?.getVideoTracks()[0]
      torch.disabled = true
      try {
        await track?.applyConstraints({ advanced: [{ torch: !torchOn }] })
        if (closed || attempt !== generation) return
        torchOn = !torchOn
        root.querySelector('[data-torch-label]').textContent = torchOn ? '已开启' : '补光'
        torch.setAttribute('aria-pressed', String(torchOn))
      } catch (_) {
        if (!closed && attempt === generation) torch.hidden = true
      } finally { if (!closed && attempt === generation) torch.disabled = torch.hidden }
    }
    shutter.onclick = () => {
      if (closed || takingPhoto || !video.videoWidth || !video.videoHeight) return
      takingPhoto = true
      shutter.disabled = true
      flip.disabled = true
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      try {
        const context = canvas.getContext('2d')
        if (!context) throw new Error('canvas unavailable')
        context.drawImage(video, 0, 0)
        canvas.toBlob(blob => {
          if (closed) return
          if (!blob) { takingPhoto = false; showError(); return }
          const file = new File([blob], `recognition_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const path = URL.createObjectURL(file)
          // Each caller owns its preview URL; another photo must not invalidate it.
          finish({ tempFilePaths: [path], tempFiles: [file] })
        }, 'image/jpeg', .92)
      } catch (_) { takingPhoto = false; showError() }
    }
    document.body.append(root)
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', cancel)
    window.addEventListener('hashchange', cancel)
    button('close').focus()
    void startCamera()
  })
}
