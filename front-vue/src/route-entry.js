const pageLoaders = {
  'ai-chat': () => import('./pages/ai-chat/main.js'),
  'admin-ai-settings': () => import('./pages/admin-ai-settings/main.js'),
  'collection-planning': () => import('./pages/collection-planning/main.js'),
  'collection-dashboard': () => import('./pages/collection-dashboard/main.js'),
  'community-dashboard': () => import('./pages/community-dashboard/main.js'),
  'achievements': () => import('./pages/achievements/main.js')
};

const routeToPage = {
  '/ai-chat': 'ai-chat',
  '/admin-ai-settings': 'admin-ai-settings',
  '/collection-planning': 'collection-planning',
  '/collection-dashboard': 'collection-dashboard',
  '/community-dashboard': 'community-dashboard',
  '/achievements': 'achievements',
  '/vue/ai-chat.html': 'ai-chat',
  '/vue/admin-ai-settings.html': 'admin-ai-settings',
  '/vue/collection-planning.html': 'collection-planning',
  '/vue/collection-dashboard.html': 'collection-dashboard',
  '/vue/community-dashboard.html': 'community-dashboard',
  '/vue/achievements.html': 'achievements',
  '/vue/entries/ai-chat.html': 'ai-chat',
  '/vue/entries/admin-ai-settings.html': 'admin-ai-settings',
  '/vue/entries/collection-planning.html': 'collection-planning',
  '/vue/entries/collection-dashboard.html': 'collection-dashboard',
  '/vue/entries/community-dashboard.html': 'community-dashboard',
  '/vue/entries/achievements.html': 'achievements'
};

function normalizePath(rawPath) {
  const pathname = String(rawPath || '/').trim();
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function renderFallback(pathname) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6fbff;color:#123;">
      <div style="max-width:560px;background:#fff;border-radius:14px;padding:24px;box-shadow:0 14px 40px rgba(7,42,78,.12);">
        <h1 style="margin:0 0 10px;font-size:22px;">Route Not Matched</h1>
        <p style="margin:0 0 14px;line-height:1.6;">Current path <code>${pathname}</code> is not an independent page route.</p>
        <a href="/" style="display:inline-block;padding:10px 14px;border-radius:8px;text-decoration:none;color:#fff;background:#2f6fed;">Back To Home</a>
      </div>
    </main>
  `;
}

async function bootstrapByRoute() {
  const pathname = normalizePath(window.location.pathname);
  const pageKey = routeToPage[pathname];
  const loadPage = pageLoaders[pageKey];

  if (!loadPage) {
    renderFallback(pathname);
    return;
  }

  try {
    await loadPage();
  } catch (error) {
    console.error('[vue-route-entry] failed to load page:', pageKey, error);
    renderFallback(pathname);
  }
}

bootstrapByRoute();
