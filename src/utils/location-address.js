import { getUserLocationOnce } from '@/utils/location'
import { reverseGeocoder } from '@/api/map'
import { wgs84ToGcj02 } from '@/pages-nonTheme/utils/recycling-geometry.mjs'

export async function resolveLocationAddress(latitude, longitude, accuracy) {
  try {
    // #ifdef H5
    try {
      const point = wgs84ToGcj02(latitude, longitude)
      const response = await reverseGeocoder(point.latitude, point.longitude)
      const result = response?.data?.result || response?.data
      const address = result?.address || result?.formatted_addresses?.recommend
      if (response?.code != null && response.code !== 0 || !String(address || '').trim()) throw new Error('地址解析暂不可用')
      return { address, parts: result.address_component || {}, latitude, longitude, accuracy }
    } catch (_) { /* The alternate geocoder also receives WGS84, never GCJ02. */ }
    const data = await new Promise((resolve, reject) => uni.request({
      url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=zh`,
      timeout: 10000,
      success: response => response.statusCode === 200 ? resolve(response.data) : reject(new Error('地址服务暂不可用')),
      fail: reject
    }))
    return { address: data?.display_name || '', parts: data?.address || {}, latitude, longitude, accuracy }
    // #endif
    // #ifndef H5
    const response = await reverseGeocoder(latitude, longitude)
    const result = response?.data?.result || response?.data
    return { address: result?.address || result?.formatted_addresses?.recommend || '', parts: result?.address_component || {}, latitude, longitude, accuracy }
    // #endif
  } catch (cause) {
    throw Object.assign(new Error('地址解析失败，请稍后重试或手动选择地址'), { locationStage: 'address', cause })
  }
}

export async function getCurrentAddress() {
  let coordType = 'gcj02'
  // #ifdef H5
  coordType = 'wgs84'
  // #endif
  const location = await getUserLocationOnce(coordType, { interactive: true, includeAccuracy: true })
  const selection = await resolveLocationAddress(location.latitude, location.longitude, location.accuracy)
  selection.address = String(selection.address || '').trim()
  if (!selection.address || selection.address.length > 500 || /^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(selection.address)) {
    throw Object.assign(new Error('未能获取详细地址，请手动填写'), { locationStage: 'address' })
  }
  return selection
}
