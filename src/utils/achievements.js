const ACHIEVEMENT_QUEUE_KEY = 'achievement_unlock_queue_v2'

const RARITY_LABELS = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说'
}

export function normalizeAchievementUnlock(item) {
  if (!item || typeof item !== 'object') return null
  const key = String(item.key || '').trim()
  if (!key) return null
  const rarity = RARITY_LABELS[item.rarity] ? item.rarity : 'common'
  return {
    key,
    name: String(item.name || '').trim() || key,
    description: String(item.description || '').trim(),
    unlockedAt: item.unlockedAt || new Date().toISOString(),
    category: String(item.category || '').trim(),
    categoryLabel: String(item.categoryLabel || '').trim(),
    rarity,
    rarityLabel: String(item.rarityLabel || '').trim() || RARITY_LABELS[rarity],
    iconKey: String(item.iconKey || key).trim(),
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0
  }
}

export function dedupeAchievementUnlocks(items) {
  const map = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const normalized = normalizeAchievementUnlock(item)
    if (!normalized || map.has(normalized.key)) continue
    map.set(normalized.key, normalized)
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeDiff = new Date(b.unlockedAt || 0).getTime() - new Date(a.unlockedAt || 0).getTime()
    return timeDiff || a.sortOrder - b.sortOrder
  })
}

export function readAchievementQueue() {
  try {
    const raw = uni.getStorageSync(ACHIEVEMENT_QUEUE_KEY)
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    return dedupeAchievementUnlocks(Array.isArray(parsed) ? parsed : [])
  } catch (_) {
    return []
  }
}

export function enqueueAchievementUnlocks(items) {
  const merged = dedupeAchievementUnlocks([...readAchievementQueue(), ...(Array.isArray(items) ? items : [])])
  if (!merged.length) return []
  try {
    uni.setStorageSync(ACHIEVEMENT_QUEUE_KEY, JSON.stringify(merged))
  } catch (_) {}
  return merged
}

export function takeAchievementUnlocks() {
  const items = readAchievementQueue()
  try {
    uni.removeStorageSync(ACHIEVEMENT_QUEUE_KEY)
  } catch (_) {}
  return items
}

export function extractAchievementUnlocks(payload) {
  if (!payload || typeof payload !== 'object') return []
  const info = payload.achievementInfo || (payload.data && payload.data.achievementInfo)
  return dedupeAchievementUnlocks(info && Array.isArray(info.newlyUnlocked) ? info.newlyUnlocked : [])
}

export function rarityLabel(rarity) {
  return RARITY_LABELS[rarity] || RARITY_LABELS.common
}
