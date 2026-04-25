/**
 * 积分抽奖 API
 */
import request from '@/api/index.js';

export function getLotteryConfig() {
  return request({
    url: '/api/lottery/config',
    method: 'GET'
  });
}

export function getLotteryDailyStatus() {
  return request({
    url: '/api/lottery/daily-status',
    method: 'GET'
  });
}

export function drawLottery(usePoints = false) {
  return request({
    url: '/api/lottery/draw',
    method: 'POST',
    data: { usePoints }
  });
}

export function getLotteryRecords(page = 1, limit = 20) {
  return request({
    url: '/api/lottery/records',
    method: 'GET',
    params: { page, limit }
  });
}
