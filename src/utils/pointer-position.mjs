export function updatePointerCssVariables(event) {
  const element = event?.currentTarget
  if (!element || typeof element.getBoundingClientRect !== 'function') return false
  if (!element.style || typeof element.style.setProperty !== 'function') return false

  const point = event?.touches?.[0] || event
  const clientX = Number(point?.clientX)
  const clientY = Number(point?.clientY)
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false

  const rect = element.getBoundingClientRect()
  const width = Number(rect?.width)
  const height = Number(rect?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false

  const x = ((clientX - Number(rect.left || 0)) / width) * 100
  const y = ((clientY - Number(rect.top || 0)) / height) * 100
  element.style.setProperty('--mouse-x', x + '%')
  element.style.setProperty('--mouse-y', y + '%')
  return true
}
