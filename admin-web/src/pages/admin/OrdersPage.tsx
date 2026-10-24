import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  DollarSign,
  Receipt,
  Printer,
  Plus,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { Order, OrderType } from '../../types/index.ts';
import StatusBadge from '../../components/common/StatusBadge.tsx';
import api, { ensureCsrfToken } from '../../services/api.js';

interface OrdersPageProps {
  onSelectOrder: (order: Order) => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ onSelectOrder }) => {
  const { orders, kots, activeBranchId, activeBranch, menuItems, setOrders, setKots } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [draftItems, setDraftItems] = useState<{ menuItemId: string; quantity: number }[]>([]);
  const availableMenuItems = menuItems.filter((item) => item.isAvailable && item.isAvailablePOS);

  const addDraftItem = () => {
    if (!selectedItemId || quantity < 1) return;
    setDraftItems((current) => {
      const existing = current.find((item) => item.menuItemId === selectedItemId);
      if (existing) return current.map((item) => item.menuItemId === selectedItemId ? { ...item, quantity: item.quantity + quantity } : item);
      return [...current, { menuItemId: selectedItemId, quantity }];
    });
    setQuantity(1);
  };

  const createOrder = async () => {
    if (!activeBranchId || !draftItems.length) return;
    setSubmitting(true);
    setCreateError('');
    try {
      await ensureCsrfToken();
      const response = await api.post('/orders', {
        branchId: activeBranchId,
        orderType,
        items: draftItems,
        ...(orderType === 'DELIVERY' && placeOfSupplyStateCode ? { placeOfSupplyStateCode } : {}),
      });
      const created = response.data.data;
      const branchName = activeBranch?.name || '';
      const newOrder = {
        ...created.order,
        _id: String(created.order._id),
        branchId: activeBranchId,
        branchName,
        customerName: created.order.customerName || '',
        customerPhone: created.order.customerPhone || '',
      } as Order;
      setOrders([newOrder, ...orders]);
      if (created.kot) {
        setKots([{
          ...created.kot,
          _id: String(created.kot._id),
          branchId: activeBranchId,
          branchName,
          orderNumber: newOrder.orderNumber,
          elapsedMinutes: 0,
        }, ...kots]);
      }
      setDraftItems([]);
      setCreating(false);
      setOrderType('DINE_IN');
      setPlaceOfSupplyStateCode('');
      onSelectOrder(newOrder);
    } catch (requestError) {
      setCreateError(requestError instanceof Error ? requestError.message : 'Unable to create this order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchBranch = !activeBranchId || o.branchId === activeBranchId;
      const matchStatus = selectedStatus === 'ALL' || o.status === selectedStatus;
      const matchType = selectedType === 'ALL' || o.orderType === selectedType;
      const matchSearch =
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.customerName && o.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.customerPhone && o.customerPhone.includes(searchQuery));

      return matchBranch && matchStatus && matchType && matchSearch;
    });
  }, [orders, activeBranchId, selectedStatus, selectedType, searchQuery]);

  // Aggregate metrics
  const totalOrdersCount = filteredOrders.length;
  const openOrdersCount = filteredOrders.filter((o) => o.status === 'OPEN').length;
  const billedOrdersCount = filteredOrders.filter((o) => o.status === 'BILLED').length;
  const collectedRevenue = filteredOrders.reduce(
    (sum, o) => sum + (o.status === 'PAID' ? o.grandTotal : 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-indigo-600" />
            <span>Orders & Point-of-Sale Audit</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time feed of dine-in, takeaway, and online delivery tickets across restaurant counters.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreating((open) => !open); setCreateError(''); }}
          disabled={!activeBranchId}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Close order form' : 'New order'}
        </button>
      </div>

      {creating && (
        <section className="space-y-4 rounded-2xl border border-indigo-100 bg-white p-4 dark:border-indigo-950 dark:bg-slate-900">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Order type
              <select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <option value="DINE_IN">Dine in</option>
                <option value="TAKEAWAY">Takeaway</option>
                <option value="DELIVERY">Delivery</option>
              </select>
            </label>
            <label className="min-w-52 flex-[2] text-xs font-semibold text-slate-600 dark:text-slate-300">
              Available menu item
              <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <option value="">Select a published item</option>
                {availableMenuItems.map((item) => <option key={item._id} value={item._id}>{item.name} · ₹{item.price}</option>)}
              </select>
            </label>
            <label className="w-24 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Quantity
              <input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <button type="button" onClick={addDraftItem} disabled={!selectedItemId} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900 dark:text-indigo-300">
              Add item
            </button>
          </div>
          {orderType === 'DELIVERY' && (
            <label className="block max-w-xs text-xs font-semibold text-slate-600 dark:text-slate-300">
              Delivery destination GST state code (2 digits)
              <input inputMode="numeric" maxLength={2} value={placeOfSupplyStateCode} onChange={(event) => setPlaceOfSupplyStateCode(event.target.value.replace(/\D/g, '').slice(0, 2))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
            </label>
          )}
          {draftItems.length > 0 && (
            <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {draftItems.map((line) => {
                const item = menuItems.find((candidate) => candidate._id === line.menuItemId);
                return <li key={line.menuItemId} className="flex items-center justify-between py-2"><span>{item?.name || 'Menu item'} × {line.quantity}</span><span className="font-semibold">₹{((item?.price || 0) * line.quantity).toFixed(2)}</span><button type="button" onClick={() => setDraftItems((current) => current.filter((draft) => draft.menuItemId !== line.menuItemId))} aria-label={`Remove ${item?.name || 'item'}`} className="px-2 text-rose-600">Remove</button></li>;
              })}
            </ul>
          )}
          {createError && <p role="alert" className="text-xs text-rose-600">{createError}</p>}
          <div className="flex items-center justify-between gap-3">
            {availableMenuItems.length === 0 && <p className="text-xs text-amber-700">No available POS menu items. Add an active item and publish the menu for this branch first.</p>}
            <button type="button" onClick={createOrder} disabled={submitting || !activeBranchId || !draftItems.length} className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create order & kitchen ticket'}
            </button>
          </div>
        </section>
      )}

      {/* KPI Header Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Orders
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalOrdersCount}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Open / In Progress
          </span>
          <span className="text-xl font-black text-amber-500 mt-1 block">
            {openOrdersCount}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Billed (Awaiting Pay)
          </span>
          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            {billedOrdersCount}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Settled Revenue
          </span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            ₹{collectedRevenue.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, customer name, phone..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="BILLED">Billed</option>
            <option value="PAID">Paid / Settled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Dining Modes</option>
            <option value="DINE_IN">Dine-In</option>
            <option value="TAKEAWAY">Takeaway</option>
            <option value="DELIVERY">Delivery</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Dining Mode / Table</th>
                <th className="py-3 px-4">Customer / Waiter</th>
                <th className="py-3 px-4">Items Count</th>
                <th className="py-3 px-4">Grand Total</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredOrders.map((order) => (
                <tr
                  key={order._id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-slate-900 dark:text-white block">
                      #{order.orderNumber}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                    {order.branchName}
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      {order.orderType === 'DINE_IN'
                        ? `Table ${order.tableNumber || 'N/A'}`
                        : order.orderType}
                    </span>
                    {order.sectionName && (
                      <span className="text-[10px] text-slate-400">{order.sectionName}</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-slate-500">
                    <div>{order.customerName || 'Walk-in Guest'}</div>
                    <div className="text-[10px] text-slate-400">Server: {order.waiterName || 'Counter'}</div>
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                    {order.items.reduce((acc, it) => acc + it.quantity, 0)} Items
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                    ₹{order.grandTotal}
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {order.payment.method} ({order.payment.isPaid ? 'Paid' : 'Unpaid'})
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <StatusBadge status={order.status} />
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectOrder(order)}
                      className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-colors"
                    >
                      Inspect Sheet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
