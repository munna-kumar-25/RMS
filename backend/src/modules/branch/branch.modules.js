import { AccessError } from '../access/authorization.js';
import { assertChannels } from './branch.validation.js';

export const BRANCH_MODULE_DEFAULTS = {
  menuPublication: {
    published: false,
    channels: ['dine_in'],
  },
  kitchenRouting: {
    defaultStation: '',
    stations: [],
  },
  inventoryPolicies: {
    lowStockAlerts: true,
    preventNegativeStock: true,
    trackExpiry: false,
    defaultMinimumStock: 0,
    defaultReorderLevel: 0,
  },
  receiptPrinting: {
    enabled: false,
    printerName: '',
    paperWidth: '80mm',
    copies: 1,
    footer: '',
  },
  taxConfiguration: {
    gstEnabled: false,
    gstin: '',
    stateCode: '',
    serviceChargeRate: 0,
  },
  paymentConfiguration: {
    enabledMethods: ['CASH'],
  },
};

const fail = (message) => {
  throw new AccessError(message, 400);
};

const objectWithKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} settings must be an object.`);
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length) fail(`Unknown ${label} setting: ${unknown[0]}.`);
};

const boolean = (value, label) => {
  if (typeof value !== 'boolean') fail(`${label} must be true or false.`);
  return value;
};

const text = (value, label, maxLength, { required = false } = {}) => {
  if (value !== undefined && value !== null && typeof value !== 'string') fail(`${label} must be text.`);
  const normalized = (value ?? '').trim();
  if (required && !normalized) fail(`${label} is required.`);
  if (normalized.length > maxLength) fail(`${label} must be ${maxLength} characters or fewer.`);
  return normalized;
};

const quantity = (value, label) => {
  if (value === '' || value === null || value === undefined) fail(`${label} is required.`);
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1000000) {
    fail(`${label} must be a number between 0 and 1,000,000.`);
  }
  return normalized;
};

const validateMenuPublication = (value) => {
  objectWithKeys(value, ['published', 'channels'], 'menu publication');
  return {
    published: boolean(value.published, 'Menu publication'),
    channels: assertChannels(value.channels),
  };
};

const validateKitchenRouting = (value) => {
  objectWithKeys(value, ['defaultStation', 'stations'], 'kitchen routing');
  if (!Array.isArray(value.stations) || value.stations.length > 20) {
    fail('Kitchen routing must contain no more than 20 stations.');
  }
  const stationNames = new Set();
  const assignedCategories = new Set();
  const stations = value.stations.map((station) => {
    objectWithKeys(station, ['name', 'categories'], 'kitchen station');
    const name = text(station.name, 'Station name', 60, { required: true });
    const normalizedName = name.toLocaleLowerCase();
    if (stationNames.has(normalizedName)) fail('Kitchen station names must be unique.');
    stationNames.add(normalizedName);
    if (!Array.isArray(station.categories) || station.categories.length > 50) {
      fail(`Categories for ${name} must be a list of at most 50 values.`);
    }
    const categories = [...new Set(station.categories.map((category) => text(category, 'Category name', 60, { required: true })))];
    categories.forEach((category) => {
      const normalizedCategory = category.toLocaleLowerCase();
      if (assignedCategories.has(normalizedCategory)) fail(`Category ${category} can only route to one station.`);
      assignedCategories.add(normalizedCategory);
    });
    return { name, categories };
  });
  const defaultStation = text(value.defaultStation, 'Default station', 60);
  const selectedDefault = stations.find((station) => station.name.toLocaleLowerCase() === defaultStation.toLocaleLowerCase());
  if (defaultStation && !selectedDefault) {
    fail('Default station must match one of the configured stations.');
  }
  return { defaultStation: selectedDefault?.name || '', stations };
};

const validateInventoryPolicies = (value) => {
  objectWithKeys(value, [
    'lowStockAlerts',
    'preventNegativeStock',
    'trackExpiry',
    'defaultMinimumStock',
    'defaultReorderLevel',
  ], 'inventory policy');
  return {
    lowStockAlerts: boolean(value.lowStockAlerts, 'Low-stock alerts'),
    preventNegativeStock: boolean(value.preventNegativeStock, 'Prevent negative stock'),
    trackExpiry: boolean(value.trackExpiry, 'Expiry tracking'),
    defaultMinimumStock: quantity(value.defaultMinimumStock, 'Default minimum stock'),
    defaultReorderLevel: quantity(value.defaultReorderLevel, 'Default reorder level'),
  };
};

const validateReceiptPrinting = (value) => {
  objectWithKeys(value, ['enabled', 'printerName', 'paperWidth', 'copies', 'footer'], 'receipt printing');
  if (!['58mm', '80mm'].includes(value.paperWidth)) fail('Receipt paper width must be 58mm or 80mm.');
  const copies = Number(value.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 3) fail('Receipt copies must be between 1 and 3.');
  return {
    enabled: boolean(value.enabled, 'Receipt printing'),
    printerName: text(value.printerName, 'Printer name', 80),
    paperWidth: value.paperWidth,
    copies,
    footer: text(value.footer, 'Receipt footer', 250),
  };
};

const validateTaxConfiguration = (value) => {
  objectWithKeys(value, ['gstEnabled', 'gstin', 'stateCode', 'serviceChargeRate'], 'tax');
  const gstEnabled = boolean(value.gstEnabled, 'GST');
  const gstin = text(value.gstin, 'GSTIN', 15).toUpperCase();
  const stateCode = text(value.stateCode, 'GST state code', 2);
  const serviceChargeRate = quantity(value.serviceChargeRate, 'Service charge rate');
  if (serviceChargeRate > 100) fail('Service charge rate must not exceed 100%.');
  if (gstEnabled) {
    if (!/^\d{2}$/.test(stateCode) || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      fail('Enter a valid 15-character GSTIN and its two-digit GST state code before enabling GST.');
    }
    if (gstin.slice(0, 2) !== stateCode) fail('The GSTIN state code must match the configured GST state code.');
  } else if (gstin && (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) || gstin.slice(0, 2) !== stateCode)) {
    fail('The GSTIN must be valid and match the configured GST state code.');
  }
  return { gstEnabled, gstin, stateCode, serviceChargeRate };
};

const validatePaymentConfiguration = (value) => {
  objectWithKeys(value, ['enabledMethods'], 'payment');
  const methods = ['CASH', 'CARD', 'UPI', 'OTHER'];
  if (!Array.isArray(value.enabledMethods) || !value.enabledMethods.length) {
    fail('Enable at least one payment method.');
  }
  const enabledMethods = [...new Set(value.enabledMethods)];
  if (enabledMethods.some((method) => !methods.includes(method))) {
    fail('Payment methods can only be Cash, Card, UPI, or Other.');
  }
  return { enabledMethods };
};

const validators = {
  menuPublication: validateMenuPublication,
  kitchenRouting: validateKitchenRouting,
  inventoryPolicies: validateInventoryPolicies,
  receiptPrinting: validateReceiptPrinting,
  taxConfiguration: validateTaxConfiguration,
  paymentConfiguration: validatePaymentConfiguration,
};

export const resolveBranchModules = (branch) => {
  const modules = Object.fromEntries(
    Object.entries(BRANCH_MODULE_DEFAULTS).map(([key, defaults]) => [
      key,
      { ...defaults, ...(branch?.moduleSettings?.[key] || {}) },
    ])
  );
  const storedPaymentConfiguration = branch?.moduleSettings?.paymentConfiguration || {};
  const paymentConfiguration = Object.fromEntries(
    Object.entries(storedPaymentConfiguration).filter(([key]) => key !== 'otherQrPayload')
  );
  modules.paymentConfiguration = {
    ...BRANCH_MODULE_DEFAULTS.paymentConfiguration,
    ...paymentConfiguration,
  };
  return modules;
};

export const validateBranchModule = (key, value) => {
  if (!Object.prototype.hasOwnProperty.call(validators, key)) fail('This branch configuration module is not available.');
  return validators[key](value);
};
