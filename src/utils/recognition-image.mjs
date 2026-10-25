export const MIN_RECOGNITION_COMPRESSION_BYTES = 1024 * 1024

export function shouldCompressRecognitionImage(size, maxDimension = 0) {
  return (Number.isFinite(size) && size > MIN_RECOGNITION_COMPRESSION_BYTES) ||
    (Number.isFinite(maxDimension) && maxDimension > 800)
}

export function needsRecognitionJpegConversion(type) {
  return typeof type === 'string' && type.length > 0 &&
    !['image/jpeg', 'image/png', 'image/webp'].includes(type.toLowerCase())
}

export function getRecognitionImageMaxDimension(filePath) {
  if (typeof uni === 'undefined' || typeof uni.getImageInfo !== 'function') return Promise.resolve(0)

  return new Promise(resolve => {
    try {
      uni.getImageInfo({
        src: filePath,
        success: info => resolve(Math.max(Number(info.width) || 0, Number(info.height) || 0)),
        fail: () => resolve(0)
      })
    } catch (error) {
      resolve(0)
    }
  })
}

export async function getRecognitionCompressionDecision(filePath, size, type = '') {
  const maxDimension = shouldCompressRecognitionImage(size)
    ? 0 : await getRecognitionImageMaxDimension(filePath)
  return {
    shouldCompress: shouldCompressRecognitionImage(size, maxDimension),
    needsJpegConversion: needsRecognitionJpegConversion(type)
  }
}

export function isSmallerRecognitionImage(originalSize, compressedSize) {
  return Number.isFinite(originalSize) && originalSize > 0 &&
    Number.isFinite(compressedSize) && compressedSize > 0 && compressedSize < originalSize
}

export function shouldUseCompressedRecognitionImage(originalSize, compressedSize, needsJpegConversion = false) {
  return Number.isFinite(compressedSize) && compressedSize > 0 &&
    (needsJpegConversion || isSmallerRecognitionImage(originalSize, compressedSize))
}

export function getRecognitionImageSize(filePath, knownSize = 0) {
  if (Number.isFinite(knownSize) && knownSize > 0) return Promise.resolve(knownSize)
  if (typeof uni === 'undefined' || typeof uni.getFileInfo !== 'function') return Promise.resolve(0)

  return new Promise(resolve => {
    try {
      uni.getFileInfo({
        filePath,
        success: res => resolve(Number(res.size) || 0),
        fail: () => resolve(0)
      })
    } catch (error) {
      resolve(0)
    }
  })
}
