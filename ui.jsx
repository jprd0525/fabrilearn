// FabriLearn — shared UI primitives.
// Small, dependency-light building blocks reused across every screen so the
// ten screens stay visually consistent without a component-library dependency.

import { STATUS_META } from "./fab-model";

const PILL_TONE = {
  stone:   "bg-stone-100 text-stone-600 ring-stone-200",
  sky:     "bg-sky-50 text-sky-700 ring-sky-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200",
  rose:    "bg-rose-50 text-rose-700 ring-rose-200",
};

export function StatusPill({ status, className = "" }) {
  const tone = STATUS_META[status]?.tone || "stone";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL_TONE[tone]} ${className}`}>
      {status}
    </span>
  );
}

export function Pill({ tone = "stone", children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL_TONE[tone] || PILL_TONE.stone}`}>
      {children}
    </span>
  );
}

export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = {
    primary:  "bg-amber-600 text-white hover:bg-amber-700",
    secondary:"border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
    ghost:    "text-stone-500 hover:bg-stone-100 hover:text-stone-700",
    danger:   "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

export function TextInput({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-500 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-500 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-stone-300" />}
      <p className="text-sm font-medium text-stone-600">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs text-stone-400">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ className = "", children }) {
  return <div className={`rounded-xl border border-stone-200 bg-white ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">{children}</h2>
      {right}
    </div>
  );
}
