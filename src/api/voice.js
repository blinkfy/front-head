/**
 * 语音识别 API
 * 预留阿里云 ASR 接口
 * 用户稍后提供 API Key 后可启用
 */
import request from '@/api/index.js';

export function recognizeByText(text) {
  return request({
    url: '/api/recognize/by-text',
    method: 'POST',
    data: { text }
  });
}

export function recognizeVoice(audioFile) {
  return request({
    url: '/api/voice/recognize',
    method: 'POST',
    data: { audioFile }
  });
}

export function submitVoiceFeedback(questionId, isCorrect) {
  return request({
    url: '/api/voice/feedback',
    method: 'POST',
    data: { questionId, isCorrect }
  });
}
