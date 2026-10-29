import { ref } from 'vue'
import { userinfo } from '@/api/user'
import { getBinsList } from '@/api/database'
import { getTrashBinList } from '@/api/map'
import { toMapDisplayPoint } from '@/utils/map-display-point.mjs'

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
    // 管理员按视野查询（矩形 bbox 或中心点+半径 + light 轻量模式），不再全量拉取；
    // 单次只查一页，是否多轮分批由调用方按密度控制
    const hasBbox = [params?.minLat, params?.maxLat, params?.minLng, params?.maxLng].every((value) => value != null && Number.isFinite(Number(value)))
    const hasViewport = !hasBbox && Number.isFinite(Number(params?.latitude)) && Number.isFinite(Number(params?.longitude))
    // 只携带本次查询用到的参数：uni 会把 undefined 序列化成空串，会干扰后端"是否传参"的判断
    const queryParams = {
      page: Number(params?.page) || 1,
      pageSize: Number(params?.pageSize) || 100,
      light: 1
    }
    if (hasBbox) {
      queryParams.minLat = Number(params.minLat)
      queryParams.maxLat = Number(params.maxLat)
      queryParams.minLng = Number(params.minLng)
      queryParams.maxLng = Number(params.maxLng)
    } else if (hasViewport) {
      queryParams.latitude = Number(params.latitude)
      queryParams.longitude = Number(params.longitude)
      queryParams.radius = Number(params.radius) || 5000
    }
    const result = await getBinsList(queryParams)
    if (result?.code !== 0 || !Array.isArray(result.data?.list)) throw new Error(result?.msg || '管理员垃圾桶列表加载失败')
    return {
      code: 0,
      data: result.data.list.filter(item => item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) && Math.abs(Number(item.latitude)) <= 90 && Math.abs(Number(item.longitude)) <= 180).map(item => ({
        ...toMapDisplayPoint(item), adminRecord: true, description: item.describe, image: item.imagePath,
        review: item.review === true || item.review === 1, errorReport: binReports(item)
      })),
      pagination: { total: Number(result.data.total) || 0 }
    }
  }
  return { isMapAdmin, loadMapBins }
}
