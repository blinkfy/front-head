import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectRoundCodeCandidate } from '../src/utils/h5-roundcode-candidate.mjs'

const python = process.env.QBAR_PYTHON || 'C:/Users/29513/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
const sample = fileURLToPath(new URL('../../smartBin/device-simulator/qr.jpg', import.meta.url))
const temp = await mkdtemp(join(tmpdir(), 'h5-roundcode-candidate-'))
const fixtureSource = String.raw`
import json, sys
from pathlib import Path
import cv2, numpy as np
out = Path(sys.argv[1]); source = Path(sys.argv[2])
round_code = cv2.imdecode(np.frombuffer(source.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
if round_code is None: raise RuntimeError('round-code sample image unavailable')
fixtures = {}
def save(name, image):
    rgba = cv2.cvtColor(image, cv2.COLOR_BGR2RGBA) if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)
    (out / (name + '.rgba')).write_bytes(rgba.tobytes())
    fixtures[name] = {'width': int(rgba.shape[1]), 'height': int(rgba.shape[0])}
def round_frame(width, height, ratio, copies=1):
    edge = round(min(width, height) * ratio)
    scale = edge / max(round_code.shape[:2])
    code = cv2.resize(round_code, (max(1, round(round_code.shape[1]*scale)), max(1, round(round_code.shape[0]*scale))), interpolation=cv2.INTER_AREA)
    frame = np.full((height, width, 3), 128, dtype=np.uint8)
    centers = [width//2] if copies == 1 else [width//2-round(edge*.65), width//2+round(edge*.65)]
    for cx in centers:
        x, y = cx-code.shape[1]//2, height//2-code.shape[0]//2
        frame[y:y+code.shape[0], x:x+code.shape[1]] = code
    return frame
for width,height in ((1280,720),(1920,1080)):
    for ratio in (.16,.24): save(f'round-{width}-{int(ratio*100)}', round_frame(width,height,ratio))
    save(f'blank-{width}', np.full((height,width,3),128,dtype=np.uint8))
save('round-full-430', round_code)
save('round-full-512', cv2.resize(round_code,(512,512),interpolation=cv2.INTER_AREA))
save('round-double-1920', round_frame(1920,1080,.16,2))
qr = cv2.QRCodeEncoder_create().encode('candidate-control')
qr = cv2.copyMakeBorder(qr,4,4,4,4,cv2.BORDER_CONSTANT,value=255)
qr = cv2.resize(qr,(240,240),interpolation=cv2.INTER_NEAREST)
qr_frame = np.full((720,1280),128,dtype=np.uint8); qr_frame[240:480,520:760] = qr
save('ordinary-qr',qr_frame)
stripes = np.full((720,1280),128,dtype=np.uint8)
for x in range(0,1280,32):
    if (x//32)%2 == 0: stripes[:,x:x+16] = 0
save('stripes',stripes)
checker = np.full((720,1280),128,dtype=np.uint8)
for y in range(0,720,32):
    for x in range(0,1280,32):
        if ((x//32)+(y//32))%2 == 0: checker[y:y+32,x:x+32] = 0
save('checkerboard',checker)
(out/'fixtures.json').write_text(json.dumps(fixtures),encoding='utf-8')
`

try {
  const generated = spawnSync(python, ['-c', fixtureSource, temp, sample], { encoding: 'utf8', timeout: 30000 })
  assert.equal(generated.status, 0, `fixture generation failed: ${generated.stderr || generated.error || generated.stdout}`)
  const fixtures = JSON.parse(await readFile(join(temp, 'fixtures.json'), 'utf8'))
  const imageData = async name => {
    const { width, height } = fixtures[name]
    const bytes = await readFile(join(temp, `${name}.rgba`))
    assert.equal(bytes.byteLength, width * height * 4, `${name} RGBA length`)
    return { data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), width, height }
  }

  for (const width of [1280, 1920]) {
    for (const ratio of [16, 24]) {
      const name = `round-${width}-${ratio}`
      const candidate = detectRoundCodeCandidate(await imageData(name))
      assert.ok(candidate, `${name} should produce a round-code candidate`)
      assert.ok(Math.abs(candidate.x - 0.5) <= 0.04 && Math.abs(candidate.y - 0.5) <= 0.04,
        `${name} center mapping: ${JSON.stringify(candidate)}`)
      assert.ok(candidate.size >= ratio / 100 * 0.55 && candidate.size <= ratio / 100 * 1.45,
        `${name} size mapping: ${JSON.stringify(candidate)}`)
      console.log(`PASS ${name} x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}`)
    }
    assert.equal(detectRoundCodeCandidate(await imageData(`blank-${width}`)), null, `${width} blank frame`)
  }

  for (const name of ['round-full-430', 'round-full-512']) {
    const candidate = detectRoundCodeCandidate(await imageData(name))
    assert.ok(candidate, `${name} full-frame round code should produce a candidate`)
    assert.ok(Math.abs(candidate.x - 0.5) <= 0.06 && Math.abs(candidate.y - 0.5) <= 0.06,
      `${name} center mapping: ${JSON.stringify(candidate)}`)
    assert.ok(candidate.size >= 0.7 && candidate.size <= 1.1,
      `${name} full-frame size mapping: ${JSON.stringify(candidate)}`)
    console.log(`PASS ${name} x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}`)
  }

  for (const name of ['ordinary-qr', 'stripes', 'checkerboard', 'round-double-1920']) {
    assert.equal(detectRoundCodeCandidate(await imageData(name)), null, `${name} must not trigger round-code recognition`)
    console.log(`PASS ${name} rejected`)
  }

  assert.equal(detectRoundCodeCandidate({ data: new Uint8ClampedArray(1921 * 24 * 4), width: 1921, height: 24 }), null,
    'frames wider than the supported bound are rejected')
  console.log('PASS oversized image rejected')
} finally {
  await rm(temp, { recursive: true, force: true })
}
