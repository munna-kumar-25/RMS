import { AccessError } from '../access/authorization.js';
import {
  assertChannels,
  assertCurrency,
  assertCutoff,
  assertEmail,
  assertOperatingHours,
  assertTimezone,
} from './branch.validation.js';

export const CODE_DEFAULTS = {
  timezone: 'Asia/Kolkata',
  currencyCode: 'INR',
  businessDayCutoff: '04:00',
  supportedOrderChannels: ['dine_in'],
  reservationEnabled: false,
  onlineOrderingEnabled: false,
  operatingHours: null,
  phone: '',
  email: '',
  receiptName: '',
};

export const OVERRIDABLE = [
  'timezone',
  'operatingHours',
  'businessDayCutoff',
  'phone',
  'email',
  'receiptName',
  'supportedOrderChannels',
  'reservationEnabled',
  'onlineOrderingEnabled',
];

const PROHIBITED = new Set(['currencyCode', 'taxRate', 'serviceCharge', 'companyId']);

export const FUTURE_SECTIONS = [
  { key: 'taxes', title: 'Taxes and service charges', part: 'Part 17', implemented: true },
  { key: 'menuPublication', title: 'Menu publication', part: 'Part 7', implemented: true },
  { key: 'kitchenRouting', title: 'Kitchen routing', part: 'Part 8', implemented: true },
  { key: 'inventoryPolicies', title: 'Inventory policies', part: 'Part 9', implemented: true },
  { key: 'receiptPrinting', title: 'Receipt printing', part: 'Part 16', implemented: true },
  { key: 'paymentConfiguration', title: 'Payment configuration', part: 'Part 17', implemented: true },
];

const validators = {
  timezone: assertTimezone,
  operatingHours: assertOperatingHours,
  businessDayCutoff: assertCutoff,
  phone: (value) => String(value || '').trim(),
  email: assertEmail,
  receiptName: (value) => String(value || '').trim().slice(0, 120),
  supportedOrderChannels: assertChannels,
  reservationEnabled: (value) => Boolean(value),
  onlineOrderingEnabled: (value) => Boolean(value),
};

export const companyDefaults = (company) => ({
  ...CODE_DEFAULTS,
  ...(company?.branchDefaults || {}),
  currencyCode: assertCurrency((company?.branchDefaults || {}).currencyCode || CODE_DEFAULTS.currencyCode),
});

export const resolveConfiguration = (company, branch) => {
  const defaults = companyDefaults(company);
  const overrides = branch?.overrides || {};
  const settings = {};
  OVERRIDABLE.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] !== undefined) {
      settings[key] = { value: overrides[key], source: 'branch' };
    } else {
      settings[key] = { value: defaults[key], source: 'company' };
    }
  });
  settings.currencyCode = { value: defaults.currencyCode, source: 'company' };
  return {
    settings,
    futureSections: FUTURE_SECTIONS.map((section) => ({
      ...section,
      source: section.implemented ? 'branch_configuration' : 'not_implemented',
    })),
    configurationRevision: branch?.configurationRevision || 0,
  };
};

export const applyOverrides = (company, current, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new AccessError('Configuration overrides must be an object.', 400);
  }
  const next = { ...(current || {}) };
  Object.keys(patch).forEach((key) => {
    if (PROHIBITED.has(key)) throw new AccessError(`Company policy does not allow a branch override for ${key}.`, 400);
    if (!OVERRIDABLE.includes(key)) throw new AccessError(`Unknown configuration key: ${key}`, 400);
    if (patch[key] === null) {
      delete next[key];
      return;
    }
    next[key] = validators[key](patch[key]);
  });
  const resolved = resolveConfiguration(company, { overrides: next });
  if (next.supportedOrderChannels) {
    resolved.settings.supportedOrderChannels.value = next.supportedOrderChannels;
  }
  return next;
};

export const validateCompanyDefaults = (patch) => {
  if (!patch || typeof patch !== 'object') throw new AccessError('Company defaults must be an object.', 400);
  const next = {};
  Object.keys(patch).forEach((key) => {
    if (key === 'currencyCode') {
      next.currencyCode = assertCurrency(patch[key]);
      return;
    }
    if (!OVERRIDABLE.includes(key)) throw new AccessError(`Unknown company default: ${key}`, 400);
    if (patch[key] === null) {
      next[key] = null;
      return;
    }
    next[key] = validators[key](patch[key]);
  });
  return next;
};

export const mergeCompanyDefaults = (company, patch) => {
  const next = { ...(company.branchDefaults || {}), ...validateCompanyDefaults(patch) };
  Object.keys(next).forEach((key) => {
    if (next[key] === null) delete next[key];
  });
  company.branchDefaults = next;
  company.markModified('branchDefaults');
};
