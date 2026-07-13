const freezeList = list => Object.freeze(list.map(item => Object.freeze(item)))

const VIDEO_ROOT = '/static/digital-twin-replay/center-workflow/video'

export const CENTER_WORKFLOW_MASTER_VIDEO = Object.freeze({
  approved: true,
  file: `${VIDEO_ROOT}/center-workflow-master-v5.mp4`,
  poster: `${VIDEO_ROOT}/center-workflow-master-v5-poster.jpg`,
  durationSeconds: 18.33,
  playbackRate: 1,
  transitionMode: 'camera-push-pull',
  cuePoints: Object.freeze({
    arrive: Object.freeze({ startSeconds: 0, endSeconds: 1.3 }),
    weigh: Object.freeze({ startSeconds: 1.3, endSeconds: 4.68 }),
    wash: Object.freeze({ startSeconds: 4.68, endSeconds: 7.15 }),
    dry: Object.freeze({ startSeconds: 7.15, endSeconds: 8.55 }),
    battery: Object.freeze({ startSeconds: 8.55, endSeconds: 13.1 }),
    charge: Object.freeze({ startSeconds: 13.1, endSeconds: 16.57, holdLastFrameSeconds: 0.8 }),
    ready: Object.freeze({ startSeconds: 16.57, endSeconds: 18.33 })
  }),
  fallbackImage: '/static/sorting-center/facility-digital-twin.png'
})

export const CENTER_WORKFLOW_VIDEO_CLIPS = freezeList([
  {
    approved: true,
    approvalBasis: 'verified_unloading_motion_0.00_3.20_and_watermarks_covered',
    eventType: 'CENTER_UNLOADING',
    phaseKey: 'UNLOAD',
    file: `${VIDEO_ROOT}/center-unloading-v1.mp4`,
    sourceStartSeconds: 0,
    sourceEndSeconds: 3.2,
    loop: false,
    playbackRate: 1,
    poster: `${VIDEO_ROOT}/center-unloading-v1-poster.jpg`,
    fallbackImage: '/static/sorting-center/facility-intake.png'
  },
  {
    approved: true,
    approvalBasis: 'verified_cleaning_action_3.30_6.00_and_watermarks_covered',
    eventType: 'CENTER_CLEANING',
    phaseKey: 'CLEAN',
    file: `${VIDEO_ROOT}/center-cleaning-v1.mp4`,
    sourceStartSeconds: 3.3,
    sourceEndSeconds: 6,
    loop: false,
    playbackRate: 1,
    poster: `${VIDEO_ROOT}/center-cleaning-v1-poster.jpg`,
    fallbackImage: '/static/sorting-center/facility-washing.png'
  },
  {
    approved: true,
    approvalBasis: 'verified_charging_label_and_pad_8.50_10.04_and_watermarks_covered',
    eventType: 'CENTER_CHARGING',
    phaseKey: 'CHARGE',
    file: `${VIDEO_ROOT}/center-charging-v1.mp4`,
    sourceStartSeconds: 8.5,
    sourceEndSeconds: 10.04,
    loop: false,
    playbackRate: 0.64,
    poster: `${VIDEO_ROOT}/center-charging-v1-poster.jpg`,
    fallbackImage: '/static/sorting-center/facility-inspection.png'
  },
  {
    approved: true,
    approvalBasis: 'verified_inspection_arms_6.10_8.30_and_watermarks_covered',
    eventType: 'DEVICE_RECOVERED',
    phaseKey: 'CHECK',
    file: `${VIDEO_ROOT}/center-status-check-v1.mp4`,
    sourceStartSeconds: 6.1,
    sourceEndSeconds: 8.3,
    loop: false,
    playbackRate: 0.69,
    poster: `${VIDEO_ROOT}/center-status-check-v1-poster.jpg`,
    fallbackImage: '/static/sorting-center/facility-inspection.png'
  }
])

const clipMap = Object.freeze(Object.fromEntries(
  CENTER_WORKFLOW_VIDEO_CLIPS.map(clip => [`${clip.eventType}:${clip.phaseKey}`, clip])
))

export function resolveCenterWorkflowVideo(eventType = '', phaseKey = '') {
  const clip = clipMap[`${eventType}:${phaseKey}`]
  return clip?.approved ? clip : null
}
