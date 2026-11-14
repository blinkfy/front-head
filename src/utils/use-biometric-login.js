import { ref, onBeforeUnmount, nextTick } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { quickLogin as biometricLogin, quickLoginApi as biometricApi, quickLoginPlatform } from './quick-login.js'
import { biometricErrorMessage } from './biometric-login-core.mjs'

export function useBiometricLogin({ loading, onLogin, ready = async () => {}, chooseAccount = async () => null }) {
  const available = ref(false), switchable = ref(false), label = ref('指纹或面容登录')
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
    const accounts = biometricLogin.accounts?.() || (state.enabled && state.credentialId ? [state] : [])
    const selected = accounts.find(item => String(item.userId) === String(state.userId)) || accounts[0]
    label.value = (support.label || '指纹或面容登录') + (selected ? ` · ${selected.username || `账号 ${selected.userId}`}` : '')
    available.value = accounts.length > 0 && support.supported && support.enrolled
    switchable.value = available.value && accounts.length > 1
    return support
  }
  async function runLogin(pickAccount = false, userId) {
    if (!current()) return
    const owner = generation
    const isActive = () => active && generation === owner && isCurrentPage()
    loading.value = true
    ownedLoading = true
    try {
      const state = biometricLogin.state()
      const accounts = biometricLogin.accounts?.() || (state.enabled && state.credentialId ? [state] : [])
      let target = accounts.find(item => String(item.userId) === String(userId === undefined ? state.userId : userId)) || (userId === undefined ? accounts[0] : undefined)
      if (pickAccount && accounts.length > 1) {
        const selectedId = await chooseAccount(accounts, target?.userId)
        if (!isActive() || selectedId == null) { if (isActive()) loading.value = false; return }
        target = accounts.find(item => String(item.userId) === String(selectedId))
      }
      if (!isActive() || !target || biometricLogin.selectAccount?.(target.userId) === false) { if (isActive()) loading.value = false; return }
      await refresh()
      if (!isActive()) return
      const result = await biometricLogin.login(isActive, systemPromptOwner, { userId: target.userId })
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
  const login = () => runLogin(false)
  const switchAccount = () => runLogin(true)
  async function prefer() {
    if (attempted) return true
    attempted = true
    const owner = generation
    const isActive = () => active && generation === owner && isCurrentPage()
    const state = biometricLogin.state()
    const hasSelection = Number.isSafeInteger(Number(state.userId)) && Number(state.userId) > 0
    if (!hasSelection && (!state.enabled || (!state.credentialId && !state.prompted))) return false
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
        if (hasSelection && String(response.data.id) !== String(state.userId)) { loading.value = false; return true }
        ownedLoading = false
        await onLogin({ ...response, token, isAdmin: response.data?.isAdmin === true, userInfo: response.data, biometric: true })
        return true
      } catch (error) {
        if (!isActive()) return true
        loading.value = false
        if (quickLoginPlatform !== 'app' && error.reason === 'unsupported') return hasSelection
        // A network outage is not proof that the session expired; leave all credentials intact.
        if (error.code !== 401 && error.reason !== 'invalid_credential' && !/过期|无效|未登录|账号不存在/.test(error.msg || '')) return true
        if (uni.getStorageSync('token') === token) uni.removeStorageSync('token')
      } finally { if (isActive()) ownedLoading = false }
    }
    // A known account must never fall through to another account's saved password/WeChat session.
    if (!state.enabled || !state.credentialId) return hasSelection
    await ready()
    await nextTick()
    if (!isActive() || loading.value) return true
    const support = await refresh()
    if (!isActive()) return true
    if (quickLoginPlatform !== 'app' && (!support?.supported || !support.enrolled)) return hasSelection
    if (available.value) await runLogin(false, state.userId)
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
  return { available, switchable, label, login, switchAccount, prefer, afterLogin, promptOwner: systemPromptOwner }
}
