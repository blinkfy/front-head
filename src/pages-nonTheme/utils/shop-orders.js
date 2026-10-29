export const shopStatusTabs = [
  { value: '', label: '全部' }, { value: 'pending', label: '待发货' },
  { value: 'shipped', label: '待收货' }, { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已取消' }
]
export function orderStatus(status) {
  return shopStatusTabs.find(item => item.value === status && item.value)?.label || (status === 'historical' ? '历史兑换待核实' : '状态待核实')
}
export const orderImage = order => order?.productSnapshot?.image || ''
export function orderTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value)
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export const shopError = (error, fallback = '加载失败，请重试') => error?.msg || error?.message || fallback
export const shopRoute = () => uni.getStorageSync('app_theme') === 'dark' ? '/pages-dark/shop/shop' : '/pages/shop/shop'
export function returnToShop() {
  const pages = getCurrentPages()
  const index = pages.findIndex(page => ['pages/shop/shop', 'pages-dark/shop/shop'].includes(page.route))
  if (index >= 0 && index < pages.length - 1) uni.navigateBack({ delta: pages.length - 1 - index })
  else uni.reLaunch({ url: shopRoute() })
}
export function backFromShopPage(fallback = 'shop') {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else if (fallback === 'orders') uni.redirectTo({ url: '/pages-nonTheme/shop-orders' })
  else returnToShop()
}
// 按登录身份隔离未决意图；页面刷新、超时重试均复用同一请求。
export function shopIntentKey(productId) {
  const token = String(uni.getStorageSync('token') || '')
  let hash = 2166136261
  for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619)
  return `shop:intent:${hash >>> 0}:${productId}`
}
export const newShopRequestId = () => `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
