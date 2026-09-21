import { ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';

const LEVEL_LABELS = {
  district:   'District Admin Portal',
  state:      'State Official Portal',
  national:   'National Admin Portal',
  superadmin: 'Super Admin — RESTRICTED',
};

const LEVEL_COLORS = {
  district:   'text-primary-main',
  state:      'text-accent-amber',
  national:   'text-accent-sage',
  superadmin: 'text-accent-sos',
};

/**
 * AdminLayout — shared sticky frosted-glass header + content wrapper
 * for District, State, National, and SuperAdmin dashboards.
 *
 * @param {'district'|'state'|'national'|'superadmin'} level
 * @param {React.ReactNode} children
 */
export default function AdminLayout({ level = 'district', children }) {
  const { user, logout } = useAuth();
  const label = LEVEL_LABELS[level] ?? 'Admin Portal';
  const iconColor = LEVEL_COLORS[level] ?? 'text-primary-main';

  return (
    <div className="min-h-screen bg-canvas-base flex flex-col">
      {/* Sticky frosted glass header */}
      <header
        className={clsx(
          'sticky top-0 z-20 px-6 py-4 flex justify-between items-center',
          'bg-canvas-surface/80 backdrop-blur-[12px] border-b border-canvas-border',
          'transition-shadow duration-[var(--duration-fast)]'
        )}
      >
        <div className="flex items-center gap-2.5">
          <ShieldCheck className={clsx('shrink-0', iconColor)} size={22} />
          <span className="font-bold text-base text-text-primary">{label}</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted hidden md:block">{user?.name}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm font-bold text-text-secondary hover:text-accent-sos transition-colors duration-[var(--duration-fast)] active:scale-95"
            style={{ transition: `color var(--duration-fast) var(--ease-out-quint), transform var(--duration-instant) var(--ease-out-quint)` }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8">
        {children}
      </main>
    </div>
  );
}
