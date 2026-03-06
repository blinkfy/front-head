// 从全局 window 获取 baseUrl（由 Vue 包装器注入）
const baseUrl = window.__APP_BASE_URL__ || '';

const imageInput = document.getElementById('imageInput');
    const pickedImageWrap = document.getElementById('pickedImageWrap');
    const pickedImageName = document.getElementById('pickedImageName');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const pickBtn = document.getElementById('pickBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const backBtn = document.getElementById('backBtn');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const promptInput = document.getElementById('promptInput');
    const messagesEl = document.getElementById('messages');
    const conversationListEl = document.getElementById('conversationList');
    const chatTitleEl = document.getElementById('chatTitle');
    const chatSubtitleEl = document.getElementById('chatSubtitle');
    const historySidebarEl = document.getElementById('historySidebar');
    const historyToggleBtn = document.getElementById('historyToggleBtn');
    const historyBackdrop = document.getElementById('historyBackdrop');

    const SEED_KEY = 'ai_chat_seed_payload';
    const SESSION_KEY = 'ai_chat_session_id';
    const SEED_CONSUMED_KEY = 'ai_chat_seed_consumed_at';
    const MOBILE_DRAWER_QUERY = '(max-width: 980px)';

    let currentImageDataUrl = '';
    let currentImageNameText = '';
    let abortCtrl = null;
    let conversationMap = new Map();
    let activeSessionId = '';
    let isHistoryDrawerOpen = false;
    let drawerMediaQuery = null;

    function applyTheme() {
      const theme = localStorage.getItem('app_theme') === 'dark' ? 'dark' : 'light';
      document.body.classList.toggle('dark-theme', theme === 'dark');
    }

    function isMobileDrawerViewport() {
      if (!drawerMediaQuery) {
        drawerMediaQuery = window.matchMedia(MOBILE_DRAWER_QUERY);
      }
      return !!drawerMediaQuery.matches;
    }

    function syncHistoryDrawerState() {
      const mobile = isMobileDrawerViewport();
      const expanded = mobile && isHistoryDrawerOpen;
      if (historyToggleBtn) {
        historyToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
      if (historySidebarEl) {
        historySidebarEl.setAttribute('aria-hidden', mobile ? (expanded ? 'false' : 'true') : 'false');
      }
    }

    function closeHistoryDrawer(forceClose) {
      if (!isHistoryDrawerOpen && !forceClose) {
        syncHistoryDrawerState();
        return;
      }
      isHistoryDrawerOpen = false;
      document.body.classList.remove('history-drawer-open');
      syncHistoryDrawerState();
    }

    function openHistoryDrawer() {
      if (!isMobileDrawerViewport()) {
        closeHistoryDrawer(true);
        return;
      }
      isHistoryDrawerOpen = true;
      document.body.classList.add('history-drawer-open');
      syncHistoryDrawerState();
    }

    function toggleHistoryDrawer() {
      if (isHistoryDrawerOpen) {
        closeHistoryDrawer(false);
      } else {
        openHistoryDrawer();
      }
    }

    function safeJsonParse(str) {
      try {
        return JSON.parse(str);
      } catch (_) {
        return null;
      }
    }

    function parseSeedPayload() {
      const raw = localStorage.getItem(SEED_KEY) || '';
      const parsed = safeJsonParse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    }

    function createSessionId() {
      return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeSessionId(value) {
      if (value === undefined || value === null) return '';
      return String(value).trim().slice(0, 64);
    }

    function ensureSessionId() {
      const existing = normalizeSessionId(localStorage.getItem(SESSION_KEY) || '');
      if (existing) return existing;
      const next = createSessionId();
      localStorage.setItem(SESSION_KEY, next);
      return next;
    }

    function buildAuthHeaders(withJson) {
      const token = localStorage.getItem('token') || '';
      const headers = {};
      if (withJson) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = token;
      return headers;
    }

    function fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function truncateText(text, max) {
      const raw = String(text || '').replace(/\s+/g, ' ').trim();
      if (!raw) return '';
      if (raw.length <= max) return raw;
      return `${raw.slice(0, max - 1)}…`;
    } 

    function formatTimeLabel(isoText) {
      const date = new Date(isoText || Date.now());
      if (Number.isNaN(date.getTime())) return '';

      const now = new Date();
      const sameDay =
        now.getFullYear() === date.getFullYear() &&
        now.getMonth() === date.getMonth() &&
        now.getDate() === date.getDate();

      if (sameDay) {
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      }

      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function createConversation(sessionId) {
      return {
        id: sessionId,
        title: '新对话',
        summary: '智能摘要生成中',
        updatedAt: new Date().toISOString(),
        messages: []
      };
    }

    function ensureConversation(sessionId) {
      const key = normalizeSessionId(sessionId) || createSessionId();
      if (!conversationMap.has(key)) {
        conversationMap.set(key, createConversation(key));
      }
      return conversationMap.get(key);
    }

    function refreshConversationMeta(conversation) {
      if (!conversation) return;
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      const firstUser = messages.find((msg) => msg && msg.role === 'user' && String(msg.content || '').trim());
      const firstMsg = firstUser || messages.find((msg) => msg && String(msg.content || '').trim());
      const lastMsg = messages.length ? messages[messages.length - 1] : null;
      const textPool = messages
        .map((msg) => String((msg && msg.content) || '').trim())
        .filter(Boolean)
        .join('\n');

      const itemRegex = /([\u4e00-\u9fa5A-Za-z0-9]{1,10}(?:皮|核|瓶|盒|袋|罐|纸|电池|灯管|菜叶|剩饭))/g;
      const itemSet = new Set();
      let itemMatch = itemRegex.exec(textPool);
      while (itemMatch && itemSet.size < 2) {
        itemSet.add(itemMatch[1]);
        itemMatch = itemRegex.exec(textPool);
      }
      const items = Array.from(itemSet);

      const categories = [];
      if (textPool.includes('厨余垃圾')) categories.push('厨余垃圾');
      if (textPool.includes('可回收')) categories.push('可回收垃圾');
      if (textPool.includes('有害垃圾')) categories.push('有害垃圾');
      if (textPool.includes('其他垃圾')) categories.push('其他垃圾');

      let smartSummary = '';
      if (items.length && categories.length) {
        smartSummary = `${items.join('、')} · ${categories[0]}处理`;
      } else if (categories.length) {
        smartSummary = `${categories[0]}分类与再利用`;
      } else if (/变废为宝|再利用|改造|堆肥/.test(textPool)) {
        smartSummary = '变废为宝执行建议';
      } else if (firstMsg) {
        smartSummary = truncateText(firstMsg.content, 16);
      } else {
        smartSummary = '环保分类咨询';
      }

      conversation.title = smartSummary;
      conversation.summary = smartSummary;
      conversation.updatedAt = (lastMsg && lastMsg.createdAt) || conversation.updatedAt || new Date().toISOString();
    }

    function getSortedConversations() {
      return Array.from(conversationMap.values()).sort((a, b) => {
        const ta = new Date(a.updatedAt || 0).getTime();
        const tb = new Date(b.updatedAt || 0).getTime();
        return tb - ta;
      });
    }

    function renderConversationList() {
      conversationListEl.innerHTML = '';
      const list = getSortedConversations();

      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = '暂无历史会话。完成一次识别后，AI 对话会自动出现在这里。';
        conversationListEl.appendChild(empty);
        return;
      }

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        refreshConversationMeta(item);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `conversation-item${item.id === activeSessionId ? ' active' : ''}`;

        const title = document.createElement('p');
        title.className = 'conversation-title';
        title.textContent = '智能总结';

        const summary = document.createElement('p');
        summary.className = 'conversation-summary';
        summary.textContent = `智能摘要：${item.summary || item.title || '环保分类咨询'}`;

        const meta = document.createElement('div');
        meta.className = 'conversation-meta';
        meta.textContent = `${formatTimeLabel(item.updatedAt)} · ${item.messages.length} 条`;

        button.appendChild(title);
        button.appendChild(summary);
        button.appendChild(meta);

        button.addEventListener('click', () => {
          if (item.id === activeSessionId) return;
          setActiveSession(item.id);
          if (isMobileDrawerViewport()) {
            closeHistoryDrawer(false);
          }
        });

        conversationListEl.appendChild(button);
      }
    }

    function appendMessageToDom(role, text, imageBase64) {
      const wrap = document.createElement('div');
      wrap.className = `msg ${role === 'user' ? 'user' : 'assistant'}`;

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = role === 'user' ? '你' : 'AI';
      wrap.appendChild(label);

      if (typeof imageBase64 === 'string' && imageBase64.startsWith('data:image/')) {
        const image = document.createElement('img');
        image.className = 'msg-image';
        image.src = imageBase64;
        image.alt = '消息图片';
        wrap.appendChild(image);
      }

      const body = document.createElement('div');
      body.textContent = text || '';
      wrap.appendChild(body);

      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return body;
    }

    function pushMessageToActive(role, content, imageBase64, createdAt) {
      const conversation = ensureConversation(activeSessionId);
      const message = {
        role: role === 'assistant' ? 'assistant' : 'user',
        content: String(content || ''),
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : '',
        createdAt: createdAt || new Date().toISOString()
      };
      conversation.messages.push(message);
      refreshConversationMeta(conversation);
      renderConversationList();
      updateHeader();
      return message;
    }

    function updateHeader() {
      const conversation = ensureConversation(activeSessionId);
      refreshConversationMeta(conversation);
      chatTitleEl.textContent = conversation.title || '当前对话';
      chatSubtitleEl.textContent = conversation.messages.length
        ? `最近更新：${formatTimeLabel(conversation.updatedAt)}，可继续追问投放与再利用细节。`
        : '继续提问，AI 会结合识别结果给出更细建议。';
    }

    function renderEmptyHint() {
      messagesEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty-chat';
      empty.textContent = '当前对话还没有消息。你可以直接提问，或先发送一张图片继续分析。';
      messagesEl.appendChild(empty);
    }

    function renderActiveMessages() {
      messagesEl.innerHTML = '';
      const conversation = ensureConversation(activeSessionId);
      if (!conversation.messages.length) {
        renderEmptyHint();
        return;
      }

      for (let i = 0; i < conversation.messages.length; i++) {
        const item = conversation.messages[i];
        appendMessageToDom(item.role, item.content, item.imageBase64 || '');
      }
    }

    function setActiveSession(sessionId) {
      const nextId = normalizeSessionId(sessionId) || createSessionId();
      activeSessionId = nextId;
      localStorage.setItem(SESSION_KEY, nextId);
      ensureConversation(nextId);
      updateHeader();
      renderConversationList();
      renderActiveMessages();
      renderPickedImage('', '');
    }

    function renderPickedImage(dataUrl, fileName) {
      const normalizedDataUrl =
        typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')
          ? dataUrl
          : '';
      currentImageDataUrl = normalizedDataUrl;
      currentImageNameText = String(fileName || '').trim();

      if (!currentImageDataUrl) {
        pickedImageWrap.hidden = true;
        pickedImageName.textContent = '';
        imageInput.value = '';
        return;
      }

      pickedImageWrap.hidden = false;
      pickedImageName.textContent = currentImageNameText || '已添加图片';
    }

    async function streamChat({ text, imageBase64, history }) {
      abortCtrl = new AbortController();
      stopBtn.disabled = false;
      sendBtn.disabled = true;

      const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: 'POST',
        headers: buildAuthHeaders(true),
        body: JSON.stringify({
          text,
          imageBase64,
          history,
          sessionId: activeSessionId
        }),
        signal: abortCtrl.signal
      });

      const contentType = String(response.headers.get('Content-Type') || '').toLowerCase();

      if (contentType.indexOf('application/json') !== -1) {
        const payload = await response.json().catch(() => null);
        const code = Number(payload && payload.code);
        const message = String(
          (payload && (payload.msg || payload.message || payload.error)) ||
          ''
        ).trim();
        if (code === 401 || response.status === 401) {
          throw new Error('登录已失效，请重新登录后再试。');
        }
        throw new Error(message || `请求失败（HTTP ${response.status}）`);
      }

      if (!response.ok || !response.body) {
        if (response.status === 401) {
          throw new Error('登录已失效，请重新登录后再试。');
        }
        throw new Error(`请求失败（HTTP ${response.status}）`);
      }

      const aiBody = appendMessageToDom('assistant', '');
      let full = '';
      let pending = '';
      let errorMessage = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          pending += decoder.decode(value, { stream: true });
          const events = pending.split('\n\n');
          pending = events.pop() || '';

          for (let i = 0; i < events.length; i++) {
            const lines = events[i]
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);

            let eventName = 'message';
            let data = null;

            for (let j = 0; j < lines.length; j++) {
              if (lines[j].startsWith('event:')) {
                eventName = lines[j].slice(6).trim();
              } else if (lines[j].startsWith('data:')) {
                data = safeJsonParse(lines[j].slice(5).trim());
              }
            }

            if (!data) continue;

            if (eventName === 'delta') {
              full = data.full || (full + (data.chunk || ''));
              aiBody.textContent = full;
              messagesEl.scrollTop = messagesEl.scrollHeight;
            } else if (eventName === 'done') {
              full = data.content || full;
              aiBody.textContent = full;
            } else if (eventName === 'error') {
              const code = Number(data && data.code);
              if (code === 401) {
                errorMessage = '登录已失效，请重新登录后再试。';
              } else {
                errorMessage = String(data.message || '未知错误');
              }
            }
          }
        }
      } catch (error) {
        if (error && error.name === 'AbortError') {
          const abortedText = full ? `${full}\n\n（已停止）` : '已停止当前回答。';
          aiBody.textContent = abortedText;
          return { content: abortedText, aborted: true };
        }
        throw error;
      } finally {
        reader.releaseLock();
      }

      if (errorMessage) {
        const message = `请求失败：${errorMessage}`;
        aiBody.textContent = message;
        return { content: message, aborted: false };
      }

      if (!full.trim()) {
        full = aiBody.textContent || 'AI 暂未返回内容。';
        aiBody.textContent = full;
      }

      return { content: full, aborted: false };
    }

    async function loadHistoryItems() {
      const token = localStorage.getItem('token') || '';
      if (!token) return [];

      const response = await fetch(`${baseUrl}/api/ai/chat/history?limit=100`, {
        method: 'GET',
        headers: buildAuthHeaders(false)
      });

      if (!response.ok) return [];
      const payload = await response.json();
      const items = payload && payload.code === 0 && payload.data && Array.isArray(payload.data.items)
        ? payload.data.items
        : [];

      return items.filter((item) => item && (item.role === 'user' || item.role === 'assistant'));
    }

    function hydrateConversations(items) {
      conversationMap = new Map();
      const list = Array.isArray(items) ? items : [];

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const sessionId = normalizeSessionId(item.sessionId) || 'legacy_default';
        const conversation = ensureConversation(sessionId);

        const content = String(item.content || '').trim();
        if (!content) continue;

        conversation.messages.push({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content,
          imageBase64: '',
          createdAt: item.createdAt || new Date().toISOString()
        });

        conversation.updatedAt = item.createdAt || conversation.updatedAt;
      }

      const all = Array.from(conversationMap.values());
      for (let i = 0; i < all.length; i++) {
        refreshConversationMeta(all[i]);
      }
    }

    function buildSeedAssistantText(seedPayload) {
      if (!seedPayload || typeof seedPayload !== 'object') return '';
      const raw = String(seedPayload.assistantReply || '').trim();
      if (raw) return raw;

      const category = String(seedPayload.category || '').trim();
      if (!category) {
        return '我已经拿到这次识别结果。你可以继续问我：具体物品分类依据、投放注意事项或变废为宝步骤。';
      }

      return [
        `我已读取这次识别结果，主要类别是「${category}」。`,
        '如果你愿意，我可以继续细化到每个物品的分类依据，并给出可执行的变废为宝步骤。'
      ].join('\n');
    }

    function buildSeedUserText(seedPayload) {
      if (!seedPayload || typeof seedPayload !== 'object') return '';
      const raw = String(seedPayload.userPrompt || '').trim();
      if (raw) return raw;
      return '请基于这张图继续分析具体物品分类和可执行的变废为宝方案。';
    }

    function maybeStartFromFreshSeed() {
      const seedPayload = parseSeedPayload();
      if (!seedPayload) return null;

      const createdAt = String(seedPayload.createdAt || '').trim();
      const seedFingerprint = createdAt || [
        String(seedPayload.category || '').trim(),
        String(seedPayload.assistantReply || '').trim().slice(0, 120)
      ].join('__');
      const consumedAt = String(localStorage.getItem(SEED_CONSUMED_KEY) || '').trim();
      if (!seedFingerprint || seedFingerprint === consumedAt) return null;

      const newSessionId = createSessionId();
      ensureConversation(newSessionId);
      activeSessionId = newSessionId;
      localStorage.setItem(SESSION_KEY, newSessionId);

      const seedImage =
        typeof seedPayload.imageBase64 === 'string' && seedPayload.imageBase64.startsWith('data:image/')
          ? seedPayload.imageBase64
          : '';
      const seedUserText = buildSeedUserText(seedPayload);
      const seedText = buildSeedAssistantText(seedPayload);
      if (seedUserText || seedImage || seedText) {
        const conversation = ensureConversation(newSessionId);
        if (seedUserText || seedImage) {
          conversation.messages.push({
            role: 'user',
            content: seedUserText || '请继续分析这张图片。',
            imageBase64: seedImage,
            createdAt: createdAt || new Date().toISOString()
          });
        }
        if (seedText) {
          conversation.messages.push({
            role: 'assistant',
            content: seedText,
            imageBase64: '',
            createdAt: createdAt || new Date().toISOString()
          });
        }
        refreshConversationMeta(conversation);
      }

      localStorage.setItem(SEED_CONSUMED_KEY, seedFingerprint);
      return newSessionId;
    }

    function ensureWelcomeMessageIfEmpty() {
      const conversation = ensureConversation(activeSessionId);
      if (conversation.messages.length) return;

      conversation.messages.push({
        role: 'assistant',
        content: '我已准备好继续分析。你可以直接问：分类依据、投放顺序、或更详细的变废为宝执行方案。',
        imageBase64: '',
        createdAt: new Date().toISOString()
      });
      refreshConversationMeta(conversation);
    }

    function extractHistoryForRequest() {
      const conversation = ensureConversation(activeSessionId);
      return conversation.messages
        .slice(-10)
        .map((item) => ({ role: item.role, content: item.content }))
        .filter((item) => item.content && (item.role === 'user' || item.role === 'assistant'));
    }

    async function onSend() {
      const rawText = promptInput.value.trim();
      const sendingImage = currentImageDataUrl;
      const sendingImageName = currentImageNameText;

      if (!rawText && !sendingImage) {
        alert('请先输入问题或选择图片');
        return;
      }

      const userText = rawText || '请基于这张图继续补充具体物品分类和可执行的变废为宝方案。';
      const historyForApi = extractHistoryForRequest();

      if (messagesEl.firstChild && messagesEl.firstChild.classList && messagesEl.firstChild.classList.contains('empty-chat')) {
        messagesEl.innerHTML = '';
      }

      appendMessageToDom('user', userText, sendingImage);
      pushMessageToActive('user', userText, sendingImage, new Date().toISOString());

      promptInput.value = '';
      renderPickedImage('', '');

      try {
        const streamed = await streamChat({
          text: userText,
          imageBase64: sendingImage,
          history: historyForApi
        });
        pushMessageToActive('assistant', streamed.content || 'AI 暂未返回内容。', '', new Date().toISOString());
      } catch (error) {
        const failedText = error && error.name === 'AbortError'
          ? '已停止当前回答。'
          : `请求异常：${error && error.message ? error.message : error}`;
        appendMessageToDom('assistant', failedText);
        pushMessageToActive('assistant', failedText, '', new Date().toISOString());
      } finally {
        sendBtn.disabled = false;
        stopBtn.disabled = true;
        abortCtrl = null;
      }

      if (sendingImage && sendingImageName) {
        imageInput.value = '';
      }
    }

    pickBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const dataUrl = await fileToDataURL(file);
        renderPickedImage(dataUrl, file.name || '已添加图片');
      } catch (error) {
        alert(`读取图片失败：${error && error.message ? error.message : error}`);
      }
    });

    removeImageBtn.addEventListener('click', () => renderPickedImage('', ''));

    newChatBtn.addEventListener('click', () => {
      const current = ensureConversation(activeSessionId);
      if (!current.messages.length) {
        setActiveSession(activeSessionId);
        promptInput.focus();
        return;
      }

      const nextId = createSessionId();
      ensureConversation(nextId);
      setActiveSession(nextId);
      promptInput.value = '';
      promptInput.focus();
    });

    stopBtn.addEventListener('click', () => {
      if (abortCtrl) abortCtrl.abort();
    });

    sendBtn.addEventListener('click', onSend);

    promptInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSend();
      }
    });

    if (historyToggleBtn) {
      historyToggleBtn.addEventListener('click', () => {
        toggleHistoryDrawer();
      });
    }

    if (historyBackdrop) {
      historyBackdrop.addEventListener('click', () => {
        closeHistoryDrawer(false);
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event && event.key === 'Escape') {
        closeHistoryDrawer(false);
      }
    });

    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    });

    (async function init() {
      applyTheme();
      window.addEventListener('storage', (event) => {
        if (!event || event.key === 'app_theme') applyTheme();
      });
      drawerMediaQuery = window.matchMedia(MOBILE_DRAWER_QUERY);
      const onDrawerMediaChange = (event) => {
        if (event && !event.matches) {
          closeHistoryDrawer(true);
        } else {
          syncHistoryDrawerState();
        }
      };
      if (drawerMediaQuery.addEventListener) {
        drawerMediaQuery.addEventListener('change', onDrawerMediaChange);
      } else if (drawerMediaQuery.addListener) {
        drawerMediaQuery.addListener(onDrawerMediaChange);
      }
      closeHistoryDrawer(true);
      syncHistoryDrawerState();

      let historyItems = [];
      try {
        historyItems = await loadHistoryItems();
      } catch (_) {
        historyItems = [];
      }

      hydrateConversations(historyItems);

      const freshSeedSession = maybeStartFromFreshSeed();
      if (freshSeedSession) {
        setActiveSession(freshSeedSession);
      } else {
        const preferredSessionId = normalizeSessionId(ensureSessionId());
        const sorted = getSortedConversations();
        const fallbackSessionId = sorted.length ? sorted[0].id : preferredSessionId;
        const targetSessionId = conversationMap.has(preferredSessionId)
          ? preferredSessionId
          : fallbackSessionId;

        ensureConversation(targetSessionId);
        setActiveSession(targetSessionId);
      }

      ensureWelcomeMessageIfEmpty();
      renderConversationList();
      renderActiveMessages();
      updateHeader();

      promptInput.value = '';
      renderPickedImage('', '');
    })();
