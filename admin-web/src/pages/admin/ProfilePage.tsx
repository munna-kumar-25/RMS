import React, { useState } from 'react';
import { CheckCircle2, Key, Laptop, Lock, Shield, Smartphone, User } from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { changePasswordRequest, logoutAllSessionsRequest } from '../../services/auth.api.js';

export const ProfilePage: React.FC = () => {
  const { currentUser } = useAppStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setIsSaving(true);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      setMessage('Password changed. Sign in again with your new password.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not change your password.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('This will sign you out of this device and revoke all other sessions. Continue?')) return;
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      await logoutAllSessionsRequest();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not revoke sessions.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-xl font-black text-slate-900 dark:text-white md:text-2xl">
          <User className="h-6 w-6 text-indigo-600" />
          Administrator Profile &amp; Security
        </h1>
        <p className="mt-1 text-xs text-slate-500">Review your account identity and manage authentication security.</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      {message && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      )}

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Shield className="h-4 w-4 text-indigo-600" />
          Account information
        </h2>
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-slate-500">Name</dt>
            <dd className="mt-1 text-slate-900 dark:text-white">{currentUser.name || 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Email</dt>
            <dd className="mt-1 text-slate-900 dark:text-white">{currentUser.email || 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Role</dt>
            <dd className="mt-1 text-slate-900 dark:text-white">{currentUser.role || 'Not provided'}</dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500">Account identity and contact details are managed by your organization administrator.</p>
      </section>

      <form onSubmit={handlePasswordChange} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Lock className="h-4 w-4 text-indigo-600" />
          Change password
        </h2>
        <div className="max-w-md space-y-3">
          <label className="block space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Current password
            <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            New password
            <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Confirm new password
            <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={isSaving} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            <Key className="h-3.5 w-3.5" />
            Change password
          </button>
        </div>
      </form>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Smartphone className="h-4 w-4 text-indigo-600" />
          Sessions
        </h2>
        <div className="flex items-start gap-3">
          <Laptop className="mt-0.5 h-5 w-5 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Revoke all active sessions</p>
            <p className="mt-1 text-xs text-slate-500">This signs you out here and invalidates all sessions for this account.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={handleLogoutAll} disabled={isSaving} className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30">
            Revoke all sessions
          </button>
        </div>
      </section>
    </div>
  );
};

export default ProfilePage;
