import { useMemo, useState } from 'react';
import { categoriesOf, CATEGORY_LABELS } from '../data/rules/courseCategories';
import { SECTIONS_BY_TERM, getCourse, sectionsFor } from '../engine/catalog';
import { ALL_GRADES, sumCredits } from '../engine/gpa';
import { checkPlan, eligibleSections } from '../engine/planChecks';
import { isRegularTerm, nextTerm, termInfo, termName } from '../engine/terms';
import type { Enrollment, EnrollmentStatus, Issue, Profile } from '../engine/types';
import { useStore, visibleTerms } from '../store';
import { CourseAutocomplete, FlagChips } from './common';
import { currentTerm, defaultStatus, sectionLabel } from './helpers';
import { TranscriptImport } from './TranscriptImport';
import { WeekView } from './WeekView';

function CourseRow({ e, profile, issues }: { e: Enrollment; profile: Profile; issues: Issue[] }) {
  const { updateEnrollment, removeEnrollment } = useStore();
  const course = getCourse(e.code);
  const update = (patch: Partial<Enrollment>) => updateEnrollment(e.id, patch);
  const all = sectionsFor(e.code, e.term);
  const eligible = eligibleSections(e.code, e.term, profile);
  const cats = categoriesOf(e.code);
  const variable = course && course.creditsMax > course.creditsMin;

  return (
    <div className="course-row">
      <div>
        <span className="code">{e.code}</span> <span className="title">{course?.title ?? e.title ?? 'Unknown course'}</span>
        {cats.length > 0 && (
          <div className="small muted">{cats.map((c) => CATEGORY_LABELS[c]).join(' · ')}</div>
        )}
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <FlagChips e={e} onChange={update} />
        <button className="icon" onClick={() => removeEnrollment(e.id)} aria-label={`Remove ${e.code}`} title="Remove">
          ✕
        </button>
      </div>
      <div className="controls">
        <select
          value={e.status}
          onChange={(ev) => update({ status: ev.target.value as EnrollmentStatus, grade: ev.target.value === 'completed' ? e.grade : undefined })}
          aria-label="Status"
        >
          <option value="completed">Completed</option>
          <option value="in-progress">In progress</option>
          <option value="planned">Planned</option>
        </select>
        {e.status === 'completed' && (
          <>
            <input
              className="grade"
              list="grades"
              value={e.grade ?? ''}
              placeholder="Grade"
              aria-label="Grade"
              onChange={(ev) => update({ grade: ev.target.value.toUpperCase() })}
            />
          </>
        )}
        <label className="row small" style={{ gap: '0.25rem' }}>
          <input
            className="credits"
            type="number"
            min={0}
            step={0.5}
            value={e.credits}
            onChange={(ev) => update({ credits: Number(ev.target.value) })}
            aria-label="Credits"
          />
          cr{variable && <span className="muted">({course!.creditsText})</span>}
        </label>
        {all.length > 0 && e.status !== 'completed' && (
          <select value={e.section ?? ''} onChange={(ev) => update({ section: ev.target.value || undefined })} aria-label="Section" style={{ maxWidth: '100%' }}>
            <option value="">Section…</option>
            {all.map((s) => (
              <option key={s.crn} value={s.section} disabled={!eligible.includes(s)}>
                {sectionLabel(s)}
                {!eligible.includes(s) ? ' (not open to you)' : ''}
              </option>
            ))}
          </select>
        )}
        {e.transferredIn && <span className="badge neutral">Transfer credit</span>}
      </div>
      {issues.map((i, k) => (
        <div key={k} className={`issue ${i.severity}`} style={{ gridColumn: '1 / -1' }}>
          {i.message.replace(/^[A-Z]+ \d+[A-Z]? \([^)]*\): /, '')}
        </div>
      ))}
    </div>
  );
}

