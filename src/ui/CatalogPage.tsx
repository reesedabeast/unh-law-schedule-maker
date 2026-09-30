import { useMemo, useState } from 'react';
import { CONCENTRATIONS } from '../data/rules/concentrations';
import { categoriesOf, CATEGORY_LABELS, LAW_SUBJECTS } from '../data/rules/courseCategories';
import { COURSES, TERMS, courseHasAttr, sectionsFor, type Course } from '../engine/catalog';
import { eligibleSections, sectionEligibility } from '../engine/planChecks';
import { nextTerm, termName } from '../engine/terms';
import { useStore, visibleTerms } from '../store';
import { currentTerm, searchCourses, sectionLabel, useCourseSearch } from './helpers';

const SUBJECT_NAMES: Record<string, string> = {
  LAW: 'Law (undergraduate)',
  LBC: 'Blockchain',
  LBS: 'Business Law',
  LCL: 'Clinics',
  LCR: 'Criminal Law',
  LDWS: 'Daniel Webster Scholars',
  LGP: 'General Practice',
  LIP: 'Intellectual Property',
  LPI: 'Public Interest',
  LRS: 'Research, Competitions & Independent Study',
  LSK: 'Skills',
  LSW: 'Sports Law',
};

function CourseCard({ c, filterTerm }: { c: Course; filterTerm: string }) {
  const { profile, enrollments, extraTerms, addCourse } = useStore();
  const now = currentTerm();
  const upcoming = [now, nextTerm(now), nextTerm(nextTerm(now)), nextTerm(nextTerm(nextTerm(now)))];
  const planTerms = [...new Set([...visibleTerms(profile.startTerm, enrollments, extraTerms), ...upcoming])]
    .filter((t) => t >= now)
    .sort();
  const [target, setTarget] = useState(() => (filterTerm && planTerms.includes(filterTerm) ? filterTerm : planTerms[0] ?? ''));
  const [expanded, setExpanded] = useState(false);
  const shownTerm = filterTerm || TERMS[TERMS.length - 1]?.term;
  const sections = shownTerm ? sectionsFor(c.code, shownTerm) : [];
  const onRecord = enrollments.filter((e) => e.code === c.code);
  const cats = categoriesOf(c.code);
  const offered = c.offerings.map((o) => termName(o.term));

  const add = () => {
    const el = eligibleSections(c.code, target, profile);
    addCourse(c.code, target, {
      status: target === currentTerm() ? 'in-progress' : 'planned',
      credits: el[0]?.creditsMin || c.creditsMin || 3,
      section: el.length === 1 ? el[0].section : undefined,
    });
  };

  return (
    <article className="course-card">
      <div className="spread">
        <div>
          <strong>{c.code}</strong> — {c.title} <span className="muted small">({c.creditsText} cr)</span>
        </div>
        <div className="row">
          {courseHasAttr(c, 'LWI', filterTerm || undefined) && <span className="flag on" title="Upper-Level Writing designated section(s)">ULW</span>}
          {courseHasAttr(c, 'LEXP', filterTerm || undefined) && <span className="flag on" title="Experiential Learning designated section(s)">EL</span>}
          {courseHasAttr(c, 'LBAR', filterTerm || undefined) && <span className="flag on" title="Bar elective">BAR</span>}
          {onRecord.length > 0 && <span className="badge met">On your plan</span>}
        </div>
      </div>
      {cats.length > 0 && <div className="small muted">{cats.map((k) => CATEGORY_LABELS[k]).join(' · ')}</div>}
      {c.description && (
        <p>
          {expanded || c.description.length < 260 ? c.description : `${c.description.slice(0, 260)}… `}
          {c.description.length >= 260 && (
            <button className="link small" onClick={() => setExpanded((x) => !x)}>
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </p>
      )}
      {c.prereq && <p className="small"><strong>Prerequisites:</strong> {c.prereq}</p>}
      {c.equivalents.length > 0 && <p className="small"><strong>Equivalent:</strong> {c.equivalents.join(', ')}</p>}
      <p className="small muted">
        {c.gradeMode && `${c.gradeMode}. `}
        {offered.length ? `Offered: ${offered.slice(-6).join(', ')}` : 'No offerings on record since Fall 2022.'}
        {!c.inCatalog && ' Not in the current catalog.'}
      </p>
      {sections.length > 0 && (
        <div className="table-wrap">
          <table className="sections">
            <caption className="small muted" style={{ textAlign: 'left' }}>
              {termName(shownTerm)} sections
            </caption>
            <thead>
              <tr>
                <th>Section / time / instructor</th>
                <th>Seats</th>
                <th>Designations</th>
                <th>Who can enroll</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.crn}>
                  <td>{sectionLabel(s)}</td>
                  <td>
                    {Math.max(0, s.maxEnroll - s.enrolled)}/{s.maxEnroll}
                  </td>
                  <td>{s.attrs.filter((a) => ['LWI', 'LEXP', 'LBAR'].includes(a)).map((a) => ({ LWI: 'ULW', LEXP: 'EL', LBAR: 'Bar' })[a]).join(', ') || '—'}</td>
                  <td>{sectionEligibility(s, profile) ? <span className="muted">Not you: {sectionEligibility(s, profile)!.replace(/^Section \S+ /, '')}</span> : 'Open to you'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {planTerms.length > 0 && (
        <div className="row" style={{ marginTop: '0.4rem' }}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Semester to add to">
            {planTerms.map((t) => (
              <option key={t} value={t}>
                {termName(t)}
              </option>
            ))}
          </select>
          <button onClick={add}>Add to plan</button>
        </div>
      )}
    </article>
  );
}

export function CatalogPage() {
  const fuse = useCourseSearch();
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [attr, setAttr] = useState('');
  const [term, setTerm] = useState(TERMS[TERMS.length - 1]?.term ?? '');
  const [conc, setConc] = useState('');
  const [limit, setLimit] = useState(40);

  const results = useMemo(() => {
    let list = q.trim() ? searchCourses(fuse, q, 200) : [...COURSES];
    list = list.filter((c) => LAW_SUBJECTS.includes(c.code.split(' ')[0]));
    if (subject) list = list.filter((c) => c.code.startsWith(`${subject} `));
    if (term) list = list.filter((c) => c.offerings.some((o) => o.term === term));
    if (attr) list = list.filter((c) => courseHasAttr(c, attr as 'LWI', term || undefined));
    if (conc) {
      const def = CONCENTRATIONS.find((d) => d.id === conc)!;
      const codes = new Set([...def.groups.flatMap((g) => g.codes), ...def.electives]);
      list = list.filter((c) => codes.has(c.code));
    }
    return list;
  }, [fuse, q, subject, attr, term, conc]);

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Course catalog</h2>
        <div className="filters">
          <label className="field">
            <span>Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. evidence, LIP 954, patent" />
          </label>
          <label className="field">
            <span>Offered in</span>
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">Any term (all courses)</option>
              {[...TERMS].reverse().map((t) => (
                <option key={t.term} value={t.term}>
                  {t.name} ({t.count} sections)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Designation</span>
            <select value={attr} onChange={(e) => setAttr(e.target.value)}>
              <option value="">Any</option>
              <option value="LWI">Upper-Level Writing</option>
              <option value="LEXP">Experiential Learning</option>
              <option value="LBAR">Bar elective</option>
            </select>
          </label>
          <label className="field">
            <span>Subject</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">All subjects</option>
              {LAW_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s} — {SUBJECT_NAMES[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Counts toward concentration</span>
            <select value={conc} onChange={(e) => setConc(e.target.value)}>
              <option value="">Any</option>
              {CONCENTRATIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {results.length} course{results.length === 1 ? '' : 's'}. Designations (ULW, EL, Bar) are set per section and can change by term.
        </p>
      </section>
      <section className="card">
        {results.slice(0, limit).map((c) => (
          <CourseCard key={c.code} c={c} filterTerm={term} />
        ))}
        {results.length === 0 && <p className="muted">No courses match these filters.</p>}
        {results.length > limit && (
          <button onClick={() => setLimit((l) => l + 40)} style={{ marginTop: '0.5rem' }}>
            Show more
          </button>
        )}
      </section>
    </div>
  );
}
