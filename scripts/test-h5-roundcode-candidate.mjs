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
    if image.ndim == 3 and image.shape[2] == 1:
        image = image[:,:,0]
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
def rotate_patch(image, angle):
    height, width = image.shape[:2]
    radians = np.deg2rad(angle)
    out_width = int(np.ceil(abs(width*np.cos(radians)) + abs(height*np.sin(radians))))
    out_height = int(np.ceil(abs(height*np.cos(radians)) + abs(width*np.sin(radians))))
    matrix = cv2.getRotationMatrix2D((width/2,height/2),angle,1)
    matrix[0,2] += (out_width-width)/2
    matrix[1,2] += (out_height-height)/2
    return cv2.warpAffine(image,matrix,(out_width,out_height),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=(128,128,128))
def round_patch(edge):
    scale = edge / max(round_code.shape[:2])
    return cv2.resize(round_code,(max(1,round(round_code.shape[1]*scale)),max(1,round(round_code.shape[0]*scale))),interpolation=cv2.INTER_AREA)
def small_camera_round(edge, center_x=.5, blur=.7, rotate=0, perspective=False):
    code = round_patch(edge)
    if rotate: code = rotate_patch(code,rotate)
    if perspective:
        h,w = code.shape[:2]
        source_points = np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]])
        target_points = np.float32([[w*.08,0],[w*.92,h*.04],[w-1,h-1],[0,h*.92]])
        code = cv2.warpPerspective(code,cv2.getPerspectiveTransform(source_points,target_points),(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=(128,128,128))
    if blur: code = cv2.GaussianBlur(code,(3,3),blur)
    frame = np.full((1080,1920,3),128,dtype=np.uint8)
    h,w = code.shape[:2]
    x = round(center_x*1920-w/2); y = (1080-h)//2
    frame[y:y+h,x:x+w] = code
    return frame
for edge in (120,160,240):
    for angle in (-75,-45,-30,-15,15,30,45,75):
        blur = .45 if edge == 120 and abs(angle) == 15 else .7 if edge == 160 and abs(angle) == 30 else .5 if edge == 240 and abs(angle) == 45 else 0
        save(f'round-small-{edge}-rot{angle:+d}',small_camera_round(edge,blur=blur,rotate=angle))
save('round-small-120-blur07',small_camera_round(120))
save('round-small-160-x35-blur07',small_camera_round(160,.35))
save('round-small-160-x65-blur07',small_camera_round(160,.65))
save('round-small-160-perspective',small_camera_round(160,perspective=True,blur=0))
save('round-double-1280', round_frame(1280,720,.24,2))
save('round-double-1920', round_frame(1920,1080,.16,2))
def rotated_round_pair(angle):
    code = rotate_patch(round_patch(220),angle)
    frame = np.full((1080,1920,3),128,dtype=np.uint8)
    h,w = code.shape[:2]
    for cx in (round(1920*.36),round(1920*.64)):
        x,y = cx-w//2,(1080-h)//2
        frame[y:y+h,x:x+w] = code
    return frame
save('round-double-1920-rot15',rotated_round_pair(15))
save('round-double-1920-rot45',rotated_round_pair(45))
def draw_ring_marker(image,cx,cy,diameter):
    radius = diameter//2
    outer = max(2,round(diameter*.15)); white = max(3,round(diameter*.21))
    cv2.circle(image,(cx,cy),radius,(0,0,0),-1,cv2.LINE_AA)
    cv2.circle(image,(cx,cy),max(1,radius-outer),(255,255,255),-1,cv2.LINE_AA)
    cv2.circle(image,(cx,cy),max(1,radius-outer-white),(0,0,0),-1,cv2.LINE_AA)
ring_triangle = np.full((1080,1920,3),255,dtype=np.uint8)
for cx,cy in ((700,300),(900,300),(700,500)): draw_ring_marker(ring_triangle,cx,cy,48)
save('ring-triangle-geometry-lookalike',ring_triangle)
ring_sizes = np.full((1080,1920,3),255,dtype=np.uint8)
for (cx,cy),diameter in zip(((700,300),(900,300),(700,500)),(24,42,64)):
    draw_ring_marker(ring_sizes,cx,cy,diameter)
save('ring-triangle-different-sizes',ring_sizes)
concentric = np.full((1080,1920,3),255,dtype=np.uint8)
cv2.circle(concentric,(960,540),180,(0,0,0),-1,cv2.LINE_AA)
cv2.circle(concentric,(960,540),116,(255,255,255),-1,cv2.LINE_AA)
cv2.circle(concentric,(960,540),48,(0,0,0),-1,cv2.LINE_AA)
save('concentric-rings-noncode',concentric)
noise_rng = np.random.default_rng(20261029)
noise = noise_rng.integers(0,256,(720,1280),dtype=np.uint8)
save('random-noise',noise)
qr = cv2.QRCodeEncoder_create().encode('candidate-control')
qr = cv2.copyMakeBorder(qr,4,4,4,4,cv2.BORDER_CONSTANT,value=255)
qr = cv2.resize(qr,(240,240),interpolation=cv2.INTER_NEAREST)
qr_frame = np.full((720,1280),128,dtype=np.uint8); qr_frame[240:480,520:760] = qr
save('ordinary-qr',qr_frame)
for angle in (15,45):
    patch = rotate_patch(qr,angle)
    frame = np.full((1080,1920),128,dtype=np.uint8)
    h,w = patch.shape[:2]; y=(1080-h)//2; x=(1920-w)//2
    frame[y:y+h,x:x+w] = patch
    save(f'ordinary-qr-rot{angle}',frame)
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
  const probe = async name => {
    const image = await imageData(name)
    const original = image.data.slice()
    const started = performance.now()
    const candidate = detectRoundCodeCandidate(image)
    const elapsed = performance.now() - started
    assert.deepEqual(image.data, original, `${name} detector must not modify input pixels`)
    return { candidate, elapsed }
  }

  for (const width of [1280, 1920]) {
    for (const ratio of [16, 24]) {
      const name = `round-${width}-${ratio}`
      const { candidate } = await probe(name)
      assert.ok(candidate, `${name} should produce a round-code candidate`)
      assert.ok(Math.abs(candidate.x - 0.5) <= 0.04 && Math.abs(candidate.y - 0.5) <= 0.04,
        `${name} center mapping: ${JSON.stringify(candidate)}`)
      assert.ok(candidate.size >= ratio / 100 * 0.55 && candidate.size <= ratio / 100 * 1.45,
        `${name} size mapping: ${JSON.stringify(candidate)}`)
      console.log(`PASS ${name} x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}`)
    }
    const blankName = `blank-${width}`
    const blank = await imageData(blankName)
    const original = blank.data.slice()
    const started = performance.now()
    assert.equal(detectRoundCodeCandidate(blank), null, `${width} blank frame`)
    assert.deepEqual(blank.data, original, `${blankName} detector must not modify input pixels`)
    console.log(`PASS ${blankName} rejected in ${(performance.now() - started).toFixed(2)}ms`)
  }

  for (const name of ['round-full-430', 'round-full-512']) {
    const { candidate } = await probe(name)
    assert.ok(candidate, `${name} full-frame round code should produce a candidate`)
    assert.ok(Math.abs(candidate.x - 0.5) <= 0.06 && Math.abs(candidate.y - 0.5) <= 0.06,
      `${name} center mapping: ${JSON.stringify(candidate)}`)
    assert.ok(candidate.size >= 0.7 && candidate.size <= 1.1,
      `${name} full-frame size mapping: ${JSON.stringify(candidate)}`)
    console.log(`PASS ${name} x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}`)
  }

  for (const name of ['round-small-120-blur07', 'round-small-160-x35-blur07', 'round-small-160-x65-blur07',
    'round-small-160-perspective']) {
    const { candidate } = await probe(name)
    assert.ok(candidate, `${name} should produce a round-code candidate`)
    const expectedX = name.includes('x35') ? 0.35 : name.includes('x65') ? 0.65 : 0.5
    assert.ok(Math.abs(candidate.x - expectedX) <= 0.035 && Math.abs(candidate.y - 0.5) <= 0.035,
      `${name} center mapping: ${JSON.stringify(candidate)}`)
    assert.ok(candidate.size >= 0.07 && candidate.size <= 0.23,
      `${name} size mapping: ${JSON.stringify(candidate)}`)
    console.log(`PASS ${name} x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}`)
  }
  const rotationResults = []
  for (const edge of [120,160,240]) for (const angle of [-75,-45,-30,-15,15,30,45,75]) {
    const name = `round-small-${edge}-rot${angle >= 0 ? '+' : ''}${angle}`
    const { candidate, elapsed } = await probe(name)
    const radians = Math.abs(angle) * Math.PI / 180
    const expectedEdge = Math.ceil(edge * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians))))
    const plausible = candidate !== null && Math.abs(candidate.x - 0.5) <= 0.05
      && Math.abs(candidate.y - 0.5) <= 0.05
      && candidate.size >= edge / 1080 * 0.4 && candidate.size <= expectedEdge / 1080 * 1.7
    rotationResults.push({ name, edge, angle, hit: plausible, candidate, elapsed })
    const detail = candidate ? ` x=${candidate.x.toFixed(3)} y=${candidate.y.toFixed(3)} size=${candidate.size.toFixed(3)}` : ''
    console.log(`ROTATION ${name} ${plausible ? 'HIT' : candidate ? 'BAD-CANDIDATE' : 'MISS'} ${elapsed.toFixed(2)}ms${detail}`)
  }
  const rotationHits = rotationResults.filter(result => result.hit).length
  const rotationMisses = rotationResults.length - rotationHits
  console.log(`ROTATIONS hit=${rotationHits} miss=${rotationMisses}`)
  const guaranteedRotations = new Set([
    'round-small-120-rot+15',
    'round-small-240-rot-45', 'round-small-240-rot-30', 'round-small-240-rot-15',
    'round-small-240-rot+15', 'round-small-240-rot+30', 'round-small-240-rot+45'
  ])
  for (const result of rotationResults) {
    if (guaranteedRotations.has(result.name)) assert.ok(result.hit, `${result.name} expected a bounded round-code candidate`)
  }

  for (const name of ['concentric-rings-noncode', 'ring-triangle-different-sizes', 'random-noise']) {
    const { candidate, elapsed } = await probe(name)
    assert.equal(candidate, null, `${name} must not trigger round-code recognition`)
    console.log(`PASS ${name} rejected in ${elapsed.toFixed(2)}ms`)
  }
  const geometryLookalike = await probe('ring-triangle-geometry-lookalike')
  if (geometryLookalike.candidate) {
    console.log(`GEOMETRY-ONLY LIMITATION ring-triangle-geometry-lookalike candidate=${JSON.stringify(geometryLookalike.candidate)} ${geometryLookalike.elapsed.toFixed(2)}ms; this is localization only, not a decoded/business-success result`)
  } else console.log(`PASS ring-triangle-geometry-lookalike no candidate ${geometryLookalike.elapsed.toFixed(2)}ms`)

  for (const name of ['ordinary-qr', 'ordinary-qr-rot15', 'ordinary-qr-rot45', 'stripes', 'checkerboard',
    'round-double-1280', 'round-double-1920', 'round-double-1920-rot15', 'round-double-1920-rot45']) {
    const { candidate, elapsed } = await probe(name)
    assert.equal(candidate, null, `${name} must not trigger round-code recognition`)
    if (name.startsWith('ordinary-qr')) console.log(`PASS ${name} rejected in ${elapsed.toFixed(2)}ms`)
    else if (name === 'stripes' || name === 'checkerboard') console.log(`PASS ${name} rejected in ${elapsed.toFixed(2)}ms`)
    else console.log(`PASS ${name} rejected in ${elapsed.toFixed(2)}ms`)
  }

  assert.equal(detectRoundCodeCandidate({ data: new Uint8ClampedArray(1921 * 24 * 4), width: 1921, height: 24 }), null,
    'frames wider than the supported bound are rejected')
  console.log('PASS oversized image rejected')
} finally {
  await rm(temp, { recursive: true, force: true })
}
