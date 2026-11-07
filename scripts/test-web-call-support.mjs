import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(new URL('../src/utils/web-call-support.js', import.meta.url))
const source = fs.readFileSync(sourcePath, 'utf8')

function setup({ permission = 'default', permissionError = null, notificationError = null } = {}) {
  const calls = { requested: 0, notifications: [], focuses: 0, opened: 0, ringtoneUpdates: [] }
  class MockNotification {
    static permission = permission
    static requestPermission() {
      calls.requested++
      return permissionError ? Promise.reject(permissionError) : Promise.resolve(MockNotification.permission)
    }
    constructor(title, options) {
      if (notificationError) throw notificationError
      this.title = title; this.options = options; this.closed = 0; calls.notifications.push(this)
    }
    close() { this.closed++ }
  }
  const document = { hidden: false, title: 'Original title' }
  const context = {
    globalThis: null, isSecureContext: true, RTCPeerConnection: function () {},
    navigator: { mediaDevices: { getUserMedia() {} } }, Notification: MockNotification,
    document, window: { focus() { calls.focuses++ } }, Promise,
    updateWebCallRingtone: value => calls.ringtoneUpdates.push(value),
  }
  context.globalThis = context
  vm.createContext(context)
  const compiled = source.replace(/^import .* from .*$/gm, '')
    .replace(/^export function /gm, 'function ')
    .replace(/^export async function /gm, 'async function ')
  vm.runInContext(`${compiled}\nglobalThis.api = { webCallsAvailable, webCallNotificationsAvailable, requestWebCallNotifications, updateWebCallAlert, refreshWebCallAlert }`, context)
  return { api: context.api, calls, document, Notification: MockNotification }
}

const state = (phase, callId = 'call-one', name = 'Peer', mode = 'audio') => ({ phase, callId, peer: { name }, mode })

async function main() {
  {
    const { api, Notification } = setup()
    assert.equal(await api.requestWebCallNotifications(), 'default')
    Notification.permission = 'denied'
    assert.equal(await api.requestWebCallNotifications(), 'denied', 'a denied browser permission is returned as denied')
    const thrown = setup({ permissionError: new Error('permission prompt failed') })
    assert.equal(await thrown.api.requestWebCallNotifications(), 'denied', 'permission prompt exceptions degrade to denied')
  }

  {
    const { api, calls, document, Notification } = setup({ permission: 'granted' })
    let opened = 0
    document.hidden = false
    api.updateWebCallAlert(state('incoming'), { open: () => opened++ })
    assert.equal(calls.notifications.length, 0, 'visible page does not create a browser notification')
    assert.equal(calls.ringtoneUpdates.length, 1, 'every call update also updates the ringtone')
    document.hidden = true
    api.refreshWebCallAlert()
    assert.equal(calls.notifications.length, 1, 'hidden page creates a notification for an incoming call')
    const first = calls.notifications[0]
    assert.equal(first.options.silent, true, 'browser notifications are silent to avoid double ringing')
    api.updateWebCallAlert(state('incoming'), { open: () => opened++ })
    assert.equal(calls.ringtoneUpdates.length, 3, 'repeated incoming state is forwarded to the ringtone controller')
    assert.equal(calls.notifications.length, 1, 'repeated updates for the same call do not duplicate its notification')
    assert.match(document.title, /Peer/)

    api.updateWebCallAlert(state('incoming', 'call-two', 'New peer', 'video'), { open: () => opened++ })
    assert.equal(first.closed, 1, 'changing call closes the previous notification')
    const second = calls.notifications[1]
    first.onclick()
    assert.equal(opened, 0, 'clicking an old notification cannot open the newer call')
    second.onclick()
    assert.equal(calls.focuses, 1)
    assert.equal(opened, 1, 'clicking the current notification focuses and opens the call')
    assert.equal(second.closed, 1, 'clicking the current notification closes it')

    api.updateWebCallAlert(state('incoming', 'call-three', 'Another peer'), { open: () => opened++ })
    const third = calls.notifications[2]
    api.updateWebCallAlert(state('idle', 'call-three'), { open: () => opened++ })
    assert.equal(document.title, 'Original title', 'leaving incoming state restores the page title')
    assert.equal(third.closed, 1, 'ending the call closes its notification')
    assert.equal(Notification.permission, 'granted')
  }

  {
    const { api, calls, document } = setup({ permission: 'denied' })
    document.hidden = true
    api.updateWebCallAlert(state('incoming'))
    assert.equal(calls.notifications.length, 0, 'denied notification permission never constructs a browser notification')
  }

  {
    const { api, calls, document } = setup({ notificationError: new Error('unsupported notification constructor') })
    document.hidden = true
    assert.doesNotThrow(() => api.updateWebCallAlert(state('incoming')),
      'unsupported browser notification constructors do not break call state updates')
    assert.equal(calls.notifications.length, 0)
  }
  console.log('Web call notification support tests passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
