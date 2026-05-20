const POST_LOGIN_REDIRECT_KEY = 'processManager.postLoginRedirect';

export const isSafeInternalPath = (path) => (
  typeof path === 'string'
  && path.startsWith('/')
  && !path.startsWith('//')
  && !path.startsWith('/login')
  && !path.startsWith('/oauth2/redirect')
);

export const routePathFromLocation = (location) => {
  if (!location) return '/main';
  return `${location.pathname || ''}${location.search || ''}${location.hash || ''}` || '/main';
};

export const savePostLoginRedirect = (path) => {
  const nextPath = isSafeInternalPath(path) ? path : '/main';
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, nextPath);
};

export const consumePostLoginRedirect = (fallback = '/main') => {
  const path = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return isSafeInternalPath(path) ? path : fallback;
};
