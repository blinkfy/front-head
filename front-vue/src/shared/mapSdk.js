export async function loadTencentMapSdk(keys, options = {}) {
  const keyList = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (window.TMap) return window.TMap;
  if (!keyList.length) {
    throw new Error('Tencent map key is required');
  }

  const version = options.version || '1.exp';
  const timeoutMs = Number(options.timeoutMs || 12000);

  for (const key of keyList) {
    try {
      await new Promise((resolve, reject) => {
        const id = `tmap-sdk-${key}`;
        if (document.getElementById(id)) {
          const timer = window.setInterval(() => {
            if (window.TMap) {
              clearInterval(timer);
              resolve();
            }
          }, 80);
          window.setTimeout(() => {
            clearInterval(timer);
            reject(new Error('Map SDK load timeout'));
          }, timeoutMs);
          return;
        }

        const script = document.createElement('script');
        script.id = id;
        script.src = `https://map.qq.com/api/gljs?v=${version}&key=${key}`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`failed to load key ${key}`));

        document.head.appendChild(script);
      });

      if (window.TMap) return window.TMap;
    } catch (_) {
      // Try next key.
    }
  }

  throw new Error('Tencent map SDK load failed for all keys');
}
