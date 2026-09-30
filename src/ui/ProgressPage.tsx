import { useMemo } from 'react';
import { RULES_AS_OF } from '../data/rules/sources';
import { DATA_RETRIEVED, getCourse } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { formatGpa } from '../engine/gpa';
import { checkPlan } from '../engine/planChecks';
import { termName } from '../engine/terms';
import type { ReqResult } from '../engine/types';
import { useStore } from '../store';
import { Legend, ProgressBar, StatusBadge } from './common';

function Req({ r, depth = 0 }: { r: ReqResult; depth?: number }) {
  const toggleManual = useStore((s) => s.toggleManual);
  const hasKids = !!r.children?.length;
  const head = (
    <div className="req-head">
      {r.manualKey ? (
        <input
          type="checkbox"
          checked={r.status === 'manual-met'}
          onChange={() => toggleManual(r.manualKey!)}
          aria-label={`Confirm: ${r.label}`}
          style={{ width: 18, height: 18 }}
        />
      ) : (
        <StatusBadge status={r.status} />
      )}
      <div>
        {depth === 0 ? <h3 style={{ margin: 0 }}>{r.label}</h3> : <span style={{ fontWeight: hasKids ? 600 : 400 }}>{r.label}</span>}
      </div>
      {r.progress ? <ProgressBar p={r.progress} /> : <div />}
    </div>
  );
  const body = (
    <>
      {r.detail && <p className="req-detail">{r.detail}</p>}
      {r.notes?.map((n, i) => (
        <p key={`n${i}`} className="req-detail">
          {n}
        </p>
      ))}
      {r.warnings?.map((w, i) => (
        <p key={i} className="req-warn">
          ⚠ {w}
        </p>
      ))}
      {r.suggestions && r.suggestions.length > 0 && (
        <div className="suggest small">
          <span className="muted">Options:</span>
          {r.suggestions.slice(0, 12).map((c) => (
            <span key={c} className="chip" title={getCourse(c)?.title}>
              {c}
              {getCourse(c) ? ` ${getCourse(c)!.title.slice(0, 34)}${getCourse(c)!.title.length > 34 ? '…' : ''}` : ''}
            </span>
          ))}
        </div>
      )}
      {r.source && (
        <p className="small" style={{ margin: '0.3rem 0 0' }}>
          <a href={r.source} target="_blank" rel="noreferrer">
            Official rule text
          </a>
        </p>
      )}
      {hasKids && (
        <div className={depth === 0 ? '' : 'req-children'}>
          {r.children!.map((c) => (
            <Req key={c.id} r={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
  // Collapse satisfied sub-groups to keep attention on what's left.
  if (depth === 1 && hasKids) {
    return (
      <div className="req">
        <details open={r.status !== 'met' && r.status !== 'cap-under'}>
          <summary style={{ listStyle: 'none' }}>{head}</summary>
          {body}
        </details>
      </div>
    );
  }
  return (
    <div className={depth === 0 ? '' : 'req'}>
      {head}
      {body}
    </div>
  );
}

export function ProgressPage() {
  const { profile, enrollments } = useStore();
  const ev = useMemo(() => evaluate(enrollments, profile), [enrollments, profile]);
  const issues = useMemo(() => checkPlan(enrollments, profile), [enrollments, profile]);
  const find = (id: string, r: ReqResult = ev.program): ReqResult | undefined =>
    r.id === id ? r : r.children?.map((c) => find(id, c)).find(Boolean);
  const total = find('total-credits')!;
  const ulw = find('ulw')!;
  const el = find('el')!;
  const res = find('residency')!;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const notices = issues.filter((i) => i.severity === 'info');

  const tile = (label: string, r: ReqResult, value: string, sub: string) => (
    <div className="tile">
      <div className="spread">
        <span className="label">{label}</span>
        <StatusBadge status={r.status} />
      </div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
  const p = (r: ReqResult) => r.progress!.have;

  return (
    <div className="stack">
      <div className="disclaimer">
        This is a planning aid, not an official degree audit. Always confirm your plan with UNH Law Academic Advising and the
        Registrar. Rules transcribed {RULES_AS_OF}; course data retrieved {new Date(DATA_RETRIEVED).toLocaleDateString()}.
      </div>

      {enrollments.length === 0 && (
        <div className="card">
          <h2>Get started</h2>
          <p>
            Set your program on the <strong>Profile</strong> tab, then add courses on the <strong>Semesters</strong> tab — type
            them in or import your transcript PDF.
          </p>
        </div>
      )}

      <div className="tiles">
        {tile('Credits toward JD', total, `${p(total)[2]} / 85`, `${p(total)[0]} completed · ${p(total)[1] - p(total)[0]} in progress · ${p(total)[2] - p(total)[1]} planned`)}
        {tile('GPA', find('gpa')!, formatGpa(ev.gpa), find('gpa')!.label.replace('GPA of at least', 'Minimum'))}
        {tile('Upper-Level Writing', ulw, `${p(ulw)[2]} / 2`, 'credits incl. plan')}
        {tile('Experiential Learning', el, `${p(el)[2]} / 6`, 'credits incl. plan')}
        {tile('Residency', res, `${p(res)[2]} / ${res.progress!.need}`, 'full-time semesters incl. plan')}
      </div>
      <Legend />

      {(errors.length > 0 || warnings.length > 0 || notices.length > 0) && (
        <section className="card">
          <h2>Plan problems</h2>
          {[...errors, ...warnings, ...notices].map((i, k) => (
            <div key={k} className={`issue ${i.severity}`}>
              {i.term && !i.message.includes(termName(i.term)) ? `${termName(i.term)}: ` : ''}
              {i.message}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <Req r={ev.program} />
      </section>
      {ev.dual && (
        <section className="card">
          <Req r={ev.dual} />
        </section>
      )}
      {ev.concentrations.map((c) => (
        <section key={c.id} className="card">
          <Req r={c} />
        </section>
      ))}
    </div>
  );
}
