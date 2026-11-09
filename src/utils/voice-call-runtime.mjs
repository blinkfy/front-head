// In-memory only: neither media nor account credentials are persisted here.
const key = Symbol.for('fentouxia.voice-call.runtime.v1')
export function sharedVoiceCallRuntime(create, realm = globalThis) {
  if (!realm[key]) Object.defineProperty(realm, key, { value: create(), configurable: true })
  return realm[key]
}
