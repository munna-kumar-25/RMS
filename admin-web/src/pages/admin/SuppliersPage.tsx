import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import Modal from '../../components/common/Modal.tsx';

export const SuppliersPage: React.FC = () => {
  const { suppliers, addSupplier, activeBranchId } = useAppStore();
  const access = useAccess();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'IMMEDIATE' | 'NET_15' | 'NET_30' | 'NET_60'>('NET_30');
  const [categoriesInput, setCategoriesInput] = useState('DAIRY, GROCERY');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      return (
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.gstNumber.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [suppliers, searchQuery]);

  // Aggregate Metrics
  const totalVendors = filteredSuppliers.length;
  const activeVendors = filteredSuppliers.filter((supplier) => supplier.status === 'ACTIVE').length;
  const suppliedCategoryCount = new Set(filteredSuppliers.flatMap((supplier) => supplier.categoriesSupplied)).size;

  const selectedBranch = access.branches.find((branch) => branch.id === activeBranchId);
  const canCreateSupplier = Boolean(activeBranchId && (
    access.isCompanySuperAdmin || selectedBranch?.permissions.includes('inventory.receive')
  ));

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !phone.trim()) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await addSupplier({
        name: name.trim() || companyName.trim(),
        companyName: companyName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        city: city.trim(),
        address: address.trim(),
        gstNumber: gstNumber.trim(),
        paymentTerms,
        categoriesSupplied: categoriesInput.split(',').map((category) => category.trim()).filter(Boolean),
        status: 'ACTIVE',
      });
      setIsAddModalOpen(false);
      setName('');
      setCompanyName('');
      setPhone('');
      setEmail('');
      setCity('');
      setAddress('');
      setGstNumber('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this supplier.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-indigo-600" />
            <span>Suppliers & Raw Material Vendors</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Branch-scoped supplier contacts, payment terms, GST details, and supplied categories.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSaveError('');
            setIsAddModalOpen(true);
          }}
          disabled={!canCreateSupplier}
          title={!activeBranchId ? 'Select a branch before adding a supplier.' : undefined}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </button>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Approved Vendors
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalVendors} Companies
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Active Suppliers
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1 block">
            {activeVendors} Companies
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Supplied Categories
          </span>
          <span className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1 block">
            {suppliedCategoryCount} Categories
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor company, contact name, or GSTIN..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Vendor Company</th>
                <th className="py-3 px-4">Contact Person</th>
                <th className="py-3 px-4">Contact Info</th>
                <th className="py-3 px-4">GST Number</th>
                <th className="py-3 px-4">Supplied Categories</th>
                <th className="py-3 px-4">Terms</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSuppliers.map((sup) => (
                <tr
                  key={sup._id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {sup.companyName}
                    </span>
                    <span className="text-[10px] text-slate-400">{sup.city}</span>
                  </td>

                  <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                    {sup.name}
                  </td>

                  <td className="py-3 px-4 text-slate-500 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{sup.phone}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400" />
                      <span>{sup.email}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                    {sup.gstNumber}
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {sup.categoriesSupplied.map((cat, i) => (
                        <span
                          key={i}
                          className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      {sup.paymentTerms}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{sup.address || sup.city || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${sup.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {sup.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Vendor Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Material Supplier"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
          {!activeBranchId && (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">Select a branch before adding a supplier.</p>
          )}
          {saveError && (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{saveError}</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Mother Dairy Pvt Ltd"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Contact Person *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rajesh Mehra"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
              City
              <input
                type="text"
                maxLength={100}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
              Address
              <input
                type="text"
                maxLength={300}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98111 22233"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rajesh@vendor.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                GST Registration Number
              </label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                placeholder="07AAAAA0000A1Z5"
                className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="IMMEDIATE">Immediate Cash/UPI</option>
                <option value="NET_15">Net 15 Days</option>
                <option value="NET_30">Net 30 Days</option>
                <option value="NET_60">Net 60 Days</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Supplied Categories (comma separated)
            </label>
            <input
              type="text"
              value={categoriesInput}
              onChange={(e) => setCategoriesInput(e.target.value)}
              placeholder="DAIRY, MEAT, PRODUCE"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !canCreateSupplier}
              className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Vendor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SuppliersPage;
