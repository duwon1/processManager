const decodeBase64Url = (value) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(base64 + padding);
};

export const readJwtSubject = (accessToken) => {
  if (!accessToken) return '';

  try {
    const payloadSegment = accessToken.split('.')[1];
    if (!payloadSegment) return '';

    const payload = JSON.parse(decodeBase64Url(payloadSegment));
    return typeof payload.sub === 'string' ? payload.sub : '';
  } catch {
    return '';
  }
};
