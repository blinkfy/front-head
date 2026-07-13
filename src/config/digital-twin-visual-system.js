const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

export const DIGITAL_TWIN_VISUAL_SYSTEM = freeze({
  schemaVersion: 1,
  baselineDate: '2026-07-13',
  camera: {
    projection: 'orthographic_2_5d',
    objectView: 'left_front_35_45',
    pitchDeg: 35,
    yawDeg: -40,
    preserveAspectRatio: true
  },
  lighting: {
    main: {
      direction: { x: -0.58, y: -0.44, z: 0.68 },
      screenDirection: 'top_left_to_bottom_right',
      color: '#e8f5ff',
      intensity: 0.88
    },
    ambient: {
      color: '#75a6bd',
      intensity: 0.34
    }
  },
  shadow: {
    screenDirection: 'bottom_right',
    offsetX: 10,
    offsetY: 14,
    opacity: 0.28,
    blur: 24,
    contactOpacity: 0.38,
    contactBlur: 7,
    color: '#00111d'
  },
  object: {
    outline: {
      width: 1.25,
      color: 'rgba(185, 232, 255, 0.72)',
      activeColor: '#24d9ff'
    },
    selectionRing: {
      width: 3,
      radius: 10,
      color: '#24d9ff',
      glowColor: 'rgba(36, 217, 255, 0.42)',
      glowBlur: 14,
      pulseDurationMs: 1600
    },
    mutedOpacity: 0.58,
    disabledSaturation: 0.35
  },
  mapEntity: {
    depthScale: {
      farY: 10,
      nearY: 90,
      min: 0.96,
      max: 1.04
    },
    motion: {
      accelerationEnd: 0.16,
      cruiseEnd: 0.78,
      decelerationEnd: 0.94,
      accelerationDistance: 0.10,
      cruiseDistance: 0.78,
      arrivalHold: 0.06,
      turnBlendMs: 220,
      maxVisualTurnDeg: 6
    },
    shadow: {
      direction: 'bottom_right',
      offsetX: 5,
      offsetY: 5,
      opacity: 0.34,
      blur: 3,
      skewDeg: -18
    },
    layer: {
      route: 3,
      entity: 5,
      foregroundOcclusion: 6,
      label: 12
    }
  },
  statusColors: {
    normal: '#24d9ff',
    active: '#2f8cff',
    success: '#24cb95',
    warning: '#f3b63f',
    danger: '#ff6577',
    offline: '#73899a',
    standby: '#8ea5b5',
    processing: '#27c7d8',
    selected: '#b7f6ff',
    routePrimary: '#24d9ff',
    routeSecondary: '#ff9b52'
  },
  labels: {
    fontFamily: '"Source Han Sans SC", "Microsoft YaHei", sans-serif',
    hierarchy: {
      sceneTitle: { fontSize: 18, lineHeight: 1.25, fontWeight: 760, zIndex: 40 },
      panelTitle: { fontSize: 14, lineHeight: 1.3, fontWeight: 720, zIndex: 36 },
      objectName: { fontSize: 12, lineHeight: 1.25, fontWeight: 680, zIndex: 32 },
      objectStatus: { fontSize: 10, lineHeight: 1.2, fontWeight: 650, zIndex: 31 },
      objectId: { fontSize: 8, lineHeight: 1.2, fontWeight: 500, zIndex: 30 },
      annotation: { fontSize: 9, lineHeight: 1.3, fontWeight: 560, zIndex: 34 }
    },
    foreground: '#e8f8ff',
    muted: '#8fb1c4',
    background: 'rgba(3, 24, 38, 0.84)',
    border: 'rgba(126, 196, 239, 0.30)',
    radius: 6,
    paddingX: 7,
    paddingY: 4
  },
  route: {
    width: 4,
    activeWidth: 5,
    outlineWidth: 2,
    outlineColor: 'rgba(0, 14, 24, 0.72)',
    dashLength: 12,
    dashGap: 8,
    flowSpeedPxPerSecond: 72,
    flowCycleMs: 1200,
    opacity: 0.92
  },
  panel: {
    background: 'rgba(7, 27, 43, 0.88)',
    elevatedBackground: 'rgba(5, 24, 39, 0.96)',
    transparency: 0.88,
    border: 'rgba(116, 197, 255, 0.28)',
    radius: 12,
    elevatedRadius: 14,
    blur: 8,
    shadow: '0 18px 60px rgba(0, 0, 0, 0.42)'
  },
  transitions: {
    pageMs: 240,
    overlayMs: 180,
    stateMs: 160,
    selectionMs: 140,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
  },
  localWindow: {
    background: '#071b2a',
    sceneBackground: '#0a2232',
    foreground: '#eaf9ff',
    backdropOpacity: 0.94,
    zIndex: {
      backdrop: 100,
      scene: 110,
      actor: 120,
      effect: 130,
      foregroundMask: 140,
      labels: 150,
      controls: 160
    }
  }
})

export default DIGITAL_TWIN_VISUAL_SYSTEM

export function mapDepthScale(y) {
  const rule = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.depthScale
  const ratio = Math.max(0, Math.min(1, (Number(y) - rule.farY) / Math.max(1, rule.nearY - rule.farY)))
  return rule.min + (rule.max - rule.min) * ratio
}

export function mapMotionProgress(progress) {
  const rule = DIGITAL_TWIN_VISUAL_SYSTEM.mapEntity.motion
  const t = Math.max(0, Math.min(1, Number(progress) || 0))
  if (t >= rule.decelerationEnd) return 1
  if (t <= rule.accelerationEnd) {
    const local = t / rule.accelerationEnd
    return rule.accelerationDistance * local * local
  }
  if (t <= rule.cruiseEnd) {
    const local = (t - rule.accelerationEnd) / (rule.cruiseEnd - rule.accelerationEnd)
    return rule.accelerationDistance + rule.cruiseDistance * local
  }
  const local = (t - rule.cruiseEnd) / (rule.decelerationEnd - rule.cruiseEnd)
  const eased = 1 - (1 - local) ** 3
  return rule.accelerationDistance + rule.cruiseDistance + (1 - rule.accelerationDistance - rule.cruiseDistance) * eased
}

export function mapPolylineHeading(points, progress) {
  if (!Array.isArray(points) || points.length < 2) return 0
  const t = Math.max(0, Math.min(1, Number(progress) || 0))
  const scaled = t * (points.length - 1)
  const index = Math.min(points.length - 2, Math.floor(scaled))
  const from = points[index]
  const to = points[index + 1]
  return Math.atan2(Number(to?.y) - Number(from?.y), Number(to?.x) - Number(from?.x)) * 180 / Math.PI
}
