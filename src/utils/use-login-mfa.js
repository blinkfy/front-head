import { ref } from 'vue'

// Keep the challenge in MfaLoginPanel while presenting its methods in the original login UI.
export function useLoginMfa({ panel, username, password, loading }) {
  const state = ref(null)
  let originalForm = null
  function onChange(next, result) {
    const previous = state.value
    if (next && !previous) originalForm = { username: username.value, password: password.value }
    state.value = next
    if (next) username.value = next.accountName || username.value
    if (next?.method === 'password' && (previous?.mfaTicket !== next.mfaTicket || previous?.method !== 'password')) {
      username.value = next.accountName || ''
      password.value = ''
    }
    if (!next && originalForm) {
      username.value = originalForm.username
      password.value = originalForm.password
      originalForm = null
    }
    loading.value = next ? next.busy === true : Boolean(result?.token)
  }
  function open(result) {
    let qr = false
    // #ifdef H5 || APP-PLUS
    qr = true
    // #endif
    return panel.value.open(result, { password: true, qr })
  }
  async function submitPassword() {
    if (!state.value || state.value.method !== 'password' || loading.value) return
    if (!password.value) { uni.showToast({ title: '请输入密码', icon: 'none' }); return }
    const ticket = state.value.mfaTicket
    loading.value = true
    try { await panel.value.submitPassword(password.value) }
    finally { if (state.value?.mfaTicket === ticket) loading.value = false }
  }
  function acceptQr(result, ticket) {
    if (!state.value || state.value.method !== 'qr' || state.value.mfaTicket !== ticket) return false
    return panel.value.acceptExternal(result, 'qr')
  }
  return { state, onChange, open, submitPassword, acceptQr }
}
