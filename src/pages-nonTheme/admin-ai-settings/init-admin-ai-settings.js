export default function initPage() {
  function ensureRecommendAlgorithmRow() {
    if (document.getElementById('recommendAlgorithm')) return;
    const modelInput = document.getElementById('model');
    if (!modelInput) return;

    const modelRow = modelInput.closest('.row');
    if (!modelRow || !modelRow.parentElement) return;

    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = [
      '<div>',
      '<div class="label">商城推荐算法</div>',
      '<div class="desc">切换默认推荐引擎：千问（qwen）或 deep（深度学习）。</div>',
      '</div>',
      '<select id="recommendAlgorithm" class="select">',
      '<option value="qwen">qwen（千问）</option>',
      '<option value="deep">deep（深度学习）</option>',
      '</select>'
    ].join('');

    modelRow.insertAdjacentElement('afterend', row);
  }

  ensureRecommendAlgorithmRow();

  // 兼容性辅助函数
  function getStorage(key) {
    // #ifdef H5
    return localStorage.getItem(key)
    // #endif
    // #ifndef H5
    const result = uni.getStorageSync(key)
    return result || null
    // #endif
  }

  const refs = {
    aiEnabled: document.getElementById('aiEnabled'),
    detectorMode: document.getElementById('detectorMode'),
    model: document.getElementById('model'),
    recommendAlgorithm: document.getElementById('recommendAlgorithm'),
    include3d: document.getElementById('include3d'),
    enableThinking: document.getElementById('enableThinking'),
    thinkingBudget: document.getElementById('thinkingBudget'),
    updatedAtText: document.getElementById('updatedAtText'),
    statusText: document.getElementById('statusText')
  };

  function applyTheme() {
    const theme = getStorage('app_theme') === 'dark' ? 'dark' : 'light'
    // #ifdef H5
    document.body.classList.toggle('light-theme', theme === 'light')
    document.documentElement.setAttribute('data-theme', theme)
    // #endif
  }

  function setStatus(text, type) {
    refs.statusText.className = 'status' + (type ? ` ${type}` : '');
    refs.statusText.textContent = text || '';
  }

  function authHeaders() {
    const token = getStorage('token') || ''
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = token
    return headers
  }

  function normalizeRecommendAlgorithm(input) {
    const value = String(input || '').trim().toLowerCase();
    return value === 'deep' ? 'deep' : 'qwen';
  }

  function applyData(data) {
    refs.aiEnabled.checked = !!data.aiEnabled;
    refs.detectorMode.value = data.detectorMode === 'ai' ? 'ai' : 'yolo';
    refs.model.value = data.model || 'qwen3-vl-flash';
    refs.recommendAlgorithm.value = normalizeRecommendAlgorithm(
      data.recommendAlgorithm !== undefined ? data.recommendAlgorithm : data.recommendAlgo
    );
    refs.include3d.checked = !!data.include3d;
    refs.enableThinking.checked = !!data.enableThinking;
    refs.thinkingBudget.value = Number(data.thinkingBudget || 4096);
    refs.updatedAtText.textContent = data.updatedAt
      ? `updated: ${new Date(data.updatedAt).toLocaleString()}`
      : '';
  }

  function collectData() {
    return {
      aiEnabled: refs.aiEnabled.checked,
      detectorMode: refs.detectorMode.value,
      model: (refs.model.value || '').trim() || 'qwen3-vl-flash',
      recommendAlgorithm: normalizeRecommendAlgorithm(refs.recommendAlgorithm.value),
      include3d: refs.include3d.checked,
      enableThinking: refs.enableThinking.checked,
      thinkingBudget: Number(refs.thinkingBudget.value || 4096)
    };
  }

  const baseUrl = (typeof window !== 'undefined' && window.__APP_BASE_URL__) ? window.__APP_BASE_URL__ : ''

  async function loadSettings() {
    setStatus('读取中...');
    try {
      const res = await fetch(`${baseUrl}/api/admin/ai-settings`, {
        method: 'GET',
        headers: authHeaders()
      });
      const json = await res.json();
      if (!json || json.code !== 0 || !json.data) {
        throw new Error((json && json.msg) || `HTTP ${res.status}`);
      }
      applyData(json.data);
      setStatus('读取成功', 'ok');
    } catch (e) {
      setStatus(`读取失败：${e.message || e}`, 'err');
    }
  }

  async function saveSettings() {
    const payload = collectData();
    setStatus('保存中...');
    try {
      const res = await fetch(`${baseUrl}/api/admin/ai-settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json || json.code !== 0 || !json.data) {
        throw new Error((json && json.msg) || `HTTP ${res.status}`);
      }
      applyData(json.data);
      setStatus('保存成功', 'ok');
    } catch (e) {
      setStatus(`保存失败：${e.message || e}`, 'err');
    }
  }

  document.getElementById('reloadBtn').addEventListener('click', loadSettings);
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', () => {
    applyData({
      aiEnabled: true,
      detectorMode: 'yolo',
      model: 'qwen3-vl-flash',
      recommendAlgorithm: 'qwen',
      include3d: true,
      enableThinking: false,
      thinkingBudget: 4096
    });
    setStatus('已重置为页面默认值（尚未保存）');
  });
  document.getElementById('backBtn').addEventListener('click', () => {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      uni.navigateBack();
    } else if (theme == 'light') {
      uni.reLaunch({ url: '/pages/home/home' })
    } else {
      uni.reLaunch({ url: '/pages-dark/home/home' })
    }
  });

  applyTheme();
  // #ifdef H5
  const onStorage = (event) => {
    if (!event || event.key === 'app_theme') {
      applyTheme();
    }
  };
  window.addEventListener('storage', onStorage);
  // #endif
  loadSettings();

  return function cleanup() {
    // #ifdef H5
    window.removeEventListener('storage', onStorage);
    // #endif
  }

}
