import { cn } from "../../lib/utils";

/**
 * PageHeader — consistent h1 + subtitle + optional right-slot.
 * Used in counsellor and victim pages.
 */
export default function PageHeader({ title, subtitle, right, className = '' }) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-end justify-between gap-4", className)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-main">{title}</h1>
        {subtitle && (
          <p className="text-text-secondary mt-1 font-medium">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
