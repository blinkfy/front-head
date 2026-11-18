/**
 * 语音识别 API
 * 接入阿里百炼 DashScope ASR
 */
import request from '@/api/index.js';
import { baseUrl } from '@/api/settings.js';
import { transcribeLocalAudio, localFirstAsr } from '@/utils/local-asr.js';

function localResponse(result) {
  return { code: 0, msg: 'success', data: { text: result.text, local: true } };
}

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
export async function transcribeAudio(filePath, options = {}) {
  return localFirstAsr(
    async () => { const result = await transcribeLocalAudio([filePath], options); return result && { ...result, response: localResponse(result) }; },
    () => transcribeAudioCloud(filePath), options
  ).then(result => result.response || result);
}

function transcribeAudioCloud(filePath) {
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

export function transcribeAudioBlob(blob, filename = 'audio.webm', options = {}) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token') || '';
    const formData = new FormData();
    formData.append('audio', blob, filename);

    fetch(baseUrl + '/api/ai/transcribe?token=' + token, {
      method: 'POST',
      body: formData,
      signal: options.signal
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.code === 0) {
          resolve(data);
          return;
        }
        reject(data || { code: 1, msg: 'transcribe failed' });
      })
      .catch(reject);
  });
}

export async function transcribeAudioSegments(filePaths, options = {}) {
  return localFirstAsr(
    async () => { const result = await transcribeLocalAudio(filePaths, options); return result && { ...result, response: localResponse(result) }; },
    () => transcribeAudioSegmentsCloud(filePaths), options
  ).then(result => result.response || result);
}

function transcribeAudioSegmentsCloud(filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
  if (!paths.length) {
    return Promise.reject({ code: 1, msg: 'no audio segments' });
  }

  if (paths.length === 1) {
    return transcribeAudioCloud(paths[0]);
  }

  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token') || '';
    uni.uploadFile({
      url: baseUrl + '/api/ai/transcribe-segments?token=' + token,
      files: paths.map((path, index) => ({
        name: 'audio',
        uri: path,
        filePath: path,
        file: path,
        filename: `segment_${index}.mp3`
      })),
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
      fail: reject
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
