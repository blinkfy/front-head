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
function assertWebpAsset(file, label) {
  assert.match(file, /^(?:[^/]+\/)*[^/]+\.webp\.png$/, `${label} uses the canonical .webp.png filename`)
  const assetPath = path.join(root, 'src/static', file)
  assert.ok(fs.existsSync(assetPath), `${label} asset exists`)
  const bytes = fs.readFileSync(assetPath)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${label} starts with a WebP RIFF header`)
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${label} contains WebP bytes`)
}
const manifestIconFiles = new Set(manifest.flatMap(icon => [icon.file, icon.mp_file].filter(Boolean)))
for (const file of manifestIconFiles) assertWebpAsset(file, `manifest ${file}`)
for (const file of fs.readdirSync(path.join(root, 'src/static/icons')))
  assertWebpAsset(`icons/${file}`, `static icon ${file}`)
const catalogSource = fs.readFileSync(path.join(root, 'src/pages-admin/database.vue'), 'utf8')
const catalog = vm.runInNewContext(catalogSource.match(/const legacyTableCatalog = (\[[\s\S]*?\n\])/)[1])
const newTables = ['ShopProduct', 'UserLoginLocation', 'BiometricCredential', 'BiometricChallenge',
  'PlatformLoginCredential', 'PlatformLoginChallenge', 'CollectorProfile', 'CollectorApplication',
  'CollectorScheduleDay', 'RecyclingServiceArea', 'RecyclingLock', 'BookingOrderEvent', 'BookingChatBinding',
  'RecyclingRequest', 'RecyclingDelivery', 'RecyclingDeviceDelivery', 'UserIdentity',
  'CollectorWeeklySchedule', 'RecyclingPhoto', 'UserCost']
const resolverSource = fs.readFileSync(path.join(root, 'src/utils/manifest-icons.js'), 'utf8')
const { NON_THEME_ONLY_ICON_IDS } = await import('../src/utils/mp-subpackage-icons.mjs')
for (const [platform, flags] of [['MP', { MP: true, MP_WEIXIN: true }], ['H5', { H5: true }]]) {
  const code = preprocess(resolverSource, flags, { type: 'js' }).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ manifest, NON_THEME_ONLY_ICON_IDS })
  vm.runInContext(code + '\nglobalThis.resolveIcon = getManifestIconPath', context)
  for (const id of ['chat_voice_call', 'chat_video_call', 'call_recordings', ...newTables.map(name => {
    const table = catalog.find(item => item.name === name)
    assert.ok(table?.icon, `${name} has a specific icon`)
    return table.icon
  })]) {
    const icon = manifest.find(entry => entry.id === id)
    assert.ok(icon, `${id} is registered`)
    const file = platform === 'MP' ? icon.mp_file : icon.file
    assertWebpAsset(file, `${platform} ${id}`)
    const expected = platform === 'MP'
      ? id.endsWith('_table')
        ? `/pages-admin/static/${file}`
        : NON_THEME_ONLY_ICON_IDS.includes(id)
          ? `/pages-nonTheme/static/${file}`
          : `/static/${file}`
      : `/static/${file}`
    assert.equal(context.resolveIcon(id), expected)
  }
}
const configuredIcons = catalog.map(table => table.icon).filter(Boolean)
assert.equal(new Set(configuredIcons).size, configuredIcons.length, 'each configured table has a distinct icon')
assert.match(fs.readFileSync(path.join(root, 'src/pages-nonTheme/settings.vue'), 'utf8'), /id="call_recordings"/)
console.log('Admin table icon coverage, recording entry and platform icon assets passed.')
