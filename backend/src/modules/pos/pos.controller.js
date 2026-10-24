import PosTerminal from './terminal.model.js';
import PosSession from './session.model.js';
import Payment from './payment.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const branchIdFor = (req) => req.branch?._id || req.user.branchId;

export const listTerminals = async (req, res) => {
  const terminals = await PosTerminal.find({ branchId: branchIdFor(req) }).sort({ name: 1 });
  return sendSuccess(res, terminals, 'POS terminals retrieved.');
};

export const createTerminal = async (req, res) => {
  try {
    const terminal = await PosTerminal.create({
      branchId: branchIdFor(req),
      name: req.body.name,
      code: req.body.code,
      deviceType: req.body.deviceType || 'COUNTER',
      receiptPrinterName: req.body.receiptPrinterName || '',
      paperWidth: req.body.paperWidth || '80mm',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    return sendSuccess(res, terminal, 'POS terminal configured.', 201);
  } catch (error) {
    return sendError(
      res,
      error.code === 11000 ? 'Terminal code already exists in this branch.' : error.message,
      error.code === 11000 ? 409 : 400
    );
  }
};

export const updateTerminal = async (req, res) => {
  const terminal = await PosTerminal.findOne({ _id: req.params.terminalId, branchId: branchIdFor(req) });
  if (!terminal) return sendError(res, 'POS terminal not found.', 404);
  for (const field of ['name', 'deviceType', 'receiptPrinterName', 'paperWidth', 'isActive']) {
    if (req.body[field] !== undefined) terminal[field] = req.body[field];
  }
  if (!terminal.isActive && await PosSession.exists({ terminalId: terminal._id, status: 'OPEN' })) {
    return sendError(res, 'Close the active cash session before disabling this terminal.', 409);
  }
  terminal.updatedBy = req.user._id;
  try {
    await terminal.save();
  } catch (error) {
    return sendError(res, error.message, 400);
  }
  return sendSuccess(res, terminal, 'POS terminal updated.');
};

export const listSessions = async (req, res) => {
  const sessions = await PosSession.find({ branchId: branchIdFor(req) })
    .sort('-openedAt')
    .limit(Math.min(100, Math.max(1, Number(req.query.limit) || 50)))
    .populate('terminalId', 'name code');
  return sendSuccess(res, sessions, 'POS sessions retrieved.');
};

export const openSession = async (req, res) => {
  const terminal = await PosTerminal.findOne({
    _id: req.params.terminalId,
    branchId: branchIdFor(req),
    isActive: true,
  });
  if (!terminal) return sendError(res, 'Active POS terminal not found.', 404);
  const openingCash = Number(req.body.openingCash);
  if (!Number.isFinite(openingCash) || openingCash < 0) return sendError(res, 'Opening cash must be zero or greater.', 400);
  try {
    const session = await PosSession.create({
      branchId: terminal.branchId,
      terminalId: terminal._id,
      openingCash,
      openedBy: req.user._id,
    });
    return sendSuccess(res, session, 'Cash session opened.', 201);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'This terminal already has an open cash session.', 409);
    return sendError(res, error.message, 400);
  }
};

export const closeSession = async (req, res) => {
  const session = await PosSession.findOne({ _id: req.params.sessionId, branchId: branchIdFor(req) });
  if (!session) return sendError(res, 'Cash session not found.', 404);
  if (session.status !== 'OPEN') return sendError(res, 'Cash session is already closed.', 409);
  const closingCash = Number(req.body.closingCash);
  if (!Number.isFinite(closingCash) || closingCash < 0) return sendError(res, 'Closing cash must be zero or greater.', 400);
  const payments = await Payment.aggregate([
    { $match: { posSessionId: session._id, method: 'CASH', status: 'COMPLETED' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const expectedCash = Math.round((session.openingCash + (payments[0]?.total || 0)) * 100) / 100;
  const closed = await PosSession.findOneAndUpdate(
    { _id: session._id, status: 'OPEN' },
    {
      $set: {
        status: 'CLOSED',
        closingCash,
        expectedCash,
        variance: Math.round((closingCash - expectedCash) * 100) / 100,
        closedBy: req.user._id,
        closedAt: new Date(),
        closingNote: String(req.body.closingNote || '').trim().slice(0, 500),
      },
    },
    { new: true, runValidators: true }
  );
  if (!closed) return sendError(res, 'Cash session was closed by another request.', 409);
  return sendSuccess(res, closed, 'Cash session closed.');
};

export default { listTerminals, createTerminal, updateTerminal, listSessions, openSession, closeSession };
