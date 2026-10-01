export const WECHAT_BIND_INTENT_KEY = 'wechat_bind_intent'
export const WECHAT_AUTO_LOGIN_KEY = 'wechat_auto_login'
export const WECHAT_LAST_LOGIN_KEY = 'wechat_last_login'
export const WECHAT_SHARED_SESSION_KEY = 'wechat_shared_session'

export function getWechatLoginCode(runtime) {
  const failed = message => Object.assign(new Error(message), { reason: 'WECHAT_CLIENT_LOGIN_FAILED' })
  return new Promise((resolve, reject) => {
    runtime.login({
      provider: 'weixin',
      success: result => result.code
        ? resolve(result.code)
        : reject(failed('未获取到微信登录凭证，请重试')),
      fail: () => reject(failed('微信登录未完成，请重试'))
    })
  })
}

export function rememberWechatLogin(runtime, result = {}, remember = true) {
  runtime.setStorageSync(WECHAT_AUTO_LOGIN_KEY, remember)
  runtime.setStorageSync('autoLogin', remember)
  runtime.removeStorageSync(WECHAT_BIND_INTENT_KEY)
  runtime.removeStorageSync('savedUser')
  if (!remember) {
    runtime.removeStorageSync(WECHAT_LAST_LOGIN_KEY)
    runtime.removeStorageSync(WECHAT_SHARED_SESSION_KEY)
    return
  }
  runtime.setStorageSync(WECHAT_LAST_LOGIN_KEY, result.wechatLoginMode === 'shared'
    ? { mode: 'shared', account: result.wechatAccount }
    : { mode: 'primary' })
  if (result.wechatLoginMode === 'shared') runtime.setStorageSync(WECHAT_SHARED_SESSION_KEY, result.token)
  else runtime.removeStorageSync(WECHAT_SHARED_SESSION_KEY)
}

export function shouldAutoWechatLogin(runtime) {
  return runtime.getStorageSync(WECHAT_AUTO_LOGIN_KEY) === true &&
    runtime.getStorageSync('autoLogin') !== false &&
    runtime.getStorageSync(WECHAT_BIND_INTENT_KEY) !== true
}

export function clearWechatLoginSession(runtime) {
  for (const key of ['token', 'userInfo', 'isAdmin']) runtime.removeStorageSync(key)
}

// Persist preferences and the signed shared-session proof, never WeChat codes or passwords.
export function createWechatLoginFlow({ runtime, login }) {
  const isPending = () => runtime.getStorageSync(WECHAT_BIND_INTENT_KEY) === true
  const cancel = () => runtime.removeStorageSync(WECHAT_BIND_INTENT_KEY)
  async function begin(resumeLastAccount = false) {
    const previousToken = runtime.getStorageSync(WECHAT_SHARED_SESSION_KEY) || runtime.getStorageSync('token')
    const lastLogin = runtime.getStorageSync(WECHAT_LAST_LOGIN_KEY)
    // A switched WeChat account must not keep the previous account's cached session.
    clearWechatLoginSession(runtime)
    const result = await login({
      code: await getWechatLoginCode(runtime),
      ...(resumeLastAccount && lastLogin?.mode === 'shared'
        ? { previousToken, lastAccount: lastLogin.account } : {})
    })
    if (result.data?.needBind) {
      runtime.setStorageSync(WECHAT_BIND_INTENT_KEY, true)
    } else {
      if (!result.token) throw new Error('微信登录结果异常，请重试')
      cancel()
    }
    return result
  }
  return { isPending, begin, cancel }
}

const dialog = (runtime, options) => new Promise((resolve, reject) => {
  runtime.showModal({ ...options, success: resolve, fail: reject })
})
const stopped = reason => Object.assign(new Error('本次未登录'), { reason, handled: true })

// The same confirmation flow is shared by both themes. No token is committed until it returns successfully.
export function createWechatPasswordLoginFlow({ runtime, login, previewMerge, commitMerge, chooseMerge }) {
  return async (credentials, isActive = () => true) => {
    clearWechatLoginSession(runtime)
    const send = async confirmBind => login({
      ...credentials, wechatCode: await getWechatLoginCode(runtime), confirmBind
    })
    let result = await send(false)
    if (!isActive()) throw stopped('LOGIN_CANCELLED')
    if (result.data?.needConfirmBind) {
      const answer = await dialog(runtime, {
        title: '绑定微信主账号',
        content: `将“${result.data.targetAccount}”绑定为当前微信主账号。绑定后，当前微信登录其他未绑定账号需先合并数据；其他已绑定账号需开启“允许其他微信登录”才能登录。是否确认？`,
        confirmText: '确认绑定', cancelText: '暂不绑定'
      })
      if (!answer.confirm || !isActive()) throw stopped('LOGIN_CANCELLED')
      result = await send(true)
    }
    if (!isActive()) throw stopped('LOGIN_CANCELLED')
    if (result.data?.needMerge) {
      if (previewMerge && commitMerge && chooseMerge) {
        const preview = await previewMerge({ sourceUsername: credentials.username,
          sourcePassword: credentials.password, wechatCode: await getWechatLoginCode(runtime) })
        if (!isActive()) throw stopped('LOGIN_CANCELLED')
        const keepAccount = await chooseMerge(preview.data)
        if (!keepAccount || !isActive()) throw stopped('LOGIN_CANCELLED')
        const direction = keepAccount === 'currentWechat' ? preview.data.keepA :
          keepAccount === 'verified' ? preview.data.keepB : null
        if (!direction?.canMerge) throw stopped('MERGE_BLOCKED')
        result = await commitMerge({ mergeTicket: preview.data.mergeTicket,
          wechatCode: await getWechatLoginCode(runtime), sourcePassword: credentials.password,
          keepAccount, confirm: true })
        if (!isActive()) throw stopped('LOGIN_CANCELLED')
      } else {
      await dialog(runtime, {
        title: '需要合并账号',
        content: '请返回登录页选择要保留的账号后完成合并，本次不会登录或修改数据。',
        showCancel: false, confirmText: '我知道了'
      })
      throw stopped('MERGE_REQUIRED')
      }
    }
    if (result.data?.needConfirmBind || !result.token) {
      throw new Error('登录状态已变化，请重新尝试')
    }
    return result
  }
}
