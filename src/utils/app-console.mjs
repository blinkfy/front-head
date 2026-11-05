const LEVELS = ['log', 'info', 'warn', 'error', 'debug']
const PRIVATE_KEY = /token|jwt|password|passwd|secret|authorization|cookie|api[_-]?key|credential|private[_-]?key/i

function redact(text) {
  return String(text).slice(0, 8192)
    .replace(/\bBearer\s+[\w.+\/~=-]+/gi, 'Bearer [已隐藏]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[登录凭证已隐藏]')
    .replace(/((?:["']?)(?:[\w-]{0,48}(?:token|password|passwd|secret|authorization|cookie|api[_-]?key|jwt)[\w-]{0,48})(?:["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;&}\]]+)/gi, '$1[已隐藏]')
    .replace(/data:[^;,\s]+;base64,[\w+/=]+/gi, '[内嵌资源已省略]')
}

function formatArguments(args, maxLength) {
  const seen = new WeakSet()
  let remaining = 100
  function safe(value, depth = 0) {
    if (--remaining < 0) return '[已省略]'
    if (typeof value === 'string') return redact(value).slice(0, maxLength)
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
    if (value instanceof Error) return redact(`${value.name}: ${value.message}`)
    if (typeof value !== 'object') return `[${typeof value}]`
    if (seen.has(value)) return '[循环引用]'
    if (depth >= 4) return '[已省略]'
    seen.add(value)
    if (Array.isArray(value)) return value.slice(0, 20).map(item => safe(item, depth + 1))
    const result = Object.create(null)
    for (const key of Object.keys(value).slice(0, 25)) {
      if (PRIVATE_KEY.test(key)) { result[key] = '[已隐藏]'; continue }
      try { result[key] = safe(value[key], depth + 1) } catch (_) { result[key] = '[无法读取]' }
    }
    return result
  }
  return args.slice(0, 12).map(value => {
    try {
      const result = safe(value)
      return typeof result === 'string' ? result : JSON.stringify(result)
    } catch (_) { return '[无法显示]' }
  }).join(' ').slice(0, maxLength)
}

// Memory only: no network, disk writes, timer or global error-handler replacement.
export function createAppConsole({ limit = 120, maxLength = 1600, now = Date.now } = {}) {
  let entries = [], nextId = 0, identity = '', installed = null, recording = false, scheduled = false
  const listeners = new Set()
  function changed() {
    if (scheduled || !listeners.size) return
    scheduled = true
    Promise.resolve().then(() => {
      scheduled = false
      for (const callback of listeners) { try { callback() } catch (_) {} }
    })
  }
  function record(level, args) {
    if (recording) return
    recording = true
    try {
      entries.push({ id: ++nextId, time: now(), level, message: formatArguments(args, maxLength) })
      if (entries.length > limit) entries.splice(0, entries.length - limit)
      changed()
    } finally { recording = false }
  }
  function clear() { entries = []; changed() }
  return {
    install(target) {
      if (installed) return
      const methods = []
      for (const level of LEVELS) {
        const original = target[level]
        if (typeof original !== 'function') continue
        const wrapped = function (...args) {
          let result
          try { result = original.apply(target, args) } finally { try { record(level, args) } catch (_) {} }
          return result
        }
        try { target[level] = wrapped; methods.push({ level, original, wrapped }) } catch (_) {}
      }
      installed = { target, methods }
    },
    uninstall() {
      if (!installed) return
      for (const { level, original, wrapped } of installed.methods) {
        try { if (installed.target[level] === wrapped) installed.target[level] = original } catch (_) {}
      }
      installed = null
    },
    setIdentity(value = '') {
      const next = String(value || '')
      if (identity !== next) { identity = next; clear() }
    },
    snapshot: () => entries.map(entry => ({ ...entry })),
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback) },
    clear
  }
}

export const appConsole = createAppConsole()
