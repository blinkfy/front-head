// Only an explicit unbound result warrants a reminder. Old servers and outages
// must not prevent an otherwise successful login.
export async function remindUnboundWechat({ getSettings, showReminder, isCurrent,
  schedule = setTimeout, unschedule = clearTimeout, timeoutMs = 4000 }) {
  let timer
  try {
    const result = await Promise.race([
      getSettings(),
      new Promise(resolve => { timer = schedule(() => resolve(null), timeoutMs) })
    ])
    if (timer !== undefined) { unschedule(timer); timer = undefined }
    if (result?.code === 0 && result.data?.bound === false && isCurrent()) await showReminder()
  } catch (_) {
    // Reminder lookup/display failure is non-fatal.
  } finally {
    if (timer !== undefined) unschedule(timer)
  }
}
