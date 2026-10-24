import React, { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  LayoutGrid,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Layers,
} from 'lucide-react';
import Modal from '../common/Modal.tsx';
import { useAppStore } from '../../store/AppStore.tsx';
import { useBranch } from '../../hooks/useBranch.js';
import branchApi from '../../services/branch.api.js';

interface BranchWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BranchWizardModal: React.FC<BranchWizardModalProps> = ({ isOpen, onClose }) => {
  const { addBranch, addTable, addEmployee, setActiveBranchId } = useAppStore();
  const { refreshBranches, setActiveBranch } = useBranch();

  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);

  // Form State
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [taxRate, setTaxRate] = useState(5);
  const [currency, setCurrency] = useState('INR');

  // Admin Account
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');

  // Floor & Tables
  const [sections, setSections] = useState(['Ground Floor', 'First Floor']);
  const [tableCount, setTableCount] = useState(16);

  // Default Ledgers
  const [seedLedgers, setSeedLedgers] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!branchName.trim() || !branchCode.trim() || !city.trim() || !email.trim() || !phone.trim()) {
        setError('Please fill in all required branch details.');
        return;
      }
    }
    if (step === 2) {
      if (!adminName.trim() || !adminEmail.trim() || !adminPassword || adminPassword.length < 6) {
        setError('Please provide valid admin name, email, and a password of at least 6 characters.');
        return;
      }
    }
    if (step === 1 && (!/^[A-Z0-9_-]+$/i.test(branchCode.trim()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
      setError('Enter a valid branch email and a code containing only letters, numbers, hyphens or underscores.');
      return;
    }
    if (step === 2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
      setError('Enter a valid administrator email address.');
      return;
    }
    if (step === 3 && sections.length === 0) {
      setError('Select at least one floor section.');
      return;
    }
    if (step === 4 && (!Number.isInteger(tableCount) || tableCount < 4 || tableCount > 50)) {
      setError('Enter a whole number of tables between 4 and 50.');
      return;
    }
    setStep((s) => s + 1);
  };

  const handleFinish = async () => {
    if (isSubmitting) return;
    setError(null);
    if (!adminName.trim() || !adminEmail.trim() || !adminPassword || adminPassword.length < 6) {
      setStep(2);
      setError('Please provide valid admin name, email, and a password of at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await branchApi.createBranchWithAdmin({
        branch: {
          name: branchName.trim(),
          code: branchCode.trim().toUpperCase(),
          contact: {
            phone: phone.trim(),
            email: email.trim().toLowerCase(),
            address: {
              street: street.trim(),
              city: city.trim(),
              state: state.trim(),
              postalCode: postalCode.trim(),
              country: 'India',
            },
          },
          taxDetails: {
            taxRegNumber: gstNumber.trim(),
            defaultTaxRate: Number(taxRate) || 0,
          },
          settings: {
            currency: currency.toUpperCase(),
            allowOfflineBilling: true,
            enableKDS: true,
          },
        },
        adminUser: {
          name: adminName.trim(),
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
          phone: adminPhone.trim() || phone.trim(),
        },
        floorConfig: {
          sections,
          tableCount,
          defaultCapacity: 4,
          seedLedgers,
        },
      });

      if (result?.branch) {
        const createdBranch = {
          ...result.branch,
          todayRevenue: result.branch.todayRevenue || 0,
          todayOrders: result.branch.todayOrders || 0,
          employeeCount: result.branch.employeeCount || 1,
        };
        addBranch(createdBranch);
        setActiveBranchId(createdBranch._id);
        setActiveBranch(createdBranch);
        if (result.admin) {
          addEmployee({
            ...result.admin,
            branchName: createdBranch.name,
            employeeId: String(result.admin._id).slice(-6).toUpperCase(),
            status: 'ACTIVE',
            joiningDate: new Date().toISOString().split('T')[0],
          });
        }
        (result.seededRecords?.tables || []).forEach((table: any) => {
          addTable({
            ...table,
            sectionId: table.sectionId || `${createdBranch._id}:${table.sectionName}`,
            sectionName: table.sectionName || 'Ground Floor',
            status: table.status === 'VACANT' ? 'AVAILABLE' : table.status || 'AVAILABLE',
          });
        });
      }
      await refreshBranches();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to provision branch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    'Branch Details',
    'Admin Account',
    'Floor & Sections',
    'Tables Setup',
    'Ledger Accounts',
    'Review & Provision',
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!isSubmitting) onClose(); }}
      title="Provision New Restaurant Branch"
      subtitle={`Step ${step} of 6: ${steps[step - 1]}`}
      maxWidth="4xl"
      icon={<Building2 className="w-5 h-5" />}
    >
      <div className="rms-branch-wizard space-y-6">
        {/* Step Indicator */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          {steps.map((label, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5 text-center text-[10px]">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ring-4 ring-transparent ${step === idx + 1
                  ? 'bg-indigo-600 text-white ring-indigo-100 dark:ring-indigo-950'
                  : step > idx + 1
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
              >
                {step > idx + 1 ? '✓' : idx + 1}
              </span>
              <span
                className={`font-medium leading-tight ${step === idx + 1 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400'
                  }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Branch Details */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Branch Name *
              </label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Branch 05 - Chandigarh Elante"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Branch Code *
              </label>
              <input
                type="text"
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                placeholder="e.g. BR-CHD-01"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Contact Phone *
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98112 00000"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Branch Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chandigarh@restaurant.com"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Street Address
              </label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Mall Road, Phase 1"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                City *
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Chandigarh"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                GST / Tax Registration
              </label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                placeholder="03AAACG1234F1Z0"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Step 2: Initial Admin Account */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl flex items-center gap-2 text-xs text-indigo-800 dark:text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>
                Creates the primary <strong>BRANCH_ADMIN</strong> credential for this specific location.
              </span>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white dark:bg-slate-900 p-2 text-indigo-600 dark:text-indigo-400 shadow-sm"><Building2 className="w-5 h-5" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Tell us about this location</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Use the public branch details your staff and guests should recognize.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Branch Admin Full Name *
                  </label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Gurpreet Singh"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Login Email *
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="gurpreet.admin@restaurant.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Password (min 6 characters) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter secure password"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Admin Mobile Phone
                  </label>
                  <input
                    type="text"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    placeholder="+91 98111 22334"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Floor / Sections */}
        {step === 3 && (
          <div className="space-y-4">
            <span className="text-xs text-slate-500">
              Select or customize dining spaces for table floor planning:
            </span>
            <div className="space-y-2">
              {['Ground Floor', 'First Floor', 'Second Floor', 'Rooftop / Terrace'].map(
                (secName) => {
                  const isChecked = sections.includes(secName);
                  return (
                    <label
                      key={secName}
                      className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="text-xs font-semibold text-slate-800 dark:text-white">
                        {secName}
                      </span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSections(sections.filter((s) => s !== secName));
                          } else {
                            setSections([...sections, secName]);
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                    </label>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* Step 4: Tables Setup */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Number of Default Tables to Generate
              </label>
              <input
                type="number"
                min="4"
                max="50"
                value={tableCount}
                onChange={(e) => setTableCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Will auto-generate T-01 through T-{tableCount < 10 ? `0${tableCount}` : tableCount} across selected sections with standard 4-top capacities.
              </span>
            </div>
          </div>
        )}

        {/* Step 5: Default Ledgers */}
        {step === 5 && (
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={seedLedgers}
                onChange={(e) => setSeedLedgers(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Seed Enterprise Default Chart of Accounts
                </span>
                <span className="text-[11px] text-slate-500">
                  Includes Cash Register Drawer (1010), HDFC UPI/Card Clearing (1020), F&B Sales Revenue (4010), and GST Tax Output (2010).
                </span>
              </div>
            </label>
          </div>
        )}

        {/* Step 6: Confirmation */}
        {step === 6 && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-emerald-900 dark:text-emerald-300">
                  Ready to Provision Branch
                </h4>
                <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                  The atomic multi-tenancy transaction will create the branch entity, provision the admin profile, configure floor sections, and establish accounting ledgers.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Branch Name</span>
                <span className="font-bold text-slate-800 dark:text-white">{branchName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Code</span>
                <span className="font-bold font-mono text-slate-800 dark:text-white">{branchCode}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Branch Admin</span>
                <span className="font-bold text-slate-800 dark:text-white">{adminName} ({adminEmail})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">City</span>
                <span className="font-bold text-slate-800 dark:text-white">{city}</span>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
          )}

          {step < 6 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait rounded-xl shadow-sm transition-colors"
            >
              {isSubmitting ? <span>Saving branch...</span> : <><CheckCircle2 className="w-4 h-4" /><span>Confirm & Provision</span></>}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default BranchWizardModal;
