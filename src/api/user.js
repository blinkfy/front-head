import request from './index'
// #ifdef MP-WEIXIN
import { getWechatLoginCode, createWechatPasswordLoginFlow } from '@/utils/wechat-login.mjs'
// #endif

export async function register(data) {
  let url = '/api/register'
  let payload = data
  // #ifdef MP-WEIXIN
  url = '/api/wechat/register'
  payload = { ...data, wechatCode: await getWechatLoginCode(uni) }
  // #endif
  const requestOptions = { url, method: 'POST', data: payload }
  // #ifdef H5
  requestOptions.header = { 'X-Client-Platform': 'h5' }
  // #endif
  return request(requestOptions)
}

export async function login(data, options = {}) {
  // #ifdef MP-WEIXIN
  return createWechatPasswordLoginFlow({
    runtime: uni,
    previewMerge: data => request({ url: '/api/account-merge/preview', method: 'POST', data, silent: true }),
    commitMerge: data => request({ url: '/api/account-merge/commit', method: 'POST', data, silent: true }),
    chooseMerge: options.chooseMerge,
    login: payload => request({ url: '/api/wechat/password-login', method: 'POST', data: payload, silent: true })
  })(data, options.isActive)
  // #endif
  // #ifndef MP-WEIXIN
  return request({ url: '/api/login', method: 'POST', data })
  // #endif
}

// #ifdef MP-WEIXIN
export function wechatLogin(data) {
  return request({ url: '/api/wechat/login', method: 'POST', data, silent: true })
}

export function bindWechat(data, token) {
  // Keep the explicit binding endpoint available to existing callers.
  return request({
    url: '/api/wechat/bind', method: 'POST', data, silent: true,
    header: { Authorization: `Bearer ${token}` }
  })
}

export function getWechatLoginSettings() {
  return request({ url: '/api/wechat/login-settings', needAuth: true, silent: true })
}

export function updateWechatLoginSettings(allowOtherWechatLogin) {
  return request({
    url: '/api/wechat/login-settings', method: 'PUT', needAuth: true, silent: true,
    data: { allowOtherWechatLogin }
  })
}
// #endif

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
      'Authorization': `Bearer ${token}`, // 服务器需要Bearer前缀
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
  const payload = {}
  for (const field of ['username', 'nickname', 'avatar', 'bio', 'phone', 'email', 'location', 'provinceCode', 'cityCode', 'districtCode', 'communityCode']) {
    if (data[field] !== undefined) payload[field] = data[field]
  }
  return request({
    url: '/api/profile',
    method: 'PUT',
    data: payload,
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
