const DEFAULT_DURATION = 120
const DOUBLE_PULSE_GAP = 120

function getRuntime(runtime) {
  if (runtime) return runtime
  // uni-app may supply `uni` through its module compiler rather than globalThis.
  return {
    plus: typeof plus === 'undefined' ? undefined : plus,
    uni: typeof uni === 'undefined' ? undefined : uni,
    navigator: typeof navigator === 'undefined' ? undefined : navigator
  }
}

function vibrateWithUni(uniApi) {
  if (typeof uniApi?.vibrateShort !== 'function') return vibrateLongWithUni(uniApi)
  return new Promise(resolve => {
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }
    const fallback = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      vibrateLongWithUni(uniApi).then(resolve)
    }
    const timeout = setTimeout(() => finish(true), 250)
    try {
      const result = uniApi.vibrateShort({ type: 'heavy', success: () => finish(true), fail: fallback })
      if (result && typeof result.then === 'function') result.then(() => finish(true), fallback)
    } catch (_) { fallback() }
  })
}

function vibrateLongWithUni(uniApi) {
  if (typeof uniApi?.vibrateLong !== 'function') return Promise.resolve(false)
  return new Promise(resolve => {
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }
    const timeout = setTimeout(() => finish(true), 250)
    try {
      const result = uniApi.vibrateLong({ success: () => finish(true), fail: () => finish(false) })
      if (result && typeof result.then === 'function') result.then(() => finish(true), () => finish(false))
    } catch (_) { finish(false) }
  })
}

/** One best-effort pulse; the selected runtime API is never followed by another on success. */
export function vibrateHaptic(duration = DEFAULT_DURATION, runtime) {
  const env = getRuntime(runtime)
  const milliseconds = Math.max(80, Math.min(200, Number(duration) || DEFAULT_DURATION))

  const isAppRuntime = Boolean(env.plus)
  try {
    if (typeof env.plus?.device?.vibrate === 'function') {
      env.plus.device.vibrate(milliseconds)
      return Promise.resolve(true)
    }
  } catch (_) { /* Fall through to the runtime's next supported haptics API. */ }

  if (isAppRuntime) return vibrateWithUni(env.uni)

  try {
    if (typeof env.navigator?.vibrate === 'function') {
      return Promise.resolve(env.navigator.vibrate(milliseconds) !== false)
    }
  } catch (_) { /* Fall through to uni-app APIs. */ }

  return vibrateWithUni(env.uni)
}

/** Pattern 0 is one pulse, pattern 1 is one longer pulse, and pattern 2 is two bounded pulses. */
export async function vibrateHapticPattern(pattern = 0, runtime) {
  const durations = pattern === 2 ? [100, 100] : [pattern === 1 ? 160 : DEFAULT_DURATION]
  for (let index = 0; index < durations.length; index++) {
    if (!await vibrateHaptic(durations[index], runtime)) return false
    if (index + 1 < durations.length) await new Promise(resolve => setTimeout(resolve, durations[index] + DOUBLE_PULSE_GAP))
  }
  return true
}

export function vibrateScan(runtime) {
  return vibrateHaptic(160, runtime)
}
