import { baseUrl } from './settings';

export function fetchShopRecommendations({
  limit = 6,
  currentPoints = 0,
  candidateProducts = []
} = {}) {
  const token = uni.getStorageSync('token') || '';
  if (!token) return Promise.resolve(null);

  const url = `${baseUrl}/api/shop/recommendations?token=${encodeURIComponent(token)}`;

  return new Promise((resolve) => {
    uni.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: token
      },
      data: {
        limit,
        currentPoints,
        candidateProducts
      },
      success: (res) => {
        try {
          const payload = res && res.data ? res.data : null;
          if (!payload || payload.code !== 0 || !payload.data) {
            resolve(null);
            return;
          }

          const list = Array.isArray(payload.data.recommendations)
            ? payload.data.recommendations
            : [];

          const names = list
            .map((item) => String(item && item.productName || '').trim())
            .filter(Boolean);

          if (!names.length) {
            resolve(null);
            return;
          }

          resolve({
            source: String(payload.data.source || '').trim(),
            names
          });
        } catch (_) {
          resolve(null);
        }
      },
      fail: () => {
        resolve(null);
      }
    });
  });
}
