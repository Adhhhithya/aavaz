import React from 'react';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';

const badge = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase',
  {
    variants: {
      risk: {
        critical: 'bg-accent-sosBg text-accent-sos',
        high:     'bg-orange-100 text-orange-700',
        medium:   'bg-amber-100 text-amber-700',
        low:      'bg-green-100 text-green-700',
        unknown:  'bg-canvas-surfaceSubtle text-text-muted',
      },
    },
    defaultVariants: { risk: 'unknown' },
  }
);

const DOT_COLORS = {
  critical: 'bg-accent-sos',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-green-500',
  unknown:  'bg-text-muted',
};

/**
 * RiskBadge
 * @param {'critical'|'high'|'medium'|'low'|'unknown'} risk
 * @param {string} [className]
 * @param {boolean} [showDot=true]
 */
export default function RiskBadge({ risk = 'unknown', className, showDot = true }) {
  return (
    <span className={clsx(badge({ risk }), className)}>
      {showDot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', DOT_COLORS[risk] ?? DOT_COLORS.unknown)} />
      )}
      {risk}
    </span>
  );
}
