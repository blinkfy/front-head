const SEED_KEY = 'ai_chat_seed_payload';
const LEGACY_IMAGE_KEY = 'ai_chat_seed_image';
const LEGACY_CATEGORY_KEY = 'ai_chat_seed_category';
const ACHIEVEMENT_QUEUE_KEY = 'achievement_unlock_queue_v1';

const bboxPalette = ['#2f6fed', '#12b886', '#f59f00', '#e64980', '#7048e8', '#0ca678', '#228be6'];

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

export function dedupeTextList(list) {
  const seen = Object.create(null);
  const out = [];
  const source = Array.isArray(list) ? list : [];
  for (let i = 0; i < source.length; i += 1) {
    const text = String(source[i] || '').trim();
    if (!text || seen[text]) continue;
    seen[text] = true;
    out.push(text);
  }
  return out;
}

export function extractRecognizedItems(data) {
  const out = []
  const aiItems = Array.isArray(data && data.aiInsights && data.aiInsights.items)
    ? data.aiInsights.items
    : []

  for (let i = 0; i < aiItems.length; i += 1) {
    const itemName = String(
      (aiItems[i] && (aiItems[i].name || aiItems[i].item || aiItems[i].object)) || ''
    ).trim()
    if (itemName) out.push(itemName)
  }

  if (!out.length) {
    const topLevelItems = Array.isArray(data && data.items) ? data.items : []
    for (let i = 0; i < topLevelItems.length; i += 1) {
      const itemName = String(
        (topLevelItems[i] && (topLevelItems[i].name || topLevelItems[i].item || topLevelItems[i].object)) || ''
      ).trim()
      if (itemName) out.push(itemName)
    }
  }

  if (!out.length) {
    const labels = Array.isArray(data && data.labels) ? data.labels : []
    for (let i = 0; i < labels.length; i += 1) {
      const sourceName = String((labels[i] && labels[i].source_name) || '').trim()
      if (sourceName) out.push(sourceName)
    }
  }

  return dedupeTextList(out).slice(0, 8)
}

function getDisposalAdvice(data) {
  if (!data || !data.aiInsights) return '';
  return typeof data.aiInsights.disposalAdvice === 'string'
    ? data.aiInsights.disposalAdvice.trim()
    : '';
}

function normalizeCategoryName(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  if (text.includes('可回收') || lower.includes('recycl')) return '可回收垃圾';
  if (text.includes('有害') || lower.includes('hazard') || lower.includes('battery')) return '有害垃圾';
  if (text.includes('厨余') || text.includes('湿垃圾') || lower.includes('kitchen') || lower.includes('food')) {
    return '厨余垃圾';
  }
  if (text.includes('其他') || text.includes('干垃圾') || lower.includes('other')) return '其他垃圾';
  return text;
}

function getPrimaryCategory(data) {
  const labels = Array.isArray(data && data.labels) ? data.labels : [];
  return normalizeCategoryName(labels[0] && labels[0].name);
}

function buildCategoryFallbackDisposal(category) {
  if (category === '可回收垃圾') return '先倒空残留物，再简单冲洗并压扁；能分开的瓶盖、纸塑部件尽量分开投放。';
  if (category === '有害垃圾') return '保持原包装或单独密封，避免破损泄漏；尽快投放到有害垃圾收集点。';
  if (category === '厨余垃圾') return '先去掉塑料袋、纸巾和餐具，再沥干水分后单独投放。';
  if (category === '其他垃圾') return '把尖锐、易脏污或无法回收的部分装好再投放，避免和可回收物混在一起。';
  return '先判断材质和清洁度，再按当地分类规则投放。';
}

function buildCategorySafetyReminder(category) {
  if (category === '有害垃圾') return '不要拆解、电击、加热或与其他垃圾混放，处理后及时洗手。';
  if (category === '厨余垃圾') return '出现霉变、异味或渗液时不要继续存放，优先及时投放并清洁容器。';
  if (category === '可回收垃圾') return '裁剪、打孔或改造前先确认边缘不锋利，家里有儿童时避免留下小零件。';
  return '处理前先看是否有油污、破损或尖角，必要时戴手套，无法确认时直接规范投放。';
}

