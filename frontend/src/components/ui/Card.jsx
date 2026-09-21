import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';

const cardVariants = cva(
  'rounded-2xl border transition-shadow',
  {
    variants: {
      variant: {
        default:  'bg-canvas-surface border-canvas-border shadow-card',
        elevated: 'bg-canvas-surface border-canvas-border shadow-hover',
        subtle:   'bg-canvas-surfaceSubtle border-canvas-border',
        sos:      'bg-accent-sosBg border-accent-sosLight/30',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
      hover: {
        true:  'hover:shadow-hover hover:-translate-y-0.5 cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      hover: false,
    },
  }
);

/**
 * Card — base surface component with cva variants.
 */
export default function Card({ variant, padding, hover, className, children, ...props }) {
  return (
    <div className={clsx(cardVariants({ variant, padding, hover }), className)} {...props}>
      {children}
    </div>
  );
}
