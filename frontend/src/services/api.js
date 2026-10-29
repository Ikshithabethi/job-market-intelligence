/**
 * Single place that knows how to talk to the Express API.
 *
 * Every backend response uses the same envelope:
 *   success -> { success: true,  data: ..., meta?: ... }
 *   failure -> { success: false, error: { message, code, details? } }
 * so `request()` unwraps `data` and throws an ApiError carrying the backend
 * message for anything that is not a 2xx response.
 */
import { getToken } from './session';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Removes empty values so we never send `?roleId=&location=`. */
export function toQueryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      search.set(key, value.join(','));
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(
      'Cannot reach the API. Check that the backend server is running and that the API URL is correct.',
      { status: 0, code: 'NETWORK_ERROR' }
    );
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = null;
    }
  }

  if (!response.ok || !payload || payload.success === false) {
    const error = (payload && payload.error) || {};
    throw new ApiError(error.message || `Request failed with status ${response.status}`, {
      status: response.status,
      code: error.code || 'REQUEST_FAILED',
      details: error.details || null,
    });
  }

  return { data: payload.data, meta: payload.meta || {} };
}

/* ------------------------------------------------------------------ groups */

export const systemApi = {
  /** GET /api/health - also confirms the MySQL connection is alive. */
  health: (signal) => request('/health', { signal }),
};

export const authApi = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/auth/logout', { method: 'POST', auth: true }),
  me: (signal) => request('/auth/me', { auth: true, signal }),
};

export const analyticsApi = {
  dashboard: (signal) => request('/analytics/dashboard', { signal }),
  overview: (signal) => request('/analytics/overview', { signal }),
  salary: (signal) => request('/analytics/salary', { signal }),
  demand: (signal) => request('/analytics/demand', { signal }),
  roles: (params = {}, signal) => request(`/analytics/roles${toQueryString(params)}`, { signal }),
  companies: (params = {}, signal) =>
    request(`/analytics/companies${toQueryString(params)}`, { signal }),
};

export const jobApi = {
  list: (params = {}, signal) => request(`/jobs${toQueryString(params)}`, { signal }),
  filters: (signal) => request('/jobs/filters', { signal }),
  detail: (id, signal) => request(`/jobs/${id}`, { signal }),
};

export const skillApi = {
  list: (params = {}, signal) => request(`/skills${toQueryString(params)}`, { signal }),
  categories: (signal) => request('/skills/categories', { signal }),
  trending: (params = {}, signal) => request(`/skills/trending${toQueryString(params)}`, { signal }),
  demand: (params = {}, signal) => request(`/skills/demand${toQueryString(params)}`, { signal }),
  detail: (id, signal) => request(`/skills/${id}`, { signal }),
};

export const roleApi = {
  list: (params = {}, signal) => request(`/roles${toQueryString(params)}`, { signal }),
  families: (signal) => request('/roles/families', { signal }),
  compare: (roleIds, signal) =>
    request(`/roles/compare${toQueryString({ roles: roleIds })}`, { signal }),
  detail: (id, signal) => request(`/roles/${id}`, { signal }),
};

export const graphApi = {
  graph: (params = {}, signal) => request(`/graph${toQueryString(params)}`, { signal }),
  stats: (signal) => request('/graph/stats', { signal }),
  neighbours: (params = {}, signal) =>
    request(`/graph/neighbours${toQueryString(params)}`, { signal }),
};

/**
 * POST /career/path and the recommendation endpoints use optionalAuth on the
 * server: sending the token is harmless when logged out, and when logged in it
 * lets the server fall back to the skills saved on the profile.
 */
export const careerApi = {
  options: (signal) => request('/career/options', { signal }),
  map: (signal) => request('/career/map', { signal }),
  path: (payload, signal) =>
    request('/career/path', { method: 'POST', body: payload, auth: true, signal }),
};

export const recommendationApi = {
  popularSkills: (params = {}, signal) =>
    request(`/recommendations/popular-skills${toQueryString(params)}`, { signal }),
  skills: (payload, signal) =>
    request('/recommendations/skills', { method: 'POST', body: payload, auth: true, signal }),
  roles: (payload, signal) =>
    request('/recommendations/roles', { method: 'POST', body: payload, auth: true, signal }),
};

export const userApi = {
  profile: (signal) => request('/users/profile', { auth: true, signal }),
  updateProfile: (payload) => request('/users/profile', { method: 'PUT', body: payload, auth: true }),
  skills: (signal) => request('/users/skills', { auth: true, signal }),
  skillCatalogue: (signal) => request('/users/skill-catalogue', { auth: true, signal }),
  addSkill: (payload) => request('/users/skills', { method: 'POST', body: payload, auth: true }),
  updateSkill: (id, payload) =>
    request(`/users/skills/${id}`, { method: 'PUT', body: payload, auth: true }),
  removeSkill: (id) => request(`/users/skills/${id}`, { method: 'DELETE', auth: true }),
  replaceSkills: (skillNames) =>
    request('/users/skills', { method: 'PUT', body: { skills: skillNames }, auth: true }),
};

export const roadmapApi = {
  list: (signal) => request('/roadmaps', { auth: true, signal }),
  detail: (id, signal) => request(`/roadmaps/${id}`, { auth: true, signal }),
  save: (payload) => request('/roadmaps', { method: 'POST', body: payload, auth: true }),
  remove: (id) => request(`/roadmaps/${id}`, { method: 'DELETE', auth: true }),
};

export { BASE_URL };
