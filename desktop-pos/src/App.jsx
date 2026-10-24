import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { searchTextMatches } from './menu-search.js';

const api = window.rmsPos;
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(Number(value) || 0);
const errorMessage = (error) => (error?.message || 'The request failed.')
  .replace(/^Error invoking remote method '[^']+':\s*Error:\s*/i, '')
  .replace(/^Error:\s*/i, '');
const usesUnencryptedRemoteHttp = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
};
const orderChannelLabel = (orderType) => ({
  TAKEAWAY: 'Takeaway',
  DINE_IN: 'Dine-in',
  DELIVERY: 'Delivery',
}[orderType] || 'this order type');
const posOrderErrorMessage = (error, orderType) => {
  const message = errorMessage(error);
  if (/Publish the branch menu before accepting orders/i.test(message)) {
    return 'Orders are paused because this branch menu is unpublished. In Admin → Branch → Module setup → Menu publication, publish the menu, enable Takeaway, Dine-in, and Delivery, then save and sync this POS.';
  }
  if (/This order type is not enabled for the branch menu/i.test(message)) {
    return `${orderChannelLabel(orderType)} is not enabled for this branch menu. In Admin → Branch → Module setup → Menu publication, enable ${orderChannelLabel(orderType)} and save, then sync this POS.`;
  }
  return message;
};
const posPaymentErrorMessage = (error) => {
  const message = errorMessage(error);
  if (/payments are disabled for this branch/i.test(message)) {
    return `${message} Enable this method in Admin → Branch → Module setup → Accepted payment methods, save, then sync this POS.`;
  }
  if (/open POS cash session/i.test(message) || /open cash session for this branch is required/i.test(message)) {
    return 'An open cash session is required before recording payment. Open Cash sessions from the POS sidebar, start a session for the active terminal, then retry payment.';
  }
  return message;
};
const indianGstStateCodes = {
  'andaman and nicobar islands': '35',
  'andhra pradesh': '37',
  'arunachal pradesh': '12',
  assam: '18',
  bihar: '10',
  chandigarh: '04',
  chhattisgarh: '22',
  'dadra and nagar haveli and daman and diu': '26',
  delhi: '07',
  goa: '30',
  gujarat: '24',
  haryana: '06',
  'himachal pradesh': '02',
  'jammu and kashmir': '01',
  jharkhand: '20',
  karnataka: '29',
  kerala: '32',
  ladakh: '38',
  lakshadweep: '31',
  'madhya pradesh': '23',
  maharashtra: '27',
  manipur: '14',
  meghalaya: '17',
  mizoram: '15',
  nagaland: '13',
  odisha: '21',
  puducherry: '34',
  punjab: '03',
  rajasthan: '08',
  sikkim: '11',
  'tamil nadu': '33',
  telangana: '36',
  tripura: '16',
  'uttar pradesh': '09',
  uttarakhand: '05',
  'west bengal': '19',
};
const NavigationIcon = ({ name }) => {
  const icons = {
    brand: <><path d="M5 12h14v8H5z" /><path d="M3 12l9-8 9 8M9 20v-5h6v5" /></>,
    sale: <><path d="M4 5h16v15H4z" /><path d="M8 9h3v3H8zM14 9h3M14 13h3M8 16h9" /></>,
    orders: <><path d="M6 4h12v17l-6-3-6 3z" /><path d="M9 9h6M9 13h6" /></>,
    billing: <><path d="M4 6h16v14H4z" /><path d="M8 10h8M8 14h5" /></>,
    invoices: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></>,
    items: <><path d="M4 7h16v13H4z" /><path d="M4 10h16M8 4h8M8 14h3" /></>,
    sessions: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    reports: <><path d="M4 20V11M10 20V5M16 20v-8M22 20H2" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 0 0 0-6M18 14a5 5 0 0 1 3 5" /></>,
    sync: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.5-2L20 12M4 12l2.9 5a7 7 0 0 0 11.5-2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5l1.2.9-1.2 2.1-1.5-.5a7 7 0 0 1-1.8 1l-.3 1.6h-2.5l-.3-1.6a7 7 0 0 1-1.8-1l-1.5.5-1.2-2.1 1.2-.9a7 7 0 0 1 0-2l-1.2-.9 1.2-2.1 1.5.5a7 7 0 0 1 1.8-1l.3-1.6h2.5l.3 1.6a7 7 0 0 1 1.8 1l1.5-.5 1.2 2.1-1.2.9a7 7 0 0 1 0 2z" transform="translate(-1 -1) scale(1.08)" /></>,
    about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    clear: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.5-2L20 12M4 12l2.9 5a7 7 0 0 0 11.5-2" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
};

const getRecentOrders = async (page = 1) => {
  const result = await api.request('GET', `/orders?limit=100&page=${page}`);
  return {
    orders: result.orders || [],
    branch: result.branch,
    pagination: result.pagination || { page, pages: 1, total: (result.orders || []).length },
  };
};

const getAllMenuItems = async () => {
  const firstPage = await api.request('GET', '/menu/items?limit=100&page=1');
  if (!Array.isArray(firstPage.items)) throw new Error('Menu items could not be loaded. Refresh and try again.');

  const pages = Math.max(1, Number(firstPage.pagination?.pages) || 1);
  const remainingPages = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => index + 2)
      .map((page) => api.request('GET', `/menu/items?limit=100&page=${page}`))
  );
  const laterItems = remainingPages.flatMap((result) => {
    if (!Array.isArray(result.items)) throw new Error('Some menu items could not be loaded. Refresh and try again.');
    return result.items;
  });

  return [...firstPage.items, ...laterItems];
};

const suggestLocalBackendUrl = (value) => {
  try {
    const url = new URL(value);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.port !== '50001') return '';
    url.port = '5001';
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
};

const Setup = ({ initialSettings, initialError, onConnected, onBack }) => {
  const [apiUrl, setApiUrl] = useState(initialSettings?.apiUrl || '');
  const [apiKey, setApiKey] = useState('');
  const [working, setWorking] = useState('');
  const [error, setError] = useState(initialError || '');
  const [notice, setNotice] = useState('');
  const [inputVersion, setInputVersion] = useState(0);
  const [testedVersion, setTestedVersion] = useState(-1);
  const suggestedApiUrl = suggestLocalBackendUrl(apiUrl);
  const insecureRemoteHttp = usesUnencryptedRemoteHttp(apiUrl);

  const testConnection = async (event) => {
    event.preventDefault();
    setWorking('test');
    setError('');
    setNotice('');
    setTestedVersion(-1);
    try {
      await api.testConnection({ apiUrl, apiKey });
      setTestedVersion(inputVersion);
      setNotice('Connection successful. Server is ready.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorking('');
    }
  };

  const saveAndContinue = async () => {
    setWorking('save');
    setError('');
    try {
      await onConnected(await api.connect({ apiUrl, apiKey }));
    } catch (requestError) {
      setTestedVersion(-1);
      setError(errorMessage(requestError));
    } finally {
      setWorking('');
    }
  };

  return (
    <main className="setup-screen">
      <section className="setup-card">
        {onBack && <button type="button" className="setup-back-button" onClick={onBack}><span aria-hidden="true">←</span> Back</button>}
        <div className="brand-mark">R</div>
        <p className="eyebrow">RESTAURANT MANAGEMENT SYSTEM</p>
        <h1>Initial POS Setup</h1>
        <p className="muted">Connect this terminal to your restaurant server. Your settings are encrypted and saved on this computer.</p>
        <form onSubmit={testConnection} className="setup-form">
          <label>
            API Server URL
            <input
              required
              type="url"
              value={apiUrl}
              onChange={(event) => {
                setApiUrl(event.target.value);
                setInputVersion((version) => version + 1);
                setTestedVersion(-1);
                setError('');
                setNotice('');
              }}
              placeholder="https://api.example.com"
              autoComplete="url"
              disabled={Boolean(working)}
            />
            <small>Enter your server address. The application API path is added automatically.</small>
            {insecureRemoteHttp && <small className="security-warning">HTTP does not encrypt traffic. Use this only on a trusted network; HTTPS is recommended.</small>}
            {suggestedApiUrl && (
              <div className="url-suggestion">
                <span>Port 50001 looks incorrect for the local backend.</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setApiUrl(suggestedApiUrl);
                    setInputVersion((version) => version + 1);
                    setTestedVersion(-1);
                    setError('');
                    setNotice('');
                  }}
                >
                  Use {suggestedApiUrl}
                </button>
              </div>
            )}
          </label>
          <label>
            Branch API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setInputVersion((version) => version + 1);
                setTestedVersion(-1);
                setError('');
                setNotice('');
              }}
              placeholder="rms_live_…"
              autoComplete="new-password"
              required={!initialSettings}
              disabled={Boolean(working)}
            />
            <small>Generate a key in Admin → Branch → API integration. It is stored encrypted on this computer.</small>
          </label>
          {error && <p className="error-message" role="alert">{error}</p>}
          {notice && <p className="connection-success" role="status">{notice}</p>}
          <button className="secondary-button full-width" type="submit" disabled={Boolean(working)}>
            {working === 'test' ? 'Testing connection…' : 'Test Connection'}
          </button>
          <button
            className="primary-button full-width"
            type="button"
            onClick={saveAndContinue}
            disabled={Boolean(working) || testedVersion !== inputVersion}
          >
            {working === 'save' ? 'Saving securely…' : 'Save & Continue'}
          </button>
        </form>
      </section>
    </main>
  );
};

const Login = ({ apiUrl, error: initialError, onLogin, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(initialError || '');

  const submit = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      await onLogin({ email: email.trim(), password });
      setPassword('');
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="setup-screen">
      <section className="setup-card">
        <button type="button" className="setup-back-button" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
        <div className="brand-mark">R</div>
        <p className="eyebrow">RESTAURANT MANAGEMENT SYSTEM</p>
        <h1>Sign in to your POS</h1>
        <p className="muted">Use this branch’s login email and password from Admin → Integrations → Desktop POS sign-in. The branch contact email and API key are not sign-in credentials.</p>
        <form onSubmit={submit} className="setup-form">
          <label>
            Username (email address)
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              autoFocus
              disabled={working}
            />
          </label>
          <label>
            Password
            <div className="login-password-field">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={working}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                disabled={working}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button full-width" type="submit" disabled={working}>
            {working ? 'Signing in…' : 'Sign in'}
          </button>
          <small className="login-connection">Connected to {apiUrl}</small>
        </form>
      </section>
    </main>
  );
};

const ConnectionRecovery = ({ apiUrl, error, working, onRetry }) => {
  const [showServerInfo, setShowServerInfo] = useState(false);

  return (
    <main className="setup-screen">
      <section className="setup-card recovery-card">
        <div className="brand-mark">R</div>
        <p className="eyebrow">RESTAURANT MANAGEMENT SYSTEM</p>
        <h1>Server connection unavailable</h1>
        <p className="muted">Unable to connect to the configured server. Your saved server settings have not been changed.</p>
        <div className="saved-connection"><strong>Configured server</strong><br />{apiUrl}</div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="recovery-actions">
          <button className="primary-button full-width" type="button" onClick={onRetry} disabled={working}>
            {working ? 'Retrying connection…' : 'Retry Connection'}
          </button>
          <button className="text-button recovery-settings-button" type="button" onClick={() => setShowServerInfo((visible) => !visible)}>
            Server Settings
          </button>
        </div>
        {showServerInfo && (
          <p className="recovery-settings-note" role="status">
            Server changes and configuration reset are not available from this screen. Contact your RMS administrator.
          </p>
        )}
      </section>
    </main>
  );
};

