import jsQR from 'jsqr'
import { detectQrCandidate, detectRoundCodeCandidate } from './h5-roundcode-candidate.mjs'
import { sharpenQrImage } from './h5-camera-frame.mjs'

export function analyzeQrFrame(pixels, options = {}) {
  let text = '', candidate = null
  if (options.decode !== false) {
    let input = pixels
    if (options.sharpen) {
      input = { ...pixels, data: new Uint8ClampedArray(pixels.data) }; sharpenQrImage(input)
    }
    const decode = frame => jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data || ''
    text = decode(input)
    if (!text && options.enhance) {
      const enhanced = { ...pixels, data: new Uint8ClampedArray(pixels.data) }
      sharpenQrImage(enhanced); text = decode(enhanced)
    }
  }
  if (!text && options.locate) {
    const qr = detectQrCandidate(pixels)
    if (qr) candidate = { kind: 'qr', value: qr }
    else {
      const round = detectRoundCodeCandidate(pixels)
      if (round) candidate = { kind: 'round', value: round }
    }
  }
  return { text, candidate }
}
