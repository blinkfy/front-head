const isWechatMiniProgram = process.env.UNI_PLATFORM === 'mp-weixin'
const nativeBinIcons = {
  normal: '/static/normal-marker.png',
  smart: '/static/smart-marker.png',
  pending: '/static/pending-bin-marker.png'
}
const wechatClusterStyles = {
  normal: { iconPath: '/static/map-cluster-normal.png', badgeColor: '#1d4ed8' },
  smart: { iconPath: '/static/map-cluster-smart.png', badgeColor: '#047857' },
  pending: { iconPath: '/static/map-cluster-pending.png', badgeColor: '#475569' }
}

function binMarkerKind(point) {
  if (point.adminRecord && !point.review) return 'pending'
  return point.type === 'smart' ? 'smart' : 'normal'
}

export function nativeBinMarkerStyle(point) {
  const kind = binMarkerKind(point)
  return {
    iconPath: isWechatMiniProgram ? wechatClusterStyles[kind].iconPath : nativeBinIcons[kind],
    width: isWechatMiniProgram ? 36 : 38,
    height: isWechatMiniProgram ? 34 : 42,
    anchor: { x: 0.5, y: 1 }
  }
}

export function createClusterMarker(group, index) {
  const point = group.members[0] || {}
  const content = group.count > 999 ? '999+' : String(group.count)
  return {
    id: -2 - index,
    latitude: group.latitude,
    longitude: group.longitude,
    ...nativeBinMarkerStyle(point),
    clusterCount: group.count,
    label: isWechatMiniProgram ? {
      // Balance the native label's line height so one digit is drawn in a circle.
      content: content.length === 1 ? '\u2002' + content + '\u2002' : content,
      color: '#ffffff',
      bgColor: wechatClusterStyles[binMarkerKind(point)].badgeColor,
      borderColor: '#ffffff',
      borderWidth: 1.5,
      borderRadius: 10,
      padding: 1,
      fontSize: content.length > 2 ? 8 : 9,
      textAlign: 'center',
      anchorX: 3,
      anchorY: -39
    } : {
      content, color: '#ffffff', bgColor: '#1d4ed8',
      borderRadius: 9, padding: 3, fontSize: 10, anchorX: 5, anchorY: -42
    }
  }
}

export function clusterIcon(count, color = '#3b82f6') {
  const label = count > 999 ? '999+' : String(count)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g transform="translate(1 3) scale(1.42)"><path d="M12 23C10 20 3 13.5 3 9a9 9 0 0 1 18 0c0 4.5-7 11-9 14z" fill="${color}" stroke="#fff" stroke-width="1"/><circle cx="12" cy="9" r="3.5" fill="#fff"/></g><rect x="23" y="1" width="${label.length > 2 ? 16 : 14}" height="14" rx="7" fill="#1d4ed8" stroke="white" stroke-width="1.5"/><text x="${label.length > 2 ? 31 : 30}" y="11" text-anchor="middle" fill="white" font-family="sans-serif" font-size="${label.length > 3 ? 6 : label.length > 2 ? 7 : 9}" font-weight="bold">${label}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

// Action sheets accept at most six entries on WeChat; page large groups instead.
export function chooseClusterPoint(group, labelForPoint, onSelect, page = 0) {
  const pageSize = 4
  const pageCount = Math.ceil(group.members.length / pageSize)
  const entries = group.members.slice(page * pageSize, (page + 1) * pageSize)
  const labels = entries.map((point, index) => `${page * pageSize + index + 1}. ${labelForPoint(point)}${point.address ? ` ${point.address}` : ''}`.slice(0, 50))
  if (page > 0) labels.push('上一页')
  if (page + 1 < pageCount) labels.push('下一页')
  uni.showActionSheet({
    ...(group.expansionZoom === null ? { title: '共用坐标，具体位置待核验' } : {}),
    itemList: labels,
    success: ({ tapIndex }) => {
      if (tapIndex < entries.length) onSelect(entries[tapIndex])
      else if (page > 0 && tapIndex === entries.length) chooseClusterPoint(group, labelForPoint, onSelect, page - 1)
      else chooseClusterPoint(group, labelForPoint, onSelect, page + 1)
    }
  })
}
