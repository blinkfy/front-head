const DEFAULT_RECOMMEND_LIMIT = 6;

export function normalizeShopName(text) {
  return String(text || '').replace(/\s+/g, '').trim().toLowerCase();
}

export function dedupeTextList(list) {
  const source = Array.isArray(list) ? list : [];
  const seen = Object.create(null);
  const out = [];

  for (let i = 0; i < source.length; i += 1) {
    const text = String(source[i] || '').trim();
    if (!text || seen[text]) continue;
    seen[text] = true;
    out.push(text);
  }

  return out;
}

export function buildCandidateProducts(products) {
  const list = Array.isArray(products) ? products : [];
  return list.map((item, idx) => ({
    id: item && item.id !== undefined ? item.id : `dom-${idx + 1}`,
    name: String(item && item.name || '').trim(),
    category: item && item.category !== undefined ? item.category : '',
    points: Number(item && item.points),
    stock: Number(item && item.stock),
    description: String(item && item.description || '').trim(),
    image: String(item && item.image || '').trim()
  })).filter((item) => item.name);
}

export function getFallbackRecommendedNames(products, currentPoints, limit = DEFAULT_RECOMMEND_LIMIT) {
  const points = Number(currentPoints) || 0;
  const list = Array.isArray(products) ? products : [];

  const ranked = list.map((item) => {
    const cost = Number(item && item.points) || 0;
    const stock = Number(item && item.stock) || 0;
    const hot = !!(item && item.hot);
    const limited = !!(item && item.limited);
    let score = 0;

    if (hot) score += 40;
    if (limited) score += 24;
    if (stock > 0) score += 20;
    if (points > 0 && cost > 0 && cost <= points) score += 16;
    score += Math.max(0, 8 - Math.floor(cost / 80));

    return {
      name: String(item && item.name || '').trim(),
      score
    };
  }).filter((item) => item.name)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((item) => item.name);
}

export function buildOrderedNameIndex(names) {
  const source = Array.isArray(names) ? names : [];
  const normalized = dedupeTextList(source).map((text) => String(text || '').trim()).filter(Boolean);
  const map = Object.create(null);
  for (let i = 0; i < normalized.length; i += 1) {
    map[normalizeShopName(normalized[i])] = i;
  }
  return {
    names: normalized,
    indexMap: map
  };
}

export function orderProductsByRecommendation(products, names) {
  const source = Array.isArray(products) ? products.slice() : [];
  const { indexMap } = buildOrderedNameIndex(names);

  return source.sort((a, b) => {
    const an = normalizeShopName(a && a.name);
    const bn = normalizeShopName(b && b.name);
    const ai = Object.prototype.hasOwnProperty.call(indexMap, an) ? indexMap[an] : 999;
    const bi = Object.prototype.hasOwnProperty.call(indexMap, bn) ? indexMap[bn] : 999;
    return ai - bi;
  });
}

export function filterProductsByRecommendation(products, names) {
  const list = Array.isArray(products) ? products : [];
  const { indexMap } = buildOrderedNameIndex(names);

  return list.filter((item) => {
    const normalized = normalizeShopName(item && item.name);
    return Object.prototype.hasOwnProperty.call(indexMap, normalized);
  });
}

export function normalizeRecommendationResult(result, fallbackProducts, currentPoints, limit = DEFAULT_RECOMMEND_LIMIT) {
  const names = result && Array.isArray(result.names)
    ? dedupeTextList(result.names).slice(0, limit)
    : [];

  if (names.length) {
    return {
      source: String(result && result.source || 'api'),
      names
    };
  }

  return {
    source: 'rule-dom',
    names: getFallbackRecommendedNames(fallbackProducts, currentPoints, limit)
  };
}

export const SHOP_RECOMMEND_LIMIT = DEFAULT_RECOMMEND_LIMIT;
