import React, { useEffect, useState } from 'react';
import { Settings2, Shield, UserRoundPlus } from 'lucide-react';
import { useAccess } from '../../context/AccessContext.jsx';
import Modal from '../../components/common/Modal.tsx';
import {
  createMembershipRequest,
  createRoleRequest,
  membershipsRequest,
  rolesRequest,
  updateMembershipRequest,
  updateRoleRequest,
} from '../../services/access.api.js';

const messageFrom = (error) => error?.response?.data?.message
  || error?.response?.data?.error?.message
  || error?.message
  || 'The request failed.';

export const AccessAdminPanel = ({ tab, creationMode = 'inline', openCreateRequestKey = '' }) => {
  const access = useAccess();
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState({ company: [], branch: [] });
  const [memberships, setMemberships] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isRoleFormOpen, setRoleFormOpen] = useState(
    () => creationMode === 'dialog' && Boolean(openCreateRequestKey)
  );
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ key: '', name: '', description: '', scopeType: 'branch', permissions: [] });
  const [memberForm, setMemberForm] = useState({ userId: '', roleId: '', branchId: '' });

  const load = async () => {
    setError('');
    try {
      if (access.can('roles.read')) {
        const roleData = await rolesRequest();
        setRoles(roleData.roles || []);
        setAvailablePermissions(roleData.availablePermissions || { company: [], branch: [] });
      }
      if (access.can('memberships.read')) {
        const membershipData = await membershipsRequest();
        setMemberships(membershipData.memberships || []);
      }
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  };

  useEffect(() => {
    load();
  }, [tab, access.accessRevision]);

  useEffect(() => {
    if (creationMode === 'dialog' && openCreateRequestKey) {
      setEditingRole(null);
      setRoleForm({ key: '', name: '', description: '', scopeType: 'branch', permissions: [] });
      setError('');
      setRoleFormOpen(true);
    }
  }, [creationMode, openCreateRequestKey]);

  const submitRole = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    if (roleForm.permissions.length === 0) {
      setError('Select at least one permission for this designation.');
      return;
    }
    try {
      if (editingRole) {
        await updateRoleRequest(editingRole.id, {
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
          permissions: roleForm.permissions,
        });
        setNotice('Designation updated. Changes apply to staff assigned to it.');
      } else {
        const key = roleForm.key.trim() || roleForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        await createRoleRequest({
          key,
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
          scopeType: roleForm.scopeType,
          permissions: roleForm.permissions,
        });
        setNotice('Designation created. It is now available in the staff form.');
      }
      setRoleFormOpen(false);
      setEditingRole(null);
      setRoleForm({ key: '', name: '', description: '', scopeType: 'branch', permissions: [] });
      await access.refresh();
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  };

  const openNewRoleForm = () => {
    setEditingRole(null);
    setRoleForm({ key: '', name: '', description: '', scopeType: 'branch', permissions: [] });
    setError('');
    setRoleFormOpen(true);
  };

  const openEditRoleForm = (role) => {
    setEditingRole(role);
    setRoleForm({
      key: role.key,
      name: role.name,
      description: role.description || '',
      scopeType: role.scopeType,
      permissions: [...(role.permissions || [])],
    });
    setError('');
    setRoleFormOpen(true);
  };

  const submitMembership = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    try {
      const role = roles.find((item) => item.id === memberForm.roleId);
      const payload = { userId: memberForm.userId.trim(), companyRoleIds: [], branchAssignments: [] };
      if (role?.scopeType === 'company') payload.companyRoleIds = [role.id];
      if (role?.scopeType === 'branch') {
        payload.branchAssignments = [{ branchId: memberForm.branchId, roleIds: [role.id] }];
      }
      await createMembershipRequest(payload);
      setNotice('Access assignment created.');
      await access.refresh();
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  };

  const disableMembership = async (membership) => {
    setNotice('');
    setError('');
    try {
      await updateMembershipRequest(membership.id, { status: 'disabled' });
      setNotice('Membership disabled.');
      await access.refresh();
      await load();
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  };

  if (tab === 'roles' && !access.can('roles.read')) {
    return <p data-access-state="denied" className="text-sm text-slate-500">You do not have permission to view roles.</p>;
  }
  if (tab === 'access' && !access.can('memberships.read')) {
    return <p data-access-state="denied" className="text-sm text-slate-500">You do not have permission to view access assignments.</p>;
  }

  const permissionOptions = [...new Set([
    ...(availablePermissions[roleForm.scopeType] || []),
    ...(editingRole?.permissions || []),
  ])].sort();
  const permissionGroups = permissionOptions.reduce((groups, permission) => {
    const [module, ...actionParts] = permission.split('.');
    const action = actionParts.join('.');
    const labels = {
      read: 'View',
      'read.self': 'View own',
      create: 'Create',
      update: 'Edit',
      manage: 'Manage',
      'manage.self': 'Manage own',
      'clock.self': 'Clock in/out',
      'session.manage': 'Manage sessions',
      private: 'Private data',
    };
    const actionLabel = labels[action] || action.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    groups[module] = [...(groups[module] || []), { permission, actionLabel }];
    return groups;
  }, {});
  const roleFormContent = (
    <form onSubmit={submitRole} className={`space-y-5 ${creationMode === 'dialog' ? '' : 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          Designation name
          <input required maxLength={80} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-indigo-950" placeholder="e.g. Senior Waiter" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} />
        </label>
        {creationMode === 'inline' && (
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Scope
            <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" value={roleForm.scopeType} onChange={(event) => setRoleForm({ ...roleForm, scopeType: event.target.value, permissions: [] })}>
              <option value="branch">Branch</option>
              <option value="company">Company</option>
            </select>
          </label>
        )}
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
          Short description <span className="font-normal text-slate-400">(optional)</span>
          <input maxLength={400} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-indigo-950" placeholder="What will this staff member be responsible for?" value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Choose access</h3>
            <p className="mt-1 text-xs text-slate-500">Open a module and select what this designation can do.</p>
          </div>
          <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{roleForm.permissions.length} selected</span>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {Object.entries(permissionGroups).map(([module, options]) => {
            const selectedCount = options.filter(({ permission }) => roleForm.permissions.includes(permission)).length;
            return (
              <details key={module} className="group rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold capitalize text-slate-800 marker:hidden dark:text-slate-200">
                  <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-indigo-500" />{module.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-normal text-slate-500">{selectedCount}/{options.length} selected</span>
                </summary>
                <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 dark:border-slate-800">
                  {options.map(({ permission, actionLabel }) => {
                    const checked = roleForm.permissions.includes(permission);
                    const canGrant = (availablePermissions[roleForm.scopeType] || []).includes(permission);
                    return (
                      <label key={permission} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${canGrant || checked ? 'text-slate-700 dark:text-slate-300' : 'cursor-not-allowed text-slate-400'}`} title={!canGrant && !checked ? 'You cannot grant this permission' : undefined}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canGrant && !checked}
                          onChange={(event) => setRoleForm({
                            ...roleForm,
                            permissions: event.target.checked
                              ? [...roleForm.permissions, permission]
                              : roleForm.permissions.filter((selected) => selected !== permission),
                          })}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        {actionLabel}
                      </label>
                    );
                  })}
                </div>
              </details>
            );
          })}
          {permissionOptions.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800">No access options are available for this designation.</p>}
        </div>
      </section>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        {creationMode === 'dialog' && <button type="button" onClick={() => setRoleFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>}
        <button type="submit" disabled={!permissionOptions.length || !roleForm.name.trim()} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{editingRole ? 'Save designation' : 'Create designation'}</button>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {tab === 'roles' && (
        <>
          {creationMode === 'dialog' && access.can('roles.manage') && (
            <div className="flex justify-end">
              <button type="button" onClick={openNewRoleForm} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700">
                <UserRoundPlus className="h-4 w-4" />
                Add Designation
              </button>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{role.name}</span>
                  {creationMode === 'dialog' && access.can('roles.manage') && !role.isSystem && (
                    <button type="button" onClick={() => openEditRoleForm(role)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-300">
                      <Settings2 className="h-3.5 w-3.5" />
                      Manage
                    </button>
                  )}
                </div>
              ))}
              {roles.length === 0 && <p className="p-4 text-xs text-slate-500">No designations yet. Add a designation to make it available when creating staff.</p>}
            </div>
          </div>
          {access.can('roles.manage') && (
            creationMode === 'dialog'
              ? (
                <Modal
                  isOpen={isRoleFormOpen}
                  onClose={() => { setRoleFormOpen(false); setEditingRole(null); }}
                  title={editingRole ? `Manage ${editingRole.name}` : 'New Designation'}
                  subtitle={editingRole ? 'Update access for staff assigned to this designation.' : 'Create a designation and choose what its staff can access.'}
                  maxWidth="2xl"
                >
                  {roleFormContent}
                </Modal>
              )
              : roleFormContent
          )}
        </>
      )}
      {tab === 'access' && (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="p-3">Person</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Branches</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => (
                  <tr key={membership.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3">
                      <span className="block font-semibold text-slate-800 dark:text-slate-100">{membership.user?.name}</span>
                      <span className="text-slate-400">{membership.user?.email}</span>
                    </td>
                    <td className="p-3">{membership.status}</td>
                    <td className="p-3">{membership.branchAssignments.length}</td>
                    <td className="p-3 text-right">
                      {access.can('memberships.manage') && membership.status === 'active' && (
                        <button type="button" className="text-rose-600 font-semibold" onClick={() => disableMembership(membership)}>Disable</button>
                      )}
                    </td>
                  </tr>
                ))}
                {memberships.length === 0 && (
                  <tr><td className="p-3 text-slate-500" colSpan={4}>No access assignments returned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {access.can('memberships.manage') && (
            <form onSubmit={submitMembership} className="grid sm:grid-cols-2 gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <input className="px-3 py-2 rounded-xl border text-xs" placeholder="Existing user id" value={memberForm.userId} onChange={(event) => setMemberForm({ ...memberForm, userId: event.target.value })} />
              <select className="px-3 py-2 rounded-xl border text-xs" value={memberForm.roleId} onChange={(event) => setMemberForm({ ...memberForm, roleId: event.target.value })}>
                <option value="">Role</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <select className="px-3 py-2 rounded-xl border text-xs" value={memberForm.branchId} onChange={(event) => setMemberForm({ ...memberForm, branchId: event.target.value })}>
                <option value="">Branch, for a branch role</option>
                {access.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <button type="submit" className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">Assign access</button>
            </form>
          )}
        </>
      )}
    </div>
  );
};

export default AccessAdminPanel;
