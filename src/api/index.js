import { baseUrl } from './settings'

function getToken() {
  try {
    return uni.getStorageSync('token') || ''
  } catch (e) {
    return ''
  }
}

function request({ url, method = 'GET', data = {}, header = {}, needAuth = false, contentType }) {
  const token = getToken()
  const headers = {
    'Content-Type': contentType || 'application/json',
    ...header
  }
  
  // 根据API文档，token作为查询参数传递
  let finalUrl = baseUrl + url
  if (needAuth && token) {
    const separator = url.includes('?') ? '&' : '?'
    finalUrl += `${separator}token=${token}`
  }
  
  return new Promise((resolve, reject) => {
    uni.request({
      url: finalUrl,
      method,
      data,
      header: headers,
      success: res => {
        if (res.statusCode === 200) {
          // 同时兼容 code:0（社区风格）和 success:true（新增API风格）
          if (res.data.code === 0 || res.data.status === 'ok' || res.data.success === true) {
            resolve(res.data)
          } else if (res.data.code === 401 || res.data.error === 'Unauthorized') {
            uni.showToast({ title: '请重新登录', icon: 'none' })
            uni.removeStorageSync('token')
            setTimeout(() => {
              if(uni.getStorageSync('app_theme') || 'light'==='dark'){
                uni.reLaunch({ url: '/pages-dark/index/index' })
              }else{
                uni.reLaunch({ url: '/pages/index/index' })
              }
            }, 1000)
            reject(res.data)
          } else if (res.data.code === 2) {
            // 数据库临时关闭：展示后端返回的具体提示信息，并在 storage 中记录状态
            uni.showToast({ title: res.data.msg || res.data.error || '数据库暂时关闭，该操作暂不可用', icon: 'none' })
            try {
              uni.setStorageSync('dbOffline', true)
            } catch (e) {
              // ignore storage errors
            }
            reject(res.data)
          } else {
            // 同时显示 msg（社区风格）或 error（新增API风格）
            uni.showToast({ title: res.data.msg || res.data.error || '请求失败', icon: 'none' })
            reject(res.data)
          }
        } else {
          if(res?.statusCode==404)
            if(!res.msg)res.msg='网络错误404'
          else if(res?.statusCode==429)
            if(!res.msg)res.msg='流量限制429'
          else if(res?.statusCode==401)
            if(!res.msg)res.msg='未授权401'
          else if(res?.statusCode==403)
            if(!res.msg)res.msg='禁止访问403'
          else if(res?.statusCode==500)
            if(!res.msg)res.msg='服务器错误500'
          else if(res?.statusCode==400)
            if(!res.msg)res.msg='请求错误400'
          else if(!res.msg)res.msg='网络错误'+res.statusCode
          if(res?.data?.msg)res.msg=res.data.msg
          reject(res)
        }
      },
      fail: err => {
        if(err && err.msg){
          uni.showToast({ title: err.msg, icon: 'none' })
        }else{
          uni.showToast({ title: '请求失败'+JSON.stringify(err), icon: 'none' })
        }
        reject(err)
      }
    })
  })
}

export default request 