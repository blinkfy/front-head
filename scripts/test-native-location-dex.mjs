import assert from 'node:assert/strict'
import fs from 'node:fs'

// Run against the UTS compiler output, or a classes.dex pulled from the device.
// JS/source-only tests cannot detect broken framework default-method desugaring.
const filename = process.argv[2]
assert.ok(filename, 'Usage: node scripts/test-native-location-dex.mjs <classes.dex>')
const dex = fs.readFileSync(filename)
assert.equal(dex.subarray(0, 4).toString(), 'dex\n', 'input must be a compiled DEX')
assert.ok(dex.includes(Buffer.from('Lftx/voice/RealtimeBridge$watchLocation$1$source$1;')),
  'the compiled artifact must contain the real-time location listener')
assert.ok(dex.includes(Buffer.from('onLocationChanged')))
assert.ok(dex.includes(Buffer.from('onFlushComplete')))
assert.equal(dex.includes(Buffer.from('Landroid/location/LocationListener$-CC;')), false,
  'framework default-method helper does not exist on-device; all LocationListener callbacks must be implemented')
console.log('PASS compiled native location listener has no missing framework default-method helper dependency')
