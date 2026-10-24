import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import PaytmChecksum from 'paytmchecksum';
import Branch from '../branch/branch.model.js';
import Order from '../order/order.model.js';
import Payment from './payment.model.js';
import PaymentGatewayConfiguration from './payment-gateway.model.js';
import PaymentGatewayTransaction from './payment-gateway-transaction.model.js';
import {
  createPhonePeCheckout as createPhonePeCheckoutRequest,
  getPhonePeOrderStatus,
} from './phonepe-gateway-client.js';
import PosSession from './session.model.js';
import PosTerminal from './terminal.model.js';
import Table from '../table/table.model.js';
import { decryptGatewayCredentials } from './payment-gateway-crypto.js';
import { emitToBranch } from '../../sockets/index.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const publicBaseUrl = () => {
  const value = String(process.env.PAYMENT_GATEWAY_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Set PAYMENT_GATEWAY_PUBLIC_URL to the public HTTPS origin of this backend.');
  }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('PAYMENT_GATEWAY_PUBLIC_URL must be an HTTPS origin without a path, query, or fragment.');
  }
  return value;
};

const merchantOrderId = () => `RMS${randomUUID().replaceAll('-', '')}`;
const publicApiUrl = (baseUrl) => `${baseUrl}/api/v1`;
const paymentTotals = async (orderId) => Payment.aggregate([
  { $match: { orderId, status: 'COMPLETED' } },
  { $group: { _id: null, total: { $sum: '$amount' } } },
]);
const validProviderUrl = (value) => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('The payment provider returned an unsafe checkout URL.');
  }
  return parsed.toString();
};

const providerCredentials = async (branchId, provider) => {
  const key = provider === 'PAYTM' ? 'paytm' : 'phonepe';
  const configured = await PaymentGatewayConfiguration.findOne({ branchId })
    .select(`+${key}.ciphertext +${key}.iv +${key}.authTag`);
  if (!configured?.[key]?.ciphertext) {
    throw Object.assign(new Error(`${provider} sandbox credentials are not configured for this branch.`), { statusCode: 409 });
  }
  return decryptGatewayCredentials(configured[key]);
};

