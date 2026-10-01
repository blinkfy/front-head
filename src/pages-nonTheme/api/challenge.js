/**
 * 挑战赛 API
 */
import request from '@/api/index.js';

export function getDailyChallenge() {
  return request({
    url: '/api/challenge/daily',
    method: 'GET',
    needAuth: true
  });
}

export function submitChallenge(data) {
  return request({
    url: '/api/challenge/submit',
    method: 'POST',
    data,
    needAuth: true
  });
}

export function getChallengeStats() {
  return request({
    url: '/api/challenge/stats',
    method: 'GET',
    needAuth: true
  });
}

export function getChallengeLeaderboard(type = 'all', limit = 50) {
  return request({
    url: '/api/challenge/leaderboard',
    method: 'GET',
    data: { type, limit },
    needAuth: true
  });
}

export function getWeeklyCalendar() {
  return request({
    url: '/api/challenge/weekly-calendar',
    method: 'GET',
    needAuth: true
  });
}

export function getCommunityRanking() {
  return request({
    url: '/api/challenge/community-ranking',
    method: 'GET',
    needAuth: true
  });
}

export function getModeQuestions(mode) {
  return request({
    url: '/api/challenge/mode-questions',
    method: 'GET',
    data: { mode },
    needAuth: true
  });
}
