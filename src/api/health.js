import request from './index'

export function checkHealth() {
  return request({
    url: '/health',
    method: 'GET'
  })
} 
export function checkDB() {
  return request({
    url: '/api/_db_state',
    method: 'GET'
  })
}