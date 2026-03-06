import request from './index'

export function register(data) {
  return request({
    url: '/api/register',
    method: 'POST',
    data
  })
}

export function login(data) {
  return request({
    url: '/api/login',
    method: 'POST',
    data
  })
}

export function logout() {
  return request({
    url: '/api/logout',
    method: 'POST',
    needAuth: true
  })
}

export function changePassword({ username, password, new_password }) {
  return request({
    url: '/api/change_password',
    method: 'POST',
    data: {
      username,
      password,
      new_password
    },
    header: {
      'Authorization': `Bearer ${uni.getStorageSync('token')}`,
      'Content-Type': 'application/json'
    }
  })
} 

export function userinfo(avatar="true") {
  const token = uni.getStorageSync('token')
  return request({
    url: '/api/userinfo?avater='+avatar,
    method: 'GET',
    header: {
      'Authorization': `Bearer ${token}`, // 服务器需要Bearerǰ׺
      'Content-Type': 'application/json'
    }
  })
}

/**
 * 更新用户个人资料
 * @param {Object} data - 用户资料数据
 * @param {string} data.username - 用户名
 * @param {string} data.avatar - 头像URL
 * @param {string} data.bio - 个人简介
 * @param {string} data.phone - 联系电话
 * @param {string} data.email - 邮箱
 * @param {string} data.location - 所在地区
 * @returns {Promise}
 */
export function updateUserProfile(data) {
  const token = uni.getStorageSync('token')
  return request({
    url: '/api/profile',
    method: 'PUT',
    data: {
      username: data.username,
      avatar: data.avatar,
      bio: data.bio,
      phone: data.phone,
      email: data.email,
      location: data.location
    },
    header: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    needAuth: true
  })
}

/**
 * 获取用户详细资料
 * @returns {Promise}
 */
export function getUserProfile() {
  const token = uni.getStorageSync('token')
  return request({
    url: '/api/profile',
    method: 'GET',
    header: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    needAuth: true
  })
}