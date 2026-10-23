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

export function extractApiErrorMessage(data: any, status: number): string {
  if (typeof data === 'string') {
    const lower = data.toLowerCase();
    // Guard against HTML error pages from Django or proxies
    if (lower.includes('<html') || lower.includes('<!doctype') || lower.includes('<body') || lower.includes('<head')) {
      if (status === 404) {
        return 'The requested API endpoint was not found on the server (HTTP 404).';
      } else if (status === 500) {
        return 'An internal server error occurred on the voting server (HTTP 500). Please try again later.';
      } else if (status === 403) {
        return 'Access denied or CSRF session verification failed (HTTP 403).';
      } else if (status === 401) {
        return 'Authentication required. Please sign in (HTTP 401).';
      } else if (status >= 502 && status <= 504) {
        return 'The campus voting service is temporarily unavailable. Please try again in a moment.';
      } else {
        return `Server returned an unexpected response (HTTP ${status}).`;
      }
    }
    return data.trim() || `Request failed with status ${status}`;
  }

  if (typeof data === 'object' && data !== null) {
    // 1. Inspect specific details or non_field_errors FIRST before generic summary strings
    if (data.details) {
      if (typeof data.details === 'string') {
        return data.details;
      }
      if (typeof data.details === 'object' && data.details !== null) {
        if (data.details.non_field_errors) {
          const nf = data.details.non_field_errors;
          return Array.isArray(nf) && nf.length > 0 ? nf[0] : String(nf);
        }
        const keys = Object.keys(data.details).filter((k) => k !== 'code');
        if (keys.length > 0) {
          const firstKey = keys[0];
          const firstVal = data.details[firstKey];
          if (firstKey === 'non_field_errors') {
            return Array.isArray(firstVal) && firstVal.length > 0 ? firstVal[0] : String(firstVal);
          }
          if (Array.isArray(firstVal) && firstVal.length > 0) {
            return `${firstKey.replace(/_/g, ' ')}: ${firstVal[0]}`;
          } else if (typeof firstVal === 'string') {
            return `${firstKey.replace(/_/g, ' ')}: ${firstVal}`;
          }
        }
      }
    }

    // 2. Check top-level non_field_errors
    if (data.non_field_errors) {
      const nf = data.non_field_errors;
      return Array.isArray(nf) && nf.length > 0 ? nf[0] : String(nf);
    }

    // 3. Check explicit human message
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }

    // 4. Check explicit detail (standard DRF)
    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }

    // 5. Check error string (if not just a generic category while details exist)
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }

    // 6. Direct serializer field errors (e.g. { college_id: ["..."] })
    const keys = Object.keys(data).filter((k) => !['status', 'code'].includes(k));
    if (keys.length > 0) {
      const firstKey = keys[0];
      const firstVal = data[firstKey];
      if (firstKey === 'non_field_errors') {
        return Array.isArray(firstVal) && firstVal.length > 0 ? firstVal[0] : String(firstVal);
      }
      if (Array.isArray(firstVal) && firstVal.length > 0) {
        return `${firstKey.replace(/_/g, ' ')}: ${firstVal[0]}`;
      } else if (typeof firstVal === 'string') {
        return `${firstKey.replace(/_/g, ' ')}: ${firstVal}`;
      }
    }
  }

  return `Request failed with status ${status}`;
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
      const errorMessage = extractApiErrorMessage(data, response.status);
      throw new ApiError(errorMessage, response.status, data);
    }

    return data as T;
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    const rawMsg = error?.message || '';
    let userMsg = 'Network connection error. The voting server is currently unreachable. Please verify your connection or try again in a moment.';
    if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg.includes('Load failed')) {
      userMsg = 'Unable to connect to the campus voting server. The backend service may be starting up or temporarily unreachable. Please try again in a few moments.';
    } else if (rawMsg) {
      userMsg = rawMsg;
    }
    throw new ApiError(userMsg, 0, error);
  }
}
