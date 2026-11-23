const submissionFields = ['name', 'description', 'latitude', 'longitude', 'image']
export const BIN_PRE_REVIEW_TIMEOUT_MS = 40000
export const BIN_PRE_REVIEW_ESTIMATE_MS = 1385
export const BIN_PRE_REVIEW_SUGGESTION_ESTIMATE_MS = 742

// This is waiting feedback, not model-reported completion. Only a real decision completes it.
export function binReviewWaitingProgress(elapsedMs, estimateMs = BIN_PRE_REVIEW_ESTIMATE_MS) {
  const duration = Number.isFinite(Number(estimateMs)) && Number(estimateMs) >= 100 ? Number(estimateMs) : BIN_PRE_REVIEW_ESTIMATE_MS
  return Math.max(4, Math.min(99, Math.round(100 * (1 - Math.exp(-Math.LN10 * Math.max(0, elapsedMs) / duration)))))
}

export async function withBinReviewDeadline(operation, timeoutMs = BIN_PRE_REVIEW_TIMEOUT_MS) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('AI_PRE_REVIEW_TIMEOUT')), timeoutMs) })
    ])
  } finally { clearTimeout(timer) }
}

export function sameBinSubmission(left, right) {
  return !!left && !!right && submissionFields.every(key => left[key] === right[key])
}

export function isLegacyBinReviewError(error) {
  return [404, 405, 501].includes(Number(error?.statusCode || error?.status || error?.code))
}

// Use the complete AI revision; do not prepend the original address again.
export function preserveBinDescription(original, suggested, limit = 200) {
  return String(suggested || '').trim().slice(0, limit)
}

export function normalizeBinReviewPreview(value, originalDescription = '') {
  if (!value || typeof value.passed !== 'boolean') return null
  const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
  return { passed: value.passed, reason: value.passed ? '' : text(value.reason, 300), suggestions: {
    name: text(value.suggestions?.name, 50), description: preserveBinDescription(originalDescription, text(value.suggestions?.description, 200)), summary: text(value.suggestions?.summary, 200)
  } }
}

export function normalizeBinPreReview(value, originalDescription = '') {
  if (!value || value.supported !== true || value.enabled !== true || typeof value.passed !== 'boolean') return null
  const suggestions = value.suggestions && typeof value.suggestions === 'object' ? value.suggestions : {}
  const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
  return {
    passed: value.passed, reason: value.passed ? '' : text(value.reason, 500), applied: false,
    suggestions: {
      name: text(suggestions.name, 50), description: preserveBinDescription(originalDescription, text(suggestions.description, 200)), summary: text(suggestions.summary, 500)
    }
  }
}
