export function getAuthToken() {
  try {
    return localStorage.getItem('token') || '';
  } catch (_) {
    return '';
  }
}

export function authHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  if (token) headers.Authorization = token;
  return headers;
}
