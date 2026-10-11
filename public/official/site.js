(() => {
  const config = window.FENTOUXIA_OFFICIAL || {}
  document.querySelectorAll('[data-config]').forEach(element => {
    const value = config[element.dataset.config]
    if (typeof value === 'string' && value.trim()) element.textContent = value
  })
  document.querySelectorAll('[data-optional]').forEach(element => {
    element.hidden = !String(config[element.dataset.optional] || '').trim()
  })

  // 配置外链只接受 http(s)，避免占位地址和不安全协议成为公开入口。
  function publicUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return ''
    try {
      const url = new URL(value, window.location.href)
      return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
    } catch (_) {
      return ''
    }
  }
  const downloadUrl = publicUrl(config.downloadUrl)
  if (downloadUrl) {
    document.querySelectorAll('[data-download]').forEach(download => {
      download.href = downloadUrl
      download.textContent = config.downloadLabel || '获取分投侠'
      download.hidden = false
    })
  }
  const webUrl = publicUrl(config.webUrl)
  if (webUrl) {
    document.querySelectorAll('[data-web]').forEach(link => { link.href = webUrl })
  }
  const developerUrl = publicUrl(config.developerUrl)
  if (developerUrl) {
    document.querySelectorAll('[data-developer-link]').forEach(link => { link.href = developerUrl })
  }
  const icpLink = document.querySelector('[data-icp-link]')
  const icpUrl = publicUrl(config.icpUrl)
  if (icpLink && config.icp && icpUrl) {
    icpLink.href = icpUrl
    icpLink.textContent = config.icp
    icpLink.hidden = false
    document.querySelector('[data-config="icp"]').hidden = true
  }
  const promoVideo = document.querySelector('[data-promo-video]')
  const promoVideoUrl = publicUrl(config.promoVideoUrl)
  if (promoVideo && promoVideoUrl) {
    document.querySelector('[data-promo-section]').hidden = false
    const button = document.querySelector('[data-promo-play]')
    let player
    let library
    async function loadPlayer() {
      if (window.Hls) return
      library ||= new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = './official/hls.min.js'
        script.onload = resolve
        script.onerror = () => { library = null; reject(new Error('HLS player unavailable')) }
        document.head.appendChild(script)
      })
      await library
    }
    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = '视频加载中…'
      document.querySelector('[data-video-error]').hidden = true
      try {
        if (promoVideo.canPlayType('application/vnd.apple.mpegurl')) {
          promoVideo.src = promoVideoUrl
        } else {
          await loadPlayer()
          if (!window.Hls.isSupported()) throw new Error('HLS playback unsupported')
          player?.destroy()
          player = new window.Hls()
          await new Promise((resolve, reject) => {
            player.on(window.Hls.Events.MANIFEST_PARSED, resolve)
            player.on(window.Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                document.querySelector('[data-video-error]').hidden = false
                button.hidden = false
                button.textContent = '重试播放'
                reject(new Error(data.details))
              }
            })
            player.loadSource(promoVideoUrl)
            player.attachMedia(promoVideo)
          })
        }
        promoVideo.controls = true
        await promoVideo.play()
        button.hidden = true
      } catch (_) {
        document.querySelector('[data-video-error]').hidden = false
        button.textContent = '重试播放'
      } finally {
        button.disabled = false
      }
    })
    promoVideo.addEventListener('error', () => {
      document.querySelector('[data-video-error]').hidden = false
    })
  }
  document.querySelectorAll('.mobile-nav a').forEach(link => {
    link.addEventListener('click', () => link.closest('details').removeAttribute('open'))
  })
})()
