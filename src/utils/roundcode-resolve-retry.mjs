// An index miss cannot prove the generating client supports registration. Only allow a brief grace retry.
export async function resolveRoundCodeWithRetry(resolve, { isActive = () => true, onPending = () => {},
  wait = delay => new Promise(done => setTimeout(done, delay)) } = {}) {
  const delays = [400, 800]
  for (let attempt = 0; ; attempt++) {
    if (!isActive()) return null
    try {
      const result = await resolve()
      return isActive() ? result : null
    } catch (error) {
      if (!isActive()) return null
      const reason = error?.reason || error?.data?.reason
      const pending = reason === 'ROUND_CODE_PENDING_REGISTRATION' || reason === 'ROUND_CODE_UNSUPPORTED'
      if (!pending || attempt >= delays.length) throw error
      try { onPending(attempt + 1) } catch (_) { /* A status hint cannot interrupt resolution. */ }
      await wait(delays[attempt])
    }
  }
}
