// mapType describes the public facility; type distinguishes connected devices.
export function binFacilityLabel(bin) {
  if (bin?.type === 'smart') return '智能垃圾桶'
  if (bin?.mapType === 'waste_disposal') return '垃圾投放点'
  if (bin?.mapType === 'recycling') return '资源回收点'
  if (bin?.mapType === 'waste_basket') return '公共垃圾桶'
  return '普通垃圾桶'
}
