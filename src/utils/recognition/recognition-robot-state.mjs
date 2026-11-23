// Shared by the web/APP runtime and the generated WeChat model metadata.
export const ROBOT_SEQUENCES = {
  idle: ['Return_Idle', 'Idle_Base'],
  tap: ['Tap_Response', 'Idle_Base'],
  uploading: ['Upload_Enter', 'Upload_Loop'],
  processing: ['Analyze_Enter', 'Analyze_Loop'],
  reviewing: ['Analyze_Confirm', 'Analyze_Review_Loop'],
  success: ['Resolve', 'Success', 'Result_Look'],
  fail: ['Resolve', 'Fail'],
  'fail-loop': ['Resolve', 'Fail']
}
export const ROBOT_LOOP_CLIPS = ['Idle_Base', 'Upload_Loop', 'Analyze_Loop', 'Analyze_Review_Loop']

// Only acknowledge a real classification preview, never infer progress from time.
export function getRecognitionRobotState(snapshot) {
  return ['advising', 'finalizing'].includes(snapshot?.phase) &&
    Array.isArray(snapshot?.preview?.labels) && snapshot.preview.labels.length > 0
    ? 'reviewing' : 'processing'
}
