import { isDatabaseReady } from '../../../config/database.js';

const ok = (req, res) => res.status(200).json({
  success: true,
  data: { status: 'ok' },
  requestId: req.id,
});

export const liveness = (req, res) => ok(req, res);

export const readiness = async (req, res) => {
  const ready = await isDatabaseReady();
  if (!ready) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database is unavailable',
      },
      requestId: req.id,
    });
  }
  return ok(req, res);
};
