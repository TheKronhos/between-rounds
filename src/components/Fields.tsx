import { useState } from 'react';

export function TextField({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Numeric field that allows a blank value while typing. Blank → null. Negative numbers are ignored. */
export function NumField({ label, value, onChange, optional }: { label: string; value: number | null; onChange: (v: number | null) => void; optional?: boolean }) {
  const [s, setS] = useState(value === null ? '' : String(Math.round(value * 100) / 100));
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={s}
        placeholder={optional ? '' : '0'}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.');
          if (!/^\d*\.?\d*$/.test(raw)) return;
          setS(raw);
          onChange(raw === '' || raw === '.' ? null : Number(raw));
        }}
      />
    </label>
  );
}
