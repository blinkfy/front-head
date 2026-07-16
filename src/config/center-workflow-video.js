import { digitalTwinAssetUrl, digitalTwinWebpAssetUrl } from '@/utils/digital-twin-assets.js'

const VIDEO_ROOT = digitalTwinAssetUrl('digital-twin-replay/center-workflow/video')

export const CENTER_WORKFLOW_MASTER_VIDEO = Object.freeze({
  approved: true,
  file: `${VIDEO_ROOT}/center-workflow-master-v5.mp4`,
  poster: `${VIDEO_ROOT}/center-workflow-master-v5-poster.jpg`,
  width: 1280,
  height: 720,
  durationSeconds: 18.33,
  playbackRate: 1,
  transitionMode: 'camera-push-pull',
  overlayAnchors: Object.freeze({
    topLeft: Object.freeze({ leftPct: 0.5, topPct: 0.5, widthPct: 34 }),
    bottomRight: Object.freeze({ rightPct: 0.5, bottomPct: 0.5, widthPct: 34 })
  }),
  cuePoints: Object.freeze({
    arrive: Object.freeze({ startSeconds: 0, endSeconds: 1.3 }),
    weigh: Object.freeze({ startSeconds: 1.3, endSeconds: 4.68 }),
    wash: Object.freeze({ startSeconds: 4.68, endSeconds: 7.15 }),
    dry: Object.freeze({ startSeconds: 7.15, endSeconds: 8.55 }),
    battery: Object.freeze({ startSeconds: 8.55, endSeconds: 13.1 }),
    charge: Object.freeze({ startSeconds: 13.1, endSeconds: 16.57, holdLastFrameSeconds: 0.8 }),
    ready: Object.freeze({ startSeconds: 16.57, endSeconds: 18.33 })
  }),
  fallbackImage: digitalTwinWebpAssetUrl(
    'sorting-center/facility-digital-twin.webp',
    'sorting-center/facility-digital-twin.png'
  )
})
