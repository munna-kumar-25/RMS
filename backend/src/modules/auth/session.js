import session from 'express-session';
import MongoStore from 'connect-mongo';
import env from '../../../config/env.js';

export const sessionTtlMs = () => env.SESSION_TTL_MINUTES * 60 * 1000;

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: sessionTtlMs(),
});

const sessionStores = new Set();

export const closeSessionStore = async () => {
  await Promise.all([...sessionStores].map((store) => store.close()));
  sessionStores.clear();
};

export const setupSession = (app) => {
  if (!env.MONGODB_URI || !env.SESSION_SECRET) return;
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  const sessionStore = MongoStore.create({
    mongoUrl: env.MONGODB_URI,
    stringify: false,
    ttl: env.SESSION_TTL_MINUTES * 60,
  });
  sessionStores.add(sessionStore);

  app.use(session({
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: Boolean(env.TRUST_PROXY),
    cookie: sessionCookieOptions(),
    store: sessionStore,
  }));
};

export const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate((error) => (error ? reject(error) : resolve()));
});

export const destroySession = (req) => new Promise((resolve) => {
  if (!req.session) {
    resolve();
    return;
  }
  req.session.destroy(() => resolve());
});

export const clearSessionCookie = (res) => {
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(env.SESSION_COOKIE_NAME, options);
};

export const writeAuthenticatedSession = (req, user) => {
  req.session.userId = String(user._id);
  req.session.authVersion = user.authVersion ?? 0;
  req.session.expiresAt = Date.now() + sessionTtlMs();
};
