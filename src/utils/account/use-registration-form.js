import { nextTick, ref, watch } from 'vue'
import { register } from '@/api/user'
import { evaluatePassword } from './password-strength.mjs'
// #ifdef H5 || APP-PLUS
import { useH5RegistrationPolicy } from './use-h5-registration-policy.js'
// #endif
// #ifdef MP-WEIXIN
import { rememberWechatLogin } from './wechat-login.mjs'
import { markWechatProfileCompletion } from './wechat-profile.mjs'
// #endif

export function useRegistrationForm(loginUrl) {
  const username = ref('')
  const password = ref('')
  const confirmPwd = ref('')
  const fieldErrors = ref({})
  const focusedField = ref('')
  const isLoading = ref(false)
  const privacyAccepted = ref(false)
  const captchaInput = ref('')
  const captchaHint = ref('')
  const captchaRef = ref(null)
  const webRegistrationAllowed = ref(true)
  const webRegistrationLoading = ref(false)
  const webRegistrationError = ref('')
  let refreshH5RegistrationPolicy = null
  // #ifdef H5 || APP-PLUS
  refreshH5RegistrationPolicy = useH5RegistrationPolicy({
    allowed: webRegistrationAllowed,
    loading: webRegistrationLoading,
    error: webRegistrationError
  })
  // #endif

  const fields = ['username', 'password', 'confirmPwd']
  watch([username, password, confirmPwd], (values, previous) => {
    const errors = { ...fieldErrors.value }
    fields.forEach((field, index) => {
      if (values[index] !== previous[index]) delete errors[field]
    })
    fieldErrors.value = errors
  })

  function showError(title) {
    uni.showToast({ title, icon: 'none' })
  }

  function showFieldError(field, message, toast = message) {
    fieldErrors.value = { [field]: message }
    focusedField.value = ''
    nextTick(() => { focusedField.value = field })
    showError(toast)
  }

  function refreshCaptcha() {
    const captcha = captchaRef.value
    if (typeof captcha?.refresh === 'function') captcha.refresh()
  }

  async function onRegister() {
    if (isLoading.value) return
    // #ifdef H5 || APP-PLUS
    if (!webRegistrationAllowed.value || webRegistrationLoading.value) return
    // #endif
    fieldErrors.value = {}
    captchaHint.value = ''
    if (!username.value) return showFieldError('username', '请输入用户名')
    if (!password.value) return showFieldError('password', '请输入密码')
    if (!confirmPwd.value) return showFieldError('confirmPwd', '请确认密码')
    if (password.value !== confirmPwd.value) return showFieldError('confirmPwd', '两次密码不一致')

    const pwdCheck = evaluatePassword(password.value, { username: username.value })
    if (!pwdCheck.valid) return showFieldError('password', pwdCheck.hint || '密码过于简单', pwdCheck.message)
    // #ifdef APP-PLUS || MP-WEIXIN
    if (!privacyAccepted.value) return showError('请先阅读并同意用户协议与隐私保护指引')
    // #endif

    const captcha = captchaRef.value
    if (typeof captcha?.validate !== 'function' || !captcha.validate()) {
      captchaHint.value = '验证码错误，请重新输入'
      refreshCaptcha()
      return showError('验证码错误')
    }

    const submitted = { username: username.value, password: password.value }
    isLoading.value = true
    try {
      await register(submitted)
      uni.showToast({ title: '注册成功', icon: 'success' })
      let target = loginUrl
      // #ifdef MP-WEIXIN
      markWechatProfileCompletion(uni, submitted.username)
      rememberWechatLogin(uni)
      target += `?username=${encodeURIComponent(submitted.username)}`
      // #endif
      // #ifndef MP-WEIXIN
      uni.setStorageSync('autoLogin', true)
      uni.setStorageSync('savedUser', submitted)
      // #endif
      setTimeout(() => {
        isLoading.value = false
        uni.redirectTo({ url: target })
      }, 1200)
    } catch (error) {
      showError('注册失败: ' + (error?.msg || error?.message || '请重试'))
      console.error('注册失败:', error)
      isLoading.value = false
      refreshCaptcha()
    }
  }

  return {
    username, password, confirmPwd, fieldErrors, focusedField, isLoading, privacyAccepted,
    captchaInput, captchaHint, captchaRef, webRegistrationAllowed, webRegistrationLoading,
    webRegistrationError, refreshH5RegistrationPolicy, onRegister
  }
}
