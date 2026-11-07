import { recordingRow } from './call-recording-preference.mjs'

let database
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持本地录音存储')); return }
    const request = indexedDB.open('ftx-call-recordings', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('recordings', { keyPath: 'id' }).createIndex('owner', 'owner')
      db.createObjectStore('chunks', { keyPath: ['id', 'index'] })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = null }
      resolve(db)
    }
    request.onerror = () => reject(new Error('无法打开本地录音存储'))
    request.onblocked = () => reject(new Error('本地存储正被旧页面占用，请关闭旧页面后重试'))
  }).catch(error => { database = null; throw error })
  return database
}
async function transaction(stores, mode, action) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    let value
    tx.oncomplete = () => resolve(typeof value === 'function' ? value() : value)
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('录音存储操作失败'))
    try { value = action(tx) } catch (error) { tx.abort(); reject(error) }
  })
}
const chunkRange = id => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])
const recordingInProgress = row => row.status === 'recording' && Date.now() - (row.updatedAt || row.createdAt) < 15000
async function changeRow(id, owner, stores, action) {
  const error = await transaction(['recordings', ...stores], 'readwrite', tx => {
    const store = tx.objectStore('recordings'), request = store.get(id)
    let failure = ''
    request.onsuccess = () => {
      const row = request.result
      if (!row || row.owner !== owner) { failure = '录音不存在或不属于当前账号'; return }
      failure = action(row, store, tx) || ''
    }
    return () => failure
  })
  if (error) throw new Error(error)
}
export const webRecordingStorage = {
  create: row => transaction(['recordings'], 'readwrite', tx => tx.objectStore('recordings').add(row)),
  append: (id, index, blob, owner) => changeRow(id, owner, ['chunks'], (row, store, tx) => {
    if (row.status !== 'recording') return '录音已结束'
    tx.objectStore('chunks').add({ id, index, blob })
    store.put({ ...row, updatedAt: Date.now(), size: row.size + blob.size, durationMs: Date.now() - row.createdAt })
  }),
  finish: (id, patch, owner) => changeRow(id, owner, [], (row, store) => { store.put({ ...row, ...patch }) }),
  remove: (id, owner, force = false) => changeRow(id, owner, ['chunks'], (row, store, tx) => {
    if (!force && recordingInProgress(row)) return '录音仍在进行，请结束后再删除'
    store.delete(id)
    tx.objectStore('chunks').delete(chunkRange(id))
  })
}
export async function listWebRecordings(owner) {
  const rows = await transaction(['recordings'], 'readonly', tx => {
    const request = tx.objectStore('recordings').index('owner').getAll(owner)
    return () => request.result
  })
  return rows.map(row => recordingRow({ ...row, status: row.status === 'recording' && !recordingInProgress(row) ? 'interrupted' : row.status }, owner))
    .filter(Boolean).sort((a, b) => b.createdAt - a.createdAt)
}
export async function readWebRecording(owner, id) {
  const blob = await transaction(['recordings', 'chunks'], 'readonly', tx => {
    const request = tx.objectStore('recordings').get(id)
    let result
    request.onsuccess = () => {
      const row = request.result
      if (row?.owner !== owner || row.status !== 'saved') return
      const chunks = tx.objectStore('chunks').getAll(chunkRange(id))
      chunks.onsuccess = () => { result = new Blob(chunks.result.map(chunk => chunk.blob), { type: row.mimeType }) }
    }
    return () => result
  })
  if (!blob?.size) throw new Error('录音未完整保存或不属于当前账号')
  return blob
}
export const deleteWebRecording = (owner, id) => webRecordingStorage.remove(id, owner)
export async function renameWebRecording(owner, id, name) {
  const trimmed = String(name).trim().slice(0, 80)
  if (!trimmed) throw new Error('请填写录音名称')
  await changeRow(id, owner, [], (row, store) => {
    if (recordingInProgress(row)) return '录音仍在进行，请结束后再重命名'
    store.put({ ...row, name: trimmed })
  })
}
