import { useState } from 'react';
import { CONCENTRATIONS, CONCENTRATION_RULES } from '../data/rules/concentrations';
import { normCode } from '../engine/catalog';
import { DUAL_DEGREES } from '../data/rules/dualDegrees';
import { PROGRAMS } from '../data/rules/programs';
import { SOURCES } from '../data/rules/sources';
import { termCode, termName } from '../engine/terms';
import type { DualId, ProgramId } from '../engine/types';
import { useStore } from '../store';

const startOptions = () => {
  const y = new Date().getFullYear();
  const out: string[] = [];
  for (let yr = y - 6; yr <= y + 1; yr++) out.push(termCode('Fall', yr), termCode('Spring', yr + 1));
  return out.sort();
};

/** Comma-separated course codes, committed on blur so typing isn't rewritten mid-entry. */
function CodesInput({ codes, onCommit }: { codes: string[]; onCommit: (codes: string[]) => void }) {
  const [text, setText] = useState(codes.join(', '));
  return (
    <input
      value={text}
      placeholder="e.g. LGP 990"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const list = text
          .split(',')
          .map((s) => normCode(s))
          .filter(Boolean);
        setText(list.join(', '));
        onCommit(list);
      }}
    />
  );
}

export function ProfilePage() {
  const { profile, setProfile } = useStore();
  const approvals = profile.concentrationApprovals;

  const toggleConc = (id: string) =>
    setProfile({
      concentrations: profile.concentrations.includes(id)
        ? profile.concentrations.filter((c) => c !== id)
        : [...profile.concentrations, id],
    });

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Your program</h2>
        <div className="filters">
          <label className="field">
            <span>JD program</span>
            <select value={profile.program} onChange={(e) => setProfile({ program: e.target.value as ProgramId })}>
              {Object.values(PROGRAMS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>First JD semester</span>
            <select value={profile.startTerm} onChange={(e) => setProfile({ startTerm: e.target.value })}>
              {startOptions().map((t) => (
                <option key={t} value={t}>
                  {termName(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Dual degree</span>
            <select value={profile.dual ?? ''} onChange={(e) => setProfile({ dual: (e.target.value || null) as DualId | null })}>
              <option value="">None</option>
              {Object.values(DUAL_DEGREES).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={profile.transfer} onChange={(e) => setProfile({ transfer: e.target.checked })} />
          <span>
            I transferred in from another law school <span className="muted small">(residency requirement drops to 4 semesters; add transfer credits on the Semesters tab)</span>
          </span>
        </label>
        <p className="small muted">
          Hybrid and Advanced Standing JD programs aren't supported yet. Rules:{' '}
          <a href={PROGRAMS[profile.program].rulesSource} target="_blank" rel="noreferrer">
            {PROGRAMS[profile.program].name} requirements
          </a>
          {profile.dual && (
            <>
              {' · '}
              <a href={SOURCES.dualRules} target="_blank" rel="noreferrer">
                Rule XIX: Dual Degree Programs
              </a>
            </>
          )}
        </p>
      </section>

      <section className="card stack">
        <div>
          <h2>Concentrations</h2>
          <p className="small muted">
            Optional. Each needs {CONCENTRATION_RULES.minCredits} qualifying credits at {CONCENTRATION_RULES.minGrade} or better (no S/U).{' '}
            <a href={SOURCES.concentrations} target="_blank" rel="noreferrer">
              Rule XVIII
            </a>
          </p>
        </div>
        <div className="grid-2">
          {CONCENTRATIONS.map((c) => {
            const on = profile.concentrations.includes(c.id);
            const hybridOnly = !!c.eligiblePrograms && !c.eligiblePrograms.includes(profile.program);
            const a = approvals[c.id] ?? { extraCodes: [], experientialCredits: 0 };
            const setA = (patch: Partial<typeof a>) =>
              setProfile({ concentrationApprovals: { ...approvals, [c.id]: { ...a, ...patch } } });
            return (
              <div key={c.id} className="stack" style={{ gap: '0.4rem' }}>
                <label className="check">
                  <input type="checkbox" checked={on} disabled={hybridOnly && !on} onChange={() => toggleConc(c.id)} />
                  <span>
                    <strong>{c.name}</strong>
                    <br />
                    <span className="small muted">{c.program}</span>
                  </span>
                </label>
                {on && !hybridOnly && (
                  <details className="small" style={{ marginLeft: '1.6rem' }}>
                    <summary>Advisor approvals</summary>
                    <div className="stack" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
                      <label className="field">
                        <span>Approved residency/clinic credits (0–3)</span>
                        <input
                          type="number"
                          min={0}
                          max={3}
                          value={a.experientialCredits}
                          onChange={(e) => setA({ experientialCredits: Math.max(0, Math.min(3, Number(e.target.value) || 0)) })}
                          style={{ width: '5rem' }}
                        />
                      </label>
                      <label className="field">
                        <span>Other approved courses (comma-separated codes)</span>
                        <CodesInput codes={a.extraCodes} onCommit={(extraCodes) => setA({ extraCodes })} />
                      </label>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
