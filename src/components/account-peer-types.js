export const peerTypes = {
  Message: { label: '私聊', color: '#1e9483', from: 'senderId' },
  BookingOrder: { label: '预约', color: '#567dc2', from: 'userId' },
  FriendRequest: { label: '好友申请', color: '#9269bd', from: 'fromUserId' },
  BookingChatBinding: { label: '订单绑定', color: '#b77a31', from: 'customerUserId' },
  CommunityNotification: { label: '社区通知', color: '#b55f7b', from: 'actorId' },
  Chat: { label: '会话设置', color: '#64818b', from: 'userId' }
}

export function peerBreakdown(evidence) {
  const totals = new Map()
  for (const entry of evidence) totals.set(entry.name, (totals.get(entry.name) || 0) + entry.count)
  return [...totals].map(([name, count]) => ({ name, count, ...peerTypes[name] })).sort((a, b) => b.count - a.count)
}
