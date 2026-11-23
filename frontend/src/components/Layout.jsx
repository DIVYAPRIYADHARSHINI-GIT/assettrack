import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  Package,
  Wrench,
  QrCode,
  ScanLine,
  FileSpreadsheet,
  FileText,
  Users,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  Boxes,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { onSlowRequest } from '../api/client';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/repairs', label: 'Repairs', icon: Wrench },
  { to: '/qr-labels', label: 'QR labels', icon: QrCode },
  { to: '/scan', label: 'Scan QR', icon: ScanLine },
  { to: '/import-export', label: 'Import / Export', icon: FileSpreadsheet },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/users', label: 'Users', icon: Users, admin: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Logo({ className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <Boxes className="size-4.5" />
      </div>
      <span className="text-lg font-semibold tracking-tight">AssetTrack</span>
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const { isAdmin } = useAuth();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4" aria-label="Main">
      {NAV.filter((n) => !n.admin || isAdmin).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`
          }
        >
          <Icon className="size-4.5 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium">{user.name}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{user.role === 'ADMIN' ? 'Admin' : 'Viewer'}</span>
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
          <button role="menuitem" className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => (setOpen(false), navigate('/settings'))}>
            <Settings className="size-4" /> Profile & password
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/login');
            }}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function SlowServerBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlowRequest(setSlow), []);
  if (!slow) return null;
  return (
    <div className="no-print fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900" role="status">
      Waking up the server, please wait…
    </div>
  );
}

export default function Layout() {
  const { user, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-800">
          <Logo />
        </div>
        <Sidebar />
        <RoleCard isAdmin={isAdmin} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
              <Logo />
              <button className="btn-ghost px-2" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <RoleCard isAdmin={isAdmin} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
          <button className="btn-ghost -ml-2 px-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Logo className="lg:hidden" />
          <div className="flex-1" />
          {!isAdmin && (
            <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline-flex dark:bg-amber-500/15 dark:text-amber-300">
              <Eye className="size-3.5" /> Read-only
            </span>
          )}
          <button className="btn-ghost px-2" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme">
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          {user && <UserMenu />}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <SlowServerBanner />
    </div>
  );
}

function RoleCard({ isAdmin }) {
  return (
    <div className="m-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
        {isAdmin ? <ShieldCheck className="size-4 text-brand-600" /> : <Eye className="size-4 text-amber-600" />}
        {isAdmin ? 'Admin access' : 'Viewer access'}
      </div>
      {isAdmin ? 'You can manage assets, users and imports.' : 'You can view assets, dashboard and reports. Changes are disabled.'}
    </div>
  );
}