function includesAny(source, keywords = []) {
  const text = String(source || '').toLowerCase();
  return keywords.some((item) => text.indexOf(String(item || '').toLowerCase()) !== -1);
}

function hasStructuredUpcycling(text) {
  const lines = String(text || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
  let titledLines = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^[^：:]{2,16}[：:]\s*\S+/.test(lines[i])) titledLines += 1;
  }
  return titledLines >= 2 || /操作步骤[:：]|所需材料[:：]|安全提醒[:：]|适用前提[:：]/.test(String(text || ''));
}

function buildActionablePlan({ items = [], category = '', upcycling = '', disposalAdvice = '' } = {}) {
  const normalizedCategory = normalizeCategoryName(category) || '对应分类';
  const focusItems = Array.isArray(items) && items.length ? items.join('、') : '该物品';
  const keywordSource = focusItems.toLowerCase();
  const disposalText = disposalAdvice || buildCategoryFallbackDisposal(normalizedCategory);
  const safetyText = buildCategorySafetyReminder(normalizedCategory);
  const prefixLines = [
    `识别判断：${focusItems}优先按${normalizedCategory}处理。`,
    `投放前处理：${disposalText}`,
    upcycling ? `执行重点：${upcycling}` : ''
  ].filter(Boolean);

  if (
    normalizedCategory === '有害垃圾' ||
    includesAny(keywordSource, ['电池', '药', '灯管', '油漆', '胶水', '喷雾', 'battery', 'drug'])
  ) {
    return [
      ...prefixLines,
      '方案名称：不建议再利用',
      '适用前提：存在毒性、泄漏、破损或成分不明风险时，直接放弃改造。',
      '操作步骤：1. 保持原包装或外层再套一层密封袋 2. 单独放到阴凉干燥处暂存 3. 尽快送到有害垃圾回收点。',
      '剩余部分处理：全部按有害垃圾流程处置，不要拆解后再分类。',
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (includesAny(keywordSource, ['塑料瓶', '饮料瓶', '矿泉水瓶', '瓶子', 'bottle'])) {
    return [
      ...prefixLines,
      '方案名称：简易浇花器',
      '所需材料：清洗后的瓶子、针或剪刀、细绳可选。',
      '操作步骤：1. 先把瓶身洗净并晾干 2. 在瓶盖打 3-5 个小孔 3. 装水后倒置插入花盆土壤 4. 观察出水速度后再调整孔径。',
      `剩余部分处理：标签、破损瓶身或无法继续利用的配件按${normalizedCategory}投放。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (includesAny(keywordSource, ['纸箱', '纸盒', '快递盒', 'carton', 'box'])) {
    return [
      ...prefixLines,
      '方案名称：抽屉分隔盒',
      '所需材料：干燥纸箱、尺子、剪刀、胶带或订书机。',
      '操作步骤：1. 量好抽屉内部尺寸 2. 按高度裁出几条纸板 3. 切出卡槽后交叉拼接 4. 放进抽屉测试，不合适再微调。',
      `剩余部分处理：受潮、沾油或裁坏的纸板按${normalizedCategory === '可回收垃圾' ? '其他垃圾或当地规则' : normalizedCategory}处理。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (includesAny(keywordSource, ['旧衣', 't恤', '衣服', '布料', 'cloth', 'shirt'])) {
    return [
      ...prefixLines,
      '方案名称：清洁抹布',
      '所需材料：干净旧衣物、剪刀、针线可选。',
      '操作步骤：1. 挑出没有发霉和重油污的布料 2. 按手掌大小裁剪 3. 容易脱线的边缘简单锁边 4. 按厨房、卫浴分别收纳使用。',
      `剩余部分处理：严重污染、发霉或破损太多的部分按${normalizedCategory === '可回收垃圾' ? '其他垃圾' : normalizedCategory}投放。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (includesAny(keywordSource, ['橘子皮', '柚子皮', '柠檬皮', '果皮', 'citrus', 'peel'])) {
    return [
      ...prefixLines,
      '方案名称：果皮清洁液',
      '所需材料：干净果皮、密封瓶、白醋。',
      '操作步骤：1. 把果皮剪成小块放入瓶中 2. 倒入白醋没过果皮 3. 密封浸泡 10-14 天 4. 过滤后按 1:1 加水稀释，用于擦拭灶台和台面。',
      `剩余部分处理：泡过的果皮和残渣仍按${normalizedCategory}投放。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (includesAny(keywordSource, ['餐盒', '饭盒', '外卖盒', 'container', 'lunch'])) {
    return [
      ...prefixLines,
      '方案名称：桌面收纳盒',
      '适用前提：仅适合完整、无重油污、无明显异味的硬质餐盒。',
      '所需材料：清洗后的餐盒、标签贴纸可选。',
      '操作步骤：1. 先把油污彻底洗掉并晾干 2. 按用途分成数据线、文具或零件收纳盒 3. 贴上标签避免混放 4. 盖子变形后及时淘汰。',
      `剩余部分处理：有裂纹、异味或洗不净的餐盒按${normalizedCategory === '可回收垃圾' ? '其他垃圾或当地规则' : normalizedCategory}处理。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (normalizedCategory === '厨余垃圾') {
    return [
      ...prefixLines,
      '方案名称：少量家庭堆肥尝试',
      '适用前提：只建议处理无明显油污、无汤汁、无动物骨刺的厨余。',
      '所需材料：密封小桶、干树叶或纸屑、手套。',
      '操作步骤：1. 先把厨余切碎并沥水 2. 与干树叶或纸屑交替铺放 3. 盖好桶盖并定期通气 4. 出现强烈异味时立即停止并改为正常投放。',
      `剩余部分处理：不适合堆肥的残渣继续按${normalizedCategory}投放。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  if (normalizedCategory === '可回收垃圾') {
    return [
      ...prefixLines,
      '方案名称：家庭分类收纳盒',
      '所需材料：完整容器、剪刀、标签贴纸。',
      '操作步骤：1. 先把容器洗净晾干 2. 根据大小分区收纳文具、工具或充电线 3. 在外侧标注用途 4. 容器老化后及时停止使用。',
      `剩余部分处理：破损、发黄或有异味的部分继续按${normalizedCategory}回收。`,
      `安全提醒：${safetyText}`
    ].join('\n');
  }

  return [
    ...prefixLines,
    '方案名称：不建议强行改造',
    '适用前提：材质不明、污染较重、容易碎裂或改造价值低时，直接分类投放更稳妥。',
    '操作步骤：1. 先把可分离的外包装与内容物拆开 2. 能清理的残留物尽量清理 3. 按当前分类要求完成投放。',
    '剩余部分处理：不要为了再利用而继续堆放，避免卫生和异味问题。',
    `安全提醒：${safetyText}`
  ].join('\n');
}

function getUpcyclingText(data) {
  const aiInsights = data && data.aiInsights ? data.aiInsights : null;
  if (aiInsights && typeof aiInsights.upcyclingSuggestion === 'string' && aiInsights.upcyclingSuggestion.trim()) {
    return aiInsights.upcyclingSuggestion.trim();
  }

  if (aiInsights && Array.isArray(aiInsights.items)) {
    for (let i = 0; i < aiInsights.items.length; i += 1) {
      const itemUpcycling = String((aiInsights.items[i] && aiInsights.items[i].upcycling) || '').trim();
      if (itemUpcycling) return itemUpcycling;
    }
  }

  const labels = Array.isArray(data && data.labels) ? data.labels : [];
  for (let i = 0; i < labels.length; i += 1) {
    const describe = String((labels[i] && labels[i].describe) || '');
    const match = describe.match(/变废为宝建议[:：]\s*([^\n。；;]+)/);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

export function buildExpandedUpcyclingText(data) {
  const aiInsights = data && data.aiInsights ? data.aiInsights : null
  const aiUpcycling = aiInsights && typeof aiInsights.upcyclingSuggestion === 'string' && aiInsights.upcyclingSuggestion.trim()
    ? aiInsights.upcyclingSuggestion.trim()
    : ''

  // 优先使用后端大模型生成的完整结构化描述
  const expandedFromAI = (aiInsights && typeof aiInsights.expandedUpcycling === 'string' && aiInsights.expandedUpcycling.trim())
    ? aiInsights.expandedUpcycling.trim()
    : (typeof data.expandedUpcycling === 'string' && data.expandedUpcycling.trim() ? data.expandedUpcycling.trim() : '')

  if (expandedFromAI) {
    const disposalAdvice = aiInsights && typeof aiInsights.disposalAdvice === 'string' && aiInsights.disposalAdvice.trim()
      ? aiInsights.disposalAdvice.trim()
      : (typeof data.disposalAdvice === 'string' && data.disposalAdvice.trim() ? data.disposalAdvice.trim() : '')
    if (disposalAdvice) {
      return `垃圾投放：${disposalAdvice}\n` + expandedFromAI
    }
    return expandedFromAI
  }

  // 无 AI 结构化建议时，回退到从 upcyclingSuggestion 自行构建
  if (!aiUpcycling) return ''
  const items = extractRecognizedItems(data).slice(0, 3)
  const focusItems = items.length ? items.join('、') : '本次识别到的垃圾'
  const disposalAdvice = aiInsights && typeof aiInsights.disposalAdvice === 'string' && aiInsights.disposalAdvice.trim()
    ? aiInsights.disposalAdvice.trim()
    : ''

  const lines = [
    `回收利用：${aiUpcycling}`,
    `可执行步骤：先把${focusItems}分开处理，厨余先沥干，可回收物简单清洁后再进入改造环节。`,
    '改造示例：保留完整容器可做收纳盒或花盆，不适合改造的部分按分类要求直接投放。',
    '安全提醒：处理时建议戴手套；若出现霉变、油污和异味，优先规范投放，不建议继续改造。'
  ]

  if (disposalAdvice) {
    lines.splice(2, 0, `垃圾投放：${disposalAdvice}`)
  }

  return lines.join('\n')
}

export function splitUpcyclingSections(text) {
  const lines = String(text || '').split(/\n+/);
  const sections = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    const match = line.match(/^([^：:]{1,16})[：:]\s*(.+)$/);
    if (match && match[2]) {
      sections.push({
        title: String(match[1] || '').trim(),
        content: String(match[2] || '').trim()
      });
    } else {
      sections.push({ title: '补充建议', content: line });
    }
  }

  return sections;
}

function summarizeRecognizeData(data) {
  const labels = Array.isArray(data && data.labels) ? data.labels : [];
  const top = labels.slice(0, 5);
  const lines = ['本次识别结果：'];

  if (!top.length) {
    lines.push('暂未识别到明确垃圾目标。');
  } else {
    for (let i = 0; i < top.length; i += 1) {
      const label = top[i] || {};
      const name = String(label.name || '其他垃圾').trim() || '其他垃圾';
      const confidence = Number(label.confidence);
      const confidenceText = Number.isFinite(confidence)
        ? `${Math.max(0, Math.min(100, Math.round(confidence * 100)))}%`
        : '--';
      lines.push(`${i + 1}. ${name}（置信度 ${confidenceText}）`);
    }
  }

  const items = extractRecognizedItems(data);
  if (items.length) {
    lines.push(`识别到的具体物品：${items.join('、')}`);
  }

  const disposalAdvice = getDisposalAdvice(data);
  if (disposalAdvice) {
    lines.push(`分类建议：${disposalAdvice}`);
  }

  const upcycling = buildExpandedUpcyclingText(data);
  if (upcycling) {
    lines.push(`变废为宝建议：\n${upcycling}`);
  }

  return lines.join('\n');
}

export function saveSeed(seed) {
  if (!seed || typeof seed !== 'object') return;
  if (!seed.imageBase64 || String(seed.imageBase64).indexOf('data:image/') !== 0) return;

  try {
    // 检查 base64 是否太大（超过 1MB 约 1,400,000 字符），大图拆分存储避免单条 Storage 配额超限
    const base64Len = seed.imageBase64.length;
    const LARGE_IMAGE_THRESHOLD = 1400000;

    if (base64Len > LARGE_IMAGE_THRESHOLD) {
      // 将大 base64 存入独立 key，seed 中仅存长度标记
      uni.setStorageSync('ai_chat_seed_image_large', seed.imageBase64);
      const lightweightSeed = { ...seed, imageBase64: `__LARGE_IMAGE__:${base64Len}` };
      uni.setStorageSync(SEED_KEY, JSON.stringify(lightweightSeed));
    } else {
      const seedJson = JSON.stringify(seed);
      uni.setStorageSync(SEED_KEY, seedJson);
      uni.setStorageSync(LEGACY_IMAGE_KEY, seed.imageBase64);
    }

    if (seed.category) {
      uni.setStorageSync(LEGACY_CATEGORY_KEY, seed.category);
    }
  } catch (_) {}
}

function normalizeDataImageUrl(s) {
  if (typeof s !== 'string' || !s.trim()) return '';
  const t = s.trim();
  if (t.indexOf('data:image/') === 0) return t;
  const cleaned = t.replace(/\s/g, '');
  if (cleaned.length < 32) return '';
  return 'data:image/jpeg;base64,' + cleaned;
}

function stripCompletedRecognitionPrefix(text) {
  return String(text || '')
    .replace(/^我已经完成识别[，,]\s*/, '')
    .replace(/^我已经完成识别\s*/, '')
    .trim();
}

export function buildSeedFromRecognizeData(data) {
  if (!data || typeof data !== 'object') return null;

  const chatSeed = data.chatSeed && typeof data.chatSeed === 'object' ? data.chatSeed : {};

  let imageBase64 = '';
  if (typeof chatSeed.imageBase64 === 'string' && chatSeed.imageBase64.trim()) {
    imageBase64 = normalizeDataImageUrl(chatSeed.imageBase64);
  }
  if (!imageBase64 && typeof data.result_img_base64 === 'string' && data.result_img_base64.trim()) {
    imageBase64 = normalizeDataImageUrl(data.result_img_base64);
  }
  if (!imageBase64) return null;

  const labels = Array.isArray(data.labels) ? data.labels : [];
  let category = '';
  if (typeof chatSeed.category === 'string' && chatSeed.category.trim()) {
    category = chatSeed.category.trim();
  } else if (labels[0] && labels[0].name) {
    category = String(labels[0].name).trim();
  }

  const fromSeed =
    typeof chatSeed.userPrompt === 'string' && chatSeed.userPrompt.trim()
      ? stripCompletedRecognitionPrefix(chatSeed.userPrompt.trim())
      : '';
  const userPrompt =
    fromSeed ||
    (category
      ? `重点是${category}。请继续补充分类依据、投放细节和可执行的变废为宝步骤。`
      : '请继续补充具体物品分类、投放细节和可执行的变废为宝步骤。');

  const seedReply = typeof chatSeed.assistantReply === 'string' ? chatSeed.assistantReply.trim() : '';
  const preferLocalSummary =
    !seedReply ||
    !/(方案名称[:：]|操作步骤[:：]|投放前处理[:：]|识别判断[:：])/.test(seedReply);
  const assistantReply = preferLocalSummary ? summarizeRecognizeData(data) : seedReply;

  return {
    imageBase64,
    category,
    userPrompt,
    assistantReply,
    createdAt:
      typeof chatSeed.createdAt === 'string' && chatSeed.createdAt
        ? chatSeed.createdAt
        : new Date().toISOString()
  };
}

function normalizeUnlockItem(item) {
  if (!item || typeof item !== 'object') return null;
  const key = String(item.key || '').trim();
  if (!key) return null;
  return {
    key,
    name: String(item.name || '').trim(),
    description: String(item.description || '').trim(),
    unlockedAt: item.unlockedAt || new Date().toISOString()
  };
}

function readAchievementQueue() {
  const parsed = safeJsonParse(localStorage.getItem(ACHIEVEMENT_QUEUE_KEY) || '');
  return Array.isArray(parsed) ? parsed : [];
}

export function appendAchievementQueue(items) {
  const incoming = Array.isArray(items) ? items : [];
  if (!incoming.length) return;

  const merged = readAchievementQueue();
  const dedupeMap = Object.create(null);

  for (let i = 0; i < merged.length; i += 1) {
    const oldItem = normalizeUnlockItem(merged[i]);
    if (!oldItem) continue;
    dedupeMap[oldItem.key] = oldItem;
  }

  for (let i = 0; i < incoming.length; i += 1) {
    const unlockItem = normalizeUnlockItem(incoming[i]);
    if (!unlockItem) continue;
    if (!dedupeMap[unlockItem.key]) {
      dedupeMap[unlockItem.key] = unlockItem;
    }
  }

  const next = Object.keys(dedupeMap).map((key) => dedupeMap[key]);
  try {
    localStorage.setItem(ACHIEVEMENT_QUEUE_KEY, JSON.stringify(next));
  } catch (_) {}
}

function hashText(text) {
  const str = String(text || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getBboxColor(label, index) {
  const key = String((label && (label.name || label.source_name || label.class_id)) || index || '');
  const idx = hashText(key) % bboxPalette.length;
  return bboxPalette[idx];
}

export function parseLabelBbox(label) {
  if (!label || typeof label !== 'object') return null;
  const rawFormat = String(label.bbox_format || label.bboxFormat || label.coord_format || '').toLowerCase();

  const applyFormat = (xa, ya, xb, yb) => {
    if (rawFormat.indexOf('cxcywh') !== -1 || rawFormat.indexOf('center') !== -1) {
      const hw = xb / 2;
      const hh = yb / 2;
      return [xa - hw, ya - hh, xa + hw, ya + hh];
    }
    if (rawFormat.indexOf('xywh') !== -1) {
      return [xa, ya, xa + xb, ya + yb];
    }
    if (!rawFormat && xb <= xa && yb > 0) {
      return [xa, ya, xa + xb, ya + yb];
    }
    return [xa, ya, xb, yb];
  };

  let raw = label.bbox;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const ox1 = Number(raw.x1);
    const oy1 = Number(raw.y1);
    const ox2 = Number(raw.x2);
    const oy2 = Number(raw.y2);
    if (Number.isFinite(ox1) && Number.isFinite(oy1) && Number.isFinite(ox2) && Number.isFinite(oy2)) {
      return [ox1, oy1, ox2, oy2];
    }

    const ox = Number(raw.x);
    const oy = Number(raw.y);
    const ow = Number(raw.width);
    const oh = Number(raw.height);
    if (Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(ow) && Number.isFinite(oh)) {
      return [ox, oy, ox + ow, oy + oh];
    }
  }

  if (Array.isArray(raw) && raw.length === 1 && Array.isArray(raw[0])) {
    raw = raw[0];
  }
  if (Array.isArray(raw) && raw.length >= 4) {
    return applyFormat(Number(raw[0]), Number(raw[1]), Number(raw[2]), Number(raw[3]));
  }

  if (Array.isArray(label.bbox_2d) && label.bbox_2d.length >= 4) {
    return applyFormat(
      Number(label.bbox_2d[0]),
      Number(label.bbox_2d[1]),
      Number(label.bbox_2d[2]),
      Number(label.bbox_2d[3])
    );
  }

  return null;
}

export function normalizeBboxSpace(space) {
  const key = String(space || '').toLowerCase();
  if (!key) return '';
  if (key.indexOf('qwen3') !== -1 || key.indexOf('1000') !== -1 || key === 'norm1000' || key === 'normalized_1000') {
    return 'norm1000';
  }
  if (key.indexOf('pixel') !== -1 || key.indexOf('qwen2.5') !== -1 || key.indexOf('qwen25') !== -1) {
    return 'pixel';
  }
  if (key.indexOf('norm01') !== -1 || key.indexOf('0-1') !== -1 || key.indexOf('normalized') !== -1) {
    return 'norm01';
  }
  return '';
}

function getImageContentBox(metrics) {
  const displayW = Number(metrics && metrics.displayWidth) || 0;
  const displayH = Number(metrics && metrics.displayHeight) || 0;
  const naturalW = Number(metrics && metrics.naturalWidth) || 0;
  const naturalH = Number(metrics && metrics.naturalHeight) || 0;

  if (displayW <= 0 || displayH <= 0) return null;

  if (naturalW <= 0 || naturalH <= 0) {
    return {
      left: 0,
      top: 0,
      width: displayW,
      height: displayH,
      naturalW,
      naturalH
    };
  }

  const fit = String((metrics && metrics.objectFit) || 'fill').toLowerCase();
  let renderW = displayW;
  let renderH = displayH;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === 'contain' || fit === 'scale-down') {
    let containScale = Math.min(displayW / naturalW, displayH / naturalH);
    if (fit === 'scale-down') containScale = Math.min(1, containScale);
    renderW = naturalW * containScale;
    renderH = naturalH * containScale;
    offsetX = (displayW - renderW) / 2;
    offsetY = (displayH - renderH) / 2;
  } else if (fit === 'none') {
    renderW = Math.min(naturalW, displayW);
    renderH = Math.min(naturalH, displayH);
    offsetX = (displayW - renderW) / 2;
    offsetY = (displayH - renderH) / 2;
  } else if (fit === 'cover') {
    const coverScale = Math.max(displayW / naturalW, displayH / naturalH);
    renderW = naturalW * coverScale;
    renderH = naturalH * coverScale;
    offsetX = (displayW - renderW) / 2;
    offsetY = (displayH - renderH) / 2;
  }

  return {
    left: offsetX,
    top: offsetY,
    width: renderW,
    height: renderH,
    naturalW,
    naturalH
  };
}

export function detectBboxSpace(x1, y1, x2, y2, contentBox) {
  if (x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1) return 'norm01';
  if (!(x1 >= 0 && y1 >= 0 && x2 <= 999 && y2 <= 999)) return 'pixel';

  const naturalW = Number(contentBox && contentBox.naturalW) || 0;
  const naturalH = Number(contentBox && contentBox.naturalH) || 0;
  if (naturalW <= 0 || naturalH <= 0) return 'norm1000';

  const maxNatural = Math.max(naturalW, naturalH);
  const maxCoord = Math.max(x2, y2);

  if (maxNatural <= 1100 && maxCoord > maxNatural * 1.03) return 'norm1000';
  if (maxNatural <= 900 && maxCoord >= 930) return 'norm1000';
  if (x2 > naturalW * 1.08 || y2 > naturalH * 1.08) return 'norm1000';
  if ((naturalW >= 1200 || naturalH >= 1200) && x2 < naturalW * 0.88 && y2 < naturalH * 0.88) {
    return 'norm1000';
  }
  return 'pixel';
}

export function mapBboxToDisplay(bbox, metrics, resultBboxSpace, labelBboxSpace) {
  if (!bbox || bbox.length < 4 || !metrics) return null;

  let x1 = Number(bbox[0]);
  let y1 = Number(bbox[1]);
  let x2 = Number(bbox[2]);
  let y2 = Number(bbox[3]);

  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return null;
  }

  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];

  const imageW = Number(metrics.displayWidth) || 0;
  const imageH = Number(metrics.displayHeight) || 0;
  if (imageW <= 0 || imageH <= 0) return null;

  const contentBox = getImageContentBox(metrics);
  if (!contentBox || contentBox.width <= 0 || contentBox.height <= 0) return null;

  const forcedSpace = normalizeBboxSpace(labelBboxSpace || resultBboxSpace);
  const bboxSpace = forcedSpace || detectBboxSpace(x1, y1, x2, y2, contentBox);

  let left = 0;
  let top = 0;
  let boxW = 0;
  let boxH = 0;

  if (bboxSpace === 'norm01') {
    left = contentBox.left + x1 * contentBox.width;
    top = contentBox.top + y1 * contentBox.height;
    boxW = (x2 - x1) * contentBox.width;
    boxH = (y2 - y1) * contentBox.height;
  } else if (bboxSpace === 'norm1000') {
    const scale = 999;
    left = contentBox.left + (x1 / scale) * contentBox.width;
    top = contentBox.top + (y1 / scale) * contentBox.height;
    boxW = ((x2 - x1) / scale) * contentBox.width;
    boxH = ((y2 - y1) / scale) * contentBox.height;
  } else if (contentBox.naturalW > 0 && contentBox.naturalH > 0) {
    left = contentBox.left + (x1 / contentBox.naturalW) * contentBox.width;
    top = contentBox.top + (y1 / contentBox.naturalH) * contentBox.height;
    boxW = ((x2 - x1) / contentBox.naturalW) * contentBox.width;
    boxH = ((y2 - y1) / contentBox.naturalH) * contentBox.height;
  } else {
    left = x1;
    top = y1;
    boxW = x2 - x1;
    boxH = y2 - y1;
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(boxW) || !Number.isFinite(boxH)) {
    return null;
  }

  left = Math.max(0, Math.min(imageW - 2, left));
  top = Math.max(0, Math.min(imageH - 2, top));
  boxW = Math.max(2, Math.min(imageW - left, boxW));
  boxH = Math.max(2, Math.min(imageH - top, boxH));

  return {
    left,
    top,
    width: boxW,
    height: boxH
  };
}