const fetchJson = async (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.body?.resultInfo?.resultMsg || payload?.message || `Payment provider returned HTTP ${response.status}.`);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Payment provider request timed out. Check the provider configuration and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const createPaytmCheckout = async ({ credentials, id, amount, baseUrl }) => {
  const host = 'https://securegw-stage.paytm.in';
  const paytmOrderId = id;
  const body = {
    requestType: 'Payment',
    mid: credentials.merchantId,
    websiteName: credentials.websiteName,
    orderId: paytmOrderId,
    txnAmount: { value: amount.toFixed(2), currency: 'INR' },
    userInfo: { custId: `RMS${randomUUID().replaceAll('-', '').slice(0, 24)}` },
    callbackUrl: `${publicApiUrl(baseUrl)}/payments/gateways/return`,
  };
  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), credentials.merchantKey);
  const response = await fetchJson(
    `${host}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(credentials.merchantId)}&orderId=${encodeURIComponent(paytmOrderId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body, head: { signature } }),
    }
  );
  const result = response?.body?.resultInfo;
  const token = response?.body?.txnToken;
  if (result?.resultStatus !== 'S' || typeof token !== 'string' || !token) {
    throw new Error(result?.resultMsg || 'Paytm could not start checkout. Verify the sandbox merchant configuration.');
  }
  return {
    checkoutUrl: `${baseUrl}/payments/gateways/paytm/checkout/`,
    checkoutToken: token,
    merchantOrderId: paytmOrderId,
  };
};

const createPhonePeCheckout = async ({ credentials, id, amount, baseUrl }) => {
  const response = await createPhonePeCheckoutRequest({
    credentials,
    merchantOrderId: id,
    amount,
    redirectUrl: `${publicApiUrl(baseUrl)}/payments/gateways/return`,
  });
  return {
    checkoutUrl: validProviderUrl(response.redirectUrl),
    checkoutToken: '',
    merchantOrderId: id,
  };
};

export const startGatewayPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return sendError(res, 'Order not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(req.user.branchId) !== String(order.branchId)) {
      return sendError(res, 'Branch access denied.', 403);
    }
    if (['CANCELLED', 'PAID'].includes(order.status) || order.payment?.isPaid) {
      return sendError(res, 'This order cannot accept payment.', 409);
    }
    const provider = String(req.body?.provider || '').toUpperCase();
    const method = String(req.body?.method || '').toUpperCase();
    if (!['PAYTM', 'PHONEPE'].includes(provider) || !['UPI', 'CARD'].includes(method)) {
      return sendError(res, 'Choose Paytm or PhonePe and select UPI or Card.', 400);
    }
    const branch = await Branch.findById(order.branchId).select('moduleSettings');
    const enabledMethods = branch?.moduleSettings?.paymentConfiguration?.enabledMethods || ['CASH'];
    if (!enabledMethods.includes(method)) return sendError(res, `${method} payments are disabled for this branch.`, 409);
    const inProgress = await PaymentGatewayTransaction.findOne({
      orderId: order._id,
      status: { $in: ['PENDING', 'PROCESSING'] },
      expiresAt: { $gt: new Date() },
    }).sort('-createdAt');
    if (inProgress) {
      if (inProgress.status === 'PENDING' && inProgress.provider === provider && inProgress.method === method) {
        return sendSuccess(res, {
          transactionId: String(inProgress._id),
          provider,
          method,
          checkoutUrl: inProgress.checkoutUrl,
          expiresAt: inProgress.expiresAt,
        }, 'Existing hosted payment checkout returned.');
      }
      return sendError(res, 'A payment is already in progress for this order. Check its status before starting another.', 409);
    }
    const aggregate = await paymentTotals(order._id);
    const due = Number((order.grandTotal - (aggregate[0]?.total || 0)).toFixed(2));
    if (due <= 0) return sendError(res, 'This order has no outstanding balance.', 409);

    let posSession = null;
    if (req.body?.posSessionId) {
      posSession = await PosSession.findOne({
        _id: req.body.posSessionId,
        branchId: order.branchId,
        status: 'OPEN',
      });
      if (!posSession) return sendError(res, 'Choose an open cash session for this branch.', 409);
    }

    const credentials = await providerCredentials(order.branchId, provider);
    const baseUrl = publicBaseUrl();
    const id = merchantOrderId();
    const checkout = provider === 'PAYTM'
      ? await createPaytmCheckout({ credentials, id, amount: due, baseUrl })
      : await createPhonePeCheckout({ credentials, id, amount: due, baseUrl });
    const transaction = new PaymentGatewayTransaction({
      branchId: order.branchId,
      orderId: order._id,
      provider,
      method,
      merchantOrderId: checkout.merchantOrderId,
      checkoutUrl: provider === 'PAYTM'
        ? `${publicApiUrl(baseUrl)}/payments/gateways/paytm/checkout/pending`
        : checkout.checkoutUrl,
      checkoutToken: checkout.checkoutToken,
      amount: due,
      receivedBy: req.user._id,
      posSessionId: posSession?._id || null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    if (provider === 'PAYTM') {
      transaction.checkoutUrl = `${publicApiUrl(baseUrl)}/payments/gateways/paytm/checkout/${transaction._id}`;
    }
    await transaction.save();
    return sendSuccess(res, {
      transactionId: String(transaction._id),
      provider,
      method,
      checkoutUrl: transaction.checkoutUrl,
      expiresAt: transaction.expiresAt,
    }, 'Hosted payment checkout started.', 201);
  } catch (error) {
    if (error.statusCode) return sendError(res, error.message, error.statusCode);
    console.error(`[payment-gateway:start] ${error.message}`);
    return sendError(res, error.message || 'Could not start hosted checkout.', 502);
  }
};

const settleVerifiedPayment = async (transaction, providerTransactionId, verifiedMethod = transaction.method) => {
  let locked = await PaymentGatewayTransaction.findOneAndUpdate(
    {
      _id: transaction._id,
      $or: [
        { status: 'PENDING' },
        { status: 'PROCESSING', updatedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } },
      ],
    },
    { $set: { status: 'PROCESSING', providerTransactionId, method: verifiedMethod } },
    { new: true }
  );
  const existingPayment = await Payment.findOne({
    orderId: transaction.orderId,
    transactionReference: transaction.merchantOrderId,
    status: 'COMPLETED',
  });
  if (!locked && !existingPayment) {
    return PaymentGatewayTransaction.findById(transaction._id);
  }
  const order = await Order.findById(transaction.orderId);
  if (!order) throw new Error('The order for this payment no longer exists.');
  let payment = existingPayment;
  if (!payment) {
    const aggregate = await paymentTotals(order._id);
    const paid = aggregate[0]?.total || 0;
    if (paid + transaction.amount > order.grandTotal + 0.005) {
      await PaymentGatewayTransaction.updateOne({ _id: transaction._id, status: 'PROCESSING' }, { $set: { status: 'FAILED' } });
      throw new Error('Verified payment exceeds the remaining order amount. Contact support before retrying.');
    }
    payment = await Payment.create({
      orderId: order._id,
      branchId: order.branchId,
      posSessionId: transaction.posSessionId,
      amount: transaction.amount,
      method: verifiedMethod,
      transactionReference: transaction.merchantOrderId,
      receivedBy: transaction.receivedBy,
    });
  }
  const aggregate = await paymentTotals(order._id);
  const totalPaid = aggregate[0]?.total || 0;
  order.status = totalPaid + 0.005 >= order.grandTotal ? 'PAID' : 'BILLED';
  order.payment = {
    method: payment.method,
    isPaid: order.status === 'PAID',
    transactionRef: transaction.merchantOrderId,
    paidAt: order.status === 'PAID' ? payment.paidAt : null,
  };
  await order.save();
  if (order.status === 'PAID' && order.tableId) {
    await Table.updateOne(
      { _id: order.tableId, activeOrderId: order._id },
      { $set: { status: 'NEEDS_CLEANING', activeOrderId: null } }
    );
  }
  await PaymentGatewayTransaction.updateOne(
    { _id: transaction._id },
    { $set: { status: 'COMPLETED', providerTransactionId } }
  );
  emitToBranch(order.branchId, 'order.updated', order);
  return PaymentGatewayTransaction.findById(transaction._id);
};

const verifyPaytm = async (transaction, credentials) => {
  const host = 'https://securegw-stage.paytm.in';
  const body = { mid: credentials.merchantId, orderId: transaction.merchantOrderId };
  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), credentials.merchantKey);
  const response = await fetchJson(`${host}/v3/order/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body, head: { signature } }),
  });
  const resultStatus = response?.body?.resultInfo?.resultStatus;
  if (resultStatus === 'TXN_FAILURE') return { state: 'FAILED', transactionId: '' };
  if (resultStatus !== 'TXN_SUCCESS') return { state: 'PENDING', transactionId: '' };
  if (Number(response.body.txnAmount?.value) !== Number(transaction.amount.toFixed(2))) {
    throw new Error('Paytm confirmed a payment amount that does not match this order.');
  }
  const transactionId = String(response.body.txnId || '');
  if (!transactionId) throw new Error('Paytm reported a successful payment without a transaction ID.');
  const paymentMode = String(response.body.paymentMode || '').toUpperCase();
  const method = paymentMode === 'UPI'
    ? 'UPI'
    : ['CC', 'DC', 'CARD'].includes(paymentMode)
      ? 'CARD'
      : paymentMode ? 'OTHER' : transaction.method;
  return { state: 'COMPLETED', transactionId, method };
};

