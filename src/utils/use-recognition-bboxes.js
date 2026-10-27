import { computed, ref, watch, nextTick, getCurrentInstance, onBeforeUnmount } from 'vue'
import { getBboxColor, mapBboxToDisplay } from './recognition-sync'

// All measurements and styles use CSS px. aspectFit's centred letterbox must
// be included; rpx sizes and devicePixelRatio are not bbox coordinate units.
export function useRecognitionBboxes(source, boxes, space) {
  const scope = getCurrentInstance()?.proxy
  const displayBboxes = ref([])
  let naturalSize = null
  let generation = 0
  let measurement = 0
  let timer = null
  let disposed = false

  function invalidate() {
    generation += 1
    measurement += 1
    naturalSize = null
    displayBboxes.value = []
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  watch(source, invalidate, { flush: 'sync' })

  function queueRefreshDisplayBboxes() {
    measurement += 1
    if (timer !== null) clearTimeout(timer)
    if (disposed || !naturalSize || !boxes.value.length) {
      displayBboxes.value = []
      timer = null
      return
    }
    const currentGeneration = generation
    const currentMeasurement = measurement
    timer = setTimeout(async () => {
      timer = null
      await nextTick()
      const isCurrent = () => !disposed && generation === currentGeneration && measurement === currentMeasurement
      if (!isCurrent()) return
      try {
        let query = uni.createSelectorQuery()
        if (scope) query = query.in(scope)
        query.select('.result-image-wrap').boundingClientRect()
        query.select('.result-image').boundingClientRect()
        query.exec(rects => {
          if (!isCurrent()) return
          const [wrap, image] = rects || []
          if (!wrap || !image || !(image.width > 0) || !(image.height > 0)) {
            displayBboxes.value = []
            return
          }
          let windowWidth = 375
          try {
            const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
            windowWidth = info.windowWidth || windowWidth
          } catch (_) {}
          let rpxScale = windowWidth / 750
          try {
            const fontSize = uni.upx2px(20)
            if (Number.isFinite(fontSize) && fontSize > 0) rpxScale = fontSize / 20
          } catch (_) {}
          displayBboxes.value = buildDisplayBboxes(boxes.value, {
            displayWidth: image.width,
            displayHeight: image.height,
            naturalWidth: naturalSize.width,
            naturalHeight: naturalSize.height,
            objectFit: 'contain'
          }, space.value, windowWidth <= 768, image.left - wrap.left, image.top - wrap.top, rpxScale)
        })
      } catch (_) {
        // Missing/hidden nodes must never leave frames over a different image.
        if (isCurrent()) displayBboxes.value = []
      }
    }, 60)
  }

  // A keyed image and callbacks bound to its generation reject late load/error
  // events, including an A -> B -> A image switch while A is still loading.
  const bboxImage = computed(() => {
    const src = source.value
    const currentGeneration = generation
    const isCurrentImage = event => {
      const eventKey = event?.currentTarget?.dataset?.bboxKey ?? event?.target?.dataset?.bboxKey
      return !disposed && currentGeneration === generation && src === source.value &&
        (eventKey == null || String(eventKey) === String(currentGeneration))
    }
    return {
      key: currentGeneration,
      src,
      onLoad(event) {
        if (!isCurrentImage(event)) return
        const width = Number(event?.detail?.width)
        const height = Number(event?.detail?.height)
        naturalSize = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
          ? { width, height } : null
        queueRefreshDisplayBboxes()
      },
      onError(event) {
        if (!isCurrentImage(event)) return
        naturalSize = null
        queueRefreshDisplayBboxes()
      }
    }
  })

  watch([boxes, space], queueRefreshDisplayBboxes, { flush: 'post' })
  onBeforeUnmount(() => {
    disposed = true
    invalidate()
  })
  return { bboxImage, displayBboxes, queueRefreshDisplayBboxes }
}

export function buildDisplayBboxes(boxes, metrics, space, compact, offsetLeft = 0, offsetTop = 0, rpxScale = 0.5) {
  const ratio = Math.min(metrics.displayWidth / metrics.naturalWidth, metrics.displayHeight / metrics.naturalHeight)
  const renderWidth = metrics.naturalWidth * ratio
  const renderHeight = metrics.naturalHeight * ratio
  const next = []
  const placedLabels = []
  for (const item of boxes) {
    const mapped = mapBboxToDisplay(item.bbox, metrics, space, item.label?.bbox_space || '')
    if (!mapped) continue
    if (mapped.width >= renderWidth * 0.9 && mapped.height >= renderHeight * 0.9) continue
    const color = getBboxColor(item.label, item.index)
    const labelName = String(item.label?.name || item.label?.source_name || `目标${item.index + 1}`)
    const confidence = Number(item.label?.confidence)
    const confidenceText = Number.isFinite(confidence)
      ? ` ${Math.max(0, Math.min(100, Math.round(confidence * 100)))}%` : ''
    const label = `${labelName}${confidenceText}`
    const labelStyle = placeBboxLabel(label, mapped, metrics, compact, rpxScale, placedLabels)
    labelStyle.background = color
    next.push({
      label,
      boxStyle: {
        left: `${mapped.left + offsetLeft}px`,
        top: `${mapped.top + offsetTop}px`,
        width: `${mapped.width}px`,
        height: `${mapped.height}px`,
        borderColor: color
      },
      labelStyle
    })
  }
  return next
}

function placeBboxLabel(text, box, metrics, compact, rpxScale, placed) {
  const fontSize = 20 * rpxScale
  const lineHeight = fontSize * 1.3
  // Fixed border-box dimensions keep collision estimates valid on every end.
  // Long names are still ellipsised by the existing label CSS.
  const textWidth = Array.from(text).reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.65), 0) * fontSize
  const width = Math.min(metrics.displayWidth, 220 * rpxScale + 18, Math.ceil(textWidth + 18))
  const height = Math.min(metrics.displayHeight, Math.ceil(lineHeight + 6))
  const clampX = x => Math.max(0, Math.min(metrics.displayWidth - width, x))
  const clampY = y => Math.max(0, Math.min(metrics.displayHeight - height, y))
  const right = clampX(box.left + box.width - width)
  const left = clampX(box.left)
  const anchorX = box.left + box.width >= metrics.displayWidth - 120 ? right : left
  const anchorY = clampY(box.top + (box.top <= 24 || box.height < 38 ? 4 : (compact ? -18 : -22)))
  const gap = 3
  let best = null
  // Keep labels near their target: at most two rows away, with either edge
  // anchored to that same box. Dense scenes use the least-overlapping choice.
  for (const shift of [0, -1, 1, -2, 2]) {
    for (const x of [anchorX, anchorX === left ? right : left]) {
      const y = clampY(anchorY + shift * (height + gap))
      let overlap = 0
      for (const previous of placed) {
        overlap += Math.max(0, Math.min(x + width, previous.x + previous.width + gap) - Math.max(x, previous.x - gap)) *
          Math.max(0, Math.min(y + height, previous.y + previous.height + gap) - Math.max(y, previous.y - gap))
      }
      const distance = Math.abs(x - anchorX) + Math.abs(y - anchorY)
      if (!best || overlap < best.overlap || (overlap === best.overlap && distance < best.distance)) {
        best = { x, y, width, height, overlap, distance }
      }
    }
  }
  placed.push(best)
  return {
    // The label's containing block starts inside the box's 2px border.
    left: `${best.x - box.left - 2}px`,
    top: `${best.y - box.top - 2}px`,
    right: 'auto',
    width: `${width}px`,
    maxWidth: `${width}px`,
    height: `${height}px`,
    boxSizing: 'border-box',
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`,
    zIndex: 1
  }
}
