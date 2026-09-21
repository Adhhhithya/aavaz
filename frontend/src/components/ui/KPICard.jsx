import NumberFlow from 'number-flow';
import { clsx } from 'clsx';

/**
 * KPICard — stat card with animated number counter, colored icon, and label.
 *
 * @param {string} label        - Short uppercase label e.g. "Active SOS"
 * @param {number} value        - The metric value (NumberFlow animates it)
 * @param {React.ReactNode} icon - Lucide icon component instance
 * @param {'default'|'danger'|'warning'|'success'} variant
 * @param {string} [className]
 */
export default function KPICard({ label, value, icon, variant = 'default', className }) {
  const iconStyles = {
    default: 'bg-primary-muted text-primary-main',
    danger:  'bg-accent-sosBg text-accent-sos',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-green-100 text-green-700',
  };

  return (
    <div className={clsx(
      'bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-card flex items-center gap-4',
      'animate-[card-in_240ms_var(--ease-out-quint)_both]',
      className
    )}>
      <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center shrink-0', iconStyles[variant])}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-2xl font-black text-text-primary">
          <NumberFlow value={value ?? 0} />
        </p>
      </div>
    </div>
  );
}
