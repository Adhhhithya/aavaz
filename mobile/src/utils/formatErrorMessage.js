/**
 * Parses raw errors, exceptions, or HTTP status strings into
 * gentle, trauma-informed, clear user messages.
 */
function formatErrorMessage(error) {
  if (!error) return 'An unexpected condition occurred. Your data is safe.';

  let raw = '';
  if (typeof error === 'string') {
    raw = error;
  } else if (error?.data?.detail) {
    if (Array.isArray(error.data.detail)) {
      raw = error.data.detail
        .map((item) => (typeof item === 'object' ? item.msg || item.message || JSON.stringify(item) : String(item)))
        .join('; ');
    } else if (typeof error.data.detail === 'object') {
      raw = JSON.stringify(error.data.detail);
    } else {
      raw = String(error.data.detail);
    }
  } else if (error?.detail) {
    if (Array.isArray(error.detail)) {
      raw = error.detail
        .map((item) => (typeof item === 'object' ? item.msg || item.message || JSON.stringify(item) : String(item)))
        .join('; ');
    } else {
      raw = String(error.detail);
    }
  } else if (error?.data?.message) {
    raw = String(error.data.message);
  } else if (error?.message) {
    raw = error.message;
  } else {
    raw = String(error);
  }

  const rawLower = raw.toLowerCase();

  if (raw.includes('401') || rawLower.includes('unauthorized') || rawLower.includes('invalid credentials')) {
    return 'Invalid or expired verification code. Please check your SMS and try again.';
  }
  if (raw.includes('404') || rawLower.includes('not found')) {
    return 'The requested service is momentarily unavailable. Please check your connection.';
  }
  if (raw.includes('429') || rawLower.includes('rate') || rawLower.includes('too many requests')) {
    return 'Too many attempts. Please pause for a moment before trying again.';
  }
  if (raw.includes('500') || raw.includes('502') || raw.includes('503') || rawLower.includes('server error')) {
    return 'Our support server is experiencing a momentary delay. Please try again in a few moments.';
  }
  if (
    rawLower.includes('network') ||
    rawLower.includes('getaddrinfo') ||
    rawLower.includes('failed to fetch') ||
    rawLower.includes('network request failed') ||
    rawLower.includes('aborted')
  ) {
    return 'Unable to reach the support server. Please check your internet connection and try again.';
  }

  // Strip technical prefixes if present
  let clean = raw
    .replace(/^Error:\s*/i, '')
    .replace(/^API Error:\s*/i, '')
    .replace(/^TypeError:\s*/i, '')
    .replace(/^Uncaught\s*(\(in promise\))?:\s*/i, '');

  if (clean.length > 200) {
    clean = clean.slice(0, 200) + '...';
  }
  return clean || 'Something unexpected occurred. Please try again.';
}

module.exports = { formatErrorMessage };
