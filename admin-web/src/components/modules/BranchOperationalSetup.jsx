import React, { useEffect, useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';
import api, { ensureCsrfToken } from '../../services/api.js';
import { updateBranchRequest } from '../../services/branch.api.js';
import { getCurrentBranchLocation } from '../../utils/geolocation.js';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
const buttonClass = 'rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const dataOf = (response) => response.data?.data;

const BranchOperationalSetup = ({ branch, canUpdate, onRefresh, onNavigate }) => {
  const branchId = branch.id || branch._id;
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [openingStock, setOpeningStock] = useState(null);
  const [terminals, setTerminals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [testOrder, setTestOrder] = useState(null);
  const [counts, setCounts] = useState([]);
  const [branchLocation, setBranchLocation] = useState({
    addressLine1: branch.addressLine1 || '',
    city: branch.city || '',
    stateOrProvince: branch.stateOrProvince || '',
    postalCode: branch.postalCode || '',
    countryCode: branch.countryCode || '',
  });
  const [locationForm, setLocationForm] = useState({ name: '', code: '', kind: 'WAREHOUSE' });
  const [ingredientForm, setIngredientForm] = useState({ name: '', sku: '', category: 'GROCERY', unit: 'KG', costPerUnit: '0' });
  const [terminalForm, setTerminalForm] = useState({
    name: 'Front counter',
    code: 'COUNTER-1',
    deviceType: 'COUNTER',
    receiptPrinterName: '',
    paperWidth: '80mm',
  });
  const [editingTerminalId, setEditingTerminalId] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [testMenuItemId, setTestMenuItemId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setBranchLocation({
      addressLine1: branch.addressLine1 || '',
      city: branch.city || '',
      stateOrProvince: branch.stateOrProvince || '',
      postalCode: branch.postalCode || '',
      countryCode: branch.countryCode || '',
    });
  }, [branch.addressLine1, branch.city, branch.stateOrProvince, branch.postalCode, branch.countryCode]);

  const load = async () => {
    const params = { branchId, limit: 100 };
    const requests = await Promise.allSettled([
      api.get('/inventory', { params }),
      api.get('/inventory/locations', { params }),
      api.get('/inventory/opening-stock', { params }),
      api.get('/pos/terminals', { params }),
      api.get('/pos/sessions', { params }),
      api.get('/menu/items', { params: { ...params, status: 'ACTIVE', availability: true } }),
      api.get('/tables', { params }),
      api.get('/orders', { params }),
      api.get('/orders/kots', { params }),
    ]);
    const failures = [];
    const read = (index, label) => {
      const result = requests[index];
      if (result.status === 'rejected') {
        failures.push(`${label}: ${result.reason instanceof Error ? result.reason.message : 'request failed'}`);
        return null;
      }
      return dataOf(result.value);
    };
    const inventoryData = read(0, 'Inventory');
    const locationData = read(1, 'Locations');
    const openingData = read(2, 'Opening stock');
    const terminalData = read(3, 'POS terminals');
    const sessionData = read(4, 'Cash sessions');
    const menuData = read(5, 'Menu');
    const tableData = read(6, 'Tables');
    const orderData = read(7, 'Orders');
    const kotData = read(8, 'Kitchen tickets');

    const items = inventoryData?.items || [];
    const activeLocations = locationData || [];
    setInventory(items);
    setLocations(activeLocations);
    setOpeningStock(openingData);
    setTerminals(terminalData || []);
    setSessions(sessionData || []);
    setMenuItems(menuData?.items || []);
    setTables(tableData || []);
    const pendingTest = (orderData?.orders || []).find((order) => order.setupTest && order.status !== 'CANCELLED');
    setTestOrder(pendingTest ? {
      ...pendingTest,
      kot: (kotData || []).find((kot) => String(kot.orderId?._id || kot.orderId) === String(pendingTest._id)) || null,
    } : null);
    const defaultLocation = activeLocations.find((location) => location.isDefault && location.isActive) || activeLocations.find((location) => location.isActive);
    const savedCounts = ['DRAFT', 'POSTING'].includes(openingData?.status)
      ? (openingData.lines || []).map((line) => ({
        ingredientId: String(line.ingredientId?._id || line.ingredientId),
        locationId: String(line.locationId?._id || line.locationId),
        quantity: String(line.quantity),
      }))
      : [];
    setCounts(items.map((item) => {
      const match = savedCounts.find((line) => line.ingredientId === String(item._id));
      const line = match || {
        ingredientId: String(item._id),
        locationId: defaultLocation ? String(defaultLocation._id) : '',
        quantity: String(item.currentStock || 0),
      };
      return { ...line };
    }));
    setError(failures.length ? `Some setup data could not load. ${failures.join(' ')}` : '');
  };

  useEffect(() => { load(); }, [branchId]);

  const completeAction = async (key, action, successMessage) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await ensureCsrfToken();
      const result = await action();
      setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      await load();
      await onRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to complete this setup action.');
    } finally {
      setBusy('');
    }
  };

  const createInventoryItem = (event) => {
    event.preventDefault();
    return completeAction('ingredient', async () => {
      await api.post('/inventory', { ...ingredientForm, branchId, costPerUnit: Number(ingredientForm.costPerUnit) });
      setIngredientForm({ name: '', sku: '', category: 'GROCERY', unit: 'KG', costPerUnit: '0' });
    }, 'Inventory item created.');
  };

  const createLocation = (event) => {
    event.preventDefault();
    return completeAction('location', async () => {
      await api.post('/inventory/locations', {
        ...locationForm,
        branchId,
        isDefault: !locations.some((location) => location.isDefault && location.isActive),
      });
      setLocationForm({ name: '', code: '', kind: 'WAREHOUSE' });
    }, 'Inventory location created.');
  };

  const detectBranchLocation = () => completeAction('gps-location', async () => {
    const { addressLookupError, ...location } = await getCurrentBranchLocation();
    const address = {
      addressLine1: location.addressLine1 || branchLocation.addressLine1,
      city: location.city || branchLocation.city,
      stateOrProvince: location.stateOrProvince || branchLocation.stateOrProvince,
      postalCode: location.postalCode || branchLocation.postalCode,
      countryCode: location.countryCode || branchLocation.countryCode,
    };
    const response = await updateBranchRequest(branchId, {
      revision: branch.revision,
      ...location,
      ...address,
    });
    setBranchLocation(address);
    if (!response.branch) throw new Error('The branch location could not be saved.');
    return { addressLookupError };
  }, ({ addressLookupError }) => addressLookupError
    ? `GPS coordinates saved. ${addressLookupError}`
    : 'Branch GPS location and address detected and saved.');

  const saveOpeningStock = (event) => {
    event.preventDefault();
    return completeAction('opening-stock', async () => {
      if (openingStock?.status === 'POSTING') {
        await api.post('/inventory/opening-stock/post', { branchId });
        return;
      }
      if (!counts.length) throw new Error('Create inventory items before reviewing opening stock.');
      if (counts.some((line) => !line.locationId)) throw new Error('Assign every counted item to an active stock location.');
      const draft = await api.put('/inventory/opening-stock', {
        branchId,
        lines: counts.map((line) => ({
          ingredientId: line.ingredientId,
          locationId: line.locationId,
          quantity: Number(line.quantity),
        })),
      });
      if (dataOf(draft)?.status !== 'POSTED') {
        await api.post('/inventory/opening-stock/post', { branchId });
      }
    }, 'Opening stock reviewed and posted.');
  };

  const createTerminal = (event) => {
    event.preventDefault();
    return completeAction('terminal', async () => {
      if (editingTerminalId) {
        await api.patch(`/pos/terminals/${editingTerminalId}`, {
          name: terminalForm.name,
          deviceType: terminalForm.deviceType,
          receiptPrinterName: terminalForm.receiptPrinterName,
          paperWidth: terminalForm.paperWidth,
        });
      } else {
        await api.post('/pos/terminals', { ...terminalForm, branchId });
      }
      setEditingTerminalId('');
      setTerminalForm({ name: '', code: '', deviceType: 'COUNTER', receiptPrinterName: '', paperWidth: '80mm' });
    }, editingTerminalId ? 'POS terminal updated.' : 'POS terminal configured.');
  };

  const editTerminal = (terminal) => {
    setEditingTerminalId(String(terminal._id));
    setTerminalForm({
      name: terminal.name || '',
      code: terminal.code || '',
      deviceType: terminal.deviceType || 'COUNTER',
      receiptPrinterName: terminal.receiptPrinterName || '',
      paperWidth: terminal.paperWidth || '80mm',
    });
    setError('');
    setNotice('');
  };

  const cancelTerminalEdit = () => {
    setEditingTerminalId('');
    setTerminalForm({ name: '', code: '', deviceType: 'COUNTER', receiptPrinterName: '', paperWidth: '80mm' });
  };

  const setTerminalActive = (terminal) => completeAction(
    `terminal-status-${terminal._id}`,
    () => api.patch(`/pos/terminals/${terminal._id}`, { isActive: !terminal.isActive }),
    `Terminal ${terminal.isActive ? 'deactivated' : 'activated'}.`
  );

  const openSession = (event, terminal) => {
    event.preventDefault();
    return completeAction('session', async () => {
      await api.post(`/pos/terminals/${terminal._id}/sessions`, { branchId, openingCash: Number(openingCash) });
    }, 'Cash session opened.');
  };

  const closeSession = (session) => completeAction(`close-${session._id}`, async () => {
    await api.post(`/pos/sessions/${session._id}/close`, { branchId, closingCash: Number(closingCash) });
  }, 'Cash session closed and reconciled.');

  const runTestOrder = () => completeAction('test-order', async () => {
    let order = testOrder;
    let kot = testOrder?.kot;
    if (!order) {
      const channels = branch.moduleSettings?.menuPublication?.channels || [];
      const orderType = channels.includes('dine_in')
        ? 'DINE_IN'
        : channels.includes('takeaway') ? 'TAKEAWAY' : channels.includes('delivery') ? 'DELIVERY' : null;
      if (!orderType) throw new Error('Publish the branch menu and enable at least one order channel first.');
      const selectedItem = menuItems.find((item) => String(item._id) === testMenuItemId) || menuItems[0];
      if (!selectedItem) throw new Error('Add and publish an available menu item before creating a test order.');
      const table = orderType === 'DINE_IN'
        ? tables.find((item) => item.isActive && ['AVAILABLE', 'RESERVED'].includes(item.status) && !item.activeOrderId)
        : null;
      if (orderType === 'DINE_IN' && !table) throw new Error('Create an available dining table before testing a dine-in order.');
      const response = await api.post('/orders', {
        branchId,
        setupTest: true,
        orderType,
        ...(table ? { tableId: table._id } : {}),
        placeOfSupplyStateCode: branch.moduleSettings?.taxConfiguration?.stateCode,
        items: [{ menuItemId: selectedItem._id, quantity: 1 }],
      });
      order = dataOf(response).order;
      kot = dataOf(response).kot;
      setTestOrder({ ...order, kot });
    }
    if (!kot) {
      const response = await api.get('/orders/kots', { params: { branchId } });
      kot = (dataOf(response) || []).find((item) => String(item.orderId?._id || item.orderId) === String(order._id));
    }
    if (!kot) throw new Error('The test order exists, but its kitchen ticket could not be found.');
    if (kot.status === 'PENDING') {
      const preparing = await api.patch(`/orders/kots/${kot._id}/status`, { status: 'PREPARING' });
      kot = dataOf(preparing);
      setTestOrder({ ...order, kot });
    }
    if (kot.status === 'PREPARING') {
      const ready = await api.patch(`/orders/kots/${kot._id}/status`, { status: 'READY' });
      kot = dataOf(ready);
      setTestOrder({ ...order, kot });
    }
    if (order.status !== 'PAID') {
      const method = branch.moduleSettings?.paymentConfiguration?.enabledMethods?.[0] || 'CASH';
      const session = sessions.find((item) => item.status === 'OPEN');
      if (method === 'CASH' && !session) throw new Error('Open a POS cash session before collecting the test order payment.');
      const payment = await api.post(`/payments/orders/${order._id}/pay`, {
        amount: order.grandTotal,
        method,
        ...(session ? { posSessionId: session._id } : {}),
      });
      order = dataOf(payment).order;
      setTestOrder({ ...order, kot });
    }
  }, 'Test order completed: kitchen ticket ready and full payment recorded.');

  const activeTerminals = terminals.filter((terminal) => terminal.isActive);
  const sessionForTerminal = (terminalId) => sessions.find((session) => (
    session.status === 'OPEN'
    && String(session.terminalId?._id || session.terminalId) === String(terminalId)
  ));
  const options = [
    ['DAIRY', 'Dairy'], ['MEAT', 'Meat'], ['PRODUCE', 'Produce'], ['GROCERY', 'Grocery'],
    ['BEVERAGES', 'Beverages'], ['SPICES', 'Spices'], ['PACKAGING', 'Packaging'],
  ];
  const units = ['KG', 'GRAM', 'GRAMS', 'LITRE', 'LITRES', 'ML', 'PIECE', 'PIECES', 'PACK', 'BOX'];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Branch operational setup</h2>
        <p className="mt-1 text-xs text-slate-500">Create the required operational records here, then review recipes and dining tables in their workspaces.</p>
      </div>
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <button type="button" disabled={!canUpdate || Boolean(busy)} onClick={detectBranchLocation} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {busy === 'gps-location' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {busy === 'gps-location' ? 'Detecting location…' : 'Detect branch location'}
        </button>
        {branch.latitude != null && branch.longitude != null
          ? <span className="text-xs text-slate-500">Saved: {[branch.addressLine1, branch.city, branch.stateOrProvince, branch.postalCode].filter(Boolean).join(', ')} · GPS {Number(branch.latitude).toFixed(6)}, {Number(branch.longitude).toFixed(6)}</span>
          : <span className="text-xs text-slate-500">Allow browser location access to fill the branch address and GPS coordinates automatically.</span>}
      </div>
      <p className="text-xs text-slate-500">Address lookup uses OpenStreetMap; your coordinates are sent to its Nominatim service to resolve the address.</p>

      <div className="grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['addressLine1', 'Street address'],
          ['city', 'City'],
          ['stateOrProvince', 'State / province'],
          ['postalCode', 'Postal code'],
          ['countryCode', 'Country code'],
        ].map(([key, label]) => (
          <label key={key} className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {label}
            <input
              className={inputClass}
              value={branchLocation[key]}
              disabled={!canUpdate || Boolean(busy)}
              onChange={(event) => setBranchLocation((current) => ({
                ...current,
                [key]: key === 'countryCode' ? event.target.value.toUpperCase() : event.target.value,
              }))}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={!canUpdate || Boolean(busy)}
          onClick={() => completeAction('branch-address', async () => {
            await updateBranchRequest(branchId, { revision: branch.revision, ...branchLocation });
          }, 'Branch address saved.')}
          className={`${buttonClass} self-end`}
        >
          {busy === 'branch-address' ? 'Saving…' : 'Save address'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={createLocation} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="text-sm font-bold">Inventory locations</h3>
          <p className="text-xs text-slate-500">{locations.filter((item) => item.isActive).length} active location(s)</p>
          <div className="grid grid-cols-2 gap-2">
            <input required maxLength="80" className={inputClass} placeholder="Location name" value={locationForm.name} onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} />
            <input required maxLength="30" className={inputClass} placeholder="Code" value={locationForm.code} onChange={(event) => setLocationForm({ ...locationForm, code: event.target.value })} />
          </div>
          <select className={inputClass} value={locationForm.kind} onChange={(event) => setLocationForm({ ...locationForm, kind: event.target.value })}>
            <option value="WAREHOUSE">Warehouse</option><option value="KITCHEN">Kitchen</option><option value="BAR">Bar</option><option value="OTHER">Other</option>
          </select>
          <button className={buttonClass} disabled={Boolean(busy)}>{busy === 'location' ? 'Saving…' : 'Add location'}</button>
          {locations.length > 0 && <p className="text-[11px] text-slate-500">Default: {locations.find((item) => item.isDefault && item.isActive)?.name || 'Not set'}</p>}
        </form>

        <form onSubmit={createInventoryItem} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="text-sm font-bold">Inventory items</h3>
          <p className="text-xs text-slate-500">{inventory.length} branch item(s)</p>
          <div className="grid grid-cols-2 gap-2">
            <input required maxLength="120" className={inputClass} placeholder="Item name" value={ingredientForm.name} onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })} />
            <input required maxLength="40" className={inputClass} placeholder="SKU" value={ingredientForm.sku} onChange={(event) => setIngredientForm({ ...ingredientForm, sku: event.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select className={inputClass} value={ingredientForm.category} onChange={(event) => setIngredientForm({ ...ingredientForm, category: event.target.value })}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select className={inputClass} value={ingredientForm.unit} onChange={(event) => setIngredientForm({ ...ingredientForm, unit: event.target.value })}>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
            <input type="number" min="0" step="0.01" className={inputClass} aria-label="Cost per unit" value={ingredientForm.costPerUnit} onChange={(event) => setIngredientForm({ ...ingredientForm, costPerUnit: event.target.value })} />
          </div>
          <button className={buttonClass} disabled={Boolean(busy)}>{busy === 'ingredient' ? 'Saving…' : 'Add inventory item'}</button>
        </form>
      </div>

      <form onSubmit={saveOpeningStock} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-bold">Opening stock review</h3><p className="text-xs text-slate-500">{openingStock?.status === 'POSTED' ? 'Posted' : `${inventory.length} item(s) to count`}</p></div>
          {openingStock?.status !== 'POSTED' && <button disabled={Boolean(busy) || inventory.length === 0 || locations.length === 0} className={buttonClass}>{busy === 'opening-stock' ? 'Posting…' : openingStock?.status === 'POSTING' ? 'Retry posting' : 'Review and post opening stock'}</button>}
        </div>
        {openingStock?.status === 'POSTED'
          ? <p className="text-xs text-emerald-700">Opening counts have been posted and recorded in the stock ledger.</p>
          : inventory.length === 0
            ? <p className="text-xs text-amber-700">Add inventory items before posting an opening count.</p>
            : locations.length === 0
              ? <p className="text-xs text-amber-700">Create an active location before counting opening stock.</p>
              : <div className="max-h-56 space-y-2 overflow-auto">{counts.map((line, index) => {
                const item = inventory.find((entry) => String(entry._id) === line.ingredientId);
                return <div key={line.ingredientId} className="grid grid-cols-[1fr_1fr_8rem] gap-2">
                  <span className="self-center text-xs">{item?.name} · {item?.unit}</span>
                  <select required className={inputClass} value={line.locationId} onChange={(event) => setCounts((previous) => previous.map((entry, position) => position === index ? { ...entry, locationId: event.target.value } : entry))}>
                    <option value="">Select location</option>{locations.filter((location) => location.isActive).map((location) => <option key={location._id} value={location._id}>{location.name}</option>)}
                  </select>
                  <input required type="number" min="0" step="0.001" className={inputClass} aria-label={`Opening quantity for ${item?.name}`} value={line.quantity} onChange={(event) => setCounts((previous) => previous.map((entry, position) => position === index ? { ...entry, quantity: event.target.value } : entry))} />
                </div>;
              })}</div>}
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-bold">POS terminals and cash sessions</h3>
            <p className="text-xs text-slate-500">{activeTerminals.length} active terminal(s) · {sessions.filter((session) => session.status === 'OPEN').length} open cash session(s)</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Printer labels and paper widths are saved per terminal. This Admin Web setup records and reconciles cash sessions; physical cash-drawer triggering requires the Desktop POS hardware integration.</p>
          </div>
          <form onSubmit={createTerminal} className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <p className="text-xs font-semibold">{editingTerminalId ? 'Update terminal settings' : 'Configure a POS terminal'}</p>
            <div className="grid grid-cols-2 gap-2">
              <input required maxLength="80" disabled={!canUpdate || Boolean(busy)} className={inputClass} placeholder="Terminal name" value={terminalForm.name} onChange={(event) => setTerminalForm({ ...terminalForm, name: event.target.value })} />
              <input required maxLength="30" disabled={!canUpdate || Boolean(editingTerminalId) || Boolean(busy)} className={inputClass} placeholder="Terminal code" value={terminalForm.code} onChange={(event) => setTerminalForm({ ...terminalForm, code: event.target.value.toUpperCase() })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select disabled={!canUpdate || Boolean(busy)} className={inputClass} value={terminalForm.deviceType} onChange={(event) => setTerminalForm({ ...terminalForm, deviceType: event.target.value })}><option value="COUNTER">Counter</option><option value="TABLET">Tablet</option><option value="KIOSK">Kiosk</option></select>
              <select disabled={!canUpdate || Boolean(busy)} className={inputClass} value={terminalForm.paperWidth} onChange={(event) => setTerminalForm({ ...terminalForm, paperWidth: event.target.value })}><option value="80mm">80mm receipt</option><option value="58mm">58mm receipt</option></select>
            </div>
            <input maxLength="100" disabled={!canUpdate || Boolean(busy)} className={inputClass} placeholder="Receipt printer name (optional)" value={terminalForm.receiptPrinterName} onChange={(event) => setTerminalForm({ ...terminalForm, receiptPrinterName: event.target.value })} />
            <div className="flex flex-wrap gap-2">
              {canUpdate && <button className={buttonClass} disabled={Boolean(busy)}>{busy === 'terminal' ? 'Saving…' : editingTerminalId ? 'Save terminal' : 'Add terminal'}</button>}
              {editingTerminalId && <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-600 dark:text-slate-200" onClick={cancelTerminalEdit}>Cancel</button>}
            </div>
          </form>
          {terminals.length > 0 ? (
            <div className="space-y-2">
              {terminals.map((terminal) => {
                const session = sessionForTerminal(terminal._id);
                return (
                  <div key={terminal._id} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold">{terminal.name} <span className="font-mono text-slate-500">({terminal.code})</span></p>
                        <p className="text-[11px] text-slate-500">{terminal.deviceType} · {terminal.paperWidth} · {terminal.receiptPrinterName || 'No printer selected'} · {terminal.isActive ? 'Active' : 'Inactive'}</p>
                      </div>
                      {canUpdate && <div className="flex gap-3">
                        <button type="button" disabled={Boolean(busy)} className="text-xs font-semibold text-indigo-600 disabled:opacity-50" onClick={() => editTerminal(terminal)}>Edit</button>
                        <button type="button" disabled={Boolean(busy) || Boolean(session)} className="text-xs font-semibold text-rose-600 disabled:opacity-50" onClick={() => setTerminalActive(terminal)}>{terminal.isActive ? 'Deactivate' : 'Activate'}</button>
                      </div>}
                    </div>
                    {!terminal.isActive ? (
                      <p className="text-[11px] text-amber-700">This terminal is inactive. Enable it in terminal settings before taking payments.</p>
                    ) : session ? (
                      <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-xs font-semibold">Cash session open · Opening float ₹{Number(session.openingCash).toLocaleString()}</p>
                        <div className="flex flex-wrap gap-2">
                          <input type="number" min="0" step="0.01" disabled={!canUpdate || Boolean(busy)} className={`${inputClass} min-w-40 flex-1`} aria-label={`Counted closing cash for ${terminal.name}`} placeholder="Counted closing cash" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} />
                          {canUpdate && <button type="button" className={buttonClass} disabled={Boolean(busy) || closingCash === ''} onClick={() => closeSession(session)}>{busy === `close-${session._id}` ? 'Closing…' : 'Close and reconcile'}</button>}
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={(event) => openSession(event, terminal)} className="flex flex-wrap gap-2">
                        <label className="flex min-w-40 flex-1 items-center gap-2 text-xs text-slate-500">Opening cash ₹
                        <input type="number" required min="0" step="0.01" disabled={!canUpdate || Boolean(busy)} className={inputClass} aria-label={`Opening cash for ${terminal.name}`} value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} />
                        </label>
                        {canUpdate && <button className={buttonClass} disabled={Boolean(busy)}>{busy === 'session' ? 'Opening…' : 'Open cash session'}</button>}
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <p className="text-xs text-slate-500">No terminals configured yet. Add one above to enable POS cash sessions.</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div><h3 className="text-sm font-bold">End-to-end test order</h3><p className="text-xs text-slate-500">Creates a marked order, sends its KOT through preparation, and records full payment.</p></div>
          {testOrder?.status === 'PAID' && ['READY', 'SERVED'].includes(testOrder.kot?.status)
            ? <p className="text-xs text-emerald-700">Verified order {testOrder.orderNumber}: paid and kitchen ticket {testOrder.kot.status.toLowerCase()}.</p>
            : <>
              <select className={inputClass} value={testMenuItemId} onChange={(event) => setTestMenuItemId(event.target.value)}>
                <option value="">Select an available menu item</option>{menuItems.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.price}</option>)}
              </select>
              {testOrder && <p className="text-xs text-amber-700">Continuing {testOrder.orderNumber}; complete its kitchen and payment steps.</p>}
              <button type="button" className={buttonClass} disabled={Boolean(busy) || menuItems.length === 0} onClick={runTestOrder}>{busy === 'test-order' ? 'Running test…' : testOrder ? 'Continue test order' : 'Run test order'}</button>
            </>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => onNavigate(`/admin/branches/${branchId}?tab=configuration`)}>Configure tax, payment and receipt settings</button>
        <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => onNavigate('/admin/recipes')}>Review recipes</button>
        <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => onNavigate('/admin/floor')}>Review dining tables</button>
      </div>
    </section>
  );
};

export default BranchOperationalSetup;
