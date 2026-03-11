import { Exception } from "sass";

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
  const out = [];
  const aiItems = Array.isArray(data && data.aiInsights && data.aiInsights.items)
    ? data.aiInsights.items
    : [];

  for (let i = 0; i < aiItems.length; i += 1) {
    const itemName = String(
      (aiItems[i] && (aiItems[i].name || aiItems[i].item || aiItems[i].object)) || ''
    ).trim();
    if (itemName) out.push(itemName);
  }

  if (!out.length) {
    const labels = Array.isArray(data && data.labels) ? data.labels : [];
    for (let i = 0; i < labels.length; i += 1) {
      const sourceName = String((labels[i] && labels[i].source_name) || '').trim();
      if (sourceName) out.push(sourceName);
    }
  }

  return dedupeTextList(out).slice(0, 8);
}

function getDisposalAdvice(data) {
  if (!data || !data.aiInsights) return '';
  return typeof data.aiInsights.disposalAdvice === 'string'
    ? data.aiInsights.disposalAdvice.trim()
    : '';
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
  const upcycling = getUpcyclingText(data);
  if (!upcycling) return '';
  try{
  // 优先使用后端大模型生成的完整描述（如果存在）
  if (data.aiInsights && typeof data.aiInsights.expandedUpcycling === 'string' && data.aiInsights.expandedUpcycling.trim()) {
    let lines=data.aiInsights.expandedUpcycling
    if (typeof data.aiInsights.disposalAdvice === 'string') {
      lines=[`垃圾投放：${data.aiInsights.disposalAdvice}\n`]+lines.trim();
    }
    return lines;
  }
  }catch (e){console.log(e);}
  const items = extractRecognizedItems(data).slice(0, 3);
  const focusItems = items.length ? items.join('、') : '本次识别到的垃圾';
  const disposalAdvice = getDisposalAdvice(data);

  const lines = [
    `回收利用：${upcycling}`,
    `可执行步骤：先把${focusItems}分开处理，厨余先沥干，可回收物简单清洁后再进入改造环节。`,
    '改造示例：保留完整容器可做收纳盒或花盆，不适合改造的部分按分类要求直接投放。',
    '安全提醒：处理时建议戴手套；若出现霉变、油污和异味，优先规范投放，不建议继续改造。'
  ];

  if (disposalAdvice) {
    lines.splice(2, 0, `垃圾投放：${disposalAdvice}`);
  }

  return lines.join('\n');
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
    const seedJson = JSON.stringify(seed);

    uni.setStorageSync(SEED_KEY, seedJson);
    uni.setStorageSync(LEGACY_IMAGE_KEY, seed.imageBase64);
    if (seed.category) {
      uni.setStorageSync(LEGACY_CATEGORY_KEY, seed.category);
    }
  } catch (_) {}
}

export function buildSeedFromRecognizeData(data) {
  if (!data || typeof data !== 'object') return null;

  const chatSeed = data.chatSeed && typeof data.chatSeed === 'object' ? data.chatSeed : {};

  let imageBase64 = '';
  if (typeof chatSeed.imageBase64 === 'string' && chatSeed.imageBase64.indexOf('data:image/') === 0) {
    imageBase64 = chatSeed.imageBase64;
  } else if (typeof data.result_img_base64 === 'string' && data.result_img_base64.indexOf('data:image/') === 0) {
    imageBase64 = data.result_img_base64;
  }
  if (!imageBase64) return null;

  const labels = Array.isArray(data.labels) ? data.labels : [];
  let category = '';
  if (typeof chatSeed.category === 'string' && chatSeed.category.trim()) {
    category = chatSeed.category.trim();
  } else if (labels[0] && labels[0].name) {
    category = String(labels[0].name).trim();
  }

  const userPrompt =
    typeof chatSeed.userPrompt === 'string' && chatSeed.userPrompt.trim()
      ? chatSeed.userPrompt.trim()
      : (category
          ? `我已经完成识别，重点是${category}。请继续补充分类依据、投放细节和可执行的变废为宝步骤。`
          : '我已经完成识别，请继续补充具体物品分类、投放细节和可执行的变废为宝步骤。');

  const assistantReply =
    typeof chatSeed.assistantReply === 'string' && chatSeed.assistantReply.trim()
      ? chatSeed.assistantReply.trim()
      : summarizeRecognizeData(data);

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
