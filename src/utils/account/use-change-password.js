import { onMounted, ref } from 'vue'
import { changePassword, getUserProfile } from '@/api/user'
import { evaluatePassword } from './password-strength.mjs'
// #ifdef APP-PLUS || H5 || MP-WEIXIN
import { quickLogin } from './quick-login.js'
// #endif

export function useChangePassword(homeUrl) {
  const username = ref('')
  const profileError = ref(false)
  const profileLoading = ref(true)
  const submitting = ref(false)
  const password = ref('')
  const newPassword = ref('')
  const confirmPassword = ref('')

  function goBack() {
    if (getCurrentPages().length > 1) {
      uni.navigateBack()
    } else {
      uni.reLaunch({ url: homeUrl })
    }
  }

  async function loadUsername() {
    profileLoading.value = true
    profileError.value = false
    try {
      const res = await getUserProfile()
      const profileUsername = res?.data?.username
      if (res?.code !== 0 || !profileUsername) throw new Error('missing username')
      username.value = profileUsername
    } catch (_) {
      username.value = ''
      profileError.value = true
    } finally {
      profileLoading.value = false
    }
  }

  onMounted(loadUsername)

  async function onChangePassword() {
    if (profileLoading.value || profileError.value || !username.value || submitting.value) return
    if (!password.value || !newPassword.value || !confirmPassword.value) {
      uni.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }
    if (newPassword.value !== confirmPassword.value) {
      uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' })
      return
    }
    const pwdCheck = evaluatePassword(newPassword.value, {
      username: username.value,
      oldPassword: password.value
    })
    if (!pwdCheck.valid) {
      uni.showToast({ title: pwdCheck.message, icon: 'none' })
      return
    }

    submitting.value = true
    try {
      const res = await changePassword({
        username: username.value,
        password: password.value,
        new_password: newPassword.value
      })
      if (res?.code === 0) {
        // #ifdef APP-PLUS || H5 || MP-WEIXIN
        await quickLogin.forgetBinding()
        // #endif
        uni.removeStorageSync('savedUser')
        uni.showToast({ title: res.msg, icon: 'success' })
        setTimeout(() => uni.navigateBack(), 1500)
      } else {
        uni.showToast({ title: res?.msg || '修改失败', icon: 'none' })
      }
    } catch (err) {
      uni.showToast({ title: err?.msg || '网络错误，请稍后重试', icon: 'none' })
    } finally {
      submitting.value = false
    }
  }

  return {
    username, profileError, profileLoading, submitting, password, newPassword, confirmPassword,
    goBack, loadUsername, onChangePassword
  }
}
