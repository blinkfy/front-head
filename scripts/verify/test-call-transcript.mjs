import assert from 'node:assert/strict'
import { activeTranscriptIndex, activeTranscriptIndices, findTranscriptPause, runCallTranscript } from '../../src/utils/call-transcript.mjs'

const calls = []
const prepare = async () => ({ durationMs: 44000, slice(startMs, endMs) {
  calls.push(['slice', startMs, endMs])
  return { startMs, endMs, release: () => calls.push(['released', startMs]) }
} })
const local = async clip => clip.startMs === 0 ? { text: '本地第一段。' } : null
const cloud = async clip => {
  calls.push(['upload', clip.startMs])
  return clip.startMs === 20000 ? { text: '第二段。第三段。', segments: [
    { startMs: 200, endMs: 1500, text: '第二段。' }, { startMs: 2000, endMs: 4500, text: '第三段。' }
  ] } : { text: '末段。', segments: [{ startMs: 50, endMs: 500, text: '末' }] }
}
const inputs = { prepare, localAvailable: async () => true, local, cloud }

const partial = await runCallTranscript({ ...inputs, allowCloud: async reason => {
  assert.equal(reason, 'NO_RESULT')
  return false
} }, {})
assert.equal(partial.partial, true)
assert.equal(partial.segments[0].text, '本地第一段。')
assert.equal(calls.some(([event]) => event === 'upload'), false, 'declining never uploads audio')

calls.length = 0
let prompts = 0
const { segments } = await runCallTranscript({ ...inputs, allowCloud: async () => { prompts++; return true } }, {})
assert.equal(prompts, 1)
assert.deepEqual(calls.filter(([event]) => event === 'upload').map(([, offset]) => offset), [20000, 40000])
assert.deepEqual(calls.filter(([event]) => event === 'released').map(([, offset]) => offset), [0, 18000, 20000, 38000, 40000])
assert.deepEqual(segments.map(({ startMs, endMs, timing }) => [startMs, endMs, timing]), [
  [0, 20000, 'clip'], [20200, 21500, 'sentence'], [22000, 24500, 'sentence'], [40000, 44000, 'clip']
])
assert.equal(activeTranscriptIndex(segments, 23000), 2)
assert.equal(activeTranscriptIndex(segments, 21999), -1)
assert.equal(segments.at(-1).text, '末段。', 'incomplete sentence metadata must never drop text')

calls.length = 0
const controller = new AbortController()
await assert.rejects(runCallTranscript({ ...inputs, allowCloud: async () => { controller.abort(); return true } },
  { signal: controller.signal }), { name: 'AbortError' })
assert.equal(calls.some(([event]) => event === 'upload'), false, 'cancellation while confirming prevents uploads')
assert.deepEqual(calls.at(-1), ['released', 18000])

calls.length = 0
const localOnly = await runCallTranscript({ ...inputs,
  local: async clip => ({ text: {
    0: '会议今天开始。请大家报',
    18000: '请大家报名参加。箱子里有废电池。',
    38000: '还有一只玻璃瓶。'
  }[clip.startMs] }),
  cloud: () => assert.fail('successful local recognition must not upload'),
  allowCloud: () => assert.fail('successful local recognition needs no prompt')
}, {})
assert.deepEqual(calls.filter(([event]) => event === 'slice'), [
  ['slice', 0, 20000], ['slice', 18000, 40000], ['slice', 38000, 44000]
])
assert.deepEqual(localOnly.segments.map(({ startMs, text }) => [startMs, text]), [
  [0, '会议今天开始。'], [18000, '请大家报名参加。箱子里有废电池。'], [38000, '还有一只玻璃瓶。']
], 'the boundary phrase appears whole in the next clip and unmatched text is kept')
assert.equal(activeTranscriptIndex(localOnly.segments, 18000), 1, 'clicking an overlapping line highlights the newer line')

const levels = Array(250).fill(.09)
levels.fill(.003, 85, 115)
assert.equal(findTranscriptPause(levels, 17500, 20000), 19640, 'choose an interior point in the detected pause')
assert.equal(findTranscriptPause(Array(250).fill(.012), 17500, 20000), null, 'continuous quiet speech is not a pause')
const gap = Array(250).fill(.09)
gap.fill(null, 85, 115)
assert.equal(findTranscriptPause(gap, 17500, 20000), null, 'missing audio data does not count as silence')
gap.fill(0, 85, 95)
assert.equal(findTranscriptPause(gap, 17500, 20000), null, 'a brief gap is too short to cut')

