import { searchPlaces } from '../api/map.js'
import { wgs84ToGcj02, gcj02ToWgs84 } from '../pages-nonTheme/utils/recycling-geometry.mjs'

// Browser editors use WGS84 even when their basemap is Tencent.
export async function searchMapPlaces(keyword, { latitude = 35.86, longitude = 104.19, limit = 5 } = {}) {
  try {
    const center = wgs84ToGcj02(latitude,longitude)
    const response = await searchPlaces(keyword,center.latitude,center.longitude,50000)
    if (response?.code != null && response.code !== 0) throw new Error('地点搜索失败')
    if (!Array.isArray(response?.data)) throw new Error('地点搜索返回无效')
    const matches = response.data.map(place => {
      const point = gcj02ToWgs84(Number(place.location?.lat),Number(place.location?.lng))
      return point ? { ...point, name:place.title || place.name || place.address, address:place.address && place.title && !place.address.includes(place.title) ? `${place.address} ${place.title}` : place.address || place.title || place.name, parts:place.ad_info || {} } : null
    }).filter(Boolean).slice(0,limit)
    if (!matches.length) throw new Error('附近没有匹配地点')
    return matches
  } catch (_) {
    const data = await new Promise((resolve,reject) => uni.request({ url:`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(keyword)}&limit=${limit}&addressdetails=1&accept-language=zh`,timeout:10000,success:r=>r.statusCode===200&&Array.isArray(r.data)?resolve(r.data):reject(new Error('地点搜索暂不可用')),fail:reject }))
    return data.map(place=>({latitude:Number(place.lat),longitude:Number(place.lon),name:place.display_name || place.name,address:place.display_name || place.name,parts:place.address || {}})).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)).slice(0,limit)
  }
}
