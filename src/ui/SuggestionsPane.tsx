import { useState } from 'react';
import { PROGRAMS } from '../data/rules/programs';
import { categoriesOf, isLawCourse } from '../data/rules/courseCategories';
import { COURSES, SECTIONS_BY_TERM, equivalentsOf, getCourse, sectionsFor } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { earnsCredit, sumCredits } from '../engine/gpa';
import { eligibleSections } from '../engine/planChecks';
import { evalExpr, exprToString, parsePrereq } from '../engine/prereq';
import { currentTerm, isRegularTerm, nextTerm, termInfo, termName } from '../engine/terms';
import type { Enrollment, Profile, ReqResult } from '../engine/types';
import { useStore, visibleTerms } from '../store';
import { addPatch } from './helpers';

interface Item {
  code: string;
  /** Shown when the item is one of several options for the same requirement. */
  choice?: string;
}
interface Group {
  label: string;
  note?: string;
  items: Item[];
}

type Availability = { text: string; rank: 0 | 1 | 2 };

function availability(code: string, term: string, profile: Profile): Availability {
  if (!isLawCourse(code)) return { text: 'Online / asynchronous', rank: 0 };
  const course = getCourse(code);
  if (SECTIONS_BY_TERM[term]) {
    if (eligibleSections(code, term, profile).length) return { text: `Offered ${termName(term)}`, rank: 0 };
    if (sectionsFor(code, term).length) return { text: 'Not open to your program this term', rank: 2 };
    return { text: `Not offered ${termName(term)}`, rank: 2 };
  }
  const season = termInfo(term).season;
  const same = (course?.offerings ?? []).filter((o) => termInfo(o.term).season === season);
  if (!same.length) return { text: `Not offered in ${season} recently`, rank: 2 };
  const last = same[same.length - 1].term;
  if (!eligibleSections(code, last, profile).length) return { text: `Last ${season} offering wasn't open to your program`, rank: 2 };
  return { text: `Usually offered in ${season} (last: ${termName(last)})`, rank: 1 };
}

/** Most recent past term in the same season as `term` in which the course was offered. */
function lastSameSeason(code: string, term: string): string | undefined {
  const season = termInfo(term).season;
  const same = (getCourse(code)?.offerings ?? []).filter((o) => termInfo(o.term).season === season);
  return same[same.length - 1]?.term;
}

/** Unmet prerequisites if the course were taken in `term`, or null when satisfied. */
function prereqGap(code: string, term: string, es: Enrollment[]): string | null {
  const expr = parsePrereq(getCourse(code)?.prereq ?? '');
  if (!expr) return null;
  const ok = evalExpr(expr, (c, concurrent) =>
    es.some((e) => (concurrent ? e.term <= term : e.term < term) && earnsCredit(e) && equivalentsOf(e.code).includes(c)),
  );
  return ok ? null : exprToString(expr);
}

/** Courses carrying a designation in `term` (published schedule) or in past terms of that season. */
function designated(kind: 'LWI' | 'LEXP', term: string, profile: Profile, onlyCats?: string[]): string[] {
  const published = !!SECTIONS_BY_TERM[term];
  const season = termInfo(term).season;
  return COURSES.filter((c) => {
    if (!isLawCourse(c.code)) return false;
    if (onlyCats && !categoriesOf(c.code).some((k) => onlyCats.includes(k))) return false;
    if (published) return eligibleSections(c.code, term, profile).some((s) => s.attrs.includes(kind));
    // Unpublished term: judge by the latest same-season offering, including who could enroll.
    const last = lastSameSeason(c.code, term);
    if (!last || !c.offerings.some((o) => termInfo(o.term).season === season && o.attrsSome.includes(kind))) return false;
    return eligibleSections(c.code, last, profile).length > 0;
  }).map((c) => c.code);
}

const find = (r: ReqResult, id: string): ReqResult | undefined =>
  r.id === id ? r : r.children?.map((c) => find(c, id)).find(Boolean);

/** Unmet leaf requirements with course suggestions, e.g. concentration groups or dual degree cores. */
function unmetLeaves(r: ReqResult): ReqResult[] {
  if (r.children?.length) return r.children.flatMap(unmetLeaves);
  return r.status === 'unmet' && r.suggestions?.length ? [r] : [];
}

