const readResponse = async (response) => {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || payload?.message || `Sign-in failed (${response.status}).`);
  }
  return payload?.data;
};

export const createAuthSession = ({ fetchImpl = fetch } = {}) => {
  const cookies = new Map();
  let csrfToken = '';
  let apiUrl = '';

  const clear = () => {
    cookies.clear();
    csrfToken = '';
    apiUrl = '';
  };

  const storeCookies = (response) => {
    const headers = response.headers;
    const setCookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);

    for (const setCookie of setCookies) {
      const [cookiePair, ...attributes] = setCookie.split(';');
      const separator = cookiePair.indexOf('=');
      if (separator <= 0) continue;
      const name = cookiePair.slice(0, separator).trim();
      const value = cookiePair.slice(separator + 1).trim();
      if (attributes.some((attribute) => /^max-age=0$/i.test(attribute.trim())) || !value) {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    }
  };

  const request = async (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = new Headers(options.headers || {});
    if (cookies.size) {
      headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    try {
      const response = await fetchImpl(url, { ...options, headers, signal: controller.signal });
      storeCookies(response);
      return await readResponse(response);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Sign-in request timed out. Check that the server is running and try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const login = async (backendUrl, email, password) => {
    clear();
    apiUrl = backendUrl;
    try {
      const csrf = await request(`${apiUrl}/auth/csrf`);
      if (typeof csrf?.csrfToken !== 'string' || !csrf.csrfToken) {
        throw new Error('The server did not provide a sign-in security token.');
      }
      csrfToken = csrf.csrfToken;
      const result = await request(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ email, password }),
      });
      if (!result?.user) throw new Error('The server did not confirm the sign-in.');
      csrfToken = result.csrfToken || '';
      return result.user;
    } catch (error) {
      clear();
      throw error;
    }
  };

  const logout = async () => {
    const currentApiUrl = apiUrl;
    if (!currentApiUrl || !cookies.size) {
      clear();
      return;
    }
    try {
      await request(`${currentApiUrl}/auth/logout`, {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });
    } finally {
      clear();
    }
  };

  return { login, logout };
};