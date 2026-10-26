import { useEffect, type ReactNode } from 'react';
import { Icon } from './icons';

export function Stepper({ label, value, step, min = 0, onChange, suffix }: {
  label: string; value: number | null; step: number; min?: number; onChange: (v: number | null) => void; suffix?: string;
}) {
  const bump = (d: number) => onChange(Math.max(min, +(((value ?? 0) + d).toFixed(2))));
  return (
    <div>
      <div className="mini-label">{label}{suffix ? ` (${suffix})` : ''}</div>
      <div className="stepper">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-step)}>−</button>
        <input
          inputMode="decimal"
          aria-label={label}
          value={value ?? ''}
          placeholder="–"
          onChange={(e) => {
            const v = e.target.value.replace(',', '.');
            onChange(v === '' ? null : Number.isFinite(+v) ? +v : value);
          }}
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(step)}>+</button>
      </div>
    </div>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Reasons({ items }: { items: string[] }) {
  return <ul className="reasons">{items.map((r, i) => <li key={i}>{r}</li>)}</ul>;
}

/** Placeholder while local data loads (usually a few milliseconds; longer on slow phones). */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page" aria-busy="true">
      <div className="skeleton title" />
      <div className="skeleton line" />
      <div className="skeleton block" />
      <p className="visually-hidden" role="status">{label}…</p>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card soft">
      <h3>{title}</h3>
      {children && <div className="muted small">{children}</div>}
    </div>
  );
}

export const fmt = (n: number, d = 0) => n.toLocaleString('en-NG', { maximumFractionDigits: d });
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
};
