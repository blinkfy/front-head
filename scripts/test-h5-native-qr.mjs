import assert from 'node:assert/strict'
import { createNativeQrReader } from '../src/utils/h5-native-qr.mjs'

const qr = value => ({ format: 'qr_code', rawValue: value })
const formats = async () => ['qr_code', 'code_128']

// Missing API, missing format support, and capability lookup failure all fall
// back quietly without trying to construct or detect.
{
  const missing = createNativeQrReader({ BarcodeDetector: undefined })
  assert.equal(await missing.read({}), null, 'missing BarcodeDetector falls back')

  let constructions = 0
  class Unsupported {
    static async getSupportedFormats() { return ['code_128'] }
    constructor() { constructions++ }
  }
  const unsupported = createNativeQrReader({ BarcodeDetector: Unsupported })
  assert.equal(await unsupported.read({}), null, 'non-QR-only detector is unsupported')
  assert.equal(constructions, 0, 'unsupported format is checked before construction')

  class NoFormatApi {}
  const noFormats = createNativeQrReader({ BarcodeDetector: NoFormatApi })
  assert.equal(await noFormats.read({}), null, 'missing getSupportedFormats falls back')

  let formatCalls = 0
  class FormatFailure {
    static async getSupportedFormats() { formatCalls++; throw new Error('format lookup failed') }
  }
  const formatFailure = createNativeQrReader({ BarcodeDetector: FormatFailure })
  assert.equal(await formatFailure.read({}), null)
  assert.equal(await formatFailure.read({}), null)
  assert.equal(formatCalls, 1, 'format lookup failure disables this reader')
  console.log('PASS missing API/format support and capability lookup failure')
}

// Constructor and detect errors disable the native path for the session.
{
  let constructions = 0
  class ConstructorFailure {
    static getSupportedFormats = formats
    constructor() { constructions++; throw new Error('constructor failed') }
  }
  const constructorFailure = createNativeQrReader({ BarcodeDetector: ConstructorFailure })
  assert.equal(await constructorFailure.read({}), null)
  assert.equal(await constructorFailure.read({}), null)
  assert.equal(constructions, 1, 'constructor failure disables further attempts')

  let detects = 0
  class DetectFailure {
    static getSupportedFormats = formats
    constructor(options) { assert.deepEqual(options.formats, ['qr_code']) }
    async detect() { detects++; throw new Error('detect failed') }
  }
  const detectFailure = createNativeQrReader({ BarcodeDetector: DetectFailure })
  assert.equal(await detectFailure.read({}), null)
  assert.equal(await detectFailure.read({}), null)
  assert.equal(detects, 1, 'detect failure disables further attempts')
  console.log('PASS constructor and detect failures disable native reader')
}

// The timeout is bounded to 700ms; a late detector result cannot escape or
// re-enable the reader after the caller has fallen back.
{
  let resolveDetect, detects = 0, timeoutMs = 0
  class SlowDetector {
    static getSupportedFormats = formats
    constructor() {}
    detect() { detects++; return new Promise(resolve => { resolveDetect = resolve }) }
  }
  const within = (promise, milliseconds) => {
    timeoutMs = milliseconds
    promise.then(() => {}, () => {})
    return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 0))
  }
  const slow = createNativeQrReader({ BarcodeDetector: SlowDetector, within })
  assert.equal(await slow.read({}), null, 'timeout falls back')
  assert.equal(timeoutMs, 700, 'native detect uses the 700ms deadline')
  resolveDetect([qr('late-result')])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(await slow.read({}), null, 'late completion stays ignored and reader remains disabled')
  assert.equal(detects, 1)
  console.log('PASS detect timeout and late response suppression')
}

// Calls are single-flight. A closed or inactive reader never publishes a
// pending result, including when activity changes while detect is in flight.
{
  let resolveDetect, detects = 0
  class DeferredDetector {
    static getSupportedFormats = formats
    constructor() {}
    detect() { detects++; return new Promise(resolve => { resolveDetect = resolve }) }
  }
  const reader = createNativeQrReader({ BarcodeDetector: DeferredDetector })
  assert.equal(await reader.read({}, () => false), null, 'inactive reader skips work')
  assert.equal(detects, 0)

  let active = true
  const pending = reader.read({}, () => active)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(await reader.read({}), null, 'concurrent read is ignored')
  assert.equal(detects, 1, 'only one native detect runs at a time')
  active = false
  resolveDetect([qr('inactive-result')])
  assert.equal(await pending, null, 'result is ignored after activity ends')

  active = true
  const closing = reader.read({}, () => active)
  await Promise.resolve(); await Promise.resolve()
  reader.close()
  resolveDetect([qr('closed-result')])
  assert.equal(await closing, null, 'close invalidates an in-flight read')
  assert.equal(await reader.read({}), null, 'closed reader never restarts')
  assert.equal(detects, 2)
  console.log('PASS single-flight, inactive and close semantics')
}

// Only distinct valid QR payloads of 1..4096 characters are accepted. Duplicate
// payloads collapse to one result; distinct valid payloads remain ambiguous.
{
  let results = []
  class ResultDetector {
    static getSupportedFormats = formats
    constructor() {}
    async detect() { return results }
  }
  const reader = createNativeQrReader({ BarcodeDetector: ResultDetector })
  results = [qr('same'), qr('same')]
  assert.deepEqual(await reader.read({}), { text: 'same' }, 'duplicate payloads are deduplicated')

  results = [qr('first'), qr('second')]
  assert.deepEqual(await reader.read({}), { multiple: true }, 'multiple distinct QR values are rejected as ambiguous')

  results = [qr('x'.repeat(4096)), qr(''), qr('x'.repeat(4097)),
    { format: 'code_128', rawValue: 'wrong-format' }, { format: 'qr_code', rawValue: 42 }]
  assert.deepEqual(await reader.read({}), { text: 'x'.repeat(4096) }, 'maximum length is inclusive and invalid values are ignored')

  results = [qr(''), qr('x'.repeat(4097)), { format: 'code_128', rawValue: 'wrong-format' }]
  assert.equal(await reader.read({}), null, 'empty, oversized and non-QR values are rejected')
  console.log('PASS QR payload validation, deduplication and ambiguity rejection')
}

