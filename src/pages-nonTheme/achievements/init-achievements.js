(function () {
  // 从全局 window 获取 baseUrl（由 Vue 包装器注入）
  const baseUrl = window.__APP_BASE_URL__ || '';
  const QUEUE_KEY = 'achievement_unlock_queue_v1';

  const refs = {
    refreshBtn: document.getElementById('refreshBtn'),
    backBtn: document.getElementById('backBtn'),
    progressRing: document.getElementById('progressRing'),
    completionRate: document.getElementById('completionRate'),
    completionText: document.getElementById('completionText'),
    unlockedCount: document.getElementById('unlockedCount'),
    totalCount: document.getElementById('totalCount'),
    newUnlockCount: document.getElementById('newUnlockCount'),
    unlockedHint: document.getElementById('unlockedHint'),
    gradeText: document.getElementById('gradeText'),
    latestUnlocks: document.getElementById('latestUnlocks'),
    updatedAt: document.getElementById('updatedAt'),
    filterChips: document.getElementById('filterChips'),
    achievementGrid: document.getElementById('achievementGrid'),
    stateBox: document.getElementById('stateBox'),
    unlockModalMask: document.getElementById('unlockModalMask'),
    unlockModalBody: document.getElementById('unlockModalBody'),
    closeModalBtn: document.getElementById('closeModalBtn')
  };

  const RARITY_MAP = {
    first_sort: { tier: 'common', label: '普通' },
    online_novice: { tier: 'rare', label: '稀有' },
    device_novice: { tier: 'rare', label: '稀有' },
    category_collector: { tier: 'epic', label: '史诗' },
    streak_3_days: { tier: 'epic', label: '史诗' },
    points_100: { tier: 'legendary', label: '传说' }
  };

  const ICON_MAP = {
    first_sort: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c0-5 2-8 7-10-1 5-4 7-9 8"></path><path d="M5 14c2-4 5-6 9-7-1 4-3 7-7 9"></path><path d="M12 20v-5"></path></svg>`,
    online_novice: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="2"></rect><path d="M8 7l1.5-2h5L16 7"></path><circle cx="12" cy="13" r="3"></circle></svg>`,
    device_novice: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h6"></path><path d="M5 7h14"></path><path d="M7 7l1 12h8l1-12"></path><path d="M10 11v5M14 11v5"></path></svg>`,
    category_collector: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"></rect><rect x="13" y="4" width="7" height="7" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="13" y="13" width="7" height="7" rx="1.5"></rect></svg>`,
    streak_3_days: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path><path d="m9 15 2 2 4-4"></path></svg>`,
    points_100: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m12 7 1.5 3 3.5.5-2.5 2.4.6 3.6L12 15l-3.1 1.5.6-3.6L7 10.5l3.5-.5z"></path></svg>`
  };

  const state = {
    loading: false,
    filter: 'all',
    achievements: [],
    summary: { unlockedCount: 0, totalCount: 0, completionRate: 0 },
    popupUnlocks: []
  };

  function applyTheme() {
    const theme = localStorage.getItem('app_theme') === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('light-theme', theme === 'light');
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function normalizeUnlockItem(item) {
    if (!item || typeof item !== 'object') return null;
    const key = String(item.key || '').trim();
    if (!key) return null;
    return {
      key,
      name: String(item.name || '').trim() || key,
      description: String(item.description || '').trim(),
      unlockedAt: item.unlockedAt || null
    };
  }

  function dedupeUnlocks(items) {
    const map = new Map();
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const normalized = normalizeUnlockItem(list[i]);
      if (!normalized) continue;
      if (!map.has(normalized.key)) {
        map.set(normalized.key, normalized);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.unlockedAt || 0).getTime();
      const tb = new Date(b.unlockedAt || 0).getTime();
      return tb - ta;
    });
  }

  function readUnlockQueue() {
    const raw = localStorage.getItem(QUEUE_KEY) || '';
    const parsed = safeJsonParse(raw);
    return dedupeUnlocks(Array.isArray(parsed) ? parsed : []);
  }

  function clearUnlockQueue() {
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch (_) {}
  }

  function gradeFromRate(rate) {
    const v = Math.max(0, Math.min(100, toNumber(rate, 0)));
    if (v >= 95) return 'S';
    if (v >= 80) return 'A';
    if (v >= 60) return 'B';
    if (v >= 40) return 'C';
    return 'D';
  }

  function getRarityByKey(key) {
    return RARITY_MAP[key] || { tier: 'common', label: '普通' };
  }

  function getIconByKey(key) {
    return ICON_MAP[key] || ICON_MAP.points_100;
  }

  function setStateMessage(text) {
    refs.stateBox.style.display = '';
    refs.stateBox.textContent = text || '';
  }

  function clearStateMessage() {
    refs.stateBox.style.display = 'none';
    refs.stateBox.textContent = '';
  }

  function setProgressRing(rate) {
    const value = Math.max(0, Math.min(100, toNumber(rate, 0)));
    const angle = (value / 100) * 360;
    refs.progressRing.style.background = `conic-gradient(var(--accent) ${angle}deg, rgba(124, 165, 205, 0.24) ${angle}deg)`;
    refs.completionRate.textContent = `${value.toFixed(0)}%`;
  }

  function renderSummary(summary, newlyUnlockedCount) {
    const unlockedCount = Math.max(0, Math.round(toNumber(summary && summary.unlockedCount, 0)));
    const totalCount = Math.max(0, Math.round(toNumber(summary && summary.totalCount, 0)));
    const rate = toNumber(summary && summary.completionRate, 0);

    setProgressRing(rate);
    refs.completionText.textContent = `已解锁 ${unlockedCount} / ${totalCount}`;
    refs.unlockedCount.textContent = String(unlockedCount);
    refs.totalCount.textContent = String(totalCount);
    refs.newUnlockCount.textContent = String(Math.max(0, newlyUnlockedCount));
    refs.unlockedHint.textContent = unlockedCount === totalCount && totalCount > 0 ? '全部成就已达成' : '本次会话累计';
    refs.gradeText.textContent = gradeFromRate(rate);
  }

  function getProgressRatio(item) {
    const target = Math.max(1, toNumber(item && item.target, 1));
    const progress = Math.max(0, toNumber(item && item.progressRaw, 0));
    return Math.min(progress / target, 1);
  }

  function sortAchievements(list) {
    return list.slice().sort((a, b) => {
      const aUnlocked = !!a.unlocked;
      const bUnlocked = !!b.unlocked;
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;

      if (aUnlocked && bUnlocked) {
        const ta = new Date(a.unlockedAt || 0).getTime();
        const tb = new Date(b.unlockedAt || 0).getTime();
        return tb - ta;
      }

      const ra = getProgressRatio(a);
      const rb = getProgressRatio(b);
      if (rb !== ra) return rb - ra;
      return toNumber(b.progressRaw, 0) - toNumber(a.progressRaw, 0);
    });
  }

  function filterAchievements(list) {
    if (state.filter === 'unlocked') return list.filter((item) => !!item.unlocked);
    if (state.filter === 'locked') return list.filter((item) => !item.unlocked);
    return list;
  }

  function renderFilterChips() {
    const total = state.achievements.length;
    const unlocked = state.achievements.filter((item) => !!item.unlocked).length;
    const locked = total - unlocked;

    const chips = refs.filterChips.querySelectorAll('.filter-chip');
    for (let i = 0; i < chips.length; i += 1) {
      const chip = chips[i];
      const key = chip.dataset.filter;
      chip.classList.toggle('active', key === state.filter);
      if (key === 'all') chip.textContent = `全部 (${total})`;
      if (key === 'unlocked') chip.textContent = `已解锁 (${unlocked})`;
      if (key === 'locked') chip.textContent = `未解锁 (${locked})`;
    }
  }

  function renderLatestUnlocks() {
    const unlockedFromApi = state.achievements
      .filter((item) => item && item.unlocked)
      .sort((a, b) => new Date(b.unlockedAt || 0).getTime() - new Date(a.unlockedAt || 0).getTime())
      .slice(0, 6)
      .map((item) => ({
        key: item.key,
        name: item.name,
        description: item.description,
        unlockedAt: item.unlockedAt
      }));

    const latest = dedupeUnlocks([...(state.popupUnlocks || []), ...unlockedFromApi]).slice(0, 6);

    if (!latest.length) {
      refs.latestUnlocks.innerHTML = '<div class="state" style="grid-column:1/-1;">还没有解锁记录，先完成一次识别吧。</div>';
      return;
    }

    refs.latestUnlocks.innerHTML = latest
      .map((item) => {
        return [
          '<article class="latest-item">',
          '<span class="latest-bullet"></span>',
          `<span>${escapeHtml(item.name)}</span>`,
          `<span>${formatDateTime(item.unlockedAt)}</span>`,
          '</article>'
        ].join('');
      })
      .join('');
  }

  function renderAchievementCards() {
    const sorted = sortAchievements(state.achievements);
    const list = filterAchievements(sorted);

    if (!list.length) {
      refs.achievementGrid.innerHTML = '';
      setStateMessage('当前筛选条件下没有可展示的成就。');
      return;
    }

    clearStateMessage();
    refs.achievementGrid.innerHTML = list
      .map((item, index) => {
        const rarity = getRarityByKey(item.key);
        const target = Math.max(1, toNumber(item.target, 1));
        const rawProgress = Math.max(0, toNumber(item.progressRaw, 0));
        const progress = Math.min(rawProgress, target);
        const ratio = Math.max(0, Math.min(progress / target, 1));
        const pct = Math.round(ratio * 100);
        const unlocked = !!item.unlocked;
        const unit = String(item.unit || '');

        const cardClass = [
          'achievement-card',
          `rarity-${rarity.tier}`,
          unlocked ? '' : 'locked'
        ].filter(Boolean).join(' ');

        const statusBadge = unlocked
          ? '<span class="badge status-unlocked">已解锁</span>'
          : '<span class="badge status-locked">未解锁</span>';

        const metaLeft = unlocked
          ? `解锁时间：${formatDateTime(item.unlockedAt)}`
          : `进度：${progress}/${target}${unit}`;

        return [
          `<article class="${cardClass}" style="animation-delay:${Math.min(index * 40, 320)}ms;">`,
          '<div class="card-top">',
          `<span class="icon-wrap">${getIconByKey(item.key)}</span>`,
          '<div class="badge-set">',
          `<span class="badge rarity-${rarity.tier}">${rarity.label}</span>`,
          statusBadge,
          '</div>',
          '</div>',
          `<h3 class="card-name">${escapeHtml(item.name)}</h3>`,
          `<p class="card-desc">${escapeHtml(item.description || '')}</p>`,
          '<div class="progress-track">',
          `<div class="progress-fill" style="width:${pct}%;"></div>`,
          '</div>',
          `<div class="card-meta"><span>${escapeHtml(metaLeft)}</span><span>${pct}%</span></div>`,
          '</article>'
        ].join('');
      })
      .join('');
  }

  function showUnlockModal(unlocks) {
    const list = dedupeUnlocks(unlocks);
    if (!list.length) return;

    refs.unlockModalBody.innerHTML = list
      .map((item) => {
        return [
          '<article class="unlock-item">',
          `<span class="unlock-icon">${getIconByKey(item.key)}</span>`,
          '<div>',
          `<h4 class="unlock-title">${escapeHtml(item.name)}</h4>`,
          `<p class="unlock-desc">${escapeHtml(item.description || '你已达成一个新的里程碑。')}</p>`,
          `<p class="unlock-desc">解锁时间：${formatDateTime(item.unlockedAt)}</p>`,
          '</div>',
          '</article>'
        ].join('');
      })
      .join('');

    refs.unlockModalMask.classList.add('show');
  }

  function hideUnlockModal() {
    refs.unlockModalMask.classList.remove('show');
  }

  async function fetchAchievements() {
    const token = localStorage.getItem('token') || '';
    if (!token) {
      throw new Error('未登录，请先登录后查看成就。');
    }

    const response = await fetch(`${baseUrl}/api/achievements`, {
      method: 'GET',
      headers: {
        Authorization: token
      }
    });

    const payload = await response.json().catch(() => null);
    if (!payload || payload.code !== 0 || !payload.data) {
      throw new Error((payload && payload.msg) || `请求失败（HTTP ${response.status}）`);
    }

    return payload.data;
  }

  async function refreshAchievements() {
    if (state.loading) return;
    state.loading = true;
    refs.refreshBtn.disabled = true;
    refs.updatedAt.textContent = '更新时间：加载中...';

    try {
      const data = await fetchAchievements();
      const achievements = Array.isArray(data.achievements) ? data.achievements : [];
      const summary = data.summary || { unlockedCount: 0, totalCount: 0, completionRate: 0 };
      const apiNewlyUnlocked = dedupeUnlocks(Array.isArray(data.newlyUnlocked) ? data.newlyUnlocked : []);
      const queuedUnlocks = readUnlockQueue();

      state.achievements = achievements;
      state.summary = summary;
      state.popupUnlocks = dedupeUnlocks([...queuedUnlocks, ...apiNewlyUnlocked]);

      renderSummary(state.summary, state.popupUnlocks.length);
      renderFilterChips();
      renderLatestUnlocks();
      renderAchievementCards();
      refs.updatedAt.textContent = `更新时间：${formatDateTime(new Date().toISOString())}`;

      if (state.popupUnlocks.length) {
        showUnlockModal(state.popupUnlocks);
      }
      clearUnlockQueue();
    } catch (error) {
      console.error('[achievements] load failed:', error);
      state.achievements = [];
      state.summary = { unlockedCount: 0, totalCount: 0, completionRate: 0 };
      state.popupUnlocks = [];
      renderSummary(state.summary, 0);
      renderFilterChips();
      refs.latestUnlocks.innerHTML = '';
      refs.achievementGrid.innerHTML = '';
      setStateMessage(error && error.message ? error.message : '加载成就失败。');
      refs.updatedAt.textContent = '更新时间：--';
    } finally {
      state.loading = false;
      refs.refreshBtn.disabled = false;
    }
  }

  function bindEvents() {
    refs.refreshBtn.addEventListener('click', refreshAchievements);
    refs.backBtn.addEventListener('click', function () {
      window.location.href = '/';
    });

    refs.filterChips.addEventListener('click', function (event) {
      const chip = event.target.closest('.filter-chip');
      if (!chip) return;
      const nextFilter = chip.dataset.filter;
      if (!nextFilter || nextFilter === state.filter) return;
      state.filter = nextFilter;
      renderFilterChips();
      renderAchievementCards();
    });

    refs.closeModalBtn.addEventListener('click', hideUnlockModal);
    refs.unlockModalMask.addEventListener('click', function (event) {
      if (event.target === refs.unlockModalMask) {
        hideUnlockModal();
      }
    });

    window.addEventListener('storage', function (event) {
      if (!event || event.key === 'app_theme') applyTheme();
    });
  }

  function init() {
    applyTheme();
    bindEvents();
    refreshAchievements();
  }

  init();
})();

