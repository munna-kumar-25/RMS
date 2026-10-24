import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Shield,
  Edit2,
  Trash2,
  Building2,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { useAccess } from '../../context/AccessContext.jsx';
import { Employee, Role } from '../../types/index.ts';
import ConfirmDialog from '../../components/common/ConfirmDialog.tsx';

interface EmployeesPageProps {
  onOpenEmployeeModal: (employee?: Employee | null) => void;
}

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  onOpenEmployeeModal,
}) => {
  const {
    employees,
    branches,
    activeBranchId,
    deleteEmployee,
    updateEmployee,
  } = useAppStore();

  const access = useAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Filter staff by activeBranchId, search, and role
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchBranch =
        !activeBranchId || emp.branchId === 'GLOBAL' || emp.branchId === activeBranchId;

      const matchSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.phone.includes(searchQuery) ||
        emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRole = selectedRole === 'ALL' || emp.role === selectedRole;

      return matchBranch && matchSearch && matchRole;
    });
  }, [employees, activeBranchId, searchQuery, selectedRole]);

  // Role counters
  const totalEmployees = filteredEmployees.length;
  const activeCount = filteredEmployees.filter((e) => e.status === 'ACTIVE').length;
  const branchAdmins = filteredEmployees.filter((e) => e.role === 'BRANCH_ADMIN').length;
  const cashiers = filteredEmployees.filter((e) => e.role === 'CASHIER').length;
  const kitchenStaff = filteredEmployees.filter((e) => e.role === 'KITCHEN_STAFF').length;

  const handleDeleteConfirm = () => {
    if (employeeToDelete) {
      deleteEmployee(employeeToDelete._id);
      setEmployeeToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-600" />
            <span>Staff & Granular Role Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage corporate staff members, role designations, and individual granular RBAC permission matrix.
          </p>
        </div>

        {access.can('staff.manage') && (
        <button
          type="button"
          onClick={() => onOpenEmployeeModal(null)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
        )}
      </div>

      {access.can('staff.read') && (
      <>

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Staff In Scope
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalEmployees}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Active On-Duty
          </span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {activeCount}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Branch Managers
          </span>
          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            {branchAdmins}
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Kitchen & Counter
          </span>
          <span className="text-xl font-black text-amber-500 mt-1 block">
            {kitchenStaff + cashiers}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, phone, or staff ID..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Designations</option>
            <option value="SUPER_ADMIN">Super Admins</option>
            <option value="BRANCH_ADMIN">Branch Admins</option>
            <option value="CASHIER">Cashiers</option>
            <option value="WAITER">Waiters</option>
            <option value="KITCHEN_STAFF">Kitchen Staff</option>
            <option value="ACCOUNTANT">Accountants</option>
          </select>
        </div>
      </div>

      {/* Staff Catalog Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Designation</th>
                <th className="py-3 px-4">Branch Location</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Permissions</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEmployees.map((emp) => (
                <tr key={emp._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {emp.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {emp.employeeId}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                        emp.role === 'SUPER_ADMIN'
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                          : emp.role === 'BRANCH_ADMIN'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                          : emp.role === 'ACCOUNTANT'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : emp.role === 'KITCHEN_STAFF'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {emp.role}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                    {emp.branchName}
                  </td>

                  <td className="py-3 px-4 text-slate-500 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400" />
                      <span>{emp.email}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{emp.phone}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {emp.permissionModules?.length || 0} {emp.permissionModules?.length === 1 ? 'Module' : 'Modules'}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        emp.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : emp.status === 'ON_LEAVE'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                      }`}
                    >
                      {emp.status}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenEmployeeModal(emp)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                        title="Edit Staff & Permissions"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmployeeToDelete(emp)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Remove Staff"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Revoke Staff Account"
        message={`Are you sure you want to remove ${employeeToDelete?.name} (${employeeToDelete?.employeeId})? This action immediately terminates system access.`}
        confirmText="Yes, Revoke Access"
        variant="danger"
      />
      </>
      )}
    </div>
  );
};

export default EmployeesPage;
