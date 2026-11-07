// Keep location permission, coordinate acquisition and address-service errors distinct.
export function locationErrorMessage(reason, stage = reason?.locationStage || 'location') {
  const message = String(reason?.errMsg || reason?.message || '')
  const code = reason?.errCode ?? reason?.code
  if (/cancel/i.test(message)) return ''
  if (stage === 'address') return '已获取位置，但地址解析失败，请检查网络后重试或手动选择地址'
  if (stage === 'places') return '附近地点加载失败，请检查网络后重试'
  if (/auth|permission|deny|denied|权限|授权/i.test(message) || code === 1) return '未获得定位权限，请在系统设置中允许定位，或手动输入地址'
  if (/disabled|service.*off|定位.*(?:未开启|关闭)/i.test(message)) return '系统位置服务未开启，请开启手机定位后重试'
  if (/timeout|timed out|超时/i.test(message) || code === 3 || code === 'LOCATION_TIMEOUT') return '定位超时，请确认手机定位已开启，移至信号较好的位置后重试'
  if (/module|provider|not support|不支持|模块|SDK/i.test(message)) return '当前安装包的定位服务不可用，请更新应用后重试'
  return '暂时无法获取坐标，请确认手机定位已开启后重试或手动选择地址'
}
