import request from '@/api/index'

export function useH5RegistrationPolicy({ allowed, loading, error }) {
  let pendingRequest = null

  allowed.value = false
  loading.value = true

  return function refreshH5RegistrationPolicy() {
    if (pendingRequest) return pendingRequest

    allowed.value = false
    loading.value = true
    error.value = ''

    pendingRequest = request({
      url: '/api/registration/settings',
      method: 'GET',
      silent: true
    }).then(response => {
      if (response?.code !== 0 || typeof response?.data?.allowWebRegistration !== 'boolean') {
        throw new Error(response?.msg || '网页注册设置读取失败')
      }

      allowed.value = response.data.allowWebRegistration
      return allowed.value
    }).catch(err => {
      allowed.value = false
      error.value = err?.msg || err?.message || '网页注册设置读取失败，请稍后重试'
      return false
    }).finally(() => {
      loading.value = false
      pendingRequest = null
    })

    return pendingRequest
  }
}