function TermCard({ term, enrollments, profile, issues }: { term: string; enrollments: Enrollment[]; profile: Profile; issues: Issue[] }) {
  const { addCourse, removeTerm } = useStore();
  const [week, setWeek] = useState(false);
  const credits = sumCredits(enrollments);
  const now = currentTerm();
  const hasSchedule = !!SECTIONS_BY_TERM[term];
  const termIssues = issues.filter((i) => !i.enrollmentId);

  const add = (code: string) => {
    const patch: Partial<Enrollment> = { status: defaultStatus(term) };
    const eligible = eligibleSections(code, term, profile);
    if (eligible.length) {
      patch.credits = eligible[0].creditsMin || getCourse(code)?.creditsMin || 3;
      if (eligible.length === 1 && patch.status !== 'completed') patch.section = eligible[0].section;
    }
    addCourse(code, term, patch);
  };

  return (
    <section className={`card term-card ${term < now ? 'past' : ''}`} aria-label={termName(term)}>
      <header>
        <h3>
          {termName(term)} {term === now && <span className="badge in-progress">Current</span>}
        </h3>
        <div className="row small">
          <strong>{credits} cr</strong>
          {isRegularTerm(term) && credits > 0 && credits < 12 && <span className="badge warn">Part-time</span>}
          {enrollments.length === 0 && (
            <button className="icon" onClick={() => removeTerm(term)} aria-label={`Remove ${termName(term)}`} title="Remove semester">
              ✕
            </button>
          )}
        </div>
      </header>
      <p className="small muted" style={{ margin: 0 }}>
        {term < now ? '' : hasSchedule ? 'Schedule published — pick sections for times and designations.' : 'Schedule not published yet; designations are based on past offerings.'}
      </p>
      {enrollments.map((e) => (
        <CourseRow key={e.id} e={e} profile={profile} issues={issues.filter((i) => i.enrollmentId === e.id)} />
      ))}
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <CourseAutocomplete onPick={add} />
      </div>
      {termIssues.map((i, k) => (
        <div key={k} className={`issue ${i.severity}`}>
          {i.message}
        </div>
      ))}
      {hasSchedule && enrollments.some((e) => e.status !== 'completed') && (
        <div style={{ marginTop: '0.5rem' }}>
          <button className="link small" onClick={() => setWeek((w) => !w)} aria-expanded={week}>
            {week ? 'Hide' : 'Show'} weekly schedule
          </button>
          {week && <WeekView enrollments={enrollments.filter((e) => e.status !== 'completed')} />}
        </div>
      )}
    </section>
  );
}

export function SemestersPage() {
  const { profile, enrollments, extraTerms, addTerm } = useStore();
  const [importing, setImporting] = useState(false);
  const terms = visibleTerms(profile.startTerm, enrollments, extraTerms);
  const issues = useMemo(() => checkPlan(enrollments, profile), [enrollments, profile]);
  const last = terms[terms.length - 1] ?? profile.startTerm;
  const nextOptions = [nextTerm(last, true), nextTerm(last)].filter((t, i, a) => a.indexOf(t) === i);
  const beforeStart = enrollments.filter((e) => e.term < profile.startTerm);

  return (
    <div className="stack">
      <div className="card spread">
        <div>
          <h2 style={{ marginBottom: '0.2rem' }}>Semesters</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Enter completed courses (or import your transcript), then add planned courses to future semesters.
          </p>
        </div>
        <div className="row">
          <button className="primary" onClick={() => setImporting(true)}>
            Import transcript PDF
          </button>
          {nextOptions.map((t) => (
            <button key={t} onClick={() => addTerm(t)}>
              + {termInfo(t).season === 'Summer' ? 'Summer' : 'Semester'} ({termName(t)})
            </button>
          ))}
        </div>
      </div>
      {beforeStart.length > 0 && (
        <div className="issue warning">
          {beforeStart.length} course(s) are before your first JD semester ({termName(profile.startTerm)}). Update your start term on the Profile tab.
        </div>
      )}
      <datalist id="grades">
        {ALL_GRADES.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="terms">
        {terms.map((t) => (
          <TermCard
            key={t}
            term={t}
            profile={profile}
            enrollments={enrollments.filter((e) => e.term === t)}
            issues={issues.filter((i) => i.term === t)}
          />
        ))}
      </div>
      {importing && <TranscriptImport onClose={() => setImporting(false)} />}
    </div>
  );
}
