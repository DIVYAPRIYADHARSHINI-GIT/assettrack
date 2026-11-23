import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Users as UsersIcon, Search } from 'lucide-react';
import { api } from '../api/client';
import { useApi, useDebounced } from '../lib/useApi';
import { useAuth } from '../context/AuthContext';
import { dateTime } from '../lib/format';
import { ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, TableSkeleton } from '../components/ui';

function UserDialog({ open, user, onClose, onDone }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ name: user?.name || '', email: user?.email || '', role: user?.role || 'VIEWER', password: '' });
      setErrors({});
    }
  }, [open, user]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const fe = {};
    if (!form.name.trim()) fe.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) fe.email = 'Enter a valid email';
    if (!editing || form.password) {
      if (form.password.length < 8) fe.password = 'At least 8 characters';
      else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) fe.password = 'Must contain a letter and a number';
    }
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const body = { name: form.name, email: form.email, role: form.role };
      if (form.password) body.password = form.password;
      await api(editing ? `/users/${user.id}` : '/users', { method: editing ? 'PATCH' : 'POST', body });
      toast.success(editing ? 'User updated' : `User ${form.email} created`);
      onDone();
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  const cls = (k) => `input ${errors[k] ? 'input-error' : ''}`;
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={editing ? `Edit ${user.name}` : 'Add user'}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" form="user-form" disabled={busy}>{busy && <Spinner />} {editing ? 'Save' : 'Create user'}</button></>}
    >
      <form id="user-form" className="grid gap-4" onSubmit={submit} noValidate>
        <Field label="Full name" required error={errors.name}><input className={cls('name')} value={form.name || ''} onChange={set('name')} /></Field>
        <Field label="Email" required error={errors.email}><input type="email" className={cls('email')} value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Role" required>
          <select className="input" value={form.role || 'VIEWER'} onChange={set('role')}>
            <option value="VIEWER">Viewer: read-only</option>
            <option value="ADMIN">Admin: full access</option>
          </select>
        </Field>
        <Field label={editing ? 'New password (optional)' : 'Temporary password'} required={!editing} error={errors.password} hint="8+ characters with a letter and a number">
          <input type="password" autoComplete="new-password" className={cls('password')} value={form.password || ''} onChange={set('password')} />
        </Field>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const { data, loading, error, reload } = useApi('/users', { search });
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function setActive(u, isActive) {
    setBusy(true);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { isActive } });
      toast.success(`${u.name} ${isActive ? 'reactivated' : 'deactivated'}`);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  async function setRole(u, role) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { role } });
      toast.success(`${u.name} is now ${role === 'ADMIN' ? 'an Admin' : 'a Viewer'}`);
    } catch (e) {
      toast.error(e.message);
    }
    reload();
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage who can access AssetTrack" actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus className="size-4" /> Add user</button>} />
      <div className="card">
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search name or email" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search users" />
          </div>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={5} rows={4} /> : data.length === 0 ? <EmptyState icon={UsersIcon} title="No users found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60">
                <tr><th className="th">User</th><th className="th">Role</th><th className="th">Status</th><th className="th">Last sign-in</th><th className="th text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                      <td className="td"><p className="font-medium">{u.name} {self && <span className="text-xs text-slate-400">(you)</span>}</p><p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p></td>
                      <td className="td">
                        <select className="input w-auto py-1 text-sm" value={u.role} disabled={self || !u.isActive} onChange={(e) => setRole(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                          <option value="ADMIN">Admin</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      </td>
                      <td className="td">{u.isActive ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Active</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">Deactivated</span>}</td>
                      <td className="td text-sm text-slate-600 dark:text-slate-300">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</td>
                      <td className="td text-right">
                        <div className="inline-flex gap-1">
                          <button className="btn-ghost px-2" onClick={() => setEdit(u)} aria-label={`Edit ${u.name}`}><Pencil className="size-4" /></button>
                          {!self && (u.isActive ? (
                            <button className="btn-ghost px-2 text-red-600 dark:text-red-400" onClick={() => setConfirm(u)} aria-label={`Deactivate ${u.name}`}><UserX className="size-4" /></button>
                          ) : (
                            <button className="btn-ghost px-2 text-emerald-600" onClick={() => setActive(u, true)} aria-label={`Reactivate ${u.name}`}><UserCheck className="size-4" /></button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <UserDialog open={Boolean(edit)} user={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />
      <ConfirmDialog open={Boolean(confirm)} title={`Deactivate ${confirm?.name}?`} message="They will be signed out immediately and cannot sign in until reactivated. Their history is kept." confirmLabel="Deactivate" danger busy={busy} onClose={() => setConfirm(null)} onConfirm={() => setActive(confirm, false)} />
    </div>
  );
}
