import { useMemo, useState } from 'react';
import { courseHasAttr, flagFor, getCourse } from '../engine/catalog';
import { searchCourses, useCourseSearch } from './helpers';
import type { Enrollment, Progress, Status } from '../engine/types';

const STATUS_TEXT: Record<Status, string> = {
  met: 'Met',
  'in-progress': 'In progress',
  planned: 'Planned',
  unmet: 'Not met',
  manual: 'Confirm',
  'manual-met': 'Confirmed',
  info: 'Info',
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{STATUS_TEXT[status]}</span>;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function ProgressBar({ p }: { p: Progress }) {
  const pct = (v: number) => `${Math.min(100, (v / Math.max(p.need, 1e-9)) * 100)}%`;
  const [a, b, c] = p.have;
  return (
    <div className="bar-wrap" title={`${fmt(a)} completed, ${fmt(b - a)} in progress, ${fmt(c - b)} planned of ${p.need} ${p.unit}`}>
      <div className="bar" role="img" aria-label={`${fmt(c)} of ${p.need} ${p.unit} including plan`}>
        <div className="l2" style={{ width: pct(c) }} />
        <div className="l1" style={{ width: pct(b) }} />
        <div className="l0" style={{ width: pct(a) }} />
      </div>
      <div className="small muted">
        {fmt(a)}
        {b > a && ` +${fmt(b - a)}`}
        {c > b && ` +${fmt(c - b)}`} / {p.need} {p.unit}
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <span>
        <i style={{ background: 'var(--met)' }} />
        Completed
      </span>
      <span>
        <i style={{ background: 'var(--progress)' }} />
        In progress
      </span>
      <span>
        <i style={{ background: 'var(--planned)', opacity: 0.6 }} />
        Planned
      </span>
    </div>
  );
}

/** ULW / EL / Bar designation chips. ULW and EL are clickable to override. */
export function FlagChips({ e, onChange }: { e: Enrollment; onChange?: (patch: Partial<Enrollment>) => void }) {
  const ulw = flagFor(e, 'LWI');
  const el = flagFor(e, 'LEXP');
  const bar = flagFor(e, 'LBAR');
  const cycle = (cur: boolean | undefined, auto: boolean) => (cur === undefined ? !auto : undefined);
  const chip = (label: string, full: string, f: typeof ulw, key?: 'ulw' | 'el') => {
    const cls = `flag ${f.value ? 'on' : ''} ${f.uncertain ? 'unsure' : ''}`;
    const title = `${full}: ${f.value ? 'counts' : 'does not count'}. ${f.reason}.${key ? ' Click to override.' : ''}`;
    if (!key || !onChange) return f.value || f.uncertain ? <span className={cls} title={title}>{label}</span> : null;
    const override = e[key];
    // Only offer the toggle where it's plausible: designated in some term, uncertain, or already overridden.
    const kind = key === 'ulw' ? 'LWI' : 'LEXP';
    const course = getCourse(e.code);
    const ever = !!course && courseHasAttr(course, kind);
    if (!f.value && !f.uncertain && override === undefined && !ever) return null;
    return (
      <button
        type="button"
        className={cls}
        title={title}
        aria-pressed={f.value}
        onClick={() => onChange({ [key]: cycle(override, f.value) })}
      >
        {label}
        {override !== undefined ? '*' : ''}
      </button>
    );
  };
  return (
    <>
      {chip('ULW', 'Upper-Level Writing', ulw, 'ulw')}
      {chip('EL', 'Experiential Learning', el, 'el')}
      {chip('BAR', 'Bar elective', bar)}
    </>
  );
}

export function CourseAutocomplete({
  onPick,
  placeholder = 'Add a course (code or title)…',
  allowFreeText = true,
}: {
  onPick: (code: string) => void;
  placeholder?: string;
  allowFreeText?: boolean;
}) {
  const fuse = useCourseSearch();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchCourses(fuse, q, 10), [fuse, q]);

  const pick = (code: string) => {
    onPick(code);
    setQ('');
    setOpen(false);
    setActive(0);
  };
  const freeCode = q.trim().toUpperCase().match(/^([A-Z]{2,5})\s*(\d{3}[A-Z]?)$/);

  return (
    <div className="ac">
      <input
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={open && results.length > 0}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[active]) pick(results[active].code);
            else if (allowFreeText && freeCode) pick(`${freeCode[1]} ${freeCode[2]}`);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (results.length > 0 || (allowFreeText && freeCode)) && (
        <ul role="listbox">
          {results.map((c, i) => (
            <li key={c.code} role="option" aria-selected={i === active} onMouseDown={() => pick(c.code)}>
              <strong>{c.code}</strong> {c.title} <span className="muted">({c.creditsText} cr)</span>
            </li>
          ))}
          {allowFreeText && freeCode && !results.some((r) => r.code === `${freeCode[1]} ${freeCode[2]}`) && (
            <li role="option" aria-selected={results.length === 0} onMouseDown={() => pick(`${freeCode[1]} ${freeCode[2]}`)}>
              Add <strong>{`${freeCode[1]} ${freeCode[2]}`}</strong> (not in law catalog — e.g. ADMN, SW, PPOL)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
