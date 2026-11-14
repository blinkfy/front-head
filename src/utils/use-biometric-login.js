import { ref, onBeforeUnmount, nextTick } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { quickLogin as biometricLogin, quickLoginApi as biometricApi, quickLoginPlatform } from './quick-login.js'
import { biometricErrorMessage } from './biometric-login-core.mjs'

export function useBiometricLogin({ loading, onLogin, ready = async () => {} }) {
  const available = ref(false), label = ref('指纹或面容登录')
  const systemPromptOwner = {}
  let page = null
  const currentPage = () => typeof getCurrentPages === 'function' ? getCurrentPages().slice(-1)[0] : null
  const isCurrentPage = () => !page || currentPage() === page
  let active = true, attempted = false, generation = 0, ownedLoading = false
  function deactivate() {
    active = false
    generation++
    biometricLogin.cancel()
    if (ownedLoading) loading.value = false
    ownedLoading = false
  }
  onBeforeUnmount(deactivate)
  onHide(() => { if (!isCurrentPage() || !biometricLogin.suspendSystemAuthentication?.(systemPromptOwner)) deactivate() })
  onShow(() => { page = currentPage(); active = true; biometricLogin.resumeSystemAuthentication?.(systemPromptOwner); void refresh() })
  const current = () => active && isCurrentPage() && !loading.value
  async function refresh() {
    const owner = generation
    const support = await biometricLogin.capability()
    if (!active || generation !== owner) return
    const state = biometricLogin.state()
    label.value = support.label || '指纹或面容登录'
    available.value = state.enabled && Boolean(state.credentialId) && support.supported && support.enrolled
    return support
  }
  async function login() {
    if (!current()) return
    const owner = generation
    const isActive = () => active && generation === owner && isCurrentPage()
    loading.value = true
    ownedLoading = true
    try {
      const result = await biometricLogin.login(isActive, systemPromptOwner)
      if (result && isActive()) {
        // The normal completion flow now owns loading through the home-page handoff.
        ownedLoading = false
        await onLogin(result)
      }
      else if (isActive()) loading.value = false
    } catch (error) {
      if (isActive()) {
        loading.value = false
        const message = biometricErrorMessage(error)
        if (message) uni.showToast({ title: message, icon: 'none' })
        await refresh()
      }
    } finally { if (isActive()) ownedLoading = false }
  }
  async function prefer() {
    if (attempted) return true
    attempted = true
    const owner = generation
    const isActive = () => active && generation === owner && isCurrentPage()
    const state = biometricLogin.state()
    if (!state.enabled || (!state.credentialId && !state.prompted)) return false
    // An unfinished web/WeChat setup must not intercept the existing login flow
    // on a later visit. A cancelled ceremony below still stays on this page.
    if (quickLoginPlatform !== 'app' && !state.credentialId) return false
    // Preserve an existing remembered, valid session before asking the system to authenticate.
    const token = uni.getStorageSync('token')
    if (token && uni.getStorageSync('autoLogin') === true) {
      loading.value = true
      ownedLoading = true
      try {
        const response = await biometricApi('/userinfo?avater=false', {}, token, 'GET')
        if (!isActive()) return true
        if (uni.getStorageSync('token') !== token) { loading.value = false; return true }
        if (!response.data?.id || !Number.isSafeInteger(Number(response.data.id))) throw { code: 2, msg: '账号状态暂不可用' }
        ownedLoading = false
        await onLogin({ ...response, token, isAdmin: response.data?.isAdmin === true, userInfo: response.data, biometric: true })
        return true
      } catch (error) {
        if (!isActive()) return true
        loading.value = false
        if (quickLoginPlatform !== 'app' && error.reason === 'unsupported') return false
        // A network outage is not proof that the session expired; leave all credentials intact.
        if (error.code !== 401 && error.reason !== 'invalid_credential' && !/过期|无效|未登录|账号不存在/.test(error.msg || '')) return true
        if (uni.getStorageSync('token') === token) uni.removeStorageSync('token')
      } finally { if (isActive()) ownedLoading = false }
    }
    await ready()
    await nextTick()
    if (!isActive() || loading.value) return true
    const support = await refresh()
    if (!isActive()) return true
    if (quickLoginPlatform !== 'app' && (!support?.supported || !support.enrolled)) return false
    if (available.value) await login()
    // Never silently fall through to saved-password auto-login after cancellation or failure.
    return true
  }
  async function afterLogin(token, user) {
    const owner = generation
    const isActive = () => active && generation === owner && isCurrentPage()
    if (!isActive()) return false
    await ready()
    if (!isActive()) return false
    try { await biometricLogin.afterLogin(token, user, isActive, systemPromptOwner) }
    catch (error) { const message = biometricErrorMessage(error); if (message && isActive()) uni.showToast({ title: message, icon: 'none' }) }
    return isActive()
  }
  return { available, label, login, prefer, afterLogin, promptOwner: systemPromptOwner }
}
