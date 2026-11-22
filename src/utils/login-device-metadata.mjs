const LOGIN_PATH = /^(?:login|wechat\/(?:login|password-login)|mfa\/(?:verify|password|wechat\/status)|biometric\/login\/finish|quick-login\/(?:passkey|soter)\/login\/finish|registration\/sessions\/[^/]+\/consume)\/?$/i

function deviceValue(value) {
  return typeof value === 'string' ? value.trim().slice(0, 64) : ''
}

function encodeDevice(runtime, client) {
  try {
    const info = runtime.getDeviceInfo?.() || {}
    if (info.platform !== 'devtools') {
      return encodeURIComponent(JSON.stringify({
        client,
        os: deviceValue(info.osName || info.system || info.platform),
        brand: deviceValue(info.deviceBrand || info.brand),
        model: deviceValue(info.deviceModel || info.model)
      }))
    }
  } catch (_) {
    // Older runtimes can still report the app channel when device details are unavailable.
  }
  return encodeURIComponent(JSON.stringify({ client }))
}

export function installLoginDeviceMetadata(runtime, baseUrl, client) {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/`
  runtime.addInterceptor?.('request', {
    invoke(options) {
      const { url, method } = options
      if (String(method).toUpperCase() !== 'POST' || typeof url !== 'string' || !url.startsWith(root)) return
      const path = url.slice(root.length).split(/[?#]/, 1)[0]
      if (!LOGIN_PATH.test(path)) return
      if (/^mfa\/wechat\/status\/?$/i.test(path) && options.data?.consume !== true) return
      options.header = { ...options.header, 'X-FTX-Login-Device': encodeDevice(runtime, client) }
    }
  })
}
