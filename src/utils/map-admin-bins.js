import { ref } from 'vue'
import { userinfo } from '@/api/user'
import { getBinsList } from '@/api/database'
import { getTrashBinList } from '@/api/map'

export function binReports(bin) {
  const value = bin?.errorReport
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch (_) { return [] }
  }
  return []
}

export function binMapLabel(bin) {
  const name = bin.type === 'smart' ? '智能垃圾桶' : '普通垃圾桶'
  return `${name}${bin.adminRecord && bin.review !== true ? ' · 未通过审核' : ''}${binReports(bin).length ? ' · 有报错' : ''}`
}

// 权限来自服务端；普通用户仍走原来的附近桶接口。
export function useMapAdminBins() {
  const isMapAdmin = ref(false)
  let identityToken
  let identityRequest
  async function loadMapBins(params) {
    const token = uni.getStorageSync('token') || ''
    if (token !== identityToken || !identityRequest) {
      identityToken = token
      identityRequest = token ? userinfo('false').then(r => r?.code === 0 && r.data?.isAdmin === true).catch(() => false) : Promise.resolve(false)
    }
    isMapAdmin.value = await identityRequest
    if (!isMapAdmin.value) return getTrashBinList(params)
    const list = []
    let page = 1
    let total = Infinity
    while (list.length < total) {
      const result = await getBinsList({ page, pageSize: 100 })
      if (result?.code !== 0 || !Array.isArray(result.data?.list)) throw new Error(result?.msg || '管理员垃圾桶列表加载失败')
      const batch = result.data.list
      total = Number(result.data.total)
      list.push(...batch)
      if (batch.length < 100 || !Number.isFinite(total)) break
      page++
    }
    return { code: 0, data: list.filter(item => item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) && Math.abs(Number(item.latitude)) <= 90 && Math.abs(Number(item.longitude)) <= 180).map(item => ({
      ...item, adminRecord: true, description: item.describe, image: item.imagePath,
      review: item.review === true || item.review === 1, errorReport: binReports(item)
    })) }
  }
  return { isMapAdmin, loadMapBins }
}
