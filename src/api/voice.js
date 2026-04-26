/**
 * 语音识别 API
 * 接入阿里百炼 DashScope ASR
 */
import request from '@/api/index.js';
import { baseUrl } from './settings.js';

export function recognizeByText(text) {
  return request({
    url: '/api/recognize/by-text',
    method: 'POST',
    data: { text },
    needAuth: true
  });
}

/**
 * 上传音频文件进行语音识别
 * @param {string} filePath - 录音文件临时路径
 * @returns {Promise<{code: number, data: {text: string, requestId: string}}>}
 */
export function transcribeAudio(filePath) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token') || '';
    uni.uploadFile({
      url: baseUrl + '/api/ai/transcribe?token=' + token,
      filePath: filePath,
      name: 'audio',
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          if (data.code === 0) {
            resolve(data);
          } else {
            reject(data);
          }
        } catch (e) {
          reject({ code: 1, msg: '解析响应失败' });
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

export function submitVoiceFeedback(questionId, isCorrect) {
  return request({
    url: '/api/voice/feedback',
    method: 'POST',
    data: { questionId, isCorrect }
  });
}