export function SuggestionsPane() {
  const { profile, enrollments, extraTerms, addCourse } = useStore();
  const now = currentTerm();

  // Target: any upcoming visible term, plus the next one after the plan ends.
  const terms = visibleTerms(profile.startTerm, enrollments, extraTerms);
  const last = terms[terms.length - 1] ?? profile.startTerm;
  const options = [...new Set([...terms.filter((t) => t >= now), nextTerm(last)])].filter(isRegularTerm).sort();
  const lawCredits = (t: string) => sumCredits(enrollments.filter((e) => e.term === t && isLawCourse(e.code)));
  const firstOpen = options.find((t) => lawCredits(t) < 12) ?? options[options.length - 1];
  const [picked, setPicked] = useState<string | null>(null);
  const target = picked && options.includes(picked) ? picked : firstOpen;

  const groups = (() => {
    const ev = evaluate(enrollments, profile);
    const program = PROGRAMS[profile.program];
    const out: Group[] = [];

    const required: Item[] = [];
    for (const g of program.groups) {
      for (const c of g.courses) {
        const r = find(ev.program, c.id);
        if (r?.status !== 'unmet') continue;
        const choice = c.codes.length > 1 ? 'Choose one' : undefined;
        c.codes.forEach((code) => required.push({ code, choice }));
      }
    }
    if (required.length) out.push({ label: 'Required courses', items: required });

    const onPlan = new Set(enrollments.flatMap((e) => equivalentsOf(e.code)));
    const ulw = find(ev.program, 'ulw')!;
    if (ulw.progress!.have[2] < ulw.progress!.need)
      out.push({
        label: 'Upper-Level Writing',
        note: `${ulw.progress!.need - ulw.progress!.have[2]} more credit(s). Needs LSK 921 & 922 first; must be a different course than your EL credits.`,
        items: designated('LWI', target, profile).filter((c) => !onPlan.has(c)).map((code) => ({ code })),
      });
    const el = find(ev.program, 'el')!;
    if (el.progress!.have[2] < el.progress!.need)
      out.push({
        label: 'Experiential Learning',
        note: `${el.progress!.need - el.progress!.have[2]} more credit(s)${program.elCategories ? ' from a clinic or legal residency' : ''}.`,
        items: designated('LEXP', target, profile, program.elCategories).filter((c) => !onPlan.has(c)).map((code) => ({ code })),
      });

    for (const conc of ev.concentrations) {
      const items = unmetLeaves(conc).flatMap((r) => r.suggestions!.filter((c) => !onPlan.has(c)).map((code) => ({ code })));
      if (items.length) out.push({ label: conc.label, items });
    }
    if (ev.dual) {
      const items = unmetLeaves(ev.dual).flatMap((r) => r.suggestions!.filter((c) => !onPlan.has(c)).map((code) => ({ code })));
      if (items.length) out.push({ label: ev.dual.label, items });
    }
    return out;
  })();

  if (!target) return null;

  return (
    <aside className="card suggest-pane" aria-label="Suggested courses">
      <h3>Suggested courses</h3>
      <label className="field">
        <span>Add to</span>
        <select value={target} onChange={(e) => setPicked(e.target.value)}>
          {options.map((t) => (
            <option key={t} value={t}>
              {termName(t)} ({lawCredits(t)} law cr)
            </option>
          ))}
        </select>
      </label>
      {groups.length === 0 && <p className="small muted">Nothing required is missing from your plan. Add electives from the course catalog.</p>}
      {groups.map((g) => {
        const rows = g.items
          .map((it) => ({ ...it, av: availability(it.code, target, profile), gap: prereqGap(it.code, target, enrollments) }))
          .sort((a, b) => a.av.rank - b.av.rank || Number(!!a.gap) - Number(!!b.gap) || a.code.localeCompare(b.code));
        return (
          <section key={g.label} className="suggest-group">
            <h4>{g.label}</h4>
            {g.note && <p className="small muted">{g.note}</p>}
            {rows.slice(0, 12).map((r) => {
              const c = getCourse(r.code);
              return (
                <div key={r.code} className={`suggest-item ${r.av.rank === 2 ? 'dim' : ''}`}>
                  <button
                    className="add"
                    onClick={() => addCourse(r.code, target, addPatch(r.code, target, profile))}
                    aria-label={`Add ${r.code} to ${termName(target)}`}
                    title={`Add to ${termName(target)}`}
                  >
                    +
                  </button>
                  <div>
                    <div>
                      <strong>{r.code}</strong> {c?.title ?? ''} <span className="muted small">({c?.creditsText ?? '?'} cr)</span>
                      {r.choice && <span className="badge neutral" style={{ marginLeft: 4 }}>{r.choice}</span>}
                    </div>
                    <div className="small muted">{r.av.text}</div>
                    {r.gap && <div className="small warn-text">Needs first: {r.gap}</div>}
                  </div>
                </div>
              );
            })}
            {rows.length > 12 && <p className="small muted">+{rows.length - 12} more in the course catalog.</p>}
            {rows.length === 0 && <p className="small muted">No matching courses found for {termName(target)}.</p>}
          </section>
        );
      })}
    </aside>
  );
}
