let sequence = 0
let activeTask = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) {
    try {
      listener(activeTask)
    } catch (error) {
      console.warn('[recognition-task] listener failed:', error)
    }
  }
}

// This module deliberately keeps only the current app-session task in memory.
// Persisting image Base64 to storage would add avoidable quota pressure.
export function beginRecognitionTask(message = '图片处理中...') {
  sequence += 1
  activeTask = {
    id: `recognition_${Date.now()}_${sequence}`,
    status: 'pending',
    message,
    result: null,
    error: null
  }
  notify()
  return activeTask.id
}

export function updateRecognitionTask(taskId, message) {
  if (!activeTask || activeTask.id !== taskId || activeTask.status !== 'pending') return
  activeTask = { ...activeTask, message: String(message || '识别中...') }
  notify()
}

export function completeRecognitionTask(taskId, result) {
  if (!activeTask || activeTask.id !== taskId) return
  activeTask = { ...activeTask, status: 'succeeded', message: '识别完成！', result, error: null }
  notify()
}

export function failRecognitionTask(taskId, error) {
  if (!activeTask || activeTask.id !== taskId) return
  activeTask = { ...activeTask, status: 'failed', message: '处理失败', error: error || null }
  notify()
}

export function getRecognitionTask() {
  return activeTask
}

export function clearRecognitionTask(taskId = null) {
  if (taskId && (!activeTask || activeTask.id !== taskId)) return
  activeTask = null
  notify()
}

export function subscribeRecognitionTask(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  listener(activeTask)
  return () => listeners.delete(listener)
}
