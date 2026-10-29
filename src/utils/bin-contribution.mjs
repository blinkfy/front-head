export const BIN_APPROVAL_POINTS = 10

export function validBinCoordinates(point) {
  if (point?.latitude === null || point?.longitude === null || point?.latitude === '' || point?.longitude === '') return false
  return Number.isFinite(Number(point?.latitude)) && Math.abs(Number(point.latitude)) <= 90 &&
    Number.isFinite(Number(point?.longitude)) && Math.abs(Number(point.longitude)) <= 180
}

// Only replace text we inserted ourselves; user edits and other description text are preserved.
export function mergeBinLocation(description, previous, address, limit = 200) {
  let text = String(description || '')
  const location = String(address || '').trim().replace(/\s+/g, ' ')
  const next = location ? `位置：${location}` : ''
  if (previous && !text.includes(previous)) return { description: text, automatic: previous }
  if (previous && next && text.length - previous.length + next.length <= limit) {
    return { description: text.replace(previous, next), automatic: next }
  }
  if (previous) text = text.replace(previous, '').replace(/\n$/, '')
  if (!next || text.includes(location)) return { description: text, automatic: '' }
  const separator = text && !text.endsWith('\n') ? '\n' : ''
  if (text.length + separator.length + next.length > limit) return { description: text, automatic: '' }
  return { description: text + separator + next, automatic: next }
}
