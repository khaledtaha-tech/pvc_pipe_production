/**
 * Central API Client for Hostinger MySQL Integration
 * Handles network requests with timeout and offline-safe fallback
 */

const API_TIMEOUT_MS = 5000;

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    // Relative to the current document origin/path
    return './api';
  }
  return '/api';
}

/**
 * Robust fetch wrapper with timeout and error handling
 */
async function apiRequest(endpoint, options = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;

  const url = `${getApiBaseUrl()}/${endpoint}`;
  const fetchOpts = {
    ...options,
    signal: controller ? controller.signal : undefined,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  };

  try {
    const response = await fetch(url, fetchOpts);
    if (timeoutId) clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 503 && data && data.code === 'DB_CONFIG_REQUIRED') {
        return {
          success: false,
          dbConfigRequired: true,
          message: data.message || 'Database password placeholder needs configuration in config.php'
        };
      }
      return {
        success: false,
        status: response.status,
        message: data?.message || `HTTP ${response.status} from ${endpoint}`
      };
    }

    return {
      success: true,
      data
    };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      offline: true,
      isTimeout,
      message: isTimeout
        ? 'Central API request timed out (working in offline mode)'
        : (err.message || 'Network error (working in offline mode)')
    };
  }
}

/**
 * Save report and hourly records to central database
 */
export async function saveReportToApi(report, derived) {
  if (!report || !report.header) {
    return { success: false, message: 'Invalid report structure' };
  }

  const payload = {
    report,
    derived: derived || null
  };

  return apiRequest('save_report.php', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Fetch report from central database by ID or date+line
 */
export async function fetchReportFromApi({ id, date, line } = {}) {
  let query = '';
  if (id) {
    query = `?id=${encodeURIComponent(id)}`;
  } else if (date && line) {
    query = `?date=${encodeURIComponent(date)}&line=${encodeURIComponent(line)}`;
  } else {
    return { success: false, message: 'Must supply id or date + line' };
  }

  return apiRequest(`get_report.php${query}`, {
    method: 'GET'
  });
}

/**
 * Fetch history list from central database
 */
export async function fetchHistoryFromApi(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.date) params.set('date', String(options.date));

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`get_history.php${query}`, {
    method: 'GET'
  });
}

/**
 * Delete report from central database
 */
export async function deleteReportFromApi(id) {
  if (!id) return { success: false, message: 'Missing report id' };

  return apiRequest(`delete_report.php?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ id })
  });
}
