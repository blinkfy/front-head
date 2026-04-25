/**
 * 挑战赛 API
 */
import request from '@/api/index.js';

export function getDailyChallenge() {
  return request({
    url: '/api/challenge/daily',
    method: 'GET'
  });
}

export function submitChallenge(data) {
  return request({
    url: '/api/challenge/submit',
    method: 'POST',
    data
  });
}

export function getChallengeStats() {
  return request({
    url: '/api/challenge/stats',
    method: 'GET'
  });
}

export function getChallengeLeaderboard(type = 'all', limit = 50) {
  return request({
    url: '/api/challenge/leaderboard',
    method: 'GET',
    params: { type, limit }
  });
}

export function getWeeklyCalendar() {
  return request({
    url: '/api/challenge/weekly-calendar',
    method: 'GET'
  });
}

export function getCommunityRanking() {
  return request({
    url: '/api/challenge/community-ranking',
    method: 'GET'
  });
}
