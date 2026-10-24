import Payment from './payment.model.js';
import Order from '../order/order.model.js';
import Branch from '../branch/branch.model.js';
import PosSession from './session.model.js';
import PosTerminal from './terminal.model.js';
import Table from '../table/table.model.js';
import PaymentGatewayTransaction from './payment-gateway-transaction.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { emitToBranch } from '../../sockets/index.js';

export const payOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return sendError(res, 'Order not found.', 404);
  if (req.user.role !== 'SUPER_ADMIN' && String(req.user.branchId) !== String(order.branchId)) return sendError(res, 'Branch access denied.', 403);
  if (['CANCELLED', 'PAID'].includes(order.status)) return sendError(res, 'This order cannot accept payment.', 409);
  const amount = Number(req.body.amount ?? order.grandTotal);
  if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 'Payment amount must be positive.', 400);
  const method = String(req.body.method || 'CASH').toUpperCase();
  if (!['CASH', 'CARD', 'UPI', 'OTHER'].includes(method)) return sendError(res, 'Choose one enabled payment method: Cash, Card, UPI, or Other.', 400);
  const branch = await Branch.findById(order.branchId).select('moduleSettings');
  const enabledMethods = branch?.moduleSettings?.paymentConfiguration?.enabledMethods || ['CASH'];
  if (!enabledMethods.includes(method)) return sendError(res, `${method} payments are disabled for this branch.`, 409);
  if (['CARD', 'UPI'].includes(method)) {
    return sendError(res, 'Card and UPI payments must be completed through verified Paytm or PhonePe hosted checkout.', 409);
  }
  if (await PaymentGatewayTransaction.exists({ orderId: order._id, status: { $in: ['PENDING', 'PROCESSING'] }, expiresAt: { $gt: new Date() } })) {
    return sendError(res, 'A hosted payment is in progress for this order. Check its status before recording another payment.', 409);
  }
  const hasActiveTerminal = await PosTerminal.exists({ branchId: order.branchId, isActive: true });
  if (method === 'CASH' && hasActiveTerminal && !req.body.posSessionId) {
    return sendError(res, 'Select an open POS cash session before recording payment.', 409);
  }
  let posSession = null;
  if (req.body.posSessionId) {
    posSession = await PosSession.findOne({
      _id: req.body.posSessionId,
      branchId: order.branchId,
      status: 'OPEN',
    });
    if (!posSession) return sendError(res, 'An open cash session for this branch is required.', 409);
  }
  const aggregate = await Payment.aggregate([{ $match: { orderId: order._id, status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  const alreadyPaid = aggregate[0]?.total || 0;
  if (alreadyPaid + amount > order.grandTotal) return sendError(res, 'Payment exceeds the order total.', 409);
  const payment = await Payment.create({ orderId: order._id, branchId: order.branchId, posSessionId: posSession?._id || null, amount, method, transactionReference: req.body.transactionReference || '', receivedBy: req.user._id });
  order.status = alreadyPaid + amount >= order.grandTotal ? 'PAID' : 'BILLED';
  order.payment = { method: payment.method, isPaid: order.status === 'PAID', transactionRef: payment.transactionReference, paidAt: order.status === 'PAID' ? payment.paidAt : null };
  await order.save();
  if (order.status === 'PAID' && order.tableId) {
    await Table.updateOne(
      { _id: order.tableId, activeOrderId: order._id },
      { $set: { status: 'NEEDS_CLEANING', activeOrderId: null } }
    );
  }
  emitToBranch(order.branchId, 'order.updated', order);
  return sendSuccess(res, { payment, order, paidAmount: alreadyPaid + amount, remaining: Math.max(0, order.grandTotal - alreadyPaid - amount) }, 'Payment recorded.', 201);
};

export const listPayments = async (req, res) => {
  const branchId = req.user.role === 'SUPER_ADMIN' ? req.query.branchId : req.user.branchId;
  const payments = await Payment.find(branchId ? { branchId } : {}).sort('-createdAt').limit(200);
  return sendSuccess(res, payments, 'Payments retrieved.');
};

export default { payOrder, listPayments };