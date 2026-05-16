const STATUS_FALLBACKS = {
  400: '요청값이 올바르지 않습니다.',
  401: '로그인이 필요합니다.',
  403: '권한이 없습니다.',
  404: '요청한 대상을 찾을 수 없습니다.',
  409: '요청을 처리할 수 없습니다.',
};

const BLOCKED_TERMS = [
  'sql',
  'jdbc',
  'constraint',
  'column',
  'table',
  'select ',
  'insert ',
  'update ',
  'delete ',
  'exception',
  'preparedstatement',
  'java.',
];

const getStatusFallback = (status, fallback) => {
  if (!status) return fallback;
  if (status >= 500) return '서버 처리 중 문제가 발생했습니다.';
  if (status >= 400) return STATUS_FALLBACKS[status] || fallback;
  return fallback;
};

const getSafeErrorMessage = (message, fallback) => {
  if (typeof message !== 'string' || !message.trim() || message.length > 120) {
    return fallback;
  }

  const lower = message.toLowerCase();
  return BLOCKED_TERMS.some(term => lower.includes(term)) ? fallback : message;
};

export const readApiErrorMessage = async (res, fallback = '요청 처리 중 문제가 발생했습니다.') => {
  const statusFallback = getStatusFallback(res?.status, fallback);
  if (!res) return statusFallback;

  if (res.status === 401 || res.status === 403 || res.status >= 500) {
    return statusFallback;
  }

  try {
    const data = await res.json();
    return getSafeErrorMessage(data?.detail || data?.message || data?.error, statusFallback);
  } catch {
    return statusFallback;
  }
};
