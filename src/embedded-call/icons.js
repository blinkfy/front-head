// Same round controls and rounded line weight as the App call surface.
const paths = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6"/>',
  camera: '<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 9 6-3v12l-6-3"/>',
  'switch-camera': '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M7 10h9l-2-2M17 14H8l2 2"/>',
  phone: '<path d="m6 3 3 5-2 2a15 15 0 0 0 7 7l2-2 5 3-1 3C11 23 1 13 3 4Z"/>',
  hangup: '<path d="M3 16v-5c5-5 13-5 18 0v5h-5v-4a12 12 0 0 0-8 0v4Z"/>',
  speaker: '<path d="M3 9h4l5-4v14l-5-4H3ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
}

export function callAction(label, action, icon, { kind = '', disabled = false, selected, off = false } = {}) {
  const pressed = typeof selected === 'boolean' ? ` aria-pressed="${selected}"` : ''
  return `<button class="call-action ${kind}${selected ? ' selected' : ''}" data-action="${action}"${pressed}${disabled ? ' disabled' : ''}>
    <span class="action-circle"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths[icon] || paths.phone}${off ? '<path d="m3 3 18 18"/>' : ''}</svg></span><span class="action-label">${label}</span></button>`
}
