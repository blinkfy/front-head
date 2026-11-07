// Permission sheets temporarily hide the app; they are not an intentional exit.
let pending = 0
export const realtimePermissionPending = () => pending > 0
export function requestRealtimePermissions(permissions) {
  return new Promise((resolve, reject) => {
    pending++
    uni.$emit('realtime:permission-changed')
    let finished = false
    const finish = (result, error) => {
      if (finished) return
      finished = true
      // Resume the Activity before opening camera/location foreground services.
      setTimeout(() => {
        pending--
        uni.$emit('realtime:permission-changed')
        if (error) reject(error); else resolve(result)
      }, 400)
    }
    try { plus.android.requestPermissions(permissions, value => finish(value), error => finish(null, error)) }
    catch (error) { finish(null, error) }
  })
}
