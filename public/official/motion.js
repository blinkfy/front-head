// 官网渐进入场：不依赖动画库；关闭脚本或减少动态效果时，内容直接显示。
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (preference.matches || !Element.prototype.animate) return

  const active = new Set()
  const pending = new Set()
  let observer

  function enter(element, delay = 0, distance = 22, duration = 720) {
    if (!element || preference.matches) return
    const animation = element.animate([
      { opacity: 0, translate: `0 ${distance}px` },
      { opacity: 1, translate: '0 0' }
    ], { duration, delay, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards' })
    element.classList.remove('motion-pending')
    pending.delete(element)
    active.add(animation)
    animation.finished.then(() => active.delete(animation), () => active.delete(animation))
  }

  // 标题逐行、文案与主视觉错峰进入，约一秒内完成首屏呈现。
  if (!location.hash || location.hash === '#home' || location.hash === '#main') {
    enter(document.querySelector('.header-inner'), 0, -8, 560)
    document.querySelectorAll('.hero h1 span').forEach((line, index) => enter(line, 70 + index * 110, 24, 820))
    enter(document.querySelector('.hero-description'), 240, 16, 760)
    enter(document.querySelector('.hero-actions'), 330, 14, 680)
    enter(document.querySelector('.release-inline'), 400, 10, 600)
    enter(document.querySelector('.hero-art'), 160, 26, 980)
  }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        enter(entry.target, Number(entry.target.dataset.enterDelay) || 0)
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' })

    const groups = [
      ['.capability-heading', 0], ['.capability', 65],
      ['.showcase .section-heading', 0], ['.screen-item', 90],
      ['.promo-film', 0], ['.access-main h2', 0],
      ['.access-option', 70], ['.access-art', 0],
      ['.mini-program', 0], ['.footer-inner', 0]
    ]
    groups.forEach(([selector, stagger]) => {
      document.querySelectorAll(selector).forEach((element, index) => {
        if (element.hidden) return
        element.dataset.enterDelay = Math.min(index * stagger, 180)
        element.classList.add('motion-pending')
        pending.add(element)
        observer.observe(element)
      })
    })
  }

  // 键盘进入未显现的区域时立即显示；动态切换系统偏好也会撤销动画。
  document.addEventListener('focusin', event => {
    const element = event.target.closest('.motion-pending')
    if (!element) return
    observer?.unobserve(element)
    enter(element, 0, 8, 240)
  })
  preference.addEventListener('change', event => {
    if (!event.matches) return
    observer?.disconnect()
    pending.forEach(element => element.classList.remove('motion-pending'))
    pending.clear()
    active.forEach(animation => animation.cancel())
    active.clear()
  })
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return
    pending.forEach(element => element.classList.remove('motion-pending'))
    pending.clear()
    observer?.disconnect()
    active.forEach(animation => animation.cancel())
    active.clear()
  })
})()