const App = () => {
  const [settings, setSettings] = useState(undefined);
  const [editingConnection, setEditingConnection] = useState(false);
  const [connected, setConnected] = useState(false);
  const [serverReachable, setServerReachable] = useState(true);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [configurationError, setConfigurationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [branchInfo, setBranchInfo] = useState(null);
  const [terminals, setTerminals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPagination, setOrdersPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [cart, setCart] = useState([]);
  const [favoriteItemIds, setFavoriteItemIds] = useState([]);
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState('TAKEAWAY');
  const [activeRestaurantId, setActiveRestaurantId] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerFormOpen, setNewCustomerFormOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [customerListLoading, setCustomerListLoading] = useState(false);
  const [customerListError, setCustomerListError] = useState('');
  const [customerSaved, setCustomerSaved] = useState(false);
  const [customerLoginOpen, setCustomerLoginOpen] = useState(false);
  const [customerFormWorking, setCustomerFormWorking] = useState(false);
  const [customerFormError, setCustomerFormError] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    instructions: '',
  });
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState('');
  const [savingMapsKey, setSavingMapsKey] = useState(false);
  const [terminalId, setTerminalId] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [gatewayProvider, setGatewayProvider] = useState('PAYTM');
  const [gatewayTransaction, setGatewayTransaction] = useState(null);
  const [otherPaymentQr, setOtherPaymentQr] = useState('');
  const [checkoutStep, setCheckoutStep] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  const [quantityUpdating, setQuantityUpdating] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeView, setActiveView] = useState('sale');
  const [settingsSection, setSettingsSection] = useState('general');
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressBookLoaded, setAddressBookLoaded] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' });
  const [editingAddressId, setEditingAddressId] = useState('');
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState('');
  const [checkoutAddressEditorOpen, setCheckoutAddressEditorOpen] = useState(false);
  const [checkoutAddressDraft, setCheckoutAddressDraft] = useState({ name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' });
  const [addressBookLocationStatus, setAddressBookLocationStatus] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All Items');
  const [activeFoodType, setActiveFoodType] = useState('ALL');
  const [isFoodTypeMenuOpen, setIsFoodTypeMenuOpen] = useState(false);
  const [showAllRestaurants, setShowAllRestaurants] = useState(false);

  useEffect(() => {
    try {
      const storedAddresses = window.localStorage.getItem('rms-pos-address-book');
      const parsedAddresses = storedAddresses ? JSON.parse(storedAddresses) : [];
      if (!Array.isArray(parsedAddresses)) throw new Error('Saved address data has an invalid format.');
      setSavedAddresses(parsedAddresses);
    } catch (storageError) {
      setError(`Could not load the local address book: ${errorMessage(storageError)}`);
    } finally {
      setAddressBookLoaded(true);
    }
  }, []);

  useEffect(() => {
    try {
      const storedFavorites = window.localStorage.getItem('rms-pos-favorite-items');
      const parsedFavorites = storedFavorites ? JSON.parse(storedFavorites) : [];
      if (!Array.isArray(parsedFavorites) || parsedFavorites.some((id) => typeof id !== 'string')) {
        throw new Error('Saved favorites have an invalid format.');
      }
      setFavoriteItemIds(parsedFavorites);
    } catch (storageError) {
      setError(`Could not load saved favorites: ${errorMessage(storageError)}`);
    }
  }, []);

  useEffect(() => {
    if (!customerLoginOpen || newCustomerFormOpen || !connected) return undefined;
    let current = true;
    const timeout = setTimeout(async () => {
      setCustomerListLoading(true);
      setCustomerListError('');
      try {
        const query = customerSearch.trim()
          ? `?search=${encodeURIComponent(customerSearch.trim())}`
          : '';
        const result = await api.request('GET', `/customers${query}`);
        if (current) {
          if (!Array.isArray(result)) throw new Error('Customer list could not be loaded. Try again.');
          setExistingCustomers(result);
        }
      } catch (requestError) {
        if (current) setCustomerListError(errorMessage(requestError));
      } finally {
        if (current) setCustomerListLoading(false);
      }
    }, 180);
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [connected, customerLoginOpen, customerSearch, newCustomerFormOpen]);

  const refreshData = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const [menuItems, categoryData, terminalData, sessionData, orderData] = await Promise.all([
        getAllMenuItems(),
        api.request('GET', '/menu/categories?status=ACTIVE'),
        api.request('GET', '/pos/terminals'),
        api.request('GET', '/pos/sessions?limit=50'),
        getRecentOrders(page),
      ]);
      setBranchInfo(orderData.branch || null);
      setItems(menuItems);
      setMenuCategories(Array.isArray(categoryData) ? categoryData : []);
      setTerminals(terminalData || []);
      setSessions(sessionData || []);
      setOrders(orderData.orders.filter((order) => order.setupTest !== true));
      setOrdersPage(page);
      setOrdersPagination(orderData.pagination);
      setTerminalId((current) => current || (terminalData || []).find((terminal) => terminal.isActive)?.id || (terminalData || []).find((terminal) => terminal.isActive)?._id || '');
    } catch (requestError) {
      setError(errorMessage(requestError));
      if (requestError?.message?.includes('Invalid or revoked')) {
        setConnected(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    api.getSettings()
      .then(async (saved) => {
        if (!mounted) return;
        setSettings(saved);
        if (saved) {
          setCheckingConnection(true);
          try {
            await api.request('GET', '/menu/items?limit=1');
            if (mounted) {
              setServerReachable(true);
              setError('');
            }
          } catch (requestError) {
            if (mounted) {
              setServerReachable(false);
              setError(errorMessage(requestError));
            }
          } finally {
            if (mounted) setCheckingConnection(false);
          }
        }
      })
      .catch((requestError) => {
        if (!mounted) return;
        setConfigurationError(errorMessage(requestError));
      });
    return () => { mounted = false; };
  }, [refreshData]);

  const categories = useMemo(() => menuCategories.length
    ? menuCategories
    : [...new Map(items.map((item) => {
      const id = String(item.categoryId?._id || item.categoryId?.id || item.categoryId?.name || item.category || '');
      return [id, { _id: id, name: item.categoryId?.name || item.category || 'Other' }];
    })).values()], [items, menuCategories]);
  const categoryNames = useMemo(() => ['All Items', ...new Set(categories.map((category) => category.name).filter(Boolean))], [categories]);
  const matchingRestaurantIds = useMemo(() => {
    const term = search.trim();
    if (!term) return [];
    return (branchInfo?.restaurants || [])
      .filter((restaurant) => searchTextMatches(term, restaurant.name))
      .map((restaurant) => String(restaurant.id));
  }, [branchInfo, search]);
  const visibleRestaurants = matchingRestaurantIds.length
    ? (branchInfo?.restaurants || []).filter((restaurant) => matchingRestaurantIds.includes(String(restaurant.id)))
    : branchInfo?.restaurants || [];
  const restaurantNameById = useMemo(
    () => new Map((branchInfo?.restaurants || []).map((restaurant) => [String(restaurant.id), restaurant.name])),
    [branchInfo]
  );
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matchingRestaurants = new Set(matchingRestaurantIds);
    const hasMatchingItems = Boolean(term) && items.some((item) => (
      searchTextMatches(term, `${item.name || ''} ${item.categoryId?.name || item.category || ''}`)
    ));
    return items.filter((item) => {
      const categoryId = String(item.categoryId?._id || item.categoryId?.id || '');
      const category = item.categoryId?.name || item.category || '';
      const matchesCategory = !term && (activeView === 'items' || activeView === 'sale')
        ? activeCategory === 'All Items' || category === activeCategory
        : true;
      const foodType = String(item.foodType || 'VEG').toUpperCase();
      const matchesFoodType = Boolean(term) || activeFoodType === 'ALL' || foodType === activeFoodType;
      const matchesItemSearch = !term || searchTextMatches(term, `${item.name || ''} ${category}`);
      const matchesRestaurantSearch = matchingRestaurants.has(String(item.restaurantId || ''));
      const matchesSearch = !term || (hasMatchingItems ? matchesItemSearch : matchesRestaurantSearch);
      const matchesRestaurant = matchingRestaurants.size
        ? matchesRestaurantSearch || (hasMatchingItems && matchesItemSearch)
        : !activeRestaurantId || !item.restaurantId || String(item.restaurantId) === activeRestaurantId;
      return matchesCategory && matchesFoodType && matchesSearch && matchesRestaurant;
    });
  }, [items, search, matchingRestaurantIds, activeCategory, activeFoodType, activeRestaurantId, activeView]);
  const visibleItems = activeView === 'favorites'
    ? filteredItems.filter((item) => favoriteItemIds.includes(String(item._id)))
    : filteredItems;
  const total = cart.reduce((sum, line) => sum + Number(line.item.price || 0) * line.quantity, 0);
  const openSessions = sessions.filter((session) => session.status === 'OPEN');
  const activeTerminalId = (terminal) => String(terminal._id || terminal.id);
  const pendingOrders = orders.filter((order) => ['OPEN', 'BILLED'].includes(order.status));
  const paidOrders = orders.filter((order) => order.status === 'PAID');
  const enabledPaymentMethods = branchInfo?.enabledPaymentMethods?.length ? branchInfo.enabledPaymentMethods : ['CASH'];
  const checkoutPaymentMethods = checkoutOrder?.enabledPaymentMethods?.length ? checkoutOrder.enabledPaymentMethods : enabledPaymentMethods;
  const paymentGatewayProviders = branchInfo?.paymentGatewayProviders || [];
  const requiresCashSession = terminals.some((terminal) => terminal.isActive);

  useEffect(() => {
    if (!enabledPaymentMethods.includes(paymentMethod)) setPaymentMethod(enabledPaymentMethods[0] || 'CASH');
  }, [enabledPaymentMethods, paymentMethod]);

  useEffect(() => {
    if (!paymentGatewayProviders.includes(gatewayProvider) && paymentGatewayProviders.length) {
      setGatewayProvider(paymentGatewayProviders[0]);
    }
  }, [paymentGatewayProviders, gatewayProvider]);

  const onConnected = async (nextSettings) => {
    setSettings(nextSettings);
    setServerReachable(true);
    setConnected(false);
    setEditingConnection(false);
    setError('');
  };

  const signInToPos = async ({ email, password }) => {
    await api.login({ email, password });
    setError('');
    setConnected(true);
    await refreshData(1);
  };

  const retryConnection = async () => {
    setCheckingConnection(true);
    setError('');
    try {
      await api.request('GET', '/menu/items?limit=1');
      setServerReachable(true);
      setConnected(true);
      await refreshData(ordersPage);
    } catch (requestError) {
      setServerReachable(false);
      setError(errorMessage(requestError));
    } finally {
      setCheckingConnection(false);
    }
  };

  const saveCustomerProfile = async (event) => {
    event.preventDefault();
    setCustomerFormWorking(true);
    setCustomerFormError('');
    try {
      const result = await api.request('POST', '/customers', {
        phone: newCustomerPhone,
        name: newCustomerName,
        email: newCustomerEmail,
      });
      setCustomerPhone(result.phone);
      setCustomerName(result.name);
      setCustomerEmail(result.email || '');
      setCustomerSaved(true);
      setCustomerLoginOpen(false);
      setNotice('Customer details saved to this branch.');
    } catch (requestError) {
      setCustomerFormError(errorMessage(requestError));
    } finally {
      setCustomerFormWorking(false);
    }
  };

  const openNewCustomerForm = () => {
    setNewCustomerPhone('');
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerFormOpen(true);
    setCustomerFormError('');
    setCustomerLoginOpen(true);
  };

  const openCustomerPicker = () => {
    setCustomerSearch('');
    setCustomerListError('');
    setNewCustomerFormOpen(false);
    setCustomerFormError('');
    setCustomerLoginOpen(true);
  };

  const selectExistingCustomer = (customer) => {
    setCustomerPhone(customer.phone);
    setCustomerName(customer.name);
    setCustomerEmail(customer.email || '');
    setCustomerSaved(true);
    setCustomerLoginOpen(false);
    setNotice(`${customer.name} selected for this order.`);
    setError('');
  };

  const switchCustomer = () => {
    setCustomerSaved(false);
    setCustomerPhone('');
    setCustomerName('');
    setCustomerEmail('');
    openNewCustomerForm();
  };

  const openMapsSettings = () => {
    setSettingsExpanded(true);
    setActiveView('settings');
    setSettingsSection('general');
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const addToCart = (item) => {
    setCart((current) => {
      const existing = current.find((line) => String(line.item._id) === String(item._id));
      return existing
        ? current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, { item, quantity: 1 }];
    });
  };

  const toggleFavorite = (itemId) => {
    const id = String(itemId);
    const nextFavorites = favoriteItemIds.includes(id)
      ? favoriteItemIds.filter((favoriteId) => favoriteId !== id)
      : [...favoriteItemIds, id];
    try {
      window.localStorage.setItem('rms-pos-favorite-items', JSON.stringify(nextFavorites));
      setFavoriteItemIds(nextFavorites);
      setNotice(nextFavorites.includes(id) ? 'This is your favorite food.' : 'Dish removed from favorites.');
      setError('');
    } catch (storageError) {
      setError(`Could not save favorites: ${errorMessage(storageError)}`);
    }
  };

  const setQuantity = (itemId, quantity) => {
    setCart((current) => quantity < 1
      ? current.filter((line) => String(line.item._id) !== itemId)
      : current.map((line) => (String(line.item._id) === itemId ? { ...line, quantity } : line)));
  };

  const detectDeliveryLocation = () => {
    if (locationStatus.startsWith('Requesting') || locationStatus.startsWith('Looking up')) return;
    if (!settings?.googleMapsConfigured) {
      setLocationStatus('Google Maps is not configured. Choose a saved address or enter the delivery address below.');
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus('Location is not available on this device. Enter the delivery address below.');
      return;
    }
    setLocationStatus('Requesting device location permission…');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const coordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: Math.round(coords.accuracy),
        };
        setDeliveryLocation(coordinates);
        setLocationStatus('Looking up address with Google Maps…');
        try {
          const address = await api.reverseGeocode(coordinates);
          setDeliveryAddress((current) => ({
            ...current,
            line1: address.line1 || current.line1,
            line2: address.line2 || current.line2,
            city: address.city || current.city,
            state: address.state || current.state,
            postalCode: address.postalCode || current.postalCode,
          }));
          const gstCode = indianGstStateCodes[address.state?.trim().toLowerCase()];
          if (gstCode) setPlaceOfSupplyStateCode(gstCode);
          const filled = [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).length;
          setLocationStatus(filled
            ? `Address fields filled from Google Maps (±${coordinates.accuracyMeters} m). Check the street address and enter recipient details.`
            : 'Google Maps did not return address details. Enter the delivery address manually.');
        } catch (lookupError) {
          setLocationStatus(`${errorMessage(lookupError)} GPS coordinates are saved; enter the address manually or configure the key in Settings.`);
        }
      },
      (locationError) => {
        const message = locationError.code === locationError.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location in the app settings or enter the address manually.'
          : locationError.code === locationError.TIMEOUT
            ? 'Location detection timed out. Try again or enter the address manually.'
            : 'Could not detect location. Enter the delivery address manually.';
        setLocationStatus(message);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  };

  const selectOrderType = (type) => {
    setOrderType(type);
    setError('');
    if (type === 'DELIVERY') {
      const hasDeliveryDetails = customerName || customerPhone
        || Object.values(deliveryAddress).some(Boolean);
      if (!hasDeliveryDetails && savedAddresses.length) {
        useSavedAddress(savedAddresses[0]);
      } else if (!hasDeliveryDetails && !deliveryLocation && settings?.googleMapsConfigured) {
        detectDeliveryLocation();
      } else if (!hasDeliveryDetails && !savedAddresses.length) {
        setLocationStatus('No saved delivery address. Enter the address below or save one in Address Book.');
      }
    }
  };

  const updateDeliveryAddress = (field, value) => {
    setDeliveryAddress((current) => ({ ...current, [field]: value }));
  };

  const detectAddressBookLocation = () => {
    if (addressBookLocationStatus.startsWith('Detecting') || addressBookLocationStatus.startsWith('Looking up')) return;
    if (!settings?.googleMapsConfigured) {
      setAddressBookLocationStatus('');
      openMapsSettings();
      return;
    }
    if (!navigator.geolocation) {
      setAddressBookLocationStatus('Location detection is unavailable on this device. Enter the address manually.');
      return;
    }
    setAddressBookLocationStatus('Detecting location… Allow location access to fill your address.');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setAddressBookLocationStatus('Looking up your address…');
        try {
          const address = await api.reverseGeocode({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: Math.round(coords.accuracy),
          });
          setAddressDraft((current) => ({
            ...current,
            line1: current.line1 || address.line1 || '',
            line2: current.line2 || address.line2 || '',
            city: current.city || address.city || '',
            state: current.state || address.state || '',
            postalCode: current.postalCode || address.postalCode || '',
          }));
          const state = address.state?.trim().toLowerCase();
          if (state && indianGstStateCodes[state]) setPlaceOfSupplyStateCode(indianGstStateCodes[state]);
          const fieldsFound = [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).length;
          setAddressBookLocationStatus(fieldsFound
            ? 'Location detected and address fields filled. Review the address and enter the customer name and phone number.'
            : 'Location detected, but no address details were returned. Enter the address manually.');
        } catch (lookupError) {
          setAddressBookLocationStatus(`${errorMessage(lookupError)} Enter the address manually or configure the Google Maps key in Settings.`);
        }
      },
      (locationError) => {
        const message = locationError.code === locationError.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access and try again, or enter the address manually.'
          : locationError.code === locationError.TIMEOUT
            ? 'Location detection timed out. Try again or enter the address manually.'
            : 'Could not detect location. Enter the address manually.';
        setAddressBookLocationStatus(message);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  };

  const saveAddressBookEntry = (event) => {
    event.preventDefault();
    const requiredFields = ['name', 'phone', 'line1', 'city', 'postalCode'];
    if (requiredFields.some((field) => !addressDraft[field].trim())) {
      setError('Enter a name, phone, street address, city, and postal code.');
      return;
    }
    if (!/^[1-9]\d{5}$/.test(addressDraft.postalCode.trim())) {
      setError('Enter a valid six-digit postal code.');
      return;
    }
    const entry = { ...addressDraft, id: editingAddressId || crypto.randomUUID() };
    const nextAddresses = editingAddressId
      ? savedAddresses.map((address) => address.id === editingAddressId ? entry : address)
      : [entry, ...savedAddresses];
    try {
      window.localStorage.setItem('rms-pos-address-book', JSON.stringify(nextAddresses));
      setSavedAddresses(nextAddresses);
      setAddressDraft({ name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' });
      setEditingAddressId('');
      setError('');
      setNotice(editingAddressId ? 'Address updated on this computer.' : 'Address saved on this computer.');
    } catch (storageError) {
      setError(`Could not save the address: ${errorMessage(storageError)}`);
    }
  };

  const editAddressBookEntry = (address) => {
    setAddressDraft({ name: address.name || '', phone: address.phone || '', line1: address.line1 || '', line2: address.line2 || '', city: address.city || '', state: address.state || '', postalCode: address.postalCode || '', instructions: address.instructions || '' });
    setEditingAddressId(address.id);
  };

  const deleteAddressBookEntry = (addressId) => {
    const nextAddresses = savedAddresses.filter((address) => address.id !== addressId);
    try {
      window.localStorage.setItem('rms-pos-address-book', JSON.stringify(nextAddresses));
      setSavedAddresses(nextAddresses);
      if (editingAddressId === addressId) {
        setEditingAddressId('');
        setAddressDraft({ name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' });
      }
      setNotice('Address removed from this computer.');
    } catch (storageError) {
      setError(`Could not remove the address: ${errorMessage(storageError)}`);
    }
  };

  const useSavedAddress = (address) => {
    setCustomerName(address.name || '');
    setCustomerPhone(address.phone || '');
    setSelectedSavedAddressId(address.id);
    setDeliveryAddress({ line1: address.line1 || '', line2: address.line2 || '', city: address.city || '', state: address.state || '', postalCode: address.postalCode || '', instructions: address.instructions || '' });
    const gstCode = indianGstStateCodes[address.state?.trim().toLowerCase()];
    if (gstCode) setPlaceOfSupplyStateCode(gstCode);
    setDeliveryLocation(null);
    setLocationStatus('Saved address loaded. Confirm the details before placing the order.');
  };

  const openCheckoutAddressEditor = () => {
    const address = checkoutOrder?.deliveryAddress || deliveryAddress;
    setCheckoutAddressDraft({
      name: checkoutOrder?.customerName || customerName,
      phone: checkoutOrder?.customerPhone || customerPhone,
      line1: address.line1 || '',
      line2: address.line2 || '',
      city: address.city || '',
      state: address.state || '',
      postalCode: address.postalCode || '',
      instructions: address.instructions || '',
    });
    setCheckoutAddressEditorOpen(true);
    setError('');
  };

  const updateCheckoutDeliveryAddress = async (address, saveToAddressBook = false) => {
    if (!checkoutOrder?._id) return;
    const details = {
      name: String(address.name || '').trim(),
      phone: String(address.phone || '').trim(),
      line1: String(address.line1 || '').trim(),
      line2: String(address.line2 || '').trim(),
      city: String(address.city || '').trim(),
      state: String(address.state || '').trim(),
      postalCode: String(address.postalCode || '').trim(),
      instructions: String(address.instructions || '').trim(),
    };
    if (!details.name || !details.phone || !details.line1 || !details.city || !details.postalCode) {
      setError('Enter a recipient name, phone, street address, city, and postal code.');
      return;
    }
    if (!/^[1-9]\d{5}$/.test(details.postalCode)) {
      setError('Enter a valid six-digit postal code.');
      return;
    }

    setWorking('address');
    setError('');
    try {
      const result = await api.request('PATCH', `/orders/${checkoutOrder._id}/delivery-details`, {
        customerName: details.name,
        customerPhone: details.phone,
        deliveryAddress: {
          line1: details.line1,
          line2: details.line2,
          city: details.city,
          state: details.state,
          postalCode: details.postalCode,
          instructions: details.instructions,
        },
      });
      if (!result?._id) throw new Error('The server did not return the updated delivery details. Refresh the order before continuing.');
      setCheckoutOrder(result);
      setCustomerName(details.name);
      setCustomerPhone(details.phone);
      setDeliveryAddress({
        line1: details.line1,
        line2: details.line2,
        city: details.city,
        state: details.state,
        postalCode: details.postalCode,
        instructions: details.instructions,
      });
      setDeliveryLocation(null);
      const savedAddress = saveToAddressBook
        ? { ...details, id: crypto.randomUUID() }
        : savedAddresses.find((entry) => entry.id === selectedSavedAddressId);
      if (saveToAddressBook && savedAddress) {
        try {
          const nextAddresses = [savedAddress, ...savedAddresses];
          window.localStorage.setItem('rms-pos-address-book', JSON.stringify(nextAddresses));
          setSavedAddresses(nextAddresses);
          setSelectedSavedAddressId(savedAddress.id);
        } catch (storageError) {
          setError(`Delivery address updated for this order, but could not be saved to this computer’s address book: ${errorMessage(storageError)}`);
        }
      } else if (savedAddress) {
        setSelectedSavedAddressId(savedAddress.id);
      } else {
        setSelectedSavedAddressId('');
      }
      setCheckoutAddressEditorOpen(false);
      setNotice('Delivery address updated for this order.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorking('');
    }
  };

  const chooseCheckoutAddress = (addressId) => {
    const address = savedAddresses.find((entry) => entry.id === addressId);
    if (address) updateCheckoutDeliveryAddress(address);
    else setSelectedSavedAddressId('');
  };

  const saveCheckoutAddress = (event) => {
    event.preventDefault();
    updateCheckoutDeliveryAddress(checkoutAddressDraft, true);
  };

  const saveGoogleMapsKey = async (clear = false) => {
    setSavingMapsKey(true);
    setError('');
    try {
      const result = await api.saveGoogleMapsApiKey(clear ? '' : googleMapsApiKey);
      setSettings((current) => ({ ...current, googleMapsConfigured: result.configured }));
      setAddressBookLocationStatus('');
      setLocationStatus('');
      if (clear) setGoogleMapsApiKey('');
      setNotice(clear ? 'Google Maps API key removed from this terminal.' : 'Google Maps API key saved securely on this terminal.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSavingMapsKey(false);
    }
  };

  const openCashSession = async (event) => {
    event.preventDefault();
    if (!terminalId) return;
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Opening cash must be zero or greater.');
      return;
    }
    setWorking('session');
    setError('');
    try {
      await api.request('POST', `/pos/terminals/${terminalId}/sessions`, { openingCash: amount });
      setNotice('Cash session opened.');
      await refreshData(ordersPage);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorking('');
    }
  };

  const closeCashSession = async (sessionId) => {
    const closingCash = window.prompt('Enter the counted closing cash amount:');
    if (closingCash === null) return;
    const amount = Number(closingCash);
    if (!closingCash.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Closing cash must be a valid amount of zero or greater.');
      return;
    }
    setWorking('session');
    setError('');
    try {
      await api.request('POST', `/pos/sessions/${sessionId}/close`, { closingCash: amount });
      setNotice('Cash session closed.');
      await refreshData(ordersPage);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorking('');
    }
  };

  const placeOrder = async () => {
    if (!cart.length) return;
    if (orderType === 'DELIVERY') {
      if (!customerName.trim()) {
        setError('Enter the delivery recipient’s name.');
        return;
      }
      if (!customerPhone.trim()) {
        setError('Enter a phone number for the delivery recipient.');
        return;
      }
      if (!deliveryAddress.line1.trim() || !deliveryAddress.city.trim() || !deliveryAddress.postalCode.trim()) {
        setError('Complete the street address, city, and postal code for delivery.');
        return;
      }
      if (!/^[1-9]\d{5}$/.test(deliveryAddress.postalCode.trim())) {
        setError('Enter a valid six-digit postal code.');
        return;
      }
    }
    setWorking('order');
    setError('');
    setNotice('');
    try {
      const result = await api.request('POST', '/orders', {
        orderType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber.trim() : '',
        placeOfSupplyStateCode: orderType === 'DELIVERY' ? placeOfSupplyStateCode.trim() : '',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: orderType === 'DELIVERY' ? { ...deliveryAddress } : undefined,
        deliveryLocation: orderType === 'DELIVERY' ? deliveryLocation : undefined,
        items: cart.map(({ item, quantity }) => ({ menuItemId: item._id, quantity })),
      });
      if (!result.order?._id) throw new Error('The server did not return the new order details. Refresh orders before trying again.');
      setCheckoutOrder(result.order);
      setCheckoutStep(true);
      setCheckoutAddressEditorOpen(false);
    } catch (requestError) {
      setError(posOrderErrorMessage(requestError, orderType));
    } finally {
      setWorking('');
    }
  };

  const confirmPaymentAndPlaceOrder = async () => {
    if (!checkoutOrder?._id) return;
    if (paymentMethod === 'CASH' && requiresCashSession && !openSessions.length) {
      setError('Open a cash session before confirming payment.');
      return;
    }
    if (paymentMethod === 'OTHER' && !otherPaymentQr) {
      setError('Upload a branch QR image in Admin → Branch → payment methods before collecting Other payments.');
      return;
    }
    if (paymentMethod === 'OTHER' && !window.confirm('Confirm only after you have verified that the customer’s payment was received.')) return;
    setWorking('checkout');
    setError('');
    setNotice('');
    let orderBeingPaid = checkoutOrder;
    try {
      if (paymentMethod === 'UPI' || paymentMethod === 'CARD') {
        if (!paymentGatewayProviders.includes(gatewayProvider)) {
          throw new Error('Configure Paytm or PhonePe sandbox credentials for this branch in Admin → Branch → Integrations before accepting online payments.');
        }
        const gateway = await api.request('POST', `/payments/gateways/orders/${orderBeingPaid._id}/start`, {
          provider: gatewayProvider,
          method: paymentMethod,
          ...(openSessions[0] ? { posSessionId: openSessions[0]._id || openSessions[0].id } : {}),
        });
        setGatewayTransaction({
          transactionId: gateway.transactionId,
          checkoutUrl: gateway.checkoutUrl,
          order: orderBeingPaid,
          provider: gatewayProvider,
          method: paymentMethod,
        });
        await api.openCheckout(gateway.checkoutUrl);
        setNotice(`Secure ${gatewayProvider === 'PAYTM' ? 'Paytm' : 'PhonePe'} checkout opened. The POS will verify payment before placing order ${orderBeingPaid.orderNumber || ''}.`);
        return;
      }
      await api.request('POST', `/payments/orders/${orderBeingPaid._id}/pay`, {
        amount: orderBeingPaid.grandTotal,
        method: paymentMethod,
        ...(openSessions[0] ? { posSessionId: openSessions[0]._id || openSessions[0].id } : {}),
      });
      setInvoiceOrder({
        ...orderBeingPaid,
        status: 'PAID',
        payment: {
          ...orderBeingPaid.payment,
          method: paymentMethod,
          isPaid: true,
          paidAt: new Date().toISOString(),
        },
      });
      setCart([]);
      setCheckoutOrder(null);
      setCheckoutStep(false);
      setCheckoutAddressEditorOpen(false);
      setNotice(`Payment received and order ${orderBeingPaid.orderNumber || ''} placed.`);
      await refreshData(ordersPage);
    } catch (requestError) {
      const detail = posPaymentErrorMessage(requestError);
      if (orderBeingPaid) {
        setCheckoutOrder(orderBeingPaid);
        setError(`Order ${orderBeingPaid.orderNumber || ''} is already saved but payment was not recorded: ${detail} Retry payment here; the order will not be duplicated.`);
      } else {
        setError(detail);
      }
    } finally {
      setWorking('');
    }
  };

  const updateCheckoutQuantity = async (itemId, quantity) => {
    if (!checkoutOrder?._id || quantityUpdating) return;
    setQuantityUpdating(itemId);
    setError('');
    try {
      const result = await api.request('PATCH', `/orders/${checkoutOrder._id}/quantities`, {
        items: checkoutOrder.items.map((item) => ({
          itemId: String(item.itemId),
          quantity: String(item.itemId) === itemId ? quantity : item.quantity,
        })),
      });
      if (!result?._id) throw new Error('The server did not return the updated order. Refresh the order before continuing.');
      setCheckoutOrder(result);
    } catch (requestError) {
      setError(`Could not update the number of plates: ${errorMessage(requestError)}`);
    } finally {
      setQuantityUpdating('');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setOtherPaymentQr('');
    if (!checkoutOrder?._id || paymentMethod !== 'OTHER') return undefined;
    api.request('GET', `/payments/orders/${checkoutOrder._id}/other-qr`)
      .then((result) => {
        if (!cancelled) setOtherPaymentQr(typeof result.imageDataUrl === 'string' ? result.imageDataUrl : '');
      })
      .catch(() => {
        if (!cancelled) setOtherPaymentQr('');
      });
    return () => { cancelled = true; };
  }, [checkoutOrder?._id, paymentMethod]);

  useEffect(() => {
    if (!gatewayTransaction?.transactionId) return undefined;
    let cancelled = false;
    let timer;
    const checkStatus = async () => {
      try {
        const result = await api.request('GET', `/payments/gateways/${gatewayTransaction.transactionId}/status`);
        if (cancelled) return;
        if (result.status === 'COMPLETED') {
          const order = gatewayTransaction.order;
          setInvoiceOrder({
            ...order,
            status: 'PAID',
            payment: {
              ...order.payment,
              method: gatewayTransaction.method,
              isPaid: true,
              transactionRef: result.transactionReference || '',
              paidAt: new Date().toISOString(),
            },
          });
          setCart([]);
          setCheckoutOrder(null);
          setCheckoutStep(false);
          setCheckoutAddressEditorOpen(false);
          setGatewayTransaction(null);
          setNotice(`Payment verified and order ${order.orderNumber || ''} placed.`);
          await refreshData(ordersPage);
          return;
        }
        if (['FAILED', 'EXPIRED'].includes(result.status)) {
          setGatewayTransaction(null);
          setError(`The ${gatewayTransaction.provider} payment ${result.status.toLowerCase()}. The order remains unpaid; retry checkout or choose cash.`);
          return;
        }
      } catch (requestError) {
        if (!cancelled) setError(`Payment is not yet verified. The POS will keep checking: ${errorMessage(requestError)}`);
      }
      if (!cancelled) timer = setTimeout(checkStatus, 6000);
    };
    timer = setTimeout(checkStatus, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gatewayTransaction, ordersPage, refreshData]);

  const cancelCheckout = () => {
    if (checkoutOrder) {
      setCart([]);
      setCheckoutOrder(null);
      setCheckoutStep(false);
      setCheckoutAddressEditorOpen(false);
      setActiveView('billing');
      setNotice('The order was saved but remains unpaid. Complete it from Billing.');
      return;
    }
    setCheckoutStep(false);
    setCheckoutAddressEditorOpen(false);
    setError('');
  };

  const collectPayment = async (order) => {
    const currentSession = openSessions[0];
    setWorking(`pay-${order._id}`);
    setError('');
    try {
      if (paymentMethod !== 'CASH') {
        if (!paymentGatewayProviders.includes(gatewayProvider)) {
          throw new Error('Configure Paytm or PhonePe sandbox credentials for this branch before accepting online payments.');
        }
        const gateway = await api.request('POST', `/payments/gateways/orders/${order._id}/start`, {
          provider: gatewayProvider,
          method: paymentMethod,
          ...(currentSession ? { posSessionId: currentSession._id || currentSession.id } : {}),
        });
        setGatewayTransaction({
          transactionId: gateway.transactionId,
          checkoutUrl: gateway.checkoutUrl,
          order,
          provider: gatewayProvider,
          method: paymentMethod,
        });
        await api.openCheckout(gateway.checkoutUrl);
        setNotice(`Secure ${gatewayProvider === 'PAYTM' ? 'Paytm' : 'PhonePe'} checkout opened. Payment will be verified before the order is marked paid.`);
        return;
      }
      const result = await api.request('POST', `/payments/orders/${order._id}/pay`, {
        amount: order.grandTotal,
        method: paymentMethod,
        ...(currentSession ? { posSessionId: currentSession._id || currentSession.id } : {}),
      });
      setNotice(`Payment recorded for ${order.orderNumber}.`);
      await refreshData(ordersPage);
    } catch (requestError) {
      setError(posPaymentErrorMessage(requestError));
    } finally {
      setWorking('');
    }
  };

  const exportOrders = () => {
    const headers = ['Order number', 'Date', 'Customer', 'Order type', 'Status', 'Total'];
    const rows = orders.map((order) => [
      order.orderNumber,
      order.createdAt,
      order.customerName || 'Walk-in customer',
      order.orderType,
      order.status,
      order.grandTotal,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rms-pos-orders-page-${ordersPage}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const clearTerminalSession = () => {
    if (!window.confirm('Clear the current order and selected customer? This does not log you out, close a cash session, or remove the saved server configuration.')) return;
    setCart([]);
    setPlaceOfSupplyStateCode('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerSaved(false);
    setCustomerSearch('');
    setExistingCustomers([]);
    setCustomerFormError('');
    setDeliveryAddress({ line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' });
    setDeliveryLocation(null);
    setLocationStatus('');
    setSelectedSavedAddressId('');
    setCustomerLoginOpen(false);
    setCheckoutStep(false);
    setCheckoutOrder(null);
    setCheckoutAddressEditorOpen(false);
    setGatewayTransaction(null);
    setOtherPaymentQr('');
    setActiveView('sale');
    setSettingsExpanded(false);
    setSidebarOpen(false);
    setError('');
    setNotice('Current order and selected customer cleared. Server configuration and cash sessions were not changed.');
  };

  const logoutFromPos = async () => {
    if (!window.confirm('Sign out of Desktop POS? Your saved server URL and branch API key will remain on this computer.')) return;

    setLoggingOut(true);
    setError('');
    try {
      await api.logout();
      setError('');
    } catch (logoutError) {
      setError(`You have been signed out on this computer, but the server could not confirm sign-out: ${errorMessage(logoutError)}`);
    } finally {
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCustomerSaved(false);
      setExistingCustomers([]);
      setCustomerLoginOpen(false);
      setConnected(false);
      setLoggingOut(false);
    }
  };

  if (configurationError) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <div className="brand-mark">R</div>
          <p className="eyebrow">RESTAURANT MANAGEMENT SYSTEM</p>
          <h1>Saved configuration unavailable</h1>
          <p className="muted">The POS could not read its encrypted server settings. No settings were removed. Retry after checking this computer's secure storage.</p>
          <p className="error-message" role="alert">{configurationError}</p>
          <button className="primary-button full-width" type="button" onClick={() => window.location.reload()}>Retry</button>
        </section>
      </main>
    );
  }
  if (settings === undefined) {
    return <main className="loading-screen">Loading secure POS settings…</main>;
  }
  if (checkingConnection && settings) {
    return <main className="loading-screen">Connecting to the configured server…</main>;
  }
  if (!connected) {
    if (!settings || editingConnection) {
      return (
        <Setup
          initialSettings={settings}
          initialError={error}
          onConnected={onConnected}
          onBack={settings ? () => {
            setEditingConnection(false);
            setError('');
          } : undefined}
        />
      );
    }
    if (serverReachable) {
      return (
        <Login
          apiUrl={settings.apiUrl}
          error={error}
          onLogin={signInToPos}
          onBack={() => {
            setEditingConnection(true);
            setError('');
          }}
        />
      );
    }
    return (
      <ConnectionRecovery
        apiUrl={settings.apiUrl}
        error={error}
        working={checkingConnection}
        onRetry={retryConnection}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''} ${activeView === 'sale' ? 'sale-active' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="secondary-button topbar-menu-toggle"
          aria-label={sidebarOpen ? 'Close side menu' : 'Open side menu'}
          aria-expanded={sidebarOpen}
          aria-controls="branch-pos-sidebar"
          title={sidebarOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {sidebarOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
        <div className="brand">
          <div className="brand-mark small"><NavigationIcon name="brand" /></div>
          <div>
            <strong>{branchInfo?.name || 'RMS POS'}</strong>
            <span>{branchInfo?.code || 'Branch point of sale'}</span>
          </div>
        </div>
        {activeView === 'sale' && (
          <nav className="header-service-modes" aria-label="Order type">
            {[
              ['TAKEAWAY', 'Takeaway', 'Pick up your order'],
              ['DINE_IN', 'Dine-in', 'Enjoy at the restaurant'],
              ['DELIVERY', 'Delivery', 'Delivered to your door'],
            ].map(([type, label, description]) => (
              <button
                type="button"
                key={type}
                className={`header-service-mode ${orderType === type ? 'active' : ''}`}
                aria-pressed={orderType === type}
                onClick={() => selectOrderType(type)}
              >
                <span className="header-service-mode-copy"><strong>{label}</strong><small>{description}</small></span>
              </button>
            ))}
          </nav>
        )}
        <div className="greeting">
          <strong>{greeting()}</strong>
          <span>Welcome to your POS workspace</span>
        </div>
        <button
          type="button"
          className="secondary-button customer-login-trigger"
          aria-label={customerSaved ? `Customer ${customerPhone}` : 'Select or add customer'}
          title={customerSaved ? `${customerName} · ${customerPhone}` : 'Select or add customer'}
          onClick={openCustomerPicker}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
          <span>{customerSaved ? customerName : 'Customer'}</span>
        </button>
        <div className="branch-chip">
          <span className="branch-chip-icon"><NavigationIcon name="brand" /></span>
          <span className="branch-chip-text">
            <strong>POS TERMINAL · {branchInfo?.code || 'BRANCH'}</strong>
            <select className="branch-terminal-select" aria-label="POS terminal" value={terminalId} onChange={(event) => setTerminalId(event.target.value)}>
              <option value="">Choose terminal</option>
              {terminals.filter((terminal) => terminal.isActive).map((terminal) => <option key={activeTerminalId(terminal)} value={activeTerminalId(terminal)}>{terminal.name} · {terminal.code}</option>)}
            </select>
          </span>
        </div>
        <div className="top-actions">
          <span className={`connection-status ${serverReachable ? '' : 'offline'}`}><span />{serverReachable ? 'Connected' : 'Offline'}</span>
          <button
            type="button"
            className="secondary-button top-refresh"
            aria-label={loading ? 'Refreshing menu' : 'Refresh menu'}
            title={loading ? 'Refreshing menu' : 'Refresh menu'}
            onClick={() => refreshData(ordersPage)}
            disabled={loading}
          >
            <svg className={loading ? 'spinning' : ''} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M5.6 9a7 7 0 0 1 11.5-2L20 12M4 12l2.9 5a7 7 0 0 0 11.5-2" />
            </svg>
          </button>
        </div>
      </header>

      {customerLoginOpen && (
        <div className="customer-login-backdrop">
          <section className="customer-login-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-login-title">
            <button type="button" className="customer-login-dismiss" aria-label="Close customer login" onClick={() => setCustomerLoginOpen(false)}>×</button>
            <div className="customer-login-heading">
              <div className="customer-login-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20a7 7 0 0 1 14 0" />
                </svg>
              </div>
              <span className="customer-login-step">{newCustomerFormOpen ? 'NEW CUSTOMER' : 'CUSTOMER'}</span>
            </div>
            <p className="eyebrow">{newCustomerFormOpen ? 'CUSTOMER ACCESS' : 'SELECT CUSTOMER'}</p>
            <h1 id="customer-login-title">Welcome to RMS POS</h1>
            {!newCustomerFormOpen ? (
              <div className="customer-picker">
                <label className="customer-picker-search">
                  Find existing customer
                  <input
                    type="search"
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Search name, mobile, or email"
                    autoFocus
                  />
                </label>
                {customerListError && <p className="error-message" role="alert">{customerListError}</p>}
                <div className="customer-picker-list" aria-live="polite">
                  {customerListLoading && <p className="empty-state small-empty">Searching customers…</p>}
                  {!customerListLoading && !customerListError && existingCustomers.map((customer) => (
                    <button
                      type="button"
                      className="customer-picker-option"
                      key={customer.id}
                      onClick={() => selectExistingCustomer(customer)}
                    >
                      <span className="customer-picker-avatar" aria-hidden="true">{customer.name.trim().charAt(0).toUpperCase()}</span>
                      <span className="customer-picker-details"><strong>{customer.name}</strong><small>{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</small></span>
                      <span className="customer-picker-select">Select</span>
                    </button>
                  ))}
                  {!customerListLoading && !customerListError && existingCustomers.length === 0 && (
                    <p className="empty-state small-empty">{customerSearch.trim() ? 'No matching customers found.' : 'No customers saved for this branch yet.'}</p>
                  )}
                </div>
                <button type="button" className="primary-button full-width" onClick={openNewCustomerForm}>Add new customer</button>
                {customerSaved && <button type="button" className="text-button customer-login-close" onClick={switchCustomer}>Clear selected customer</button>}
              </div>
            ) : (
            <>
            <p className="customer-login-description">Save customer details to this branch. No OTP is required.</p>
            <form className="customer-login-form" onSubmit={saveCustomerProfile}>
              <label>
                Customer mobile number
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={16}
                  value={newCustomerPhone}
                  onChange={(event) => setNewCustomerPhone(event.target.value)}
                  placeholder="10-digit mobile number"
                  required
                />
              </label>
              <label>
                Customer name
                <input
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  value={newCustomerName}
                  onChange={(event) => setNewCustomerName(event.target.value)}
                  placeholder="Full name"
                  required
                />
              </label>
              <label>
                Email <span className="optional">(optional)</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={newCustomerEmail}
                  onChange={(event) => setNewCustomerEmail(event.target.value)}
                  placeholder="customer@example.com"
                />
              </label>
              {customerFormError && <p className="error-message" role="alert">{customerFormError}</p>}
              <button type="submit" className="primary-button full-width" disabled={customerFormWorking}>
                {customerFormWorking ? 'Saving customer…' : 'Save new customer'}
              </button>
            </form>
            <button type="button" className="text-button customer-login-close" onClick={openCustomerPicker}>Back to existing customers</button>
            </>
            )}
          </section>
        </div>
      )}

      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`banner ${error ? 'error-banner' : 'success-banner'}`}>{error || notice}</div>}

      <main className={`workspace ${settingsExpanded ? 'settings-open' : ''} ${activeView === 'sale' ? 'sale-workspace' : ''}`}>
        <aside id="branch-pos-sidebar" className="app-sidebar" aria-label="POS navigation" aria-hidden={!sidebarOpen}>
          <p className="sidebar-caption">BRANCH POS</p>
          <button type="button" className={`sidebar-link ${activeView === 'sale' ? 'active' : ''}`} title="Sales" aria-label="Sales" onClick={() => { setActiveView('sale'); setSettingsExpanded(false); setActiveCategory('All Items'); setSearch(''); }}>
            <span className="sidebar-icon"><NavigationIcon name="sale" /></span><span>Sales</span>
          </button>
          <button type="button" className={`sidebar-link ${activeView === 'sales' ? 'active' : ''}`} title="Orders" aria-label="Orders" onClick={() => { setActiveView('sales'); setSettingsExpanded(false); }}>
            <span className="sidebar-icon"><NavigationIcon name="orders" /></span><span>Orders</span>
          </button>
          <button type="button" className={`sidebar-link ${activeView === 'reports' ? 'active' : ''}`} title="Analytics" aria-label="Analytics" onClick={() => { setActiveView('reports'); setSettingsExpanded(false); }}>
            <span className="sidebar-icon"><NavigationIcon name="reports" /></span><span>Analytics</span>
          </button>
          <button type="button" className={`sidebar-link ${customerLoginOpen || customerSaved ? 'active' : ''}`} title="Customers" aria-label="Customers" onClick={openCustomerPicker}>
            <span className="sidebar-icon"><NavigationIcon name="customers" /></span><span>Customers</span>
          </button>
          <button type="button" className={`sidebar-link ${activeView === 'invoices' ? 'active' : ''}`} title="Invoices" aria-label="Invoices" onClick={() => { setActiveView('invoices'); setSettingsExpanded(false); }}>
            <span className="sidebar-icon"><NavigationIcon name="invoices" /></span><span>Invoices</span>
          </button>
          <button type="button" className={`sidebar-link ${activeView === 'sessions' ? 'active' : ''}`} title="Cash sessions" aria-label="Cash sessions" onClick={() => { setActiveView('sessions'); setSettingsExpanded(false); }}>
            <span className="sidebar-icon"><NavigationIcon name="sessions" /></span><span>Cash sessions</span>
          </button>
          <button type="button" className="sidebar-link" title="Sync" aria-label="Sync" onClick={() => refreshData(ordersPage)} disabled={loading}>
            <span className="sidebar-icon"><NavigationIcon name="sync" /></span><span>{loading ? 'Syncing…' : 'Sync'}</span>
          </button>
          <button type="button" className={`sidebar-link ${settingsExpanded ? 'active' : ''}`} title="Settings" aria-label="Settings" aria-expanded={settingsExpanded} onClick={() => {
            const expanding = !settingsExpanded;
            setSettingsExpanded(expanding);
            if (expanding) { setActiveView('settings'); setSettingsSection('general'); }
            else if (activeView !== 'sale') setActiveView('sale');
          }}>
            <span className="sidebar-icon"><NavigationIcon name="settings" /></span><span>Settings</span>
          </button>
          {settingsExpanded && (
            <nav className="settings-sidebar-nav" aria-label="Settings and POS tools">
              <button type="button" className={`sidebar-subnav-link ${activeView === 'billing' ? 'active' : ''}`} onClick={() => setActiveView('billing')}>Billing & payments{pendingOrders.length > 0 && <span className="sidebar-badge">{pendingOrders.length}</span>}</button>
              <button type="button" className={`sidebar-subnav-link ${activeView === 'invoices' ? 'active' : ''}`} onClick={() => setActiveView('invoices')}>Generate invoices</button>
              <button type="button" className={`sidebar-subnav-link ${activeView === 'addressBook' ? 'active' : ''}`} onClick={() => {
                setActiveView('addressBook');
                if (settings?.googleMapsConfigured && !addressBookLocationStatus && !addressDraft.line1 && !addressDraft.city) detectAddressBookLocation();
              }}>Address Book</button>
              <button type="button" className={`sidebar-subnav-link ${activeView === 'favorites' ? 'active' : ''}`} onClick={() => setActiveView('favorites')}>Favorite dishes <span className="favorite-count">{favoriteItemIds.length}</span></button>
              <button type="button" className={`sidebar-subnav-link ${activeView === 'items' ? 'active' : ''}`} onClick={() => setActiveView('items')}>Items</button>
              <button type="button" className={`sidebar-subnav-link ${activeView === 'settings' && settingsSection === 'about' ? 'active' : ''}`} onClick={() => { setActiveView('settings'); setSettingsSection('about'); }}>About</button>
              <button type="button" className={`sidebar-subnav-link ${activeView === 'settings' && settingsSection === 'general' ? 'active' : ''}`} onClick={() => { setActiveView('settings'); setSettingsSection('general'); }}>General settings</button>
            </nav>
          )}
          <button type="button" className="sidebar-link sidebar-clear-session" title="Clear current order and customer" aria-label="Clear current order and customer" onClick={clearTerminalSession} disabled={Boolean(working) || customerFormWorking}>
            <span className="sidebar-icon"><NavigationIcon name="clear" /></span><span>Clear session</span>
          </button>
          <button type="button" className="sidebar-link sidebar-logout" title="Sign out of Desktop POS" aria-label="Sign out of Desktop POS" onClick={logoutFromPos} disabled={loggingOut}>
            <span className="sidebar-icon"><NavigationIcon name="logout" /></span><span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
          </button>
          <div className="sidebar-branch">
            <span className="sidebar-live-dot" />
            <div><strong>{branchInfo?.name || 'Branch POS'}</strong><small>{branchInfo?.code || 'Connected'}</small></div>
          </div>
        </aside>

      {['sale', 'items', 'favorites'].includes(activeView) && <div className={`pos-layout ${activeView !== 'sale' ? 'items-view' : ''} ${checkoutStep ? 'checkout-active' : ''}`}>
        <section className="menu-panel">
          {['sale', 'items', 'favorites'].includes(activeView) && (
            <label className="top-search menu-search">
              <svg className="top-search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu items by name or category" aria-label="Search menu items" />
              {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>×</button>}
            </label>
          )}
          {activeView === 'sale' && (
            <section className="restaurant-strip" aria-label="Restaurants">
              <div className="restaurant-banner-copy">
                <div className="restaurant-banner-heading">
                  <span className="restaurant-banner-label">YOUR RECOMMENDED RESTAURANTS</span>
                  {visibleRestaurants.length > 5 && (
                    <button
                      type="button"
                      className="restaurant-view-all"
                      aria-expanded={showAllRestaurants}
                      onClick={() => setShowAllRestaurants((shown) => !shown)}
                    >
                      {showAllRestaurants ? 'Show less' : 'View all'}
                    </button>
                  )}
                </div>
                {branchInfo?.restaurants?.length ? (
                  <div className="restaurant-name-list">
                    {(showAllRestaurants ? visibleRestaurants : visibleRestaurants.slice(0, 5)).map((restaurant) => (
                    <button
                      type="button"
                      className={`restaurant-name-chip ${activeRestaurantId === String(restaurant.id) ? 'active' : ''}`}
                      key={restaurant.id || restaurant.name}
                      aria-pressed={activeRestaurantId === String(restaurant.id)}
                      onClick={() => {
                        setActiveRestaurantId(String(restaurant.id));
                        setActiveCategory('All Items');
                      }}
                    >{restaurant.name}</button>
                  ))}
                  </div>
                ) : <span className="restaurant-loading">{branchInfo ? 'No restaurants to show' : 'Loading restaurants…'}</span>}
              </div>
            </section>
          )}
          {activeView !== 'sale' && (
            <div className="section-heading">
              <div>
              <p className="eyebrow">MENU CATALOG</p>
              <h2>{activeView === 'favorites' ? 'Favorite dishes' : 'Items'}</h2>
              </div>
              <span className="count-pill">{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}</span>
            </div>
          )}
          {['sale', 'items', 'favorites'].includes(activeView) && (
            <>
              {activeView === 'sale' && (
                <section className="category-discovery" aria-label="Browse categories">
                  <div className="discovery-heading">
                  <div><p className="eyebrow">MENU CATEGORIES</p><h3>Choose a category</h3></div>
                  <div className="discovery-meta">
                    <span className="count-pill">{visibleItems.length} {visibleItems.length === 1 ? 'dish' : 'dishes'}</span>
                    <span>{categories.length} categories</span>
                  </div>
                  </div>
                </section>
              )}
              <div
                className="food-type-picker"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setIsFoodTypeMenuOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setIsFoodTypeMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  className="food-type-trigger"
                  aria-expanded={isFoodTypeMenuOpen}
                  aria-controls="food-type-options"
                  onClick={() => setIsFoodTypeMenuOpen((open) => !open)}
                >
                  Food Type
                  <span className={`food-type-chevron ${isFoodTypeMenuOpen ? 'open' : ''}`} aria-hidden="true" />
                </button>
                {isFoodTypeMenuOpen && (
                  <div className="food-type-options" id="food-type-options" role="group" aria-label="Choose food type">
                    {[
                      ['ALL', 'All food types'],
                      ['VEG', 'Veg'],
                      ['NON_VEG', 'Non-veg'],
                      ['EGG', 'Egg'],
                      ['VEGAN', 'Vegan'],
                      ['BEVERAGE', 'Beverage'],
                    ].map(([type, label]) => (
                      <button
                        type="button"
                        key={type}
                        className={`food-type-option ${activeFoodType === type ? 'active' : ''}`}
                        aria-pressed={activeFoodType === type}
                        onClick={() => {
                          setActiveFoodType(type);
                          setIsFoodTypeMenuOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {['items', 'sale', 'favorites'].includes(activeView) && (
            <div className={`catalog-browser ${activeView === 'favorites' ? 'favorites-browser' : ''}`}>
              {activeView !== 'favorites' && (
                <nav className="catalog-category-rail" aria-label="Menu categories">
                  {categoryNames.map((category) => (
                    <button
                      type="button"
                      key={category}
                      className={`catalog-category-button ${activeCategory === category ? 'active' : ''}`}
                      aria-pressed={activeCategory === category}
                      onClick={() => setActiveCategory(category)}
                      title={category}
                    >
                      <span aria-hidden="true">{category === 'All Items' ? '▦' : category.trim().charAt(0).toUpperCase()}</span>
                      <strong>{category}</strong>
                    </button>
                  ))}
                </nav>
              )}
              {loading ? <p className="empty-state">Loading restaurant menu…</p> : (
                <div className="item-grid">
                  {visibleItems.map((item) => {
                    const quantityInCart = cart.find((line) => String(line.item._id) === String(item._id))?.quantity || 0;
                    const isFavorite = favoriteItemIds.includes(String(item._id));
                    const isUnavailable = item.availability === false || item.status !== 'ACTIVE';
                    const itemRestaurantId = String(item.restaurantId?._id || item.restaurantId?.id || item.restaurantId || '');
                    const restaurantName = restaurantNameById.get(itemRestaurantId);
                    return (
                    <article
                      key={item._id}
                      className={`menu-item ${quantityInCart ? 'in-cart' : ''}`}
                      onClick={(event) => {
                        if (event.target.closest('button') || checkoutStep || isUnavailable) return;
                        if (activeView === 'items') setActiveView('sale');
                        addToCart(item);
                      }}
                    >
                      <span className="menu-photo-wrap">
                        {item.image ? (
                          <img className="item-photo" src={item.image} alt={item.name} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />
                        ) : (
                          <span className="item-art" aria-hidden="true">{item.name?.trim()?.[0]?.toUpperCase() || 'M'}</span>
                        )}
                        <span className="item-category">{item.categoryId?.name || item.category || 'Menu item'}</span>
                        {(item.availability === false || item.status !== 'ACTIVE') && <span className="item-unavailable-badge">{item.status !== 'ACTIVE' ? 'Inactive' : 'Unavailable'}</span>}
                        {quantityInCart > 0 && <span className="item-quantity-badge">{quantityInCart} in order</span>}
                        <button type="button" className={`favorite-toggle ${isFavorite ? 'is-favorite' : ''}`} aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} aria-pressed={isFavorite} onClick={() => toggleFavorite(item._id)}>
                          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.2-8.8 10.1-8.8 10.1S3.2 14 3.2 8.8A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.4Z" /></svg>
                        </button>
                      </span>
                      <strong className="menu-item-name">{item.name}</strong>
                      {restaurantName && <span className="menu-item-restaurant">{restaurantName}</span>}
                      {isFavorite && <span className="favorite-food-label">Your favorite food</span>}
                      <span className="item-bottom">
                        <span>{money(item.price)}</span>
                        <span className={`food-type-label food-type-${String(item.foodType || 'VEG').toLowerCase().replace('_', '-')}`}>
                          <span className="food-type-marker" aria-hidden="true" />
                          {String(item.foodType || 'VEG').replace('_', '-')}
                        </span>
                        <button type="button" className="menu-add-button" aria-label={`Add ${item.name} to order`} onClick={() => { if (activeView === 'items') setActiveView('sale'); addToCart(item); }} disabled={checkoutStep || isUnavailable}><span className="add-mark">+</span></button>
                      </span>
                    </article>
                    );
                  })}
                </div>
              )}
              {!loading && visibleItems.length === 0 && <p className="empty-state">{search.trim() ? "Sorry, this isn't available." : activeView === 'favorites' ? 'No favorite dishes yet. Tap the heart on a menu item to save it here.' : 'No available menu items found in this category.'}</p>}
            </div>
          )}
        </section>

        {activeView === 'sale' && <aside className="side-panel">
          <section className="card">
            <div className="section-heading compact"><div><p className="eyebrow">YOUR SELECTION</p><h2>Your order <span className="count-pill">{cart.reduce((count, line) => count + line.quantity, 0)}</span></h2><p className="cart-summary">{cart.reduce((count, line) => count + line.quantity, 0)} {cart.reduce((count, line) => count + line.quantity, 0) === 1 ? 'item' : 'items'} · {money(total)}</p></div></div>
            {!checkoutStep ? <>
            <div className="order-fields">
              {orderType === 'DINE_IN' && <label>Table number<input value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} placeholder="e.g. 4" /></label>}
              {orderType === 'DELIVERY' && (
                <div className="delivery-form">
                  <div className="delivery-form-heading">
                    <div><strong>Delivery details</strong><small>Recipient and drop-off address</small></div>
                    <button type="button" className="secondary-button location-button" onClick={detectDeliveryLocation} disabled={locationStatus.startsWith('Requesting') || locationStatus.startsWith('Looking up')}>
                      {locationStatus.startsWith('Requesting') ? 'Detecting…' : locationStatus.startsWith('Looking up') ? 'Filling address…' : deliveryLocation ? 'Update location' : 'Detect location'}
                    </button>
                  </div>
                  {savedAddresses.length > 0 && <label>Use saved address
                    <select value={selectedSavedAddressId} onChange={(event) => {
                      setSelectedSavedAddressId(event.target.value);
                      const address = savedAddresses.find((entry) => entry.id === event.target.value);
                      if (address) useSavedAddress(address);
                    }}>
                      <option value="">Enter delivery details manually</option>
                      {savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.name} · {address.city}</option>)}
                    </select>
                  </label>}
                  {locationStatus && <div className={`location-status ${deliveryLocation ? 'location-success' : ''}`} role="status">
                    <span>{locationStatus}</span>
                  </div>}
                  {deliveryLocation && <p className="location-coordinates">GPS: {deliveryLocation.latitude.toFixed(5)}, {deliveryLocation.longitude.toFixed(5)}</p>}
                  <label>Recipient name<input required autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" /></label>
                  <label>Phone number<input required type="tel" autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Mobile number" /></label>
                  <label>House / street address<input required autoComplete="street-address" value={deliveryAddress.line1} onChange={(event) => updateDeliveryAddress('line1', event.target.value)} placeholder="Flat, house, street" /></label>
                  <label>Area / landmark <span className="optional">(optional)</span><input autoComplete="address-line2" value={deliveryAddress.line2} onChange={(event) => updateDeliveryAddress('line2', event.target.value)} placeholder="Area or nearby landmark" /></label>
                  <div className="delivery-address-row">
                    <label>City<input required autoComplete="address-level2" value={deliveryAddress.city} onChange={(event) => updateDeliveryAddress('city', event.target.value)} placeholder="City" /></label>
                    <label>Postal code<input required inputMode="numeric" autoComplete="postal-code" maxLength={6} value={deliveryAddress.postalCode} onChange={(event) => updateDeliveryAddress('postalCode', event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" /></label>
                  </div>
                  <div className="delivery-address-row">
                    <label>State<input autoComplete="address-level1" value={deliveryAddress.state} onChange={(event) => updateDeliveryAddress('state', event.target.value)} placeholder="State" /></label>
                    <label>GST state code <span className="optional">(if GST enabled)</span><input inputMode="numeric" maxLength={2} value={placeOfSupplyStateCode} onChange={(event) => setPlaceOfSupplyStateCode(event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 29" /></label>
                  </div>
                  <label>Delivery instructions <span className="optional">(optional)</span><input value={deliveryAddress.instructions} onChange={(event) => updateDeliveryAddress('instructions', event.target.value)} placeholder="Gate, floor, or delivery note" /></label>
                  <p className="delivery-privacy">Device location is optional and shared with this branch only when the order is placed. Street address must be confirmed above.</p>
                </div>
              )}
              {orderType !== 'DELIVERY' && <label>Customer name <span className="optional">(optional)</span><input autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Name" /></label>}
            </div>
            <div className="cart-lines">
              {cart.map(({ item, quantity }) => (
                <div className="cart-line" key={item._id}>
                  {item.image ? <img className="cart-item-photo" src={item.image} alt="" /> : <span className="cart-item-photo item-photo-fallback">{item.name?.[0] || 'M'}</span>}
                  <div className="cart-line-info"><strong>{item.name}</strong><span>{money(item.price)} each</span></div>
                  <div className="quantity-control">
                    <button aria-label={`Remove one ${item.name}`} onClick={() => setQuantity(String(item._id), quantity - 1)}>−</button>
                    <span>{quantity}</span>
                    <button aria-label={`Add one ${item.name}`} onClick={() => setQuantity(String(item._id), quantity + 1)}>+</button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <p className="empty-state small-empty">Choose items from the menu to begin.</p>}
            </div>
            <div className="total-row"><span>Order subtotal</span><strong>{money(total)}</strong></div>
            <button className="primary-button full-width" onClick={placeOrder} disabled={!cart.length || Boolean(working)}>
              {working === 'order' ? 'Preparing payment…' : cart.length ? `Continue to payment · ${money(total)}` : 'Add an item to get started'}
            </button>
            </> : <div className="checkout-payment">
              <div className="checkout-payment-heading">
                <button type="button" className="text-button" onClick={cancelCheckout} disabled={working === 'checkout'}>{checkoutOrder ? 'Go to billing (unpaid)' : '← Back to order'}</button>
                <span className="checkout-step-label">PAYMENT · STEP 2 OF 2</span>
                <h3>Review and confirm payment</h3>
              </div>
              <div className="checkout-order-review">
                {checkoutOrder && <p className="checkout-warning">Order {checkoutOrder.orderNumber} has been saved but is still unpaid. Retrying here will only retry payment, not create a duplicate order.</p>}
                <div className="checkout-lines">
                  {(checkoutOrder?.items || cart.map(({ item, quantity }) => ({ name: item.name, price: item.price, quantity }))).map((item, index) => (
                    <div className="checkout-line" key={`${item.name}-${index}`}>
                      <span>{item.name}</span>
                      <div className="checkout-line-quantity">
                        <button type="button" aria-label={`Remove one plate of ${item.name}`} disabled={!checkoutOrder?._id || Boolean(quantityUpdating) || Number(item.quantity) <= 1} onClick={() => updateCheckoutQuantity(String(item.itemId), Number(item.quantity) - 1)}>−</button>
                        <span>{item.quantity}</span>
                        <button type="button" aria-label={`Add one plate of ${item.name}`} disabled={!checkoutOrder?._id || Boolean(quantityUpdating) || Number(item.quantity) >= 99} onClick={() => updateCheckoutQuantity(String(item.itemId), Number(item.quantity) + 1)}>+</button>
                      </div>
                      <strong>{money(Number(item.price) * Number(item.quantity))}</strong>
                    </div>
                  ))}
                </div>
                {(checkoutOrder?.orderType || orderType) === 'DELIVERY' && <div className="checkout-address">
                  <div className="checkout-address-heading">
                    <div>
                      <strong>Deliver to {checkoutOrder?.customerName || customerName}</strong>
                      <span>{checkoutOrder?.customerPhone || customerPhone}</span>
                      <span>{[checkoutOrder?.deliveryAddress?.line1 || deliveryAddress.line1, checkoutOrder?.deliveryAddress?.line2 || deliveryAddress.line2, checkoutOrder?.deliveryAddress?.city || deliveryAddress.city, checkoutOrder?.deliveryAddress?.state || deliveryAddress.state, checkoutOrder?.deliveryAddress?.postalCode || deliveryAddress.postalCode].filter(Boolean).join(', ')}</span>
                      {(checkoutOrder?.deliveryAddress?.instructions || deliveryAddress.instructions) && <small>Instructions: {checkoutOrder?.deliveryAddress?.instructions || deliveryAddress.instructions}</small>}
                    </div>
                    <div className="checkout-address-actions">
                      <button type="button" className="text-button" onClick={openCheckoutAddressEditor} disabled={Boolean(working)}>Change address</button>
                      <button type="button" className="text-button" onClick={() => { openCheckoutAddressEditor(); setCheckoutAddressDraft({ name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' }); }} disabled={Boolean(working)}>+ Add new address</button>
                    </div>
                  </div>
                  {savedAddresses.length > 0 && <label className="checkout-address-picker">Choose a saved address
                    <select value={selectedSavedAddressId} onChange={(event) => chooseCheckoutAddress(event.target.value)} disabled={Boolean(working)}>
                      <option value="">Select a saved address</option>
                      {savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.name} · {address.city}</option>)}
                    </select>
                  </label>}
                  {checkoutAddressEditorOpen && <div className="checkout-address-editor">
                    <form onSubmit={saveCheckoutAddress}>
                      <div className="checkout-address-fields">
                        <label>Recipient name<input required autoComplete="name" value={checkoutAddressDraft.name} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                        <label>Phone number<input required type="tel" autoComplete="tel" value={checkoutAddressDraft.phone} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                        <label>House / street address<input required autoComplete="street-address" value={checkoutAddressDraft.line1} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, line1: event.target.value }))} /></label>
                        <label>Area / landmark<input autoComplete="address-line2" value={checkoutAddressDraft.line2} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, line2: event.target.value }))} /></label>
                        <label>City<input required autoComplete="address-level2" value={checkoutAddressDraft.city} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, city: event.target.value }))} /></label>
                        <label>State<input autoComplete="address-level1" value={checkoutAddressDraft.state} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, state: event.target.value }))} /></label>
                        <label>Postal code<input required inputMode="numeric" autoComplete="postal-code" maxLength={6} value={checkoutAddressDraft.postalCode} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, postalCode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} /></label>
                        <label>Delivery instructions<input value={checkoutAddressDraft.instructions} onChange={(event) => setCheckoutAddressDraft((current) => ({ ...current, instructions: event.target.value }))} /></label>
                      </div>
                      <div className="checkout-address-form-actions">
                        <button type="submit" className="primary-button" disabled={Boolean(working)}>{working === 'address' ? 'Saving address…' : 'Save and use address'}</button>
                        <button type="button" className="text-button" onClick={() => setCheckoutAddressEditorOpen(false)} disabled={Boolean(working)}>Cancel</button>
                      </div>
                    </form>
                  </div>}
                </div>}
                <div className="checkout-total"><span>Total due</span><strong>{money(checkoutOrder?.grandTotal ?? total)}</strong></div>
              </div>
              <div className="checkout-tender">
                <fieldset className="checkout-methods">
                  <legend>Choose payment method</legend>
                  {checkoutPaymentMethods.map((method) => (
                    <label className={`checkout-method ${paymentMethod === method ? 'selected' : ''}`} key={method}>
                      <input type="radio" name="checkout-payment-method" value={method} checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} />
                      <span><strong>{({ CASH: 'Cash', CARD: 'Debit / Credit Card', UPI: 'UPI', OTHER: 'Other' })[method] || method}</strong><small>{method === 'CASH' ? 'Collect cash at the counter / delivery' : ['UPI', 'CARD'].includes(method) ? 'Pay securely through provider-hosted checkout' : 'Confirm payment was received'}</small></span>
                    </label>
                  ))}
                </fieldset>
                {['UPI', 'CARD'].includes(paymentMethod) && <>
                  {paymentGatewayProviders.length ? <label className="checkout-gateway-select">Payment provider
                    <select value={gatewayProvider} onChange={(event) => setGatewayProvider(event.target.value)} disabled={Boolean(working) || Boolean(gatewayTransaction)}>
                      {paymentGatewayProviders.map((provider) => <option key={provider} value={provider}>{provider === 'PAYTM' ? 'Paytm' : 'PhonePe'} · Sandbox</option>)}
                    </select>
                  </label> : <p className="checkout-warning">No sandbox payment provider is configured for this branch. Ask an admin to set up Paytm or PhonePe in Branch → Integrations.</p>}
                </>}
                {requiresCashSession && !openSessions.length && <div className="checkout-warning">
                  <span>Open a cash session before recording payment.</span>
                  <button type="button" className="text-button" onClick={() => setActiveView('sessions')}>Open cash sessions</button>
                </div>}
                {paymentMethod === 'CASH' && <p className="checkout-payment-note">Confirm cash collection to record payment, place the order, and generate its bill.</p>}
                {['UPI', 'CARD'].includes(paymentMethod) && <p className="checkout-payment-note">Card number, CVV, and UPI authorization are entered only on the provider’s secure checkout. RMS verifies the provider’s server-side payment status before marking the order paid.</p>}
                {paymentMethod === 'OTHER' && <div className="checkout-payment-note">
                  {otherPaymentQr
                    ? <img src={otherPaymentQr} alt={`Branch payment QR for order ${checkoutOrder?.orderNumber || ''}`} className="mx-auto max-h-56 w-auto rounded-lg border border-slate-200 bg-white p-2" />
                    : 'No branch QR image is available. Ask an admin to upload one in Branch → payment methods.'}
                  <p className="mt-2">Verify the payment in the branch account before confirming receipt.</p>
                </div>}
                <button type="button" className="primary-button full-width" onClick={confirmPaymentAndPlaceOrder} disabled={Boolean(working) || (paymentMethod === 'CASH' && requiresCashSession && !openSessions.length) || (['UPI', 'CARD'].includes(paymentMethod) && !paymentGatewayProviders.length) || (paymentMethod === 'OTHER' && !otherPaymentQr) || Boolean(gatewayTransaction)}>
                  {working === 'checkout' ? 'Processing payment…' : paymentMethod === 'CASH' ? 'Cash received · Place order and generate bill' : paymentMethod === 'OTHER' ? 'Payment verified · Place order' : `Continue to ${gatewayProvider === 'PAYTM' ? 'Paytm' : 'PhonePe'} checkout`}
                </button>
                {gatewayTransaction && <div className="checkout-warning"><span>Payment is in progress. Keep this window open; it will verify payment with {gatewayTransaction.provider === 'PAYTM' ? 'Paytm' : 'PhonePe'} automatically.</span><button type="button" className="text-button" onClick={() => api.openCheckout(gatewayTransaction.checkoutUrl).catch((requestError) => setError(errorMessage(requestError)))}>Reopen checkout</button></div>}
              </div>
            </div>}
          </section>

          <section className="card session-card">
            <div className="section-heading compact"><div><p className="eyebrow">CASH CONTROL</p><h2>Cash session</h2></div></div>
            {openSessions.length > 0 ? openSessions.map((session) => {
              const terminal = session.terminalId;
              return (
                <div className="session-row" key={session._id || session.id}>
                  <div><strong>{terminal?.name || 'POS terminal'}</strong><span>Open · {new Date(session.openedAt).toLocaleTimeString()}</span></div>
                  <button className="secondary-button" disabled={Boolean(working)} onClick={() => closeCashSession(session._id || session.id)}>Close</button>
                </div>
              );
            }) : terminals.length > 0 ? (
              <form className="session-form" onSubmit={openCashSession}>
                <label>Terminal
                  <select required value={terminalId} onChange={(event) => setTerminalId(event.target.value)}>
                    <option value="">Choose terminal</option>
                    {terminals.filter((terminal) => terminal.isActive).map((terminal) => <option key={activeTerminalId(terminal)} value={activeTerminalId(terminal)}>{terminal.name} · {terminal.code}</option>)}
                  </select>
                </label>
                <label>Opening cash<input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label>
                <button className="secondary-button" disabled={!terminalId || Boolean(working)}>{working === 'session' ? 'Opening…' : 'Open cash session'}</button>
              </form>
            ) : <p className="empty-state small-empty">No active POS terminal is configured. Add one in Admin → POS terminals, then refresh.</p>}
          </section>

          <section className="card recent-orders-card">
            <div className="section-heading compact"><div><p className="eyebrow">ORDER ACTIVITY</p><h2>Recent orders</h2></div><button className="text-button" onClick={() => setActiveView('sales')}>View all →</button></div>
            {orders.slice(0, 3).map((order) => (
              <button type="button" className="recent-order-row" key={order._id} onClick={() => setActiveView('sales')}>
                <span><strong>{order.orderNumber}</strong><small>{order.customerName || 'Walk-in'} · {order.orderType?.replace('_', ' ') || 'Order'}</small></span>
                <strong>{money(order.grandTotal)}</strong>
                <span className={`order-status status-${order.status.toLowerCase()}`}>{order.status}</span>
              </button>
            ))}
            {orders.length === 0 && <p className="empty-state small-empty">Recent orders will appear here.</p>}
          </section>
        </aside>}
      </div>}

      {['sales', 'billing', 'invoices'].includes(activeView) && (
        <section className="records-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{activeView === 'billing' ? 'PAYMENT QUEUE' : activeView === 'invoices' ? 'PAID ORDERS' : 'BRANCH ACTIVITY'}</p>
              <h2>{activeView === 'billing' ? 'Billing' : activeView === 'invoices' ? 'Invoices' : 'Recent orders'}</h2>
            </div>
            <span className="count-pill">{(activeView === 'billing' ? pendingOrders : activeView === 'invoices' ? paidOrders : orders).length} orders</span>
          </div>
          {activeView === 'billing' && <label className="billing-method">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="CARD">Debit / Credit Card</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></label>}
          {(activeView === 'billing' ? pendingOrders : activeView === 'invoices' ? paidOrders : orders).map((order) => (
            <article className="order-record" key={order._id}>
              <div className="order-record-main">
                <div className="order-record-heading">
                  <strong>{order.orderNumber}</strong>
                  <span className={`order-status status-${order.status.toLowerCase()}`}>{order.status}</span>
                </div>
                <p>{order.customerName || 'Walk-in customer'} · {order.orderType?.replace('_', ' ') || 'Order'} · {new Date(order.createdAt).toLocaleString()}</p>
                {order.orderType === 'DELIVERY' && <small>{order.customerPhone || ''}{order.deliveryAddress ? ` · ${[order.deliveryAddress.line1, order.deliveryAddress.line2, order.deliveryAddress.city, order.deliveryAddress.state, order.deliveryAddress.postalCode].filter(Boolean).join(', ')}` : ''}</small>}
                <small>{(order.items || []).map((line) => `${line.name} × ${line.quantity}`).join(' · ')}</small>
              </div>
              <strong className="order-record-total">{money(order.grandTotal)}</strong>
              {activeView === 'billing' && (
                <button className="primary-button" disabled={Boolean(working)} onClick={() => collectPayment(order)}>
                  {working === `pay-${order._id}` ? 'Processing…' : 'Collect payment'}
                </button>
              )}
              {(activeView === 'invoices' || (activeView === 'sales' && order.status === 'PAID')) && (
                <button className="secondary-button" onClick={() => setInvoiceOrder(order)}>View / print invoice</button>
              )}
            </article>
          ))}
          {(activeView === 'billing' ? pendingOrders : activeView === 'invoices' ? paidOrders : orders).length === 0 && (
            <p className="empty-state">{activeView === 'billing' ? 'No orders are waiting for payment.' : activeView === 'invoices' ? 'Paid invoices will appear here.' : 'Sales will appear here after orders are placed.'}</p>
          )}
          {ordersPagination.pages > 1 && (
            <div className="records-pagination">
              <span>Page {ordersPage} of {ordersPagination.pages} · {ordersPagination.total} orders</span>
              <div>
                <button className="secondary-button" disabled={loading || ordersPage <= 1} onClick={() => refreshData(ordersPage - 1)}>Previous</button>
                <button className="secondary-button" disabled={loading || ordersPage >= ordersPagination.pages} onClick={() => refreshData(ordersPage + 1)}>Next</button>
              </div>
            </div>
          )}
        </section>
      )}

      {activeView === 'reports' && (
        <section className="records-panel analytics-panel">
          <div className="section-heading">
            <div><p className="eyebrow">SALES OVERVIEW</p><h2>Analytics</h2></div>
            <button className="primary-button" onClick={exportOrders} disabled={orders.length === 0}>Export page as CSV</button>
          </div>
          <div className="analytics-summary">
            <article><span>Orders on this page</span><strong>{orders.length}</strong><small>Page {ordersPage} of {ordersPagination.pages}</small></article>
            <article><span>Sales on this page</span><strong>{money(orders.reduce((sum, order) => sum + Number(order.grandTotal || 0), 0))}</strong><small>Sum of displayed order totals</small></article>
            <article><span>Paid orders</span><strong>{orders.filter((order) => order.status === 'PAID').length}</strong><small>From the currently loaded page</small></article>
            <article><span>Awaiting payment</span><strong>{orders.filter((order) => ['OPEN', 'BILLED'].includes(order.status)).length}</strong><small>From the currently loaded page</small></article>
          </div>
          <p className="report-caption">Analytics and export cover the {orders.length} orders on the loaded page. Use Recent Orders to browse other pages.</p>
          {orders.map((order) => (
            <article className="order-record report-record" key={order._id}>
              <div className="order-record-main"><div className="order-record-heading"><strong>{order.orderNumber}</strong><span className={`order-status status-${order.status.toLowerCase()}`}>{order.status}</span></div><p>{order.customerName || 'Walk-in customer'} · {order.orderType?.replace('_', ' ') || 'Order'} · {new Date(order.createdAt).toLocaleString()}</p></div>
              <strong className="order-record-total">{money(order.grandTotal)}</strong>
            </article>
          ))}
          {orders.length === 0 && <p className="empty-state">Orders will appear in reports after a sale is placed.</p>}
        </section>
      )}

      {activeView === 'addressBook' && (
        <section className="records-panel address-book-panel">
          <div className="section-heading">
            <div><p className="eyebrow">SAVED ON THIS COMPUTER ONLY</p><h2>Address Book</h2></div>
            <span className="count-pill">{savedAddresses.length} saved</span>
          </div>
          <p className="report-caption">Saved customer delivery details are stored locally on this computer and are not synced to other terminals.</p>
          {!addressBookLoaded && <p className="empty-state">Loading saved addresses…</p>}
          {addressBookLoaded && <form className="address-book-form" onSubmit={saveAddressBookEntry}>
            <div className="address-book-form-heading">
              <h3>{editingAddressId ? 'Edit saved address' : 'Add a customer address'}</h3>
              <div className="address-book-form-tools">
                <button type="button" className="secondary-button" onClick={detectAddressBookLocation} disabled={addressBookLocationStatus.startsWith('Detecting') || addressBookLocationStatus.startsWith('Looking up')}>
                  {addressBookLocationStatus.startsWith('Detecting') || addressBookLocationStatus.startsWith('Looking up') ? 'Detecting…' : 'Detect & fill location'}
                </button>
                {editingAddressId && <button type="button" className="text-button" onClick={() => { setEditingAddressId(''); setAddressDraft({ name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', instructions: '' }); }}>Cancel edit</button>}
              </div>
            </div>
            {addressBookLocationStatus && <div className={`address-location-status ${addressBookLocationStatus.startsWith('Location detected and') ? 'success' : ''}`} role="status">
              <span>{addressBookLocationStatus}</span>
            </div>}
            <div className="address-book-fields">
              <label>Customer name<input required value={addressDraft.name} onChange={(event) => setAddressDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Phone number<input required type="tel" value={addressDraft.phone} onChange={(event) => setAddressDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>House / street address<input required value={addressDraft.line1} onChange={(event) => setAddressDraft((current) => ({ ...current, line1: event.target.value }))} /></label>
              <label>Area / landmark<input value={addressDraft.line2} onChange={(event) => setAddressDraft((current) => ({ ...current, line2: event.target.value }))} /></label>
              <label>City<input required value={addressDraft.city} onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))} /></label>
              <label>State<input value={addressDraft.state} onChange={(event) => setAddressDraft((current) => ({ ...current, state: event.target.value }))} /></label>
              <label>Postal code<input required inputMode="numeric" maxLength={6} value={addressDraft.postalCode} onChange={(event) => setAddressDraft((current) => ({ ...current, postalCode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} /></label>
              <label>Delivery instructions<input value={addressDraft.instructions} onChange={(event) => setAddressDraft((current) => ({ ...current, instructions: event.target.value }))} /></label>
            </div>
            <button className="primary-button">{editingAddressId ? 'Save address changes' : 'Save address'}</button>
          </form>}
          <div className="address-book-list">
            {savedAddresses.map((address) => (
              <article className="address-book-entry" key={address.id}>
                <div><strong>{address.name}</strong><span>{address.phone}</span><p>{[address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(', ')}</p>{address.instructions && <small>Note: {address.instructions}</small>}</div>
                <div className="address-book-actions"><button className="secondary-button" type="button" onClick={() => editAddressBookEntry(address)}>Edit</button><button className="text-button" type="button" onClick={() => deleteAddressBookEntry(address.id)}>Remove</button></div>
              </article>
            ))}
            {addressBookLoaded && savedAddresses.length === 0 && <p className="empty-state">No saved addresses yet. Add one above to use it when creating a delivery order.</p>}
          </div>
        </section>
      )}

      {activeView === 'settings' && (
        <section className="records-panel settings-panel">
          <div className="section-heading"><div><p className="eyebrow">TERMINAL CONFIGURATION</p><h2>{settingsSection === 'about' ? 'About RMS POS' : 'Settings'}</h2></div></div>
          <nav className="settings-section-tabs" aria-label="Settings sections">
            {[
              ['general', 'General settings'],
              ['about', 'About'],
            ].map(([section, label]) => (
              <button type="button" key={section} className={settingsSection === section ? 'active' : ''} onClick={() => setSettingsSection(section)}>{label}</button>
            ))}
          </nav>
          {settingsSection === 'general' && <>
          <div className="settings-grid">
            <div className="settings-field"><span>Connected branch</span><strong>{branchInfo?.name || 'Branch POS'}</strong><small>{branchInfo?.code || 'Branch is assigned by the API key'}</small></div>
            <div className="settings-field"><span>Backend URL</span><strong className="settings-url">{settings?.apiUrl || 'Saved connection'}</strong><small>Connection is secured with the saved branch API key.</small></div>
            <label>POS terminal<select value={terminalId} onChange={(event) => setTerminalId(event.target.value)}><option value="">Select a terminal</option>{terminals.filter((terminal) => terminal.isActive).map((terminal) => <option key={activeTerminalId(terminal)} value={activeTerminalId(terminal)}>{terminal.name} · {terminal.code}</option>)}</select><small>Used when opening a cash session.</small></label>
            <div className="settings-field maps-key-field">
              <div className="maps-key-heading"><span>Google Maps reverse geocoding</span><span className={`maps-key-status ${settings?.googleMapsConfigured ? 'configured' : ''}`}>{settings?.googleMapsConfigured ? 'API key saved' : 'Not configured'}</span></div>
              <small>Enable the Google Geocoding API and billing for your Google Cloud API key. The key is encrypted on this computer; coordinates are sent to Google when you detect or update a delivery location.</small>
              <input type="password" autoComplete="new-password" value={googleMapsApiKey} onChange={(event) => setGoogleMapsApiKey(event.target.value)} placeholder={settings?.googleMapsConfigured ? 'Enter a new key to replace the saved key' : 'Paste Google Maps API key'} aria-label="Google Maps API key" />
              <div className="maps-key-actions">
                <button className="primary-button" disabled={savingMapsKey || !googleMapsApiKey.trim()} onClick={() => saveGoogleMapsKey()}>{savingMapsKey ? 'Saving…' : 'Save API key'}</button>
                {settings?.googleMapsConfigured && <button className="secondary-button" disabled={savingMapsKey} onClick={() => saveGoogleMapsKey(true)}>Remove saved key</button>}
              </div>
            </div>
          </div>
          <div className="settings-actions"><button className="secondary-button" onClick={() => refreshData(ordersPage)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh menu and data'}</button></div>
          </>}
          {settingsSection === 'about' && (
            <div className="settings-section-content">
              <p className="about-intro">Desktop Point of Sale for managing branch orders, payments, menu items, invoices, and cash sessions.</p>
              <div className="settings-grid">
                <div className="settings-field"><span>Application</span><strong>RMS Desktop POS</strong><small>Electron desktop application</small></div>
                <div className="settings-field"><span>Connection status</span><strong>Connected</strong><small>Branch data is loaded from the configured RMS backend.</small></div>
                <div className="settings-field"><span>Connected branch</span><strong>{branchInfo?.name || 'Branch POS'}</strong><small>{branchInfo?.code || 'Branch is assigned by the API key'}</small></div>
                <div className="settings-field"><span>POS terminal</span><strong>{terminals.find((terminal) => activeTerminalId(terminal) === String(terminalId))?.name || 'No terminal selected'}</strong><small>Manage the selected terminal in General settings.</small></div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeView === 'sessions' && (
        <section className="records-panel">
          <div className="section-heading"><div><p className="eyebrow">CASH CONTROL</p><h2>Cash sessions</h2></div><span className="count-pill">{openSessions.length} open</span></div>
          {openSessions.map((session) => (
            <div className="session-row session-record" key={session._id || session.id}>
              <div><strong>{session.terminalId?.name || 'POS terminal'}</strong><span>Opened {new Date(session.openedAt).toLocaleString()} · Float {money(session.openingCash)}</span></div>
              <button className="secondary-button" disabled={Boolean(working)} onClick={() => closeCashSession(session._id || session.id)}>Close session</button>
            </div>
          ))}
          {openSessions.length === 0 && (terminals.length > 0 ? (
            <form className="session-form session-start" onSubmit={openCashSession}>
              <label>Terminal
                <select required value={terminalId} onChange={(event) => setTerminalId(event.target.value)}>
                  <option value="">Choose terminal</option>
                  {terminals.filter((terminal) => terminal.isActive).map((terminal) => <option key={activeTerminalId(terminal)} value={activeTerminalId(terminal)}>{terminal.name} · {terminal.code}</option>)}
                </select>
              </label>
              <label>Opening cash<input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label>
              <button className="primary-button" disabled={!terminalId || Boolean(working)}>{working === 'session' ? 'Opening…' : 'Open cash session'}</button>
            </form>
          ) : <p className="empty-state">No active POS terminal is configured. Add one in Admin → POS terminals, then refresh.</p>)}
          <h3 className="history-heading">Recent sessions</h3>
          {sessions.filter((session) => session.status !== 'OPEN').slice(0, 10).map((session) => (
            <div className="session-row session-record" key={session._id || session.id}>
              <div><strong>{session.terminalId?.name || 'POS terminal'}</strong><span>{session.status} · {new Date(session.openedAt).toLocaleString()} · Opening {money(session.openingCash)}</span></div>
              <span>{session.closedAt ? `Closed ${new Date(session.closedAt).toLocaleTimeString()}` : ''}</span>
            </div>
          ))}
        </section>
      )}

      {invoiceOrder && (
        <section className="invoice-sheet">
          <div className="invoice-actions"><button className="secondary-button" onClick={() => setInvoiceOrder(null)}>Back</button><button className="primary-button" onClick={() => window.print()}>Print POS invoice</button></div>
          <div className="invoice-content">
            <p className="eyebrow">POS PAYMENT RECEIPT</p>
            <h1>{branchInfo?.name || 'RMS POS'}</h1>
            <p>{branchInfo?.code || ''}</p>
            <hr />
            <div className="invoice-meta"><span>Invoice / Order</span><strong>{invoiceOrder.orderNumber}</strong></div>
            <div className="invoice-meta"><span>Date</span><strong>{new Date(invoiceOrder.createdAt).toLocaleString()}</strong></div>
            <div className="invoice-meta"><span>Customer</span><strong>{invoiceOrder.customerName || 'Walk-in customer'}</strong></div>
            <div className="invoice-meta"><span>Payment method</span><strong>{invoiceOrder.payment?.method || '—'}</strong></div>
            <div className="invoice-meta"><span>Paid at</span><strong>{invoiceOrder.payment?.paidAt ? new Date(invoiceOrder.payment.paidAt).toLocaleString() : '—'}</strong></div>
            {invoiceOrder.orderType === 'DELIVERY' && <>
              <div className="invoice-meta"><span>Phone</span><strong>{invoiceOrder.customerPhone || '—'}</strong></div>
              <div className="invoice-meta"><span>Delivery address</span><strong>{[invoiceOrder.deliveryAddress?.line1, invoiceOrder.deliveryAddress?.line2, invoiceOrder.deliveryAddress?.city, invoiceOrder.deliveryAddress?.state, invoiceOrder.deliveryAddress?.postalCode].filter(Boolean).join(', ') || '—'}</strong></div>
              {invoiceOrder.deliveryAddress?.instructions && <div className="invoice-meta"><span>Instructions</span><strong>{invoiceOrder.deliveryAddress.instructions}</strong></div>}
            </>}
            <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>{(invoiceOrder.items || []).map((line, index) => <tr key={`${line.name}-${index}`}><td>{line.name}</td><td>{line.quantity}</td><td>{money(line.price)}</td><td>{money(Number(line.price) * Number(line.quantity))}</td></tr>)}</tbody>
            </table>
            <div className="invoice-total"><span>Subtotal</span><strong>{money(invoiceOrder.subtotal)}</strong></div>
            <div className="invoice-total"><span>Tax</span><strong>{money(invoiceOrder.taxAmount)}</strong></div>
            <div className="invoice-total grand"><span>Total paid</span><strong>{money(invoiceOrder.grandTotal)}</strong></div>
            <p className="invoice-thanks">Thank you for your visit.</p>
          </div>
        </section>
      )}
      </main>
    </div>
  );
};

export default App;
