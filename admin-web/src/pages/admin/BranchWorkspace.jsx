import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChefHat,
  ClipboardList,
  Circle,
  Clock3,
  ChevronDown,
  CreditCard,
  Copy,
  KeyRound,
  LoaderCircle,
  MapPin,
  Plus,
  Printer,
  Radio,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAccess } from '../../context/AccessContext.jsx';
import {
  branchAccessRequest,
  branchApiKeyRequest,
  branchPosLoginRequest,
  branchActionRequest,
  branchHistoryRequest,
  branchRequest,
  generateBranchApiKeyRequest,
  revokeBranchApiKeyRequest,
  resetBranchPosLoginPasswordRequest,
  updateBranchModuleRequest,
  paymentGatewaySettingsRequest,
  savePaymentGatewaySettingsRequest,
  branchPaymentQrRequest,
  saveBranchPaymentQrRequest,
  removeBranchPaymentQrRequest,
  updateBranchRequest,
  updateConfigurationRequest,
} from '../../services/branch.api.js';
import { membershipsRequest, rolesRequest, updateMembershipRequest } from '../../services/access.api.js';
import { getBackendBaseUrl } from '../../services/api.js';
import { useAppStore } from '../../store/AppStore.tsx';
import BranchOperationalSetup from '../../components/modules/BranchOperationalSetup.jsx';
import { getCurrentBranchLocation } from '../../utils/geolocation.js';

const messageFrom = (error) => error?.response?.data?.message
  || error?.response?.data?.error?.message
  || error?.message
  || 'The request failed.';

const tabs = ['overview', 'operating', 'configuration', 'setup', 'access', 'integrations', 'history'];
const moduleForSection = {
  taxes: 'taxConfiguration',
  menuPublication: 'menuPublication',
  kitchenRouting: 'kitchenRouting',
  inventoryPolicies: 'inventoryPolicies',
  receiptPrinting: 'receiptPrinting',
  paymentConfiguration: 'paymentConfiguration',
};
const days = [
  ['monday', 'Monday'],
  ['tuesday', 'Tuesday'],
  ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'],
  ['friday', 'Friday'],
  ['saturday', 'Saturday'],
  ['sunday', 'Sunday'],
];

const blankWeek = () => ({
  monday: { closed: true, intervals: [] },
  tuesday: { closed: true, intervals: [] },
  wednesday: { closed: true, intervals: [] },
  thursday: { closed: true, intervals: [] },
  friday: { closed: true, intervals: [] },
  saturday: { closed: true, intervals: [] },
  sunday: { closed: true, intervals: [] },
  exceptions: [],
});

const blankGatewayCredentials = () => ({
  PAYTM: { merchantId: '', merchantKey: '', websiteName: 'WEBSTAGING' },
  PHONEPE: { clientId: '', clientSecret: '', clientVersion: '1' },
});

