import { randomUUID } from 'crypto';

const incomingIdPattern = /^[A-Za-z0-9._-]{8,128}$/;

export const requestId = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && incomingIdPattern.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);

  const started = Date.now();
  res.on('finish', () => {
    console.log(`[${id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });

  next();
};

export default requestId;
