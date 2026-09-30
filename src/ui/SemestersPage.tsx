import { useMemo, useState } from 'react';
import { categoriesOf, CATEGORY_LABELS } from '../data/rules/courseCategories';
import { DUAL_DEGREES } from '../data/rules/dualDegrees';
import { OVERLOAD_ABOVE, PROGRAMS, alternativesFor } from '../data/rules/programs';
import { countsTowardJd, jdCreditsIn } from '../engine/jdCredit';
import { SECTIONS_BY_TERM, getCourse, sectionsFor } from '../engine/catalog';
import { ALL_GRADES, sumCredits } from '../engine/gpa';
import { checkPlan, eligibleSections } from '../engine/planChecks';
import { isRegularTerm, nextTerm, termInfo, termName } from '../engine/terms';
import type { DualId, Enrollment, EnrollmentStatus, Issue, Profile, ProgramId } from '../engine/types';
import { useStore, visibleTerms } from '../store';
import { CourseAutocomplete, FlagChips } from './common';
import { addPatch, currentTerm, sectionLabel, startTermOptions } from './helpers';
import { SuggestionsPane } from './SuggestionsPane';
import { TranscriptImport } from './TranscriptImport';
import { WeekView } from './WeekView';

function CourseRow({ e, profile, issues }: { e: Enrollment; profile: Profile; issues: Issue[] }) {
  const { updateEnrollment, removeEnrollment, swapCourse } = useStore();
  const course = getCourse(e.code);
  const update = (patch: Partial<Enrollment>) => updateEnrollment(e.id, patch);
  const all = sectionsFor(e.code, e.term);
  const eligible = eligibleSections(e.code, e.term, profile);
  // The master's badge below already says what a non-law course is.
  const cats = categoriesOf(e.code).filter((c) => c !== 'nonLaw' || !course || course.program === 'law');
  const variable = course && course.creditsMax > course.creditsMin;

  return (
    <div className="course-row">
      <div>
        <span className="code">{e.code}</span> <span className="title">{course?.title ?? e.title ?? 'Unknown course'}</span>
        {cats.length > 0 && (
          <div className="small muted">{cats.map((c) => CATEGORY_LABELS[c]).join(' · ')}</div>
        )}
        <div className="row small" style={{ gap: '0.3rem', marginTop: 2 }}>
          {e.auto && (
            <span className="badge neutral" title="Filled in from the standard 1L schedule — edit or remove as needed">
              1L default
            </span>
          )}
          {course && course.program !== 'law' && <span className="badge neutral">{course.program.toUpperCase()} · online/async</span>}
          {!countsTowardJd(e, profile) && (
            <span className="badge warn" title="Only the master's courses the law school accepts count toward the JD">
              Doesn't count toward JD
            </span>
          )}
          {e.status !== 'completed' && alternativesFor(e.code).map((alt) => (
            <button key={alt} className="link" onClick={() => swapCourse(e.id, alt)}>
              Swap for {alt} {getCourse(alt)?.title}
            </button>
          ))}
        </div>
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
  const jdCredits = jdCreditsIn(enrollments, profile);
  const now = currentTerm();
  const hasSchedule = !!SECTIONS_BY_TERM[term];
  const termIssues = issues.filter((i) => !i.enrollmentId);

  const add = (code: string) => addCourse(code, term, addPatch(code, term, profile));

  return (
    <section className={`card term-card ${term < now ? 'past' : ''}`} aria-label={termName(term)}>
      <header>
        <h3>
          {termName(term)} {term === now && <span className="badge in-progress">Current</span>}
        </h3>
        <div className="row small">
          <strong title="Credits toward the JD">{jdCredits} cr</strong>
          {credits !== jdCredits && <span className="muted" title="Includes courses that don't count toward the JD">({credits} total)</span>}
          {isRegularTerm(term) && !profile.dual && jdCredits > 0 && jdCredits < 12 && <span className="badge warn">Part-time</span>}
          {jdCredits > OVERLOAD_ABOVE && (
            <span className="badge neutral" title={`More than ${OVERLOAD_ABOVE} JD credits: allowed, with overload fees`}>
              Overload
            </span>
          )}
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

/** First-run setup: start term, program, and the default 1L schedule. */
function StartCard({ onImport }: { onImport: () => void }) {
  const { profile, startFresh } = useStore();
  const [start, setStart] = useState(profile.startTerm);
  const [program, setProgram] = useState<ProgramId>(profile.program);
  const [dual, setDual] = useState<DualId | null>(profile.dual);
  const [transfer, setTransfer] = useState(profile.transfer);
  const [fill, setFill] = useState(true);

  return (
    <section className="card stack">
      <div>
        <h2>Start your plan</h2>
        <p className="small muted" style={{ margin: 0 }}>
          The 1L year is fixed except for the perspectives course, so it can be filled in for you. You can swap, edit or remove
          any course afterward.
        </p>
      </div>
      <div className="filters">
        <label className="field">
          <span>First JD semester</span>
          <select value={start} onChange={(e) => setStart(e.target.value)}>
            {startTermOptions().map((t) => (
              <option key={t} value={t}>
                {termName(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>JD program</span>
          <select value={program} onChange={(e) => setProgram(e.target.value as ProgramId)}>
            {Object.values(PROGRAMS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dual degree</span>
          <select value={dual ?? ''} onChange={(e) => setDual((e.target.value || null) as DualId | null)}>
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
        <input
          type="checkbox"
          checked={transfer}
          onChange={(e) => {
            setTransfer(e.target.checked);
            if (e.target.checked) setFill(false);
          }}
        />
        <span>I transferred in from another law school</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
        <span>
          Fill in the standard 1L schedule{' '}
          <span className="muted small">(Fundamentals of Law Practice as the perspectives course; swap for Fundamentals of IP anytime)</span>
        </span>
      </label>
      <div className="row">
        <button className="primary" onClick={() => startFresh({ startTerm: start, program, dual, transfer }, fill)}>
          Start planning
        </button>
        <button onClick={onImport}>Import my transcript instead</button>
      </div>
    </section>
  );
}

export function SemestersPage() {
  const { profile, enrollments, extraTerms, addTerm, setupDone } = useStore();
  const [importing, setImporting] = useState(false);
  const showStart = !setupDone && enrollments.length === 0;
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
          {!showStart && nextOptions.map((t) => (
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
      {showStart ? (
        <StartCard onImport={() => setImporting(true)} />
      ) : (
        <div className="planner">
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
          <SuggestionsPane />
        </div>
      )}
      {importing && <TranscriptImport onClose={() => setImporting(false)} />}
    </div>
  );
}
