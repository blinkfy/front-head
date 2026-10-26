export const MAX_IMAGE_BYTES = 500 * 1024
export const INITIAL_MAX_EDGE = 1600
export const IMAGE_QUALITY_STEPS = Object.freeze([80, 68, 56, 44])
export const MAX_RESIZE_ROUNDS = 12

function utf8ByteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length

  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4
      index += 1
    } else bytes += 3
  }
  return bytes
}

// 返回 data URL 解码后的字节数。无效输入返回 Infinity，避免调用方误判为小图。
export function dataUrlByteLength(dataUrl) {
  if (typeof dataUrl !== 'string') return Infinity
  const match = /^data:[^,]*,([\s\S]*)$/i.exec(dataUrl)
  if (!match) return Infinity

  const metadata = dataUrl.slice(0, dataUrl.indexOf(','))
  const payload = match[1]
  if (/;base64(?:;|$)/i.test(metadata)) {
    const compact = payload.replace(/\s/g, '')
    if (!/^[a-z\d+/_-]*={0,2}$/i.test(compact) || compact.length % 4 === 1) return Infinity
    const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0
    if (padding && compact.length % 4 !== 0) return Infinity
    return Math.max(0, Math.floor(compact.length * 3 / 4) - padding)
  }

  try {
    return utf8ByteLength(decodeURIComponent(payload))
  } catch (error) {
    return Infinity
  }
}

function getDecodedCandidateSize(candidate) {
  return dataUrlByteLength(candidate?.dataUrl)
}

function getChineseCompressionError() {
  return new Error('图片压缩后仍超过 500KB，请更换图片后重试。')
}

// 压缩回调必须返回实际生成的 dataUrl；以它解码后的字节数作为发送体积依据。
export async function compressUntilWithinLimit(original, compressCandidate, options = {}) {
  if (typeof compressCandidate !== 'function') {
    throw new TypeError('图片压缩器不可用。')
  }

  const maxImageBytes = Number.isFinite(options.maxImageBytes)
    ? Math.max(0, Math.floor(options.maxImageBytes))
    : MAX_IMAGE_BYTES
  const originalSize = getDecodedCandidateSize(original)
  if (originalSize <= maxImageBytes) {
    return { ...original, size: originalSize }
  }

  const initialMaxEdge = Number.isFinite(options.initialMaxEdge) && options.initialMaxEdge > 0
    ? Math.floor(options.initialMaxEdge)
    : INITIAL_MAX_EDGE
  const shrinkFactor = Number.isFinite(options.shrinkFactor) && options.shrinkFactor > 0 && options.shrinkFactor < 1
    ? options.shrinkFactor
    : 0.75
  const maxRounds = Number.isFinite(options.maxRounds) && options.maxRounds > 0
    ? Math.floor(options.maxRounds)
    : MAX_RESIZE_ROUNDS
  const qualitySteps = Array.isArray(options.qualitySteps) && options.qualitySteps.length
    ? options.qualitySteps
    : IMAGE_QUALITY_STEPS
  const onDiscard = typeof options.onDiscard === 'function' ? options.onDiscard : null
  let lastError = null

  for (let round = 0; round < maxRounds; round += 1) {
    const maxEdge = Math.max(1, Math.floor(initialMaxEdge * (shrinkFactor ** round)))
    for (const quality of qualitySteps) {
      let candidate
      try {
        candidate = await compressCandidate({ maxEdge, quality, round })
      } catch (error) {
        lastError = error
        continue
      }

      const size = getDecodedCandidateSize(candidate)
      if (size <= maxImageBytes) {
        return { ...candidate, size }
      }
      if (candidate && onDiscard) {
        try {
          await onDiscard(candidate)
        } catch (error) {
          // 清理临时产物失败不影响压缩判定，也不能改变文件大小校验。
        }
      }
    }
  }

  const error = getChineseCompressionError()
  if (lastError) error.cause = lastError
  throw error
}