calls.length = 0
const pauseAware = await runCallTranscript({ ...inputs,
  prepare: async () => ({ ...await prepare(), energyFrames(fromMs, toMs) {
    assert.equal(toMs - fromMs, 5000)
    return fromMs === 17500 ? levels : gap
  } }),
  local: async clip => ({ text: `片段时间 ${clip.startMs}。` }),
  cloud: () => assert.fail('successful local recognition must not upload'),
  allowCloud: () => assert.fail('successful local recognition needs no prompt')
}, {})
assert.deepEqual(pauseAware.segments.map(({ startMs, endMs }) => [startMs, endMs]), [
  [0, 19640], [18840, 40000], [38000, 44000]
], 'retain a little context at a possible pause and more where speech continues')

let searchedUntilMs
const shortTail = await runCallTranscript({ ...inputs,
  prepare: async () => ({ ...await prepare(), durationMs: 22520, energyFrames(fromMs, toMs) {
    searchedUntilMs = toMs
    return Array.from({ length: Math.floor((toMs - fromMs) / 20) },
      (_, index) => fromMs + index * 20 >= 22000 ? 0 : .08)
  } }),
  local: async () => ({ text: '正常。' })
}, {})
assert.equal(searchedUntilMs, 20020, 'exclude late pauses that would leave a fraction of a second')
assert.ok(shortTail.segments[1].endMs - shortTail.segments[0].endMs >= 2500)

// Peer speaks earlier and briefly overlaps the local participant. Only the
// first local utterance fails; denial must still transcribe both later turns.
async function twoSides(approved) {
  const uploads = [], attempts = [], released = []
  let prompts = 0
  const ranges = { self: [[1000, 2000], [4000, 5000]], peer: [[300, 1400]] }
  const result = await runCallTranscript({
    prepare: () => ({ durationMs: 6000, splitTracks: true,
      energyFrames(from, to, speaker) {
        return Array.from({ length: (to - from) / 20 }, (_, i) =>
          ranges[speaker].some(([a, b]) => from + i * 20 >= a && from + i * 20 < b) ? .02 : 0)
      },
      slice(startMs, endMs, speaker) { return { startMs, endMs, speaker, release: () => released.push(speaker) } }
    }),
    localAvailable: () => true,
    local: clip => {
      attempts.push(clip.speaker)
      if (clip.speaker === 'self' && clip.startMs < 1000) throw new Error('offline model failed')
      return { text: '本地成功' }
    },
    allowCloud: reason => { assert.equal(reason, 'RECOGNITION_FAILED'); prompts++; return approved },
    cloud: clip => { uploads.push([clip.speaker, clip.startMs, clip.endMs]); return { text: '云端补转' } }
  }, {})
  assert.deepEqual(attempts, ['self', 'self', 'peer'])
  assert.deepEqual(released, attempts)
  assert.equal(prompts, 1)
  assert.deepEqual(uploads, approved ? [['self', 800, 2200]] : [])
  assert.equal(result.partial, !approved)
  assert.deepEqual(result.segments.map(s => [s.startMs, s.speaker, s.source]), [
    [100, 'peer', 'local'], ...(approved ? [[800, 'self', 'cloud']] : []), [3800, 'self', 'local']
  ])
  if (approved) assert.deepEqual(activeTranscriptIndices(result.segments, 1100), [1, 0])
}
await twoSides(false)
await twoSides(true)
const silent = await runCallTranscript({
  localAvailable: () => false,
  prepare: () => ({ durationMs: 400, splitTracks: true, energyFrames: () => Array(20).fill(0) }),
  allowCloud: () => assert.fail('silence never requires upload')
}, {})
assert.deepEqual(silent, { partial: false, segments: [] })
const retriedUploads = [], completedClips = {}
let retry = false
const retryDeps = {
  localAvailable: () => ({ available: false, reason: 'LANGUAGE_PACK_REQUIRED' }),
  allowCloud: reason => { assert.equal(reason, 'LANGUAGE_PACK_REQUIRED'); return true },
  prepare: () => ({ durationMs: 1000, splitTracks: true, energyFrames: () => Array(50).fill(.1),
    slice: (startMs, endMs, speaker) => ({ startMs, endMs, speaker }) }),
  cloud: clip => {
    retriedUploads.push(clip.speaker)
    if (!retry && clip.speaker === 'peer') throw new Error('网络中断')
    return { text: '成功' }
  }
}
assert.equal((await runCallTranscript(retryDeps, { completedClips })).partial, true)
retry = true
const resumed = await runCallTranscript(retryDeps, { completedClips })
assert.equal(resumed.partial, false)
assert.deepEqual(resumed.segments.map(seg => seg.speaker), ['self', 'peer'])
assert.deepEqual(retriedUploads, ['self', 'peer', 'peer'], 'retry does not upload a completed clip again')
console.log('Call transcript legacy and split tracks, speaker timeline, cloud consent, offsets and cleanup passed')
