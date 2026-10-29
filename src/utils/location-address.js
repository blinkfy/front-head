import { getUserLocationOnce } from '@/utils/location'
import { reverseGeocoder } from '@/api/map'

export async function resolveLocationAddress(latitude, longitude) {
  // #ifdef H5
  const data = await new Promise((resolve, reject) => uni.request({
    url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=zh`,
    timeout: 10000,
    success: response => response.statusCode === 200 ? resolve(response.data) : reject(new Error('地址服务暂不可用')),
    fail: reject
  }))
  return { address: data?.display_name || '', parts: data?.address || {} }
  // #endif
  // #ifndef H5
  const response = await reverseGeocoder(latitude, longitude)
  const result = response?.data?.result || response?.data
  return { address: result?.address || result?.formatted_addresses?.recommend || '', parts: result?.address_component || {} }
  // #endif
}

export async function getCurrentAddress() {
  let coordType = 'gcj02'
  // #ifdef H5
  coordType = 'wgs84'
  // #endif
  const location = await getUserLocationOnce(coordType)
  const selection = await resolveLocationAddress(location.latitude, location.longitude)
  selection.address = String(selection.address || '').trim()
  if (!selection.address || selection.address.length > 500 || /^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(selection.address)) {
    throw new Error('未能获取详细地址，请手动填写')
  }
  return selection
}
