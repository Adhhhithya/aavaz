import NumberFlow from 'number-flow';
import { cn } from '../../lib/utils';
import { Card, CardContent } from './Card';

/**
 * KPICard — stat card with animated number counter, colored icon, and label.
 * Interactive if onClick is provided.
 */
export default function KPICard({ label, value, icon, variant = 'default', className, onClick }) {
  const iconStyles = {
    default: 'bg-primary-muted text-primary-base',
    danger:  'bg-critical-muted text-critical-base',
    warning: 'bg-warning-muted text-warning-hover',
    success: 'bg-success-muted text-success-hover',
  };

  return (
    <Card 
      className={cn(
        'overflow-hidden transition-all duration-200',
        onClick ? 'cursor-pointer hover:shadow-md hover:border-primary-base/30' : '',
        variant === 'danger' && onClick ? 'hover:border-critical-base/50' : '',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-6 flex items-center gap-4">
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0', iconStyles[variant])}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-text-main">
            <NumberFlow value={value ?? 0} />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
