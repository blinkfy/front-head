export function realtimeRouteName(value) {
  const text = String(value || '联系人')
  // Some App routers expose encoded query values; already-decoded Chinese stays intact.
  if (!/%[a-f0-9]{2}/i.test(text)) return text.slice(0, 80)
  try { return decodeURIComponent(text.replace(/\+/g, '%20')).slice(0, 80) } catch (_) { return text.slice(0, 80) }
}
