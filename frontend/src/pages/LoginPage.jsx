import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Eye, EyeOff, Moon, Sun, Package, QrCode, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Logo } from '../components/Layout';
import { Spinner } from '../components/ui';
import { API_URL } from '../api/client';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [waking, setWaking] = useState(false);
  const [serverReady, setServerReady] = useState(null);

  // Ping /api/health as soon as the page opens so a sleeping Render dyno starts waking.
  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setWaking(true), 2500);
    fetch(`${API_URL}/api/health`)
      .then((r) => setServerReady(r.ok))
      .catch(() => setServerReady(false))
      .finally(() => {
        done = true;
        clearTimeout(slow);
        setWaking(false);
      });
    return () => clearTimeout(slow);
  }, []);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  async function submit(e) {
    e.preventDefault();
    const fe = {};
    if (!email.trim()) fe.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = 'Enter a valid email address';
    if (!password) fe.password = 'Password is required';
    setErrors(fe);
    setError('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    const slow = setTimeout(() => setWaking(true), 3000);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(slow);
      setWaking(false);
      setBusy(false);
    }
  }

  const fill = (e, p) => {
    setEmail(e);
    setPassword(p);
    setErrors({});
    setError('');
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-indigo-900/50 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <div className="grid size-9 place-items-center rounded-lg bg-white/15">
            <Package className="size-5" />
          </div>
          AssetTrack
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold">Every laptop, monitor and chair, accounted for.</h2>
          <p className="mt-3 text-brand-100">Track who has what, when warranties expire and what repairs cost, from one place.</p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            <li className="flex items-center gap-3"><Package className="size-4" /> Assign, return and retire with full history</li>
            <li className="flex items-center gap-3"><QrCode className="size-4" /> Print QR labels and scan to open an asset</li>
            <li className="flex items-center gap-3"><BarChart3 className="size-4" /> Live dashboard and printable reports</li>
          </ul>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <button className="btn-ghost absolute top-4 right-4 px-2" onClick={toggle} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Office asset and inventory tracker</p>

          {waking && (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" role="status">
              <Spinner className="mt-0.5 size-4 shrink-0" />
              <span>
                <b>Waking up the server, please wait…</b>
                <br />
                The free hosting plan sleeps when idle. The first request can take up to a minute.
              </span>
            </div>
          )}
          {serverReady === false && !waking && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" role="alert">
              The server is not responding yet. Wait a moment and try signing in.
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="username" className={`input ${errors.email ? 'input-error' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className={`input pr-10 ${errors.password ? 'input-error' : ''}`} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password}</p>}
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Spinner />} {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 rounded-lg border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700">
            <p className="mb-2 font-medium text-slate-700 dark:text-slate-300">Demo accounts</p>
            <div className="grid gap-2">
              <button type="button" className="btn-secondary justify-between" onClick={() => fill('admin@assettrack.com', 'Admin@123')}>
                <span>Admin</span>
                <span className="text-xs text-slate-500">admin@assettrack.com</span>
              </button>
              <button type="button" className="btn-secondary justify-between" onClick={() => fill('viewer@assettrack.com', 'Viewer@123')}>
                <span>Viewer (read-only)</span>
                <span className="text-xs text-slate-500">viewer@assettrack.com</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