const verifyPhonePe = async (transaction, credentials) => {
  const response = await getPhonePeOrderStatus(credentials, transaction.merchantOrderId);
  if (response?.state === 'FAILED') return { state: 'FAILED', transactionId: '' };
  if (response?.state !== 'COMPLETED') return { state: 'PENDING', transactionId: '' };
  if (Number(response.amount) !== Math.round(transaction.amount * 100)) {
    throw new Error('PhonePe confirmed a payment amount that does not match this order.');
  }
  const completedPayment = response.paymentDetails?.find((entry) => entry.state === 'COMPLETED');
  const transactionId = String(completedPayment?.transactionId || '');
  if (!transactionId) throw new Error('PhonePe reported a successful payment without a transaction ID.');
  const paymentMode = String(completedPayment.paymentMode || '').toUpperCase();
  const method = paymentMode.startsWith('UPI_')
    ? 'UPI'
    : paymentMode === 'CARD'
      ? 'CARD'
      : paymentMode ? 'OTHER' : transaction.method;
  return { state: 'COMPLETED', transactionId, method };
};

export const getGatewayPaymentStatus = async (req, res) => {
  try {
    const transaction = await PaymentGatewayTransaction.findById(req.params.transactionId);
    if (!transaction) return sendError(res, 'Payment transaction not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(req.user.branchId) !== String(transaction.branchId)) {
      return sendError(res, 'Branch access denied.', 403);
    }
    if (transaction.status === 'PENDING' || transaction.status === 'PROCESSING') {
      const existingPayment = transaction.status === 'PROCESSING'
        ? await Payment.findOne({ orderId: transaction.orderId, transactionReference: transaction.merchantOrderId, status: 'COMPLETED' })
        : null;
      const isStaleProcessing = transaction.status === 'PROCESSING'
        && transaction.updatedAt < new Date(Date.now() - 2 * 60 * 1000);
      const isExpired = transaction.expiresAt <= new Date();
      if (existingPayment || transaction.status === 'PENDING' || isStaleProcessing) {
        const verified = existingPayment
          ? { state: 'COMPLETED', transactionId: transaction.providerTransactionId, method: transaction.method }
          : await (async () => {
            const credentials = await providerCredentials(transaction.branchId, transaction.provider);
            return transaction.provider === 'PAYTM'
              ? verifyPaytm(transaction, credentials)
              : verifyPhonePe(transaction, credentials);
          })();
        if (verified.state === 'FAILED') {
          transaction.status = 'FAILED';
          await transaction.save();
        } else if (verified.state === 'COMPLETED') {
          const updated = await settleVerifiedPayment(transaction, verified.transactionId, verified.method);
          return sendSuccess(res, {
            transactionId: String(updated._id),
            transactionReference: updated.merchantOrderId,
            status: updated.status,
            provider: updated.provider,
            method: updated.method,
          }, 'Payment status verified.');
        } else if (isExpired) {
          transaction.status = 'EXPIRED';
          await transaction.save();
        }
      }
    }
    const current = await PaymentGatewayTransaction.findById(transaction._id);
    return sendSuccess(res, {
      transactionId: String(current._id),
      transactionReference: current.merchantOrderId,
      status: current.status,
      provider: current.provider,
      method: current.method,
    }, 'Payment status retrieved.');
  } catch (error) {
    console.error(`[payment-gateway:status] ${error.message}`);
    return sendError(res, error.message || 'Could not verify payment status.', 502);
  }
};

