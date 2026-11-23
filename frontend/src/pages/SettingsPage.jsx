import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Moon, Sun, User } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Field, PageHeader, Spinner } from '../components/ui';
import { dateTime } from '../lib/format';

export default function SettingsPage() {
  const { user, setSession } = useAuth();
  const { theme, toggle } = useTheme();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const fe = {};
    if (!form.currentPassword) fe.currentPassword = 'Current password is required';
    if (form.newPassword.length < 8) fe.newPassword = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) fe.newPassword = 'Must contain a letter and a number';
    if (form.confirm !== form.newPassword) fe.confirm = 'Passwords do not match';
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setSession(r.token, r.user);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password updated. Other sessions were signed out.');
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile, password and appearance" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><User className="size-4" /> Profile</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500 dark:text-slate-400">Name</dt><dd className="font-medium">{user.name}</dd></div>
            <div><dt className="text-slate-500 dark:text-slate-400">Email</dt><dd className="font-medium break-all">{user.email}</dd></div>
            <div><dt className="text-slate-500 dark:text-slate-400">Role</dt><dd className="font-medium">{user.role === 'ADMIN' ? 'Admin (full access)' : 'Viewer (read-only)'}</dd></div>
            <div><dt className="text-slate-500 dark:text-slate-400">Last sign-in</dt><dd className="font-medium">{dateTime(user.lastLoginAt)}</dd></div>
          </dl>
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-2 text-sm font-medium">Appearance</p>
            <button className="btn-secondary" onClick={toggle}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>
          </div>
        </div>

        <form className="card p-5 lg:col-span-2" onSubmit={submit} noValidate>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> Change password</h2>
          <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">At least 8 characters with a letter and a number. Other devices will be signed out.</p>
          <div className="grid max-w-md gap-4">
            <Field label="Current password" error={errors.currentPassword} required>
              <input type="password" autoComplete="current-password" className={`input ${errors.currentPassword ? 'input-error' : ''}`} value={form.currentPassword} onChange={set('currentPassword')} />
            </Field>
            <Field label="New password" error={errors.newPassword} required>
              <input type="password" autoComplete="new-password" className={`input ${errors.newPassword ? 'input-error' : ''}`} value={form.newPassword} onChange={set('newPassword')} />
            </Field>
            <Field label="Confirm new password" error={errors.confirm} required>
              <input type="password" autoComplete="new-password" className={`input ${errors.confirm ? 'input-error' : ''}`} value={form.confirm} onChange={set('confirm')} />
            </Field>
            <div>
              <button className="btn-primary" disabled={busy}>{busy && <Spinner />} Update password</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
