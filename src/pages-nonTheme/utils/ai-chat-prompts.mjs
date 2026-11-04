// Product-owned shortcuts only: never consume model-generated suggestions.
const ACTIONS = {
  nearby: { label: '附近投放点', hint: '查看附近点位和地图入口', prompt: '查找附近的垃圾桶和投放点。' },
  records: { label: '识别记录', hint: '查找自己的历史识别', prompt: '查一下我的识别记录。' },
  checklist: { label: '投放清单', hint: '把物品按类别整理', prompt: '将本会话的识别结果整理成投放清单。' },
  booking: { label: '预约回收', hint: '先填写并核对预约信息', prompt: '我要预约上门回收。' },
  products: { label: '积分兑换', hint: '按当前积分查看可兑换商品', prompt: '这些积分可以换什么？' },
  shop: { label: '商城商品', hint: '查看平台商品和详情', prompt: '查询商城可兑换商品。' },
  again: { label: '再次识别', hint: '选择原记录后确认识别', prompt: '重新识别我之前的图片。' },
  report: { label: '点位反馈', hint: '选择点位并填写问题', prompt: '我要反馈前面投放点的问题。' },
  post: { label: '社区草稿', hint: '整理内容后编辑发布', prompt: '把本次环保交流整理成一篇社区帖子草稿。' },
  basis: { label: '分类依据', hint: '解释已识别物品的分类', prompt: '逐项解释这次识别结果的分类依据，并指出容易分错的地方。' },
  steps: { label: '投放步骤', hint: '清洗、拆分和沥干要求', prompt: '说明这些物品投放前是否需要清洗、拆分和沥干。' },
  reuse: { label: '变废为宝', hint: '材料、步骤和安全提醒', prompt: '给我一个容易操作的变废为宝方案，说明材料、步骤和安全提醒。' },
  compare: { label: '易错对比', hint: '区分相似物品的类别', prompt: '对比这次识别物品和容易混淆的垃圾，给出简短区分规则。' }
}
const KEYWORDS = {
  nearby: ['附近', '哪里', '投放点', '垃圾桶', '回收站'], records: ['识别记录', '历史', '上次', '之前'],
  checklist: ['清单', '整理', '多件', '这几样'], booking: ['预约', '上门'], products: ['积分', '兑换'], shop: ['商品', '商城', '想买', '购买'],
  again: ['重新识别', '再次识别', '再识别'], report: ['反馈', '报错', '撤走', '位置不准', '损坏'],
  post: ['社区', '帖子', '发帖', '发布'], basis: ['分类依据', '为什么', '类别'], steps: ['投放步骤', '清洗', '拆分', '沥干', '怎么扔'],
  reuse: ['变废为宝', '再利用', '改造', '手工'], compare: ['混淆', '区分', '分错', '对比']
}

function frequencyScore(id, questions) {
  return questions.reduce((score, text, index) => {
    let count = 0
    for (const word of KEYWORDS[id]) {
      // Bound repeated terms per question; a pasted paragraph cannot dominate the menu.
      let position = 0, matches = 0
      while (matches < 3 && (position = text.indexOf(word, position)) !== -1) { matches++; position += word.length }
      count += matches
    }
    return score + count * (1 + index / Math.max(questions.length, 1))
  }, 0)
}

export function buildChatQuickActions(messages = []) {
  const recent = (Array.isArray(messages) ? messages : []).slice(-10)
  const hasPoints = recent.some(message => message?.role === 'assistant' && Array.isArray(message.disposalPoints) && message.disposalPoints.some(point => /^[1-9]\d{0,15}$/.test(String(point?.id || ''))))
  const hasRecognition = recent.some(message => message?.recognitionHistoryId || (message?.role === 'user' && message.hasImage) ||
    (Array.isArray(message?.businessCards) && message.businessCards.some(card => card?.type === 'recognition' || card?.type === 'checklist')))
  const hasMaterial = hasRecognition || recent.some(message => message?.role === 'user' && String(message.content || '').trim())
  const order = [...(hasPoints ? ['report'] : []), ...(hasRecognition ? ['checklist', 'again'] : []),
    'nearby', 'records', 'checklist', 'booking', 'products', 'again', 'shop', ...(hasMaterial ? ['post'] : []),
    ...(hasRecognition ? ['basis', 'steps', 'compare'] : []), 'reuse']
  const questions = recent.filter(message => message?.role === 'user' && typeof message.content === 'string').map(message => message.content.slice(0, 2000))
  return [...new Set(order)].map((id, index) => ({ id, index, score: frequencyScore(id, questions) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ id }) => ({ id, ...ACTIONS[id] }))
}
