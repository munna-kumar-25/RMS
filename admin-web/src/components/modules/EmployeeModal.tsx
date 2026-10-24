import React, { useState, useEffect } from 'react';
import {
  Shield,
  Mail,
  Phone,
} from 'lucide-react';
import Modal from '../common/Modal.tsx';
import { useAppStore } from '../../store/AppStore.tsx';
import api from '../../services/api.js';
import { useAccess } from '../../context/AccessContext.jsx';
import {
  membershipsRequest,
  rolesRequest,
  updateMembershipRequest,
  updateRoleRequest,
} from '../../services/access.api.js';
import { Employee } from '../../types/index.ts';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeToEdit?: Employee | null;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  employeeToEdit,
}) => {
  const { branches, addEmployee, updateEmployee } = useAppStore();
  const access = useAccess();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [designations, setDesignations] = useState<Array<{ id: string; key: string; name: string; scopeType: string; permissions: string[] }>>([]);
  const [grantablePermissions, setGrantablePermissions] = useState<string[]>([]);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [isSavingRolePermissions, setSavingRolePermissions] = useState(false);
  const [rolePermissionError, setRolePermissionError] = useState('');
  const [rolePermissionNotice, setRolePermissionNotice] = useState('');
  const [designationLoadError, setDesignationLoadError] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ON_LEAVE'>('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (!access.can('roles.read')) {
      setDesignations([]);
      setDesignationLoadError('');
      return undefined;
    }
    let active = true;
    setDesignations([]);
    const loadDesignations = async () => {
      try {
        const firstPage = await rolesRequest({ page: 1, limit: 100 });
        const allRoles = [...(firstPage.roles || [])];
        for (let page = 2; page <= Number(firstPage.pagination?.pages || 1); page += 1) {
          const result = await rolesRequest({ page, limit: 100 });
          allRoles.push(...(result.roles || []));
        }
        if (active) {
          const branchRoles = allRoles.filter((item) => item.scopeType === 'branch');
          setDesignations(branchRoles);
          setGrantablePermissions(firstPage.availablePermissions?.branch || []);
          const currentRole = employeeToEdit?.roleId
            || branchRoles.find((item) => item.key === ({
              BRANCH_ADMIN: 'branch_manager',
              CASHIER: 'cashier',
              WAITER: 'waiter',
              KITCHEN_STAFF: 'kitchen_staff',
            })[employeeToEdit?.role])?.id
            || branchRoles.find((item) => item.key === 'cashier')?.id
            || '';
          setRole(currentRole);
          setRolePermissions(branchRoles.find((item) => item.id === currentRole)?.permissions || []);
          setDesignationLoadError('');
        }
      } catch (requestError) {
        if (active) {
          setDesignationLoadError(requestError instanceof Error ? requestError.message : 'Unable to load designations.');
        }
      }
    };
    loadDesignations();
    return () => {
      active = false;
    };
  }, [isOpen, access.activeCompany?.id, access.accessRevision, employeeToEdit]);

  // Initialize or reset form
  useEffect(() => {
    if (employeeToEdit) {
      setName(employeeToEdit.name);
      setEmail(employeeToEdit.email);
      setPhone(employeeToEdit.phone);
      setPassword('');
      setRole(employeeToEdit.roleId || '');
      setBranchId(employeeToEdit.branchId);
      setStatus(employeeToEdit.status);
    } else {
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('');
      setBranchId(branches[0]?._id || 'GLOBAL');
      setStatus('ACTIVE');
    }
    setError(null);
    setRolePermissionError('');
    setRolePermissionNotice('');
  }, [employeeToEdit, isOpen, branches]);

  const selectedDesignation = designations.find((item) => item.id === role);
  const canEditDesignationPermissions = access.can('roles.manage');
  const grantablePermissionSet = new Set(grantablePermissions);
  const designationPermissionOptions = [...new Set([...grantablePermissions, ...rolePermissions])].sort();
  const designationPermissionGroups = designationPermissionOptions.reduce<Record<string, string[]>>((groups, permission) => {
    const [module] = permission.split('.');
    groups[module] = [...(groups[module] || []), permission];
    return groups;
  }, {});
  const permissionActionLabel = (permission: string) => {
    const action = permission.split('.').slice(1).join('.');
    const labels: Record<string, string> = {
      read: 'View',
      'read.self': 'View Self',
      create: 'Create',
      update: 'Edit',
      manage: 'Manage',
      'clock.self': 'Clock Self',
      'correct': 'Correct',
      'approve': 'Approve',
      export: 'Export',
      adjust: 'Adjust',
      receive: 'Receive',
      transfer: 'Transfer',
      lifecycle: 'Lifecycle',
      cancel: 'Cancel',
      collect: 'Collect',
      refund: 'Refund',
      'session.manage': 'Session',
    };
    return labels[action] || action.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  };
  const designationModules = Object.keys(designationPermissionGroups).sort();
  const rolePermissionsChanged = Boolean(selectedDesignation)
    && [...rolePermissions].sort().join('|') !== [...selectedDesignation.permissions].sort().join('|');

  const toggleRolePermission = (permission: string) => {
    setRolePermissionNotice('');
    setRolePermissionError('');
    setRolePermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  };

  const saveRolePermissions = async () => {
    if (!selectedDesignation) return;
    if (rolePermissions.length === 0) {
      setRolePermissionError('A designation must keep at least one permission.');
      return;
    }
    setSavingRolePermissions(true);
    setRolePermissionError('');
    setRolePermissionNotice('');
    try {
      const updatedRole = await updateRoleRequest(selectedDesignation.id, { permissions: rolePermissions });
      setDesignations((current) => current.map((item) => item.id === updatedRole.id ? updatedRole : item));
      setRolePermissions(updatedRole.permissions);
      setRolePermissionNotice('Designation permissions saved. This change applies to everyone assigned to this designation.');
      await access.refresh();
    } catch (requestError) {
      setRolePermissionError(requestError instanceof Error ? requestError.message : 'Unable to save designation permissions.');
    } finally {
      setSavingRolePermissions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in all required fields (Name, Email, Phone).');
      return;
    }
    if (!employeeToEdit && password.length < 8) {
      setError('A password of at least 8 characters is required.');
      return;
    }

    const assignedBranch = branches.find((b) => b._id === branchId);
    if (!employeeToEdit && (branchId === 'GLOBAL' || !assignedBranch)) {
      setError('Select a branch before adding a staff member.');
      return;
    }
    if (!employeeToEdit && name.trim().split(/\s+/).length < 2) {
      setError('Enter the staff member’s first and last name.');
      return;
    }
    const branchName = branchId === 'GLOBAL' ? 'Headquarters (Global)' : assignedBranch?.name || 'Assigned Branch';
    if (!selectedDesignation && (!employeeToEdit || role !== employeeToEdit.roleId)) {
      setError('Select an available branch designation before saving.');
      return;
    }
    if (employeeToEdit && !employeeToEdit.revision) {
      setError('This staff record is missing its current revision. Reload the Staff page and try again.');
      return;
    }

    try {
      if (employeeToEdit) {
        const [firstName = '', ...lastNameParts] = name.trim().split(/\s+/);
        const response = await api.patch(`/staff/${employeeToEdit._id}`, {
          revision: employeeToEdit.revision,
          firstName,
          lastName: lastNameParts.join(' '),
          email,
          phone,
          employmentStatus: status === 'ACTIVE' ? 'active' : status === 'ON_LEAVE' ? 'on_leave' : 'inactive',
        });
        if (selectedDesignation && selectedDesignation.id !== employeeToEdit.roleId) {
          if (!employeeToEdit.membershipId) throw new Error('The staff member has no active access membership to update.');
          if (!access.can('memberships.manage')) throw new Error('You do not have permission to change this staff member’s designation.');
          let membershipData = await membershipsRequest({ page: 1, limit: 100 });
          let membership = (membershipData.memberships || []).find((item) => item.id === employeeToEdit.membershipId);
          for (let page = 2; !membership && page <= Number(membershipData.pagination?.pages || 1); page += 1) {
            membershipData = await membershipsRequest({ page, limit: 100 });
            membership = (membershipData.memberships || []).find((item) => item.id === employeeToEdit.membershipId);
          }
          if (!membership) throw new Error('The staff member’s login access could not be found. Reload the Staff page and try again.');
          const branchAssignments = (membership.branchAssignments || []).map((assignment) => ({
            branchId: assignment.branchId,
            roleIds: assignment.branchId === employeeToEdit.branchId
              ? [selectedDesignation.id]
              : assignment.roleIds,
          }));
          if (!branchAssignments.some((assignment) => assignment.branchId === employeeToEdit.branchId)) {
            branchAssignments.push({ branchId: employeeToEdit.branchId, roleIds: [selectedDesignation.id] });
          }
          await updateMembershipRequest(membership.id, {
            companyRoleIds: membership.companyRoleIds || [],
            branchAssignments,
          });
        }
        const saved = response.data?.data?.staff;
        if (!saved?.id) throw new Error('The server did not return the updated staff record.');
        updateEmployee(employeeToEdit._id, {
          name: [saved.firstName, saved.lastName].filter(Boolean).join(' '),
          email: saved.email || email,
          phone: saved.phone || phone,
          role: selectedDesignation?.name || employeeToEdit.role,
          roleId: selectedDesignation?.id || employeeToEdit.roleId,
          revision: saved.revision,
          status,
          branchName,
        });
        await access.refresh();
      } else {
        const response = await api.post('/staff/onboard', {
          name,
          email,
          phone,
          roleId: selectedDesignation.id,
          branchId,
          password,
          status,
        });
        const saved = response.data?.data?.staff;
        if (!saved?.id) throw new Error('The server did not return the created staff record.');
        addEmployee({
          _id: saved.id,
          employeeId: saved.employeeCode,
          name: saved.displayName,
          email: saved.email || '',
          phone: saved.phone || '',
          role: selectedDesignation.name,
          roleId: selectedDesignation.id,
          membershipId: response.data?.data?.membership?.id || '',
          revision: saved.revision,
          branchId,
          branchName,
          permissions: [],
          status,
          joiningDate: saved.joiningDate || '',
        });
      }
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save employee.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={employeeToEdit ? `Edit Staff: ${employeeToEdit.name}` : 'Add New Branch Staff'}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ramesh@rms.io"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Phone Number *
            </label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Role & Branch Assignment */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Designation / Role *
            </label>
            <select
              required
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value;
                setRole(nextRole);
                setRolePermissions(designations.find((item) => item.id === nextRole)?.permissions || []);
                setRolePermissionError('');
                setRolePermissionNotice('');
              }}
              disabled={!!employeeToEdit && !access.can('memberships.manage')}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select a designation</option>
              {employeeToEdit && role && !designations.some((designation) => designation.id === role) && (
                <option value={role}>{employeeToEdit.role}</option>
              )}
              {designations.map((designation) => (
                <option key={designation.id} value={designation.id}>{designation.name}</option>
              ))}
            </select>
            {designationLoadError && (
              <p role="alert" className="mt-1 text-[11px] text-rose-600">{designationLoadError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Assigned Branch *
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!!employeeToEdit}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {employeeToEdit && <option value="GLOBAL">Headquarters / All Branches (Global)</option>}
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Account Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE')}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive / Suspended</option>
              <option value="ON_LEAVE">On Leave</option>
            </select>
          </div>
        </div>

        {!employeeToEdit && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Initial Password *</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          </div>
        )}

        {employeeToEdit && (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">Designation permissions</h4>
            </div>
            <p className="text-xs text-slate-500">
              {canEditDesignationPermissions
                ? 'Choose a module to manage its access. Changes apply to everyone assigned to this designation.'
                : 'The selected designation controls this staff member’s access. You need role-management permission to edit it.'}
            </p>
            {selectedDesignation && (
              <>
                {designationPermissionOptions.length > 0 ? (
                  <div className="space-y-2">
                    {designationModules.map((module) => {
                      const permissions = designationPermissionGroups[module];
                      const enabledCount = permissions.filter((permission) => rolePermissions.includes(permission)).length;
                      return (
                        <details key={module} className="group rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold capitalize text-slate-800 marker:hidden dark:text-slate-200">
                            <span>{module.replace(/_/g, ' ')}</span>
                            <span className="text-xs font-normal text-slate-500">{enabledCount} of {permissions.length} enabled</span>
                          </summary>
                          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-3 dark:border-slate-800">
                            {permissions.map((permission) => {
                              const checked = rolePermissions.includes(permission);
                              const unavailableToGrant = !grantablePermissionSet.has(permission) && !checked;
                              return (
                                <label key={permission} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-700 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    aria-label={`${module} ${permissionActionLabel(permission)}`}
                                    checked={checked}
                                    disabled={!canEditDesignationPermissions || unavailableToGrant || isSavingRolePermissions}
                                    onChange={() => toggleRolePermission(permission)}
                                    title={unavailableToGrant ? 'You cannot grant this permission' : undefined}
                                    className="h-4 w-4 accent-indigo-600"
                                  />
                                  {permissionActionLabel(permission)}
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No module permissions are available for this designation.</p>
                )}
                {rolePermissionError && <p role="alert" className="text-xs text-rose-600">{rolePermissionError}</p>}
                {rolePermissionNotice && <p role="status" className="text-xs text-emerald-600">{rolePermissionNotice}</p>}
                {canEditDesignationPermissions && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={saveRolePermissions}
                      disabled={!rolePermissionsChanged || isSavingRolePermissions}
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingRolePermissions ? 'Saving permissions…' : 'Save module permissions'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!role || Boolean(designationLoadError)}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-600/20 transition-colors"
          >
            {employeeToEdit ? 'Save Changes' : 'Provision Staff Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EmployeeModal;
