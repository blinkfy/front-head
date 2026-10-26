let sequence = 0
let activeTask = null
let activeOwner = null
const listeners = new Set()

function currentOwner() {
  try {
    const runtime = typeof uni !== 'undefined' ? uni : globalThis.uni
    return String(runtime?.getStorageSync('token') || '')
  } catch (_) { return '' }
}

function notify(reason) {
  for (const listener of listeners) {
    try {
      listener(activeTask, reason)
    } catch (error) {
      console.warn('[recognition-task] listener failed:', error)
    }
  }
}

function discardOtherOwner() {
  if (!activeTask || activeOwner === currentOwner()) return false
  activeTask = null
  activeOwner = null
  notify('owner-changed')
  return true
}

// This module deliberately keeps only the current app-session task in memory.
// Persisting image Base64 to storage would add avoidable quota pressure.
export function beginRecognitionTask(message = '图片处理中...', source = null) {
  discardOtherOwner()
  sequence += 1
  activeOwner = currentOwner()
  activeTask = {
    id: `recognition_${Date.now()}_${sequence}`,
    status: 'pending',
    message,
    startedAt: Date.now(),
    source,
    preview: null,
    revision: -1,
    result: null,
    error: null
  }
  notify()
  return activeTask.id
}

export function updateRecognitionTask(taskId, message) {
  if (discardOtherOwner()) return
  if (!activeTask || activeTask.id !== taskId || activeTask.status !== 'pending') return
  activeTask = { ...activeTask, message: String(message || '识别中...') }
  notify()
}

export function updateRecognitionPreview(taskId, snapshot) {
  if (discardOtherOwner()) return
  if (!activeTask || activeTask.id !== taskId || activeTask.status !== 'pending') return
  if (!snapshot || !Number.isInteger(snapshot.revision) || snapshot.revision <= activeTask.revision) return
  activeTask = {
    ...activeTask,
    revision: snapshot.revision,
    preview: snapshot.preview && typeof snapshot.preview === 'object' ? snapshot.preview : null,
    phase: snapshot.phase || activeTask.phase || ''
  }
  notify()
}

export function completeRecognitionTask(taskId, result) {
  if (discardOtherOwner()) return
  if (!activeTask || activeTask.id !== taskId) return
  activeTask = { ...activeTask, status: 'succeeded', message: '识别完成！', result, error: null }
  notify()
}

export function failRecognitionTask(taskId, error) {
  if (discardOtherOwner()) return
  if (!activeTask || activeTask.id !== taskId) return
  activeTask = { ...activeTask, status: 'failed', message: '处理失败', error: error || null }
  notify()
}

export function getRecognitionTask() {
  discardOtherOwner()
  return activeTask
}

export function isRecognitionTaskCurrent(taskId) {
  discardOtherOwner()
  return Boolean(activeTask && activeTask.id === taskId)
}

export function clearRecognitionTask(taskId = null) {
  if (discardOtherOwner()) return
  if (taskId && (!activeTask || activeTask.id !== taskId)) return
  activeTask = null
  activeOwner = null
  notify()
}

export function subscribeRecognitionTask(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  if (!discardOtherOwner()) listener(activeTask)
  return () => listeners.delete(listener)
}
