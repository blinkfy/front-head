let activeDialog = null
export const dialogOpen = () => activeDialog !== null

// Keep all dialog state in the page. Some WeChat WebViews fail to restore input
// after cancelling a native prompt/confirm dialog.
export function showDialog({ title, message = '', value, danger = false, confirmLabel = '确定' }) {
  if (activeDialog) return Promise.resolve(null)
  return new Promise(resolve => {
    const previous = document.activeElement
    const restore = previous?.closest('details')?.querySelector('summary') || previous
    const mask = document.createElement('div')
    mask.className = 'dialog-mask'
    mask.innerHTML = `<form class="inline-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" novalidate>
      <h2 id="dialog-title" class="dialog-title"></h2><p class="dialog-message"></p>
      ${value === undefined ? '' : '<input class="dialog-input" aria-label="录音名称" maxlength="80" autocomplete="off"><p class="dialog-error" role="alert" hidden>请输入录音名称</p>'}
      <div class="dialog-buttons"><button type="button" class="dialog-cancel">取消</button>
        <button type="submit" class="dialog-confirm${danger ? ' danger' : ''}"></button></div></form>`
    mask.querySelector('h2').textContent = title
    const description = mask.querySelector('.dialog-message')
    description.textContent = message; description.hidden = !message
    mask.querySelector('.dialog-confirm').textContent = confirmLabel
    const input = mask.querySelector('input')
    if (input) input.value = value
    const finish = result => {
      if (activeDialog !== finish) return
      activeDialog = null
      document.activeElement?.blur?.()
      mask.remove()
      document.removeEventListener('keydown', keydown, true)
      window.removeEventListener('pagehide', dismiss)
      if (restore?.isConnected) restore.focus({ preventScroll: true })
      resolve(result)
    }
    const dismiss = () => finish(null)
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss() }
      if (event.key !== 'Tab') return
      const items = [...mask.querySelectorAll('input, button')]
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    activeDialog = finish
    mask.addEventListener('click', event => { if (event.target === mask) dismiss() })
    mask.querySelector('.dialog-cancel').addEventListener('click', dismiss)
    mask.querySelector('form').addEventListener('submit', event => {
      event.preventDefault()
      if (input && !input.value.trim()) { mask.querySelector('.dialog-error').hidden = false; input.focus(); return }
      finish(input ? input.value.trim() : true)
    })
    document.addEventListener('keydown', keydown, true)
    window.addEventListener('pagehide', dismiss, { once: true })
    document.body.append(mask)
    ;(input || mask.querySelector('.dialog-cancel')).focus({ preventScroll: true })
  })
}
