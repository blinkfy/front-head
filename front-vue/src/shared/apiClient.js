import { authHeaders } from './auth';

function normalizeError(error, fallbackMessage = 'Request failed') {
  if (error && typeof error === 'object') {
    return {
      message: error.message || fallbackMessage,
      code: error.code,
      status: error.status
    };
  }
  return { message: fallbackMessage };
}

export async function request(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...authHeaders(),
        ...((options && options.headers) || {})
      }
    });

    let json = null;
    try {
      json = await response.json();
    } catch (_) {
      json = null;
    }

    if (!response.ok) {
      throw {
        message: (json && json.msg) || `HTTP ${response.status}`,
        status: response.status,
        code: json && json.code
      };
    }

    if (!json || json.code !== 0) {
      throw {
        message: (json && json.msg) || 'Business error',
        status: response.status,
        code: json && json.code
      };
    }

    return json.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function get(path, options = {}) {
  return request(path, { ...options, method: 'GET' });
}

export async function post(path, body, options = {}) {
  return request(path, {
    ...options,
    method: 'POST',
    body: body == null ? undefined : JSON.stringify(body)
  });
}

export async function put(path, body, options = {}) {
  return request(path, {
    ...options,
    method: 'PUT',
    body: body == null ? undefined : JSON.stringify(body)
  });
}
