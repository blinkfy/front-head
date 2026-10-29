import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectQrCandidate, detectRoundCodeCandidate } from '../src/utils/h5-roundcode-candidate.mjs'

const python = process.env.QBAR_PYTHON || 'C:/Users/29513/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
const roundSample = fileURLToPath(new URL('../../smartBin/device-simulator/qr.jpg', import.meta.url))
const temp = await mkdtemp(join(tmpdir(), 'h5-qr-candidate-'))
const fixtureSource = String.raw`
import json, sys
from pathlib import Path
import cv2, numpy as np
out = Path(sys.argv[1]); round_path = Path(sys.argv[2])
round_code = cv2.imdecode(np.frombuffer(round_path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
if round_code is None: raise RuntimeError('round-code sample image unavailable')
fixtures = {}
def save(name, image):
    rgba = cv2.cvtColor(image, cv2.COLOR_BGR2RGBA) if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)
    (out / (name + '.rgba')).write_bytes(rgba.tobytes())
    fixtures[name] = {'width': int(rgba.shape[1]), 'height': int(rgba.shape[0])}
def qr_frame(edge, cx=.5, cy=.5, blur=0, payload='qr-candidate'):
    qr = cv2.QRCodeEncoder_create().encode(payload)
    qr = cv2.copyMakeBorder(qr, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
    qr = cv2.resize(qr, (edge, edge), interpolation=cv2.INTER_NEAREST)
    width, height = 1920, 1080
    frame = np.full((height, width), 128, dtype=np.uint8)
    x, y = round(cx * width - edge / 2), round(cy * height - edge / 2)
    frame[y:y + edge, x:x + edge] = qr
    return cv2.GaussianBlur(frame, (3, 3), blur) if blur else frame
save('qr-small-60', qr_frame(60))
save('qr-offset-120', qr_frame(120, .36, .42))
save('qr-blur-90', qr_frame(90, .5, .5, .7))
save('blank', np.full((1080, 1920), 128, dtype=np.uint8))
two = qr_frame(120, .35, .5)
qr2 = cv2.QRCodeEncoder_create().encode('second-code')
qr2 = cv2.copyMakeBorder(qr2, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
qr2 = cv2.resize(qr2, (120, 120), interpolation=cv2.INTER_NEAREST)
two[480:600, 1188:1308] = qr2
save('qr-double', two)
round_small = cv2.resize(round_code, (240, 240), interpolation=cv2.INTER_AREA)
round_frame = np.full((1080, 1920, 3), 128, dtype=np.uint8)
round_frame[420:660, 840:1080] = round_small
save('round-control', round_frame)
(out / 'fixtures.json').write_text(json.dumps(fixtures), encoding='utf-8')
`

try {
  const generated = spawnSync(python, ['-c', fixtureSource, temp, roundSample], { encoding: 'utf8', timeout: 30000 })
  assert.equal(generated.status, 0, `fixture generation failed: ${generated.stderr || generated.error || generated.stdout}`)
  const fixtures = JSON.parse(await readFile(join(temp, 'fixtures.json'), 'utf8'))
  const imageData = async name => {
    const { width, height } = fixtures[name]
    const bytes = await readFile(join(temp, `${name}.rgba`))
    assert.equal(bytes.byteLength, width * height * 4, `${name} RGBA length`)
    return { data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), width, height }
  }

  for (const [name, expectedX, expectedY] of [
    ['qr-small-60', 0.5, 0.5], ['qr-offset-120', 0.36, 0.42], ['qr-blur-90', 0.5, 0.5]
  ]) {
    const image = await imageData(name)
    const candidate = detectQrCandidate(image)
    assert.ok(candidate, `${name} should produce a QR geometry candidate`)
    assert.ok(Math.abs(candidate.x - expectedX) <= 0.035 && Math.abs(candidate.y - expectedY) <= 0.035,
      `${name} candidate mapping: ${JSON.stringify(candidate)}`)
    assert.ok(candidate.size > 0 && candidate.size < 0.28, `${name} candidate size: ${JSON.stringify(candidate)}`)
    assert.equal(detectRoundCodeCandidate(image), null, `${name} remains excluded from the round-code path`)
    console.log(`PASS ${name} x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}`)
  }

  assert.equal(detectQrCandidate(await imageData('blank')), null, 'blank must not produce a QR candidate')
  assert.equal(detectQrCandidate(await imageData('qr-double')), null, 'multiple QR codes must be ambiguous')
  const round = await imageData('round-control')
  assert.equal(detectQrCandidate(round), null, 'round-code geometry must not be classified as ordinary QR')
  assert.ok(detectRoundCodeCandidate(round), 'round-code candidate remains available through its original path')
  console.log('PASS blank/multiple QR rejected; round QR-class separation preserved')
} finally {
  await rm(temp, { recursive: true, force: true })
}
