export const normalizeApiUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Enter a valid backend URL, such as https://rms.example.com.');
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid backend URL, such as https://rms.example.com.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Use a valid HTTP or HTTPS backend URL.');
  }
  if (url.username || url.password) {
    throw new Error('Backend URL cannot contain credentials.');
  }
  url.search = '';
  url.hash = '';
  const pathname = url.pathname
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
    .replace(/\/api(?:\/v1)?$/i, '');
  return `${url.origin}${pathname}/api/v1`;
};
