import React, { useEffect, useState } from 'react';
import { CheckCircle2, Save, Settings } from 'lucide-react';
import { useAccess } from '../../context/AccessContext.jsx';
import { updateCurrentCompanyRequest } from '../../services/access.api.js';

const DEFAULTS = {
  timezone: 'Asia/Kolkata',
  currencyCode: 'INR',
  businessDayCutoff: '04:00',
  supportedOrderChannels: ['dine_in'],
  reservationEnabled: false,
  onlineOrderingEnabled: false,
  phone: '',
  email: '',
  receiptName: '',
};

type CompanyDefaults = typeof DEFAULTS;
type OrderChannel = 'dine_in' | 'takeaway' | 'delivery' | 'online';

const channels: { value: OrderChannel; label: string }[] = [
  { value: 'dine_in', label: 'Dine in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'online', label: 'Online' },
];

export const SettingsPage: React.FC = () => {
  const access = useAccess();
  const [settings, setSettings] = useState<CompanyDefaults>(DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const canEdit = access.can('settings.manage');

  useEffect(() => {
    const savedDefaults = access.activeCompany?.branchDefaults || {};
    setSettings({
      ...DEFAULTS,
      ...savedDefaults,
      supportedOrderChannels: Array.isArray(savedDefaults.supportedOrderChannels)
        ? savedDefaults.supportedOrderChannels
        : DEFAULTS.supportedOrderChannels,
    });
    setSaved(false);
    setError('');
  }, [access.activeCompany]);

  const updateSetting = <K extends keyof CompanyDefaults>(key: K, value: CompanyDefaults[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const toggleChannel = (channel: OrderChannel) => {
    const selected = settings.supportedOrderChannels as OrderChannel[];
    const next = selected.includes(channel)
      ? selected.filter((item) => item !== channel)
      : [...selected, channel];
    updateSetting('supportedOrderChannels', next as CompanyDefaults['supportedOrderChannels']);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaved(false);
    setIsSaving(true);
    try {
      await updateCurrentCompanyRequest({ branchDefaults: settings });
      await access.refresh();
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save company defaults.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-xl font-black text-slate-900 dark:text-white md:text-2xl">
          <Settings className="h-6 w-6 text-indigo-600" />
          Company Defaults
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          These saved defaults apply to new branches. Branch-specific overrides remain in each branch’s configuration.
        </p>
      </header>

      {!canEdit && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          You have read-only access to company settings.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      {saved && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Company defaults saved.
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Regional and receipt defaults</h2>
            <p className="mt-1 text-xs text-slate-500">Currency is company-wide and cannot be overridden at branch level.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Timezone
              <input required value={settings.timezone} onChange={(event) => updateSetting('timezone', event.target.value)} className={inputClass} placeholder="Asia/Kolkata" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Business-day cutoff
              <input required type="time" value={settings.businessDayCutoff} onChange={(event) => updateSetting('businessDayCutoff', event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Currency code
              <input required maxLength={3} pattern="[A-Za-z]{3}" value={settings.currencyCode} onChange={(event) => updateSetting('currencyCode', event.target.value.toUpperCase())} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Receipt name
              <input maxLength={120} value={settings.receiptName} onChange={(event) => updateSetting('receiptName', event.target.value)} className={inputClass} placeholder="Use company or branch name" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Contact phone
              <input type="tel" maxLength={30} value={settings.phone} onChange={(event) => updateSetting('phone', event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Contact email
              <input type="email" maxLength={254} value={settings.email} onChange={(event) => updateSetting('email', event.target.value)} className={inputClass} />
            </label>
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Supported order channels</h2>
            <p className="mt-1 text-xs text-slate-500">At least one order channel must be enabled.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <label key={channel.value} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={(settings.supportedOrderChannels as OrderChannel[]).includes(channel.value)}
                  onChange={() => toggleChannel(channel.value)}
                  disabled={!canEdit}
                />
                {channel.label}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Branch defaults</h2>
          {([
            ['reservationEnabled', 'Enable reservations by default'],
            ['onlineOrderingEnabled', 'Enable online ordering by default'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => updateSetting(key, event.target.checked)}
                disabled={!canEdit}
              />
              {label}
            </label>
          ))}
        </section>

        <footer className="flex justify-end border-t border-slate-100 pt-5 dark:border-slate-800">
          <button
            type="submit"
            disabled={!canEdit || isSaving || settings.supportedOrderChannels.length === 0}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save company defaults'}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default SettingsPage;
