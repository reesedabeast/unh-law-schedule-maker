/**
 * Per-semester checks for a record + plan: prerequisites, load, conflicts, section eligibility,
 * offering availability and repeats. These are advisory "issues", separate from degree progress.
 */
import { PROGRAMS, RESIDENCY, ULW_PREREQS } from '../data/rules/programs';
import { DUAL_DEGREES, DUAL_RULES } from '../data/rules/dualDegrees';
import { isLawCourse } from '../data/rules/courseCategories';
import { LATEST_TERM, SECTIONS_BY_TERM, findSection, flagFor, getCourse, matchesAny, normCode, subjectOf, type Section } from './catalog';
import { earnsCredit, sumCredits } from './gpa';
import { evalExpr, exprToString, parsePrereq } from './prereq';
import { isRegularTerm, termInfo, termName } from './terms';
import type { Enrollment, Issue, Profile } from './types';

// ---------- meeting times ----------

const DAY_CODES = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];

function toMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return h * 60 + Number(m[2]);
}

export function parseMeetingTime(time: string): [number, number] | null {
  const [a, b] = time.split('-');
  if (!a || !b) return null;
  const s = toMinutes(a);
  const e = toMinutes(b);
  return s === null || e === null ? null : [s, e];
}

export const meetingDays = (days: string) => DAY_CODES.filter((d) => days.includes(d));

function datesOverlap(a: Section, b: Section) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function sectionsConflict(a: Section, b: Section): boolean {
  if (!datesOverlap(a, b)) return false;
  for (const ma of a.meetings) {
    const ta = parseMeetingTime(ma.time);
    if (!ta) continue;
    for (const mb of b.meetings) {
      const tb = parseMeetingTime(mb.time);
      if (!tb) continue;
      const sharedDay = meetingDays(ma.days).some((d) => mb.days.includes(d));
      if (sharedDay && ta[0] < tb[1] && tb[0] < ta[1]) return true;
    }
  }
  return false;
}

// ---------- section eligibility ----------

export function majorCodeFor(profile: Profile): string {
  if (profile.dual) return DUAL_DEGREES[profile.dual].majorCode;
  return PROGRAMS[profile.program].majorCode;
}

export function sectionEligibility(s: Section, profile: Profile): string | null {
  const major = majorCodeFor(profile);
  if (s.majorsExcluded.includes(major)) return `Section ${s.section} is not open to ${major} students (it's for Hybrid JD students).`;
  if (s.majorsAllowed.length && !s.majorsAllowed.includes(major))
    return `Section ${s.section} is restricted to ${s.majorsAllowed.join(', ')} students.`;
  if (s.onlineOnly) return `Section ${s.section} is only for online (Hybrid JD) students.`;
  return null;
}

/** Sections a student in this profile can take. */
export function eligibleSections(code: string, term: string, profile: Profile): Section[] {
  return (SECTIONS_BY_TERM[term] ?? []).filter((s) => s.code === normCode(code) && !sectionEligibility(s, profile));
}

// ---------- main ----------