const htmlEscape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export const renderPaytmCheckout = async (req, res) => {
  try {
    const transaction = await PaymentGatewayTransaction.findOne({
      _id: req.params.transactionId,
      provider: 'PAYTM',
      status: 'PENDING',
      expiresAt: { $gt: new Date() },
    }).select('+checkoutToken');
    if (!transaction?.checkoutToken) return res.status(410).type('text').send('This payment checkout has expired. Return to the POS and retry.');
    const credentials = await providerCredentials(transaction.branchId, 'PAYTM');
    const host = 'https://securegw-stage.paytm.in';
    const action = `${host}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(credentials.merchantId)}&orderId=${encodeURIComponent(transaction.merchantOrderId)}`;
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; form-action https://securegw-stage.paytm.in https://securegw.paytm.in; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    });
    return res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paytm secure checkout</title><body style="font:16px system-ui;max-width:32rem;margin:4rem auto;padding:1rem"><h1>Continue to Paytm</h1><p>Your payment details are entered directly on Paytm's secure hosted checkout.</p><form method="post" action="${htmlEscape(action)}"><input type="hidden" name="mid" value="${htmlEscape(credentials.merchantId)}"><input type="hidden" name="orderId" value="${htmlEscape(transaction.merchantOrderId)}"><input type="hidden" name="txnToken" value="${htmlEscape(transaction.checkoutToken)}"><button style="padding:.8rem 1.2rem">Open secure checkout</button></form></body></html>`);
  } catch (error) {
    console.error(`[payment-gateway:paytm-checkout] ${error.message}`);
    return res.status(500).type('text').send('Unable to open Paytm checkout. Return to the POS and try again.');
  }
};

export const renderGatewayReturn = (_req, res) => res
  .set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  .type('html')
  .send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Payment status</title><body style="font:16px system-ui;max-width:32rem;margin:4rem auto;padding:1rem"><h1>Return to the POS</h1><p>The POS will verify your payment with the provider. Do not retry the payment unless the POS says it failed.</p></body></html>');

export const paymentGatewayPublicRoutes = Router();
paymentGatewayPublicRoutes.get('/gateways/paytm/checkout/:transactionId', renderPaytmCheckout);
paymentGatewayPublicRoutes.get('/gateways/return', renderGatewayReturn);
