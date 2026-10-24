import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  CreditCard,
  User,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Utensils,
  Receipt,
  FileText,
  QrCode,
} from 'lucide-react';
import { Order, OrderStatus, PaymentMethod } from '../../types/index.ts';
import { useAppStore } from '../../store/AppStore.tsx';
import StatusBadge from '../common/StatusBadge.tsx';
import api, { ensureCsrfToken } from '../../services/api.js';

interface OrderDetailsDrawerProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PosSessionOption {
  _id: string;
  status: string;
  terminalId?: { name?: string; code?: string } | string;
}

interface GatewayCheckout {
  transactionId: string;
  checkoutUrl: string;
  provider: 'PAYTM' | 'PHONEPE';
}

export const OrderDetailsDrawer: React.FC<OrderDetailsDrawerProps> = ({
  order: initialOrder,
  isOpen,
  onClose,
}) => {
  const { updateOrder } = useAppStore();
  const [order, setOrder] = useState(initialOrder);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [gatewayProvider, setGatewayProvider] = useState<'PAYTM' | 'PHONEPE' | ''>('');
  const [gatewayCheckout, setGatewayCheckout] = useState<GatewayCheckout | null>(null);
  const [otherPaymentReference, setOtherPaymentReference] = useState('');
  const [otherPaymentQr, setOtherPaymentQr] = useState('');
  const [qrError, setQrError] = useState('');
  const [paymentNotice, setPaymentNotice] = useState('');
  const [activePosSessions, setActivePosSessions] = useState<PosSessionOption[]>([]);
  const [selectedPosSessionId, setSelectedPosSessionId] = useState('');
  const [hasActiveTerminal, setHasActiveTerminal] = useState(false);
  const [posLoadError, setPosLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOrder(initialOrder);
    setPaymentMethod(initialOrder?.enabledPaymentMethods?.[0] || 'CASH');
    setGatewayProvider(initialOrder?.paymentGatewayProviders?.[0] || '');
    setGatewayCheckout(null);
    setOtherPaymentReference('');
    setPaymentNotice('');
    setError('');
  }, [initialOrder]);

  useEffect(() => {
    let cancelled = false;
    setOtherPaymentQr('');
    setQrError('');
    if (!isOpen || paymentMethod !== 'OTHER' || !initialOrder?._id) return undefined;
    api.get(`/payments/orders/${initialOrder._id}/other-qr`)
      .then((response) => {
        const imageDataUrl = response.data?.data?.imageDataUrl;
        if (!cancelled && typeof imageDataUrl === 'string') setOtherPaymentQr(imageDataUrl);
        else if (!cancelled) setQrError('No payment QR image is configured for this branch.');
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setQrError(requestError instanceof Error ? requestError.message : 'Could not load the branch payment QR image.');
      });
    return () => { cancelled = true; };
  }, [initialOrder?._id, isOpen, paymentMethod]);

  useEffect(() => {
    const branchId = initialOrder?.branchId;
    setActivePosSessions([]);
    setSelectedPosSessionId('');
    setHasActiveTerminal(false);
    setPosLoadError('');
    if (!branchId) return;

    Promise.all([
      api.get('/pos/terminals', { params: { branchId } }),
      api.get('/pos/sessions', { params: { branchId, limit: 100 } }),
    ]).then(([terminalResponse, sessionResponse]) => {
      const terminals = terminalResponse.data?.data || [];
      const sessions = sessionResponse.data?.data || [];
      setHasActiveTerminal(terminals.some((terminal: { isActive: boolean }) => terminal.isActive));
      const openSessions = sessions.filter((session: PosSessionOption) => session.status === 'OPEN');
      setActivePosSessions(openSessions);
      if (openSessions.length === 1) setSelectedPosSessionId(openSessions[0]._id);
    }).catch((requestError: unknown) => {
      setPosLoadError(requestError instanceof Error ? requestError.message : 'Could not load POS sessions.');
    });
  }, [initialOrder?.branchId]);

  useEffect(() => {
    if (!isOpen || !gatewayCheckout) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const checkStatus = async () => {
      try {
        const response = await api.get(`/payments/gateways/${gatewayCheckout.transactionId}/status`);
        if (cancelled) return;
        const status = response.data?.data?.status;
        if (status === 'COMPLETED') {
          const orderResponse = await api.get(`/orders/${order?._id}`);
          if (cancelled) return;
          const updatedOrder = orderResponse.data?.data;
          setOrder(updatedOrder);
          updateOrder(updatedOrder._id, updatedOrder);
          setGatewayCheckout(null);
          setPaymentNotice('Payment verified successfully. The order is paid.');
          return;
        }
        if (status === 'FAILED' || status === 'EXPIRED') {
          setGatewayCheckout(null);
          setError(`${gatewayCheckout.provider} payment ${status.toLowerCase()}. The order remains unpaid; you can retry checkout.`);
          return;
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? `Payment is not yet verified. Checking again: ${requestError.message}` : 'Payment is not yet verified. Checking again.');
        }
      }
      if (!cancelled) timer = setTimeout(checkStatus, 5000);
    };
    timer = setTimeout(checkStatus, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gatewayCheckout, isOpen, order?._id, updateOrder]);

  if (!isOpen || !order) return null;

  const handleStatusUpdate = async (status: OrderStatus) => {
    setBusy(true);
    setError('');
    try {
      await ensureCsrfToken();
      const response = await api.patch(`/orders/${order._id}/status`, { status });
      setOrder(response.data.data);
      updateOrder(order._id, response.data.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update this order.');
    } finally {
      setBusy(false);
    }
  };

  const handlePayment = async () => {
    let checkoutWindow: Window | null = null;
    if (paymentMethod === 'CARD' || paymentMethod === 'UPI') {
      if (!gatewayProvider || !order.paymentGatewayProviders?.includes(gatewayProvider)) {
        setError('Configure Paytm or PhonePe sandbox credentials for this branch before collecting Debit / Credit Card or UPI payments.');
        return;
      }
      checkoutWindow = window.open('', '_blank');
      if (!checkoutWindow) {
        setError('Allow pop-ups for this site to open secure payment checkout.');
        return;
      }
      checkoutWindow.opener = null;
    }
    if (paymentMethod === 'OTHER' && !otherPaymentQr) {
      setError(qrError || 'The branch payment QR is still loading. Try again in a moment.');
      return;
    }
    if (paymentMethod === 'OTHER' && !window.confirm('Confirm only after you have verified that the customer’s payment was received.')) {
      return;
    }
    setBusy(true);
    setError('');
    setPaymentNotice('');
    try {
      await ensureCsrfToken();
      if (paymentMethod === 'CARD' || paymentMethod === 'UPI') {
        const response = await api.post(`/payments/gateways/orders/${order._id}/start`, {
          provider: gatewayProvider,
          method: paymentMethod,
          ...(selectedPosSessionId ? { posSessionId: selectedPosSessionId } : {}),
        });
        const checkoutUrl = response.data?.data?.checkoutUrl;
        const parsedCheckoutUrl = new URL(checkoutUrl);
        if (parsedCheckoutUrl.protocol !== 'https:' || parsedCheckoutUrl.username || parsedCheckoutUrl.password) {
          throw new Error('The payment provider returned an unsafe checkout URL.');
        }
        checkoutWindow!.location.replace(parsedCheckoutUrl.toString());
        setGatewayCheckout({
          transactionId: response.data.data.transactionId,
          checkoutUrl: parsedCheckoutUrl.toString(),
          provider: gatewayProvider,
        });
        setPaymentNotice(`Secure ${gatewayProvider === 'PAYTM' ? 'Paytm' : 'PhonePe'} checkout opened. The order will be marked paid only after provider verification.`);
        return;
      }
      const response = await api.post(`/payments/orders/${order._id}/pay`, {
        amount: order.grandTotal,
        method: paymentMethod,
        ...(paymentMethod === 'OTHER' && otherPaymentReference.trim()
          ? { transactionReference: otherPaymentReference.trim() }
          : {}),
        ...(selectedPosSessionId ? { posSessionId: selectedPosSessionId } : {}),
      });
      const updatedOrder = response.data.data.order;
      setOrder(updatedOrder);
      updateOrder(order._id, updatedOrder);
      setPaymentNotice('Payment recorded and order updated.');
    } catch (requestError) {
      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
      setError(requestError instanceof Error ? requestError.message : 'Could not record payment.');
    } finally {
      setBusy(false);
    }
  };

  const reopenGatewayCheckout = () => {
    if (!gatewayCheckout) return;
    const checkoutWindow = window.open(gatewayCheckout.checkoutUrl, '_blank', 'noopener,noreferrer');
    if (!checkoutWindow) setError('Allow pop-ups for this site to reopen secure payment checkout.');
  };

  const handlePrintReceipt = () => {
    const receipt = order.receiptSettings || {};
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] || character);
    const tax = order.taxBreakdown || {};
    const lines = [
      receipt.name || order.branchName || 'Restaurant',
      `Order #${order.orderNumber}`,
      new Date(order.createdAt).toLocaleString(),
      `${order.orderType}${order.tableNumber ? ` • Table ${order.tableNumber}` : ''}`,
      '',
      ...order.items.map((item) => `${item.quantity} x ${item.name}  Rs ${Number(item.price * item.quantity).toFixed(2)}`),
      '',
      `Subtotal: Rs ${Number(order.subtotal).toFixed(2)}`,
      ...(order.discountAmount > 0 ? [`Discount: -Rs ${Number(order.discountAmount).toFixed(2)}`] : []),
      ...(tax.cgst ? [`CGST: Rs ${Number(tax.cgst).toFixed(2)}`] : []),
      ...(tax.sgst ? [`SGST: Rs ${Number(tax.sgst).toFixed(2)}`] : []),
      ...(tax.igst ? [`IGST: Rs ${Number(tax.igst).toFixed(2)}`] : []),
      ...(order.serviceChargeAmount ? [`Service charge: Rs ${Number(order.serviceChargeAmount).toFixed(2)}`] : []),
      `TOTAL: Rs ${Number(order.grandTotal).toFixed(2)}`,
      `Payment: ${order.payment?.method || 'UNPAID'}${order.payment?.isPaid ? ' (PAID)' : ''}`,
      ...(receipt.gstin ? [`GSTIN: ${receipt.gstin}`] : []),
      ...(receipt.footer ? [receipt.footer] : []),
    ];
    const copies = Math.min(3, Math.max(1, Number(receipt.copies) || 1));
    const printWindow = window.open('', '_blank', 'width=420,height=720');
    if (!printWindow) {
      setError('The receipt window was blocked. Allow pop-ups for this site and try again.');
      return;
    }
    const content = Array.from({ length: copies }, () => `<pre>${lines.map(escape).join('\n')}</pre>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>Receipt ${escape(order.orderNumber)}</title><style>@page{size:${receipt.paperWidth === '58mm' ? '58mm' : '80mm'} auto;margin:3mm}body{font:12px monospace;color:#111}pre{white-space:pre-wrap;border-bottom:1px dashed #555;padding:0 0 12px;margin:0 0 12px}</style></head><body>${content}<script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Order #{order.orderNumber}
              </h3>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {order.branchName} • {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintReceipt}
              className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Print Thermal Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Dining Mode & Table
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-white mt-1 block">
                {order.orderType === 'DINE_IN'
                  ? `Table ${order.tableNumber || 'N/A'} (${order.sectionName || 'Indoor'})`
                  : order.orderType}
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Waiter & Server
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-white mt-1 block">
                {order.waiterName || 'POS Terminal / Counter'}
              </span>
            </div>

            {order.customerName && (
              <div className="col-span-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Customer Information
                </span>
                <span className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5 block">
                  {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Itemized list */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5" />
              <span>Ordered Items ({order.items.length})</span>
            </h4>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {order.items.map((item, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <span>{item.name}</span>
                      {item.variant && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">
                          {item.variant}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                        Note: {item.notes}
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 block">
                      Status:{' '}
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {item.status}
                      </span>
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-500 font-mono">
                      {item.quantity} × ₹{item.price}
                    </span>
                    <span className="block font-bold text-slate-900 dark:text-white">
                      ₹{item.quantity * item.price}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono">₹{order.subtotal}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{order.taxBreakdown?.taxMode === 'GST' ? 'GST' : 'Tax'}</span>
              <span className="font-mono">₹{order.taxAmount}</span>
            </div>
            {order.taxBreakdown?.cgst ? <div className="flex justify-between text-slate-500"><span>CGST</span><span className="font-mono">₹{order.taxBreakdown.cgst}</span></div> : null}
            {order.taxBreakdown?.sgst ? <div className="flex justify-between text-slate-500"><span>SGST</span><span className="font-mono">₹{order.taxBreakdown.sgst}</span></div> : null}
            {order.taxBreakdown?.igst ? <div className="flex justify-between text-slate-500"><span>IGST</span><span className="font-mono">₹{order.taxBreakdown.igst}</span></div> : null}
            {order.serviceChargeAmount ? <div className="flex justify-between text-slate-500"><span>Service charge</span><span className="font-mono">₹{order.serviceChargeAmount}</span></div> : null}
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Discount Applied</span>
                <span className="font-mono">-₹{order.discountAmount}</span>
              </div>
            )}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between text-sm font-black text-slate-900 dark:text-white">
              <span>Grand Total</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                ₹{order.grandTotal}
              </span>
            </div>
          </div>

          {/* Payment Info */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <h5 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              <span>Payment Information</span>
            </h5>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-slate-400">Method:</span>{' '}
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {order.payment?.method || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Payment Status:</span>{' '}
                <span
                  className={`font-bold ${
                    order.payment?.isPaid ? 'text-emerald-600' : 'text-amber-500'
                  }`}
                >
                  {order.payment?.isPaid ? 'PAID' : 'UNPAID'}
                </span>
              </div>
              {order.payment?.transactionRef && (
                <div className="col-span-2">
                  <span className="text-slate-400">Ref / UPI ID:</span>{' '}
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {order.payment.transactionRef}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
          {paymentNotice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{paymentNotice}</p>}
          {paymentMethod === 'OTHER' && (order.status === 'OPEN' || order.status === 'BILLED') && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              {otherPaymentQr ? (
                <img src={otherPaymentQr} alt={`Other payment QR for order ${order.orderNumber}`} className="h-32 w-32 rounded-lg border border-slate-100 bg-white p-1" />
              ) : (
                <div className="flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <QrCode className="h-8 w-8" />
                  <span className="text-center text-[10px]">{qrError ? 'QR unavailable' : 'No QR configured'}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Scan to pay ₹{Number(order.grandTotal).toFixed(2)}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">Ask the customer to scan the branch QR. Verify that payment reached the branch account before confirming.</p>
                <label className="mt-2 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Payment reference (optional)
                  <input
                    value={otherPaymentReference}
                    onChange={(event) => setOtherPaymentReference(event.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="UTR / receipt reference"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
          {order.status === 'OPEN' && (
            <button
              type="button"
              onClick={() => handleStatusUpdate('BILLED')}
              disabled={busy}
              className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors text-center"
            >
              Generate Bill
            </button>
          )}

          {(order.status === 'OPEN' || order.status === 'BILLED') && (
            <div className="flex flex-1 gap-2">
              <select aria-label="Payment method" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as PaymentMethod); setError(''); setPaymentNotice(''); }} disabled={Boolean(gatewayCheckout)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                {(order.enabledPaymentMethods?.length ? order.enabledPaymentMethods : ['CASH']).map((method) => <option key={method} value={method}>{method === 'CARD' ? 'Debit / Credit Card' : method}</option>)}
              </select>
              {(paymentMethod === 'CARD' || paymentMethod === 'UPI') && order.paymentGatewayProviders?.length ? (
                <select
                  aria-label="Payment provider"
                  value={gatewayProvider}
                  onChange={(event) => setGatewayProvider(event.target.value as 'PAYTM' | 'PHONEPE')}
                  disabled={Boolean(gatewayCheckout)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {order.paymentGatewayProviders.map((provider) => <option key={provider} value={provider}>{provider === 'PAYTM' ? 'Paytm' : 'PhonePe'} · Sandbox</option>)}
                </select>
              ) : null}
              {paymentMethod === 'CASH' && hasActiveTerminal && activePosSessions.length > 0 && (
                <select aria-label="POS cash session" value={selectedPosSessionId} onChange={(event) => setSelectedPosSessionId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Select open session</option>
                  {activePosSessions.map((session) => {
                    const terminal = typeof session.terminalId === 'object' ? session.terminalId : null;
                    return <option key={session._id} value={session._id}>{terminal?.name || terminal?.code || 'POS terminal'}</option>;
                  })}
                </select>
              )}
              <button
                type="button"
                onClick={handlePayment}
                disabled={busy || Boolean(gatewayCheckout) || (paymentMethod === 'CASH' && hasActiveTerminal && activePosSessions.length === 0) || ((paymentMethod === 'CARD' || paymentMethod === 'UPI') && !order.paymentGatewayProviders?.length)}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors text-center"
              >
                {busy ? 'Saving…' : gatewayCheckout ? 'Waiting for payment…' : paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'Open secure checkout' : paymentMethod === 'OTHER' ? `Confirm ₹${Number(order.grandTotal).toFixed(2)} received` : `Collect ₹${Number(order.grandTotal).toFixed(2)}`}
              </button>
            </div>
          )}
          {gatewayCheckout && (
            <p className="text-[11px] text-slate-500">
              Waiting for verified {gatewayCheckout.provider === 'PAYTM' ? 'Paytm' : 'PhonePe'} payment.
              <button type="button" onClick={reopenGatewayCheckout} className="ml-1 font-semibold text-indigo-600 hover:underline">Reopen checkout</button>
            </p>
          )}
          {(paymentMethod === 'CARD' || paymentMethod === 'UPI') && !order.paymentGatewayProviders?.length && (order.status === 'OPEN' || order.status === 'BILLED') && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">Configure Paytm or PhonePe sandbox credentials in this branch’s Integrations settings before accepting online payments.</p>
          )}
          {posLoadError && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{posLoadError} POS session may be required for this branch.</p>}
          {paymentMethod === 'CASH' && hasActiveTerminal && activePosSessions.length === 0 && !posLoadError && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Open a POS cash session before collecting payment.</p>}

          {order.status !== 'CANCELLED' && order.status !== 'PAID' && (
            <button
              type="button"
              onClick={() => handleStatusUpdate('CANCELLED')}
              disabled={busy}
              className="py-2 px-3 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-semibold transition-colors"
            >
              Void Order
            </button>
          )}
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderDetailsDrawer;
