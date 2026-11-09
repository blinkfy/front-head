import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/static/manifest.json'), 'utf8'))
const catalogSource = fs.readFileSync(path.join(root, 'src/pages-admin/database.vue'), 'utf8')
const catalog = vm.runInNewContext(catalogSource.match(/const legacyTableCatalog = (\[[\s\S]*?\n\])/)[1])
const newTables = ['ShopProduct', 'UserLoginLocation', 'BiometricCredential', 'BiometricChallenge',
  'PlatformLoginCredential', 'PlatformLoginChallenge', 'CollectorProfile', 'CollectorApplication',
  'CollectorAvailability', 'RecyclingServiceArea', 'RecyclingLock', 'BookingOrderEvent', 'BookingChatBinding',
  'RecyclingRequest', 'RecyclingDelivery', 'RecyclingDeviceDelivery']
const resolverSource = fs.readFileSync(path.join(root, 'src/utils/manifest-icons.js'), 'utf8')
const { NON_THEME_ONLY_ICON_IDS } = await import('../src/utils/mp-subpackage-icons.mjs')
for (const [platform, flags] of [['MP', { MP: true, MP_WEIXIN: true }], ['H5', { H5: true }]]) {
  const code = preprocess(resolverSource, flags, { type: 'js' }).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ manifest, NON_THEME_ONLY_ICON_IDS })
  vm.runInContext(code + '\nglobalThis.resolveIcon = getManifestIconPath', context)
  for (const id of ['chat_voice_call', 'chat_video_call', 'call_recordings', ...newTables.map(name => {
    const table = catalog.find(item => item.name === name)
    assert.ok(table?.icon, `${name} has a specific icon`)
    assert.notEqual(table.editable, false, `${name} is editable in the client catalog`)
    return table.icon
  })]) {
    const icon = manifest.find(entry => entry.id === id)
    assert.ok(icon, `${id} is registered`)
    const file = platform === 'MP' ? icon.mp_file : icon.file
    assert.ok(fs.existsSync(path.join(root, 'src/static', file)), `${platform} asset exists for ${id}`)
    const expected = platform === 'MP' && id.endsWith('_table') ? `/pages-admin/static/${file}` : `/static/${file}`
    assert.equal(context.resolveIcon(id), expected)
    if (platform === 'MP') assert.ok(fs.readFileSync(path.join(root, 'src/static', file)).subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${id} uses genuine PNG bytes in the mini program`)
  }
}
assert.ok(catalog.every(table => table.editable !== false), 'client catalog permits editing all tables')
assert.match(fs.readFileSync(path.join(root, 'src/pages-nonTheme/settings.vue'), 'utf8'), /id="call_recordings"/)
console.log('Admin table coverage, editable catalog, recording entry and platform icon assets passed.')
