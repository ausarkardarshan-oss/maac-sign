/**
 * Centralized API client for MAAC AI Sign.
 * Uses session cookies for authentication — no tokens stored in localStorage.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body, signal } = options;

  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include', // Send session cookies
    signal,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }

  return data;
}

export const api = {
  get: (path, signal) => request(path, { method: 'GET', signal }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export { ApiError };
export default api;
