import { assertAsrCurrent, localFirstAsr } from './local-asr-core.mjs'
// #ifdef H5
import { transcribeWebLocalFiles, webLocalAsrAvailable } from './web-local-asr.mjs'
// #endif
// #ifdef APP-PLUS
import { localSpeechRequest, localSpeechCancel } from '@/uni_modules/ftx-local-asr'
// #endif

let nextRequest = 0

// #ifdef APP-PLUS
function nativeRequest(input, options = {}) {
  return new Promise(resolve => {
    const id = `local-asr-${Date.now()}-${++nextRequest}`
    let finished = false, timer, watcher
    const done = result => {
      if (finished) return
      finished = true; clearTimeout(timer); clearInterval(watcher); options.signal?.removeEventListener('abort', cancel)
      resolve(result)
    }
    const cancel = () => { try { localSpeechCancel(id) } catch (_) {}; done(null) }
    if (options.signal?.aborted || options.isCurrent?.() === false) { done(null); return }
    options.signal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => {
      done({ error: 'TIMEOUT' })
      try { localSpeechCancel(id) } catch (_) {}
    }, input.action === 'available' ? 1500 : 22000)
    watcher = setInterval(() => { if (options.isCurrent?.() === false) cancel() }, 250)
    try {
      localSpeechRequest(JSON.stringify({ ...input, id }), result => {
        try { done(JSON.parse(result)) } catch (_) { done(null) }
      })
    } catch (_) { done(null) }
  })
}
// #endif

export async function localAsrAvailable(options = {}) {
  assertAsrCurrent(options)
  let available = false
  // #ifdef H5
  available = await webLocalAsrAvailable()
  // #endif
  // #ifdef APP-PLUS
  available = !!(await nativeRequest({ action: 'available' }, options))?.available
  // #endif
  // Small programs have no verified on-device file-recognition API. Do not
  // replace a known cloud provider with an SDK that silently uploads elsewhere.
  assertAsrCurrent(options)
  return available
}

export async function transcribeLocalAudio(files, options = {}) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [files].filter(Boolean)
  if (!list.length) return null
  assertAsrCurrent(options)
  let result = null
  // #ifdef H5
  result = await transcribeWebLocalFiles(list, options)
  // #endif
  // #ifdef APP-PLUS
  if (await localAsrAvailable(options)) {
    const paths = list.map(path => {
      const local = String(path)
      if (/^https?:|^blob:|^wxfile:/i.test(local)) return ''
      if (local.startsWith('/')) return local
      return plus.io.convertLocalFileSystemURL(local).replace(/^file:\/\//i, '')
    })
    if (paths.every(Boolean)) result = await nativeRequest({ action: 'recognize', paths }, options)
  }
  // #endif
  assertAsrCurrent(options)
  const text = String(result?.text || '').trim()
  if (text) return { text, local: true }
  return options.includeFailureReason && result?.error ? { reason: result.error } : null
}

export { localFirstAsr }
