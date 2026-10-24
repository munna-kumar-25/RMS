import React, { useState } from 'react';
import { useBranch } from '../../hooks/useBranch.js';
import branchApi from '../../services/branch.api.js';
import {
  X,
  Building,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

const INITIAL_FORM_STATE = {
  // Section A: Branch Profile
  name: '',
  code: '',
  phone: '',
  email: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  taxRegNumber: '',
  defaultTaxRate: 5,
  currency: 'INR',
  allowOfflineBilling: false,
  enableKDS: true,

  // Section B: Initial Branch Admin Account
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  adminPhone: '',
};

export const CreateBranchModal = ({ isOpen, onClose }) => {
  const { refreshBranches, setActiveBranch } = useBranch();

  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [activeStep, setActiveStep] = useState(1); // 1 = Branch Details, 2 = Admin Profile
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear field-specific validation error on user input
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /**
   * Validate Section A: Branch Details
   */
  const validateStep1 = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Branch name is required';
    if (!formData.code.trim()) {
      newErrors.code = 'Branch code is required';
    } else if (!/^[A-Za-z0-9_-]+$/.test(formData.code.trim())) {
      newErrors.code = 'Code must be alphanumeric with optional hyphens/underscores';
    }

    if (!formData.phone.trim()) newErrors.phone = 'Contact phone is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Contact email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(formData.email.trim())) {
      newErrors.email = 'Please provide a valid email format';
    }

    if (!formData.city.trim()) newErrors.city = 'City is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Validate Section B: Admin Details
   */
  const validateStep2 = () => {
    const newErrors = {};

    if (!formData.adminName.trim()) newErrors.adminName = 'Admin full name is required';
    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = 'Admin email address is required';
    } else if (!/^\S+@\S+\.\S+$/.test(formData.adminEmail.trim())) {
      newErrors.adminEmail = 'Please provide a valid email format';
    }

    if (!formData.adminPassword) {
      newErrors.adminPassword = 'Password is required';
    } else if (formData.adminPassword.length < 6) {
      newErrors.adminPassword = 'Password must be at least 6 characters long';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (activeStep === 1 && validateStep1()) {
      setActiveStep(2);
    }
  };

  const handlePrevStep = () => {
    setActiveStep(1);
  };

  /**
   * Submit Payload to backend POST /api/branches
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    const isStep1Valid = validateStep1();
    const isStep2Valid = validateStep2();

    if (!isStep1Valid) {
      setActiveStep(1);
      return;
    }
    if (!isStep2Valid) {
      setActiveStep(2);
      return;
    }

    setIsSubmitting(true);

    const payload = {
      branch: {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        contact: {
          phone: formData.phone.trim(),
          email: formData.email.trim().toLowerCase(),
          address: {
            street: formData.street.trim(),
            city: formData.city.trim(),
            state: formData.state.trim(),
            postalCode: formData.postalCode.trim(),
            country: formData.country.trim(),
          },
        },
        taxDetails: {
          taxRegNumber: formData.taxRegNumber.trim(),
          defaultTaxRate: Number(formData.defaultTaxRate) || 0,
        },
        settings: {
          currency: formData.currency.trim().toUpperCase(),
          allowOfflineBilling: Boolean(formData.allowOfflineBilling),
          enableKDS: Boolean(formData.enableKDS),
        },
      },
      adminUser: {
        name: formData.adminName.trim(),
        email: formData.adminEmail.trim().toLowerCase(),
        password: formData.adminPassword,
        phone: formData.adminPhone.trim(),
      },
    };

    try {
      const result = await branchApi.createBranchWithAdmin(payload);
      setSuccessMessage(
        `Branch '${result.branch?.name}' successfully provisioned with Admin '${result.admin?.email}'!`
      );

      // Refresh branches list
      await refreshBranches();

      // Automatically select newly created branch
      if (result.branch) {
        setActiveBranch(result.branch);
      }

      // Close modal after brief success presentation
      setTimeout(() => {
        setFormData(INITIAL_FORM_STATE);
        setActiveStep(1);
        setSuccessMessage(null);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('[CreateBranchModal] Error provisioning branch:', err);
      setServerError(err.message || 'Failed to provision branch');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-400/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Provision New Branch
              </h2>
              <p className="text-xs text-slate-500">
                Setup branch profile, tax configurations, and initial branch admin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-step progress tabs */}
        <div className="grid grid-cols-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center justify-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeStep === 1
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                activeStep === 1
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
              }`}
            >
              1
            </span>
            <span>Section A: Branch Details</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (validateStep1()) setActiveStep(2);
            }}
            className={`flex items-center justify-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeStep === 2
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                activeStep === 2
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
              }`}
            >
              2
            </span>
            <span>Section B: Branch Admin Account</span>
          </button>
        </div>

        {/* Server Alert Banners */}
        {serverError && (
          <div className="m-5 p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Provisioning Error: </span>
              {serverError}
            </div>
          </div>
        )}

        {successMessage && (
          <div className="m-5 p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
            {/* ======================================================= */}
            {/* STEP 1: Branch Details                                   */}
            {/* ======================================================= */}
            {activeStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Branch Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Branch Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g. Connaught Place Flagship"
                      className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.name ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    {errors.name && <p className="mt-1 text-[11px] text-rose-500">{errors.name}</p>}
                  </div>

                  {/* Branch Code */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Branch Code (Uppercase) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="code"
                      value={formData.code}
                      onChange={(e) =>
                        handleChange({
                          target: { name: 'code', value: e.target.value.toUpperCase() },
                        })
                      }
                      placeholder="e.g. BR-DEL-01"
                      className={`w-full px-3 py-2 text-xs font-mono rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.code ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    {errors.code && <p className="mt-1 text-[11px] text-rose-500">{errors.code}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Contact Phone <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+91 9876543210"
                      className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.phone ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    {errors.phone && <p className="mt-1 text-[11px] text-rose-500">{errors.phone}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Contact Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="delhi@restaurant.com"
                      className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.email ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    {errors.email && <p className="mt-1 text-[11px] text-rose-500">{errors.email}</p>}
                  </div>
                </div>

                {/* Address Section */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Physical Address
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                    <div className="md:col-span-3">
                      <input
                        type="text"
                        name="street"
                        value={formData.street}
                        onChange={handleChange}
                        placeholder="Street Address / Suite"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        placeholder="City *"
                        className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${
                          errors.city ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        placeholder="State"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        name="postalCode"
                        value={formData.postalCode}
                        onChange={handleChange}
                        placeholder="Postal Code"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Tax & Settings */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      GST / Tax ID Number
                    </label>
                    <input
                      type="text"
                      name="taxRegNumber"
                      value={formData.taxRegNumber}
                      onChange={handleChange}
                      placeholder="e.g. 07AAAAA0000A1Z5"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Default Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      name="defaultTaxRate"
                      value={formData.defaultTaxRate}
                      onChange={handleChange}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      name="enableKDS"
                      checked={formData.enableKDS}
                      onChange={handleChange}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Enable Kitchen Display Screen (KDS)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      name="allowOfflineBilling"
                      checked={formData.allowOfflineBilling}
                      onChange={handleChange}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Allow Offline POS Billing</span>
                  </label>
                </div>
              </div>
            )}

            {/* ======================================================= */}
            {/* STEP 2: Initial Branch Admin Account                     */}
            {/* ======================================================= */}
            {activeStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl flex items-center gap-3 text-xs text-indigo-800 dark:text-indigo-300">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-indigo-600" />
                  <span>
                    This account will be created as <strong>BRANCH_ADMIN</strong> for{' '}
                    <strong>{formData.name || 'this branch'}</strong> with full operational permissions.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Admin Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Admin Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="adminName"
                      value={formData.adminName}
                      onChange={handleChange}
                      placeholder="e.g. Ramesh Kumar"
                      className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.adminName
                          ? 'border-rose-400'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    {errors.adminName && (
                      <p className="mt-1 text-[11px] text-rose-500">{errors.adminName}</p>
                    )}
                  </div>

                  {/* Admin Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Admin Login Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="adminEmail"
                      value={formData.adminEmail}
                      onChange={handleChange}
                      placeholder="admin.delhi@rms.com"
                      className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        errors.adminEmail
                          ? 'border-rose-400'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    {errors.adminEmail && (
                      <p className="mt-1 text-[11px] text-rose-500">{errors.adminEmail}</p>
                    )}
                  </div>

                  {/* Admin Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Initial Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="adminPassword"
                        value={formData.adminPassword}
                        onChange={handleChange}
                        placeholder="Minimum 6 characters"
                        className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          errors.adminPassword
                            ? 'border-rose-400'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {errors.adminPassword && (
                      <p className="mt-1 text-[11px] text-rose-500">{errors.adminPassword}</p>
                    )}
                  </div>

                  {/* Admin Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Admin Mobile Phone
                    </label>
                    <input
                      type="text"
                      name="adminPhone"
                      value={formData.adminPhone}
                      onChange={handleChange}
                      placeholder="+91 9876543210"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Provisioning summary list */}
                <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Automated Seed Provisioning:
                  </span>
                  <ul className="text-[11px] text-slate-500 space-y-1 list-disc list-inside">
                    <li>Creates default Accounting Ledgers (Cash in Hand, Sales, Taxes, Expenses)</li>
                    <li>Creates default Dining Hall Section and initial tables (T-01, T-02)</li>
                    <li>Assigns full CRUD access permissions to POS, KDS, Menu, Inventory, and Staff</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
            {activeStep === 2 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Branch Details</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}

            {activeStep === 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                <span>Continue to Admin Setup</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Provisioning Branch...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Provision Branch</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBranchModal;
