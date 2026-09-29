import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badge = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase',
  {
    variants: {
      risk: {
        critical: 'bg-critical-muted text-critical-base',
        high:     'bg-danger-muted text-danger-hover',
        medium:   'bg-warning-muted text-warning-hover',
        low:      'bg-success-muted text-success-hover',
        unknown:  'bg-secondary-muted text-text-muted',
      },
    },
    defaultVariants: { risk: 'unknown' },
  }
);

const DOT_COLORS = {
  critical: 'bg-critical-base animate-[pulse-critical_2s_infinite]',
  high:     'bg-danger-base',
  medium:   'bg-warning-base',
  low:      'bg-success-base',
  unknown:  'bg-secondary-base',
};

/**
 * RiskBadge
 * @param {'critical'|'high'|'medium'|'low'|'unknown'} risk
 * @param {string} [className]
 * @param {boolean} [showDot=true]
 */
export default function RiskBadge({ risk = 'unknown', className, showDot = true }) {
  return (
    <span className={cn(badge({ risk }), className)}>
      {showDot && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_COLORS[risk] ?? DOT_COLORS.unknown)} />
      )}
      {risk}
    </span>
  );
}