const scheduleFrom = (value) => {
  const empty = blankWeek();
  if (!value || typeof value !== 'object') return empty;
  days.forEach(([key]) => {
    const schedule = value[key];
    if (schedule && typeof schedule === 'object') {
      empty[key] = {
        closed: Boolean(schedule.closed),
        intervals: Array.isArray(schedule.intervals)
          ? schedule.intervals.map((interval) => ({
            start: interval.start || '09:00',
            end: interval.end || '17:00',
            overnight: Boolean(interval.overnight),
          }))
          : [],
      };
    }
  });
  empty.exceptions = Array.isArray(value.exceptions) ? value.exceptions : [];
  return empty;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';

export const BranchWorkspace = ({ branchId, initialTab = 'overview', onBack, onNavigate }) => {
  const access = useAccess();
  const { setActiveBranchId } = useAppStore();
  const [tab, setTab] = useState(tabs.includes(initialTab) ? initialTab : 'overview');
  const [branch, setBranch] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [apiKeyMetadata, setApiKeyMetadata] = useState(null);
  const [posLogin, setPosLogin] = useState(null);
  const [posLoginPassword, setPosLoginPassword] = useState('');
  const [showPosLoginPassword, setShowPosLoginPassword] = useState(false);
  const [issuedApiKey, setIssuedApiKey] = useState('');
  const [desktopBackendUrl, setDesktopBackendUrl] = useState(getBackendBaseUrl);
  const [copiedBackendUrl, setCopiedBackendUrl] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [companyMemberships, setCompanyMemberships] = useState([]);
  const [managerRole, setManagerRole] = useState(null);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [form, setForm] = useState(null);
  const [configurationForm, setConfigurationForm] = useState(null);
  const [moduleSettings, setModuleSettings] = useState(null);
  const [hours, setHours] = useState(blankWeek);
  const [timezone, setTimezone] = useState('');
  const [cutoff, setCutoff] = useState('04:00');
  const [expandedChecklistKey, setExpandedChecklistKey] = useState('');
  const [saving, setSaving] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [paymentGateways, setPaymentGateways] = useState(null);
  const [paymentQr, setPaymentQr] = useState(null);
  const [gatewayCredentials, setGatewayCredentials] = useState(blankGatewayCredentials);

  const load = async () => {
    setError('');
    try {
      const next = await branchRequest(branchId);
      setBranch(next);
      setExpandedChecklistKey((current) => (
        current || next.checklist?.items?.find((item) => item.status === 'incomplete')?.key || ''
      ));
      setActiveBranchId(branchId);
      setForm({
        name: next.name,
        code: next.code,
        description: next.description || '',
        addressLine1: next.addressLine1 || '',
        city: next.city || '',
        countryCode: next.countryCode || '',
        latitude: next.latitude ?? null,
        longitude: next.longitude ?? null,
        phone: next.phone || '',
        email: next.email || '',
        revision: next.revision,
      });
      const settings = next.configuration?.settings || {};
      setHours(scheduleFrom(settings.operatingHours?.value));
      setTimezone(settings.timezone?.value || 'Asia/Kolkata');
      setCutoff(settings.businessDayCutoff?.value || '04:00');
      setConfigurationForm({
        phone: settings.phone?.value || '',
        email: settings.email?.value || '',
        receiptName: settings.receiptName?.value || '',
        supportedOrderChannels: settings.supportedOrderChannels?.value || ['dine_in'],
        reservationEnabled: Boolean(settings.reservationEnabled?.value),
        onlineOrderingEnabled: Boolean(settings.onlineOrderingEnabled?.value),
      });
      setModuleSettings(next.moduleSettings || null);
      const branchPermissions = access.branches.find((item) => item.id === branchId)?.permissions || [];
      const canConfigureGateways = access.isCompanySuperAdmin || branchPermissions.includes('branches.update');
      const canManagePos = access.isCompanySuperAdmin
        || branchPermissions.includes('pos.manage')
        || branchPermissions.includes('branches.lifecycle');
      const [events, accessData, keyData, posLoginData, gatewayData, qrData] = await Promise.all([
        branchHistoryRequest(branchId),
        branchAccessRequest(branchId),
        canManagePos ? branchApiKeyRequest(branchId) : Promise.resolve(null),
        canManagePos ? branchPosLoginRequest(branchId) : Promise.resolve(null),
        canConfigureGateways ? paymentGatewaySettingsRequest(branchId) : Promise.resolve(null),
        canConfigureGateways ? branchPaymentQrRequest(branchId) : Promise.resolve(null),
      ]);
      setHistory(events || []);
      setAssignments(accessData.memberships || []);
      setApiKeyMetadata(keyData);
      setPosLogin(posLoginData?.account || null);
      setPaymentGateways(gatewayData || null);
      setPaymentQr(qrData || null);
      if (gatewayData?.providers) {
        setGatewayCredentials((current) => ({
          PAYTM: {
            ...current.PAYTM,
            merchantId: gatewayData.providers.PAYTM?.accountLabel || '',
            websiteName: gatewayData.providers.PAYTM?.websiteName || 'WEBSTAGING',
          },
          PHONEPE: {
            ...current.PHONEPE,
            clientId: gatewayData.providers.PHONEPE?.accountLabel || '',
            clientVersion: String(gatewayData.providers.PHONEPE?.clientVersion || 1),
          },
        }));
      }
      if (access.can('memberships.manage')) {
        const [membershipData, roleData] = await Promise.all([membershipsRequest(), rolesRequest()]);
        const branchManagerRole = (roleData.roles || []).find((role) => role.key === 'branch_manager');
        const memberships = membershipData.memberships || [];
        setCompanyMemberships(memberships);
        setManagerRole(branchManagerRole || null);
        const assignedManager = branchManagerRole && memberships.find((membership) => (
          membership.status === 'active'
          && membership.branchAssignments.some((assignment) => (
            assignment.branchId === branchId && assignment.roleIds.includes(branchManagerRole.id)
          ))
        ));
        setSelectedManagerId(assignedManager?.id || '');
      } else {
        setCompanyMemberships([]);
        setManagerRole(null);
        setSelectedManagerId('');
      }
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  };

  useEffect(() => {
    setIssuedApiKey('');
    setCopiedBackendUrl(false);
    setCopiedApiKey(false);
    load();
  }, [branchId]);

  const navigateTab = (nextTab) => {
    if (tabs.includes(nextTab)) onNavigate(`/admin/branches/${branchId}?tab=${nextTab}`);
  };

  const saveIdentity = async (event, continueAfterSave = false) => {
    event.preventDefault();
    if (continueAfterSave && !event.currentTarget.form?.reportValidity()) return;
    setError('');
    setNotice('');
    setSaving('identity');
    try {
      const next = await updateBranchRequest(branchId, form);
      setBranch(next.branch);
      setForm((current) => ({ ...current, revision: next.branch.revision }));
      await access.refresh();
      if (continueAfterSave) {
        onNavigate(`/admin/branches/${branchId}?tab=operating`);
      } else {
        setNotice('Branch identity saved.');
      }
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const detectLocation = async () => {
    setLocationError('');
    setNotice('');
    setDetectingLocation(true);
    try {
      const { addressLookupError, ...location } = await getCurrentBranchLocation();
      const response = await updateBranchRequest(branchId, {
        revision: branch.revision,
        ...location,
      });
      setBranch(response.branch);
      setForm((current) => ({ ...current, ...location, revision: response.branch.revision }));
      setNotice(addressLookupError
        ? `GPS coordinates saved. ${addressLookupError}`
        : 'Current branch address and GPS coordinates detected and saved.');
    } catch (requestError) {
      setLocationError(messageFrom(requestError));
    } finally {
      setDetectingLocation(false);
    }
  };

  const updateDay = (day, update) => {
    setHours((current) => ({
      ...current,
      [day]: { ...current[day], ...update },
    }));
  };

  const updateInterval = (day, index, key, value) => {
    setHours((current) => ({
      ...current,
      [day]: {
        ...current[day],
        intervals: current[day].intervals.map((interval, position) => (
          position === index ? { ...interval, [key]: value } : interval
        )),
      },
    }));
  };

  const saveHours = async (continueAfterSave = false) => {
    setNotice('');
    setError('');
    const openDays = days.filter(([day]) => !hours[day].closed);
    if (!openDays.length) {
      setError('Choose at least one day when this branch is open.');
      return;
    }
    const incomplete = openDays.find(([day]) => (
      !hours[day].intervals.length
      || hours[day].intervals.some((interval) => !interval.start || !interval.end || interval.start === interval.end)
    ));
    if (incomplete) {
      setError(`Add valid opening and closing times for ${incomplete[1]}.`);
      return;
    }
    const operatingHours = {
      ...hours,
      ...Object.fromEntries(days.map(([day]) => [
        day,
        {
          ...hours[day],
          intervals: hours[day].intervals.map((interval) => ({
            ...interval,
            overnight: interval.end < interval.start,
          })),
        },
      ])),
    };
    setSaving('hours');
    try {
      const next = await updateConfigurationRequest(branchId, {
        revision: branch.revision,
        configurationRevision: branch.configurationRevision,
        overrides: { operatingHours, timezone, businessDayCutoff: cutoff },
      });
      setBranch(next.branch);
      setHours(scheduleFrom(next.branch.configuration.settings.operatingHours.value));
      setTimezone(next.branch.configuration.settings.timezone.value);
      setCutoff(next.branch.configuration.settings.businessDayCutoff.value);
      await access.refresh();
      if (continueAfterSave) {
        onNavigate(`/admin/branches/${branchId}?tab=setup`);
      } else {
        setNotice('Operating hours and branch time settings saved.');
      }
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const clearOverride = async (key) => {
    setError('');
    setNotice('');
    setSaving('configuration');
    try {
      const next = await updateConfigurationRequest(branchId, {
        revision: branch.revision,
        configurationRevision: branch.configurationRevision,
        overrides: { [key]: null },
      });
      setBranch(next.branch);
      setHours(scheduleFrom(next.branch.configuration.settings.operatingHours.value));
      setTimezone(next.branch.configuration.settings.timezone.value);
      setCutoff(next.branch.configuration.settings.businessDayCutoff.value);
      const settings = next.branch.configuration.settings;
      setConfigurationForm({
        phone: settings.phone.value || '',
        email: settings.email.value || '',
        receiptName: settings.receiptName.value || '',
        supportedOrderChannels: settings.supportedOrderChannels.value || [],
        reservationEnabled: Boolean(settings.reservationEnabled.value),
        onlineOrderingEnabled: Boolean(settings.onlineOrderingEnabled.value),
      });
      setNotice(`${key} now uses the company setting.`);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const saveConfiguration = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!configurationForm.supportedOrderChannels.length) {
      setError('Choose at least one supported order channel.');
      return;
    }
    setSaving('configuration');
    try {
      const next = await updateConfigurationRequest(branchId, {
        revision: branch.revision,
        configurationRevision: branch.configurationRevision,
        overrides: {
          phone: configurationForm.phone,
          email: configurationForm.email,
          receiptName: configurationForm.receiptName,
          supportedOrderChannels: configurationForm.supportedOrderChannels,
          reservationEnabled: configurationForm.reservationEnabled,
          onlineOrderingEnabled: configurationForm.onlineOrderingEnabled,
        },
      });
      setBranch(next.branch);
      const settings = next.branch.configuration.settings;
      setConfigurationForm({
        phone: settings.phone.value || '',
        email: settings.email.value || '',
        receiptName: settings.receiptName.value || '',
        supportedOrderChannels: settings.supportedOrderChannels.value || [],
        reservationEnabled: Boolean(settings.reservationEnabled.value),
        onlineOrderingEnabled: Boolean(settings.onlineOrderingEnabled.value),
      });
      await access.refresh();
      setNotice('Branch configuration saved.');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const toggleOrderChannel = (channel) => {
    setConfigurationForm((current) => {
      const channels = current.supportedOrderChannels.includes(channel)
        ? current.supportedOrderChannels.filter((item) => item !== channel)
        : [...current.supportedOrderChannels, channel];
      return { ...current, supportedOrderChannels: channels };
    });
  };

  const saveBranchModule = async (event, moduleKey) => {
    event.preventDefault();
    if (!moduleSettings?.[moduleKey]) return;
    setError('');
    setNotice('');
    setSaving(moduleKey);
    try {
      const next = await updateBranchModuleRequest(branchId, moduleKey, {
        revision: branch.revision,
        configurationRevision: branch.configurationRevision,
        settings: moduleSettings[moduleKey],
      });
      setBranch(next.branch);
      setModuleSettings((current) => ({
        ...current,
        [moduleKey]: next.branch.moduleSettings[moduleKey],
      }));
      await access.refresh();
      setNotice(`${({
        menuPublication: 'Menu publication',
        kitchenRouting: 'Kitchen routing',
        inventoryPolicies: 'Inventory policies',
        receiptPrinting: 'Receipt printing',
        taxConfiguration: 'GST and service charge',
        paymentConfiguration: 'Payment methods',
      })[moduleKey]} settings saved.`);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const savePaymentQrImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setError('Choose a PNG, JPEG, or WebP QR image smaller than 1 MB.');
      return;
    }
    setError('');
    setNotice('');
    setSaving('paymentQr');
    try {
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not read the selected image.'));
        reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
      });
      const saved = await saveBranchPaymentQrRequest(branchId, { imageDataUrl, fileName: file.name });
      setPaymentQr(saved);
      setNotice('Branch payment QR image saved.');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const deletePaymentQrImage = async () => {
    setError('');
    setNotice('');
    setSaving('paymentQr');
    try {
      await removeBranchPaymentQrRequest(branchId);
      setPaymentQr({ configured: false });
      setNotice('Branch payment QR image removed.');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const saveGatewayCredentials = async (event, provider, remove = false) => {
    event.preventDefault();
    if (remove && !window.confirm(`Remove the ${provider === 'PAYTM' ? 'Paytm' : 'PhonePe'} sandbox credentials for this branch?`)) return;
    setError('');
    setNotice('');
    setSaving(`gateway-${provider}`);
    try {
      const result = await savePaymentGatewaySettingsRequest(branchId, remove
        ? { provider, remove: true }
        : { provider, credentials: gatewayCredentials[provider] });
      setPaymentGateways(result);
      setGatewayCredentials((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          ...(provider === 'PAYTM' ? { merchantKey: '' } : { clientSecret: '' }),
        },
      }));
      setNotice(`${provider === 'PAYTM' ? 'Paytm' : 'PhonePe'} sandbox settings ${remove ? 'removed' : 'saved'}.`);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const updateModuleSetting = (moduleKey, key, value) => {
    setModuleSettings((current) => ({
      ...current,
      [moduleKey]: { ...current[moduleKey], [key]: value },
    }));
  };

  const printTestReceipt = () => {
    const popup = window.open('', '_blank', 'popup,width=420,height=640');
    if (!popup) {
      setError('Allow pop-ups for this site to print a test receipt.');
      return;
    }
    popup.opener = null;
    const document = popup.document;
    document.title = `Test receipt - ${branch.name}`;
    const styles = document.createElement('style');
    styles.textContent = `
      @page { size: ${moduleSettings.receiptPrinting.paperWidth} auto; margin: 4mm; }
      body { font: 12px/1.5 Arial, sans-serif; color: #111; margin: 0; }
      section { padding: 8px 0 16px; text-align: center; }
      section + section { border-top: 1px dashed #777; }
      h1 { font-size: 17px; margin: 0 0 4px; }
      p { margin: 4px 0; }
      @media screen { body { max-width: 320px; margin: 20px auto; } }
    `;
    const content = document.createElement('main');
    for (let copy = 0; copy < moduleSettings.receiptPrinting.copies; copy += 1) {
      const receipt = document.createElement('section');
      const title = document.createElement('h1');
      title.textContent = configurationForm.receiptName || branch.name;
      const branchLine = document.createElement('p');
      branchLine.textContent = `${branch.code} · ${branch.city || ''}`;
      const testLine = document.createElement('p');
      testLine.textContent = 'TEST RECEIPT — NO SALE';
      const footer = document.createElement('p');
      footer.textContent = moduleSettings.receiptPrinting.footer || 'Printer setup check';
      receipt.append(title, branchLine, testLine, footer);
      content.append(receipt);
    }
    document.head.append(styles);
    document.body.replaceChildren(content);
    popup.focus();
    popup.print();
  };

  const assignManager = async (event) => {
    event.preventDefault();
    const membership = companyMemberships.find((item) => item.id === selectedManagerId && item.status === 'active');
    if (!membership || !managerRole) {
      setError('Choose an active company membership and ensure the branch manager role exists.');
      return;
    }
    const assignmentsByBranch = new Map(
      membership.branchAssignments.map((assignment) => [assignment.branchId, assignment.roleIds])
    );
    const currentRoles = [...(assignmentsByBranch.get(branchId) || [])];
    if (!currentRoles.includes(managerRole.id)) currentRoles.push(managerRole.id);
    assignmentsByBranch.set(branchId, currentRoles);
    setError('');
    setNotice('');
    setSaving('manager');
    try {
      await updateMembershipRequest(membership.id, {
        branchAssignments: [...assignmentsByBranch].map(([assignedBranchId, roleIds]) => ({
          branchId: assignedBranchId,
          roleIds,
        })),
      });
      await access.refresh();
      await load();
      setNotice('Branch manager assigned.');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const act = async (action) => {
    const reason = ['suspend', 'archive'].includes(action) ? window.prompt('Reason') : undefined;
    if (['suspend', 'archive'].includes(action) && !reason) return;
    setError('');
    setNotice('');
    setSaving(action);
    try {
      const next = await branchActionRequest(branchId, action, { revision: branch.revision, reason });
      setBranch(next.branch);
      setNotice(next.limitations?.length ? next.limitations[0] : 'Branch status updated.');
      await access.refresh();
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const resetPosLoginPassword = async (event) => {
    event.preventDefault();
    if (posLoginPassword.length < 8 || posLoginPassword.length > 256) {
      setError('Desktop POS password must be between 8 and 256 characters.');
      return;
    }
    if (!window.confirm(`Change the Desktop POS password for ${posLogin?.email}? The old password will stop working and existing sessions for this account will be signed out.`)) return;
    setError('');
    setNotice('');
    setSaving('pos-login');
    try {
      const result = await resetBranchPosLoginPasswordRequest(branchId, posLoginPassword);
      setPosLogin(result.account);
      setNotice(result.auditRecorded
        ? 'Desktop POS login password updated. Use the email and new password shown here to sign in.'
        : 'Password updated, but the audit event could not be saved. Contact an administrator.');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const generateApiKey = async ({ confirmRotation = true } = {}) => {
    if (
      confirmRotation
      && apiKeyMetadata?.active
      && !window.confirm('Generating a new key will immediately invalidate the current key. Continue?')
    ) return '';
    setError('');
    setNotice('');
    setSaving('api-key');
    setCopiedApiKey(false);
    try {
      const result = await generateBranchApiKeyRequest(branchId);
      setApiKeyMetadata(result.metadata);
      setIssuedApiKey(result.apiKey);
      setNotice(result.auditRecorded
        ? 'API key generated. Copy and save it now; it will not be shown again.'
        : 'API key generated, but its audit event could not be saved. Copy it now and contact an administrator.');
      return result.apiKey;
    } catch (requestError) {
      setError(messageFrom(requestError));
      return '';
    } finally {
      setSaving('');
    }
  };

  const revokeApiKey = async () => {
    if (!window.confirm('Revoke this branch API key? Integrations using it will stop working immediately.')) return;
    setError('');
    setNotice('');
    setSaving('api-key');
    try {
      const result = await revokeBranchApiKeyRequest(branchId);
      setApiKeyMetadata(result);
      setIssuedApiKey('');
      setNotice(result.auditRecorded === false
        ? 'API key revoked, but its audit event could not be saved. Contact an administrator.'
        : 'Branch API key revoked.');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving('');
    }
  };

  const copyApiKey = async () => {
    let keyToCopy = issuedApiKey;
    if (!keyToCopy) {
      if (
        apiKeyMetadata?.active
        && !window.confirm('The current key cannot be retrieved. Rotate it now to create a new key? The old key will stop working immediately.')
      ) return;
      keyToCopy = await generateApiKey({ confirmRotation: false });
      if (!keyToCopy) return;
    }
    try {
      await navigator.clipboard.writeText(keyToCopy);
      setCopiedApiKey(true);
      setNotice('API key copied to clipboard.');
    } catch (copyError) {
      setCopiedApiKey(false);
      setError(copyError?.message || 'Unable to copy the API key. Select and copy it manually.');
    }
  };

  const copyDesktopBackendUrl = async () => {
    try {
      await navigator.clipboard.writeText(desktopBackendUrl);
      setCopiedBackendUrl(true);
      setNotice('Desktop POS backend URL copied.');
    } catch (copyError) {
      setCopiedBackendUrl(false);
      setError(copyError?.message || 'Unable to copy the backend URL. Select and copy it manually.');
    }
  };

  const copyDesktopConnectionDetails = async () => {
    if (!issuedApiKey) {
      setError('Generate or rotate this branch API key first. The full key is only shown once.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`Backend URL: ${desktopBackendUrl}\nBranch API key: ${issuedApiKey}`);
      setNotice('Desktop POS backend URL and branch API key copied.');
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy the connection details. Copy the URL and API key separately.');
    }
  };

  if (!branch) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="h-4 w-4" /> Back to branches</button>
        <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-rose-600' : 'text-sm text-slate-500'}>{error || 'Loading branch setup…'}</p>
      </div>
    );
  }

  const canUpdate = access.can('branches.update');
  const canLifecycle = access.can('branches.lifecycle');
  const branchPermissions = access.branches.find((item) => item.id === branchId)?.permissions || [];
  const canManagePos = access.isCompanySuperAdmin
    || branchPermissions.includes('pos.manage')
    || branchPermissions.includes('branches.lifecycle');
  const checks = branch.checklist?.items || [];
  const identityCheck = checks.find((item) => item.key === 'identity');
  const hoursCheck = checks.find((item) => item.key === 'hours');
  const managerCheck = checks.find((item) => item.key === 'manager');
  const availableChecks = checks.filter((item) => item.status !== 'blocked');
  const blockedChecks = checks.filter((item) => item.status === 'blocked');
  const checklistReady = Boolean(branch.checklist?.readyForTesting);
  const checklistQuestion = {
    identity: 'Please confirm the branch name, code, full address, country, and contact details.',
    hours: 'What are this branch’s opening days, working hours, timezone, and business-day start time?',
    manager: 'Which active company member should manage this branch?',
    staff_coverage: 'Which employees should be assigned to work at this branch?',
  };
  const reviewChecklistItem = (item) => {
    if (item.navigationTarget) {
      onNavigate(item.navigationTarget);
      return;
    }
    const target = {
      identity: 'overview',
      hours: 'operating',
      manager: 'access',
      menu: 'configuration',
      kitchens: 'configuration',
      inventory_policies: 'configuration',
      printing: 'configuration',
      taxes: 'configuration',
      payments: 'configuration',
    }[item.key];
    if (target) navigateTab(target);
  };

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"><ArrowLeft className="h-4 w-4" /> Back to branches</button>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Branch setup</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{branch.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{branch.code} · {branch.setupStatus.replaceAll('_', ' ')} · revision {branch.revision}</p>
        </div>
        {canLifecycle && branch.setupStatus !== 'archived' && (
          <div className="flex flex-wrap gap-2">
            {branch.setupStatus === 'draft' && <button type="button" disabled={!checklistReady} className={buttonClass} onClick={() => act('mark-ready')}>Mark ready for testing</button>}
            {branch.setupStatus === 'ready_for_testing' && (
              <button
                type="button"
                disabled={!branch.checklist.readyForActivation}
                title={!branch.checklist.readyForActivation ? 'Activation is blocked until all required modules are implemented and configured.' : undefined}
                className={buttonClass}
                onClick={() => act('activate')}
              >
                Activate branch
              </button>
            )}
            {['active', 'ready_for_testing'].includes(branch.setupStatus) && <button type="button" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-700" onClick={() => act('suspend')}>Suspend</button>}
            {branch.setupStatus === 'suspended' && <button type="button" className={buttonClass} onClick={() => act('resume')}>Resume</button>}
            <button type="button" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-700" onClick={() => act('archive')}>Archive</button>
          </div>
        )}
      </header>

      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
          {error || notice}
        </div>
      )}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Setup progress</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {branch.checklist.progress.complete} of {branch.checklist.progress.implementedRequired} available checks complete
              {branch.checklist.progress.blockedModules > 0 && ` · ${branch.checklist.progress.blockedModules} later modules are not available yet`}
            </p>
          </div>
          <span className="text-xl font-black text-indigo-700 dark:text-indigo-300">{branch.checklist.progress.percent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-800">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${branch.checklist.progress.percent}%` }} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            { label: 'Branch identity', check: identityCheck, target: 'overview' },
            { label: 'Hours and timezone', check: hoursCheck, target: 'operating' },
            { label: 'Branch manager', check: managerCheck, target: 'access' },
          ].map((step) => (
            <button key={step.target} type="button" onClick={() => navigateTab(step.target)} className="flex items-center gap-2 rounded-xl border border-white bg-white/80 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {step.check?.status === 'complete' ? <Check className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-500" />}
              {step.label}
              <span className="ml-auto capitalize text-slate-400">{step.check?.status || 'incomplete'}</span>
            </button>
          ))}
        </div>
      </section>

      <nav aria-label="Branch management sections" className="flex flex-wrap gap-2">
        {tabs.map((item) => {
          const label = ({
            overview: 'Identity',
            operating: 'Hours & time',
            configuration: 'Configuration',
            setup: 'Setup checklist',
            access: 'Access',
            integrations: 'API integration',
            history: 'History',
          })[item];
          return (
            <button key={item} type="button" aria-current={tab === item ? 'page' : undefined} onClick={() => navigateTab(item)} className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${tab === item ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{label}</button>
          );
        })}
      </nav>

      {tab === 'overview' && form && (
        <form onSubmit={saveIdentity} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Branch identity</h2>
            <p className="mt-1 text-xs text-slate-500">Keep the location’s name, address and contact information up to date.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <button type="button" disabled={!canUpdate || detectingLocation || Boolean(saving)} onClick={detectLocation} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50 dark:border-indigo-900 dark:text-indigo-300">
              {detectingLocation ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {detectingLocation ? 'Detecting location…' : 'Use current location'}
            </button>
            {form.latitude != null && form.longitude != null
              ? <span className="text-xs text-slate-500">{[form.addressLine1, form.city, form.stateOrProvince, form.postalCode].filter(Boolean).join(', ')} · GPS {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)}</span>
              : <span className="text-xs text-slate-500">Allow browser location access to fill the address and GPS coordinates automatically.</span>}
          </div>
          <p className="text-xs text-slate-500">Address lookup uses OpenStreetMap; your coordinates are sent to its Nominatim service to resolve the address.</p>
          {locationError && <p role="alert" className="text-xs text-rose-600">{locationError}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['name', 'Branch name', true],
              ['code', 'Branch code', true],
              ['description', 'Description', false],
              ['addressLine1', 'Street address', true],
              ['city', 'City', true],
              ['countryCode', 'Country code', true],
              ['phone', 'Phone', false],
              ['email', 'Email', false],
            ].map(([key, label, required]) => (
              <label key={key} className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {label}{required && <span className="ml-1 text-rose-500">*</span>}
                <input
                  required={required}
                  disabled={!canUpdate || saving === 'identity'}
                  className={inputClass}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: key === 'countryCode' || key === 'code' ? event.target.value.toUpperCase() : event.target.value })}
                />
              </label>
            ))}
          </div>
          {canUpdate && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="submit" value="save" disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
                {saving === 'identity' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save identity
              </button>
              <button type="button" disabled={Boolean(saving)} className={buttonClass} onClick={(event) => saveIdentity(event, true)}>
                {saving === 'identity' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Save & continue to hours <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </form>
      )}

      {tab === 'operating' && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><CalendarClock className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Opening hours and local time</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Set a weekly schedule. Add a second service period on a day if you close between services. Times use the branch’s local timezone.</p>
            </div>
          </div>
          <div className="grid gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-950 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Timezone
              <input disabled={!canUpdate} value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" className={inputClass} />
              <span className="block font-normal text-slate-400">Company default: {branch.configuration.settings.timezone.value}</span>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Business day starts at
              <input type="time" disabled={!canUpdate} value={cutoff} onChange={(event) => setCutoff(event.target.value)} className={inputClass} />
              <span className="block font-normal text-slate-400">Used for daily sales and reporting cutoffs.</span>
            </label>
          </div>

          <div className="space-y-3">
            {days.map(([day, label]) => {
              const schedule = hours[day];
              return (
                <div key={day} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="min-w-24 text-sm font-bold text-slate-800 dark:text-slate-100">{label}</p>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                      <input type="checkbox" disabled={!canUpdate} checked={schedule.closed} onChange={(event) => updateDay(day, {
                        closed: event.target.checked,
                        intervals: event.target.checked ? [] : [{ start: '09:00', end: '17:00', overnight: false }],
                      })} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      Closed
                    </label>
                  </div>
                  {!schedule.closed && (
                    <div className="mt-3 space-y-2">
                      {schedule.intervals.map((interval, index) => (
                        <div key={`${day}-${index}`} className="flex flex-wrap items-end gap-2">
                          <label className="min-w-32 flex-1 space-y-1 text-[11px] font-semibold text-slate-500">
                            {schedule.intervals.length > 1 ? `Period ${index + 1} opens` : 'Opens'}
                            <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" /><input aria-label={`${label} opening time period ${index + 1}`} type="time" disabled={!canUpdate} value={interval.start} onChange={(event) => updateInterval(day, index, 'start', event.target.value)} className={inputClass} /></span>
                          </label>
                          <label className="min-w-32 flex-1 space-y-1 text-[11px] font-semibold text-slate-500">
                            Closes
                            <input aria-label={`${label} closing time period ${index + 1}`} type="time" disabled={!canUpdate} value={interval.end} onChange={(event) => updateInterval(day, index, 'end', event.target.value)} className={inputClass} />
                          </label>
                          {schedule.intervals.length > 1 && canUpdate && (
                            <button type="button" aria-label={`Remove ${label} period ${index + 1}`} onClick={() => updateDay(day, { intervals: schedule.intervals.filter((_, position) => position !== index) })} className="rounded-lg border border-slate-200 p-2.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {canUpdate && schedule.intervals.length < 3 && (
                        <button type="button" onClick={() => updateDay(day, { intervals: [...schedule.intervals, { start: '17:00', end: '21:00', overnight: false }] })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                          <Plus className="h-3.5 w-3.5" /> Add service period
                        </button>
                      )}
                      {schedule.intervals.some((interval) => interval.end < interval.start) && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">An earlier closing time is treated as an overnight service into the next day.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="text-xs text-slate-400">Currency {branch.configuration.settings.currencyCode.value} is set by the company.</p>
            {canUpdate && (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200" onClick={() => saveHours(false)}>
                  {saving === 'hours' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save hours
                </button>
                <button type="button" disabled={Boolean(saving)} className={buttonClass} onClick={() => saveHours(true)}>
                  {saving === 'hours' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Save & continue to checklist <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'configuration' && configurationForm && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Branch-specific options</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Configuration</h2>
            <p className="mt-1 text-sm text-slate-500">Changes here apply only to this branch. Leave a setting on company default unless this location needs a different value.</p>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Customer order channels</h3>
                  <p className="mt-1 text-xs text-slate-500">Select every order type this branch accepts. At least one channel is required.</p>
                </div>
                {branch.configuration.settings.supportedOrderChannels.source === 'branch' && (
                  <button type="button" disabled={Boolean(saving)} onClick={() => clearOverride('supportedOrderChannels')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">Use company default</button>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['dine_in', 'Dine in', 'Guests order and dine at the branch.'],
                  ['takeaway', 'Takeaway', 'Orders are collected at the branch.'],
                  ['delivery', 'Delivery', 'Orders are prepared for delivery.'],
                  ['online', 'Online', 'Orders are placed through online channels.'],
                ].map(([value, label, description]) => {
                  const checked = configurationForm.supportedOrderChannels.includes(value);
                  return (
                    <label key={value} className={`cursor-pointer rounded-xl border p-4 transition ${checked ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-800 dark:bg-indigo-950/40' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                        <input type="checkbox" disabled={!canUpdate || saving === 'configuration'} checked={checked} onChange={() => toggleOrderChannel(value)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-slate-500">{description}</span>
                    </label>
                  );
                })}
              </div>
              {!configurationForm.supportedOrderChannels.length && <p className="mt-3 text-xs font-medium text-rose-600">Select at least one channel to save.</p>}
              <p className="mt-3 text-[11px] text-slate-400">Dining tables for dine-in and other later-module requirements appear in the setup checklist.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Branch services</h3>
              <p className="mt-1 text-xs text-slate-500">Turn on optional services for this branch.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ['reservationEnabled', 'Reservations', 'Allow customers to request a table reservation.'],
                  ['onlineOrderingEnabled', 'Online ordering', 'Accept orders from configured online channels.'],
                ].map(([key, label, description]) => (
                  <div key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-indigo-200 dark:border-slate-700 dark:hover:border-indigo-900">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="checkbox" disabled={!canUpdate || saving === 'configuration'} checked={configurationForm[key]} onChange={(event) => setConfigurationForm({ ...configurationForm, [key]: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
                    </label>
                    {branch.configuration.settings[key].source === 'branch' && (
                      <button type="button" disabled={Boolean(saving)} onClick={(event) => { event.preventDefault(); clearOverride(key); }} className="shrink-0 text-[11px] font-semibold text-indigo-600 disabled:opacity-50">Company default</button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Branch contact & receipt</h3>
                <p className="mt-1 text-xs text-slate-500">Optional branch-specific values used by branch settings and receipt setup.</p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Branch phone
                  <input type="tel" disabled={!canUpdate || saving === 'configuration'} value={configurationForm.phone} onChange={(event) => setConfigurationForm({ ...configurationForm, phone: event.target.value })} placeholder="Inherit company phone" className={inputClass} />
                  {branch.configuration.settings.phone.source === 'branch' && <button type="button" disabled={Boolean(saving)} onClick={() => clearOverride('phone')} className="text-[11px] font-semibold text-indigo-600 disabled:opacity-50">Use company default</button>}
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Branch email
                  <input type="email" disabled={!canUpdate || saving === 'configuration'} value={configurationForm.email} onChange={(event) => setConfigurationForm({ ...configurationForm, email: event.target.value })} placeholder="Inherit company email" className={inputClass} />
                  {branch.configuration.settings.email.source === 'branch' && <button type="button" disabled={Boolean(saving)} onClick={() => clearOverride('email')} className="text-[11px] font-semibold text-indigo-600 disabled:opacity-50">Use company default</button>}
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
                  Receipt display name
                  <input maxLength={120} disabled={!canUpdate || saving === 'configuration'} value={configurationForm.receiptName} onChange={(event) => setConfigurationForm({ ...configurationForm, receiptName: event.target.value })} placeholder="Use company or branch name" className={inputClass} />
                  {branch.configuration.settings.receiptName.source === 'branch' && <button type="button" disabled={Boolean(saving)} onClick={() => clearOverride('receiptName')} className="text-[11px] font-semibold text-indigo-600 disabled:opacity-50">Use company default</button>}
                </label>
              </div>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Time, hours and currency</p>
                <p className="mt-1 text-xs text-slate-500">Manage timezone and schedule in Hours & time. Currency {branch.configuration.settings.currencyCode.value} is controlled by the company.</p>
              </div>
              <button type="button" onClick={() => navigateTab('operating')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200">Open hours & time <ArrowRight className="h-4 w-4" /></button>
            </section>

            {canUpdate && (
              <div className="flex justify-end">
                <button type="button" onClick={() => saveConfiguration({ preventDefault() {} })} disabled={Boolean(saving)} className={buttonClass}>
                  {saving === 'configuration' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save configuration
                </button>
              </div>
            )}
          </div>

          {moduleSettings && (
            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Branch operations</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Module setup</h3>
                <p className="mt-1 text-sm text-slate-500">Each module saves independently. Settings are scoped to {branch.name}; changing one module will not overwrite another.</p>
              </div>

              <form onSubmit={(event) => saveBranchModule(event, 'menuPublication')} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><Radio className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Menu publication</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Choose whether this branch menu is published and which order channels can use it.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${moduleSettings.menuPublication.published ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {moduleSettings.menuPublication.published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <input type="checkbox" disabled={!canUpdate || Boolean(saving)} checked={moduleSettings.menuPublication.published} onChange={(event) => updateModuleSetting('menuPublication', 'published', event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Publish this branch menu</span><span className="mt-1 block text-xs text-slate-500">Save as draft to keep the menu unpublished while setup is in progress.</span></span>
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['dine_in', 'Dine in'],
                    ['takeaway', 'Takeaway'],
                    ['delivery', 'Delivery'],
                    ['online', 'Online'],
                  ].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        disabled={!canUpdate || Boolean(saving)}
                        checked={moduleSettings.menuPublication.channels.includes(value)}
                        onChange={(event) => updateModuleSetting(
                          'menuPublication',
                          'channels',
                          event.target.checked
                            ? [...moduleSettings.menuPublication.channels, value]
                            : moduleSettings.menuPublication.channels.filter((channel) => channel !== value)
                        )}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {canUpdate && <div className="flex justify-end"><button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'menuPublication' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save menu publication</button></div>}
              </form>

              <form onSubmit={(event) => saveBranchModule(event, 'kitchenRouting')} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300"><ChefHat className="h-5 w-5" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Kitchen routing</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Create preparation stations and map menu categories to a single station.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Default station
                    <select value={moduleSettings.kitchenRouting.defaultStation} disabled={!canUpdate || Boolean(saving)} onChange={(event) => updateModuleSetting('kitchenRouting', 'defaultStation', event.target.value)} className={inputClass}>
                      <option value="">No default station</option>
                      {moduleSettings.kitchenRouting.stations.map((station, index) => <option key={`${station.name}-${index}`} value={station.name}>{station.name || `Station ${index + 1}`}</option>)}
                    </select>
                  </label>
                  <div className="flex items-end justify-start sm:justify-end">
                    {canUpdate && <button type="button" disabled={Boolean(saving) || moduleSettings.kitchenRouting.stations.length >= 20} onClick={() => updateModuleSetting('kitchenRouting', 'stations', [...moduleSettings.kitchenRouting.stations, { name: '', categories: [] }])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"><Plus className="h-4 w-4" /> Add station</button>}
                  </div>
                </div>
                <div className="space-y-3">
                  {moduleSettings.kitchenRouting.stations.map((station, index) => (
                    <div key={`${station.name}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
                      <label className="space-y-1 text-[11px] font-semibold text-slate-500">Station name
                        <input required maxLength={60} disabled={!canUpdate || Boolean(saving)} value={station.name} onChange={(event) => updateModuleSetting('kitchenRouting', 'stations', moduleSettings.kitchenRouting.stations.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} placeholder="e.g. Hot kitchen" className={inputClass} />
                      </label>
                      <label className="space-y-1 text-[11px] font-semibold text-slate-500">Menu categories
                        <input disabled={!canUpdate || Boolean(saving)} value={station.categories.join(', ')} onChange={(event) => updateModuleSetting('kitchenRouting', 'stations', moduleSettings.kitchenRouting.stations.map((item, position) => position === index ? { ...item, categories: event.target.value.split(',').map((category) => category.trim()).filter(Boolean) } : item))} placeholder="e.g. Starters, Grills" className={inputClass} />
                      </label>
                      {canUpdate && <button type="button" aria-label={`Remove ${station.name || `station ${index + 1}`}`} disabled={Boolean(saving)} onClick={() => {
                        const stations = moduleSettings.kitchenRouting.stations.filter((_, position) => position !== index);
                        updateModuleSetting('kitchenRouting', 'stations', stations);
                        if (moduleSettings.kitchenRouting.defaultStation === station.name) updateModuleSetting('kitchenRouting', 'defaultStation', '');
                      }} className="self-end rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-700"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  ))}
                  {!moduleSettings.kitchenRouting.stations.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">No kitchen stations yet. Add a station to define where categories should be prepared.</p>}
                </div>
                <p className="text-[11px] leading-5 text-slate-400">Category mappings are setup rules; live kitchen ticket dispatch remains unavailable until the KDS workflow is enabled.</p>
                {canUpdate && <div className="flex justify-end"><button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'kitchenRouting' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save kitchen routing</button></div>}
              </form>

              <form onSubmit={(event) => saveBranchModule(event, 'inventoryPolicies')} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><ClipboardList className="h-5 w-5" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Inventory policies</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Set branch defaults for stock monitoring and receiving new inventory items.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['lowStockAlerts', 'Low-stock alerts', 'Flag items when their stock reaches the minimum threshold.'],
                    ['preventNegativeStock', 'Prevent negative stock', 'Reject stock operations that would take inventory below zero.'],
                    ['trackExpiry', 'Track expiry dates', 'Enable expiry tracking for applicable inventory items.'],
                  ].map(([key, label, description]) => (
                    <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <input type="checkbox" disabled={!canUpdate || Boolean(saving)} checked={moduleSettings.inventoryPolicies[key]} onChange={(event) => updateModuleSetting('inventoryPolicies', key, event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['defaultMinimumStock', 'Default minimum stock'],
                    ['defaultReorderLevel', 'Default reorder level'],
                  ].map(([key, label]) => (
                    <label key={key} className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {label}
                      <input type="number" min="0" max="1000000" step="any" disabled={!canUpdate || Boolean(saving)} value={moduleSettings.inventoryPolicies[key]} onChange={(event) => updateModuleSetting('inventoryPolicies', key, event.target.value)} className={inputClass} />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] leading-5 text-slate-400">These are branch-level defaults. Existing inventory quantities and item thresholds are not changed by saving this policy.</p>
                {canUpdate && <div className="flex justify-end"><button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'inventoryPolicies' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save inventory policies</button></div>}
              </form>

              <form onSubmit={(event) => saveBranchModule(event, 'receiptPrinting')} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"><Printer className="h-5 w-5" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Receipt printing</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Set receipt paper, copy count and footer. Print a sample to confirm your browser print setup.</p>
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <input type="checkbox" disabled={!canUpdate || Boolean(saving)} checked={moduleSettings.receiptPrinting.enabled} onChange={(event) => updateModuleSetting('receiptPrinting', 'enabled', event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Enable receipt printing</span><span className="mt-1 block text-xs text-slate-500">This setting does not connect or select a physical printer.</span></span>
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Printer label (optional)
                    <input maxLength={80} disabled={!canUpdate || Boolean(saving)} value={moduleSettings.receiptPrinting.printerName} onChange={(event) => updateModuleSetting('receiptPrinting', 'printerName', event.target.value)} placeholder="e.g. Front counter" className={inputClass} />
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Paper width
                    <select disabled={!canUpdate || Boolean(saving)} value={moduleSettings.receiptPrinting.paperWidth} onChange={(event) => updateModuleSetting('receiptPrinting', 'paperWidth', event.target.value)} className={inputClass}><option value="58mm">58 mm</option><option value="80mm">80 mm</option></select>
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Copies per receipt
                    <select disabled={!canUpdate || Boolean(saving)} value={moduleSettings.receiptPrinting.copies} onChange={(event) => updateModuleSetting('receiptPrinting', 'copies', Number(event.target.value))} className={inputClass}><option value={1}>1 copy</option><option value={2}>2 copies</option><option value={3}>3 copies</option></select>
                  </label>
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Receipt footer
                  <textarea rows={2} maxLength={250} disabled={!canUpdate || Boolean(saving)} value={moduleSettings.receiptPrinting.footer} onChange={(event) => updateModuleSetting('receiptPrinting', 'footer', event.target.value)} placeholder="e.g. Thank you for dining with us!" className={inputClass} />
                  <span className="block text-right text-[11px] font-normal text-slate-400">{moduleSettings.receiptPrinting.footer.length}/250</span>
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" disabled={!moduleSettings.receiptPrinting.enabled || Boolean(saving)} onClick={printTestReceipt} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"><Printer className="h-4 w-4" /> Print test receipt</button>
                  {canUpdate && <button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'receiptPrinting' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save receipt settings</button>}
                </div>
              </form>

              <form onSubmit={(event) => saveBranchModule(event, 'taxConfiguration')} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><ClipboardList className="h-5 w-5" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">India GST & service charge</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">GST registration and place-of-supply state are stored for this branch. GST uses each menu item’s configured tax rate; no rate is guessed.</p>
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <input type="checkbox" disabled={!canUpdate || Boolean(saving)} checked={moduleSettings.taxConfiguration.gstEnabled} onChange={(event) => updateModuleSetting('taxConfiguration', 'gstEnabled', event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Apply configured GST to new orders</span><span className="mt-1 block text-xs text-slate-500">Requires a valid GSTIN and matching registration-state code before it can be enabled.</span></span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">GSTIN
                    <input maxLength={15} disabled={!canUpdate || Boolean(saving)} value={moduleSettings.taxConfiguration.gstin} onChange={(event) => updateModuleSetting('taxConfiguration', 'gstin', event.target.value.toUpperCase())} placeholder="15-character GST registration number" className={inputClass} />
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Registration state code
                    <input inputMode="numeric" maxLength={2} pattern="[0-9]{2}" disabled={!canUpdate || Boolean(saving)} value={moduleSettings.taxConfiguration.stateCode} onChange={(event) => updateModuleSetting('taxConfiguration', 'stateCode', event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 33" className={inputClass} />
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">Service charge percentage
                    <input type="number" min="0" max="100" step="0.01" disabled={!canUpdate || Boolean(saving)} value={moduleSettings.taxConfiguration.serviceChargeRate} onChange={(event) => updateModuleSetting('taxConfiguration', 'serviceChargeRate', event.target.value)} className={inputClass} />
                    <span className="block text-[11px] font-normal text-slate-400">The configured percentage is added as a separate order charge. Confirm your local policy before enabling it.</span>
                  </label>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                  GST is split into CGST/SGST for the configured registration state, or IGST when a different place-of-supply state is provided on a delivery order. Add and review item tax rates in the menu before enabling GST; have your tax professional verify the registration and rates.
                </div>
                {canUpdate && <div className="flex justify-end"><button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'taxConfiguration' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save GST settings</button></div>}
              </form>

              <form onSubmit={(event) => saveBranchModule(event, 'paymentConfiguration')} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><CreditCard className="h-5 w-5" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Accepted payment methods</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Only selected methods can be recorded against orders at this branch.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['CASH', 'Cash', 'Record an in-person cash payment.'],
                    ['CARD', 'Debit / Credit Card', 'Accept through Paytm or PhonePe hosted checkout.'],
                    ['UPI', 'UPI', 'Accept through Paytm or PhonePe hosted checkout.'],
                    ['OTHER', 'Other', 'Show this branch’s configured payment QR; staff confirms after verifying payment.'],
                  ].map(([method, label, description]) => {
                    const checked = moduleSettings.paymentConfiguration.enabledMethods.includes(method);
                    const toggleMethod = () => {
                      const enabledMethods = checked
                        ? moduleSettings.paymentConfiguration.enabledMethods.filter((value) => value !== method)
                        : [...moduleSettings.paymentConfiguration.enabledMethods, method];
                      updateModuleSetting('paymentConfiguration', 'enabledMethods', enabledMethods);
                    };
                    return (
                      <label key={method} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <input type="checkbox" disabled={!canUpdate || Boolean(saving)} checked={checked} onChange={toggleMethod} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
                      </label>
                    );
                  })}
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Branch QR image for Other payments</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">Upload the QR image customers should scan. PNG, JPEG, or WebP; maximum 1 MB.</p>
                      {paymentQr?.fileName && <p className="mt-1 truncate text-[11px] text-slate-400">{paymentQr.fileName}</p>}
                    </div>
                    {paymentQr?.imageDataUrl && (
                      <img src={paymentQr.imageDataUrl} alt="Configured branch payment QR" className="h-28 w-28 rounded-lg border border-slate-200 bg-white object-contain p-1 dark:border-slate-700" />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className={`${buttonClass} cursor-pointer ${!canUpdate || Boolean(saving) ? 'pointer-events-none opacity-50' : ''}`}>
                      {saving === 'paymentQr' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {paymentQr?.configured ? 'Replace QR image' : 'Upload QR image'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!canUpdate || Boolean(saving)} onChange={savePaymentQrImage} />
                    </label>
                    {canUpdate && paymentQr?.configured && (
                      <button type="button" disabled={Boolean(saving)} onClick={deletePaymentQrImage} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">
                        <Trash2 className="h-4 w-4" /> Remove image
                      </button>
                    )}
                  </div>
                  {moduleSettings.paymentConfiguration.enabledMethods.includes('OTHER')
                    && !paymentQr?.configured
                    && <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">Upload a QR image before collecting Other payments.</p>}
                </div>
                {!moduleSettings.paymentConfiguration.enabledMethods.length && <p className="text-xs font-medium text-rose-600">Select at least one payment method before saving.</p>}
                <p className="text-[11px] leading-5 text-slate-400">Card and UPI use Paytm or PhonePe hosted checkout and are verified by the backend. Card details are never entered or stored in RMS.</p>
                {canUpdate && <div className="flex justify-end"><button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'paymentConfiguration' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save payment methods</button></div>}
              </form>
            </section>
          )}

          {branch.configuration.futureSections.some((section) => (
            !section.implemented && !moduleSettings?.[moduleForSection[section.key]]
          )) && (
            <section className="space-y-2">
              <h3 className="px-1 text-sm font-bold text-slate-900 dark:text-white">Still planned</h3>
              {branch.configuration.futureSections.filter((section) => (
                !section.implemented && !moduleSettings?.[moduleForSection[section.key]]
              )).map((section) => (
                <div key={section.key} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/70">
                  <span>{section.title}</span><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 font-semibold dark:bg-slate-800">Planned · {section.part}</span>
                </div>
              ))}
            </section>
          )}
        </section>
      )}

      {tab === 'setup' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Branch setup checklist</h2>
            <p className="mt-1 text-sm text-slate-500">
              {checklistReady
                ? 'The setup checks currently supported by the system are complete.'
                : 'Finish each available required check before marking the branch ready for testing.'}
            </p>
          </div>
          <div className="space-y-2">
            {availableChecks.map((item) => {
              const expanded = expandedChecklistKey === item.key;
              return (
                <section key={item.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`checklist-${item.key}`}
                    onClick={() => setExpandedChecklistKey(expanded ? '' : item.key)}
                    className="flex w-full items-start gap-3 p-4 text-left"
                  >
                    {item.status === 'incomplete' ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {item.title}
                        {!item.required && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">Optional</span>}
                        {item.required && item.requiredForTesting === false && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">Required for activation</span>}
                        {item.status === 'not_applicable' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">Not applicable</span>}
                      </span>
                      {item.reason && <span className="mt-1 block text-xs text-slate-500">{item.reason}</span>}
                    </span>
                    <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  {expanded && (
                    <div id={`checklist-${item.key}`} className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4 dark:border-slate-800">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {checklistQuestion[item.key] || item.reason || `Please complete: ${item.title}.`}
                      </p>
                      {item.key === 'identity' && form && (
                        <form onSubmit={saveIdentity} className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {[
                              ['name', 'Branch name', true],
                              ['code', 'Branch code', true],
                              ['description', 'Description', false],
                              ['addressLine1', 'Street address', true],
                              ['city', 'City', true],
                              ['countryCode', 'Country code', true],
                              ['phone', 'Phone number', false],
                              ['email', 'Branch email', false],
                            ].map(([key, label, required]) => (
                              <label key={key} className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {label}{required && <span className="ml-1 text-rose-500">*</span>}
                                <input
                                  required={required}
                                  disabled={!canUpdate || Boolean(saving)}
                                  className={inputClass}
                                  value={form[key]}
                                  onChange={(event) => setForm({
                                    ...form,
                                    [key]: key === 'countryCode' || key === 'code' ? event.target.value.toUpperCase() : event.target.value,
                                  })}
                                />
                              </label>
                            ))}
                          </div>
                          {canUpdate && (
                            <div className="flex justify-end">
                              <button type="submit" disabled={Boolean(saving)} className={buttonClass}>
                                {saving === 'identity' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save branch details
                              </button>
                            </div>
                          )}
                        </form>
                      )}
                      {item.key === 'hours' && (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Timezone
                              <input disabled={!canUpdate || Boolean(saving)} value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" className={inputClass} />
                            </label>
                            <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Business day starts at
                              <input type="time" disabled={!canUpdate || Boolean(saving)} value={cutoff} onChange={(event) => setCutoff(event.target.value)} className={inputClass} />
                            </label>
                          </div>
                          <div className="space-y-2">
                            {days.map(([day, label]) => {
                              const schedule = hours[day];
                              return (
                                <div key={day} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                                    <label className="flex items-center gap-2 text-xs text-slate-500">
                                      <input
                                        type="checkbox"
                                        disabled={!canUpdate || Boolean(saving)}
                                        checked={schedule.closed}
                                        onChange={(event) => updateDay(day, {
                                          closed: event.target.checked,
                                          intervals: event.target.checked ? [] : [{ start: '09:00', end: '17:00', overnight: false }],
                                        })}
                                      />
                                      Closed
                                    </label>
                                  </div>
                                  {!schedule.closed && (
                                    <div className="mt-3 space-y-2">
                                      {schedule.intervals.map((interval, index) => (
                                        <div key={`${day}-${index}`} className="grid gap-2 sm:grid-cols-2">
                                          <label className="space-y-1 text-xs font-semibold text-slate-500">
                                            {schedule.intervals.length > 1 ? `Period ${index + 1} opens` : 'Opens'}
                                            <input type="time" disabled={!canUpdate || Boolean(saving)} value={interval.start} onChange={(event) => updateInterval(day, index, 'start', event.target.value)} className={inputClass} />
                                          </label>
                                          <label className="space-y-1 text-xs font-semibold text-slate-500">
                                            Closes
                                            <input type="time" disabled={!canUpdate || Boolean(saving)} value={interval.end} onChange={(event) => updateInterval(day, index, 'end', event.target.value)} className={inputClass} />
                                          </label>
                                          {schedule.intervals.length > 1 && canUpdate && (
                                            <button type="button" disabled={Boolean(saving)} onClick={() => updateDay(day, { intervals: schedule.intervals.filter((_, position) => position !== index) })} className="text-left text-xs font-semibold text-rose-600">
                                              Remove period {index + 1}
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                      {canUpdate && schedule.intervals.length < 3 && (
                                        <button type="button" disabled={Boolean(saving)} onClick={() => updateDay(day, { intervals: [...schedule.intervals, { start: '17:00', end: '21:00', overnight: false }] })} className="text-xs font-semibold text-indigo-600">
                                          + Add service period
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {canUpdate && (
                            <div className="flex justify-end">
                              <button type="button" disabled={Boolean(saving)} onClick={() => saveHours(false)} className={buttonClass}>
                                {saving === 'hours' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save hours and timezone
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {item.key === 'manager' && (
                        access.can('memberships.manage') && managerRole ? (
                          <form onSubmit={assignManager} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                            <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Choose an active company member
                              <select required value={selectedManagerId} onChange={(event) => setSelectedManagerId(event.target.value)} className={inputClass}>
                                <option value="">Select a branch manager</option>
                                {companyMemberships.filter((membership) => membership.status === 'active').map((membership) => (
                                  <option key={membership.id} value={membership.id}>{membership.user?.name || membership.user?.email} · {membership.user?.email}</option>
                                ))}
                              </select>
                            </label>
                            <button type="submit" disabled={!selectedManagerId || Boolean(saving)} className={buttonClass}>
                              {saving === 'manager' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Assign manager
                            </button>
                          </form>
                        ) : (
                          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            {managerRole ? 'You need membership-management access to assign a branch manager.' : 'The company branch-manager role is not configured.'}
                          </p>
                        )
                      )}
                      {item.key === 'staff_coverage' && (
                        <button type="button" onClick={() => onNavigate(item.navigationTarget || '/admin/employees')} className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">
                          Assign employees <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                      {!['identity', 'hours', 'manager', 'staff_coverage'].includes(item.key) && (
                        <button type="button" onClick={() => reviewChecklistItem(item)} className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">
                          Open {item.relatedModule || 'setup'} fields <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <BranchOperationalSetup branch={branch} canUpdate={canUpdate} onRefresh={load} onNavigate={onNavigate} />
          {blockedChecks.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Not available yet</h3>
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">These checks need modules that are not implemented. A branch can be marked ready for testing, but cannot be activated until all activation requirements exist.</p>
              <ul className="mt-3 space-y-2">
                {blockedChecks.map((item) => <li key={item.key} className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /><span><strong>{item.title}</strong> — {item.reason}</span></li>)}
              </ul>
            </div>
          )}
          {canLifecycle && branch.setupStatus === 'draft' && (
            <div className="flex justify-end">
              <button type="button" disabled={!checklistReady || Boolean(saving)} className={buttonClass} onClick={() => act('mark-ready')}>
                {saving === 'mark-ready' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Mark ready for testing
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'access' && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Branch access</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">A branch manager must be assigned through Employees & Roles. Staff job titles alone do not give login access.</p>
          </div>
          {assignments.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">{item.user?.name} · {item.user?.email} · {item.status}</div>)}
          {assignments.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">No membership is assigned to this branch yet.</p>}
          {access.can('memberships.manage') && managerRole && (
            <form onSubmit={assignManager} className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Assign a branch manager
                <select required value={selectedManagerId} onChange={(event) => setSelectedManagerId(event.target.value)} className={inputClass}>
                  <option value="">Select an active company member</option>
                  {companyMemberships.filter((item) => item.status === 'active').map((item) => (
                    <option key={item.id} value={item.id}>{item.user?.name || item.user?.email} · {item.user?.email}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={!selectedManagerId || Boolean(saving)} className={buttonClass}>
                {saving === 'manager' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Assign manager
              </button>
            </form>
          )}
          {access.can('memberships.manage') && !managerRole && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">The company branch-manager role is unavailable. Review roles in Employees & Roles before assigning a manager.</p>
          )}
          <button type="button" onClick={() => onNavigate('/admin/employees')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Open Employees & Roles <ArrowRight className="h-4 w-4" /></button>
        </section>
      )}

      {tab === 'integrations' && (
        <section className="space-y-5">
          {canManagePos && (
            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Desktop POS sign-in</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    Use this branch login email in Desktop POS. Passwords are stored securely and cannot be shown; set a new password here if you do not know the original. The new password will work for this email across RMS sign-in.
                  </p>
                </div>
                {posLogin ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Login email
                        <input readOnly value={posLogin.email} className={inputClass} />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        New password
                        <div className="relative">
                          <input
                            required
                            type={showPosLoginPassword ? 'text' : 'password'}
                            minLength={8}
                            maxLength={256}
                            autoComplete="new-password"
                            value={posLoginPassword}
                            onChange={(event) => setPosLoginPassword(event.target.value)}
                            placeholder="Enter at least 8 characters"
                            disabled={Boolean(saving)}
                            className={`${inputClass} pr-16`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPosLoginPassword((visible) => !visible)}
                            className="absolute inset-y-0 right-2 px-2 text-xs font-bold text-slate-500"
                            aria-label={showPosLoginPassword ? 'Hide new password' : 'Show new password'}
                            aria-pressed={showPosLoginPassword}
                          >
                            {showPosLoginPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </label>
                    </div>
                    {!posLogin.active && <p className="text-sm text-rose-600">This branch login account is disabled. Enable the account before resetting its password.</p>}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!posLogin.active || posLoginPassword.length < 8 || posLoginPassword.length > 256 || Boolean(saving)}
                        onClick={resetPosLoginPassword}
                        className={buttonClass}
                      >
                        {saving === 'pos-login' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Set new POS password
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    No branch login account or active branch manager is assigned yet. Create the branch login during setup or assign an active RMS account in Employees &amp; Roles.
                  </p>
                )}
            </section>
          )}
          {canUpdate && (
            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Hosted payments · Sandbox</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Set up this branch’s Paytm and PhonePe merchant accounts. Credentials are encrypted by the backend and never shown again. Card and UPI details are entered only on the provider’s hosted checkout; RMS does not collect card numbers or CVV.</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                Before saving credentials, configure <code>PAYMENT_GATEWAY_ENCRYPTION_KEY</code> (a unique 32-byte key) and <code>PAYMENT_GATEWAY_PUBLIC_URL</code> (the backend’s public HTTPS origin) on the backend, then restart it. Generate a key with <code>node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"</code>. Keep a secure backup; rotating the key makes saved credentials unreadable.
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {[
                  { key: 'PAYTM', title: 'Paytm', fields: [
                    ['merchantId', 'Merchant ID (MID)', 'text'],
                    ['merchantKey', 'Merchant key', 'password'],
                    ['websiteName', 'Website name', 'text'],
                  ] },
                  { key: 'PHONEPE', title: 'PhonePe', fields: [
                    ['clientId', 'Client ID', 'text'],
                    ['clientSecret', 'Client secret', 'password'],
                    ['clientVersion', 'Client version', 'number'],
                  ] },
                ].map((provider) => {
                  const details = paymentGateways?.providers?.[provider.key];
                  return (
                    <form key={provider.key} onSubmit={(event) => saveGatewayCredentials(event, provider.key)} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{provider.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">{details?.configured ? `Configured · ${details.accountLabel}` : 'Not configured'}{details?.configuredAt ? ` · ${new Date(details.configuredAt).toLocaleDateString()}` : ''}</p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Sandbox</span>
                      </div>
                      {provider.fields.map(([field, label, type]) => (
                        <label key={field} className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {label}
                          <input
                            type={type}
                            min={type === 'number' ? '1' : undefined}
                            required={field === 'merchantId' || field === 'clientId' || field === 'websiteName' || field === 'clientVersion' || !details?.configured}
                            autoComplete={type === 'password' ? 'new-password' : 'off'}
                            value={gatewayCredentials[provider.key][field]}
                            placeholder={type === 'password' && details?.configured ? 'Saved securely · leave blank to keep current value' : ''}
                            disabled={!canUpdate || Boolean(saving)}
                            onChange={(event) => setGatewayCredentials((current) => ({
                              ...current,
                              [provider.key]: { ...current[provider.key], [field]: event.target.value },
                            }))}
                            className={inputClass}
                          />
                        </label>
                      ))}
                      <div className="flex flex-wrap justify-end gap-2 pt-1">
                        {details?.configured && <button type="button" disabled={Boolean(saving)} onClick={(event) => saveGatewayCredentials(event, provider.key, true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300">Remove</button>}
                        <button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === `gateway-${provider.key}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save {provider.title} sandbox credentials</button>
                      </div>
                    </form>
                  );
                })}
              </div>
            </section>
          )}
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><KeyRound className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Desktop POS API connection</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Each branch has its own POS API key. Generate it here, then enter the backend URL and key in Desktop POS. The key can access only this branch’s POS operations. For sign-in, use the email and password in the Desktop POS sign-in panel; API keys do not sign in as users.</p>
            </div>
          </div>
          {canManagePos ? (
            <>
              <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Desktop POS Backend URL
                  <input
                    aria-label="Desktop POS Backend URL"
                    value={desktopBackendUrl}
                    onChange={(event) => {
                      setDesktopBackendUrl(event.target.value);
                      setCopiedBackendUrl(false);
                    }}
                    className={inputClass}
                    spellCheck="false"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={copyDesktopBackendUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    {copiedBackendUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiedBackendUrl ? 'Copied!' : 'Copy backend URL'}
                  </button>
                  <p className="text-xs text-slate-500">Paste this into the Backend URL field in Desktop POS. You can edit it here if the desktop uses a different backend address.</p>
                </div>
              </div>
              <div className="grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200 sm:grid-cols-2">
                {['Read menu and orders', 'Create orders', 'Collect payments', 'Read terminals and manage cash sessions'].map((scope) => (
                  <p key={scope} className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0" />{scope}</p>
                ))}
                <p className="sm:col-span-2">Inventory, staff, branch settings, terminal configuration, refunds and order updates are not available to this key.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{apiKeyMetadata?.active ? 'Key is active' : 'No active API key'}</p>
                  {apiKeyMetadata?.active ? (
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {apiKeyMetadata.keyPrefix}… · Created {apiKeyMetadata.createdAt ? new Date(apiKeyMetadata.createdAt).toLocaleString() : 'date unavailable'}
                      {apiKeyMetadata.lastUsedAt && ` · Last used ${new Date(apiKeyMetadata.lastUsedAt).toLocaleString()}`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Generate an API key to connect Desktop POS.</p>
                  )}
                  {!issuedApiKey && apiKeyMetadata?.active && (
                    <p className="mt-1 text-xs text-slate-500">The full key is only available right after you generate or rotate it.</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={Boolean(saving)}
                  onClick={copyApiKey}
                  title={issuedApiKey ? 'Copy this branch API key' : apiKeyMetadata?.active ? 'Confirm to rotate the active key and copy the new key' : 'Generate a key and copy it to the clipboard'}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copiedApiKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiedApiKey ? 'Copied!' : 'Copy API key'}
                </button>
                <button type="button" disabled={Boolean(saving)} onClick={generateApiKey} className={buttonClass}>
                  {saving === 'api-key' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : apiKeyMetadata?.active ? <RotateCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  {apiKeyMetadata?.active ? 'Rotate key' : 'Generate key'}
                </button>
                {apiKeyMetadata?.active && (
                  <button type="button" disabled={Boolean(saving)} onClick={revokeApiKey} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30">
                    Revoke
                  </button>
                )}
              </div>
              {issuedApiKey && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Desktop POS connection for {branch.name}. Copy this branch key now; for security, it cannot be retrieved after you leave this page. Paste it into the Branch API key field in Desktop POS.</p>
                  <div className="flex flex-wrap gap-2">
                    <input aria-label="New branch API key" readOnly value={issuedApiKey} onFocus={(event) => event.target.select()} className={`${inputClass} min-w-0 flex-1 font-mono`} />
                    <button type="button" onClick={copyDesktopConnectionDetails} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
                      <Copy className="h-4 w-4" />Copy Desktop POS connection details
                    </button>
                  </div>
                  <p className="break-all font-mono text-[11px] text-amber-800 dark:text-amber-300">The connection button copies the backend URL and full branch API key together. Keep the key private; it is shown only once and can access this branch’s POS operations.</p>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">You need POS management or branch lifecycle permission for this branch to manage its API key.</p>
          )}
          </section>
        </section>
      )}

      {tab === 'history' && (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-white">Branch history</h2>
          {history.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-3 text-sm last:border-0 dark:border-slate-800"><span className="font-medium text-slate-700 dark:text-slate-200">{event.action}</span><span className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()}</span></div>)}
          {history.length === 0 && <p className="text-sm text-slate-500">No branch history yet.</p>}
        </section>
      )}
    </div>
  );
};

export default BranchWorkspace;