export function checkPlan(es: Enrollment[], profile: Profile): Issue[] {
  const issues: Issue[] = [];
  const terms = [...new Set(es.map((e) => e.term))].sort();
  const dual = profile.dual ? DUAL_DEGREES[profile.dual] : null;

  for (const term of terms) {
    const inTerm = es.filter((e) => e.term === term);
    const planned = inTerm.filter((e) => e.status !== 'completed');
    const credits = sumCredits(inTerm);
    const lawCredits = sumCredits(inTerm.filter((e) => isLawCourse(e.code)));
    const hasMaster = dual ? inTerm.some((e) => subjectOf(e.code) === dual.subject) : false;

    // Load
    if (planned.length && isRegularTerm(term) && !profile.dual && credits < RESIDENCY.fullTimeRegistered) {
      issues.push({
        severity: 'warning',
        term,
        message: `${termName(term)}: ${credits} credits is below the ${RESIDENCY.fullTimeRegistered} needed for a full-time residency semester.`,
      });
    }
    if (dual && hasMaster && planned.length) {
      if (lawCredits > DUAL_RULES.maxLawCreditsWhileInMaster)
        issues.push({ severity: 'error', term, message: `${termName(term)}: ${lawCredits} law credits exceeds the ${DUAL_RULES.maxLawCreditsWhileInMaster}-credit limit while enrolled in the master's program.` });
      if (credits > DUAL_RULES.maxCombinedCredits)
        issues.push({ severity: 'error', term, message: `${termName(term)}: ${credits} combined credits exceeds the ${DUAL_RULES.maxCombinedCredits}-credit dual degree limit.` });
    }

    for (const e of planned) {
      const course = getCourse(e.code);
      const label = `${e.code} (${termName(term)})`;
      if (!course) {
        if (isLawCourse(e.code)) issues.push({ severity: 'warning', term, enrollmentId: e.id, message: `${label}: not found in the catalog or schedule.` });
        continue;
      }

      // Prerequisites: completed/in-progress/planned in an earlier term.
      const expr = parsePrereq(course.prereq);
      if (expr) {
        const ok = evalExpr(expr, (code, concurrent) =>
          es.some((x) => x !== e && (concurrent ? x.term <= term : x.term < term) && earnsCredit(x) && matchesAny(x, [code])),
        );
        if (!ok) issues.push({ severity: 'error', term, enrollmentId: e.id, message: `${label}: prerequisite not met — ${exprToString(expr)}.` });
      }
      // ULW courses require LAWR I & II.
      if (flagFor(e, 'LWI').value) {
        const lawrDone = ULW_PREREQS.every((p) => es.some((x) => x.term < term && matchesAny(x, [p]) && earnsCredit(x)));
        if (!lawrDone) issues.push({ severity: 'warning', term, enrollmentId: e.id, message: `${label}: Upper-Level Writing courses require completing LSK 921 and LSK 922 first.` });
      }

      // Offered? Master's courses are taken asynchronously/online and aren't in the law schedule.
      const scheduled = isLawCourse(course.code) ? SECTIONS_BY_TERM[term] : undefined;
      if (!isLawCourse(course.code)) {
        // no offering/section/time checks
      } else if (scheduled) {
        const secs = scheduled.filter((s) => s.code === course.code);
        if (!secs.length) {
          issues.push({ severity: 'error', term, enrollmentId: e.id, message: `${label}: not offered in ${termName(term)}.` });
        } else {
          const ok = secs.filter((s) => !sectionEligibility(s, profile));
          if (!ok.length) issues.push({ severity: 'error', term, enrollmentId: e.id, message: `${label}: ${sectionEligibility(secs[0], profile)}` });
          const chosen = findSection(e);
          if (chosen) {
            const why = sectionEligibility(chosen, profile);
            if (why) issues.push({ severity: 'error', term, enrollmentId: e.id, message: `${label}: ${why}` });
          }
        }
      } else if (term > LATEST_TERM) {
        const season = termInfo(term).season;
        const past = course.offerings.filter((o) => termInfo(o.term).season === season);
        if (!past.length)
          issues.push({
            severity: 'warning',
            term,
            enrollmentId: e.id,
            message: `${label}: hasn't been offered in a ${season} term since ${termName(course.offerings[0]?.term ?? LATEST_TERM)}${course.offerings.length ? '' : ' (no offerings on record)'} — the schedule isn't published yet, so check availability.`,
          });
      }

      // Repeats
      const priorSame = es.filter((x) => x !== e && x.term <= term && normCode(x.code) === course.code && earnsCredit(x));
      if (priorSame.length && !course.repeatRule)
        issues.push({ severity: 'warning', term, enrollmentId: e.id, message: `${label}: already on your record — this course isn't listed as repeatable.` });
    }

    // Time conflicts between chosen sections
    const chosen = planned.map((e) => [e, findSection(e)] as const).filter((p): p is [Enrollment, Section] => !!p[1]);
    for (let i = 0; i < chosen.length; i++)
      for (let j = i + 1; j < chosen.length; j++)
        if (sectionsConflict(chosen[i][1], chosen[j][1]))
          issues.push({
            severity: 'error',
            term,
            enrollmentId: chosen[j][0].id,
            message: `${termName(term)}: ${chosen[i][0].code} and ${chosen[j][0].code} meet at overlapping times.`,
          });
  }
  return issues;
}
