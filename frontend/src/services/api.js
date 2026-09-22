/**
 * Centralized API client.
 * Automatically manages Authorization headers for authenticated requests.
 * Parses JSON and throws useful error objects.
 */
import { showToast } from '../utils/toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// The backend's zod validation errors carry the useful, field-specific
// message inside error.details (e.g. "password: must be at least 8
// characters") while error.message is just a generic "Invalid request
// payload". Prefer the details when present so the UI shows what actually
// went wrong.
const buildErrorMessage = (data) => {
  const err = data?.error;
  if (!err) return 'An API error occurred';

  if (Array.isArray(err.details) && err.details.length > 0) {
    const parts = err.details
      .map((d) => (d?.field ? `${d.field}: ${d.message}` : d?.message))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
  }

  return err.message || 'An API error occurred';
};

const handleResponse = async (res) => {
  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  }

  if (!res.ok) {
    const message = buildErrorMessage(data);
    const error = new Error(message);
    error.status = res.status;
    error.code = data?.error?.code;
    showToast(message, 'error');
    throw error;
  }

  return data;
};

// Wraps a request so a network-level failure (server unreachable, CORS,
// offline, etc. - anything that never reaches handleResponse) still surfaces
// a toast. HTTP error responses are already toasted inside handleResponse,
// so this only fires for errors that don't carry a `status`.
const withNetworkErrorToast = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (!err.status) {
      showToast('Network error — please check your connection', 'error');
    }
    throw err;
  }
};

export const api = {
  get: async (endpoint) => withNetworkErrorToast(async () => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });
    return handleResponse(res);
  }),

  post: async (endpoint, body) => withNetworkErrorToast(async () => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  }),

  patch: async (endpoint, body) => withNetworkErrorToast(async () => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  }),

  delete: async (endpoint) => withNetworkErrorToast(async () => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),
      },
    });
    return handleResponse(res);
  }),
};
