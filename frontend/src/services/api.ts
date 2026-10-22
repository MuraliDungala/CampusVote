/**
 * Base API client with CSRF protection and HTTP-only cookie support.
 */

// Helper to get CSRF token from document.cookie
export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

export class ApiError extends Error {
  public status: number;
  public details: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let cachedCsrfToken: string | null = null;

/**
 * Fetch and cache CSRF token from backend endpoint for cross-origin SPA contexts.
 */
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
    const csrfEndpoint = `${apiBaseUrl}/api/v1/auth/csrf/`;
    const res = await fetch(csrfEndpoint, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.csrfToken) {
        cachedCsrfToken = data.csrfToken;
        return data.csrfToken;
      }
    }
  } catch {
    // Graceful degradation
  }
  return null;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers = {}, ...customConfig } = options;

  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  let url = endpoint;
  if (apiBaseUrl && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    url = `${apiBaseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += (url.includes('?') ? '&' : '?') + searchParams.toString();
  }

  // Retrieve CSRF token for unsafe HTTP verbs
  const isUnsafeMethod = customConfig.method && !['GET', 'HEAD', 'OPTIONS'].includes(customConfig.method.toUpperCase());
  let csrfToken = getCookie('csrftoken') || cachedCsrfToken;
  if (isUnsafeMethod && !csrfToken) {
    csrfToken = await fetchCsrfToken();
  }

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (isUnsafeMethod && csrfToken) {
    (defaultHeaders as Record<string, string>)['X-CSRFToken'] = csrfToken;
  }

  const config: RequestInit = {
    credentials: 'include', // Ensures HTTP-only session cookies are transmitted
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    ...customConfig,
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      if (response.status === 403) {
        cachedCsrfToken = null;
      }
      let errorMessage = 'API request failed';

      if (typeof data === 'string') {
        const lower = data.toLowerCase();
        // Guard against HTML error pages from Django or proxies
        if (lower.includes('<html') || lower.includes('<!doctype') || lower.includes('<body') || lower.includes('<head')) {
          if (response.status === 404) {
            errorMessage = 'The requested API endpoint was not found on the server (HTTP 404).';
          } else if (response.status === 500) {
            errorMessage = 'An internal server error occurred on the voting server (HTTP 500). Please try again later.';
          } else if (response.status === 403) {
            errorMessage = 'Access denied or CSRF session verification failed (HTTP 403).';
          } else if (response.status === 401) {
            errorMessage = 'Authentication required. Please sign in (HTTP 401).';
          } else if (response.status >= 502 && response.status <= 504) {
            errorMessage = 'The campus voting service is temporarily unavailable. Please try again in a moment.';
          } else {
            errorMessage = `Server returned an unexpected response (HTTP ${response.status}).`;
          }
        } else {
          errorMessage = data.trim() || `Request failed with status ${response.status}`;
        }
      } else if (typeof data === 'object' && data !== null) {
        if (typeof data.message === 'string') {
          errorMessage = data.message;
        } else if (typeof data.error === 'string') {
          errorMessage = data.error;
        } else if (typeof data.detail === 'string') {
          errorMessage = data.detail;
        } else if (data.details && typeof data.details === 'string') {
          errorMessage = data.details;
        } else if (data.details && typeof data.details === 'object') {
          const firstKey = Object.keys(data.details)[0];
          const firstVal = data.details[firstKey];
          if (Array.isArray(firstVal) && firstVal.length > 0) {
            errorMessage = `${firstKey.replace(/_/g, ' ')}: ${firstVal[0]}`;
          } else if (typeof firstVal === 'string') {
            errorMessage = `${firstKey.replace(/_/g, ' ')}: ${firstVal}`;
          } else {
            errorMessage = 'Validation error occurred. Please review your input.';
          }
        } else {
          const keys = Object.keys(data);
          if (keys.length > 0) {
            const firstKey = keys[0];
            const firstVal = data[firstKey];
            if (Array.isArray(firstVal) && firstVal.length > 0) {
              errorMessage = `${firstKey.replace(/_/g, ' ')}: ${firstVal[0]}`;
            } else if (typeof firstVal === 'string') {
              errorMessage = firstVal;
            }
          }
        }
      }

      throw new ApiError(errorMessage, response.status, data);
    }

    return data as T;
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network connection error', 0, error);
  }
}
