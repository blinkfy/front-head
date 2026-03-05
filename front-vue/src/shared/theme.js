export function applyStoredTheme() {
  try {
    const theme = localStorage.getItem('app_theme') === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', theme === 'dark');
    document.body.classList.toggle('light-theme', theme === 'light');
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
  } catch (_) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    document.documentElement.setAttribute('data-theme', 'light');
    return 'light';
  }
}

export function bindThemeStorageSync() {
  const handler = (event) => {
    if (!event || event.key === 'app_theme') {
      applyStoredTheme();
    }
  };
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('storage', handler);
  };
}
